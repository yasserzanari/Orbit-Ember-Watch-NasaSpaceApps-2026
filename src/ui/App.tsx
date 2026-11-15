import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, ImageSource, Map as MapLibreMap } from 'maplibre-gl'
import { useWorkspaceState, workspaceLocations } from '../app/useWorkspaceState'
import type { FirmsProduct, WorkspaceView } from '../app/useWorkspaceState'
import { FieldReports } from './FieldReports'
import { CommonGridPreview } from './CommonGridPreview'
import { terrainAspectLabel, terrainTransectCoordinates, useTerrainAnalysis } from '../app/useTerrainAnalysis'
import type { TerrainAnalysis, TerrainEndpoints } from '../app/useTerrainAnalysis'
import {
  Activity, AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  ClipboardList, Clock3, CloudRain, Compass, Database, Download, Flame, Layers3, LocateFixed, Map,
  Menu, Mountain, Pause, Play, RefreshCw, Satellite, Search, Wind, X,
} from 'lucide-react'

type Weather = {
  time: string
  temperature: number
  windSpeed: number
  windDirectionFrom: number
  gusts: number
  precipitation: number
  humidity: number
}

type ForecastHour = Weather
type FieldMobileTab = 'Map' | 'Updates' | 'Layers' | 'Report'
type LiveSensorKey = 'modis-terra' | 'modis-aqua' | 'noaa20' | 'noaa21'
type DataSourceId = 'firms' | 'wind' | 'terrain' | 'elevation' | 'archive'
type WindSample = { time: string; speedKmh: number | null; directionFrom: number | null }
type WindNode = { id: string; latitude: number; longitude: number; samples: WindSample[] }
type WindFieldState = { state: 'loading' | 'ready' | 'error'; nodes: WindNode[]; retrievedAt: string | null; error?: string }
type WindViewport = { centerLatitude: number; centerLongitude: number; zoom: number; width: number; height: number; west: number; east: number; south: number; north: number }
type MapSyncGroup = { maps: Set<MapLibreMap>; syncing: boolean }
type FireObservation = {
  id: string
  latitude: number
  longitude: number
  source: string
  satellite: string | null
  instrument: string | null
  acquiredAtUtc: string | null
  confidenceNative: string | null
  frpMw: number | null
  brightness4: number | null
  brightness5: number | null
  scanKm: number | null
  trackKm: number | null
  dayNight: string | null
  productVersion: string | null
}

const firmsSources = [
  { id: 'VIIRS_NOAA20_NRT', label: 'VIIRS · NOAA-20 · near real-time' },
  { id: 'VIIRS_NOAA21_NRT', label: 'VIIRS · NOAA-21 · near real-time' },
  { id: 'VIIRS_SNPP_NRT', label: 'VIIRS · Suomi-NPP · near real-time archive' },
  { id: 'MODIS_NRT', label: 'MODIS · near real-time' },
  { id: 'VIIRS_NOAA20_SP', label: 'VIIRS · NOAA-20 · standard processing' },
  { id: 'VIIRS_NOAA21_SP', label: 'VIIRS · NOAA-21 · standard processing' },
  { id: 'VIIRS_SNPP_SP', label: 'VIIRS · Suomi-NPP · standard archive' },
  { id: 'MODIS_SP', label: 'MODIS · standard processing' },
]

const liveSensorOptions: { key: LiveSensorKey; label: string; satellite: string; source: FirmsProduct; color: string }[] = [
  { key: 'modis-terra', label: 'MODIS · Terra', satellite: 'terra', source: 'MODIS_NRT', color: '#ff7b3d' },
  { key: 'modis-aqua', label: 'MODIS · Aqua', satellite: 'aqua', source: 'MODIS_NRT', color: '#ffb33f' },
  { key: 'noaa20', label: 'VIIRS · NOAA-20', satellite: 'noaa-20', source: 'VIIRS_NOAA20_NRT', color: '#28d3d1' },
  { key: 'noaa21', label: 'VIIRS · NOAA-21', satellite: 'noaa-21', source: 'VIIRS_NOAA21_NRT', color: '#7cbbff' },
]

type FirmsCoverage = { product: string; minDate: string; maxDate: string }
type FirmsCoverageState = { status: 'idle' | 'loading' | 'ready' | 'error' | 'key-missing'; products: FirmsCoverage[]; fetchedAtUtc: string | null; message: string }
type FirmsArchive = { importId: string; product: string; sourceFile: string; sourceRetrievedAtUtc: string | null; minDateUtc: string; maxDateUtc: string; rowsRead: number; rowsAccepted: number; rowsRejected: number; rowsDuplicate: number; sourceSha256: string; qaStatus: string; warnings: string[] }
type FirmsArchiveState = { status: 'idle' | 'loading' | 'ready' | 'error'; archives: FirmsArchive[]; invalidManifestCount: number; truncated: boolean; message: string }
type FirmsLocalImport = { importId: string; product: string; sourceFile: string; sourceUrl: string | null; sourceRetrievedAtUtc: string | null; observedStartDate: string; observedEndDate: string; rowsAccepted: number; rowsRejected: number; rowsDuplicate: number; sourceSha256: string }
type FirmsDateRange = { minDate: string; maxDate: string }
const publicNrtProducts = new Set(['MODIS_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'])

function firmsAccessLabel(accessMode: string | null) {
  if (accessMode === 'public-nrt-canada-csv') return 'public Canada NRT feed · latest 7 days'
  if (accessMode === 'map-key-area-api') return 'NASA FIRMS area API · server key'
  if (accessMode === 'local-validated-archive') return 'QA-accepted local archive · coverage unknown'
  return 'access method unavailable'
}

type CsvValue = string | number | null

function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]) {
  if (rows.length === 0) return
  const escapeCell = (value: CsvValue) => {
    const cell = value === null ? '' : String(value)
    const safeCell = typeof value === 'string' && /^[=+@\-\t\r]/.test(cell) ? `'${cell}` : cell
    return `"${safeCell.replaceAll('"', '""')}"`
  }
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function useFirmsCoverage(enabled: boolean) {
  const [coverage, setCoverage] = useState<FirmsCoverageState>({ status: 'idle', products: [], fetchedAtUtc: null, message: '' })
  const controllerRef = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setCoverage((current) => ({ ...current, status: 'loading', message: '' }))
    try {
      const response = await fetch('/api/firms/availability', { signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) {
        setCoverage((current) => ({ ...current, status: payload.code === 'firms_key_missing' ? 'key-missing' : 'error', message: payload.message || 'NASA FIRMS coverage could not be loaded.' }))
        return
      }
      setCoverage({ status: 'ready', products: Array.isArray(payload.products) ? payload.products : [], fetchedAtUtc: payload.fetchedAtUtc ?? null, message: '' })
    } catch (error) {
      if (controller.signal.aborted) return
      setCoverage((current) => ({ ...current, status: 'error', message: error instanceof Error ? error.message : 'NASA FIRMS coverage could not be loaded.' }))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])
  useEffect(() => {
    if (enabled && coverage.status === 'idle') void load()
  }, [coverage.status, enabled, load])
  useEffect(() => () => controllerRef.current?.abort(), [])
  return { ...coverage, load }
}

function useFirmsArchiveCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<FirmsArchiveState>({ status: 'idle', archives: [], invalidManifestCount: 0, truncated: false, message: '' })
  const controllerRef = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setCatalog((current) => ({ ...current, status: 'loading', message: '' }))
    try {
      const response = await fetch('/api/firms/archive-catalog', { signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'The local archive catalog could not be loaded.')
      setCatalog({ status: 'ready', archives: Array.isArray(payload.archives) ? payload.archives : [], invalidManifestCount: Number(payload.invalidManifestCount) || 0, truncated: Boolean(payload.truncated), message: '' })
    } catch (error) {
      if (controller.signal.aborted) return
      setCatalog((current) => ({ ...current, status: 'error', message: error instanceof Error ? error.message : 'The local archive catalog could not be loaded.' }))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [])
  useEffect(() => {
    if (enabled && catalog.status === 'idle') void load()
  }, [catalog.status, enabled, load])
  useEffect(() => () => controllerRef.current?.abort(), [])
  return { ...catalog, load }
}

function useFirms(lat: number, lon: number, source: string, days: number, selectedEndDate: string | null = null) {
  const [observations, setObservations] = useState<FireObservation[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [queryRange, setQueryRange] = useState<{ start: string; end: string } | null>(null)
  const [sourceDateRange, setSourceDateRange] = useState<FirmsDateRange | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [publicNrtSupported, setPublicNrtSupported] = useState(false)
  const [accessMode, setAccessMode] = useState<'public-nrt-canada-csv' | 'map-key-area-api' | 'local-validated-archive' | null>(null)
  const [archiveImports, setArchiveImports] = useState<FirmsLocalImport[]>([])
  const requestController = useRef<AbortController | null>(null)
  const publicFeedAvailable = publicNrtSupported && publicNrtProducts.has(source)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal }).then((response) => response.json()).then((payload) => { setConfigured(Boolean(payload.firmsConfigured)); setPublicNrtSupported(Boolean(payload.publicNrtSupported)) }).catch(() => { setConfigured(false); setPublicNrtSupported(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    requestController.current?.abort()
    setState('idle'); setMessage(''); setObservations([]); setFetchedAt(null); setQueryRange(null); setSourceDateRange(null); setAccessMode(null); setArchiveImports([])
    return () => requestController.current?.abort()
  }, [lat, lon, source, days])

  async function load(endDate: string | null = selectedEndDate) {
    const west = Math.max(-180, lon - 2.1)
    const east = Math.min(180, lon + 2.1)
    const south = Math.max(-90, lat - 1.4)
    const north = Math.min(90, lat + 1.4)
    const params = new URLSearchParams({ source, bbox: [west, south, east, north].join(','), days: String(days) })
    if (endDate) params.set('date', shiftUtcDay(endDate, 1 - days))
    const windowEnd = endDate ?? new Date().toISOString().slice(0, 10)
    setQueryRange({ start: shiftUtcDay(windowEnd, 1 - days), end: windowEnd })
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setState('loading'); setMessage(''); setSourceDateRange(null); setAccessMode(null); setArchiveImports([])
    try {
      const response = await fetch(`/api/firms?${params}`, { signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'FIRMS observations could not be loaded.')
      setObservations(Array.isArray(payload.observations) ? payload.observations : [])
      setFetchedAt(payload.fetchedAtUtc || null)
      const nextAccessMode = payload.accessMode === 'public-nrt-canada-csv' || payload.accessMode === 'map-key-area-api' || payload.accessMode === 'local-validated-archive' ? payload.accessMode : null
      setAccessMode(nextAccessMode)
      const importedSources = Array.isArray(payload.imports) ? payload.imports as FirmsLocalImport[] : []
      setArchiveImports(importedSources)
      setQueryRange(typeof payload.queryStartDate === 'string' && typeof payload.queryEndDate === 'string'
        ? { start: payload.queryStartDate, end: payload.queryEndDate }
        : null)
      const sourceRange = payload.sourceDateRange
      const nextSourceDateRange = sourceRange && typeof sourceRange.minDate === 'string' && typeof sourceRange.maxDate === 'string'
        ? { minDate: sourceRange.minDate, maxDate: sourceRange.maxDate }
        : null
      setSourceDateRange(nextSourceDateRange)
      const count = Number.isSafeInteger(payload.count) && payload.count >= 0 ? payload.count : (Array.isArray(payload.observations) ? payload.observations.length : 0)
      const sourceWindowIncomplete = nextAccessMode === 'public-nrt-canada-csv' && nextSourceDateRange && typeof payload.queryStartDate === 'string' && typeof payload.queryEndDate === 'string'
        && (nextSourceDateRange.minDate > payload.queryStartDate || nextSourceDateRange.maxDate < payload.queryEndDate)
      setMessage(nextAccessMode === 'local-validated-archive'
        ? count === 0 ? 'The accepted local import returned no detection rows for this area and time window. Coverage is unknown; this does not establish that no fire is present.' : `${count.toLocaleString()} rows returned from ${importedSources.length} QA-accepted local import(s). Observation coverage remains unknown.`
        : sourceWindowIncomplete ? `Public FIRMS is available from ${nextSourceDateRange.minDate} through ${nextSourceDateRange.maxDate}; requested dates outside that window have unknown status.`
          : count === 0 ? 'NASA returned a valid response with no detections in this area and time window. This does not establish that no fire is present.' : `${count.toLocaleString()} satellite detections returned for the selected product and window.`)
      setState('ready')
    } catch (error) {
      if (controller.signal.aborted) return
      setState('error')
      setMessage(error instanceof Error ? error.message : 'FIRMS observations could not be loaded.')
    } finally {
      if (requestController.current === controller) requestController.current = null
    }
  }

  return { source, days, observations, state, message, fetchedAt, queryRange, sourceDateRange, configured, publicNrtSupported, publicFeedAvailable, accessMode, archiveImports, load }
}

const navItems = [
  { label: 'Dashboard', icon: Activity },
  { label: 'Live Map', icon: Map },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Compare', icon: Layers3 },
  { label: 'Terrain', icon: Mountain },
  { label: 'Data & Sources', icon: Database },
  { label: 'Scenario', icon: Flame },
  { label: 'Field Situation', icon: Compass },
]

function windDirectionLabel(degrees: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]
}

function toWindDirection(degreesFrom: number) {
  return (degreesFrom + 180) % 360
}

function nativeConfidenceBucket(value: string | null) {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return 'unknown'
  if (normalized === 'low') return 'low'
  if (normalized === 'nominal' || normalized === 'medium') return 'nominal'
  if (normalized === 'high') return 'high'
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) return 'unknown'
  return numeric < 30 ? 'low' : numeric < 80 ? 'nominal' : 'high'
}

function observationDayNight(value: string | null) {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'd' || normalized === 'day') return 'day'
  if (normalized === 'n' || normalized === 'night') return 'night'
  return 'unknown'
}

function matchesLiveSensor(observation: FireObservation, sensor: typeof liveSensorOptions[number]) {
  const satellite = observation.satellite?.trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-') ?? ''
  if (sensor.key === 'modis-terra') return observation.source === 'MODIS_NRT' && (satellite === 't' || satellite.includes('terra'))
  if (sensor.key === 'modis-aqua') return observation.source === 'MODIS_NRT' && (satellite === 'a' || satellite.includes('aqua'))
  if (sensor.key === 'noaa20') return observation.source === 'VIIRS_NOAA20_NRT' && (!satellite || satellite.includes('noaa-20') || satellite.includes('20'))
  return observation.source === 'VIIRS_NOAA21_NRT' && (!satellite || satellite.includes('noaa-21') || satellite.includes('21'))
}

type MapPoint = { name: string; lat: number; lon: number }

function normalizeUtcTimestamp(value: string) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
}

function useWeather(lat: number, lon: number) {
  const [hours, setHours] = useState<ForecastHour[]>([])
  const [retrievedAt, setRetrievedAt] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lon),
      current: 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m',
      hourly: 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m',
      wind_speed_unit: 'kmh', timezone: 'UTC', forecast_days: '7', past_days: '1',
    })
    setState('loading')
    setHours([])
    setRetrievedAt(null)
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Weather service returned ${response.status}`)
        return response.json()
      })
      .then((payload) => {
        const hourly = payload.hourly
        const fields = ['time', 'temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'precipitation', 'relative_humidity_2m'] as const
        if (!hourly || fields.some((field) => !Array.isArray(hourly[field]))) throw new Error('Hourly weather data is not available')
        const sampleCount = hourly.time.length
        if (fields.some((field) => hourly[field].length !== sampleCount)) throw new Error('Hourly weather variables have inconsistent time ranges')
        const loaded: ForecastHour[] = hourly.time.map((time: string, index: number) => ({
          time: normalizeUtcTimestamp(time),
          temperature: hourly.temperature_2m[index],
          windSpeed: hourly.wind_speed_10m[index],
          windDirectionFrom: hourly.wind_direction_10m[index],
          gusts: hourly.wind_gusts_10m[index],
          precipitation: hourly.precipitation[index],
          humidity: hourly.relative_humidity_2m[index],
        })).filter((hour: ForecastHour) => typeof hour.time === 'string' && Number.isFinite(Date.parse(hour.time)) && [hour.temperature, hour.windSpeed, hour.windDirectionFrom, hour.gusts, hour.precipitation, hour.humidity].every(Number.isFinite))
        if (!loaded.length) throw new Error('Hourly weather data is empty')
        setHours(loaded)
        setRetrievedAt(new Date().toISOString())
        setState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setState('error')
      })
    return () => controller.abort()
  }, [lat, lon, retry])

  return { hours, retrievedAt, state, retry: () => setRetry((value) => value + 1) }
}

function normalizeLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180
}

function unwrapLongitude(longitude: number, reference: number) {
  const normalized = normalizeLongitude(longitude)
  return normalized + 360 * Math.round((reference - normalized) / 360)
}

function createWindGrid(lat: number, lon: number, viewport: WindViewport | null) {
  const centerLatitude = viewport?.centerLatitude ?? lat
  const centerLongitude = viewport?.centerLongitude ?? lon
  const maxMercatorLatitude = 85.05112878
  const south = viewport?.south ?? centerLatitude - 0.65
  const north = viewport?.north ?? centerLatitude + 0.65
  let west = viewport?.west ?? centerLongitude - 0.8
  let east = viewport?.east ?? centerLongitude + 0.8
  const rawLongitudeSpan = Math.max(0.05, east - west)
  const longitudeSpan = Math.min(360, rawLongitudeSpan * 1.08)
  const latitudeSpan = Math.min(2 * maxMercatorLatitude, Math.max(0.05, north - south) * 1.08)
  const middleLongitude = (west + east) / 2
  const middleLatitude = (south + north) / 2
  west = middleLongitude - longitudeSpan / 2
  const gridSouth = Math.max(-maxMercatorLatitude, middleLatitude - latitudeSpan / 2)
  const gridNorth = Math.min(maxMercatorLatitude, middleLatitude + latitudeSpan / 2)
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) => ({
    latitude: gridSouth + (row / 4) * (gridNorth - gridSouth),
    // Keep a continuous longitude for map rendering; normalize only for the API request.
    longitude: west + (column / 4) * longitudeSpan,
  }))).flat()
}

function cameraWindViewport(instance: MapLibreMap): WindViewport {
  const center = instance.getCenter()
  const canvas = instance.getCanvas()
  const width = Math.max(1, canvas.clientWidth)
  const height = Math.max(1, canvas.clientHeight)
  const edgeSamples: [number, number][] = [
    [0, 0], [width / 2, 0], [width, 0],
    [width, height / 2], [width, height], [width / 2, height],
    [0, height], [0, height / 2], [width / 2, height / 2],
  ]
  const visible = edgeSamples.map(([x, y]) => instance.unproject([x, y]))
  const longitudes = visible.map((point) => unwrapLongitude(point.lng, center.lng))
  const latitudes = visible.map((point) => point.lat)
  const maxMercatorLatitude = 85.05112878
  return {
    centerLatitude: center.lat,
    centerLongitude: center.lng,
    zoom: instance.getZoom(),
    width,
    height,
    west: Math.min(...longitudes),
    east: Math.max(...longitudes),
    south: Math.max(-maxMercatorLatitude, Math.min(...latitudes)),
    north: Math.min(maxMercatorLatitude, Math.max(...latitudes)),
  }
}

function parseWindGridResponse(payload: unknown, coordinates: Array<{ latitude: number; longitude: number }>): WindNode[] {
  const records = (Array.isArray(payload) ? payload : [payload]) as Array<{
    latitude?: unknown
    longitude?: unknown
    hourly?: { time?: unknown; wind_speed_10m?: unknown; wind_direction_10m?: unknown }
  }>
  if (records.length !== coordinates.length) throw new Error('Wind grid response did not include every requested point')
  const referenceTimes: string[] = []
  const nodes = records.map((record, index): WindNode => {
    if (!record || typeof record !== 'object') throw new Error('Wind grid response contains an invalid map point')
    const hourly = record.hourly
    if (!Array.isArray(hourly?.time) || !Array.isArray(hourly.wind_speed_10m) || !Array.isArray(hourly.wind_direction_10m)) {
      throw new Error('Wind grid response is missing hourly speed, direction, or time data')
    }
    if (hourly.time.length === 0 || hourly.wind_speed_10m.length !== hourly.time.length || hourly.wind_direction_10m.length !== hourly.time.length) {
      throw new Error('Wind grid hourly series have different lengths')
    }
    const times = hourly.time.map((time) => {
      if (typeof time !== 'string') throw new Error('Wind grid contains an invalid forecast time')
      const normalized = normalizeUtcTimestamp(time)
      if (!Number.isFinite(Date.parse(normalized))) throw new Error('Wind grid contains an invalid forecast time')
      return normalized
    })
    if (times.some((time, timeIndex) => timeIndex > 0 && Date.parse(time) <= Date.parse(times[timeIndex - 1]))) {
      throw new Error('Wind grid forecast times are not in strictly increasing order')
    }
    if (index === 0) referenceTimes.push(...times)
    else if (times.length !== referenceTimes.length || times.some((time, timeIndex) => Date.parse(time) !== Date.parse(referenceTimes[timeIndex]))) {
      throw new Error('Wind grid forecast times do not align across map points')
    }
    const requestedPoint = coordinates[index]
    const latitude = record.latitude === undefined ? requestedPoint.latitude : record.latitude
    const longitude = record.longitude === undefined ? requestedPoint.longitude : record.longitude
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('Wind grid response contains invalid coordinates')
    }
    const speedValues = hourly.wind_speed_10m
    const directionValues = hourly.wind_direction_10m
    const samples = times.map((time, timeIndex) => {
      const speed = speedValues[timeIndex]
      const direction = directionValues[timeIndex]
      if (speed !== null && (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0)) {
        throw new Error('Wind grid contains a speed outside its valid range')
      }
      if (direction !== null && (typeof direction !== 'number' || !Number.isFinite(direction) || direction < 0 || direction > 360)) {
        throw new Error('Wind grid contains a direction outside 0–360°')
      }
      return {
        time,
        speedKmh: typeof speed === 'number' ? speed : null,
        directionFrom: typeof direction === 'number' ? direction : null,
      }
    })
    return {
      id: `wind-${requestedPoint.latitude.toFixed(3)}-${requestedPoint.longitude.toFixed(3)}`,
      latitude,
      longitude: unwrapLongitude(longitude, requestedPoint.longitude),
      samples,
    }
  })
  const insufficientHours = referenceTimes.some((_, timeIndex) => nodes.filter((node) => {
    const sample = node.samples[timeIndex]
    return sample.speedKmh !== null && (sample.directionFrom !== null || sample.speedKmh === 0)
  }).length < 9)
  if (insufficientHours) {
    throw new Error('Wind grid has fewer than nine usable points for at least one forecast hour')
  }
  return nodes
}

function useWindField(lat: number, lon: number, viewport: WindViewport | null) {
  const [field, setField] = useState<WindFieldState>({ state: 'loading', nodes: [], retrievedAt: null })
  const [retry, setRetry] = useState(0)
  const gridSignature = viewport
    ? [viewport.south, viewport.west, viewport.north, viewport.east].map((value) => Math.round(value * 4) / 4).join(',')
    : `${Math.round(lat * 10) / 10},${Math.round(lon * 10) / 10}`

  useEffect(() => {
    const controller = new AbortController()
    setField((current) => current.state === 'loading' ? current : { ...current, state: 'loading', error: undefined })
    const timeout = window.setTimeout(() => {
      const coordinates = createWindGrid(lat, lon, viewport)
      const params = new URLSearchParams({
        latitude: coordinates.map((point) => point.latitude.toFixed(3)).join(','),
        longitude: coordinates.map((point) => normalizeLongitude(point.longitude).toFixed(3)).join(','),
        hourly: 'wind_speed_10m,wind_direction_10m',
        wind_speed_unit: 'kmh', timezone: 'UTC', forecast_days: '7', past_days: '1',
      })
      setField((current) => ({ ...current, state: 'loading', error: undefined }))
      fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Wind grid service returned ${response.status}`)
          return response.json()
        })
        .then((payload: unknown) => {
          const nodes = parseWindGridResponse(payload, coordinates)
          setField({ state: 'ready', nodes, retrievedAt: new Date().toISOString() })
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return
          setField((current) => ({ ...current, state: 'error', error: error instanceof Error ? error.message : 'Wind field unavailable' }))
        })
    }, 700)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [gridSignature, retry])

  return { ...field, retry: () => setRetry((value) => value + 1) }
}

type WindVector = { latitude: number; longitude: number; eastKmh: number; northKmh: number; speedKmh: number; directionTo: number }

function windVectorsAt(nodes: WindNode[], time?: string): WindVector[] {
  if (!time) return []
  return nodes.flatMap((node) => {
    const sample = node.samples.find((hour) => hour.time === time)
    if (!sample || sample.speedKmh === null || sample.directionFrom === null && sample.speedKmh > 0) return []
    const directionTo = toWindDirection(sample.directionFrom ?? 0)
    const radians = directionTo * Math.PI / 180
    return [{
      latitude: node.latitude,
      longitude: node.longitude,
      speedKmh: sample.speedKmh,
      directionTo,
      eastKmh: sample.speedKmh * Math.sin(radians),
      northKmh: sample.speedKmh * Math.cos(radians),
    }]
  })
}

function interpolateWind(vectors: WindVector[], latitude: number, longitude: number): WindVector | null {
  if (!vectors.length) return null
  const latitudeScale = Math.cos(latitude * Math.PI / 180)
  const nearest = vectors.map((vector) => {
    const dx = (vector.longitude - longitude) * latitudeScale
    const dy = vector.latitude - latitude
    return { vector, distanceSquared: dx * dx + dy * dy }
  }).sort((a, b) => a.distanceSquared - b.distanceSquared).slice(0, 4)
  if (nearest[0].distanceSquared < 1e-8) return nearest[0].vector
  let eastKmh = 0
  let northKmh = 0
  let totalWeight = 0
  for (const { vector, distanceSquared } of nearest) {
    const weight = 1 / Math.max(distanceSquared, 1e-5)
    eastKmh += vector.eastKmh * weight
    northKmh += vector.northKmh * weight
    totalWeight += weight
  }
  eastKmh /= totalWeight
  northKmh /= totalWeight
  const speedKmh = Math.hypot(eastKmh, northKmh)
  return { latitude, longitude, eastKmh, northKmh, speedKmh, directionTo: (Math.atan2(eastKmh, northKmh) * 180 / Math.PI + 360) % 360 }
}

function projectWindHeading(instance: MapLibreMap, longitude: number, latitude: number, vector: WindVector): [number, number] | null {
  if (vector.speedKmh < 0.001) return null
  const earthRadiusMeters = 6_378_137
  const radians = Math.PI / 180
  const probeMeters = 100
  const latitudeRadians = latitude * radians
  const longitudeMetersPerDegree = earthRadiusMeters * Math.max(0.05, Math.cos(latitudeRadians)) * radians
  const latitudeDelta = probeMeters / earthRadiusMeters / radians
  const longitudeDelta = probeMeters / longitudeMetersPerDegree
  const origin = instance.project([longitude, latitude])
  const east = instance.project([longitude + longitudeDelta, latitude])
  const north = instance.project([longitude, latitude + latitudeDelta])
  const eastShare = vector.eastKmh / vector.speedKmh
  const northShare = vector.northKmh / vector.speedKmh
  const screenEast = east.x - origin.x
  const screenNorth = north.x - origin.x
  const screenEastY = east.y - origin.y
  const screenNorthY = north.y - origin.y
  const projectedX = screenEast * eastShare + screenNorth * northShare
  const projectedY = screenEastY * eastShare + screenNorthY * northShare
  const magnitude = Math.hypot(projectedX, projectedY)
  return magnitude > 1e-7 ? [projectedX / magnitude, projectedY / magnitude] : null
}

function createWindArrow(): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = 64; canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return new ImageData(64, 64)
  context.lineCap = 'round'; context.lineJoin = 'round'
  context.shadowColor = '#54e6e4'; context.shadowBlur = 9
  context.strokeStyle = '#b4ffff'; context.lineWidth = 4
  context.beginPath(); context.moveTo(32, 56); context.lineTo(32, 14); context.stroke()
  context.fillStyle = '#b4ffff'; context.beginPath(); context.moveTo(32, 5); context.lineTo(20, 23); context.lineTo(32, 19); context.lineTo(44, 23); context.closePath(); context.fill()
  context.shadowBlur = 0; context.strokeStyle = '#38cbd3'; context.lineWidth = 2
  context.beginPath(); context.moveTo(22, 47); context.lineTo(32, 41); context.lineTo(42, 47); context.stroke()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function createTerrainEndpointMarker(letter: 'A' | 'B'): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = 48; canvas.height = 48
  const context = canvas.getContext('2d')
  if (!context) return new ImageData(48, 48)
  const accent = letter === 'A' ? '#58f1e8' : '#f4b12f'
  context.shadowColor = accent; context.shadowBlur = 12
  context.fillStyle = '#0a202a'; context.strokeStyle = accent; context.lineWidth = 3
  context.beginPath(); context.arc(24, 24, 17, 0, Math.PI * 2); context.fill(); context.stroke()
  context.shadowBlur = 0; context.fillStyle = '#f3ffff'; context.font = '700 19px sans-serif'
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(letter, 24, 24)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function windSpeedColor(speedKmh: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0, 76, 137, 151], [10, 42, 145, 170], [20, 44, 173, 195], [35, 174, 205, 159],
    [50, 246, 202, 69], [70, 244, 139, 47], [100, 224, 70, 58], [150, 207, 82, 168], [200, 22, 59, 72],
  ]
  const value = Math.max(0, Math.min(200, speedKmh))
  const upperIndex = stops.findIndex(([stop]) => stop >= value)
  if (upperIndex <= 0) return stops[0].slice(1) as [number, number, number]
  const lower = stops[upperIndex - 1]
  const upper = stops[upperIndex]
  const mix = (value - lower[0]) / (upper[0] - lower[0])
  return [1, 2, 3].map((channel) => Math.round(lower[channel] + (upper[channel] - lower[channel]) * mix)) as [number, number, number]
}

function createWindSpeedImage(vectors: WindVector[]) {
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d')
  if (!context || !vectors.length) return null
  const bounds = {
    west: Math.min(...vectors.map((vector) => vector.longitude)), east: Math.max(...vectors.map((vector) => vector.longitude)),
    south: Math.min(...vectors.map((vector) => vector.latitude)), north: Math.max(...vectors.map((vector) => vector.latitude)),
  }
  const image = context.createImageData(size, size)
  for (let y = 0; y < size; y += 1) {
    const latitude = bounds.north - (y / (size - 1)) * (bounds.north - bounds.south)
    for (let x = 0; x < size; x += 1) {
      const longitude = bounds.west + (x / (size - 1)) * (bounds.east - bounds.west)
      const vector = interpolateWind(vectors, latitude, longitude)
      if (!vector) continue
      const [red, green, blue] = windSpeedColor(vector.speedKmh)
      const offset = (y * size + x) * 4
      image.data[offset] = red; image.data[offset + 1] = green; image.data[offset + 2] = blue
      const edge = Math.min(1, x / 12, y / 12, (size - 1 - x) / 12, (size - 1 - y) / 12)
      const feather = edge * edge * (3 - 2 * edge)
      image.data[offset + 3] = Math.round(232 * Math.min(1, 0.62 + vector.speedKmh / 175) * feather)
    }
  }
  context.putImageData(image, 0, 0)
  return {
    url: canvas.toDataURL('image/png'),
    coordinates: [
      [bounds.west, bounds.north], [bounds.east, bounds.north],
      [bounds.east, bounds.south], [bounds.west, bounds.south],
    ] as [[number, number], [number, number], [number, number], [number, number]],
  }
}

function ensureWindSpeedLayer(instance: MapLibreMap, vectors: WindVector[]) {
  const image = createWindSpeedImage(vectors)
  if (!image) return
  const source = instance.getSource('wind-speed-raster') as ImageSource | undefined
  if (source) source.updateImage(image)
  else {
    instance.addSource('wind-speed-raster', { type: 'image', ...image })
    instance.addLayer({
      id: 'wind-speed-raster', type: 'raster', source: 'wind-speed-raster',
      paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 180, 'raster-resampling': 'linear' },
    }, 'wind-vector-arrows')
  }
}

function ensureWindLayers(instance: MapLibreMap) {
  if (!instance.hasImage('wind-vector-arrow')) instance.addImage('wind-vector-arrow', createWindArrow(), { pixelRatio: 2 })
  const empty = { type: 'FeatureCollection' as const, features: [] }
  if (!instance.getSource('wind-vector-grid')) instance.addSource('wind-vector-grid', { type: 'geojson', data: empty })
  if (!instance.getLayer('wind-vector-arrows')) instance.addLayer({
    id: 'wind-vector-arrows', type: 'symbol', source: 'wind-vector-grid',
    layout: {
      'icon-image': 'wind-vector-arrow',
      'icon-size': ['interpolate', ['linear'], ['get', 'speedKmh'], 0, 0.58, 20, 0.8, 60, 1.05],
      'icon-rotate': ['get', 'directionTo'],
      'icon-rotation-alignment': 'map',
      'symbol-height-offset': 12,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.92 },
  })
}

function whenMapStyleReady(instance: MapLibreMap, callback: () => void) {
  if (instance.getLayer('osm-raster-base')) {
    callback()
    return () => {}
  }
  const onStyleLoad = () => callback()
  instance.once('style.load', onStyleLoad)
  return () => instance.off('style.load', onStyleLoad)
}

function MapCanvas({ lat, lon, windDirection, observations, windNodes, windTime, windState, onRetryWind, windVisible, terrainEnabled, onSelectPoint, onSelectObservation, onCameraChange, syncGroup, terrainTransect, terrainTransectSelecting = false, onTerrainTransectPoint }: { lat: number; lon: number; windDirection?: number; observations: FireObservation[]; windNodes: WindNode[]; windTime?: string; windState: WindFieldState['state']; onRetryWind: () => void; windVisible: boolean; terrainEnabled: boolean; onSelectPoint: (point: MapPoint) => void; onSelectObservation: (observation: FireObservation | null) => void; onCameraChange: (viewport: WindViewport) => void; syncGroup?: MapSyncGroup; terrainTransect?: [number, number][]; terrainTransectSelecting?: boolean; onTerrainTransectPoint?: (point: [number, number]) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const windFlowCanvas = useRef<HTMLCanvasElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [windCanvasSize, setWindCanvasSize] = useState({ width: 0, height: 0 })
  const selectPoint = useRef(onSelectPoint)
  const selectObservation = useRef(onSelectObservation)
  const reportCamera = useRef(onCameraChange)
  const selectTerrainTransectPoint = useRef(onTerrainTransectPoint)
  const selectingTerrainTransect = useRef(terrainTransectSelecting)
  const observationsRef = useRef(observations)
  const windNodesRef = useRef(windNodes)
  const windTimeRef = useRef(windTime)
  useEffect(() => { selectPoint.current = onSelectPoint }, [onSelectPoint])
  useEffect(() => { selectObservation.current = onSelectObservation }, [onSelectObservation])
  useEffect(() => { reportCamera.current = onCameraChange }, [onCameraChange])
  useEffect(() => { selectTerrainTransectPoint.current = onTerrainTransectPoint; selectingTerrainTransect.current = terrainTransectSelecting }, [onTerrainTransectPoint, terrainTransectSelecting])
  useEffect(() => { observationsRef.current = observations }, [observations])
  useEffect(() => { windNodesRef.current = windNodes; windTimeRef.current = windTime }, [windNodes, windTime])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => setReducedMotion(preference.matches)
    syncPreference()
    preference.addEventListener('change', syncPreference)
    return () => preference.removeEventListener('change', syncPreference)
  }, [])

  useEffect(() => {
    if (!element.current || map.current) return
    map.current = new maplibregl.Map({
      container: element.current,
      style: {
        version: 8,
        sources: {
          osmRaster: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.de/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          },
          albertaDem: {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: '&copy; Mapzen Terrain Tiles · Canada: Open Government Licence',
          },
        },
        layers: [{
          id: 'osm-raster-base', type: 'raster', source: 'osmRaster', minzoom: 0, maxzoom: 19,
          paint: {
            'raster-brightness-min': 0.18,
            'raster-brightness-max': 0.92,
            'raster-saturation': -0.24,
            'raster-contrast': 0.08,
            'raster-fade-duration': 180,
          },
        }],
      },
      center: [lon, lat],
      zoom: 6.2,
      pitch: terrainEnabled ? 40 : 0,
      bearing: -12,
      maxPitch: 60,
      attributionControl: false,
    })
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    const emitCameraBounds = () => {
      const current = map.current
      if (!current) return
      reportCamera.current(cameraWindViewport(current))
    }
    map.current.on('moveend', emitCameraBounds)
    map.current.on('resize', emitCameraBounds)
    map.current.once('style.load', emitCameraBounds)
    map.current.on('style.load', () => {
      map.current?.setTerrain(terrainEnabled ? { source: 'albertaDem', exaggeration: 1.2 } : null)
      map.current?.addLayer({
        id: 'alberta-hillshade', type: 'hillshade', source: 'albertaDem',
        paint: { 'hillshade-exaggeration': 0.32, 'hillshade-shadow-color': '#091a25', 'hillshade-highlight-color': '#a3c9be' },
      })
      if (windNodesRef.current.length) ensureWindLayers(map.current!)
      map.current?.addSource('terrain-transect', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.current?.addLayer({ id: 'terrain-transect-line', type: 'line', source: 'terrain-transect', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#34e5e4', 'line-width': 2.5, 'line-dasharray': [2, 1.2], 'line-opacity': 0.95 } })
      map.current?.addLayer({ id: 'terrain-transect-points', type: 'circle', source: 'terrain-transect', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 8, 'circle-color': '#0b2029', 'circle-stroke-color': '#4ef0eb', 'circle-stroke-width': 2 } })
      if (!map.current?.hasImage('terrain-endpoint-a')) map.current?.addImage('terrain-endpoint-a', createTerrainEndpointMarker('A'), { pixelRatio: 2 })
      if (!map.current?.hasImage('terrain-endpoint-b')) map.current?.addImage('terrain-endpoint-b', createTerrainEndpointMarker('B'), { pixelRatio: 2 })
      if (!map.current?.getLayer('terrain-transect-labels')) map.current?.addLayer({
        id: 'terrain-transect-labels', type: 'symbol', source: 'terrain-transect', filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'icon-image': ['match', ['get', 'endpoint'], 'A', 'terrain-endpoint-a', 'terrain-endpoint-b'], 'icon-size': 0.72, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center' },
      })
    })
    map.current.getCanvas().style.cursor = 'crosshair'
    map.current.on('click', (event) => {
      if (selectingTerrainTransect.current) {
        selectTerrainTransectPoint.current?.([event.lngLat.lng, event.lngLat.lat])
        return
      }
      const clusterFeature = map.current?.queryRenderedFeatures(event.point, { layers: ['firms-clusters'] })[0]
      const clusterId = Number(clusterFeature?.properties?.cluster_id)
      if (Number.isInteger(clusterId)) {
        const source = map.current?.getSource('firms-hotspots') as GeoJSONSource | undefined
        source?.getClusterExpansionZoom(clusterId).then((zoom) => {
          if (!map.current) return
          const coordinates = (clusterFeature?.geometry as GeoJSON.Point | undefined)?.coordinates
          if (coordinates) map.current.easeTo({ center: coordinates as [number, number], zoom: Math.min(zoom, 12), duration: 450 })
        }).catch(() => undefined)
        return
      }
      const pointFeature = map.current?.queryRenderedFeatures(event.point, { layers: ['firms-hotspots'] })[0]
      const observationIndex = Number(pointFeature?.properties?.observationIndex)
      if (Number.isInteger(observationIndex) && observationsRef.current[observationIndex]) {
        selectObservation.current(observationsRef.current[observationIndex])
        return
      }
      selectObservation.current(null)
      const { lat: pointLat, lng: pointLon } = event.lngLat
      const latLabel = `${Math.abs(pointLat).toFixed(3)}° ${pointLat >= 0 ? 'N' : 'S'}`
      const lonLabel = `${Math.abs(pointLon).toFixed(3)}° ${pointLon >= 0 ? 'E' : 'W'}`
      selectPoint.current({ name: `Map point · ${latLabel} ${lonLabel}`, lat: pointLat, lon: pointLon })
    })
    const syncCamera = () => {
      const current = map.current
      if (!current || !syncGroup || syncGroup.syncing) return
      syncGroup.syncing = true
      const camera = { center: current.getCenter(), zoom: current.getZoom(), bearing: current.getBearing(), pitch: current.getPitch() }
      for (const peer of syncGroup.maps) if (peer !== current) peer.jumpTo(camera)
      syncGroup.syncing = false
    }
    if (syncGroup) {
      syncGroup.maps.add(map.current)
      map.current.on('move', syncCamera)
    }
    return () => {
      if (map.current && syncGroup) { map.current.off('move', syncCamera); syncGroup.maps.delete(map.current) }
      map.current?.remove(); map.current = null
    }
  }, [syncGroup])

  useEffect(() => {
    const instance = map.current
    const container = element.current
    if (!instance || !container || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        instance.resize()
        const canvas = instance.getCanvas()
        setWindCanvasSize((current) => current.width === canvas.clientWidth && current.height === canvas.clientHeight ? current : { width: canvas.clientWidth, height: canvas.clientHeight })
        reportCamera.current(cameraWindViewport(instance))
      })
    })
    observer.observe(container)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => {
    if (!map.current) return
    const collection = {
      type: 'FeatureCollection' as const,
      features: observations.map((observation, observationIndex) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [observation.longitude, observation.latitude] },
        properties: { observationIndex, source: observation.source, frpMw: observation.frpMw },
      })),
    }
    const syncLayer = () => {
      const instance = map.current
      if (!instance) return
      const existing = instance.getSource('firms-hotspots') as GeoJSONSource | undefined
      if (existing) {
        existing.setData(collection as GeoJSON.FeatureCollection)
        return
      }
      instance.addSource('firms-hotspots', { type: 'geojson', data: collection, cluster: true, clusterRadius: 38, clusterMaxZoom: 9, clusterProperties: { maxFrp: ['max', ['coalesce', ['get', 'frpMw'], 0]] } })
      instance.addLayer({
        id: 'firms-clusters', type: 'circle', source: 'firms-hotspots', filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#f8ca53', 25, '#f59a3b', 100, '#f2683b'],
          'circle-radius': ['step', ['get', 'point_count'], 14, 25, 18, 100, 23],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#fff1c2',
          'circle-stroke-width': 1.5,
        },
      })
      instance.addLayer({
        id: 'firms-cluster-count', type: 'symbol', source: 'firms-hotspots', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 10, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#17202a', 'text-halo-color': '#fff2c4', 'text-halo-width': 0.5 },
      })
      instance.addLayer({
        id: 'firms-hotspots', type: 'circle', source: 'firms-hotspots', filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'frpMw'], 1], 0, 4, 10, 7, 100, 12],
          'circle-color': ['match', ['get', 'source'], 'MODIS_NRT', '#25d2d8', 'MODIS_SP', '#25d2d8', 'VIIRS_NOAA20_NRT', '#f4b12f', 'VIIRS_NOAA20_SP', '#f4b12f', 'VIIRS_NOAA21_NRT', '#f2683b', 'VIIRS_NOAA21_SP', '#f2683b', 'VIIRS_SNPP_NRT', '#a88bfa', 'VIIRS_SNPP_SP', '#a88bfa', '#f4b12f'],
          'circle-opacity': 0.88,
          'circle-stroke-color': '#08141d',
          'circle-stroke-width': 1.25,
        },
      })
    }
    return whenMapStyleReady(map.current, syncLayer)
  }, [observations])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const featureCollection: GeoJSON.FeatureCollection = terrainTransect?.length === 2 ? {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: terrainTransect }, properties: {} },
        ...terrainTransect.map((coordinates, index) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates }, properties: { endpoint: index === 0 ? 'A' : 'B' } })),
      ],
    } : { type: 'FeatureCollection', features: [] }
    const sync = () => {
      const source = instance.getSource('terrain-transect') as GeoJSONSource | undefined
      source?.setData(featureCollection)
    }
    return whenMapStyleReady(instance, sync)
  }, [terrainTransect])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const applyTerrain = () => {
      instance.setTerrain(terrainEnabled ? { source: 'albertaDem', exaggeration: 1.2 } : null)
      instance.easeTo({ pitch: terrainEnabled ? 40 : 0, duration: 900 })
    }
    return whenMapStyleReady(instance, applyTerrain)
  }, [terrainEnabled])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const vectors = windVectorsAt(windNodes, windTime)
    let timer: ReturnType<typeof setInterval> | null = null
    let removeLoadListener = () => {}
    let particles: Array<{ longitude: number; latitude: number; trail: Array<[number, number]>; speedKmh: number }> = []
    const overlay = windFlowCanvas.current
    const context = overlay?.getContext('2d') ?? null
    const clearTrails = () => {
      particles.forEach((particle) => { particle.trail = [] })
      if (overlay && context) context.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight)
    }
    const updateWind = () => {
      if (!instance.getStyle().layers.some((layer) => layer.id === 'osm-raster-base')) return
      if (!instance.getSource('albertaDem')) return
      ensureWindLayers(instance)
      if (vectors.length) ensureWindSpeedLayer(instance, vectors)
      const fieldReady = windState === 'ready' && vectors.length > 0
      const windRendered = windVisible && fieldReady
      if (instance.getLayer('osm-raster-base')) {
        instance.setPaintProperty('osm-raster-base', 'raster-brightness-min', windRendered ? 0.18 : 0.02)
        instance.setPaintProperty('osm-raster-base', 'raster-brightness-max', windRendered ? 0.92 : 0.24)
      }
      if (instance.getLayer('wind-speed-raster')) instance.setLayoutProperty('wind-speed-raster', 'visibility', windVisible && fieldReady ? 'visible' : 'none')
      if (instance.getLayer('wind-vector-arrows')) instance.setLayoutProperty('wind-vector-arrows', 'visibility', windVisible && fieldReady && reducedMotion ? 'visible' : 'none')
      if (!windVisible || !fieldReady) clearTrails()
      if (!windVisible || !fieldReady) {
        ;(instance.getSource('wind-vector-grid') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [] })
        return
      }
      const vectorSource = instance.getSource('wind-vector-grid') as GeoJSONSource
      const arrowFeatures = vectors.map((vector) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [vector.longitude, vector.latitude] },
        properties: { speedKmh: vector.speedKmh, directionTo: vector.directionTo },
      }))
      if (reducedMotion) {
        vectorSource.setData({ type: 'FeatureCollection', features: arrowFeatures } as GeoJSON.FeatureCollection)
        clearTrails()
        return
      }
      vectorSource.setData({ type: 'FeatureCollection', features: [] })
      if (!overlay || !context || document.visibilityState !== 'visible') { clearTrails(); return }
      const particleBounds = {
        west: Math.min(...vectors.map((vector) => vector.longitude)), east: Math.max(...vectors.map((vector) => vector.longitude)),
        south: Math.min(...vectors.map((vector) => vector.latitude)), north: Math.max(...vectors.map((vector) => vector.latitude)),
      }
      const canvas = instance.getCanvas()
      const canvasWidth = windCanvasSize.width || canvas.clientWidth
      const canvasHeight = windCanvasSize.height || canvas.clientHeight
      const canvasArea = canvasWidth * canvasHeight
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const backingWidth = Math.max(1, Math.round(canvasWidth * pixelRatio))
      const backingHeight = Math.max(1, Math.round(canvasHeight * pixelRatio))
      if (overlay.width !== backingWidth || overlay.height !== backingHeight) {
        overlay.width = backingWidth
        overlay.height = backingHeight
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, canvasWidth, canvasHeight)
      const particleCount = Math.min(320, Math.max(72, Math.round(canvasArea / 1800)))
      const animationInterval = Math.max(105, Math.min(135, Math.round(135 - canvasArea / 16_000)))
      particles = Array.from({ length: particleCount }, () => ({
        longitude: particleBounds.west + Math.random() * (particleBounds.east - particleBounds.west),
        latitude: particleBounds.south + Math.random() * (particleBounds.north - particleBounds.south),
        trail: [] as Array<[number, number]>, speedKmh: 0,
      }))
      let previousFrame = performance.now()
      timer = setInterval(() => {
        if (document.visibilityState !== 'visible') return
        if (instance.isMoving()) { previousFrame = performance.now(); clearTrails(); return }
        if (!windVisible || windState !== 'ready' || !vectors.length) { clearTrails(); return }
        const now = performance.now()
        const elapsedSeconds = Math.min((now - previousFrame) / 1000, 0.25)
        previousFrame = now
        context.clearRect(0, 0, canvasWidth, canvasHeight)
        for (const particle of particles) {
          const vector = interpolateWind(vectors, particle.latitude, particle.longitude)
          if (!vector || vector.speedKmh < 0.2) {
            particle.trail = []
            particle.longitude = particleBounds.west + Math.random() * (particleBounds.east - particleBounds.west)
            particle.latitude = particleBounds.south + Math.random() * (particleBounds.north - particleBounds.south)
            continue
          }
          const pixel = instance.project([particle.longitude, particle.latitude])
          const screenHeading = projectWindHeading(instance, particle.longitude, particle.latitude, vector)
          if (!screenHeading) { particle.trail = []; continue }
          const speedPixelsPerSecond = 42 + vector.speedKmh * 0.8
          const nextPixel = [
            pixel.x + screenHeading[0] * speedPixelsPerSecond * elapsedSeconds,
            pixel.y + screenHeading[1] * speedPixelsPerSecond * elapsedSeconds,
          ] as [number, number]
          const nextPoint = instance.unproject(nextPixel)
          particle.longitude = nextPoint.lng
          particle.latitude = nextPoint.lat
          particle.speedKmh = vector.speedKmh
          particle.trail.push([nextPixel[0], nextPixel[1]])
          if (particle.trail.length > 5) particle.trail.shift()
          if (particle.longitude < particleBounds.west || particle.longitude > particleBounds.east || particle.latitude < particleBounds.south || particle.latitude > particleBounds.north) {
            particle.trail = []
            particle.longitude = particleBounds.west + Math.random() * (particleBounds.east - particleBounds.west)
            particle.latitude = particleBounds.south + Math.random() * (particleBounds.north - particleBounds.south)
            continue
          }
          if (particle.trail.length < 2) continue
          context.beginPath()
          context.moveTo(particle.trail[0][0], particle.trail[0][1])
          for (let index = 1; index < particle.trail.length; index += 1) context.lineTo(particle.trail[index][0], particle.trail[index][1])
          context.lineCap = 'round'
          context.lineJoin = 'round'
          context.globalAlpha = 0.72
          context.strokeStyle = '#08242f'
          context.lineWidth = 3.2
          context.stroke()
          context.globalAlpha = 0.96
          context.strokeStyle = '#f7ffff'
          context.lineWidth = 1.25 + Math.min(vector.speedKmh / 70, 0.65)
          context.stroke()
          context.globalAlpha = 0.92
          context.fillStyle = '#ffffff'
          context.beginPath()
          context.arc(nextPixel[0], nextPixel[1], 1.25, 0, Math.PI * 2)
          context.fill()
        }
        context.globalAlpha = 1
      }, animationInterval)
    }
    instance.on('movestart', clearTrails)
    instance.on('rotatestart', clearTrails)
    instance.on('pitchstart', clearTrails)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (timer) clearInterval(timer)
        timer = null
        clearTrails()
      } else updateWind()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    removeLoadListener = whenMapStyleReady(instance, updateWind)
    return () => {
      if (timer) clearInterval(timer)
      instance.off('movestart', clearTrails)
      instance.off('rotatestart', clearTrails)
      instance.off('pitchstart', clearTrails)
      removeLoadListener()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearTrails()
    }
  }, [windNodes, windTime, windState, windVisible, reducedMotion, windCanvasSize.width, windCanvasSize.height])

  useEffect(() => {
    if (!map.current) return
    map.current.easeTo({ center: [lon, lat], duration: 900 })
  }, [lat, lon])

  const direction = windDirection === undefined ? undefined : toWindDirection(windDirection)
  const windVectors = windVectorsAt(windNodes, windTime)
  const meanWindSpeed = windVectors.length ? windVectors.reduce((total, vector) => total + vector.speedKmh, 0) / windVectors.length : null
  const peakWindSpeed = windVectors.length ? Math.max(...windVectors.map((vector) => vector.speedKmh)) : null
  return <div className={`map-frame ${terrainEnabled ? 'terrain-active' : 'terrain-flat'}`}>
    <div ref={element} className="map-canvas" aria-label="Map centered on the selected Alberta area" />
    <canvas ref={windFlowCanvas} className="wind-flow-canvas" aria-hidden="true" />
    <div className="map-coordinates"><Compass size={13} /> {lat.toFixed(3)}° N · {Math.abs(lon).toFixed(3)}° W</div>
    {direction !== undefined && !windVisible && <div className="map-wind" style={{ transform: `rotate(${direction}deg)` }} aria-label={`Wind blows toward ${windDirectionLabel(direction)}`}><Wind size={24} /></div>}
    <div className={`map-field-badge ${windVisible && windState === 'loading' ? 'field-loading' : windVisible && windState === 'error' ? 'field-error' : ''}`}><span className={windVisible && windState === 'ready' && windNodes.length ? 'field-live-dot' : ''} />{!windVisible ? 'Wind field hidden' : windState === 'loading' ? 'Updating wind field…' : windState === 'error' ? 'Wind unavailable' : `${windNodes.length || '—'}-point wind field`} · {terrainEnabled ? '3D relief' : '2D'}</div>
    {windVisible && (windNodes.length > 0 || windState !== 'ready') && <div className={`wind-speed-legend ${windState !== 'ready' ? `wind-field-${windState}` : ''}`} aria-label="Wind speed scale in kilometres per hour">
      <div className="wind-speed-legend-heading"><span>WIND SPEED <small>km/h</small></span><b>{windState !== 'ready' ? <span>{windState === 'loading' ? 'Updating forecast…' : 'Forecast unavailable'}</span> : <><span><i className="wind-stat-dot average" />{meanWindSpeed === null ? '—' : `${Math.round(meanWindSpeed)} avg`}</span><span><i className="wind-stat-dot peak" />{peakWindSpeed === null ? '—' : `${Math.round(peakWindSpeed)} peak`}</span></>}</b></div>
      <div className="wind-speed-ramp" />
      <div className="wind-speed-ticks"><span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span><span>60</span><span>80</span><span>100</span><span>150</span><span>200+</span></div>
      <small>{windState === 'loading' ? 'Refreshing for the visible map extent; stale vectors are hidden' : windState === 'error' ? <>No field is drawn because the current map extent could not be refreshed · <button type="button" className="wind-legend-retry" onClick={onRetryWind}>Retry wind</button></> : reducedMotion ? 'Arrows show wind direction' : 'Animated streaks show wind direction'} <span>·</span> {windTime ? `${new Date(windTime).toISOString().slice(11, 16)} UTC forecast` : 'time unavailable'}</small>
    </div>}
    <div className="map-caption">Basemap © OpenStreetMap · Terrain © Mapzen · Wind: Open-Meteo</div>
  </div>
}

function DashboardBottom({ observations, observationState, source, days, forecast, accessMode, sourceDateRange, queryRange, onLoad }: { observations: FireObservation[]; observationState: 'idle' | 'loading' | 'ready' | 'error'; source: string; days: number; forecast: ForecastHour[]; accessMode: string | null; sourceDateRange: FirmsDateRange | null; queryRange: { start: string; end: string } | null; onLoad: () => void }) {
  const byDay = new globalThis.Map<string, number>()
  for (const observation of observations) {
    const day = observation.acquiredAtUtc?.slice(0, 10)
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  const daily = [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right))
  const publicFeedIncomplete = accessMode === 'public-nrt-canada-csv' && sourceDateRange !== null && queryRange !== null
    && (sourceDateRange.minDate > queryRange.start || sourceDateRange.maxDate < queryRange.end)
  const publicFeedWindowNote = publicFeedIncomplete && sourceDateRange && queryRange
    ? `The public feed window is ${sourceDateRange.minDate} through ${sourceDateRange.maxDate}; requested dates outside it have unknown status.`
    : null
  const dailyCountUnknown = observationState === 'ready' && observations.length === 0 && (accessMode === 'local-validated-archive' || publicFeedIncomplete)
  const maxDaily = Math.max(1, ...daily.map(([, count]) => count))
  const windValues = forecast.slice(0, 24).map((hour) => hour.windSpeed)
  const maxWind = Math.max(1, ...windValues)
  const windPoints = windValues.map((speed, index) => `${windValues.length < 2 ? 0 : (index / (windValues.length - 1)) * 100},${32 - (speed / maxWind) * 25}`).join(' ')

  return <div className="dashboard-bottom">
    <section className="dashboard-chart-card detection-trend-card" aria-label="Satellite detection counts by day">
      <div className="dashboard-chart-heading"><div><b>Observed detections</b><small>{source.replaceAll('_', ' ')} · last {days} UTC {days === 1 ? 'day' : 'days'}</small></div><span>{observationState === 'ready' && !dailyCountUnknown ? `${observations.length.toLocaleString()} total` : observationState === 'ready' ? '—' : observationState === 'loading' ? 'Loading' : 'Not loaded'}</span></div>
      {observationState === 'ready' && publicFeedWindowNote && <small className="compare-trend-empty">{publicFeedWindowNote}</small>}
      {observationState === 'ready' && daily.length > 0
        ? <div className="daily-bars">{daily.map(([day, count]) => <div className="daily-bar-column" key={day} title={`${day} UTC · ${count.toLocaleString()} observations`}><b>{count.toLocaleString()}</b><i style={{ height: `${Math.max(4, (count / maxDaily) * 43)}px` }} /><small>{new Date(`${day}T00:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })}</small></div>)}</div>
        : <div className="dashboard-chart-empty">{observationState === 'ready' ? accessMode === 'local-validated-archive' ? 'No imported rows fall in this window. Archive coverage is unknown.' : publicFeedIncomplete ? publicFeedWindowNote : 'NASA returned no dated detections for this product and window. This is not proof of no fire.' : observationState === 'error' ? 'The selected FIRMS observation window is unavailable.' : 'Load FIRMS observations to build this chart from returned acquisition dates.'}{observationState !== 'loading' && <button className="text-button" onClick={onLoad}>{observationState === 'error' ? 'Retry observations' : 'Load observations'}</button>}</div>}
    </section>
    <section className="dashboard-chart-card wind-outlook-card" aria-label="Forecast wind speed for the next 24 hours">
      <div className="dashboard-chart-heading"><div><b>Wind outlook · next 24 hours</b><small>Open-Meteo · hourly at 10 m · km/h</small></div><strong>{forecast[0] ? `${Math.round(forecast[0].windSpeed)} km/h` : '—'}</strong></div>
      {forecast.length > 1 ? <><svg className="wind-outlook-chart" viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label={`Hourly forecast wind speeds range from ${Math.round(Math.min(...windValues))} to ${Math.round(Math.max(...windValues))} kilometers per hour`}><polygon points={`0,36 ${windPoints} 100,36`} fill="rgba(37,210,216,.12)" /><polyline points={windPoints} fill="none" stroke="#25d2d8" strokeWidth="1.3" vectorEffect="non-scaling-stroke" /></svg><div className="wind-outlook-range"><span>{forecast[0].time.slice(11, 16)} UTC</span><span>Peak {Math.round(Math.max(...windValues))} km/h</span><span>{forecast.at(-1)?.time.slice(11, 16)} UTC</span></div></> : <div className="dashboard-chart-empty">Hourly wind forecast is not available.</div>}
    </section>
    <aside className="dashboard-coverage-note"><div><AlertTriangle size={15} /><b>Coverage & interpretation</b></div><p>FIRMS reports satellite thermal anomalies, not confirmed fire perimeters. Cloud, smoke, viewing geometry and satellite gaps can affect detections. Historical baselines and coverage percentages are not available from this request.</p></aside>
  </div>
}

function SourcePipeline({ observations, feed, archiveCatalog }: { observations: FireObservation[]; feed: ReturnType<typeof useFirms>; archiveCatalog: FirmsArchiveState }) {
  const datedRows = observations.filter((observation) => observation.acquiredAtUtc)
  const observedDays = new Set(datedRows.map((observation) => observation.acquiredAtUtc!.slice(0, 10)))
  const sourceLabel = feed.accessMode === 'public-nrt-canada-csv' ? 'Public Canada NRT' : feed.accessMode === 'map-key-area-api' ? 'NASA FIRMS API' : feed.accessMode === 'local-validated-archive' ? 'Local validated archive' : feed.source.replaceAll('_', ' ')
  const acquisition = feed.state === 'ready' ? `${observations.length.toLocaleString()} rows returned` : feed.state === 'loading' ? 'Request in progress' : feed.state === 'error' ? 'Request failed' : 'No request yet'
  const normalization = feed.state === 'ready' ? `${datedRows.length.toLocaleString()} rows with acquisition time` : feed.state === 'error' ? 'No normalized result' : feed.state === 'loading' ? 'Waiting for source response' : 'Runs after a successful response'
  const aggregation = feed.state === 'ready' ? `${observedDays.size} UTC dates · ${datedRows.length.toLocaleString()} dated rows` : feed.state === 'error' ? 'No daily roll-up' : feed.state === 'loading' ? 'Waiting for returned rows' : 'Available after loading observations'
  const archiveSummary = archiveCatalog.status === 'ready'
    ? archiveCatalog.archives.length
      ? `${archiveCatalog.archives.length} manifests · ${archiveCatalog.archives.reduce((sum, archive) => sum + archive.rowsAccepted, 0).toLocaleString()} accepted rows`
      : 'No local imports registered'
    : archiveCatalog.status === 'loading' ? 'Reading local manifests'
      : archiveCatalog.status === 'error' ? 'Manifest read failed' : 'Catalog not opened'
  const steps = [
    { icon: Satellite, label: 'Acquisition', value: acquisition, detail: feed.fetchedAt ? `${sourceLabel} · retrieved ${new Date(feed.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : `${sourceLabel} · ${feed.days} day window`, state: feed.state },
    { icon: Database, label: 'Normalize', value: normalization, detail: feed.state === 'ready' ? 'Product identity and native FIRMS fields retained' : 'Field mapping follows the selected source response', state: feed.state === 'ready' ? 'ready' : feed.state },
    { icon: Activity, label: 'Daily roll-up', value: aggregation, detail: 'Counts are returned observation rows, not unique fires', state: feed.state === 'ready' ? 'ready' : feed.state },
    { icon: ClipboardList, label: 'Archive provenance', value: archiveSummary, detail: archiveCatalog.status === 'ready' && archiveCatalog.archives.length ? 'Manifest, QA status and SHA-256 available in the catalog above' : 'Historical import catalog is read separately from live FIRMS', state: archiveCatalog.status },
  ]
  return <section className="source-pipeline" aria-label="Data pipeline provenance">
    <header><span className="source-pipeline-mark"><Database size={17} /></span><div><b>Data pipeline</b><small>Live request and workspace provenance</small></div></header>
    <div className="source-pipeline-steps">{steps.map(({ icon: Icon, label, value, detail, state }, index) => <article className={`source-pipeline-step ${state}`} key={label}><div className="source-pipeline-step-heading"><span><Icon size={14} /></span><b>{label}</b>{index < steps.length - 1 && <i className="source-pipeline-connector" aria-hidden="true" />}</div><strong>{value}</strong><small>{detail}</small></article>)}</div>
  </section>
}

function SourceFocusCard({ selected, location, feed, windField, windTime, terrainAnalysis, elevation, archiveCatalog, onOpenCompare, onOpenTerrain, onOpenLiveMap, onRetryWind, onRetryElevation, onRefreshArchive }: { selected: DataSourceId; location: MapPoint; feed: ReturnType<typeof useFirms>; windField: WindFieldState; windTime?: string; terrainAnalysis: TerrainAnalysis; elevation: { value: number; state: 'loading' | 'ready' | 'error' }; archiveCatalog: FirmsArchiveState; onOpenCompare: () => void; onOpenTerrain: () => void; onOpenLiveMap: () => void; onRetryWind: () => void; onRetryElevation: () => void; onRefreshArchive: () => void }) {
  const product = firmsSources.find((item) => item.id === feed.source)
  const selectedArchiveRows = archiveCatalog.archives.filter((archive) => archive.product === feed.source)
  const details: Record<DataSourceId, { title: string; subtitle: string; status: string; facts: Array<[string, string]>; note: string }> = {
    firms: {
      title: 'NASA FIRMS active fire', subtitle: product?.label ?? feed.source,
      status: feed.state === 'ready' ? `${feed.observations.length.toLocaleString()} ROWS` : feed.state === 'loading' ? 'REQUESTING' : feed.state === 'error' ? 'UNAVAILABLE' : feed.configured === false && !feed.publicFeedAvailable ? 'KEY NOT SET' : 'NOT LOADED',
      facts: [['Product', 'Satellite thermal anomaly detections'], ['Coverage period', feed.queryRange ? `${feed.queryRange.start} → ${feed.queryRange.end} UTC` : 'Not queried'], ['Pixel size', feed.source.startsWith('VIIRS') ? '375 m nominal (VIIRS)' : '1 km nominal (MODIS)'], ['Access', firmsAccessLabel(feed.accessMode)], ['Returned rows', feed.state === 'ready' ? feed.observations.length.toLocaleString() : '—']],
      note: 'An observation is not a confirmed incident or unique fire. Missing rows do not establish absence.',
    },
    wind: {
      title: 'Open-Meteo wind field', subtitle: 'Hourly forecast · 10 m above ground',
      status: windField.state === 'ready' ? `${windField.nodes.length} GRID POINTS` : windField.state.toUpperCase(),
      facts: [['Variables', 'Wind speed and direction'], ['Valid time', windTime ? `${windTime.slice(0, 16).replace('T', ' ')} UTC` : 'Not available'], ['Grid', `25 requested · ${windField.nodes.length} valid nodes · viewport-relative`], ['Retrieved', windField.retrievedAt ? `${new Date(windField.retrievedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Not retrieved'], ['Units', 'km/h · direction toward on map']],
      note: 'This layer shows forecast wind; it does not model fire movement or spread.',
    },
    terrain: {
      title: 'Mapzen Terrarium elevation', subtitle: 'AWS terrain RGB tiles · zoom 12 samples',
      status: terrainAnalysis.state === 'ready' ? 'SAMPLED' : terrainAnalysis.state.toUpperCase(),
      facts: [['Layer', 'Bare-earth elevation relief'], ['Selected elevation', terrainAnalysis.elevationM === null ? '—' : `${Math.round(terrainAnalysis.elevationM).toLocaleString()} m`], ['Point spacing', terrainAnalysis.sampleSpacingM ? `~${Math.round(terrainAnalysis.sampleSpacingM)} m` : 'Not sampled'], ['A—B profile', terrainAnalysis.state === 'ready' ? `${terrainAnalysis.profile.length} samples · ${Math.round(terrainAnalysis.profile.at(-1)?.distanceKm ?? 0)} km` : 'Not sampled'], ['Other rasters', 'Fuel, canopy and water unavailable']],
      note: 'A local elevation derivative is not a validated regional fuel, soil or fire behavior layer.',
    },
    elevation: {
      title: 'Open-Meteo elevation', subtitle: 'Independent point sample',
      status: elevation.state.toUpperCase(),
      facts: [['Selected coordinate', `${location.lat.toFixed(4)}°, ${location.lon.toFixed(4)}°`], ['Elevation', elevation.state === 'ready' ? `${Math.round(elevation.value).toLocaleString()} m` : '—'], ['Purpose', 'Cross-check against Terrarium sample'], ['Resolution', 'Single coordinate response'], ['Source', 'Open-Meteo Elevation API']],
      note: 'A point cross-check does not replace the DEM or provide a continuous elevation surface.',
    },
    archive: {
      title: 'Local FIRMS archive', subtitle: 'Workspace manifests · local files stay private',
      status: archiveCatalog.status === 'ready' ? `${archiveCatalog.archives.length} IMPORTS` : archiveCatalog.status.toUpperCase(),
      facts: [['Matching product', selectedArchiveRows.length ? feed.source : 'No import for selected product'], ['Accepted rows', selectedArchiveRows.length ? selectedArchiveRows.reduce((sum, item) => sum + item.rowsAccepted, 0).toLocaleString() : '—'], ['Date range', selectedArchiveRows.length ? `${selectedArchiveRows.map((item) => item.minDateUtc).sort()[0]} → ${selectedArchiveRows.map((item) => item.maxDateUtc).sort().at(-1)}` : 'Unknown'], ['Manifest QA', selectedArchiveRows.length ? [...new Set(selectedArchiveRows.map((item) => item.qaStatus))].join(', ') : 'Not available'], ['Catalog', archiveCatalog.status === 'ready' ? 'Read from local workspace' : 'Open catalog to inspect']],
      note: 'An empty archive catalog or missing row does not mean the area had no fire activity.',
    },
  }
  const detail = details[selected]
  const windRows = windTime ? windVectorsAt(windField.nodes, windTime) : []
  const observationRows = feed.observations.map((observation) => [
    observation.id, observation.source, firmsAccessLabel(feed.accessMode), feed.source,
    feed.queryRange?.start ?? null, feed.queryRange?.end ?? null, feed.fetchedAt,
    observation.acquiredAtUtc, observation.latitude, observation.longitude, observation.satellite,
    observation.instrument, observation.confidenceNative, observation.frpMw, observation.brightness4,
    observation.brightness5, observation.scanKm, observation.trackKm, observation.dayNight,
    observation.productVersion,
  ])
  const canExportObservations = (selected === 'firms' || selected === 'archive' && feed.accessMode === 'local-validated-archive') && feed.state === 'ready' && observationRows.length > 0
  const canExportArchiveManifest = selected === 'archive' && archiveCatalog.status === 'ready' && selectedArchiveRows.length > 0
  const canExport = canExportObservations
    || selected === 'wind' && windField.state === 'ready' && windRows.length > 0
    || selected === 'terrain' && terrainAnalysis.state === 'ready' && terrainAnalysis.profile.length > 0
    || selected === 'elevation' && elevation.state === 'ready'
    || canExportArchiveManifest
  const exportLabel = canExportObservations || selected === 'firms'
    ? feed.state === 'loading' ? 'Loading observations…' : canExportObservations ? `Export CSV · ${observationRows.length.toLocaleString()}` : feed.state === 'error' ? 'Retry FIRMS request' : feed.state === 'ready' ? 'Reload selected window' : 'Load observations'
    : selected === 'wind'
      ? windField.state === 'loading' ? 'Loading wind grid…' : canExport ? `Export wind · ${windRows.length} points` : 'Refresh wind field'
      : selected === 'terrain'
        ? terrainAnalysis.state === 'loading' ? 'Sampling terrain…' : canExport ? `Export profile · ${terrainAnalysis.profile.length} samples` : 'Open Terrain to sample'
        : selected === 'elevation'
          ? elevation.state === 'loading' ? 'Sampling elevation…' : canExport ? 'Export point sample' : 'Sample unavailable'
          : archiveCatalog.status === 'loading' ? 'Loading manifests…' : canExportArchiveManifest ? `Export manifests · ${selectedArchiveRows.length}` : archiveCatalog.status === 'idle' ? 'Load manifest catalog' : archiveCatalog.status === 'error' ? 'Retry manifest catalog' : feed.accessMode === 'local-validated-archive' && feed.state === 'loading' ? 'Loading archive rows…' : feed.accessMode === 'local-validated-archive' && feed.state !== 'ready' ? 'Load archive rows' : 'No manifest to export'
  const primaryAction = () => {
    if (canExport) {
      if (canExportObservations) {
        downloadCsv(`orbit-ember-watch-${feed.source.toLowerCase()}-${feed.queryRange?.end ?? new Date().toISOString().slice(0, 10)}.csv`, ['id', 'source', 'access_mode', 'product', 'query_start_utc', 'query_end_utc', 'retrieved_at_utc', 'acquired_at_utc', 'latitude', 'longitude', 'satellite', 'instrument', 'confidence_native', 'frp_mw', 'brightness_4', 'brightness_5', 'scan_km', 'track_km', 'day_night', 'product_version'], observationRows)
      } else if (selected === 'wind') {
        const rows = windRows.map((wind) => [wind.latitude, wind.longitude, windTime ?? null, wind.speedKmh, (wind.directionTo + 180) % 360, wind.directionTo, wind.eastKmh, wind.northKmh, windField.retrievedAt, 'Open-Meteo'])
        downloadCsv(`orbit-ember-watch-wind-${(windTime ?? 'selected-hour').replaceAll(':', '-')}.csv`, ['latitude', 'longitude', 'valid_at_utc', 'wind_speed_kmh', 'wind_from_degrees', 'wind_to_degrees', 'eastward_component_kmh', 'northward_component_kmh', 'retrieved_at_utc', 'source'], rows)
      } else if (selected === 'terrain') {
        const rows = terrainAnalysis.profile.map((point, index) => [index + 1, point.distanceKm, point.latitude, point.longitude, point.elevationM, terrainAnalysis.elevationM, terrainAnalysis.slopeDegrees, terrainAnalysis.aspectDegrees, terrainAnalysis.sampleSpacingM, terrainAnalysis.minElevationM, terrainAnalysis.maxElevationM, 'Mapzen Terrarium · AWS Terrain Tiles'])
        downloadCsv(`orbit-ember-watch-terrain-profile-${location.lat.toFixed(3)}-${location.lon.toFixed(3)}.csv`, ['sample_index', 'distance_from_a_km', 'latitude', 'longitude', 'profile_elevation_m', 'selected_point_elevation_m', 'local_slope_degrees', 'local_aspect_degrees', 'neighbor_spacing_m', 'profile_min_elevation_m', 'profile_max_elevation_m', 'source'], rows)
      } else if (selected === 'elevation') {
        downloadCsv(`orbit-ember-watch-elevation-${location.lat.toFixed(3)}-${location.lon.toFixed(3)}.csv`, ['latitude', 'longitude', 'elevation_m', 'unit', 'source'], [[location.lat, location.lon, elevation.value, 'm', 'Open-Meteo Elevation API']])
      } else {
        const rows = selectedArchiveRows.map((archive) => [archive.importId, archive.product, archive.sourceFile, archive.sourceRetrievedAtUtc, archive.minDateUtc, archive.maxDateUtc, archive.rowsRead, archive.rowsAccepted, archive.rowsRejected, archive.rowsDuplicate, archive.sourceSha256, archive.qaStatus, archive.warnings.join(' | ')])
        downloadCsv('orbit-ember-watch-local-firms-manifests.csv', ['import_id', 'product', 'source_file', 'source_retrieved_at_utc', 'min_date_utc', 'max_date_utc', 'rows_read', 'rows_accepted', 'rows_rejected', 'rows_duplicate', 'source_sha256', 'qa_status', 'warnings'], rows)
      }
      return
    }
    if (selected === 'elevation') onRetryElevation()
    else if (selected === 'archive' && (archiveCatalog.status === 'idle' || archiveCatalog.status === 'error')) onRefreshArchive()
    else if (selected === 'firms' || selected === 'archive' && feed.accessMode === 'local-validated-archive') void feed.load()
    else if (selected === 'wind') onRetryWind()
    else if (selected === 'terrain') onOpenTerrain()
  }
  const secondaryAction = selected === 'firms' ? onOpenCompare : selected === 'wind' ? onOpenLiveMap : selected === 'archive' ? onRefreshArchive : onOpenTerrain
  const secondaryLabel = selected === 'firms' ? 'Open in Compare' : selected === 'wind' ? 'Open Live Map' : selected === 'archive' ? 'Refresh catalog' : 'Open Terrain'
  const secondaryDisabled = selected === 'wind' && windField.state === 'loading' || selected === 'archive' && archiveCatalog.status === 'loading'
  return <section className="source-focus-card" aria-label={`${detail.title} dataset details`}>
    <header><div><span>SELECTED DATASET</span><h3>{detail.title}</h3><small>{detail.subtitle}</small></div><b className={`source-focus-status ${selected}`}>{detail.status}</b></header>
    <dl>{detail.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p>{detail.note}</p>
    <div className="source-focus-actions">
      <button type="button" className="source-focus-action primary" onClick={primaryAction} disabled={selected === 'elevation' && elevation.state === 'loading' || selected === 'archive' && archiveCatalog.status === 'loading' || selected === 'archive' && !canExport && archiveCatalog.status === 'ready' && selectedArchiveRows.length === 0 && feed.accessMode !== 'local-validated-archive' || selected === 'wind' && windField.state === 'loading' || selected === 'terrain' && terrainAnalysis.state === 'loading' || (selected === 'firms' || selected === 'archive' && feed.accessMode === 'local-validated-archive') && feed.state === 'loading'} title={canExport ? 'Download the actual sample with source and unit metadata as CSV' : exportLabel}>{canExport ? <Download size={13} /> : selected === 'terrain' && !canExport ? <Mountain size={13} /> : <RefreshCw size={13} />}{selected === 'elevation' && elevation.state === 'error' ? 'Retry elevation sample' : exportLabel}</button>
      <button type="button" className="source-focus-action" onClick={secondaryAction} disabled={secondaryDisabled}>{selected === 'firms' ? <Activity size={13} /> : selected === 'wind' ? <Wind size={13} /> : selected === 'archive' ? <Database size={13} /> : <Mountain size={13} />}{secondaryLabel}</button>
    </div>
  </section>
}

function TerrainCrossSection({ analysis }: { analysis: TerrainAnalysis }) {
  const values = analysis.profile.map((point) => point.elevationM)
  const minimum = analysis.minElevationM ?? 0
  const range = Math.max(1, (analysis.maxElevationM ?? minimum) - minimum)
  const distanceKm = analysis.profile.at(-1)?.distanceKm ?? 80
  const distanceLabel = distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm).toString()
  const path = analysis.profile.map((point, index) => `${index / Math.max(analysis.profile.length - 1, 1) * 100},${92 - ((point.elevationM - minimum) / range) * 78}`).join(' ')
  const fillPath = analysis.profile.length ? `0,100 ${path} 100,100` : ''
  return <section className="terrain-profile-strip" aria-label="Terrain cross-section">
    <header><div><b><Activity size={14} /> Terrain cross-section · A—B</b><small>{analysis.state === 'ready' ? `${distanceLabel} km · ${analysis.profile.length} DEM samples · Terrarium z12` : analysis.state === 'loading' ? 'Sampling the selected A—B transect…' : analysis.state === 'error' ? 'Terrain profile unavailable' : 'Select Terrain to sample the elevation grid'}</small></div>{analysis.state === 'ready' && <span>{Math.round(minimum)}–{Math.round(analysis.maxElevationM ?? minimum)} m range</span>}</header>
    {analysis.state === 'ready' && values.length ? <div className="terrain-profile-chart"><span className="terrain-profile-max">{Math.round(analysis.maxElevationM ?? 0)} m</span><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Terrain profile from ${Math.round(values[0])} metres to ${Math.round(values.at(-1) ?? values[0])} metres over ${distanceLabel} kilometres`}><path d="M 0 25 H 100 M 0 50 H 100 M 0 75 H 100" className="terrain-profile-grid" /><polygon points={fillPath} className="terrain-profile-fill" /><polyline points={path} className="terrain-profile-line" vectorEffect="non-scaling-stroke" /></svg><span className="terrain-profile-min">{Math.round(analysis.minElevationM ?? 0)} m</span><div className="terrain-profile-distance"><span>A · 0 km</span><span>B · {distanceLabel} km</span></div></div> : <div className="terrain-profile-state">{analysis.state === 'error' ? analysis.error ?? 'The terrain tiles could not be read.' : 'A data-driven elevation profile appears here after the DEM samples load.'}</div>}
  </section>
}

type CompareFeed = { observations: FireObservation[]; state: 'idle' | 'loading' | 'ready' | 'error'; source: string; days: number; fetchedAt: string | null; queryRange: { start: string; end: string } | null; sourceDateRange: FirmsDateRange | null; accessMode: string | null; archiveImports: FirmsLocalImport[]; load: () => Promise<void> }

function CompareTrend({ feed, tone }: { feed: CompareFeed; tone: 'modis' | 'viirs' }) {
  const byDay = new globalThis.Map<string, number>()
  for (const observation of feed.observations) {
    const day = observation.acquiredAtUtc?.slice(0, 10)
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  const end = feed.queryRange?.end ?? feed.fetchedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  const start = feed.queryRange?.start ?? shiftUtcDay(end, 1 - feed.days)
  const requestedDays = Array.from({ length: feed.days }, (_, index) => shiftUtcDay(start, index))
  const days = feed.accessMode === 'local-validated-archive'
    ? requestedDays.filter((day) => byDay.has(day))
    : feed.accessMode === 'public-nrt-canada-csv' && feed.sourceDateRange
      ? requestedDays.filter((day) => day >= feed.sourceDateRange!.minDate && day <= feed.sourceDateRange!.maxDate)
      : requestedDays
  const maximum = Math.max(1, ...days.map((day) => byDay.get(day) ?? 0))
  const archiveMode = feed.accessMode === 'local-validated-archive'
  const plotPoints = days.map((day, index) => {
    const count = byDay.get(day) ?? 0
    const dayIndex = archiveMode ? requestedDays.indexOf(day) : index
    const plotLength = archiveMode ? requestedDays.length : days.length
    return {
      day,
      count,
      x: plotLength < 2 ? 57 : 15 + dayIndex / (plotLength - 1) * 82,
      y: 76 - count / maximum * 58,
    }
  })
  const linePoints = plotPoints.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPoints = plotPoints.length ? `15,78 ${linePoints} ${plotPoints.at(-1)!.x},78` : ''
  const lineSegments: typeof plotPoints[] = []
  for (const point of plotPoints) {
    const segment = lineSegments.at(-1)
    const previous = segment?.at(-1)
    if (!previous || !archiveMode || shiftUtcDay(previous.day, 1) === point.day) {
      if (segment) segment.push(point)
      else lineSegments.push([point])
    } else lineSegments.push([point])
  }
  const publicWindowIncomplete = feed.accessMode === 'public-nrt-canada-csv' && feed.sourceDateRange !== null && feed.queryRange !== null
    && (feed.sourceDateRange.minDate > feed.queryRange.start || feed.sourceDateRange.maxDate < feed.queryRange.end)
  return <section className={`compare-trend-card ${tone}`}>
    <header><div><b>{feed.source.replaceAll('_', ' ')}</b><small>{firmsAccessLabel(feed.accessMode)} · returned observations · requested UTC days</small>{feed.accessMode === 'local-validated-archive' && <small>{feed.archiveImports.map((item) => item.sourceFile).join(', ') || 'Local import provenance unavailable'}</small>}</div><strong>{feed.state === 'ready' && !(feed.observations.length === 0 && (feed.accessMode === 'local-validated-archive' || publicWindowIncomplete)) ? feed.observations.length.toLocaleString() : '—'}</strong></header>
    {feed.state === 'ready' && feed.accessMode === 'local-validated-archive' && days.length === 0 ? <div className="compare-trend-empty">No imported rows fall in this window. Archive coverage remains unknown.</div> : feed.state === 'ready' && feed.accessMode === 'public-nrt-canada-csv' && feed.sourceDateRange && days.length === 0 ? <div className="compare-trend-empty">No detections were returned in this requested window. Dates outside the rolling public feed window have unknown status.</div> : feed.state === 'ready' ? <>
      {feed.accessMode === 'local-validated-archive' && <small className="compare-trend-empty">Only dates with imported rows are shown; other dates remain unknown.</small>}
      {publicWindowIncomplete && feed.sourceDateRange && <small className="compare-trend-empty">The public feed window is {feed.sourceDateRange.minDate} through {feed.sourceDateRange.maxDate}; requested dates outside it have unknown status.</small>}
      <div className="compare-trend-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Daily returned observation counts for ${feed.source}`}>
          <defs><linearGradient id={`compare-fill-${tone}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" /><stop offset="100%" /></linearGradient></defs>
          {[18, 33, 48, 63, 78].map((y, index) => <g key={y}><line x1="14" x2="99" y1={y} y2={y} className="compare-chart-gridline" /><text x="11" y={y + 1.5} textAnchor="end" className="compare-chart-y-label">{Math.round(maximum * (4 - index) / 4)}</text></g>)}
          {!archiveMode && plotPoints.length > 1 && <polygon points={areaPoints} className="compare-chart-area" />}
          {lineSegments.filter((segment) => segment.length > 1).map((segment) => <polyline key={segment[0].day} points={segment.map((point) => `${point.x},${point.y}`).join(' ')} className="compare-chart-line" vectorEffect="non-scaling-stroke" />)}
          {plotPoints.map((point) => <ellipse key={point.day} cx={point.x} cy={point.y} rx="1.1" ry="3" className="compare-chart-point"><title>{point.day} UTC · {point.count.toLocaleString()} returned observations</title></ellipse>)}
        </svg>
        <div className="compare-chart-axis"><span>{(archiveMode ? requestedDays[0] : days[0]) ? new Date(`${(archiveMode ? requestedDays[0] : days[0])}T00:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '—'}</span><span>{(archiveMode ? requestedDays.at(-1) : days.at(-1)) ? new Date(`${(archiveMode ? requestedDays.at(-1) : days.at(-1))}T00:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '—'}</span></div>
      </div></> : <div className="compare-trend-empty">{feed.state === 'loading' ? 'Requesting this sensor product…' : feed.state === 'error' ? 'This product request failed; retry from Sensor A/B.' : 'Load this product to build a chart from returned acquisition dates.'}</div>}
  </section>
}

function shiftUtcDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function mondayOfUtcWeek(day: string) {
  const date = new Date(`${day}T00:00:00Z`)
  const mondayOffset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - mondayOffset)
  return date.toISOString().slice(0, 10)
}

function shiftUtcMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 7)
}

function CwfisHistoricalPilot() {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [termsConfirmed, setTermsConfirmed] = useState(false)
  const [observations, setObservations] = useState<{ id: string; acquiredAtUtc: string; sensor: string; satellite: string; source: string; agency: string }[]>([])
  const [message, setMessage] = useState('')
  const load = async () => {
    setState('loading'); setMessage('')
    const params = new URLSearchParams({ bbox: '-116.2,52.9,-115.1,53.5', start: '2023-05-04', end: '2023-05-20' })
    try {
      const response = await fetch(`/api/cwfis/hotspots?${params}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'CWFIS historical context could not be loaded.')
      setObservations(Array.isArray(payload.observations) ? payload.observations : [])
      setState('ready')
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'CWFIS historical context could not be loaded.')
    }
  }
  const days = Array.from({ length: 17 }, (_, index) => shiftUtcDay('2023-05-04', index))
  const series = observations.reduce<Record<string, Record<string, number>>>((result, row) => {
    const family = `${row.sensor} · ${row.source}`
    const day = row.acquiredAtUtc.slice(0, 10)
    result[family] ??= {}
    result[family][day] = (result[family][day] ?? 0) + 1
    return result
  }, {})
  const sourceCounts = observations.reduce<Record<string, number>>((result, row) => { result[row.source] = (result[row.source] ?? 0) + 1; return result }, {})
  const satelliteCounts = observations.reduce<Record<string, number>>((result, row) => { result[row.satellite] = (result[row.satellite] ?? 0) + 1; return result }, {})
  const agencyCounts = observations.reduce<Record<string, number>>((result, row) => { result[row.agency] = (result[row.agency] ?? 0) + 1; return result }, {})
  const seriesRows = Object.entries(series).map(([name, values]) => ({ name, values, total: Object.values(values).reduce((sum, count) => sum + count, 0) })).sort((a, b) => b.total - a.total)
  const max = Math.max(1, ...seriesRows.flatMap((row) => Object.values(row.values)))
  return <section className="cwfis-pilot-panel" aria-label="CWFIS historical regional context">
    <header><div><span className="cwfis-kicker"><Database size={13} /> HISTORICAL CONTEXT · PUBLIC WFS</span><h2>Alberta west · May 4–20, 2023</h2><p>Regional hotspot sample near the Pembina Complex origin area · not a fire-specific perimeter match</p></div><button className="dashboard-load-button" onClick={() => void load()} disabled={state === 'loading' || !termsConfirmed}>{state === 'loading' ? 'Loading CWFIS…' : state === 'ready' ? 'Refresh history' : 'Load historical context'}</button></header>
    <label className="cwfis-terms-confirm"><input type="checkbox" checked={termsConfirmed} onChange={(event) => setTermsConfirmed(event.target.checked)} /><span>Our team has reviewed the CWFIS End-User Agreement and confirmed this use is covered.</span><a href="https://scifv.scf.rncan.gc.ca/downloads/EUA/End_User_Agreement_gen_EN.html.php" target="_blank" rel="noreferrer">Review agreement</a></label>
    <div className="cwfis-provenance-note"><AlertTriangle size={14} /><span>CWFIS Fire M3 is a mixed-source contextual dataset, not raw NASA FIRMS or independent fire-perimeter truth. Missing dates have unknown coverage; counts are returned detection rows, not fire counts.</span></div>
    {state === 'error' && <p className="cwfis-error">{message}</p>}
    {state === 'ready' && <>
      <div className="cwfis-pilot-summary"><b>{observations.length.toLocaleString()}</b><span>returned rows</span><b>{Object.keys(sourceCounts).length}</b><span>source labels</span><small>May 4–20 UTC · 52.9–53.5°N, 116.2–115.1°W</small></div>
      <div className="cwfis-series" aria-label="Daily CWFIS hotspot rows grouped by sensor and source label">{seriesRows.map(({ name, values }) => <div className={`cwfis-series-row ${name.toUpperCase().startsWith('MODIS') ? 'modis' : name.toUpperCase().startsWith('VIIRS') ? 'viirs' : ''}`} key={name}><b>{name}</b><div>{days.map((day) => { const count = values[day] ?? 0; return <i key={day} title={`${day} UTC · ${count ? `${count.toLocaleString()} rows` : 'no returned rows; coverage unknown'}`} style={{ height: `${count ? Math.max(4, count / max * 54) : 2}px` }} /> })}</div><small className="cwfis-series-total">{seriesRows.find((row) => row.name === name)?.total.toLocaleString()}</small></div>)}</div>
      <div className="cwfis-day-labels">{days.map((day) => <span key={day}>{day.slice(8)}</span>)}</div>
      <div className="cwfis-source-list"><b>Source provenance</b>{Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([source, count]) => <span key={source}>{source} <strong>{count.toLocaleString()}</strong></span>)}</div>
      <div className="cwfis-source-list"><b>Satellites / agencies</b>{Object.entries(satelliteCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([satellite, count]) => <span key={satellite}>{satellite} <strong>{count.toLocaleString()}</strong></span>)}{Object.keys(agencyCounts).sort().map((agency) => <span key={agency}>Agency {agency}</span>)}</div>
      <small className="cwfis-source-citation">Canadian Forest Service. 2020. <a href="https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/archive/fireM3_hotspots_metadata_NAP_ISO_19115_2003.pdf" target="_blank" rel="noreferrer">Canadian Wildland Fire Information System (CWFIS)</a>, Natural Resources Canada, Canadian Forest Service, Northern Forestry Centre, Edmonton, Alberta.</small>
    </>}
    {state === 'idle' && <small className="cwfis-idle">Load this short historical window to explore separate MODIS and VIIRS daily records.</small>}
  </section>
}

function CalendarBoard({ observations, observationState, days, selectedDate, onSelectDate, windowStart, windowEnd, coverageUnknown, unknownBeforeDate, unknownAfterDate }: { observations: FireObservation[]; observationState: 'idle' | 'loading' | 'ready' | 'error'; days: number; selectedDate: string; onSelectDate: (date: string) => void; windowStart: string; windowEnd: string; coverageUnknown: boolean; unknownBeforeDate: string | null; unknownAfterDate: string | null }) {
  const counts = new globalThis.Map<string, number>()
  for (const observation of observations) {
    const day = observation.acquiredAtUtc?.slice(0, 10)
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  const maximum = Math.max(1, ...counts.values())
  const [month, setMonth] = useState(() => selectedDate.slice(0, 7))
  useEffect(() => setMonth(selectedDate.slice(0, 7)), [selectedDate])
  const monthDate = new Date(`${month}-01T00:00:00Z`)
  const firstVisible = new Date(monthDate)
  firstVisible.setUTCDate(firstVisible.getUTCDate() - ((monthDate.getUTCDay() + 6) % 7))
  const todayUtc = new Date().toISOString().slice(0, 10)
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisible)
    date.setUTCDate(firstVisible.getUTCDate() + index)
    const iso = date.toISOString().slice(0, 10)
    const hasQueryWindow = Boolean(windowStart && windowEnd)
    const inQuery = hasQueryWindow && iso >= windowStart && iso <= windowEnd
    const count = counts.get(iso)
    const future = iso > todayUtc
    const rowCoverageUnknown = coverageUnknown && !count
    const feedDateBeforeWindow = unknownBeforeDate !== null && iso < unknownBeforeDate
    const feedDateUnknown = unknownAfterDate !== null && iso > unknownAfterDate
    const feedDateOutsideWindow = feedDateBeforeWindow || feedDateUnknown
    const state = future ? 'future-date' : !hasQueryWindow ? 'not-loaded' : observationState === 'ready' && inQuery && (rowCoverageUnknown || feedDateOutsideWindow) ? 'unknown-coverage' : observationState === 'ready' && inQuery ? 'covered' : observationState === 'loading' && inQuery ? 'loading' : observationState === 'error' && inQuery ? 'error' : inQuery ? 'not-loaded' : 'outside-window'
    const label = future ? 'Future dates are unavailable' : state === 'covered' ? `${count ?? 0} returned observations` : state === 'unknown-coverage' ? feedDateBeforeWindow ? 'Before the public feed window; status unknown' : feedDateUnknown ? 'After the public feed window; status unknown' : 'No archive rows; observation coverage is unknown' : state === 'loading' ? 'Request in progress' : state === 'error' ? 'Request unavailable' : state === 'not-loaded' ? 'Not queried' : 'Outside selected FIRMS window'
    return { iso, date, count, inQuery, state, label }
  })
  const weekStart = mondayOfUtcWeek(selectedDate)
  const shownCells = cells.filter((cell) => cell.iso >= weekStart && cell.iso < shiftUtcDay(weekStart, 7))
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [historicalContextOpen, setHistoricalContextOpen] = useState(false)
  const rendered = mode === 'month' ? cells : shownCells
  const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

  return <section className={`calendar-board ${historicalContextOpen ? 'cwfis-open' : ''}`} aria-label="FIRMS observation calendar">
    <header className="calendar-board-heading"><div><CalendarDays size={17} /><div><b>Activity Calendar — {monthDate.toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'long', year: 'numeric' })}</b><small>{observationState === 'ready' ? `Observed records · ${days} UTC ${days === 1 ? 'day' : 'days'} · ${windowStart} to ${windowEnd}` : observationState === 'loading' ? 'Loading the selected NASA FIRMS window' : observationState === 'error' ? 'Selected FIRMS window is unavailable' : 'Load observations to populate queried dates'}</small></div></div><div className="calendar-board-actions"><button className={`calendar-history-toggle ${historicalContextOpen ? 'selected' : ''}`} onClick={() => setHistoricalContextOpen((value) => !value)} aria-pressed={historicalContextOpen}>{historicalContextOpen ? 'Return to calendar' : 'Historical sample'}</button><div className="calendar-month-nav"><button aria-label="Previous month" title="Previous month" onClick={() => setMonth((value) => shiftUtcMonth(value, -1))}><ChevronLeft size={13} /></button><button aria-label="Next month" title="Next month" onClick={() => setMonth((value) => shiftUtcMonth(value, 1))}><ChevronRight size={13} /></button></div><div className="calendar-mode-toggle"><button className={mode === 'month' ? 'selected' : ''} onClick={() => setMode('month')} aria-pressed={mode === 'month'}>Month</button><button className={mode === 'week' ? 'selected' : ''} onClick={() => setMode('week')} aria-pressed={mode === 'week'}>Week</button></div></div></header>
    <div className="calendar-grid-wrap"><div className="calendar-weekdays">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div><div className={`calendar-grid ${mode === 'week' ? 'week-mode' : ''}`}>{rendered.map((cell) => <button key={cell.iso} className={`calendar-day ${cell.iso === selectedDate ? 'selected' : ''} ${cell.iso.slice(0, 7) !== month ? 'adjacent-month' : ''} ${cell.state} ${cell.state === 'covered' && (cell.count ?? 0) === 0 ? 'zero-records' : ''}`} onClick={() => onSelectDate(cell.iso)} disabled={cell.state === 'future-date'} title={`${cell.iso} UTC · ${cell.label}`} aria-label={`${cell.iso}, ${cell.label}`} aria-pressed={cell.iso === selectedDate}><span>{cell.date.getUTCDate()}</span>{cell.state === 'covered' ? <b style={{ '--activity': String((cell.count ?? 0) / maximum) } as CSSProperties}>{(cell.count ?? 0).toLocaleString()}</b> : cell.state === 'loading' ? <i className="calendar-loading-dot" /> : <small>{cell.state === 'outside-window' ? '—' : cell.state === 'error' ? '!' : cell.state === 'unknown-coverage' ? '?' : '·'}</small>}</button>)}</div></div>
    <aside className="calendar-legend"><span><i className="calendar-legend-count" /> Dates with returned rows</span>{!coverageUnknown && !unknownBeforeDate && !unknownAfterDate && <span><i className="calendar-legend-empty" /> Queried, no records</span>}{(coverageUnknown || unknownBeforeDate || unknownAfterDate) && <span><i className="calendar-legend-unknown" /> {coverageUnknown ? 'No archive rows · coverage unknown' : 'Dates outside public feed window · status unknown'}</span>}<span><i className="calendar-legend-unknown" /> Not queried / unavailable</span></aside>
    {historicalContextOpen && <CwfisHistoricalPilot />}
  </section>
}

function CalendarWeekDetails({ selectedDate, observations, observationState, days, source, windowStart, windowEnd, coverageUnknown, unknownBeforeDate, unknownAfterDate }: { selectedDate: string; observations: FireObservation[]; observationState: 'idle' | 'loading' | 'ready' | 'error'; days: number; source: string; windowStart: string; windowEnd: string; coverageUnknown: boolean; unknownBeforeDate: string | null; unknownAfterDate: string | null }) {
  const weekStart = mondayOfUtcWeek(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftUtcDay(weekStart, index))
  const inWindow = weekDays.filter((day) => day >= windowStart && day <= windowEnd)
  const counts = weekDays.map((day) => {
    const count = observations.filter((observation) => observation.acquiredAtUtc?.slice(0, 10) === day).length
    const publicFeedDateUnknown = (unknownBeforeDate !== null && day < unknownBeforeDate) || (unknownAfterDate !== null && day > unknownAfterDate)
    return { day, count, queried: observationState === 'ready' && day >= windowStart && day <= windowEnd && (!coverageUnknown || count > 0) && !publicFeedDateUnknown }
  })
  const weekObservations = observations.filter((observation) => observation.acquiredAtUtc && observation.acquiredAtUtc.slice(0, 10) >= weekStart && observation.acquiredAtUtc.slice(0, 10) < shiftUtcDay(weekStart, 7))
  const weekHasUnknownFeedDates = (unknownBeforeDate !== null && inWindow.some((day) => day < unknownBeforeDate)) || (unknownAfterDate !== null && inWindow.some((day) => day > unknownAfterDate))
  const weekRowsUnknown = observationState === 'ready' && inWindow.length > 0 && weekObservations.length === 0 && (coverageUnknown || weekHasUnknownFeedDates)
  const max = Math.max(1, ...counts.filter((item) => item.queried).map((item) => item.count))
  const end = shiftUtcDay(weekStart, 6)
  const peak = weekObservations.reduce<FireObservation | null>((current, item) => item.frpMw !== null && (current === null || item.frpMw > (current.frpMw ?? -Infinity)) ? item : current, null)
  const format = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })

  return <>
    <div className="panel-heading"><div><h2>Selected week details</h2><p>{format(weekStart)} – {format(end)}, {end.slice(0, 4)} · {source.replaceAll('_', ' ')}</p></div><CalendarDays size={18} /></div>
    <div className="calendar-week-total"><span>{observationState === 'ready' && inWindow.length && !weekRowsUnknown ? weekObservations.length.toLocaleString() : '—'}</span><div><b>{weekRowsUnknown ? 'No returned rows' : observationState === 'ready' && inWindow.length ? 'Returned observations' : observationState === 'loading' && inWindow.length ? 'Loading requested days' : 'No queried week data'}</b><small>{weekRowsUnknown ? coverageUnknown ? 'Archive coverage is unknown for this week.' : 'Some dates in this week fall outside the public feed window; their status is unknown.' : observationState === 'ready' ? `${inWindow.length} of 7 dates fall inside the selected ${days}-day FIRMS request${coverageUnknown ? '; dates without imported rows remain unknown' : ''}` : observationState === 'loading' ? `Querying ${windowStart} to ${windowEnd}` : observationState === 'error' && windowStart ? `Request ${windowStart} to ${windowEnd} failed; no observation count is available` : 'No FIRMS date window has been queried for this week.'}</small></div></div>
    {observationState === 'ready' && inWindow.length > 0 ? <div className="calendar-week-chart" aria-label={coverageUnknown || unknownBeforeDate || unknownAfterDate ? 'Daily FIRMS rows; dates outside the public feed window have unknown status' : 'Returned FIRMS observations per day'}>{counts.map(({ day, count, queried }) => <div className="calendar-week-bar" key={day} title={`${day} UTC · ${queried ? `${count} records returned` : coverageUnknown && day >= windowStart && day <= windowEnd ? 'No imported row; coverage unknown' : (unknownBeforeDate && day < unknownBeforeDate) || (unknownAfterDate && day > unknownAfterDate) ? 'Outside public feed window; status unknown' : 'not queried'}`}><b>{queried ? count.toLocaleString() : '—'}</b><i className={queried && count > 0 ? 'has-count' : ''} style={{ height: `${queried && count ? Math.max(4, (count / max) * 56) : 3}px` }} /><small>{format(day).split(' ')[1]}</small></div>)}</div> : <div className="calendar-detail-empty">{observationState === 'error' ? 'NASA FIRMS could not provide this observation window.' : observationState === 'loading' ? 'The requested observations are loading.' : observationState === 'ready' ? 'No dates in this week were covered by the selected query.' : 'Load the selected product from Dashboard or Live Map; dates without a request remain unknown.'}</div>}
    {peak && <div className="calendar-peak"><Flame size={15} /><span>Highest FRP in this week</span><b>{peak.frpMw} MW</b><small>{peak.acquiredAtUtc ? new Date(peak.acquiredAtUtc).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'time unavailable'}</small></div>}
    <div className="calendar-coverage-note"><AlertTriangle size={14} /><span>Coverage percentage and confidence are not supplied as week-level aggregates by this request. Zero returned records is not proof of no fire.</span></div>
  </>
}

export function App() {
  const workspace = useWorkspaceState()
  const { view: active, setView: setActive, location, setLocation, windVisible, setWindVisible, terrainEnabled, setTerrainEnabled, selectedTime, setSelectedTime, queryEndDate, setQueryEndDate, calendarDate, setCalendarDate, selectedObservation: activeDetection, setSelectedObservation: setActiveDetection, firmsProduct, setFirmsProduct, compareProductA: compareSourceA, setCompareProductA: setCompareSourceA, compareProductB: compareSourceB, setCompareProductB: setCompareSourceB, firmsDays, setFirmsDays } = workspace
  const [navOpen, setNavOpen] = useState(false)
  const [fieldMobileTab, setFieldMobileTab] = useState<FieldMobileTab>('Map')
  const [fieldSheetExpanded, setFieldSheetExpanded] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [archiveCatalogExpanded, setArchiveCatalogExpanded] = useState(false)
  const [selectedDataSource, setSelectedDataSource] = useState<DataSourceId>('firms')
  const [sourceHotspotsVisible, setSourceHotspotsVisible] = useState(true)
  const [sourceDockCollapsed, setSourceDockCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [liveSensors, setLiveSensors] = useState<LiveSensorKey[]>(['modis-terra', 'modis-aqua', 'noaa20', 'noaa21'])
  const [liveConfidence, setLiveConfidence] = useState<string[]>(['low', 'nominal', 'high', 'unknown'])
  const [liveDayNight, setLiveDayNight] = useState<string[]>(['day', 'night', 'unknown'])
  const [liveHotspotsVisible, setLiveHotspotsVisible] = useState(true)
  const [liveDockCollapsed, setLiveDockCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [selectedLiveDate, setSelectedLiveDate] = useState<string | null>(null)
  const [livePlaybackRunning, setLivePlaybackRunning] = useState(false)
  const [windOverride, setWindOverride] = useState<number | null>(null)
  const [horizon, setHorizon] = useState(6)
  const [compareMode, setCompareMode] = useState<'swipe' | 'side-by-side'>('swipe')
  const [compareSplit, setCompareSplit] = useState(50)
  const [transectVisible, setTransectVisible] = useState(true)
  const [terrainRefresh, setTerrainRefresh] = useState(0)
  const [elevation, setElevation] = useState<{ value: number; state: 'loading' | 'ready' | 'error' }>({ value: 0, state: 'loading' })
  const [elevationRefresh, setElevationRefresh] = useState(0)
  const [windViewport, setWindViewport] = useState<WindViewport | null>(null)
  const [customTerrainTransect, setCustomTerrainTransect] = useState<TerrainEndpoints | null>(null)
  const [terrainTransectPointTarget, setTerrainTransectPointTarget] = useState<'A' | 'B' | null>(null)
  const [terrainTransectMessage, setTerrainTransectMessage] = useState('')
  const compareMapSync = useRef<MapSyncGroup>({ maps: new Set(), syncing: false })
  const updateWindViewport = useCallback((viewport: WindViewport) => {
    const quantize = (value: number) => Math.round(value * 4) / 4
    const next = { ...viewport, centerLatitude: quantize(viewport.centerLatitude), centerLongitude: quantize(viewport.centerLongitude), west: quantize(viewport.west), east: quantize(viewport.east), south: quantize(viewport.south), north: quantize(viewport.north), zoom: Math.round(viewport.zoom * 4) / 4, width: Math.round(viewport.width / 64) * 64, height: Math.round(viewport.height / 64) * 64 }
    setWindViewport((current) => current && current.south === next.south && current.west === next.west && current.north === next.north && current.east === next.east ? current : next)
  }, [])
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 760px)')
    const updateViewport = () => setIsMobileViewport(viewport.matches)
    viewport.addEventListener('change', updateViewport)
    return () => viewport.removeEventListener('change', updateViewport)
  }, [])
  const { hours, retrievedAt, state, retry } = useWeather(location.lat, location.lon)
  const windField = useWindField(location.lat, location.lon, windViewport)
  const firms = useFirms(location.lat, location.lon, firmsProduct, firmsDays, queryEndDate)
  const liveModis = useFirms(location.lat, location.lon, 'MODIS_NRT', firmsDays, queryEndDate)
  const liveNoaa20 = useFirms(location.lat, location.lon, 'VIIRS_NOAA20_NRT', firmsDays, queryEndDate)
  const liveNoaa21 = useFirms(location.lat, location.lon, 'VIIRS_NOAA21_NRT', firmsDays, queryEndDate)
  const firmsCoverage = useFirmsCoverage(active === 'Data & Sources')
  const firmsArchiveCatalog = useFirmsArchiveCatalog(active === 'Data & Sources')
  const compareA = useFirms(location.lat, location.lon, compareSourceA, firmsDays, queryEndDate)
  const compareB = useFirms(location.lat, location.lon, compareSourceB, firmsDays, queryEndDate)
  const defaultTerrainTransect = useMemo(() => terrainTransectCoordinates(location.lat, location.lon), [location.lat, location.lon])
  const terrainTransect = customTerrainTransect ?? defaultTerrainTransect
  const terrainAnalysis = useTerrainAnalysis(location.lat, location.lon, active === 'Terrain' || active === 'Scenario' || active === 'Data & Sources' && selectedDataSource === 'terrain', terrainRefresh, terrainTransect)
  const selectTerrainTransectPoint = useCallback((point: [number, number]) => {
    if (!terrainTransectPointTarget) return
    setTerrainTransectMessage('')
    setCustomTerrainTransect((current) => {
      const endpoints: TerrainEndpoints = current
        ? [[...current[0]], [...current[1]]]
        : [[...defaultTerrainTransect[0]], [...defaultTerrainTransect[1]]]
      endpoints[terrainTransectPointTarget === 'A' ? 0 : 1] = point
      return endpoints
    })
    const nextTarget = terrainTransectPointTarget === 'A' ? 'B' : null
    setTerrainTransectPointTarget(nextTarget)
    setTerrainTransectMessage(nextTarget ? 'Endpoint A saved. Click the map to place endpoint B.' : 'Both endpoints saved. Sampling the A—B profile.')
  }, [defaultTerrainTransect, terrainTransectPointTarget])
  useEffect(() => {
    setCustomTerrainTransect(null)
    setTerrainTransectPointTarget(null)
    setTerrainTransectMessage('')
  }, [location.lat, location.lon])
  const selectObservation = useCallback((observation: FireObservation | null) => {
    setActiveDetection(observation && firmsSources.some((product) => product.id === observation.source)
      ? { ...observation, source: observation.source as FirmsProduct, restoredFromLink: false }
      : null)
  }, [setActiveDetection])
  useEffect(() => { setWindOverride(null); setElevation({ value: 0, state: 'loading' }) }, [location])
  useEffect(() => {
    if (!queryEndDate) return
    if (active === 'Live Map') {
      if (liveSensors.some((key) => key === 'modis-terra' || key === 'modis-aqua') && (liveModis.state === 'idle' || liveModis.queryRange?.end !== queryEndDate)) void liveModis.load(queryEndDate)
      if (liveSensors.includes('noaa20') && (liveNoaa20.state === 'idle' || liveNoaa20.queryRange?.end !== queryEndDate)) void liveNoaa20.load(queryEndDate)
      if (liveSensors.includes('noaa21') && (liveNoaa21.state === 'idle' || liveNoaa21.queryRange?.end !== queryEndDate)) void liveNoaa21.load(queryEndDate)
      return
    }
    if (active === 'Compare') {
      if (compareA.state === 'idle' || compareA.queryRange?.end !== queryEndDate) void compareA.load(queryEndDate)
      if (compareB.state === 'idle' || compareB.queryRange?.end !== queryEndDate) void compareB.load(queryEndDate)
      return
    }
    if (firms.state === 'idle' || firms.queryRange?.end !== queryEndDate) void firms.load(queryEndDate)
  }, [active, compareA.queryRange?.end, compareA.state, compareB.queryRange?.end, compareB.state, firms.queryRange?.end, firms.state, liveModis.queryRange?.end, liveModis.state, liveNoaa20.queryRange?.end, liveNoaa20.state, liveNoaa21.queryRange?.end, liveNoaa21.state, liveSensors, queryEndDate])
  useEffect(() => {
    const controller = new AbortController()
    setElevation((current) => ({ ...current, state: 'loading' }))
    const params = new URLSearchParams({ latitude: String(location.lat), longitude: String(location.lon) })
    fetch(`https://api.open-meteo.com/v1/elevation?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Elevation unavailable'); return response.json() })
      .then((payload) => {
        if (typeof payload.elevation?.[0] !== 'number') throw new Error('Elevation unavailable')
        setElevation({ value: payload.elevation[0], state: 'ready' })
      })
      .catch((error: unknown) => { if (!(error instanceof Error && error.name === 'AbortError')) setElevation((current) => ({ ...current, state: 'error' })) })
    return () => controller.abort()
  }, [location, elevationRefresh])
  useEffect(() => {
    if (!hours.length) return
    if (selectedTime && hours.some((hour) => hour.time === selectedTime)) return
    const selectedTimestamp = selectedTime ? new Date(selectedTime).getTime() : NaN
    const nextIndex = Number.isFinite(selectedTimestamp)
      ? hours.reduce((closest, hour, index) => Math.abs(new Date(hour.time).getTime() - selectedTimestamp) < Math.abs(new Date(hours[closest].time).getTime() - selectedTimestamp) ? index : closest, 0)
      : Math.max(0, hours.findIndex((hour) => new Date(hour.time).getTime() >= Date.now()))
    setSelectedTime(hours[nextIndex]?.time ?? hours[0].time)
  }, [hours, selectedTime, setSelectedTime])
  const exactTimeIndex = selectedTime ? hours.findIndex((hour) => hour.time === selectedTime) : -1
  const safeIndex = exactTimeIndex >= 0 ? exactTimeIndex : Math.min(Math.max(0, hours.findIndex((hour) => new Date(hour.time).getTime() >= Date.now())), Math.max(hours.length - 1, 0))
  const weather = hours[safeIndex] ?? null
  const directionTo = weather ? toWindDirection(weather.windDirectionFrom) : undefined
  const displayWind = windOverride ?? weather?.windSpeed ?? 0
  const scenarioWindNodes = useMemo(() => {
    if (windOverride === null || !weather || !windField.nodes.length) return windField.nodes
    const baseSpeed = weather.windSpeed
    const scale = baseSpeed > 0 ? windOverride / baseSpeed : null
    return windField.nodes.map((node) => ({
      ...node,
      samples: node.samples.map((sample) => ({
        ...sample,
        speedKmh: sample.speedKmh === null ? null : Math.min(300, scale === null ? windOverride : sample.speedKmh * scale),
      })),
    }))
  }, [windOverride, weather, windField.nodes])
  const nowIndex = Math.max(0, hours.findIndex((hour) => new Date(hour.time).getTime() >= Date.now()))
  const forecastStartIndex = Math.min(nowIndex, Math.max(hours.length - 1, 0))
  const visibleHours = hours.slice(forecastStartIndex, forecastStartIndex + 36)
  const hourCount = visibleHours.length
  const peakObservation = firms.observations.reduce<FireObservation | null>((peak, observation) => observation.frpMw !== null && (peak === null || observation.frpMw > (peak.frpMw ?? -Infinity)) ? observation : peak, null)
  const currentUtcDate = new Date().toISOString().slice(0, 10)
  const calendarWindowEnd = firms.queryRange?.end ?? (firms.state === 'ready' ? firms.fetchedAt?.slice(0, 10) ?? currentUtcDate : '')
  const calendarWindowStart = firms.queryRange?.start ?? (firms.state === 'ready' ? shiftUtcDay(calendarWindowEnd, 1 - firms.days) : '')
  const calendarSelectedDate = calendarDate ?? (calendarWindowEnd || queryEndDate || currentUtcDate)
  const archiveCoverageUnknown = firms.accessMode === 'local-validated-archive'
  const unknownBeforeDate = firms.accessMode === 'public-nrt-canada-csv' && firms.sourceDateRange && firms.queryRange && firms.sourceDateRange.minDate > firms.queryRange.start ? firms.sourceDateRange.minDate : null
  const unknownAfterDate = firms.accessMode === 'public-nrt-canada-csv' && firms.sourceDateRange && firms.queryRange && firms.sourceDateRange.maxDate < firms.queryRange.end ? firms.sourceDateRange.maxDate : null
  const selectedDateBeforeFeed = unknownBeforeDate !== null && calendarSelectedDate < unknownBeforeDate
  const selectedDateAfterFeed = unknownAfterDate !== null && calendarSelectedDate > unknownAfterDate
  const calendarSelectedRecords = firms.observations.filter((observation) => observation.acquiredAtUtc?.slice(0, 10) === calendarSelectedDate)
  const calendarDateQueried = firms.state === 'ready' && calendarSelectedDate >= calendarWindowStart && calendarSelectedDate <= calendarWindowEnd
  const calendarDateUnknown = calendarDateQueried && ((archiveCoverageUnknown && calendarSelectedRecords.length === 0) || selectedDateBeforeFeed || selectedDateAfterFeed)
  const dashboardRowsUnknown = firms.state === 'ready' && firms.observations.length === 0 && (archiveCoverageUnknown || unknownBeforeDate !== null || unknownAfterDate !== null)
  const compareObservations = [...compareA.observations, ...compareB.observations]
  const liveFeeds = [liveModis, liveNoaa20, liveNoaa21]
  const liveSelectedFeeds = [...new Set(liveSensors.map((key) => key === 'modis-terra' || key === 'modis-aqua' ? 'MODIS_NRT' : key === 'noaa20' ? 'VIIRS_NOAA20_NRT' : 'VIIRS_NOAA21_NRT'))].map((source) => liveFeeds.find((feed) => feed.source === source)!).filter(Boolean)
  const liveFeedObservations = liveFeeds.flatMap((feed) => feed.state === 'ready' ? feed.observations : [])
  const liveObservations = liveFeedObservations.filter((observation) => liveSensors.some((key) => {
    const sensor = liveSensorOptions.find((item) => item.key === key)
    return sensor ? matchesLiveSensor(observation, sensor) : false
  }))
  const filteredLiveObservations = liveObservations.filter((observation) => liveConfidence.includes(nativeConfidenceBucket(observation.confidenceNative)) && liveDayNight.includes(observationDayNight(observation.dayNight)))
  const liveActivityCounts = liveObservations.reduce<Record<string, number>>((counts, observation) => {
    const date = observation.acquiredAtUtc?.slice(0, 10)
    if (date) counts[date] = (counts[date] ?? 0) + 1
    return counts
  }, {})
  const liveActivityDays = Object.entries(liveActivityCounts).sort(([a], [b]) => a.localeCompare(b))
  const liveActivityDayKey = liveActivityDays.map(([date]) => date).join('|')
  const liveActivityMax = Math.max(1, ...liveActivityDays.map(([, count]) => count))
  useEffect(() => {
    if (!selectedLiveDate) return
    if (!liveActivityCounts[selectedLiveDate]) { setSelectedLiveDate(null); return }
    const firstRecord = liveObservations.find((observation) => observation.acquiredAtUtc?.slice(0, 10) === selectedLiveDate)
    if (firstRecord) selectObservation(firstRecord)
  }, [liveActivityDayKey, selectedLiveDate])
  useEffect(() => {
    const updateDockDensity = () => setLiveDockCollapsed(window.matchMedia('(max-width: 760px)').matches)
    window.addEventListener('resize', updateDockDensity)
    return () => window.removeEventListener('resize', updateDockDensity)
  }, [])
  const liveFeedState = liveSelectedFeeds.some((feed) => feed.state === 'loading') ? 'loading' : liveSelectedFeeds.length > 0 && liveSelectedFeeds.every((feed) => feed.state === 'ready') ? 'ready' : liveSelectedFeeds.some((feed) => feed.state === 'ready') ? 'partial' : liveSelectedFeeds.some((feed) => feed.state === 'error') ? 'error' : 'idle'
  const livePeakFrp = filteredLiveObservations.reduce<number | null>((peak, observation) => observation.frpMw !== null && (peak === null || observation.frpMw > peak) ? observation.frpMw : peak, null)
  useEffect(() => {
    if (!livePlaybackRunning || active !== 'Live Map' || liveActivityDays.length < 2) return
    const timer = window.setInterval(() => {
      setSelectedLiveDate((current) => {
        const index = liveActivityDays.findIndex(([date]) => date === current)
        return liveActivityDays[(index + 1) % liveActivityDays.length][0]
      })
    }, 1100)
    return () => window.clearInterval(timer)
  }, [active, liveActivityDayKey, livePlaybackRunning])
  const visibleObservations = active === 'Calendar'
    ? calendarDateQueried ? calendarSelectedRecords : []
    : active === 'Compare' ? compareObservations : active === 'Live Map' ? liveHotspotsVisible ? filteredLiveObservations.filter((observation) => !selectedLiveDate || observation.acquiredAtUtc?.slice(0, 10) === selectedLiveDate) : [] : active === 'Data & Sources' ? sourceHotspotsVisible ? firms.observations : [] : firms.observations
  const selectCalendarDate = (date: string) => {
    setCalendarDate(date)
    const outsideLoadedWindow = !firms.queryRange || date < firms.queryRange.start || date > firms.queryRange.end
    if (firms.state !== 'ready' || outsideLoadedWindow) {
      setQueryEndDate(date)
      if (active === 'Compare') { void compareA.load(date); void compareB.load(date) }
      else void firms.load(date)
    }
  }
  const loadLiveSensors = (date: string | null = queryEndDate) => {
    if (liveSensors.includes('modis-terra') || liveSensors.includes('modis-aqua')) void liveModis.load(date)
    if (liveSensors.includes('noaa20')) void liveNoaa20.load(date)
    if (liveSensors.includes('noaa21')) void liveNoaa21.load(date)
  }
  const toggleLiveFilter = <T extends string,>(values: T[], setValues: (values: T[]) => void, value: T) => {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  }

  const moduleTitle = active === 'Field Situation' ? 'Field Situation' : active
  const openSelectedSourceInCompare = () => {
    const product = firms.source as FirmsProduct
    if (product.startsWith('MODIS')) {
      setCompareSourceA(product)
      setCompareSourceB('VIIRS_NOAA20_NRT')
    } else {
      setCompareSourceA('MODIS_NRT')
      setCompareSourceB(product)
    }
    setActive('Compare')
  }
  const openSourceArchiveCatalog = () => {
    setArchiveCatalogExpanded(true)
    if (firmsArchiveCatalog.status !== 'loading') void firmsArchiveCatalog.load()
  }
  const liveMapDock = <section className={`live-map-dock ${liveDockCollapsed ? 'collapsed' : ''}`} aria-label="Live Map layers and filters">
    <button type="button" className="live-dock-heading" aria-expanded={!liveDockCollapsed} onClick={() => setLiveDockCollapsed((collapsed) => !collapsed)}><span><Layers3 size={15} /></span><div><b>Map layers</b><small>{location.name} · {liveObservations.length.toLocaleString()} rows returned</small></div><span className={`live-dock-state ${liveFeedState}`} /><ChevronDown className="live-dock-chevron" size={14} /></button>
    <section className="live-dock-section"><div className="module-label">SATELLITE SOURCES</div><div className="live-source-list">{liveSensorOptions.map((sensor) => {
      const feed = sensor.source === 'MODIS_NRT' ? liveModis : sensor.source === 'VIIRS_NOAA20_NRT' ? liveNoaa20 : liveNoaa21
      const count = feed.state === 'ready' ? feed.observations.filter((observation) => matchesLiveSensor(observation, sensor)).length : null
      return <label className="live-check-row" key={sensor.key}><input type="checkbox" checked={liveSensors.includes(sensor.key)} onChange={() => toggleLiveFilter(liveSensors, setLiveSensors, sensor.key)} /><i style={{ '--sensor-color': sensor.color } as CSSProperties} /><span>{sensor.label}</span><small>{count === null ? feed.state === 'error' ? 'ERROR' : feed.state === 'loading' ? '…' : '—' : count.toLocaleString()}</small></label>
    })}</div><button className="primary-action live-dock-load" onClick={() => loadLiveSensors()} disabled={liveFeedState === 'loading' || liveSensors.length === 0}>{liveFeedState === 'loading' ? <><span className="spinner" /> Loading sources…</> : <><RefreshCw size={13} /> {liveFeedState === 'error' || liveFeedState === 'partial' ? 'Retry selected sources' : liveFeedState === 'ready' ? 'Refresh observations' : 'Load observations'}</>}</button>
    {liveFeedState === 'error' && <div className="firms-error"><AlertTriangle size={14} /><span>{[...new Set(liveSelectedFeeds.filter((feed) => feed.state === 'error').map((feed) => feed.message))].join(' · ') || 'Selected FIRMS sources are unavailable.'}</span></div>}
    {liveSelectedFeeds.some((feed) => feed.state === 'ready') && <small className="live-dock-provenance">{liveSelectedFeeds.filter((feed) => feed.state === 'ready').map((feed) => `${feed.source.replaceAll('_NRT', '')} · ${feed.queryRange?.start ?? '—'}–${feed.queryRange?.end ?? '—'}`).join('  /  ')}</small>}</section>
    <section className="live-dock-section"><div className="module-label">VISIBLE LAYERS</div><label className="live-check-row"><input type="checkbox" checked={windVisible} onChange={() => setWindVisible(!windVisible)} /><Wind size={14} /><span>Wind streamlines</span><small>{windField.state === 'ready' ? `${windField.nodes.length} pts` : windField.state.toUpperCase()}</small></label><label className="live-check-row"><input type="checkbox" checked={liveHotspotsVisible} onChange={() => setLiveHotspotsVisible((value) => !value)} /><Flame size={14} /><span>Thermal observations</span><small>{filteredLiveObservations.length.toLocaleString()}</small></label><label className="live-check-row"><input type="checkbox" checked={terrainEnabled} onChange={() => setTerrainEnabled(!terrainEnabled)} /><Mountain size={14} /><span>3D terrain</span><small>{terrainEnabled ? 'ON' : 'OFF'}</small></label>
    <div className="live-layer-unavailable"><Layers3 size={13} /><span>Satellite swaths</span><b>NO SOURCE</b></div><small className="live-dock-note">Wind is an hourly Open‑Meteo forecast. Thermal points are NASA FIRMS observations, not confirmed incidents.</small></section>
    <details className="live-dock-filters"><summary>Confidence & day/night <small>Filter source values</small></summary><div className="live-filter-group"><b>Confidence</b>{[['high', 'High'], ['nominal', 'Nominal'], ['low', 'Low'], ['unknown', 'Not provided / other']].map(([value, label]) => <label className="live-filter-option" key={value}><input type="checkbox" checked={liveConfidence.includes(value)} onChange={() => toggleLiveFilter(liveConfidence, setLiveConfidence, value)} /><span>{label}</span><small>{liveObservations.filter((observation) => nativeConfidenceBucket(observation.confidenceNative) === value).length}</small></label>)}</div><div className="live-filter-group"><b>Detection flag · UTC source</b>{[['day', 'Day'], ['night', 'Night'], ['unknown', 'Unknown']].map(([value, label]) => <label className="live-filter-option" key={value}><input type="checkbox" checked={liveDayNight.includes(value)} onChange={() => toggleLiveFilter(liveDayNight, setLiveDayNight, value)} /><span>{label}</span><small>{liveObservations.filter((observation) => observationDayNight(observation.dayNight) === value).length}</small></label>)}</div><small className="live-dock-note">Numeric MODIS confidence is bucketed for reading only; the source value remains unchanged.</small></details>
  </section>
  const liveInspector = <>
    <div className="panel-heading"><div><h2>Observation inspector</h2><p>Choose a returned hotspot on the map</p></div><span className="status-tag">{liveFeedState === 'ready' ? 'DATA READY' : liveFeedState.toUpperCase()}</span></div>
    {activeDetection ? <div className="detection-detail"><div className="module-label">SATELLITE OBSERVATION</div><b>{activeDetection.source.replaceAll('_', ' ')}</b><span>{activeDetection.latitude.toFixed(4)}°, {activeDetection.longitude.toFixed(4)}°</span><span>{activeDetection.acquiredAtUtc ? new Date(activeDetection.acquiredAtUtc).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Acquisition time unavailable'}</span>{activeDetection.restoredFromLink && <small>Restored from a share link · this record was not revalidated with NASA FIRMS.</small>}<div className="detail-grid"><span>Native confidence</span><b>{activeDetection.confidenceNative ?? 'not provided'}</b><span>FRP</span><b>{activeDetection.frpMw === null ? 'not provided' : `${activeDetection.frpMw} MW`}</b><span>Satellite</span><b>{activeDetection.satellite ?? 'not provided'}</b><span>Product version</span><b>{activeDetection.productVersion ?? 'not provided'}</b></div><small>Thermal anomaly observation · not a confirmed incident</small><button className="text-button live-clear-selection" onClick={() => setActiveDetection(null)}>Clear selection</button></div> : <div className="live-inspector-empty"><span><Satellite size={18} /></span><b>No observation selected</b><p>Click a hotspot or cluster to inspect its acquisition time, satellite, confidence and fire radiative power.</p></div>}
    <div className="live-inspector-metrics"><div><span>Visible records</span><b>{visibleObservations.length.toLocaleString()}</b></div><div><span>Peak FRP</span><b>{livePeakFrp === null ? '—' : `${livePeakFrp.toLocaleString()} MW`}</b></div></div>
    <p className="module-hint">FIRMS detections show thermal anomalies. They do not confirm an active incident or define its perimeter.</p>
  </>
  const dashboardPanel = <>
    <div className="panel-heading"><div><h2>Selected area briefing</h2><p>{location.name} · {location.lat.toFixed(3)}°, {location.lon.toFixed(3)}°</p></div><span className="status-tag">{firms.state === 'ready' ? 'OBSERVED' : 'CONTEXT'}</span></div>
    {firms.state === 'ready' && peakObservation ? <div className="briefing-hotspot"><div className="hotspot-emblem"><Flame size={19} /></div><div><span>Highest reported FRP in loaded window</span><b>{peakObservation.frpMw} MW</b><small>{peakObservation.satellite ?? firms.source} · {peakObservation.acquiredAtUtc ? new Date(peakObservation.acquiredAtUtc).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'acquisition time unavailable'}</small></div></div> : <div className="dashboard-briefing-state"><Satellite size={18} /><div><b>{firms.state === 'ready' ? 'No detections returned for this request' : firms.state === 'loading' ? 'Requesting satellite observations' : firms.state === 'error' ? 'Satellite request unavailable' : firms.configured === false && !firms.publicFeedAvailable ? 'NASA FIRMS key not configured' : 'Satellite observations not loaded'}</b><span>{firms.state === 'ready' ? 'This source and window returned no records; that does not establish that no fire is present.' : firms.state === 'error' ? firms.message : firms.configured === false && firms.publicFeedAvailable ? 'This product has a public Canada NRT feed for the latest 7 days; older dates use a matching local archive if present, otherwise a server key.' : firms.configured === false ? 'This product needs a matching local archive for the selected date or FIRMS_MAP_KEY on the server.' : 'Load the selected NASA FIRMS product to summarize observed thermal anomalies.'}</span>{firms.state !== 'loading' && <button className="text-button" onClick={() => void firms.load()}>{firms.state === 'error' ? 'Retry FIRMS request' : 'Load selected product'}</button>}</div></div>}
    <div className="dashboard-weather-heading"><span>FIELD CONDITIONS</span><button className="icon-button" aria-label="Refresh weather" onClick={retry}><RefreshCw size={14} /></button></div>
    {state === 'loading' && <div className="data-state"><span className="spinner" /> Loading weather observations…</div>}
    {state === 'error' && <div className="error-box"><AlertTriangle size={17} /><div><strong>Weather unavailable</strong><p>Check your connection, then retry.</p><button className="text-button" onClick={retry}>Retry weather request</button></div></div>}
    {weather && <>
      <div className="weather-primary"><div className="wind-glyph" style={{ transform: `rotate(${directionTo}deg)` }}><Wind size={25} /></div><div className="wind-value">{Math.round(displayWind)} <small>km/h</small><span>Blowing toward {windDirectionLabel(directionTo ?? 0)} · gusts {Math.round(weather.gusts)} km/h</span></div></div>
      <div className="weather-grid"><div className="weather-metric"><span><CloudRain size={15} /> Precipitation</span><b>{weather.precipitation.toFixed(1)} <small>mm</small></b><small>selected hour</small></div><div className="weather-metric"><span><Activity size={15} /> Temperature</span><b>{weather.temperature.toFixed(1)} <small>°C</small></b><small>2 m above ground</small></div></div>
      <div className="weather-grid"><div className="weather-metric"><span><Activity size={15} /> Relative humidity</span><b>{Math.round(weather.humidity)} <small>%</small></b><small>2 m above ground</small></div><div className="weather-metric"><span><Wind size={15} /> Wind gust</span><b>{Math.round(weather.gusts)} <small>km/h</small></b><small>10 m above ground</small></div></div>
      <div className={`wind-field-state ${windField.state}`}><span className="wind-state-mark"><Wind size={14} /></span><div><b>{windField.state === 'ready' ? `${windField.nodes.length} forecast points feeding the visible map` : windField.state === 'loading' ? windField.nodes.length ? 'Updating the wind grid for this view…' : 'Building the local wind field…' : windField.nodes.length ? 'Refresh failed · previous grid hidden' : 'Wind field unavailable'}</b><small>{windField.state === 'ready' ? `25 forecast points interpolated for the selected map extent and ${new Date(weather.time).toISOString().slice(0, 16).replace('T', ' ')} UTC; particles show direction and relative speed, not travel time` : windField.state === 'error' ? windField.nodes.length ? `${windField.error ?? 'Wind service unavailable'} · last grid from ${windField.retrievedAt ? new Date(windField.retrievedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'time unknown'} is kept in memory but is not drawn over this extent.` : 'No cached grid is available for this view. Check the connection, then retry.' : windField.nodes.length ? `Hiding the previous field while this extent loads${windField.retrievedAt ? ` · previous grid retrieved ${new Date(windField.retrievedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}.` : 'Fetching hourly speed and direction across the map extent.'}</small>{windField.state === 'error' && <button type="button" className="text-button wind-field-retry" onClick={windField.retry}>Retry wind grid</button>}</div></div>
      <div className="source-note"><Clock3 size={14} /><span>Valid {new Date(weather.time).toLocaleString('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC · Retrieved {retrievedAt ? new Date(retrievedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '—'} UTC · Open-Meteo</span></div>
    </>}
    <div className="important-note"><Flame size={15} /><span>Satellite thermal detections are not confirmed fires. No historical baseline, incident perimeter or suppression status is available here.</span></div>
  </>

  const fieldMobilePanel = fieldMobileTab === 'Map' ? <section className="field-mobile-panel" aria-label="Current area conditions">
    <header><div><h2>Area awareness</h2><p>{location.name} · conditions for the selected hour</p></div><Compass size={19} /></header>
    <div className="field-mobile-conditions">
      <div><Wind size={15} /><span>Wind · 10 m</span><b>{weather ? `${Math.round(weather.windSpeed)} km/h · ${windDirectionLabel(directionTo ?? 0)}` : 'Unavailable'}</b><small>{weather ? `${weather.time.slice(11, 16)} UTC · Open-Meteo` : 'Forecast not available'}</small></div>
      <div><CloudRain size={15} /><span>Hourly precipitation</span><b>{weather ? `${weather.precipitation.toFixed(1)} mm` : 'Unavailable'}</b><small>{weather ? 'Selected forecast hour' : 'Forecast not available'}</small></div>
      <div><Activity size={15} /><span>Relative humidity</span><b>{weather ? `${Math.round(weather.humidity)}%` : 'Unavailable'}</b><small>Open-Meteo · 2 m</small></div>
    </div>
    <div className="field-mobile-source-status"><span className={`field-mobile-state-dot ${firms.state}`} /><div><b>{firms.state === 'ready' && archiveCoverageUnknown && firms.observations.length === 0 ? 'No archive rows · coverage unknown' : firms.state === 'ready' ? `${firms.observations.length.toLocaleString()} FIRMS observations returned` : firms.state === 'loading' ? 'Requesting satellite observations' : firms.configured === false && !firms.publicFeedAvailable ? 'NASA FIRMS key not configured' : firms.state === 'error' ? 'Satellite request unavailable' : firms.publicFeedAvailable && !firms.configured ? 'Public recent FIRMS feed available' : 'Satellite observations not loaded'}</b><small>{firms.state === 'ready' ? `${firms.source} · ${firmsAccessLabel(firms.accessMode)} · ${firms.queryRange?.start ?? '—'} to ${firms.queryRange?.end ?? '—'} UTC${firms.accessMode === 'public-nrt-canada-csv' && firms.sourceDateRange && firms.queryRange && firms.sourceDateRange.maxDate < firms.queryRange.end ? ` · feed rows through ${firms.sourceDateRange.maxDate}; later dates unknown` : ''}${archiveCoverageUnknown ? ` · ${firms.message}` : ''}` : firms.configured === false && !firms.publicFeedAvailable ? 'Map observations need a server key.' : firms.publicFeedAvailable && !firms.configured ? 'Public Canada NRT · latest 7 days. Older dates use a matching local archive or server key.' : 'Thermal detections are not confirmed incidents.'}</small></div></div>
    <div className="field-mobile-refresh-row"><span>{windField.state === 'ready' ? `${windField.nodes.length} wind-grid points · ${retrievedAt ? new Date(retrievedAt).toISOString().slice(11, 16) : '—'} UTC` : `Wind forecast ${windField.state}`}</span><button className="primary-action" onClick={() => void firms.load(queryEndDate)} disabled={firms.state === 'loading'}><RefreshCw size={13} /> {firms.state === 'loading' ? 'Updating' : firms.state === 'error' ? 'Retry updates' : 'Refresh updates'}</button></div>
    <div className="important-note field-warning"><AlertTriangle size={15} /><span>Forecasts and satellite observations are context for awareness; they do not confirm an incident or provide operational instructions.</span></div>
  </section> : fieldMobileTab === 'Updates' ? <section className="field-mobile-panel" aria-label="Satellite updates">
    <header><div><h2>Satellite updates</h2><p>{firms.source.replaceAll('_', ' ')} · {firms.days} UTC {firms.days === 1 ? 'day' : 'days'}</p></div><Satellite size={18} /></header>
    <div className="field-mobile-filters"><label htmlFor="field-mobile-product">Sensor product<select id="field-mobile-product" value={firmsProduct} onChange={(event) => setFirmsProduct(event.target.value as FirmsProduct)}>{firmsSources.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label htmlFor="field-mobile-date">End date · UTC<input id="field-mobile-date" type="date" max={currentUtcDate} value={queryEndDate ?? currentUtcDate} onChange={(event) => { const date = event.target.value || null; setQueryEndDate(date); if (date) void firms.load(date) }} /></label><label htmlFor="field-mobile-days">Window<select id="field-mobile-days" value={firmsDays} onChange={(event) => setFirmsDays(Number(event.target.value) as 1 | 2 | 3 | 5)}><option value={1}>1 day</option><option value={2}>2 days</option><option value={3}>3 days</option><option value={5}>5 days</option></select></label></div>
    <div className={`field-mobile-source-status ${firms.state}`}><span className={`field-mobile-state-dot ${firms.state}`} /><div><b>{firms.state === 'ready' ? `${firms.observations.length.toLocaleString()} observations returned` : firms.state === 'loading' ? 'Loading selected source' : firms.configured === false && !firms.publicFeedAvailable ? 'NASA FIRMS key not configured' : firms.state === 'error' ? 'Request unavailable' : firms.publicFeedAvailable && !firms.configured ? 'Public recent FIRMS feed available' : 'No request for this area yet'}</b><small>{firms.state === 'ready' && firms.fetchedAt ? `Retrieved ${new Date(firms.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · ${firmsAccessLabel(firms.accessMode)} · ${firms.queryRange?.start ?? '—'} → ${firms.queryRange?.end ?? '—'}` : firms.message || (firms.publicFeedAvailable && !firms.configured ? 'Public Canada NRT · latest 7 days. Older dates use a matching local archive or server key.' : 'Refresh to request the selected product and date window.')}</small></div></div>
    <button className="primary-action field-mobile-refresh" onClick={() => void firms.load(queryEndDate)} disabled={firms.state === 'loading'}><RefreshCw size={14} /> {firms.state === 'loading' ? 'Requesting updates…' : firms.state === 'error' ? 'Retry FIRMS request' : 'Refresh satellite updates'}</button>
    {firms.state === 'ready' && firms.observations.length > 0 ? <div className="field-mobile-observations">{firms.observations.slice(0, 20).map((observation) => <button key={observation.id} onClick={() => { selectObservation(observation); setActive('Live Map') }}><span><Flame size={14} /><b>{observation.source.replaceAll('_', ' ')}</b></span><strong>{observation.frpMw === null ? 'FRP —' : `${observation.frpMw} MW`}</strong><small>{observation.acquiredAtUtc ? `${new Date(observation.acquiredAtUtc).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Time unavailable'} · {observation.latitude.toFixed(3)}°, {observation.longitude.toFixed(3)}°</small></button>)}</div> : firms.state === 'ready' ? <div className="field-mobile-empty"><Satellite size={17} /><span>{archiveCoverageUnknown ? 'No rows were returned from the local archive. Coverage is unknown; this does not establish that no fire is present.' : firms.message || 'No observations were returned for this request. That does not establish that no fire is present.'}</span></div> : firms.state === 'error' ? <div className="field-mobile-empty"><AlertTriangle size={17} /><span>{firms.message}</span></div> : <div className="field-mobile-empty"><Satellite size={17} /><span>Returned observations appear here with their source and UTC acquisition time.</span></div>}
  </section> : fieldMobileTab === 'Layers' ? <section className="field-mobile-panel" aria-label="Map layers and sources">
    <header><div><h2>Map layers</h2><p>Toggle the shared map overlays</p></div><Layers3 size={19} /></header>
    <button className="field-mobile-layer-toggle" aria-pressed={windVisible} onClick={() => setWindVisible((visible) => !visible)}><span><Wind size={16} /><span><b>Wind speed & flow</b><small>{windVisible ? `${windField.nodes.length || '—'} forecast points · ${weather?.time.slice(11, 16) ?? '—'} UTC` : 'Hidden from the map'} · Open-Meteo</small></span></span><strong>{windVisible ? 'ON' : 'OFF'}</strong></button>
    <div className="field-mobile-layer-toggle read-only"><span><Mountain size={16} /><span><b>Terrain relief</b><small>2D on mobile · AWS Terrarium elevation source</small></span></span><strong>2D</strong></div>
    <div className="field-mobile-layer-toggle read-only"><span><CloudRain size={16} /><span><b>Hourly conditions</b><small>{weather ? `Rain ${weather.precipitation.toFixed(1)} mm · humidity ${Math.round(weather.humidity)}%` : 'Weather forecast unavailable'} · Open-Meteo</small></span></span><strong>{weather ? 'READY' : '—'}</strong></div>
    <p className="module-hint">Wind shading shows forecast speed and animated streamlines show forecast direction. Neither is a fire-spread prediction.</p>
  </section> : <FieldReports location={location} wind={weather ? { speedKmh: weather.windSpeed, directionTo: windDirectionLabel(directionTo ?? 0), validAtUtc: weather.time } : null} />
  const isFieldMobile = active === 'Field Situation' && isMobileViewport
  useEffect(() => {
    if (!isFieldMobile) return
    const workspace = document.querySelector<HTMLElement>('.field-situation-workspace')
    if (!workspace) return
    const toolbar = workspace.querySelector('.map-toolbar')
    const safetyBanner = workspace.querySelector('.field-mobile-safety-banner')
    const updateSheetTop = () => {
      const workspaceTop = workspace.getBoundingClientRect().top
      const contentBottom = Math.max(workspaceTop, toolbar?.getBoundingClientRect().bottom ?? workspaceTop, safetyBanner?.getBoundingClientRect().bottom ?? workspaceTop)
      workspace.style.setProperty('--field-mobile-sheet-top', `${Math.ceil(contentBottom - workspaceTop + 8)}px`)
    }
    const observer = new ResizeObserver(updateSheetTop)
    observer.observe(workspace)
    if (toolbar) observer.observe(toolbar)
    if (safetyBanner) observer.observe(safetyBanner)
    window.addEventListener('resize', updateSheetTop)
    updateSheetTop()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSheetTop)
      workspace.style.removeProperty('--field-mobile-sheet-top')
    }
  }, [isFieldMobile])
  const compareSameWindow = Boolean(compareA.queryRange && compareB.queryRange
    && compareA.queryRange.start === compareB.queryRange.start
    && compareA.queryRange.end === compareB.queryRange.end)
  const commonGridState = compareA.state === 'error' || compareB.state === 'error'
    ? 'error'
    : compareA.state === 'ready' && compareB.state === 'ready'
      ? compareSameWindow ? 'ready' : 'mismatch'
      : 'loading'
  const moduleBody = active === 'Dashboard' ? dashboardPanel : active === 'Calendar' ? <CalendarWeekDetails selectedDate={calendarSelectedDate} observations={firms.observations} observationState={firms.state} days={firms.days} source={firms.source} windowStart={calendarWindowStart} windowEnd={calendarWindowEnd} coverageUnknown={archiveCoverageUnknown} unknownBeforeDate={unknownBeforeDate} unknownAfterDate={unknownAfterDate} /> : active === 'Live Map' ? null : active === 'Compare' ? <>
    <div className="panel-heading"><div><h2>Detection trends</h2><p>Daily returned records · UTC</p></div><Activity size={18} /></div>
    <p className="compare-intro">Each line shows observations returned by its own product for the selected area and dates.</p>
    <div className="compare-trend-stack"><CompareTrend feed={compareA} tone="modis" /><CompareTrend feed={compareB} tone="viirs" /></div>
    <div className="compare-metric-grid"><div><span>MODIS returned</span><b>{compareA.state === 'ready' ? compareA.observations.length.toLocaleString() : '—'}</b></div><div><span>VIIRS returned</span><b>{compareB.state === 'ready' ? compareB.observations.length.toLocaleString() : '—'}</b></div><div><span>Dates with records in both</span><b>{compareA.state === 'ready' && compareB.state === 'ready' ? (() => { const a = new Set(compareA.observations.map((item) => item.acquiredAtUtc?.slice(0, 10)).filter(Boolean)); return new Set(compareB.observations.map((item) => item.acquiredAtUtc?.slice(0, 10)).filter((day) => day && a.has(day))).size })() : '—'}</b></div></div>
    <div className="compare-validation"><AlertTriangle size={15} /><div><b>Agreement not evaluated</b><p>Shared dates mean both products returned records on those UTC days. This does not measure shared overpass, spatial coverage, or detection agreement. No calibration score is available.</p></div></div>
    <CommonGridPreview modis={compareA.observations} viirs={compareB.observations} modisProduct={compareA.source} viirsProduct={compareB.source} modisAccess={compareA.accessMode} viirsAccess={compareB.accessMode} queryRange={compareA.queryRange} center={{ latitude: location.lat, longitude: location.lon }} state={commonGridState} />
    {activeDetection && <div className="detection-detail"><div className="module-label">SELECTED SATELLITE OBSERVATION</div><b>{activeDetection.source.replaceAll('_', ' ')}</b><span>{activeDetection.latitude.toFixed(4)}°, {activeDetection.longitude.toFixed(4)}°</span><span>{activeDetection.acquiredAtUtc ? new Date(activeDetection.acquiredAtUtc).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Acquisition time unavailable'}</span>{activeDetection.restoredFromLink && <small>Restored from a share link · this record was not revalidated with NASA FIRMS.</small>}<div className="detail-grid"><span>Native confidence</span><b>{activeDetection.confidenceNative ?? 'not provided'}</b><span>FRP</span><b>{activeDetection.frpMw === null ? 'not provided' : `${activeDetection.frpMw} MW`}</b><span>Satellite</span><b>{activeDetection.satellite ?? 'not provided'}</b><span>Product version</span><b>{activeDetection.productVersion ?? 'not provided'}</b></div><small>Thermal anomaly observation · not a confirmed incident</small></div>}
  </> : active === 'Terrain' ? <>
    <div className="panel-heading"><div><h2>Selected terrain cell</h2><p>{Math.abs(location.lat).toFixed(4)}° {location.lat >= 0 ? 'N' : 'S'} · {Math.abs(location.lon).toFixed(4)}° {location.lon >= 0 ? 'E' : 'W'}</p></div><span className={`terrain-state-tag ${terrainAnalysis.state}`}>{terrainAnalysis.state === 'ready' ? 'SAMPLED' : terrainAnalysis.state === 'loading' ? 'READING DEM' : terrainAnalysis.state === 'error' ? 'UNAVAILABLE' : 'IDLE'}</span></div>
    <div className="terrain-metric-grid"><div><span>Elevation · DEM</span><b>{terrainAnalysis.elevationM === null ? '—' : `${Math.round(terrainAnalysis.elevationM).toLocaleString()} m`}</b><small>above sea level</small></div><div><span>Local slope</span><b>{terrainAnalysis.slopeDegrees === null ? '—' : `${terrainAnalysis.slopeDegrees.toFixed(1)}°`}</b><small>Horn 3×3 · local relief</small></div><div><span>Aspect · downhill</span><b>{terrainAnalysis.aspectDegrees === null ? terrainAnalysis.state === 'ready' ? (terrainAnalysis.slopeDegrees ?? 0) < 2 ? 'Near-flat' : '—' : '—' : `${Math.round(terrainAnalysis.aspectDegrees)}° ${terrainAspectLabel(terrainAnalysis.aspectDegrees)}`}</b><small>{terrainAnalysis.state === 'ready' && (terrainAnalysis.slopeDegrees ?? 0) < 2 ? 'unstable below 2° slope' : 'downslope azimuth'}</small></div></div>
    {terrainAnalysis.state === 'error' && <div className="terrain-fetch-error"><AlertTriangle size={15} /><span>{terrainAnalysis.error ?? 'Terrain tiles could not be read.'}</span><button onClick={() => setTerrainRefresh((value) => value + 1)}>Retry</button></div>}
    {terrainAnalysis.state === 'ready' && elevation.state === 'ready' && <div className="terrain-source-check"><span>Independent elevation cross-check · Open-Meteo</span><b>{Math.round(elevation.value).toLocaleString()} m</b><small>{Math.abs(Math.round(elevation.value - terrainAnalysis.elevationM!))} m difference from selected Terrarium sample</small></div>}
    <div className="terrain-context-card"><Mountain size={17} /><div><b>Relief from a bare-earth elevation tile</b><p>{terrainAnalysis.state === 'ready' ? `Slope uses a 3×3 Horn neighborhood with approximately ${Math.round(terrainAnalysis.sampleSpacingM ?? 0)} m between samples. The A—B section samples 25 points across 80 km.` : terrainAnalysis.state === 'loading' ? 'Reading the selected z12 Terrarium tile and sampling the local cross-section.' : 'Terrain-derived values appear when the elevation tile is available.'}</p></div></div>
    <div className="module-section terrain-source-section"><div className="module-label">LAYERS & DATA LIMITS</div><div className="layer-row"><span><Mountain size={15} /> Elevation relief</span><button className={`terrain-toggle ${terrainEnabled ? 'on' : ''}`} onClick={() => setTerrainEnabled((value) => !value)} aria-pressed={terrainEnabled}>{terrainEnabled ? '3D ON' : 'OFF'}</button></div><div className="layer-row"><span><Activity size={15} /> A—B terrain transect</span><button className={`terrain-toggle ${transectVisible ? 'on' : ''}`} onClick={() => setTransectVisible((value) => !value)} aria-pressed={transectVisible}>{transectVisible ? 'VISIBLE' : 'HIDDEN'}</button></div><div className="layer-row"><span><Mountain size={15} /> Slope / aspect</span><b className={terrainAnalysis.state === 'ready' ? 'layer-on' : ''}>{terrainAnalysis.state === 'ready' ? 'POINT SAMPLE' : terrainAnalysis.state.toUpperCase()}</b></div><div className="layer-row muted-row"><span><Layers3 size={15} /> Land cover / fuel class</span><b>NO SOURCE</b></div><p className="module-hint">No land-cover, fuel, canopy, or water raster is connected. A point slope estimate is not a regional slope layer and must not be used as a fire-spread model input without validation.</p></div>
    <div className="terrain-attribution"><b>Source & attribution</b><span>Mapzen Terrain Tiles · Terrarium RGB · Canadian terrain data © Open Government Licence — Canada</span><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Dataset details <ChevronRight size={12} /></a></div>
  </> : active === 'Data & Sources' ? <>
    <div className="panel-heading"><div><h2>Data & provenance</h2><p>Sources currently used in this view</p></div><Database size={18} /></div>
    <SourceFocusCard selected={selectedDataSource} location={location} feed={firms} windField={windField} windTime={weather?.time} terrainAnalysis={terrainAnalysis} elevation={elevation} archiveCatalog={firmsArchiveCatalog} onOpenCompare={openSelectedSourceInCompare} onOpenTerrain={() => setActive('Terrain')} onOpenLiveMap={() => setActive('Live Map')} onRetryWind={() => windField.retry()} onRetryElevation={() => setElevationRefresh((current) => current + 1)} onRefreshArchive={openSourceArchiveCatalog} />
    <div className="source-card"><div><Wind size={16} /><b>Open-Meteo wind grid</b><span className={windField.state === 'ready' ? 'source-live' : 'source-missing'}>{windField.state === 'ready' ? 'CONNECTED' : windField.state === 'loading' && windField.nodes.length ? 'UPDATING VIEW' : windField.state.toUpperCase()}</span></div><p>{windField.state === 'ready' ? `${windField.nodes.length} forecast points interpolate hourly wind speed and direction across the visible map extent.` : windField.nodes.length ? 'The previous map grid stays visible while this camera extent refreshes.' : 'A 5 × 5 forecast grid drives the map wind field.'}</p><small>25 points · viewport-relative grid · UTC · selected timeline hour · vector interpolation · {windField.retrievedAt ? `retrieved ${new Date(windField.retrievedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'not yet retrieved'}</small><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">API documentation <ChevronRight size={12} /></a></div>
    <div className="source-card"><div><Mountain size={16} /><b>Mapzen Terrain Tiles · Terrarium</b><span className={terrainAnalysis.state === 'ready' ? 'source-live' : 'source-missing'}>{terrainAnalysis.state === 'ready' ? 'SAMPLED' : terrainAnalysis.state.toUpperCase()}</span></div><p>Bare-earth elevation tiles drive the 3D relief and the selected-point slope/aspect and transect samples.</p><small>Terrarium RGB · Canadian source attribution: Open Government Licence — Canada. Land cover and fuel classes remain unconnected.</small><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Dataset details <ChevronRight size={12} /></a></div>
    <div className="source-card"><div><Mountain size={16} /><b>Open-Meteo Elevation</b><span className={elevation.state === 'ready' ? 'source-live' : 'source-missing'}>{elevation.state === 'ready' ? 'CONNECTED' : elevation.state.toUpperCase()}</span></div><p>{elevation.state === 'ready' ? `Point elevation: ${Math.round(elevation.value)} m.` : 'Point elevation lookup for selected coordinates.'}</p><small>One coordinate sample · metres above sea level</small></div>
    <div className="source-card source-disconnected"><div><Satellite size={16} /><b>NASA FIRMS · product coverage</b><span className={firmsCoverage.status === 'ready' ? 'source-live' : 'source-missing'}>{firmsCoverage.status === 'ready' ? `${firmsCoverage.products.length} PRODUCTS` : firmsCoverage.status === 'loading' ? 'CHECKING…' : firmsCoverage.status === 'key-missing' ? 'KEY NOT SET' : 'COVERAGE UNKNOWN'}</span></div><p>MODIS and VIIRS area requests run through the server-side proxy. The MAP_KEY is never sent to the browser. These date ranges describe product availability, not clear-sky coverage or guaranteed detections at this location.</p><button className="coverage-refresh" onClick={() => void firmsCoverage.load()} disabled={firmsCoverage.status === 'loading'}>{firmsCoverage.status === 'loading' ? <><span className="spinner" /> Checking product dates…</> : <><RefreshCw size={12} /> {firmsCoverage.status === 'ready' ? 'Refresh product coverage' : 'Check NASA product coverage'}</>}</button>{firmsCoverage.status === 'ready' ? <div className="firms-coverage-list">{firmsSources.map((item) => { const match = firmsCoverage.products.find((product) => product.product === item.id); return <div className="firms-coverage-row" key={item.id}><span>{item.label}</span><b>{match ? `${match.minDate} → ${match.maxDate}` : 'Not listed by FIRMS'}</b></div> })}{firmsCoverage.fetchedAtUtc && <small>Coverage retrieved {new Date(firmsCoverage.fetchedAtUtc).toISOString().slice(0, 16).replace('T', ' ')} UTC · cached for one hour</small>}</div> : <small>{firmsCoverage.status === 'key-missing' ? 'Set FIRMS_MAP_KEY in the server’s local .env file to query availability.' : firmsCoverage.status === 'error' ? firmsCoverage.message : 'Select Check NASA product coverage to query the current ranges reported by FIRMS.'}</small>}<small>{firms.state === 'ready' ? `${firms.observations.length.toLocaleString()} normalized detections · ${firms.source}` : 'Coverage comes from NASA’s data_availability service; historical imports and per-location observation completeness are separate.'}</small><a href="https://firms.modaps.eosdis.nasa.gov/api/data_availability/" target="_blank" rel="noreferrer">FIRMS availability API <ChevronRight size={12} /></a></div>
    <div className="source-card archive-catalog-card"><div><Database size={16} /><b>Local FIRMS archive catalog</b><span className={firmsArchiveCatalog.status === 'ready' && firmsArchiveCatalog.archives.length ? 'source-live' : 'source-missing'}>{firmsArchiveCatalog.status === 'loading' ? 'SCANNING' : firmsArchiveCatalog.status === 'error' ? 'UNAVAILABLE' : firmsArchiveCatalog.status === 'ready' ? `${firmsArchiveCatalog.archives.length} IMPORTS` : 'NOT LOADED'}</span></div><p>{firmsArchiveCatalog.status === 'ready' && !firmsArchiveCatalog.archives.length ? 'No historical import is registered in this workspace.' : 'Verified import manifests from this workspace; the original archive files remain local.'}</p><button className="coverage-refresh" aria-expanded={archiveCatalogExpanded} onClick={() => { const expanded = !archiveCatalogExpanded; setArchiveCatalogExpanded(expanded); if (expanded && (firmsArchiveCatalog.status === 'idle' || firmsArchiveCatalog.status === 'error')) void firmsArchiveCatalog.load() }}>{archiveCatalogExpanded ? 'Hide archive details' : 'View archive catalog'}</button>{archiveCatalogExpanded && <><div className="archive-catalog-actions"><small>Manifests and QA pairs · raw and normalized files are never served by this route.</small><button type="button" onClick={() => void firmsArchiveCatalog.load()} disabled={firmsArchiveCatalog.status === 'loading'}><RefreshCw size={12} /> Refresh</button></div>{firmsArchiveCatalog.status === 'error' ? <small className="archive-catalog-warning">{firmsArchiveCatalog.message}</small> : firmsArchiveCatalog.status === 'loading' ? <small>Checking data/manifests/firms for valid manifests and QA reports.</small> : firmsArchiveCatalog.status === 'ready' && firmsArchiveCatalog.archives.length ? <div className="archive-catalog-list">{firmsArchiveCatalog.archives.map((archive) => <article className="archive-catalog-item" key={archive.importId}><div><b>{firmsSources.find((item) => item.id === archive.product)?.label ?? archive.product}</b><span className={archive.qaStatus === 'accepted' ? 'archive-qa-good' : 'archive-qa-review'}>{archive.qaStatus === 'accepted' ? 'QA ACCEPTED' : 'ACCEPTED WITH EXCLUSIONS'}</span></div><small>{archive.minDateUtc} → {archive.maxDateUtc} UTC</small><small>{archive.rowsAccepted.toLocaleString()} rows accepted · {archive.rowsRejected.toLocaleString()} rejected · {archive.rowsDuplicate.toLocaleString()} duplicate</small><small>{archive.sourceFile}{archive.sourceRetrievedAtUtc ? ` · retrieved ${new Date(archive.sourceRetrievedAtUtc).toISOString().slice(0, 10)} UTC` : ' · retrieval time not recorded'}</small><code title={archive.sourceSha256}>SHA‑256 · {archive.sourceSha256.slice(0, 16)}…</code>{archive.warnings.length > 0 && <small className="archive-catalog-warning">{archive.warnings[0]}</small>}</article>)}{firmsArchiveCatalog.invalidManifestCount > 0 && <small className="archive-catalog-warning">{firmsArchiveCatalog.invalidManifestCount} invalid manifest or QA pair(s) were skipped.</small>}{firmsArchiveCatalog.truncated && <small>Showing the first 500 manifests.</small>}</div> : firmsArchiveCatalog.status === 'ready' ? <div className="archive-catalog-empty"><b>No historical archive imported</b><span>Import a real FIRMS CSV with the local CLI to populate this catalog. Until then, Calendar remains limited to live API requests.</span><code>npm run data:firms:ingest -- --file … --product …</code></div> : <small>Opening the catalog does not query NASA or publish archive files.</small>}</>}</div>
  </> : active === 'Scenario' ? <>
    <div className="scenario-banner"><AlertTriangle size={16} /><div><b>SCENARIO ONLY</b><span>Not an operational forecast or instruction</span></div></div>
    <div className="panel-heading"><div><h2>Wind sensitivity</h2><p>Explore an input; no fire spread is computed</p></div><Flame size={18} /></div>
    {weather && <div className="scenario-source">Input at {new Date(weather.time).toISOString().slice(0, 16).replace('T', ' ')} UTC · source forecast {Math.round(weather.windSpeed)} km/h {windDirectionLabel(weather.windDirectionFrom)}</div>}
    <label className="field-label" htmlFor="wind-override">Wind speed hypothesis <b>{windOverride ?? Math.round(weather?.windSpeed ?? 0)} km/h</b></label><input id="wind-override" type="range" min="0" max="100" value={windOverride ?? Math.round(weather?.windSpeed ?? 0)} onChange={(event) => setWindOverride(Number(event.target.value))} />
    <div className="scenario-wind-note"><span>Map colors and stream speed are rescaled against the selected forecast. Direction is retained; this is a uniform sensitivity view, not a fire-spread calculation.</span>{windOverride !== null && <button type="button" onClick={() => setWindOverride(null)}>Use forecast</button>}</div>
    <label className="field-label" htmlFor="horizon">Scenario horizon <b>{horizon} hours</b></label><select id="horizon" className="module-select" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}><option value={1}>1 hour</option><option value={3}>3 hours</option><option value={6}>6 hours</option><option value={12}>12 hours</option><option value={24}>24 hours</option></select>
    <div className="module-empty compact-empty"><Mountain size={19} /><b>Spread envelope unavailable</b><p>A dated incident perimeter, documented fuel type, fuel moisture, terrain raster and validated FBP model are missing. This view will not draw synthetic fire growth.</p></div>
    <div className="scenario-input-state"><span>Weather input</span><b>{weather ? 'Available · Open-Meteo' : 'Loading'}</b><span>Incident perimeter</span><b>Missing</b><span>FBP fuel & moisture</span><b>Missing</b><span>Validated model</span><b>Not configured</b></div>
  </> : <FieldReports location={location} wind={weather ? { speedKmh: weather.windSpeed, directionTo: windDirectionLabel(directionTo ?? 0), validAtUtc: weather.time } : null} />

  return <div className="app-shell">
    <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`} aria-label="Primary navigation">
      <div className="brand"><span className="brand-orbit"><Flame size={19} /></span><span className="brand-name">Orbit Ember <b>Watch</b></span><button className="mobile-close" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="nav-group-label">WORKSPACE</div>
      <nav className="nav-list">{navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => { setActive(label as WorkspaceView); setNavOpen(false) }} aria-current={active === label ? 'page' : undefined}>
        <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Scenario' && <span className="nav-soon">WHAT-IF</span>}
      </button>)}</nav>
      <div className="sidebar-bottom"><div className="source-mark"><Satellite size={16} /><span>Earth observation workspace</span></div><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS <ChevronRight size={13} /></a></div>
    </aside>
    {navOpen && <button className="nav-backdrop" onClick={() => setNavOpen(false)} aria-label="Close navigation" />}

    <main className={`main-shell ${active === 'Compare' ? 'compare-active' : ''} ${active === 'Field Situation' ? 'field-situation-shell' : ''}`}>
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div className="page-heading"><h1>{moduleTitle}</h1><span>Alberta fire intelligence</span></div>
        <div className="global-controls"><label className="control location-control"><LocateFixed size={15} /><select aria-label="Select location" value={workspaceLocations.some((item) => item.name === location.name) ? location.name : '__map__'} onChange={(event) => { const next = workspaceLocations.find((item) => item.name === event.target.value); if (next) setLocation(next) }}>{workspaceLocations.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}{!workspaceLocations.some((item) => item.name === location.name) && <option value="__map__">{location.name}</option>}</select><ChevronDown size={14} /></label><label className="control product-control" title="NASA FIRMS sensor product"><Satellite size={15} /><select aria-label="NASA FIRMS sensor product" value={firmsProduct} onChange={(event) => setFirmsProduct(event.target.value as FirmsProduct)}>{firmsSources.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={14} /></label><label className="control observation-date-control" title="NASA FIRMS end date in UTC"><CalendarDays size={15} /><input type="date" aria-label="NASA FIRMS end date in UTC" max={new Date().toISOString().slice(0, 10)} value={queryEndDate ?? new Date().toISOString().slice(0, 10)} onChange={(event) => { const date = event.target.value || null; setQueryEndDate(date); if (date) { if (active === 'Compare') { void compareA.load(date); void compareB.load(date) } else if (active === 'Live Map') loadLiveSensors(date); else void firms.load(date) } }} /></label><label className="control date-control" title="NASA FIRMS observation window"><CalendarDays size={15} /><select aria-label="NASA FIRMS observation window" value={firmsDays} onChange={(event) => setFirmsDays(Number(event.target.value) as 1 | 2 | 3 | 5)}><option value={1}>1 UTC day</option><option value={2}>Last 2 UTC days</option><option value={3}>Last 3 UTC days</option><option value={5}>Last 5 UTC days</option></select><ChevronDown size={14} /></label><button className="help-button" aria-label="Open data and source help" title="Open Data & Sources for source definitions and limitations" onClick={() => setActive('Data & Sources')}><CircleHelp size={18} /></button></div>
      </header>

      <section className={`workspace ${active === 'Dashboard' ? 'dashboard-workspace' : active === 'Calendar' ? 'calendar-workspace' : active === 'Compare' ? 'compare-workspace' : active === 'Terrain' ? 'terrain-workspace' : active === 'Live Map' ? 'live-map-workspace' : active === 'Scenario' ? 'scenario-workspace' : active === 'Data & Sources' ? 'sources-workspace' : ''} ${active === 'Field Situation' ? 'field-situation-workspace' : ''}`}>
        <div className="map-column">
          <div className="map-toolbar"><div className="map-title"><span className="eyebrow-icon"><Map size={15} /></span><div><strong>{location.name}</strong><small>{active === 'Scenario' ? 'Hypothetical inputs · no spread perimeter available' : active === 'Compare' ? 'MODIS + VIIRS detections · shared area and UTC window' : `${windField.state === 'ready' ? `${windField.nodes.length} point live wind field` : 'Live wind field loading'} · click map to inspect a location`}</small></div></div><div className="map-actions"><button className="map-mode-button" aria-pressed={isFieldMobile ? false : terrainEnabled} disabled={isFieldMobile} title={isFieldMobile ? 'Field Situation uses a lighter 2D map on mobile' : terrainEnabled ? 'Switch to flat 2D map' : 'Enable 3D terrain'} onClick={() => setTerrainEnabled((value) => !value)}><Mountain size={15} /><span>{isFieldMobile ? '2D' : terrainEnabled ? '3D' : '2D'}</span></button><button className={`map-mode-button ${windVisible ? 'mode-active' : ''}`} aria-pressed={windVisible} title={windVisible ? 'Hide animated wind field' : 'Show animated wind field'} onClick={() => setWindVisible((value) => !value)}><Wind size={15} /><span>Wind</span></button><button className="icon-button" title="Search map" aria-label="Search map" onClick={() => document.querySelector<HTMLSelectElement>('.location-control select')?.focus()}><Search size={16} /></button><button className="icon-button" title="Map layers" aria-label="Map layers" onClick={() => setActive('Live Map')}><Layers3 size={16} /></button></div></div>
          {isFieldMobile && <div className="field-mobile-safety-banner" role="note"><AlertTriangle size={15} /><span>Situational awareness only · no validated spread forecast · confirm with incident command.</span></div>}
          {active === 'Compare' ? <div className={`compare-map-stage ${compareMode}`}>
            <section className="compare-control-dock" aria-label="Sensor products to compare">
              <header><span className="compare-dock-icon"><Layers3 size={15} /></span><div><b>Compare sensors</b><small>Same area · same UTC window</small></div></header>
              <span className="compare-mode-label">COMPARISON VIEW</span>
              <div className="compare-mode-control compare-dock-mode-control" role="group" aria-label="Comparison map layout"><button className={compareMode === 'swipe' ? 'selected' : ''} onClick={() => setCompareMode('swipe')} aria-pressed={compareMode === 'swipe'}>↔ Swipe</button><button className={compareMode === 'side-by-side' ? 'selected' : ''} onClick={() => setCompareMode('side-by-side')} aria-pressed={compareMode === 'side-by-side'}>▥ Side-by-side</button></div>
              <div className="compare-source-control modis"><label htmlFor="compare-source-a"><span><i /> Sensor A · MODIS</span><select id="compare-source-a" value={compareSourceA} onChange={(event) => setCompareSourceA(event.target.value as FirmsProduct)}>{firmsSources.filter((item) => item.id.startsWith('MODIS')).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div><span className={`compare-state-dot ${compareA.state}`} />{compareA.state === 'ready' ? `${compareA.observations.length.toLocaleString()} rows returned` : compareA.state === 'error' ? 'Request unavailable · retry' : compareA.state === 'loading' ? 'Requesting NASA FIRMS…' : compareA.publicFeedAvailable ? 'Public Canada feed · latest 7 days' : compareA.configured === false ? 'No key · matching local archive may be available' : 'Ready to load'}</div><button className="primary-action" onClick={() => void compareA.load()} disabled={compareA.state === 'loading'}>{compareA.state === 'loading' ? <><span className="spinner" /> Loading MODIS…</> : <><RefreshCw size={13} /> {compareA.state === 'error' ? 'Retry MODIS' : compareA.state === 'ready' ? 'Refresh MODIS' : 'Load MODIS'}</>}</button></div>
              <div className="compare-source-control viirs"><label htmlFor="compare-source-b"><span><i /> Sensor B · VIIRS</span><select id="compare-source-b" value={compareSourceB} onChange={(event) => setCompareSourceB(event.target.value as FirmsProduct)}>{firmsSources.filter((item) => item.id.startsWith('VIIRS')).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div><span className={`compare-state-dot ${compareB.state}`} />{compareB.state === 'ready' ? `${compareB.observations.length.toLocaleString()} rows returned` : compareB.state === 'error' ? 'Request unavailable · retry' : compareB.state === 'loading' ? 'Requesting NASA FIRMS…' : compareB.publicFeedAvailable ? 'Public Canada feed · latest 7 days' : compareB.configured === false ? 'No key · matching local archive may be available' : 'Ready to load'}</div><button className="primary-action" onClick={() => void compareB.load()} disabled={compareB.state === 'loading'}>{compareB.state === 'loading' ? <><span className="spinner" /> Loading VIIRS…</> : <><RefreshCw size={13} /> {compareB.state === 'error' ? 'Retry VIIRS' : compareB.state === 'ready' ? 'Refresh VIIRS' : 'Load VIIRS'}</>}</button></div>
              <p>Products remain separate. Select a point on the map to inspect its native satellite attributes.</p>
            </section>
            <div className="compare-map-a"><MapCanvas lat={location.lat} lon={location.lon} windDirection={weather?.windDirectionFrom} observations={compareA.observations} windNodes={windField.nodes} windTime={weather?.time} windState={windField.state} onRetryWind={windField.retry} windVisible={windVisible} terrainEnabled={terrainEnabled} onSelectPoint={setLocation} onSelectObservation={selectObservation} onCameraChange={updateWindViewport} syncGroup={compareMapSync.current} /></div>
            <div className="compare-map-b" style={compareMode === 'swipe' ? { clipPath: `inset(0 0 0 ${compareSplit}%)` } : undefined}><MapCanvas lat={location.lat} lon={location.lon} windDirection={weather?.windDirectionFrom} observations={compareB.observations} windNodes={windField.nodes} windTime={weather?.time} windState={windField.state} onRetryWind={windField.retry} windVisible={windVisible} terrainEnabled={terrainEnabled} onSelectPoint={setLocation} onSelectObservation={selectObservation} onCameraChange={updateWindViewport} syncGroup={compareMapSync.current} /></div>
            {compareMode === 'swipe' && <><div className="compare-swipe-divider" style={{ left: `${compareSplit}%` }} aria-hidden="true"><span>↔</span></div><input className="compare-swipe-input" type="range" min="15" max="85" value={compareSplit} onChange={(event) => setCompareSplit(Number(event.target.value))} aria-label="Adjust comparison divider" /></>}
            <div className="compare-map-chip modis"><i />{compareSourceA.replaceAll('_', ' ')} · {compareA.state === 'ready' ? compareA.observations.length.toLocaleString() : compareA.state.toUpperCase()}</div><div className="compare-map-chip viirs"><i />{compareSourceB.replaceAll('_', ' ')} · {compareB.state === 'ready' ? compareB.observations.length.toLocaleString() : compareB.state.toUpperCase()}</div>
          </div> : <MapCanvas lat={location.lat} lon={location.lon} windDirection={weather?.windDirectionFrom} observations={visibleObservations} windNodes={active === 'Scenario' ? scenarioWindNodes : windField.nodes} windTime={weather?.time} windState={windField.state} onRetryWind={windField.retry} windVisible={windVisible} terrainEnabled={isFieldMobile ? false : terrainEnabled} onSelectPoint={setLocation} onSelectObservation={selectObservation} onCameraChange={updateWindViewport} terrainTransect={active === 'Terrain' && transectVisible ? terrainTransect : undefined} terrainTransectSelecting={active === 'Terrain' && terrainTransectPointTarget !== null} onTerrainTransectPoint={selectTerrainTransectPoint} />}
          {active === 'Live Map' && liveMapDock}
          {active === 'Data & Sources' && <section className={`source-catalog-dock ${sourceDockCollapsed ? 'collapsed' : ''}`} aria-label="Source catalog and map layers">
            <button type="button" className="source-catalog-heading" aria-expanded={!sourceDockCollapsed} onClick={() => setSourceDockCollapsed((value) => !value)}><span><Layers3 size={15} /></span><div><b>Source catalog</b><small>Choose a dataset to inspect</small></div><ChevronDown size={14} /></button>
            <div className="source-catalog-list">{[
              { id: 'firms' as const, icon: Satellite, label: 'NASA FIRMS', detail: firmsSources.find((item) => item.id === firms.source)?.label ?? firms.source, state: firms.state === 'ready' ? `${firms.observations.length.toLocaleString()} rows` : firms.state === 'loading' ? 'REQUESTING' : firms.state === 'error' ? 'ERROR' : 'NOT LOADED' },
              { id: 'wind' as const, icon: Wind, label: 'Open-Meteo wind', detail: 'Hourly forecast · 10 m', state: windField.state === 'ready' ? `${windField.nodes.length} points` : windField.state.toUpperCase() },
              { id: 'terrain' as const, icon: Mountain, label: 'Terrarium DEM', detail: 'Elevation & relief', state: terrainAnalysis.state === 'ready' ? 'SAMPLED' : terrainAnalysis.state.toUpperCase() },
              { id: 'elevation' as const, icon: Mountain, label: 'Open-Meteo elevation', detail: 'Selected point cross-check', state: elevation.state.toUpperCase() },
              { id: 'archive' as const, icon: Database, label: 'Local FIRMS archive', detail: 'Workspace manifests', state: firmsArchiveCatalog.status === 'ready' ? `${firmsArchiveCatalog.archives.length} imports` : firmsArchiveCatalog.status.toUpperCase() },
            ].map(({ id, icon: Icon, label, detail, state }) => <button type="button" key={id} className={`source-catalog-item ${selectedDataSource === id ? 'selected' : ''}`} aria-pressed={selectedDataSource === id} onClick={() => setSelectedDataSource(id)}><span className="source-catalog-icon"><Icon size={15} /></span><span className="source-catalog-copy"><b>{label}</b><small>{detail}</small></span><span className="source-catalog-state">{state}</span><ChevronRight size={14} /></button>)}</div>
            <div className="source-catalog-layers"><b>Map layers</b>
              <label><input type="checkbox" checked={sourceHotspotsVisible} onChange={(event) => setSourceHotspotsVisible(event.target.checked)} /><Flame size={14} /><span>Hotspots</span><small>{firms.observations.length.toLocaleString()}</small></label>
              <label><input type="checkbox" checked={windVisible} onChange={(event) => setWindVisible(event.target.checked)} /><Wind size={14} /><span>Wind field</span><small>{windField.state === 'ready' ? 'READY' : windField.state.toUpperCase()}</small></label>
              <label><input type="checkbox" checked={terrainEnabled} onChange={(event) => setTerrainEnabled(event.target.checked)} /><Mountain size={14} /><span>3D terrain</span><small>{terrainEnabled ? 'ON' : 'OFF'}</small></label>
              <div className="unavailable-source-layer"><Layers3 size={14} /><span>Sensor footprints / orbit swaths</span><b>NO SOURCE</b></div>
            </div>
          </section>}
          {active === 'Scenario' && <section className="scenario-environment-panel" aria-label="Environmental inputs for the scenario">
            <header><span><Mountain size={16} /></span><div><b>Environmental inputs</b><small>Context for this map view</small></div><span className={`scenario-context-badge ${weather ? 'available' : ''}`}>{weather ? 'LIVE' : 'NO DATA'}</span></header>
            <div className="scenario-environment-metrics">
              <article><Wind size={15} /><span>Wind · 10 m</span><b>{weather ? `${Math.round(weather.windSpeed)} km/h ${windDirectionLabel(directionTo ?? 0)}` : 'Unavailable'}</b><small>{weather ? `Gust ${Math.round(weather.gusts)} km/h · Open-Meteo` : 'Forecast unavailable'}</small></article>
              <article><CloudRain size={15} /><span>Rain · selected hour</span><b>{weather ? `${weather.precipitation.toFixed(1)} mm` : 'Unavailable'}</b><small>{weather ? `${weather.time.slice(11, 16)} UTC · Open-Meteo` : 'Forecast unavailable'}</small></article>
              <article><Activity size={15} /><span>Humidity · 2 m</span><b>{weather ? `${Math.round(weather.humidity)}%` : 'Unavailable'}</b><small>{weather ? 'Selected forecast hour' : 'Forecast unavailable'}</small></article>
              <article><Mountain size={15} /><span>Local DEM slope</span><b>{terrainAnalysis.state === 'ready' ? `${terrainAnalysis.slopeDegrees?.toFixed(1) ?? '—'}°` : terrainAnalysis.state === 'loading' ? 'Loading' : 'Unavailable'}</b><small>Point sample · not a fuel layer</small></article>
            </div>
            <div className="scenario-prerequisite-state"><b>Spread model inputs</b><span><i className={weather ? 'available' : ''} /> {weather ? 'Hourly wind context available' : 'Hourly wind unavailable'}</span><span><i /> Dated incident perimeter · missing</span><span><i /> Fuel type and moisture · missing</span><span><i /> Validated behavior model · missing</span></div>
            <button type="button" className="scenario-terrain-link" onClick={() => setActive('Terrain')}><Layers3 size={13} /> Inspect available terrain layers <ChevronRight size={13} /></button>
          </section>}
          {active === 'Dashboard' && <section className="dashboard-map-summary" aria-labelledby="dashboard-summary-title">
            <header className="dashboard-summary-header">
              <span className="dashboard-summary-emblem"><Flame size={16} /></span>
              <div className="dashboard-summary-title"><span>AREA ACTIVITY</span><h2 id="dashboard-summary-title">Wildfire summary</h2></div>
              <span className={`dashboard-status-pill ${firms.state === 'ready' ? 'ready' : firms.state === 'loading' ? 'loading' : firms.state === 'error' ? 'error' : firms.configured === false && firms.publicFeedAvailable ? 'public' : firms.configured === false ? 'blocked' : 'idle'}`} role="status" aria-live="polite"><i />{firms.state === 'ready' ? 'Data loaded' : firms.state === 'loading' ? 'Loading' : firms.state === 'error' ? 'Unavailable' : firms.configured === false && firms.publicFeedAvailable ? 'Public feed' : firms.configured === false ? 'Setup needed' : 'Ready'}</span>
            </header>
            <div className="dashboard-summary-context"><Map size={13} /><b>{location.name}</b><i /><span>{firms.days} UTC {firms.days === 1 ? 'day' : 'days'}</span></div>
            <div className="dashboard-detection-count">
              <span>{firms.state === 'ready' && !dashboardRowsUnknown ? firms.observations.length.toLocaleString() : '—'}</span>
              <div><b>{dashboardRowsUnknown ? 'No returned rows' : 'Thermal detections'}</b><small>{dashboardRowsUnknown ? archiveCoverageUnknown ? 'Archive coverage is unknown; this is not a zero-fire observation.' : 'The public feed does not reach the end of the requested window; later dates are unknown.' : firms.state === 'ready' ? 'Satellite anomalies · not confirmed fires' : firms.state === 'loading' ? 'Observations are being requested' : 'Load observations to see returned records'}</small></div>
            </div>
            <div className="dashboard-product-line"><Satellite size={14} /><span>{firmsSources.find((item) => item.id === firms.source)?.label ?? firms.source}</span></div>
            {weather && <div className="dashboard-condition-row"><div><Wind size={14} /><span>Wind</span><b>{Math.round(weather.windSpeed)} km/h</b></div><div><CloudRain size={14} /><span>Rain</span><b>{weather.precipitation.toFixed(1)} mm</b></div></div>}
            {firms.configured === false && <p className="dashboard-key-note">{firms.publicFeedAvailable ? 'The public Canada NRT feed covers at most the latest 7 days. Older dates use a matching local archive or the server key.' : 'Use a matching local archive for the selected date or configure FIRMS_MAP_KEY on the server.'}</p>}
            {firms.accessMode === 'public-nrt-canada-csv' && firms.sourceDateRange && firms.queryRange && firms.sourceDateRange.maxDate < firms.queryRange.end && <p className="dashboard-key-note">Public feed rows are present through {firms.sourceDateRange.maxDate}; later requested dates remain unknown.</p>}
            {firms.state === 'error' && <p className="dashboard-key-note error-note">The observation request failed. Retry to load this product and time window.</p>}
            <button className="dashboard-load-button" onClick={() => void firms.load()} disabled={firms.state === 'loading'}>{firms.state === 'loading' ? <><span className="spinner" /> Loading observations</> : <><RefreshCw size={13} /> {firms.state === 'error' ? 'Retry observations' : firms.state === 'ready' ? 'Refresh observations' : 'Load observations'}</>}</button>
            {firms.fetchedAt && <small className="dashboard-freshness">Retrieved {new Date(firms.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · {firmsAccessLabel(firms.accessMode)}{firms.accessMode === 'local-validated-archive' ? ` · ${firms.archiveImports.map((item) => item.sourceFile).join(', ') || 'import provenance unavailable'}` : ''}</small>}
          </section>}
          {active === 'Calendar' && <section className="calendar-map-summary" aria-label="Calendar area summary"><div className="dashboard-map-kicker"><span>CALENDAR SUMMARY</span><span className={firms.state === 'ready' ? 'summary-dot summary-ready' : 'summary-dot'} />{firms.state === 'ready' ? 'WINDOW LOADED' : firms.state === 'loading' ? 'REQUESTING' : firms.configured === false && !firms.publicFeedAvailable ? 'KEY NOT SET' : firms.publicFeedAvailable && !firms.configured ? 'PUBLIC FEED' : 'NOT LOADED'}</div><b>{location.name}</b><small>{calendarSelectedDate} UTC · {firms.source.replaceAll('_', ' ')}</small><div className="calendar-summary-count"><span>{calendarDateQueried && !calendarDateUnknown ? calendarSelectedRecords.length.toLocaleString() : '—'}</span><div><b>{calendarDateUnknown ? selectedDateBeforeFeed ? 'Before public feed window' : selectedDateAfterFeed ? 'After public feed window' : 'Archive coverage unknown' : calendarDateQueried ? 'Returned records' : 'Date not queried'}</b><small>{calendarDateUnknown ? selectedDateBeforeFeed ? `Public feed starts ${unknownBeforeDate}; this date is outside its window.` : selectedDateAfterFeed ? `Public feed ends ${unknownAfterDate}; this date is outside its window.` : 'Archive coverage is unknown for this date.' : calendarDateQueried ? 'Not an incident count' : calendarWindowStart ? `${calendarWindowStart} → ${calendarWindowEnd}` : 'No query window loaded'}</small></div></div>{!calendarDateQueried && firms.state !== 'loading' && <button className="dashboard-load-button" onClick={() => void firms.load(calendarSelectedDate)}>{firms.state === 'error' ? 'Retry FIRMS request' : 'Load selected product'}</button>}<small className="calendar-summary-caveat">A day outside the request window or beyond the available source rows has unknown status; missing archive rows do not imply zero activity.</small></section>}
          {active === 'Terrain' && <section className="terrain-map-controls" aria-label="Terrain layers and profile controls">
            <header><Mountain size={16} /><div><b>Terrain layers</b><small>Map & local analysis</small></div></header>
            <button className="terrain-map-layer" onClick={() => setTerrainEnabled((value) => !value)} aria-pressed={terrainEnabled}><Mountain size={15} /><span>Elevation relief</span><b>{terrainEnabled ? '3D' : '2D'}</b></button>
            <button className="terrain-map-layer" onClick={() => setTransectVisible((value) => !value)} aria-pressed={transectVisible}><Activity size={15} /><span>Cross-section A—B</span><b>{transectVisible ? 'ON' : 'OFF'}</b></button>
            <div className="terrain-transect-editor">
              <div><b>Profile endpoints</b><small>Choose two points on the map</small></div>
              <div className="terrain-transect-actions"><button className={terrainTransectPointTarget === 'A' ? 'selected' : ''} onClick={() => { setTerrainTransectPointTarget('A'); setTerrainTransectMessage('Click the map to place endpoint A.') }} aria-pressed={terrainTransectPointTarget === 'A'}>Set A</button><button className={terrainTransectPointTarget === 'B' ? 'selected' : ''} onClick={() => { setTerrainTransectPointTarget('B'); setTerrainTransectMessage('Click the map to place endpoint B.') }} aria-pressed={terrainTransectPointTarget === 'B'}>Set B</button><button className="reset" onClick={() => { setCustomTerrainTransect(null); setTerrainTransectPointTarget(null); setTerrainTransectMessage('Default 80 km east–west profile restored.') }} aria-label="Reset terrain profile to default" title="Reset to default profile">↺</button></div>
              {terrainTransectPointTarget && <p className="terrain-transect-prompt" role="status">{terrainTransectMessage || `Click the map to place endpoint ${terrainTransectPointTarget}.`}</p>}
              {!terrainTransectPointTarget && terrainTransectMessage && <p className="terrain-transect-prompt" role="status">{terrainTransectMessage}</p>}
            </div>
            <div className="terrain-map-layer static-layer"><Activity size={15} /><span>Local slope sample</span><b>{terrainAnalysis.state === 'ready' ? `${terrainAnalysis.slopeDegrees?.toFixed(1)}°` : terrainAnalysis.state.toUpperCase()}</b></div>
            <div className="terrain-map-layer unavailable-layer"><Layers3 size={15} /><span>Land cover / fuels</span><b>NO SOURCE</b></div>
            <div className="terrain-map-key"><i /> {terrainAnalysis.state === 'ready' ? `A—B · ${Math.round(terrainAnalysis.profile.at(-1)?.distanceKm ?? 0)} km · 25 DEM samples` : 'A—B profile · DEM data'}</div>
          </section>}
          <div className="map-legend"><span className="legend-wind"><i /> {windVisible ? `Animated wind field · ${windField.nodes.length || '—'} points` : 'Wind field hidden'}</span><span className="legend-boundary"><i /> Selected location</span><span className="legend-fire"><i className={(active === 'Compare' ? compareObservations.length > 0 : active === 'Live Map' ? filteredLiveObservations.length > 0 : firms.state === 'ready' && visibleObservations.length > 0) ? 'fire-loaded' : ''} /> {active === 'Compare' ? `MODIS ${compareA.state === 'ready' ? compareA.observations.length : '—'} · VIIRS ${compareB.state === 'ready' ? compareB.observations.length : '—'} returned` : active === 'Live Map' ? liveFeedState === 'ready' ? `${visibleObservations.length} visible${selectedLiveDate ? ` · ${selectedLiveDate}` : ''} · clustered above zoom 9` : liveFeedState === 'loading' ? 'Requesting selected FIRMS sensors' : liveFeedState === 'error' ? 'Selected FIRMS sensors unavailable' : 'Load selected FIRMS sensors' : active === 'Calendar' ? calendarDateUnknown ? `Coverage unknown · ${calendarSelectedDate}` : calendarDateQueried ? `${visibleObservations.length} returned on ${calendarSelectedDate}` : firms.state === 'loading' && firms.queryRange && calendarSelectedDate >= firms.queryRange.start && calendarSelectedDate <= firms.queryRange.end ? `Requesting ${calendarSelectedDate}` : firms.state === 'error' && firms.queryRange && calendarSelectedDate >= firms.queryRange.start && calendarSelectedDate <= firms.queryRange.end ? `Request failed · ${calendarSelectedDate}` : 'Selected date not queried' : firms.state === 'ready' ? `${firms.observations.length} detections returned · ${firms.source}` : 'NASA FIRMS not loaded'}</span></div>
        </div>

        <aside className={`inspector ${isFieldMobile ? `field-mobile-inspector ${fieldSheetExpanded ? 'expanded' : 'collapsed'}` : ''}`}>
          {isFieldMobile && <button type="button" className="field-sheet-handle" aria-expanded={fieldSheetExpanded} aria-controls="field-mobile-sheet-content" aria-label={fieldSheetExpanded ? 'Reduce briefing panel' : 'Expand briefing panel'} onClick={() => setFieldSheetExpanded((expanded) => !expanded)}><i /><span>{fieldSheetExpanded ? 'Reduce panel' : 'Expand panel'}</span></button>}
          {isFieldMobile ? <div id="field-mobile-sheet-content" className="field-mobile-sheet-content">{fieldMobilePanel}</div> : active === 'Live Map' ? liveInspector : moduleBody}
        </aside>

        {active === 'Dashboard' ? <DashboardBottom observations={firms.observations} observationState={firms.state} source={firms.source} days={firms.days} forecast={hours.slice(safeIndex, safeIndex + 24)} accessMode={firms.accessMode} sourceDateRange={firms.sourceDateRange} queryRange={firms.queryRange} onLoad={() => void firms.load()} /> : active === 'Calendar' ? <CalendarBoard observations={firms.observations} observationState={firms.state} days={firms.days} selectedDate={calendarSelectedDate} onSelectDate={selectCalendarDate} windowStart={calendarWindowStart} windowEnd={calendarWindowEnd} coverageUnknown={archiveCoverageUnknown} unknownBeforeDate={unknownBeforeDate} unknownAfterDate={unknownAfterDate} /> : active === 'Terrain' ? <TerrainCrossSection analysis={terrainAnalysis} /> : active === 'Live Map' ? <div className="live-activity-strip"><div className="live-timeline-title"><span><Activity size={16} /></span><div><b>Observation timeline</b><small>{liveActivityDays.length ? `${liveActivityDays.length} UTC dates with returned records` : 'No acquisition dates returned'} · row counts, not fire counts</small></div></div><div className="live-timeline-controls"><button className="timeline-control" onClick={() => { setLivePlaybackRunning(false); setSelectedLiveDate(null) }} aria-label="Show all returned dates" title="Show all returned dates"><Layers3 size={14} /></button><button className="timeline-control play-control" onClick={() => setLivePlaybackRunning((value) => !value)} disabled={liveActivityDays.length < 2} aria-label={livePlaybackRunning ? 'Pause date playback' : 'Play dates with returned records'} title={livePlaybackRunning ? 'Pause' : 'Play available dates'}>{livePlaybackRunning ? <Pause size={14} /> : <Play size={14} />}</button></div><div className="live-timeline-days" aria-label="Dates with returned observations">{liveActivityDays.length ? liveActivityDays.map(([date, count]) => <button key={date} className={`live-timeline-day ${selectedLiveDate === date ? 'selected' : ''}`} onClick={() => { setLivePlaybackRunning(false); setSelectedLiveDate(selectedLiveDate === date ? null : date) }} aria-pressed={selectedLiveDate === date} title={`${date} UTC · ${count.toLocaleString()} rows returned`}><b>{count.toLocaleString()}</b><i style={{ height: `${Math.max(7, count / liveActivityMax * 30)}px` }} /><small>{date.slice(5)}</small></button>) : <span className="live-timeline-empty">Load sources to see their actual acquisition dates. Dates without returned rows are omitted, not shown as zero.</span>}</div><button className={`live-all-dates ${selectedLiveDate === null ? 'active' : ''}`} onClick={() => { setLivePlaybackRunning(false); setSelectedLiveDate(null) }} aria-pressed={selectedLiveDate === null}>All dates</button></div> : active === 'Data & Sources' ? <SourcePipeline observations={firms.observations} feed={firms} archiveCatalog={firmsArchiveCatalog} /> : <div className="bottom-strip"><div className="timeline-title"><Activity size={16} /><div><b>Weather timeline</b><small>Hourly forecast · wind, rain, temperature</small></div></div><div className="timeline-track forecast-track" aria-label="Hourly forecast selector">{visibleHours.map((hour, index) => { const absoluteIndex = forecastStartIndex + index; return <button key={hour.time} className={`forecast-tick ${absoluteIndex === safeIndex ? 'selected' : ''}`} style={{ height: `${Math.max(12, Math.min(34, 10 + hour.windSpeed * 0.28))}px` }} onClick={() => setSelectedTime(hour.time)} title={`${new Date(hour.time).toISOString().slice(0, 16).replace('T', ' ')} UTC · wind ${Math.round(hour.windSpeed)} km/h · rain ${hour.precipitation.toFixed(1)} mm`} aria-label={`Select ${hour.time} UTC, wind ${Math.round(hour.windSpeed)} kilometers per hour`} /> })}{!hours.length && <span className="timeline-empty">Hourly forecast unavailable</span>}</div><div className="timeline-select"><label htmlFor="forecast-time">{weather ? new Date(weather.time).toISOString().slice(11, 16) + ' UTC' : '—'}</label><input id="forecast-time" type="range" min={forecastStartIndex} max={Math.max(forecastStartIndex, forecastStartIndex + hourCount - 1)} value={Math.min(Math.max(safeIndex, forecastStartIndex), Math.max(forecastStartIndex, forecastStartIndex + hourCount - 1))} onChange={(event) => setSelectedTime(hours[Number(event.target.value)]?.time ?? null)} disabled={!hours.length} aria-label="Select forecast hour" /></div></div>}
      </section>
      {isFieldMobile && <nav className="field-mobile-tabs" aria-label="Field situation sections">{(['Map', 'Updates', 'Layers', 'Report'] as const).map((tab) => {
        const Icon = tab === 'Map' ? Map : tab === 'Updates' ? Satellite : tab === 'Layers' ? Layers3 : ClipboardList
        return <button key={tab} type="button" className={fieldMobileTab === tab ? 'active' : ''} aria-current={fieldMobileTab === tab ? 'page' : undefined} onClick={() => { setFieldMobileTab(tab); setFieldSheetExpanded(tab !== 'Map') }}><Icon size={18} /><span>{tab}</span></button>
      })}</nav>}
      <footer className="app-footer"><span>Weather: Open-Meteo · basemap: OpenStreetMap · DEM: Mapzen Terrarium via AWS · FIRMS: {firms.configured === false ? firms.publicFeedAvailable ? 'public Canada NRT feed · 7-day limit; older dates use a local import or server key' : 'server key not set · dated local imports can be used' : firms.configured ? 'server key configured' : 'checking configuration'}</span><span>Wind field is an hourly forecast visualization, not a fire-spread prediction</span></footer>
    </main>
  </div>
}
