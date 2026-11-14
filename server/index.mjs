import { createServer } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { createReadStream, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const maxRequestBytes = 8 * 1024 * 1024
const allowedSources = new Set([
  'MODIS_NRT', 'MODIS_SP',
  'VIIRS_NOAA20_NRT', 'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT', 'VIIRS_NOAA21_SP',
  'VIIRS_SNPP_NRT', 'VIIRS_SNPP_SP',
])
const satellitesBySource = {
  MODIS_NRT: new Set(['A', 'T']), MODIS_SP: new Set(['A', 'T']),
  VIIRS_NOAA20_NRT: new Set(['N20']), VIIRS_NOAA20_SP: new Set(['N20']),
  VIIRS_NOAA21_NRT: new Set(['N21']), VIIRS_NOAA21_SP: new Set(['N21']),
  VIIRS_SNPP_NRT: new Set(['NPP']), VIIRS_SNPP_SP: new Set(['NPP']),
}
const satelliteAliases = {
  MODIS: { A: 'A', AQUA: 'A', T: 'T', TERRA: 'T' },
  VIIRS_NOAA20: { N20: 'N20', '1': 'N20', J1: 'N20', NOAA20: 'N20' },
  VIIRS_NOAA21: { N21: 'N21', '2': 'N21', J2: 'N21', NOAA21: 'N21' },
  VIIRS_SNPP: { NPP: 'NPP', SNPP: 'NPP', SUOMINPP: 'NPP', N: 'NPP' },
}
const publicNrtFeeds = new Map([
  ['MODIS_NRT', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Canada_7d.csv'],
  ['VIIRS_NOAA20_NRT', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Canada_7d.csv'],
  ['VIIRS_NOAA21_NRT', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Canada_7d.csv'],
])
const cache = new Map()
const publicFeedCache = new Map()
let availabilityCache = null

function loadLocalEnv() {
  try {
    for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2').trim()
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

function json(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  })
  response.end(body)
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(field); field = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
    } else field += character
  }
  if (field || row.length) { row.push(field); if (row.some((value) => value !== '')) rows.push(row) }
  if (rows.length < 1) return []
  const headers = rows[0].map((name) => name.trim())
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((name, index) => [name, values[index]?.trim() ?? ''])))
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeRows(rows, source) {
  return rows.map((row) => {
    const latitude = numberOrNull(row.latitude)
    const longitude = numberOrNull(row.longitude)
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    return {
      id: [source, row.satellite, row.acq_date, row.acq_time, latitude, longitude].join(':'),
      latitude,
      longitude,
      source,
      satellite: row.satellite || null,
      instrument: row.instrument || null,
      acquiredAtUtc: row.acq_date && row.acq_time !== undefined
        && row.acq_time !== ''
        ? `${row.acq_date}T${String(row.acq_time).padStart(4, '0').slice(0, 2)}:${String(row.acq_time).padStart(4, '0').slice(2, 4)}:00Z`
        : null,
      confidenceNative: row.confidence || null,
      frpMw: numberOrNull(row.frp),
      brightness4: numberOrNull(row.bright_ti4 ?? row.bright_t21),
      brightness5: numberOrNull(row.bright_ti5 ?? row.bright_t31),
      scanKm: numberOrNull(row.scan),
      trackKm: numberOrNull(row.track),
      dayNight: row.daynight || null,
      productVersion: row.version || null,
    }
  }).filter(Boolean)
}

function validateBbox(value) {
  const coordinates = value?.split(',').map(Number)
  if (!coordinates || coordinates.length !== 4 || coordinates.some((number) => !Number.isFinite(number))) return null
  const [west, south, east, north] = coordinates
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null
  if ((east - west) * (north - south) > 100) return null
  return coordinates.map((number) => Number(number.toFixed(4)))
}

function shiftUtcDay(day, offset) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function validateUtcDate(value) {
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined
}

async function getPublicNrtCsv(source) {
  const cached = publicFeedCache.get(source)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const url = publicNrtFeeds.get(source)
  if (!url) throw new Error('This FIRMS product requires a server MAP_KEY; no public Canada near-real-time feed is available.')
  const promise = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const upstream = await fetch(url, { signal: controller.signal, headers: { accept: 'text/csv' } })
      if (!upstream.ok) throw new Error(`NASA FIRMS public feed returned HTTP ${upstream.status}.`)
      const length = Number(upstream.headers.get('content-length'))
      if (Number.isFinite(length) && length > maxRequestBytes) throw new Error('NASA FIRMS public feed exceeded the configured response limit.')
      const csv = await upstream.text()
      if (Buffer.byteLength(csv) > maxRequestBytes) throw new Error('NASA FIRMS public feed exceeded the configured response limit.')
      const rows = parseCsv(csv)
      if (rows.length === 0 || !['latitude', 'longitude', 'acq_date', 'acq_time'].every((column) => column in rows[0])) {
        throw new Error('NASA FIRMS public feed did not contain the expected CSV columns.')
      }
      return { rows, fetchedAtUtc: new Date().toISOString(), sourceUrl: url }
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('NASA FIRMS public feed did not answer before the 20 second timeout.')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  })()
  const entry = { promise, expiresAt: Date.now() + 120_000 }
  publicFeedCache.set(source, entry)
  try {
    return await promise
  } catch (error) {
    if (publicFeedCache.get(source) === entry) publicFeedCache.delete(source)
    throw error
  }
}

async function getPublicNrtFirms(response, { source, bbox, days, requestedStartDate, todayUtc }) {
  if (!publicNrtFeeds.has(source)) {
    return json(response, 503, { code: 'firms_key_missing', message: 'This FIRMS product requires FIRMS_MAP_KEY in the local server environment. Public keyless feeds are available only for the latest seven days of MODIS and NOAA-20/NOAA-21 detections in Canada.' })
  }
  let feed
  try {
    feed = await getPublicNrtCsv(source)
  } catch (error) {
    return json(response, 502, { code: 'firms_public_feed_error', message: error instanceof Error ? error.message : 'NASA FIRMS public near-real-time data could not be loaded.' })
  }

  const queryEndDate = requestedStartDate ? shiftUtcDay(requestedStartDate, days - 1) : todayUtc
  const queryStartDate = requestedStartDate ?? shiftUtcDay(queryEndDate, 1 - days)
  // A rolling seven-day feed can include part of the calendar date seven days ago.
  const publicWindowStartDate = shiftUtcDay(todayUtc, -7)
  const feedDates = feed.rows.map((row) => validateUtcDate(row.acq_date)).filter(Boolean).sort()
  const minFeedDate = feedDates[0]
  const maxFeedDate = feedDates.at(-1)
  if (feedDates.length === 0) return json(response, 502, { code: 'firms_public_feed_empty', message: 'NASA FIRMS public near-real-time feed did not contain dated observations.' })
  if (queryEndDate < publicWindowStartDate) {
    return getLocalArchiveFirms(response, { source, bbox, days, queryStartDate, queryEndDate, publicFeedRange: { minDate: publicWindowStartDate, maxDate: todayUtc } })
  }

  const [west, south, east, north] = bbox
  const observations = normalizeRows(feed.rows.filter((row) => {
    const latitude = numberOrNull(row.latitude)
    const longitude = numberOrNull(row.longitude)
    const date = validateUtcDate(row.acq_date)
    return latitude !== null && longitude !== null && date !== null
      && date >= queryStartDate && date <= queryEndDate
      && longitude >= west && longitude <= east && latitude >= south && latitude <= north
  }), source)
  return json(response, 200, {
    source,
    bbox,
    dayRange: days,
    queryStartDate,
    queryEndDate,
    fetchedAtUtc: feed.fetchedAtUtc,
    count: observations.length,
    observations,
    accessMode: 'public-nrt-canada-csv',
    sourceUrl: feed.sourceUrl,
    sourceDateRange: { minDate: publicWindowStartDate, maxDate: todayUtc },
    detectionDateRange: { minDate: minFeedDate, maxDate: maxFeedDate },
    coverageState: queryStartDate < publicWindowStartDate ? 'partial' : 'public-feed-window',
    coverageCaveat: 'The feed is available for a rolling seven-day date window; rows are detections, not a per-pixel observation-coverage denominator. Dates before the window are not queried.',
  }, { 'x-data-cache': 'public-feed' })
}

function validHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) }

async function sha256File(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function productVersionMatchesSource(version, source) {
  if (version === null || version === undefined || String(version).trim() === '') return true
  const realtimeVersion = /(?:URT|RT|NRT)$/i.test(String(version).trim())
  return source.endsWith('_NRT') ? realtimeVersion : !realtimeVersion
}

function normalizeSatelliteForSource(source, value) {
  if (typeof value !== 'string') return null
  const platform = source.startsWith('MODIS_') ? 'MODIS' : source.startsWith('VIIRS_NOAA20_') ? 'VIIRS_NOAA20' : source.startsWith('VIIRS_NOAA21_') ? 'VIIRS_NOAA21' : 'VIIRS_SNPP'
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '')
  return satelliteAliases[platform][normalized] ?? null
}

function normalizeArchivedObservation(record, source, importId, lineNumber) {
  if (!record || typeof record !== 'object' || !Number.isFinite(record.latitude) || record.latitude < -90 || record.latitude > 90
    || !Number.isFinite(record.longitude) || record.longitude < -180 || record.longitude > 180
    || typeof record.acquiredAtUtc !== 'string' || !Number.isFinite(Date.parse(record.acquiredAtUtc))
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.acquiredAtUtc)
    || !Number.isFinite(record.frpMw) || record.frpMw < 0 || typeof record.satellite !== 'string'
    || !satellitesBySource[source].has(record.satellite.trim().toUpperCase())) return null
  const expectedInstrument = source.startsWith('MODIS_') ? 'MODIS' : 'VIIRS'
  if (record.instrument !== expectedInstrument || !record.native || typeof record.native !== 'object'
    || (record.native.version && record.productVersion !== record.native.version)
    || (record.native.satellite && normalizeSatelliteForSource(source, record.native.satellite) !== record.satellite.trim().toUpperCase())
    || (record.native.instrument && record.native.instrument.trim().toUpperCase() !== expectedInstrument)
    || !productVersionMatchesSource(record.productVersion, source)) return null
  const nativeForDedupe = { ...record.native }
  if (typeof nativeForDedupe.satellite === 'string') {
    nativeForDedupe.satellite = normalizeSatelliteForSource(source, nativeForDedupe.satellite) ?? nativeForDedupe.satellite.trim().toUpperCase()
  }
  const nativeCanonical = JSON.stringify(Object.fromEntries(Object.entries(nativeForDedupe).sort(([a], [b]) => a.localeCompare(b))))
  return {
    id: `${source}:${importId}:${lineNumber}`,
    latitude: record.latitude,
    longitude: record.longitude,
    source,
    satellite: record.satellite.trim(),
    instrument: record.instrument,
    acquiredAtUtc: record.acquiredAtUtc,
    confidenceNative: record.confidenceNative ?? null,
    frpMw: record.frpMw,
    brightness4: numberOrNull(record.native.bright_ti4 ?? record.native.bright_t21 ?? record.native.brightness),
    brightness5: numberOrNull(record.native.bright_ti5 ?? record.native.bright_t31),
    scanKm: numberOrNull(record.native.scan),
    trackKm: numberOrNull(record.native.track),
    dayNight: record.dayNight ?? null,
    productVersion: record.productVersion ?? null,
    nativeCanonical,
  }
}

async function getLocalArchiveFirms(response, { source, bbox, days, queryStartDate, queryEndDate, publicFeedRange = null }) {
  const manifestDir = path.join(root, 'data', 'manifests', 'firms')
  let names
  try { names = await readdir(manifestDir) } catch (error) {
    if (error?.code !== 'ENOENT') return json(response, 500, { code: 'local_archive_unavailable', message: 'The local FIRMS archive catalog could not be read.' })
    names = []
  }
  const productPrefix = `${source.toLowerCase()}-`
  const candidates = names.filter((name) => name.startsWith(productPrefix) && name.endsWith('.manifest.json')).sort().slice(0, 500)
  const [west, south, east, north] = bbox
  const observations = []
  const dedupe = new Set()
  const imports = []
  let invalidImportCount = 0
  let tooMany = false

  for (const name of candidates) {
    const importId = name.slice(0, -'.manifest.json'.length)
    if (!/^[a-z0-9_-]{1,100}$/.test(importId)) { invalidImportCount += 1; continue }
    let manifest, qa
    try {
      [manifest, qa] = await Promise.all([
        readFile(path.join(manifestDir, name), 'utf8').then(JSON.parse),
        readFile(path.join(manifestDir, `${importId}.qa.json`), 'utf8').then(JSON.parse),
      ])
    } catch { invalidImportCount += 1; continue }
    if (!manifest || typeof manifest !== 'object') { invalidImportCount += 1; continue }
    if (manifest.product !== source) continue
    const observed = manifest.observed
    if (manifest.schemaVersion !== 1 || manifest.importId !== importId || !validHash(manifest.input?.sha256)
      || !validHash(manifest.normalized?.sha256) || !observed
      || !Number.isSafeInteger(manifest.input?.bytes) || manifest.input.bytes < 1
      || !Number.isSafeInteger(manifest.normalized?.bytes) || manifest.normalized.bytes < 1
      || !Number.isSafeInteger(observed.rowsAccepted) || observed.rowsAccepted < 1
      || !Number.isSafeInteger(observed.rowsRead) || observed.rowsRead < 1
      || !Number.isSafeInteger(observed.rowsRejected) || observed.rowsRejected < 0
      || !Number.isSafeInteger(observed.rowsDuplicate) || observed.rowsDuplicate < 0
      || observed.rowsAccepted + observed.rowsRejected + observed.rowsDuplicate !== observed.rowsRead
      || !validateUtcDate(observed.minDateUtc) || !validateUtcDate(observed.maxDateUtc) || observed.minDateUtc > observed.maxDateUtc
      || !qa || typeof qa !== 'object' || qa.importId !== importId || qa.product !== source || qa.rawSha256 !== manifest.input.sha256
      || qa.normalizedSha256 !== manifest.normalized.sha256 || qa.rowsRead !== observed.rowsRead
      || qa.rowsAccepted !== observed.rowsAccepted || qa.rowsRejected !== observed.rowsRejected || qa.rowsDuplicate !== observed.rowsDuplicate
      || !['accepted', 'accepted_with_exclusions'].includes(qa.status)) { invalidImportCount += 1; continue }
    if (observed.maxDateUtc < queryStartDate || observed.minDateUtc > queryEndDate) continue

    const expectedRawPath = path.join(root, 'data', 'private', 'firms', 'raw', source, `${importId}.csv`)
    const expectedPath = path.join(root, 'data', 'private', 'firms', 'normalized', source, `${importId}.jsonl`)
    if (manifest.input?.path !== path.relative(root, expectedRawPath)
      || manifest.normalized?.path !== path.relative(root, expectedPath)) { invalidImportCount += 1; continue }
    try {
      const [normalizedStat, rawStat] = await Promise.all([
        stat(expectedPath),
        stat(expectedRawPath),
      ])
      if (!normalizedStat.isFile() || !rawStat.isFile()
        || normalizedStat.size !== manifest.normalized.bytes || rawStat.size !== manifest.input.bytes
        || await sha256File(expectedRawPath) !== manifest.input.sha256) throw new Error('missing archive file or raw source hash mismatch')
    } catch { invalidImportCount += 1; continue }

    const hash = createHash('sha256')
    const importMatches = []
    const importDedupe = new Set()
    let lineNumber = 0
    let corrupt = false
    let importTooMany = false
    try {
      const lines = createInterface({ input: createReadStream(expectedPath), crlfDelay: Infinity })
      for await (const line of lines) {
        hash.update(`${line}\n`)
        lineNumber += 1
        if (!line) { corrupt = true; break }
        let parsed
        try { parsed = JSON.parse(line) } catch { corrupt = true; break }
        const observation = normalizeArchivedObservation(parsed, source, importId, lineNumber)
        const day = observation?.acquiredAtUtc.slice(0, 10)
        if (!observation || !validateUtcDate(day) || day < observed.minDateUtc || day > observed.maxDateUtc) { corrupt = true; break }
        if (day < queryStartDate || day > queryEndDate || observation.longitude < west || observation.longitude > east
          || observation.latitude < south || observation.latitude > north) continue
        const key = createHash('sha256').update(JSON.stringify([source, observation.nativeCanonical])).digest('hex')
        if (dedupe.has(key) || importDedupe.has(key)) continue
        importDedupe.add(key)
        if (observations.length + importMatches.length >= 3000) { importTooMany = true; continue }
        importMatches.push({ key, observation })
      }
    } catch { corrupt = true }
    if (corrupt || lineNumber !== observed.rowsAccepted || hash.digest('hex') !== manifest.normalized.sha256) { invalidImportCount += 1; continue }
    if (importTooMany) tooMany = true

    for (const item of importMatches) {
      dedupe.add(item.key)
      const { nativeCanonical: _nativeCanonical, ...publicObservation } = item.observation
      observations.push(publicObservation)
    }
    imports.push({
      importId, product: source, sourceFile: path.basename(String(manifest.sourceFile || 'FIRMS archive.csv')).slice(0, 160),
      sourceUrl: typeof manifest.sourceUrl === 'string' ? manifest.sourceUrl : null,
      sourceRetrievedAtUtc: typeof manifest.sourceRetrievedAtUtc === 'string' && Number.isFinite(Date.parse(manifest.sourceRetrievedAtUtc)) ? new Date(manifest.sourceRetrievedAtUtc).toISOString() : null,
      observedStartDate: observed.minDateUtc, observedEndDate: observed.maxDateUtc,
      rowsAccepted: observed.rowsAccepted, rowsRejected: observed.rowsRejected, rowsDuplicate: observed.rowsDuplicate,
      sourceSha256: manifest.input.sha256,
    })
  }

  if (tooMany) return json(response, 413, { code: 'local_archive_result_too_large', message: 'The local archive query matched more than 3,000 detections. Choose a smaller area or a shorter date window.' })
  if (invalidImportCount > 0 && imports.length === 0) return json(response, 500, { code: 'local_archive_integrity_error', message: 'Matching local FIRMS archive files failed QA or integrity checks; re-import the affected source before querying it.' })
  if (imports.length === 0) return json(response, 404, {
    code: 'local_archive_not_found',
    message: `No accepted local ${source} archive covers ${queryStartDate} through ${queryEndDate}. Configure FIRMS_MAP_KEY or import a matching NASA CSV archive locally.${publicFeedRange ? ` The public NRT feed covers ${publicFeedRange.minDate} through ${publicFeedRange.maxDate}.` : ''}`,
  })

  observations.sort((a, b) => a.acquiredAtUtc.localeCompare(b.acquiredAtUtc) || a.id.localeCompare(b.id))
  return json(response, 200, {
    source, bbox, dayRange: days, queryStartDate, queryEndDate,
    fetchedAtUtc: new Date().toISOString(), count: observations.length, observations,
    accessMode: 'local-validated-archive', imports,
    invalidImportCount,
    coverageState: 'unknown',
    caveat: 'A date or area with no returned detections is not evidence of no fire; this archive has no observation-coverage denominator.',
  }, { 'x-data-cache': 'local-archive' })
}

async function getFirms(requestUrl, response) {
  if (requestUrl.searchParams.has('map_key') || requestUrl.searchParams.has('key')) {
    return json(response, 400, { code: 'secret_in_query', message: 'Do not send a FIRMS key from the browser.' })
  }
  const source = requestUrl.searchParams.get('source') || ''
  const bbox = validateBbox(requestUrl.searchParams.get('bbox'))
  const days = Number(requestUrl.searchParams.get('days') || 1)
  const requestedStartDate = validateUtcDate(requestUrl.searchParams.get('date'))
  if (!allowedSources.has(source)) return json(response, 400, { code: 'invalid_source', message: 'Select a supported FIRMS MODIS or VIIRS product.' })
  if (!bbox) return json(response, 400, { code: 'invalid_bbox', message: 'Bounding box must be west,south,east,north and within valid coordinate limits.' })
  if (!Number.isInteger(days) || days < 1 || days > 5) return json(response, 400, { code: 'invalid_day_range', message: 'FIRMS area requests support 1 to 5 days.' })
  if (requestUrl.searchParams.has('date') && requestedStartDate === undefined) return json(response, 400, { code: 'invalid_date', message: 'Date must be a valid YYYY-MM-DD UTC date.' })
  const todayUtc = new Date().toISOString().slice(0, 10)
  if (requestedStartDate && shiftUtcDay(requestedStartDate, days - 1) > todayUtc) return json(response, 400, { code: 'future_date_window', message: 'The selected FIRMS date window cannot extend into the future.' })

  const key = process.env.FIRMS_MAP_KEY
  if (!key) {
    if (publicNrtFeeds.has(source)) return getPublicNrtFirms(response, { source, bbox, days, requestedStartDate, todayUtc })
    if (!requestedStartDate) return json(response, 400, { code: 'archive_date_required', message: 'Choose a UTC start date to query this local archive product, or configure FIRMS_MAP_KEY for live FIRMS access.' })
    return getLocalArchiveFirms(response, { source, bbox, days, queryStartDate: requestedStartDate, queryEndDate: shiftUtcDay(requestedStartDate, days - 1) })
  }

  const cacheKey = JSON.stringify([source, bbox, days, requestedStartDate])
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return json(response, 200, cached.payload, { 'x-data-cache': 'hit' })

  const [west, south, east, north] = bbox
  const datePath = requestedStartDate ? `/${requestedStartDate}` : ''
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${source}/${west},${south},${east},${north}/${days}${datePath}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const upstream = await fetch(url, { signal: controller.signal, headers: { accept: 'text/csv' } })
    if (!upstream.ok) return json(response, 502, { code: 'firms_upstream_error', message: `NASA FIRMS returned HTTP ${upstream.status}. Check the key, source and request limits.` })
    const csv = await upstream.text()
    if (Buffer.byteLength(csv) > maxRequestBytes) return json(response, 502, { code: 'firms_response_too_large', message: 'FIRMS response exceeded the configured response limit.' })
    const rows = parseCsv(csv)
    if (rows.length === 0 && !/^\s*latitude\s*,/i.test(csv)) return json(response, 502, { code: 'firms_invalid_csv', message: 'NASA FIRMS returned a response without the expected CSV header.' })
    const observations = normalizeRows(rows, source)
    const queryEndDate = requestedStartDate ? shiftUtcDay(requestedStartDate, days - 1) : todayUtc
    const queryStartDate = requestedStartDate ?? shiftUtcDay(queryEndDate, 1 - days)
    const payload = { source, bbox, dayRange: days, queryStartDate, queryEndDate, fetchedAtUtc: new Date().toISOString(), count: observations.length, observations, accessMode: 'map-key-area-api' }
    cache.set(cacheKey, { expiresAt: Date.now() + 120_000, payload })
    if (cache.size > 128) cache.delete(cache.keys().next().value)
    return json(response, 200, payload, { 'x-data-cache': 'miss' })
  } catch (error) {
    const timeoutError = error?.name === 'AbortError'
    return json(response, 502, { code: timeoutError ? 'firms_timeout' : 'firms_network_error', message: timeoutError ? 'NASA FIRMS did not answer before the 20 second timeout.' : 'Could not reach NASA FIRMS. Retry when the connection is available.' })
  } finally {
    clearTimeout(timeout)
  }
}

async function getFirmsAvailability(response) {
  const key = process.env.FIRMS_MAP_KEY
  if (!key) return json(response, 503, { code: 'firms_key_missing', message: 'Configure FIRMS_MAP_KEY in the local server environment.' })
  if (availabilityCache && availabilityCache.expiresAt > Date.now()) {
    return json(response, 200, availabilityCache.payload, { 'x-data-cache': 'hit' })
  }

  const url = `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${encodeURIComponent(key)}/all`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const upstream = await fetch(url, { signal: controller.signal, headers: { accept: 'text/csv' } })
    if (!upstream.ok) return json(response, 502, { code: 'firms_availability_upstream_error', message: `NASA FIRMS returned HTTP ${upstream.status} while checking product coverage.` })
    const csv = await upstream.text()
    if (Buffer.byteLength(csv) > 256 * 1024) return json(response, 502, { code: 'firms_availability_too_large', message: 'FIRMS availability response exceeded the configured response limit.' })
    const rows = parseCsv(csv)
    if (!rows.length || !['data_id', 'min_date', 'max_date'].every((column) => column in rows[0])) {
      return json(response, 502, { code: 'firms_availability_invalid_csv', message: 'NASA FIRMS returned an availability file without the expected columns.' })
    }
    const products = rows.flatMap((row) => {
      const minDate = validateUtcDate(row.min_date)
      const maxDate = validateUtcDate(row.max_date)
      if (!allowedSources.has(row.data_id) || !minDate || !maxDate || minDate > maxDate) return []
      return [{ product: row.data_id, minDate, maxDate }]
    })
    const payload = { fetchedAtUtc: new Date().toISOString(), products }
    availabilityCache = { expiresAt: Date.now() + 60 * 60_000, payload }
    return json(response, 200, payload, { 'x-data-cache': 'miss' })
  } catch (error) {
    const timeoutError = error?.name === 'AbortError'
    return json(response, 502, { code: timeoutError ? 'firms_availability_timeout' : 'firms_availability_network_error', message: timeoutError ? 'NASA FIRMS availability did not answer before the 20 second timeout.' : 'Could not reach NASA FIRMS availability. Retry when the connection is available.' })
  } finally {
    clearTimeout(timeout)
  }
}

async function getFirmsArchiveCatalog(response) {
  const manifestDir = path.join(root, 'data', 'manifests', 'firms')
  let names
  try {
    names = await readdir(manifestDir)
  } catch (error) {
    if (error?.code === 'ENOENT') return json(response, 200, { generatedAtUtc: new Date().toISOString(), archives: [], invalidManifestCount: 0, truncated: false })
    return json(response, 500, { code: 'archive_catalog_unavailable', message: 'Local FIRMS archive manifests could not be read.' })
  }

  const manifestNames = names.filter((name) => name.endsWith('.manifest.json')).sort().slice(0, 500)
  const archives = []
  let invalidManifestCount = 0
  for (const name of manifestNames) {
    const importId = name.slice(0, -'.manifest.json'.length)
    if (!/^[a-z0-9_-]{1,80}$/.test(importId)) { invalidManifestCount += 1; continue }
    try {
      const manifest = JSON.parse(await readFile(path.join(manifestDir, name), 'utf8'))
      const qa = JSON.parse(await readFile(path.join(manifestDir, `${importId}.qa.json`), 'utf8'))
      const observed = manifest.observed
      const hash = manifest.input?.sha256
      const normalizedHash = manifest.normalized?.sha256
      if (manifest.importId !== importId || !allowedSources.has(manifest.product)
        || !/^[a-f0-9]{64}$/.test(hash || '') || !/^[a-f0-9]{64}$/.test(normalizedHash || '') || !observed
        || !Number.isSafeInteger(observed.rowsAccepted) || observed.rowsAccepted < 1
        || !Number.isSafeInteger(observed.rowsRead) || observed.rowsRead < 1 || !Number.isSafeInteger(observed.rowsRejected) || observed.rowsRejected < 0
        || !Number.isSafeInteger(observed.rowsDuplicate) || observed.rowsDuplicate < 0
        || observed.rowsAccepted + observed.rowsRejected + observed.rowsDuplicate !== observed.rowsRead
        || !validateUtcDate(observed.minDateUtc) || !validateUtcDate(observed.maxDateUtc)
        || observed.minDateUtc > observed.maxDateUtc
        || qa.importId !== importId || qa.product !== manifest.product || qa.rawSha256 !== hash
        || qa.normalizedSha256 !== normalizedHash || qa.rowsRead !== observed.rowsRead
        || qa.rowsAccepted !== observed.rowsAccepted || qa.rowsRejected !== observed.rowsRejected
        || qa.rowsDuplicate !== observed.rowsDuplicate
        || !['accepted', 'accepted_with_exclusions'].includes(qa.status)) {
        invalidManifestCount += 1; continue
      }
      archives.push({
        importId,
        product: manifest.product,
        sourceFile: path.basename(String(manifest.sourceFile || 'FIRMS archive.csv')).slice(0, 160),
        sourceRetrievedAtUtc: typeof manifest.sourceRetrievedAtUtc === 'string' && Number.isFinite(Date.parse(manifest.sourceRetrievedAtUtc)) ? new Date(manifest.sourceRetrievedAtUtc).toISOString() : null,
        minDateUtc: observed.minDateUtc,
        maxDateUtc: observed.maxDateUtc,
        rowsRead: observed.rowsRead,
        rowsAccepted: observed.rowsAccepted,
        rowsRejected: observed.rowsRejected,
        rowsDuplicate: observed.rowsDuplicate,
        sourceSha256: hash,
        qaStatus: qa.status,
        warnings: Array.isArray(manifest.warnings) ? manifest.warnings.filter((value) => typeof value === 'string').slice(0, 5) : [],
      })
    } catch {
      invalidManifestCount += 1
    }
  }
  return json(response, 200, { generatedAtUtc: new Date().toISOString(), archives, invalidManifestCount, truncated: names.filter((name) => name.endsWith('.manifest.json')).length > 500 })
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.ico', 'image/x-icon'], ['.woff2', 'font/woff2'],
])

async function serveStatic(pathname, response) {
  const decoded = decodeURIComponent(pathname)
  const candidate = path.resolve(dist, `.${decoded}`)
  if (candidate !== dist && !candidate.startsWith(`${dist}${path.sep}`)) return json(response, 403, { code: 'forbidden_path' })
  let filePath = candidate
  try {
    const metadata = await stat(filePath)
    if (metadata.isDirectory()) filePath = path.join(filePath, 'index.html')
  } catch {
    filePath = path.join(dist, 'index.html')
  }
  try {
    const content = await readFile(filePath)
    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
      'cache-control': path.basename(filePath).startsWith('index.') ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self' https: data: blob:; connect-src 'self' https:; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    })
    response.end(content)
  } catch {
    json(response, 503, { code: 'build_missing', message: 'Run npm run build before starting the production server.' })
  }
}

loadLocalEnv()
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  if (url.pathname === '/api/health') return json(response, 200, { service: 'orbit-ember-watch', firmsConfigured: Boolean(process.env.FIRMS_MAP_KEY), publicNrtSupported: publicNrtFeeds.size > 0 })
  if (url.pathname === '/api/firms') {
    if (request.method !== 'GET') return json(response, 405, { code: 'method_not_allowed' }, { allow: 'GET' })
    return getFirms(url, response)
  }
  if (url.pathname === '/api/firms/availability') {
    if (request.method !== 'GET') return json(response, 405, { code: 'method_not_allowed' }, { allow: 'GET' })
    return getFirmsAvailability(response)
  }
  if (url.pathname === '/api/firms/archive-catalog') {
    if (request.method !== 'GET') return json(response, 405, { code: 'method_not_allowed' }, { allow: 'GET' })
    return getFirmsArchiveCatalog(response)
  }
  if (url.pathname.startsWith('/api/')) return json(response, 404, { code: 'not_found' })
  if (!['GET', 'HEAD'].includes(request.method || '')) return json(response, 405, { code: 'method_not_allowed' }, { allow: 'GET, HEAD' })
  if (request.method === 'HEAD') {
    return serveStatic(url.pathname, { writeHead: (...args) => response.writeHead(...args), end: () => response.end() })
  }
  return serveStatic(url.pathname, response)
})

const port = Number(process.env.PORT || 4174)
const host = process.env.HOST || '0.0.0.0'
server.listen(port, host, () => console.log(`Orbit Ember Watch server listening on http://${host}:${port}`))
