import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const maxRequestBytes = 8 * 1024 * 1024
const allowedSources = new Set([
  'MODIS_NRT', 'MODIS_SP',
  'VIIRS_NOAA20_NRT', 'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT', 'VIIRS_NOAA21_SP',
])
const cache = new Map()

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
  if (!key) return json(response, 503, { code: 'firms_key_missing', message: 'Configure FIRMS_MAP_KEY in the local server environment.' })

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
    const payload = { source, bbox, dayRange: days, queryStartDate, queryEndDate, fetchedAtUtc: new Date().toISOString(), count: observations.length, observations }
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
  if (url.pathname === '/api/health') return json(response, 200, { service: 'orbit-ember-watch', firmsConfigured: Boolean(process.env.FIRMS_MAP_KEY) })
  if (url.pathname === '/api/firms') {
    if (request.method !== 'GET') return json(response, 405, { code: 'method_not_allowed' }, { allow: 'GET' })
    return getFirms(url, response)
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
