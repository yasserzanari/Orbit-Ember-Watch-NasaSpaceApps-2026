#!/usr/bin/env node

import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const supportedProducts = new Set([
  'MODIS_NRT', 'MODIS_SP',
  'VIIRS_NOAA20_NRT', 'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT', 'VIIRS_NOAA21_SP',
  'VIIRS_SNPP_NRT', 'VIIRS_SNPP_SP',
])
const requiredColumns = ['latitude', 'longitude', 'acq_date', 'acq_time', 'satellite', 'instrument', 'frp', 'version']
const defaultMaxRows = 1_000_000

function usage() {
  return `Usage:
  node scripts/ingest-firms-archive.mjs --file <FIRMS.csv> --product <PRODUCT_ID> [options]

Required:
  --file <path>             Original, uncompressed FIRMS CSV
  --product <id>            One of MODIS_* or VIIRS_NOAA20/21/SNPP_*

Options:
  --retrieved-at <UTC ISO>  Time the file was obtained; omitted means unknown
  --expected-start <date>   Expected first UTC date (YYYY-MM-DD)
  --expected-end <date>     Expected last UTC date (YYYY-MM-DD)
  --archive-root <path>     Raw and normalized outputs (default: data/private/firms)
  --manifest-dir <path>     Manifest and QA reports (default: data/manifests/firms)
  --max-rows <number>       Safety limit (default: ${defaultMaxRows})
  --help                    Show this help

The importer preserves the input CSV, writes normalized JSONL, and records exclusions.
FIRMS hotspot files do not establish observation coverage or a valid no-fire result.`
}

function parseArgs(args) {
  const values = new Map()
  const flags = new Set(['--help'])
  for (let i = 0; i < args.length; i += 1) {
    const name = args[i]
    if (flags.has(name)) { values.set(name, true); continue }
    if (!name.startsWith('--') || i + 1 >= args.length || args[i + 1].startsWith('--')) throw new Error(`Invalid or incomplete option: ${name}`)
    if (values.has(name)) throw new Error(`Option repeated: ${name}`)
    values.set(name, args[i + 1]); i += 1
  }
  return values
}

function validDate(value, optionName) {
  if (value === undefined) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${optionName} must use YYYY-MM-DD.`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${optionName} is not a valid UTC date.`)
  return value
}

function validRetrievedAt(value) {
  if (value === undefined) return null
  const parsed = new Date(value)
  if (!value.endsWith('Z') || !Number.isFinite(parsed.getTime())) throw new Error('--retrieved-at must be an ISO-8601 UTC timestamp ending in Z.')
  return parsed.toISOString()
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function* csvRecords(filePath) {
  let field = ''
  let row = []
  let inQuotes = false
  let quotePending = false
  let skipLineFeed = false
  for await (const chunk of createReadStream(filePath, { encoding: 'utf8' })) {
    for (const character of chunk) {
      if (skipLineFeed) { skipLineFeed = false; if (character === '\n') continue }
      if (quotePending) {
        quotePending = false
        if (character === '"') { field += '"'; continue }
        inQuotes = false
      }
      if (inQuotes) {
        if (character === '"') quotePending = true
        else field += character
      } else if (character === '"') {
        if (field.length !== 0) throw new Error('Malformed CSV: quote found inside an unquoted field.')
        inQuotes = true
      } else if (character === ',') {
        row.push(field); field = ''
      } else if (character === '\n' || character === '\r') {
        row.push(field); field = ''
        if (row.some((value) => value !== '')) yield row
        row = []
        if (character === '\r') skipLineFeed = true
      } else field += character
    }
  }
  if (quotePending) { quotePending = false; inQuotes = false }
  if (inQuotes) throw new Error('Malformed CSV: file ended inside a quoted field.')
  if (field.length || row.length) { row.push(field); if (row.some((value) => value !== '')) yield row }
}

async function saveJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.partial`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporary, filePath)
}

function csvRowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()]))
}

function validateObservation(row) {
  if (!row.latitude) return { reason: 'invalid_latitude' }
  if (!row.longitude) return { reason: 'invalid_longitude' }
  if (!row.frp) return { reason: 'invalid_frp' }
  const latitude = Number(row.latitude)
  const longitude = Number(row.longitude)
  const frpMw = Number(row.frp)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { reason: 'invalid_latitude' }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return { reason: 'invalid_longitude' }
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(row.acq_date) ? new Date(`${row.acq_date}T00:00:00.000Z`) : null
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== row.acq_date) return { reason: 'invalid_acquisition_date' }
  if (!/^\d{1,4}$/.test(row.acq_time)) return { reason: 'invalid_acquisition_time' }
  const hhmm = row.acq_time.padStart(4, '0')
  const hour = Number(hhmm.slice(0, 2))
  const minute = Number(hhmm.slice(2, 4))
  if (hour > 23 || minute > 59) return { reason: 'invalid_acquisition_time' }
  if (!Number.isFinite(frpMw) || frpMw < 0) return { reason: 'invalid_frp' }
  if (!row.satellite) return { reason: 'missing_satellite' }
  if (!row.instrument) return { reason: 'missing_instrument' }
  return {
    observation: {
      latitude, longitude,
      acquiredAtUtc: `${row.acq_date}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`,
      satellite: row.satellite,
      instrument: row.instrument,
      productVersion: row.version || null,
      frpMw,
      confidenceNative: row.confidence || null,
      dayNight: row.daynight || null,
      native: row,
    },
  }
}

function recordSample(target, reason, rowNumber, row) {
  target.counts[reason] = (target.counts[reason] ?? 0) + 1
  if (!target.samples[reason]) target.samples[reason] = []
  if (target.samples[reason].length < 5) target.samples[reason].push({ row: rowNumber, latitude: row.latitude ?? null, longitude: row.longitude ?? null, acq_date: row.acq_date ?? null, acq_time: row.acq_time ?? null })
}

async function copyAtomic(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.partial`
  await new Promise((resolve, reject) => {
    const input = createReadStream(source)
    const output = createWriteStream(temporary, { flags: 'wx' })
    input.on('error', reject); output.on('error', reject); output.on('finish', resolve)
    input.pipe(output)
  })
  await rename(temporary, destination)
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  if (args.has('--help')) { console.log(usage()); return }
  const input = args.get('--file')
  const product = args.get('--product')
  if (!input || !product) throw new Error(`--file and --product are required.\n\n${usage()}`)
  if (!supportedProducts.has(product)) throw new Error(`Unsupported FIRMS product: ${product}`)
  const expectedStart = validDate(args.get('--expected-start'), '--expected-start')
  const expectedEnd = validDate(args.get('--expected-end'), '--expected-end')
  if ((expectedStart && !expectedEnd) || (!expectedStart && expectedEnd)) throw new Error('Provide both --expected-start and --expected-end, or neither.')
  if (expectedStart && expectedStart > expectedEnd) throw new Error('--expected-start must not be after --expected-end.')
  const retrievedAtUtc = validRetrievedAt(args.get('--retrieved-at'))
  const maxRows = Number(args.get('--max-rows') ?? defaultMaxRows)
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) throw new Error('--max-rows must be a positive integer.')

  const filePath = path.resolve(input)
  const metadata = await stat(filePath)
  if (!metadata.isFile()) throw new Error('--file must point to a regular file.')
  const rawSha256 = await sha256File(filePath)
  const id = `${product.toLowerCase()}-${rawSha256.slice(0, 20)}`
  const archiveRoot = path.resolve(root, args.get('--archive-root') ?? 'data/private/firms')
  const manifestDir = path.resolve(root, args.get('--manifest-dir') ?? 'data/manifests/firms')
  const qa = { rowsRead: 0, rowsAccepted: 0, rowsDuplicate: 0, rowsRejected: 0, counts: {}, samples: {} }
  const dates = { min: null, max: null }
  const satellites = new Map()
  const duplicateKeys = new Set()
  const warnings = []
  let missingProductVersionRows = 0
  const temporaryNormalized = path.join(archiveRoot, 'normalized', product, `${id}.jsonl.${process.pid}.partial`)
  let output
  let headers
  let normalizedHash

  try {
    await mkdir(path.dirname(temporaryNormalized), { recursive: true })
    output = createWriteStream(temporaryNormalized, { flags: 'wx' })
    const outputFailure = new Promise((_, reject) => output.on('error', reject))
    outputFailure.catch(() => {})
    const records = csvRecords(filePath)
    const first = await records.next()
    if (first.done) throw new Error('CSV is empty.')
    headers = first.value.map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim().toLowerCase())
    if (headers.some((value) => !value) || new Set(headers).size !== headers.length) throw new Error('CSV has an empty or duplicate column name.')
    const missingColumns = requiredColumns.filter((column) => !headers.includes(column))
    if (missingColumns.length) throw new Error(`CSV schema is missing required columns: ${missingColumns.join(', ')}.`)

    let rowNumber = 1
    for await (const values of records) {
      rowNumber += 1
      qa.rowsRead += 1
      if (qa.rowsRead > maxRows) throw new Error(`Row limit exceeded (${maxRows}); split the source into smaller files before import.`)
      if (values.length !== headers.length) { qa.rowsRejected += 1; recordSample(qa, 'column_count_mismatch', rowNumber, {}); continue }
      const row = csvRowObject(headers, values)
      const result = validateObservation(row)
      if (result.reason) { qa.rowsRejected += 1; recordSample(qa, result.reason, rowNumber, row); continue }
      const observation = result.observation
      if (expectedStart && (observation.acquiredAtUtc.slice(0, 10) < expectedStart || observation.acquiredAtUtc.slice(0, 10) > expectedEnd)) {
        throw new Error(`Observed row ${rowNumber} falls outside declared period ${expectedStart}..${expectedEnd}.`)
      }
      const duplicateKey = createHash('sha256').update(JSON.stringify(headers.map((header) => row[header]))).digest('hex')
      if (duplicateKeys.has(duplicateKey)) { qa.rowsDuplicate += 1; continue }
      duplicateKeys.add(duplicateKey)
      qa.rowsAccepted += 1
      dates.min = dates.min === null || observation.acquiredAtUtc.slice(0, 10) < dates.min ? observation.acquiredAtUtc.slice(0, 10) : dates.min
      dates.max = dates.max === null || observation.acquiredAtUtc.slice(0, 10) > dates.max ? observation.acquiredAtUtc.slice(0, 10) : dates.max
      satellites.set(observation.satellite, (satellites.get(observation.satellite) ?? 0) + 1)
      if (!observation.productVersion) missingProductVersionRows += 1
      if (!output.write(`${JSON.stringify(observation)}\n`)) await once(output, 'drain')
    }
    if (qa.rowsAccepted === 0) throw new Error('No valid observations remained after row-level quality checks.')
    output.end()
    await Promise.race([once(output, 'finish'), outputFailure])
    normalizedHash = await sha256File(temporaryNormalized)
  } catch (error) {
    if (output && !output.closed) {
      const closed = once(output, 'close').catch(() => {})
      output.destroy()
      await closed
    }
    await unlink(temporaryNormalized).catch(() => {})
    const quarantinePath = path.join(archiveRoot, 'quarantine', product, `${id}.csv`)
    await copyAtomic(filePath, quarantinePath)
    const qaReport = {
      schemaVersion: 1, importId: id, product, status: 'quarantined', sourceFile: path.basename(filePath), sourceBytes: metadata.size,
      sourceSha256: rawSha256, error: error instanceof Error ? error.message : String(error), ...qa,
      notice: 'A quarantined CSV must not feed historical aggregates.',
    }
    await saveJson(path.join(manifestDir, `${id}.qa.json`), qaReport)
    console.error(`Quarantined ${quarantinePath}`)
    console.error(qaReport.error)
    process.exitCode = 1
    return
  }

  const rawPath = path.join(archiveRoot, 'raw', product, `${id}.csv`)
  const normalizedPath = path.join(archiveRoot, 'normalized', product, `${id}.jsonl`)
  await copyAtomic(filePath, rawPath)
  await rename(temporaryNormalized, normalizedPath)
  if (!retrievedAtUtc) warnings.push('Source retrieval time was not provided; local file modification time is not treated as retrieval time.')
  if (missingProductVersionRows) warnings.push(`${missingProductVersionRows} accepted rows have an empty product version.`)
  if (!expectedStart) warnings.push('No expected period was declared; observed date bounds describe only rows found in this file.')
  if (qa.rowsRejected) warnings.push(`${qa.rowsRejected} source rows were excluded for invalid fields or shape.`)
  if (qa.rowsDuplicate) warnings.push(`${qa.rowsDuplicate} exact duplicate source rows were excluded.`)

  const manifest = {
    schemaVersion: 1,
    importId: id,
    product,
    source: 'NASA LANCE FIRMS Archive Download',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/download/',
    sourceFile: path.basename(filePath),
    sourceRetrievedAtUtc: retrievedAtUtc,
    importedFileMtimeUtc: metadata.mtime.toISOString(),
    input: { format: 'CSV', bytes: metadata.size, sha256: rawSha256, path: path.relative(root, rawPath) },
    normalized: { format: 'JSONL', bytes: (await stat(normalizedPath)).size, sha256: normalizedHash, path: path.relative(root, normalizedPath) },
    schema: { columns: headers, requiredColumns },
    observed: { rowsRead: qa.rowsRead, rowsAccepted: qa.rowsAccepted, rowsDuplicate: qa.rowsDuplicate, rowsRejected: qa.rowsRejected, minDateUtc: dates.min, maxDateUtc: dates.max, satellites: Object.fromEntries([...satellites].sort(([a], [b]) => a.localeCompare(b))) },
    declaredPeriodUtc: expectedStart ? { start: expectedStart, end: expectedEnd } : null,
    provenance: 'Input CSV preserved byte-for-byte; native columns are retained on each normalized JSONL record.',
    limitations: ['Hotspot detections are not an observation-coverage denominator.', 'No returned hotspot does not mean a valid no-fire observation.', 'This import does not harmonize sensors or create daily zero counts.', 'Check the exact product citation, license and redistribution terms before publishing input data.'],
    warnings: [...new Set(warnings)],
  }
  const qaReport = {
    schemaVersion: 1, importId: id, product, status: qa.rowsRejected || qa.rowsDuplicate ? 'accepted_with_exclusions' : 'accepted',
    rowsRead: qa.rowsRead, rowsAccepted: qa.rowsAccepted, rowsDuplicate: qa.rowsDuplicate, rowsRejected: qa.rowsRejected,
    rejectionCounts: qa.counts, rejectionSamples: qa.samples, observedDateRangeUtc: { start: dates.min, end: dates.max },
    rawSha256, normalizedSha256: normalizedHash,
  }
  await saveJson(path.join(manifestDir, `${id}.manifest.json`), manifest)
  await saveJson(path.join(manifestDir, `${id}.qa.json`), qaReport)
  console.log(JSON.stringify({ status: qaReport.status, importId: id, rowsRead: qa.rowsRead, rowsAccepted: qa.rowsAccepted, rowsRejected: qa.rowsRejected, rowsDuplicate: qa.rowsDuplicate, minDateUtc: dates.min, maxDateUtc: dates.max, manifest: path.relative(root, path.join(manifestDir, `${id}.manifest.json`)), qa: path.relative(root, path.join(manifestDir, `${id}.qa.json`)) }, null, 2))
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
