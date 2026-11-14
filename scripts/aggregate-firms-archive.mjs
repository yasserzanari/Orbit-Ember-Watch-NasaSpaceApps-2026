#!/usr/bin/env node

import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const supportedProducts = new Set([
  'MODIS_NRT', 'MODIS_SP',
  'VIIRS_NOAA20_NRT', 'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT', 'VIIRS_NOAA21_SP',
  'VIIRS_SNPP_NRT', 'VIIRS_SNPP_SP',
])
const productsByPrefix = { MODIS: 'MODIS', VIIRS: 'VIIRS' }

function usage() {
  return `Usage:
  node scripts/aggregate-firms-archive.mjs [options]

Options:
  --product <id>             Aggregate one product identity only
  --archive-root <path>      Raw and normalized files (default: data/private/firms)
  --manifest-dir <path>      Accepted import manifests (default: data/manifests/firms)
  --output-dir <path>        Private aggregate output (default: <archive-root>/aggregates)
  --help                     Show this help

The output keeps processing products, platform IDs and native confidence values separate.
Only dates with accepted detection rows are emitted; this is not an observation-coverage product.`
}

function parseArgs(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === '--help') { values.set(name, true); continue }
    if (!name.startsWith('--') || index + 1 >= args.length || args[index + 1].startsWith('--')) throw new Error(`Invalid or incomplete option: ${name}`)
    if (values.has(name)) throw new Error(`Option repeated: ${name}`)
    values.set(name, args[index + 1]); index += 1
  }
  return values
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function checkCount(value, label, allowZero = true) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error(`Invalid ${label} in accepted import manifest.`)
}

function safeResolved(value, label) {
  if (typeof value !== 'string' || value.length > 512) throw new Error(`Invalid ${label} path in import manifest.`)
  return path.resolve(root, value)
}

function utcWeekStart(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  const mondayOffset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - mondayOffset)
  return date.toISOString().slice(0, 10)
}

function confidenceValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 'not-provided'
  return String(value).trim()
}

function dayNightValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 'not-provided'
  return String(value).trim()
}

function addCount(target, key) {
  target[key] = (target[key] ?? 0) + 1
}

function addObservation(map, period, observation) {
  const key = [period, observation.satellite, observation.productVersion ?? 'not-provided'].join('|')
  let item = map.get(key)
  if (!item) {
    item = {
      period,
      satellite: observation.satellite,
      productVersion: observation.productVersion ?? null,
      detections: 0,
      maxFrpMw: null,
      confidenceNativeCounts: {},
      dayNightCounts: {},
    }
    map.set(key, item)
  }
  item.detections += 1
  if (item.maxFrpMw === null || observation.frpMw > item.maxFrpMw) item.maxFrpMw = observation.frpMw
  addCount(item.confidenceNativeCounts, confidenceValue(observation.confidenceNative))
  addCount(item.dayNightCounts, dayNightValue(observation.dayNight))
}

function mergeDailySummary(map, period, dailyItem) {
  const key = [period, dailyItem.satellite, dailyItem.productVersion ?? 'not-provided'].join('|')
  let item = map.get(key)
  if (!item) {
    item = {
      period,
      satellite: dailyItem.satellite,
      productVersion: dailyItem.productVersion,
      detections: 0,
      maxFrpMw: null,
      confidenceNativeCounts: {},
      dayNightCounts: {},
    }
    map.set(key, item)
  }
  item.detections += dailyItem.detections
  if (item.maxFrpMw === null || dailyItem.maxFrpMw > item.maxFrpMw) item.maxFrpMw = dailyItem.maxFrpMw
  for (const [value, count] of Object.entries(dailyItem.confidenceNativeCounts)) item.confidenceNativeCounts[value] = (item.confidenceNativeCounts[value] ?? 0) + count
  for (const [value, count] of Object.entries(dailyItem.dayNightCounts)) item.dayNightCounts[value] = (item.dayNightCounts[value] ?? 0) + count
}

function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

function sortedRows(rows, periodKey) {
  return rows.map((item) => {
    const { period, ...summary } = item
    return { ...summary, [periodKey]: period, confidenceNativeCounts: sortedCounts(item.confidenceNativeCounts), dayNightCounts: sortedCounts(item.dayNightCounts) }
  }).sort((a, b) => a[periodKey].localeCompare(b[periodKey])
    || a.satellite.localeCompare(b.satellite)
    || String(a.productVersion ?? '').localeCompare(String(b.productVersion ?? '')))
}

async function saveJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.partial`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, filePath)
}

async function readAcceptedImports({ archiveRoot, manifestDir, productFilter }) {
  let names
  try { names = await readdir(manifestDir) } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Manifest directory does not exist: ${manifestDir}`)
    throw error
  }
  const files = names.filter((name) => name.endsWith('.manifest.json')).sort()
  const imports = []
  for (const name of files) {
    const importId = name.slice(0, -'.manifest.json'.length)
    if (!/^[a-z0-9_-]{1,100}$/.test(importId)) throw new Error(`Unsafe import ID in manifest filename: ${name}`)
    const manifestPath = path.join(manifestDir, name)
    let manifest
    let qa
    try {
      [manifest, qa] = await Promise.all([
        readFile(manifestPath, 'utf8').then(JSON.parse),
        readFile(path.join(manifestDir, `${importId}.qa.json`), 'utf8').then(JSON.parse),
      ])
    } catch (error) { throw new Error(`Could not read manifest/QA pair for ${importId}: ${error.message}`) }
    if (productFilter && manifest.product !== productFilter) continue
    if (manifest.schemaVersion !== 1 || manifest.importId !== importId || !supportedProducts.has(manifest.product)) {
      throw new Error(`Unsupported or mismatched import manifest: ${importId}`)
    }
    if (!qa || qa.importId !== importId || qa.product !== manifest.product
      || !['accepted', 'accepted_with_exclusions'].includes(qa.status)) {
      throw new Error(`Import ${importId} has no accepted QA report; quarantined data cannot be aggregated.`)
    }
    const observed = manifest.observed
    const inputHash = manifest.input?.sha256
    const normalizedHash = manifest.normalized?.sha256
    if (!/^[a-f0-9]{64}$/.test(inputHash || '') || !/^[a-f0-9]{64}$/.test(normalizedHash || '')
      || !isValidDate(observed?.minDateUtc) || !isValidDate(observed?.maxDateUtc)
      || observed.minDateUtc > observed.maxDateUtc) throw new Error(`Invalid provenance or date range in import ${importId}.`)
    for (const [key, value] of Object.entries({ rowsRead: observed.rowsRead, rowsAccepted: observed.rowsAccepted, rowsRejected: observed.rowsRejected, rowsDuplicate: observed.rowsDuplicate })) {
      checkCount(value, `observed.${key}`, key !== 'rowsAccepted')
      if (qa[key] !== value) throw new Error(`Manifest and QA disagree on ${key} for ${importId}.`)
    }
    if (observed.rowsAccepted + observed.rowsRejected + observed.rowsDuplicate !== observed.rowsRead
      || qa.rawSha256 !== inputHash || qa.normalizedSha256 !== normalizedHash) throw new Error(`Manifest and QA integrity fields do not match for ${importId}.`)

    const expectedRawPath = path.join(archiveRoot, 'raw', manifest.product, `${importId}.csv`)
    const expectedNormalizedPath = path.join(archiveRoot, 'normalized', manifest.product, `${importId}.jsonl`)
    if (safeResolved(manifest.input?.path, 'raw') !== expectedRawPath
      || safeResolved(manifest.normalized?.path, 'normalized') !== expectedNormalizedPath) {
      throw new Error(`Import ${importId} paths do not match the archive root and product layout.`)
    }
    const rawStat = await stat(expectedRawPath).catch(() => null)
    const normalizedStat = await stat(expectedNormalizedPath).catch(() => null)
    if (!rawStat?.isFile() || !normalizedStat?.isFile()) throw new Error(`Raw or normalized source file is missing for ${importId}.`)
    if (await sha256File(expectedRawPath) !== inputHash || await sha256File(expectedNormalizedPath) !== normalizedHash) {
      throw new Error(`Source or normalized SHA-256 does not match the manifest for ${importId}.`)
    }
    imports.push({
      importId,
      product: manifest.product,
      inputSha256: inputHash,
      normalizedSha256: normalizedHash,
      normalizedPath: expectedNormalizedPath,
      sourceUrl: manifest.sourceUrl,
      sourceRetrievedAtUtc: manifest.sourceRetrievedAtUtc ?? null,
      minDateUtc: observed.minDateUtc,
      maxDateUtc: observed.maxDateUtc,
      rowsRead: observed.rowsRead,
      rowsAccepted: observed.rowsAccepted,
      rowsRejected: observed.rowsRejected,
      rowsDuplicate: observed.rowsDuplicate,
    })
  }
  if (!imports.length) throw new Error(productFilter ? `No accepted imports found for ${productFilter}.` : 'No accepted FIRMS imports found.')
  return imports.sort((a, b) => a.product.localeCompare(b.product) || a.importId.localeCompare(b.importId))
}

function validateRecord(record, importEntry, lineNumber) {
  if (!record || typeof record !== 'object' || !Number.isFinite(record.latitude) || record.latitude < -90 || record.latitude > 90
    || !Number.isFinite(record.longitude) || record.longitude < -180 || record.longitude > 180
    || !Number.isFinite(record.frpMw) || record.frpMw < 0 || typeof record.satellite !== 'string' || !record.satellite
    || typeof record.instrument !== 'string' || !record.instrument || !record.acquiredAtUtc || !Number.isFinite(Date.parse(record.acquiredAtUtc))) {
    throw new Error(`Invalid normalized observation at ${importEntry.importId}:${lineNumber}.`)
  }
  const day = record.acquiredAtUtc.slice(0, 10)
  if (!isValidDate(day) || record.acquiredAtUtc.slice(10, 11) !== 'T' || day < importEntry.minDateUtc || day > importEntry.maxDateUtc) {
    throw new Error(`Observation date outside manifest bounds at ${importEntry.importId}:${lineNumber}.`)
  }
  const expectedInstrument = productsByPrefix[importEntry.product.startsWith('MODIS_') ? 'MODIS' : 'VIIRS']
  if (record.instrument !== expectedInstrument) throw new Error(`Instrument/product identity mismatch at ${importEntry.importId}:${lineNumber}.`)
  return record
}

async function aggregateProduct(product, imports) {
  const seenExactRows = new Set()
  const daily = new Map()
  let rowsRead = 0
  let duplicateRowsAcrossImports = 0
  let uniqueDetections = 0
  let firstDetectionDateUtc = null
  let lastDetectionDateUtc = null

  for (const importEntry of imports) {
    const lines = createInterface({ input: createReadStream(importEntry.normalizedPath), crlfDelay: Infinity })
    let lineNumber = 0
    for await (const line of lines) {
      lineNumber += 1
      if (!line.trim()) continue
      rowsRead += 1
      let observation
      try { observation = validateRecord(JSON.parse(line), importEntry, lineNumber) } catch (error) {
        lines.close()
        throw new Error(`Cannot aggregate invalid normalized record: ${error.message}`)
      }
      if (observation.native && typeof observation.native === 'object') {
        const nativeCanonical = Object.fromEntries(Object.entries(observation.native).sort(([a], [b]) => a.localeCompare(b)))
        const dedupeKey = sha256(JSON.stringify([product, nativeCanonical]))
        if (seenExactRows.has(dedupeKey)) { duplicateRowsAcrossImports += 1; continue }
        seenExactRows.add(dedupeKey)
      }
      uniqueDetections += 1
      const dateUtc = observation.acquiredAtUtc.slice(0, 10)
      firstDetectionDateUtc = firstDetectionDateUtc === null || dateUtc < firstDetectionDateUtc ? dateUtc : firstDetectionDateUtc
      lastDetectionDateUtc = lastDetectionDateUtc === null || dateUtc > lastDetectionDateUtc ? dateUtc : lastDetectionDateUtc
      addObservation(daily, dateUtc, observation)
    }
    if (lineNumber !== importEntry.rowsAccepted) throw new Error(`Normalized row count mismatch for ${importEntry.importId}: expected ${importEntry.rowsAccepted}, read ${lineNumber}.`)
  }

  const weekly = new Map()
  const monthly = new Map()
  for (const dayItem of daily.values()) {
    mergeDailySummary(weekly, utcWeekStart(dayItem.period), dayItem)
    mergeDailySummary(monthly, dayItem.period.slice(0, 7), dayItem)
  }

  return {
    product,
    rowsRead,
    duplicateRowsAcrossImports,
    uniqueDetections,
    firstDetectionDateUtc,
    lastDetectionDateUtc,
    datesWithReturnedRecords: new Set([...daily.values()].map((item) => item.period)).size,
    daily: sortedRows([...daily.values()], 'dateUtc'),
    weekly: sortedRows([...weekly.values()], 'weekStartUtc'),
    monthly: sortedRows([...monthly.values()], 'monthUtc'),
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  if (args.has('--help')) { console.log(usage()); return }
  const productFilter = args.get('--product')
  if (productFilter && !supportedProducts.has(productFilter)) throw new Error(`Unsupported FIRMS product: ${productFilter}`)
  const archiveRoot = path.resolve(root, args.get('--archive-root') ?? 'data/private/firms')
  const manifestDir = path.resolve(root, args.get('--manifest-dir') ?? 'data/manifests/firms')
  const outputDir = path.resolve(root, args.get('--output-dir') ?? path.join(archiveRoot, 'aggregates'))
  const imports = await readAcceptedImports({ archiveRoot, manifestDir, productFilter })
  const productIds = [...new Set(imports.map((item) => item.product))].sort()
  const products = []
  for (const product of productIds) products.push(await aggregateProduct(product, imports.filter((item) => item.product === product)))
  const identity = imports.map(({ importId, inputSha256, normalizedSha256 }) => [importId, inputSha256, normalizedSha256])
  const aggregationId = `firms-detections-${sha256(JSON.stringify(identity)).slice(0, 20)}`
  const output = {
    schemaVersion: 1,
    aggregationId,
    generatedAtUtc: new Date().toISOString(),
    methodology: {
      metric: 'count of unique accepted source records',
      grouping: ['product', 'native satellite identifier', 'product version', 'UTC day/week/month'],
      dailyZeroFill: false,
      frpSummary: 'maximum source-record FRP in each group; not summed and not a cross-sensor energy comparison',
      confidence: 'native values are counted exactly as strings; no cross-sensor mapping is applied',
    },
    inputs: imports.map(({ normalizedPath: _normalizedPath, ...item }) => item),
    products,
    limitations: [
      'Hotspot records do not provide an observation-coverage denominator.',
      'A date without returned detections is omitted; it is not a measured zero or a no-fire result.',
      'Products and processing versions remain separate; this aggregate does not harmonize MODIS and VIIRS.',
      'Only manifests with accepted QA and matching raw/normalized SHA-256 hashes are included.',
    ],
  }
  const outputPath = path.join(outputDir, `${aggregationId}.json`)
  await saveJson(outputPath, output)
  console.log(JSON.stringify({ aggregationId, output: path.relative(root, outputPath), imports: imports.length, products: products.map(({ product, rowsRead, duplicateRowsAcrossImports, uniqueDetections, datesWithReturnedRecords }) => ({ product, rowsRead, duplicateRowsAcrossImports, uniqueDetections, datesWithReturnedRecords })) }, null, 2))
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
