import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, ImageSource, Map as MapLibreMap } from 'maplibre-gl'
import { useWorkspaceState, workspaceLocations } from '../app/useWorkspaceState'
import type { FirmsProduct, WorkspaceView } from '../app/useWorkspaceState'
import { terrainAspectLabel, terrainTransectCoordinates, useTerrainAnalysis } from '../app/useTerrainAnalysis'
import type { TerrainAnalysis } from '../app/useTerrainAnalysis'
import {
  Activity, AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, CloudRain, Compass, Database, Flame, Layers3, LocateFixed, Map,
  Menu, Mountain, RefreshCw, Satellite, Search, Wind, X,
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
type WindSample = { time: string; speedKmh: number | null; directionFrom: number | null }
type WindNode = { id: string; latitude: number; longitude: number; samples: WindSample[] }
type WindFieldState = { state: 'loading' | 'ready' | 'error'; nodes: WindNode[]; retrievedAt: string | null; error?: string }
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
  { id: 'MODIS_NRT', label: 'MODIS · near real-time' },
  { id: 'VIIRS_NOAA20_SP', label: 'VIIRS · NOAA-20 · standard processing' },
  { id: 'VIIRS_NOAA21_SP', label: 'VIIRS · NOAA-21 · standard processing' },
  { id: 'MODIS_SP', label: 'MODIS · standard processing' },
]

function useFirms(lat: number, lon: number, source: string, days: number) {
  const [observations, setObservations] = useState<FireObservation[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const requestController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal }).then((response) => response.json()).then((payload) => setConfigured(Boolean(payload.firmsConfigured))).catch(() => setConfigured(false))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    requestController.current?.abort()
    setState('idle'); setMessage(''); setObservations([]); setFetchedAt(null)
    return () => requestController.current?.abort()
  }, [lat, lon, source, days])

  async function load() {
    const west = Math.max(-180, lon - 2.1)
    const east = Math.min(180, lon + 2.1)
    const south = Math.max(-90, lat - 1.4)
    const north = Math.min(90, lat + 1.4)
    const params = new URLSearchParams({ source, bbox: [west, south, east, north].join(','), days: String(days) })
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setState('loading'); setMessage('')
    try {
      const response = await fetch(`/api/firms?${params}`, { signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'FIRMS observations could not be loaded.')
      setObservations(Array.isArray(payload.observations) ? payload.observations : [])
      setFetchedAt(payload.fetchedAtUtc || null)
      setMessage(payload.count === 0 ? 'NASA returned a valid response with no detections in this area and time window. This does not establish that no fire is present.' : `${payload.count.toLocaleString()} satellite detections returned for the selected product and window.`)
      setState('ready')
      setConfigured(true)
    } catch (error) {
      if (controller.signal.aborted) return
      setState('error')
      setMessage(error instanceof Error ? error.message : 'FIRMS observations could not be loaded.')
    } finally {
      if (requestController.current === controller) requestController.current = null
    }
  }

  return { source, days, observations, state, message, fetchedAt, configured, load }
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

type MapPoint = { name: string; lat: number; lon: number }

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
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Weather service returned ${response.status}`)
        return response.json()
      })
      .then((payload) => {
        const hourly = payload.hourly
        if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.wind_speed_10m)) throw new Error('Hourly weather data is not available')
        const loaded: ForecastHour[] = hourly.time.map((time: string, index: number) => ({
          time,
          temperature: hourly.temperature_2m[index],
          windSpeed: hourly.wind_speed_10m[index],
          windDirectionFrom: hourly.wind_direction_10m[index],
          gusts: hourly.wind_gusts_10m[index],
          precipitation: hourly.precipitation[index],
          humidity: hourly.relative_humidity_2m[index],
        })).filter((hour: ForecastHour) => Number.isFinite(hour.windSpeed))
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

function useWindField(lat: number, lon: number) {
  const [field, setField] = useState<WindFieldState>({ state: 'loading', nodes: [], retrievedAt: null })

  useEffect(() => {
    const controller = new AbortController()
    setField({ state: 'loading', nodes: [], retrievedAt: null })
    const offsets = [-2, -1, 0, 1, 2]
    const coordinates = offsets.flatMap((latitudeOffset) => offsets.map((longitudeOffset) => ({
      latitude: Math.max(-85, Math.min(85, lat + latitudeOffset * 1.5)),
      longitude: Math.max(-180, Math.min(180, lon + longitudeOffset * 2)),
    })))
    const params = new URLSearchParams({
      latitude: coordinates.map((point) => point.latitude.toFixed(3)).join(','),
      longitude: coordinates.map((point) => point.longitude.toFixed(3)).join(','),
      hourly: 'wind_speed_10m,wind_direction_10m',
      wind_speed_unit: 'kmh', timezone: 'UTC', forecast_days: '7', past_days: '1',
    })
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Wind grid service returned ${response.status}`)
        return response.json()
      })
      .then((payload: unknown) => {
        const records = (Array.isArray(payload) ? payload : [payload]) as Array<{
          latitude?: number
          longitude?: number
          hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_direction_10m?: number[] }
        }>
        if (records.length !== coordinates.length) throw new Error('Wind grid response did not include every requested point')
        const nodes = records.map((record, index): WindNode | null => {
          const hourly = record.hourly
          if (!Array.isArray(hourly?.time) || !Array.isArray(hourly.wind_speed_10m) || !Array.isArray(hourly.wind_direction_10m)) return null
          return {
            id: `wind-${index}`,
            latitude: Number.isFinite(record.latitude) ? record.latitude! : coordinates[index].latitude,
            longitude: Number.isFinite(record.longitude) ? record.longitude! : coordinates[index].longitude,
            samples: hourly.time.map((time, hourIndex) => ({
              time,
              speedKmh: Number.isFinite(hourly.wind_speed_10m![hourIndex]) ? hourly.wind_speed_10m![hourIndex] : null,
              directionFrom: Number.isFinite(hourly.wind_direction_10m![hourIndex]) ? hourly.wind_direction_10m![hourIndex] : null,
            })),
          }
        }).filter((node): node is WindNode => node !== null)
        if (nodes.length < 9) throw new Error('Wind grid has too few valid points to draw a field')
        setField({ state: 'ready', nodes, retrievedAt: new Date().toISOString() })
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setField({ state: 'error', nodes: [], retrievedAt: null, error: error instanceof Error ? error.message : 'Wind field unavailable' })
      })
    return () => controller.abort()
  }, [lat, lon])

  return field
}

type WindVector = { latitude: number; longitude: number; eastKmh: number; northKmh: number; speedKmh: number; directionTo: number }

function windVectorsAt(nodes: WindNode[], time?: string): WindVector[] {
  if (!time) return []
  return nodes.flatMap((node) => {
    const sample = node.samples.find((hour) => hour.time === time)
    if (sample?.speedKmh === null || sample?.speedKmh === undefined || sample.directionFrom === null || sample.directionFrom === undefined) return []
    const directionTo = toWindDirection(sample.directionFrom)
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

function createWindParticle(): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = 64; canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return new ImageData(64, 64)
  const glow = context.createLinearGradient(12, 32, 54, 32)
  glow.addColorStop(0, '#ffffff00')
  glow.addColorStop(0.56, '#e9ffff70')
  glow.addColorStop(1, '#ffffff')
  context.shadowColor = '#f5ffff'; context.shadowBlur = 8
  context.strokeStyle = glow; context.lineWidth = 5; context.lineCap = 'round'
  context.beginPath(); context.moveTo(11, 32); context.lineTo(54, 32); context.stroke()
  context.shadowBlur = 0; context.strokeStyle = '#ffffff'; context.lineWidth = 1.7
  context.beginPath(); context.moveTo(17, 32); context.lineTo(52, 32); context.stroke()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function windSpeedColor(speedKmh: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0, 51, 133, 165], [10, 57, 175, 181], [20, 110, 199, 184], [35, 218, 220, 159],
    [50, 250, 203, 83], [70, 246, 133, 53], [100, 231, 74, 63], [150, 192, 64, 148], [200, 94, 185, 202],
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
      image.data[offset + 3] = Math.round(220 * Math.min(1, 0.54 + vector.speedKmh / 200) * feather)
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
      paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 180, 'raster-resampling': 'linear' },
    }, 'wind-vector-arrows')
  }
}

function ensureWindLayers(instance: MapLibreMap) {
  if (!instance.hasImage('wind-vector-arrow')) instance.addImage('wind-vector-arrow', createWindArrow(), { pixelRatio: 2 })
  if (!instance.hasImage('wind-particle-glow')) instance.addImage('wind-particle-glow', createWindParticle(), { pixelRatio: 2 })
  const empty = { type: 'FeatureCollection' as const, features: [] }
  if (!instance.getSource('wind-vector-grid')) instance.addSource('wind-vector-grid', { type: 'geojson', data: empty })
  if (!instance.getSource('wind-flow-trails')) instance.addSource('wind-flow-trails', { type: 'geojson', lineMetrics: true, data: empty })
  if (!instance.getSource('wind-flow-heads')) instance.addSource('wind-flow-heads', { type: 'geojson', data: empty })
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
  if (!instance.getLayer('wind-flow-trails')) instance.addLayer({
    id: 'wind-flow-trails', type: 'line', source: 'wind-flow-trails',
    paint: {
      'line-color': '#f5ffff',
      'line-width': ['interpolate', ['linear'], ['get', 'speedKmh'], 0, 1.2, 35, 1.8, 70, 2.5],
      'line-opacity': 0.88,
      'line-blur': 0.25,
    },
  })
  if (!instance.getLayer('wind-flow-heads')) instance.addLayer({
    id: 'wind-flow-heads', type: 'symbol', source: 'wind-flow-heads',
    layout: {
      'symbol-placement': 'point',
      'icon-image': 'wind-particle-glow',
      'icon-size': ['interpolate', ['linear'], ['get', 'speedKmh'], 0, 0.46, 20, 0.64, 65, 0.86],
      'icon-rotate': ['get', 'directionTo'],
      'icon-rotation-alignment': 'map',
      'symbol-height-offset': 12,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.95 },
  })
}

function MapCanvas({ lat, lon, windDirection, observations, windNodes, windTime, windVisible, terrainEnabled, onSelectPoint, onSelectObservation, syncGroup, terrainTransect }: { lat: number; lon: number; windDirection?: number; observations: FireObservation[]; windNodes: WindNode[]; windTime?: string; windVisible: boolean; terrainEnabled: boolean; onSelectPoint: (point: MapPoint) => void; onSelectObservation: (observation: FireObservation | null) => void; syncGroup?: MapSyncGroup; terrainTransect?: [number, number][] }) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const selectPoint = useRef(onSelectPoint)
  const selectObservation = useRef(onSelectObservation)
  const observationsRef = useRef(observations)
  const windNodesRef = useRef(windNodes)
  const windTimeRef = useRef(windTime)
  useEffect(() => { selectPoint.current = onSelectPoint }, [onSelectPoint])
  useEffect(() => { selectObservation.current = onSelectObservation }, [onSelectObservation])
  useEffect(() => { observationsRef.current = observations }, [observations])
  useEffect(() => { windNodesRef.current = windNodes; windTimeRef.current = windTime }, [windNodes, windTime])

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
            'raster-brightness-min': 0.02,
            'raster-brightness-max': 0.24,
            'raster-saturation': -0.14,
            'raster-contrast': 0.18,
            'raster-fade-duration': 180,
          },
        }],
      },
      center: [lon, lat],
      zoom: 6.2,
      pitch: 62,
      bearing: -12,
      maxPitch: 78,
      attributionControl: false,
    })
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.current.on('load', () => {
      map.current?.setTerrain({ source: 'albertaDem', exaggeration: 1.2 })
      map.current?.addLayer({
        id: 'alberta-hillshade', type: 'hillshade', source: 'albertaDem',
        paint: { 'hillshade-exaggeration': 0.32, 'hillshade-shadow-color': '#091a25', 'hillshade-highlight-color': '#a3c9be' },
      })
      if (windNodesRef.current.length) ensureWindLayers(map.current!)
      map.current?.addSource('terrain-transect', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.current?.addLayer({ id: 'terrain-transect-line', type: 'line', source: 'terrain-transect', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#34e5e4', 'line-width': 2.5, 'line-dasharray': [2, 1.2], 'line-opacity': 0.95 } })
      map.current?.addLayer({ id: 'terrain-transect-points', type: 'circle', source: 'terrain-transect', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 8, 'circle-color': '#0b2029', 'circle-stroke-color': '#4ef0eb', 'circle-stroke-width': 2 } })
    })
    map.current.getCanvas().style.cursor = 'crosshair'
    map.current.on('click', (event) => {
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
      instance.addSource('firms-hotspots', { type: 'geojson', data: collection })
      instance.addLayer({
        id: 'firms-hotspots', type: 'circle', source: 'firms-hotspots',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'frpMw'], 1], 0, 4, 10, 7, 100, 12],
          'circle-color': ['match', ['get', 'source'], 'MODIS_NRT', '#25d2d8', 'MODIS_SP', '#25d2d8', 'VIIRS_NOAA20_NRT', '#f4b12f', 'VIIRS_NOAA20_SP', '#f4b12f', 'VIIRS_NOAA21_NRT', '#f2683b', 'VIIRS_NOAA21_SP', '#f2683b', '#f4b12f'],
          'circle-opacity': 0.88,
          'circle-stroke-color': '#08141d',
          'circle-stroke-width': 1.25,
        },
      })
    }
    if (map.current.isStyleLoaded()) syncLayer()
    else map.current.once('load', syncLayer)
    return () => { map.current?.off('load', syncLayer) }
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
    if (instance.isStyleLoaded() && instance.getSource('terrain-transect')) sync()
    else instance.once('load', sync)
    return () => { instance.off('load', sync) }
  }, [terrainTransect])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const applyTerrain = () => {
      instance.setTerrain(terrainEnabled ? { source: 'albertaDem', exaggeration: 1.2 } : null)
      instance.easeTo({ pitch: terrainEnabled ? 62 : 0, duration: 900 })
    }
    if (instance.isStyleLoaded()) applyTerrain()
    else instance.once('load', applyTerrain)
    return () => { instance.off('load', applyTerrain) }
  }, [terrainEnabled])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const vectors = windVectorsAt(windNodes, windTime)
    let timer: ReturnType<typeof setInterval> | null = null
    let removeLoadListener = () => {}
    const updateWind = () => {
      if (!instance.getStyle().layers.some((layer) => layer.id === 'osm-raster-base')) return
      if (!instance.getSource('albertaDem')) return
      ensureWindLayers(instance)
      if (vectors.length) ensureWindSpeedLayer(instance, vectors)
      for (const id of ['wind-speed-raster', 'wind-vector-arrows', 'wind-flow-trails', 'wind-flow-heads']) {
        if (instance.getLayer(id)) instance.setLayoutProperty(id, 'visibility', windVisible ? 'visible' : 'none')
      }
      if (!windVisible || !vectors.length) {
        ;(instance.getSource('wind-vector-grid') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [] })
        ;(instance.getSource('wind-flow-trails') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [] })
        ;(instance.getSource('wind-flow-heads') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [] })
        return
      }
      const vectorSource = instance.getSource('wind-vector-grid') as GeoJSONSource
      const arrowFeatures = vectors.map((vector) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [vector.longitude, vector.latitude] },
        properties: { speedKmh: vector.speedKmh, directionTo: vector.directionTo },
      }))
      vectorSource.setData({ type: 'FeatureCollection', features: arrowFeatures } as GeoJSON.FeatureCollection)
      const particleBounds = {
        west: Math.min(...vectors.map((vector) => vector.longitude)), east: Math.max(...vectors.map((vector) => vector.longitude)),
        south: Math.min(...vectors.map((vector) => vector.latitude)), north: Math.max(...vectors.map((vector) => vector.latitude)),
      }
      const particles = Array.from({ length: 112 }, () => ({
        longitude: particleBounds.west + Math.random() * (particleBounds.east - particleBounds.west),
        latitude: particleBounds.south + Math.random() * (particleBounds.north - particleBounds.south),
        trail: [] as Array<[number, number]>, speedKmh: 0,
      }))
      let previousFrame = performance.now()
      timer = setInterval(() => {
        const now = performance.now()
        const elapsedSeconds = Math.min((now - previousFrame) / 1000, 0.25)
        previousFrame = now
        const lineFeatures = []
        const headFeatures = []
        for (const particle of particles) {
          const vector = interpolateWind(vectors, particle.latitude, particle.longitude)
          if (!vector || vector.speedKmh < 0.2) {
            particle.trail = []
            particle.longitude = particleBounds.west + Math.random() * (particleBounds.east - particleBounds.west)
            particle.latitude = particleBounds.south + Math.random() * (particleBounds.north - particleBounds.south)
            continue
          }
          const pixel = instance.project([particle.longitude, particle.latitude])
          const speedPixelsPerSecond = Math.max(1.1, vector.speedKmh * 0.42)
          const nextPixel = [
            pixel.x + (vector.eastKmh / vector.speedKmh) * speedPixelsPerSecond * elapsedSeconds,
            pixel.y - (vector.northKmh / vector.speedKmh) * speedPixelsPerSecond * elapsedSeconds,
          ] as [number, number]
          const nextPoint = instance.unproject(nextPixel)
          particle.longitude = nextPoint.lng
          particle.latitude = nextPoint.lat
          particle.speedKmh = vector.speedKmh
          particle.trail.push([particle.longitude, particle.latitude])
          if (particle.trail.length > 6) particle.trail.shift()
          if (particle.longitude < particleBounds.west || particle.longitude > particleBounds.east || particle.latitude < particleBounds.south || particle.latitude > particleBounds.north) {
            particle.trail = []
            particle.longitude = particleBounds.west + Math.random() * (particleBounds.east - particleBounds.west)
            particle.latitude = particleBounds.south + Math.random() * (particleBounds.north - particleBounds.south)
            continue
          }
          if (particle.trail.length > 1) lineFeatures.push({
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates: particle.trail },
            properties: { speedKmh: particle.speedKmh },
          })
          headFeatures.push({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [particle.longitude, particle.latitude] },
            properties: { speedKmh: particle.speedKmh, directionTo: vector.directionTo },
          })
        }
        ;(instance.getSource('wind-flow-trails') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lineFeatures } as GeoJSON.FeatureCollection)
        ;(instance.getSource('wind-flow-heads') as GeoJSONSource).setData({ type: 'FeatureCollection', features: headFeatures } as GeoJSON.FeatureCollection)
      }, 70)
    }
    if (instance.isStyleLoaded()) updateWind()
    else {
      instance.once('load', updateWind)
      removeLoadListener = () => instance.off('load', updateWind)
    }
    return () => { if (timer) clearInterval(timer); removeLoadListener() }
  }, [windNodes, windTime, windVisible])

  useEffect(() => {
    if (!map.current) return
    map.current.easeTo({ center: [lon, lat], duration: 900 })
  }, [lat, lon])

  const direction = windDirection === undefined ? undefined : toWindDirection(windDirection)
  const windVectors = windVectorsAt(windNodes, windTime)
  const meanWindSpeed = windVectors.length ? windVectors.reduce((total, vector) => total + vector.speedKmh, 0) / windVectors.length : null
  return <div className={`map-frame ${terrainEnabled ? 'terrain-active' : 'terrain-flat'}`}>
    <div ref={element} className="map-canvas" aria-label="Map centered on the selected Alberta area" />
    <div className="map-coordinates"><Compass size={13} /> {lat.toFixed(3)}° N · {Math.abs(lon).toFixed(3)}° W</div>
    {direction !== undefined && !windVisible && <div className="map-wind" style={{ transform: `rotate(${direction}deg)` }} aria-label={`Wind blows toward ${windDirectionLabel(direction)}`}><Wind size={24} /></div>}
    <div className="map-field-badge"><span className={windVisible && windNodes.length ? 'field-live-dot' : ''} />{windVisible ? `${windNodes.length || '—'}-point wind field` : 'Wind field hidden'} · {terrainEnabled ? '3D relief' : '2D'}</div>
    {windVisible && windNodes.length > 0 && <div className="wind-speed-legend" aria-label="Wind speed scale in kilometres per hour">
      <div className="wind-speed-legend-heading"><span><Wind size={12} /> WIND SPEED</span><b>{meanWindSpeed === null ? '—' : `${Math.round(meanWindSpeed)} km/h avg`}</b></div>
      <div className="wind-speed-ramp" />
      <div className="wind-speed-ticks"><span>0</span><span>20</span><span>40</span><span>60</span><span>100</span><span>200+</span></div>
      <small>Colour = speed · white streaks = flow direction</small>
    </div>}
    <div className="map-caption">Basemap © OpenStreetMap · Terrain © Mapzen · Wind: Open-Meteo</div>
  </div>
}

function DashboardBottom({ observations, observationState, source, days, forecast, onLoad }: { observations: FireObservation[]; observationState: 'idle' | 'loading' | 'ready' | 'error'; source: string; days: number; forecast: ForecastHour[]; onLoad: () => void }) {
  const byDay = new globalThis.Map<string, number>()
  for (const observation of observations) {
    const day = observation.acquiredAtUtc?.slice(0, 10)
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  const daily = [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right))
  const maxDaily = Math.max(1, ...daily.map(([, count]) => count))
  const windValues = forecast.slice(0, 24).map((hour) => hour.windSpeed)
  const maxWind = Math.max(1, ...windValues)
  const windPoints = windValues.map((speed, index) => `${windValues.length < 2 ? 0 : (index / (windValues.length - 1)) * 100},${32 - (speed / maxWind) * 25}`).join(' ')

  return <div className="dashboard-bottom">
    <section className="dashboard-chart-card detection-trend-card" aria-label="Satellite detection counts by day">
      <div className="dashboard-chart-heading"><div><b>Observed detections</b><small>{source.replaceAll('_', ' ')} · last {days} UTC {days === 1 ? 'day' : 'days'}</small></div><span>{observationState === 'ready' ? `${observations.length.toLocaleString()} total` : observationState === 'loading' ? 'Loading' : 'Not loaded'}</span></div>
      {observationState === 'ready' && daily.length > 0
        ? <div className="daily-bars">{daily.map(([day, count]) => <div className="daily-bar-column" key={day} title={`${day} UTC · ${count.toLocaleString()} observations`}><b>{count.toLocaleString()}</b><i style={{ height: `${Math.max(4, (count / maxDaily) * 43)}px` }} /><small>{new Date(`${day}T00:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })}</small></div>)}</div>
        : <div className="dashboard-chart-empty">{observationState === 'ready' ? 'NASA returned no dated detections for this product and window. This is not proof of no fire.' : observationState === 'error' ? 'The selected FIRMS observation window is unavailable.' : 'Load FIRMS observations to build this chart from returned acquisition dates.'}{observationState !== 'loading' && <button className="text-button" onClick={onLoad}>{observationState === 'error' ? 'Retry observations' : 'Load observations'}</button>}</div>}
    </section>
    <section className="dashboard-chart-card wind-outlook-card" aria-label="Forecast wind speed for the next 24 hours">
      <div className="dashboard-chart-heading"><div><b>Wind outlook · next 24 hours</b><small>Open-Meteo · hourly at 10 m · km/h</small></div><strong>{forecast[0] ? `${Math.round(forecast[0].windSpeed)} km/h` : '—'}</strong></div>
      {forecast.length > 1 ? <><svg className="wind-outlook-chart" viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label={`Hourly forecast wind speeds range from ${Math.round(Math.min(...windValues))} to ${Math.round(Math.max(...windValues))} kilometers per hour`}><polygon points={`0,36 ${windPoints} 100,36`} fill="rgba(37,210,216,.12)" /><polyline points={windPoints} fill="none" stroke="#25d2d8" strokeWidth="1.3" vectorEffect="non-scaling-stroke" /></svg><div className="wind-outlook-range"><span>{forecast[0].time.slice(11, 16)} UTC</span><span>Peak {Math.round(Math.max(...windValues))} km/h</span><span>{forecast.at(-1)?.time.slice(11, 16)} UTC</span></div></> : <div className="dashboard-chart-empty">Hourly wind forecast is not available.</div>}
    </section>
    <aside className="dashboard-coverage-note"><div><AlertTriangle size={15} /><b>Coverage & interpretation</b></div><p>FIRMS reports satellite thermal anomalies, not confirmed fire perimeters. Cloud, smoke, viewing geometry and satellite gaps can affect detections. Historical baselines and coverage percentages are not available from this request.</p></aside>
  </div>
}

function TerrainCrossSection({ analysis }: { analysis: TerrainAnalysis }) {
  const values = analysis.profile.map((point) => point.elevationM)
  const minimum = analysis.minElevationM ?? 0
  const range = Math.max(1, (analysis.maxElevationM ?? minimum) - minimum)
  const path = analysis.profile.map((point, index) => `${index / Math.max(analysis.profile.length - 1, 1) * 100},${92 - ((point.elevationM - minimum) / range) * 78}`).join(' ')
  const fillPath = analysis.profile.length ? `0,100 ${path} 100,100` : ''
  return <section className="terrain-profile-strip" aria-label="Terrain cross-section">
    <header><div><b><Activity size={14} /> Terrain cross-section · A—B</b><small>{analysis.state === 'ready' ? `80 km east–west · ${analysis.profile.length} samples · Terrarium z12` : analysis.state === 'loading' ? 'Loading elevation tiles…' : analysis.state === 'error' ? 'Terrain profile unavailable' : 'Select Terrain to sample the elevation grid'}</small></div>{analysis.state === 'ready' && <span>{Math.round(minimum)}–{Math.round(analysis.maxElevationM ?? minimum)} m range</span>}</header>
    {analysis.state === 'ready' && values.length ? <div className="terrain-profile-chart"><span className="terrain-profile-max">{Math.round(analysis.maxElevationM ?? 0)} m</span><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Terrain profile from ${Math.round(values[0])} metres to ${Math.round(values.at(-1) ?? values[0])} metres over 80 kilometres`}><path d="M 0 25 H 100 M 0 50 H 100 M 0 75 H 100" className="terrain-profile-grid" /><polygon points={fillPath} className="terrain-profile-fill" /><polyline points={path} className="terrain-profile-line" vectorEffect="non-scaling-stroke" /></svg><span className="terrain-profile-min">{Math.round(analysis.minElevationM ?? 0)} m</span><div className="terrain-profile-distance"><span>A · 0 km</span><span>B · 80 km</span></div></div> : <div className="terrain-profile-state">{analysis.state === 'error' ? analysis.error ?? 'The terrain tiles could not be read.' : 'A data-driven elevation profile appears here after the DEM samples load.'}</div>}
  </section>
}

type CompareFeed = { observations: FireObservation[]; state: 'idle' | 'loading' | 'ready' | 'error'; source: string; days: number; fetchedAt: string | null; load: () => Promise<void> }

function CompareTrend({ feed, tone }: { feed: CompareFeed; tone: 'modis' | 'viirs' }) {
  const byDay = new globalThis.Map<string, number>()
  for (const observation of feed.observations) {
    const day = observation.acquiredAtUtc?.slice(0, 10)
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  const end = feed.fetchedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  const days = Array.from({ length: feed.days }, (_, index) => shiftUtcDay(end, index + 1 - feed.days))
  const maximum = Math.max(1, ...days.map((day) => byDay.get(day) ?? 0))
  return <section className={`compare-trend-card ${tone}`}>
    <header><div><b>{feed.source.replaceAll('_', ' ')}</b><small>Returned observations · requested UTC days</small></div><strong>{feed.state === 'ready' ? feed.observations.length.toLocaleString() : '—'}</strong></header>
    {feed.state === 'ready' ? <div className="compare-trend-bars" aria-label={`Daily records for ${feed.source}`}>{days.map((day) => {
      const count = byDay.get(day) ?? 0
      return <div key={day} title={`${day} UTC · ${count.toLocaleString()} returned records`}><b>{count.toLocaleString()}</b><i style={{ height: `${count ? Math.max(4, count / maximum * 42) : 3}px` }} /><small>{new Date(`${day}T00:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })}</small></div>
    })}</div> : <div className="compare-trend-empty">{feed.state === 'loading' ? 'Requesting this sensor product…' : feed.state === 'error' ? 'This product request failed; retry from Sensor A/B.' : 'Load this product to build a chart from returned acquisition dates.'}</div>}
  </section>
}

function CompareBottom({ modis, viirs }: { modis: CompareFeed; viirs: CompareFeed }) {
  return <div className="compare-bottom"><CompareTrend feed={modis} tone="modis" /><CompareTrend feed={viirs} tone="viirs" /><aside><AlertTriangle size={14} /><span>Counts describe returned detections, not sensor coverage or fire incidents. No agreement score is calculated.</span></aside></div>
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

function CalendarBoard({ observations, observationState, days, selectedDate, onSelectDate, windowStart, windowEnd }: { observations: FireObservation[]; observationState: 'idle' | 'loading' | 'ready' | 'error'; days: number; selectedDate: string; onSelectDate: (date: string) => void; windowStart: string; windowEnd: string }) {
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
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisible)
    date.setUTCDate(firstVisible.getUTCDate() + index)
    const iso = date.toISOString().slice(0, 10)
    const inQuery = iso >= windowStart && iso <= windowEnd
    const count = counts.get(iso)
    const state = observationState === 'ready' && inQuery ? 'covered' : observationState === 'loading' && inQuery ? 'loading' : observationState === 'error' && inQuery ? 'error' : inQuery ? 'not-loaded' : 'outside-window'
    const label = state === 'covered' ? `${count ?? 0} returned observations` : state === 'loading' ? 'Request in progress' : state === 'error' ? 'Request unavailable' : state === 'not-loaded' ? 'Not queried' : 'Outside selected FIRMS window'
    return { iso, date, count, inQuery, state, label }
  })
  const weekStart = mondayOfUtcWeek(selectedDate)
  const shownCells = cells.filter((cell) => cell.iso >= weekStart && cell.iso < shiftUtcDay(weekStart, 7))
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const rendered = mode === 'month' ? cells : shownCells
  const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

  return <section className="calendar-board" aria-label="FIRMS observation calendar">
    <header className="calendar-board-heading"><div><CalendarDays size={17} /><div><b>Activity Calendar — {monthDate.toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'long', year: 'numeric' })}</b><small>{observationState === 'ready' ? `Observed records · ${days} UTC ${days === 1 ? 'day' : 'days'} · ${windowStart} to ${windowEnd}` : observationState === 'loading' ? 'Loading the selected NASA FIRMS window' : observationState === 'error' ? 'Selected FIRMS window is unavailable' : 'Load observations to populate queried dates'}</small></div></div><div className="calendar-board-actions"><div className="calendar-month-nav"><button aria-label="Previous month" title="Previous month" onClick={() => setMonth((value) => shiftUtcMonth(value, -1))}><ChevronLeft size={13} /></button><button aria-label="Next month" title="Next month" onClick={() => setMonth((value) => shiftUtcMonth(value, 1))}><ChevronRight size={13} /></button></div><div className="calendar-mode-toggle"><button className={mode === 'month' ? 'selected' : ''} onClick={() => setMode('month')} aria-pressed={mode === 'month'}>Month</button><button className={mode === 'week' ? 'selected' : ''} onClick={() => setMode('week')} aria-pressed={mode === 'week'}>Week</button></div></div></header>
    <div className="calendar-grid-wrap"><div className="calendar-weekdays">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div><div className={`calendar-grid ${mode === 'week' ? 'week-mode' : ''}`}>{rendered.map((cell) => <button key={cell.iso} className={`calendar-day ${cell.iso === selectedDate ? 'selected' : ''} ${cell.iso.slice(0, 7) !== month ? 'adjacent-month' : ''} ${cell.state} ${cell.state === 'covered' && (cell.count ?? 0) === 0 ? 'zero-records' : ''}`} onClick={() => onSelectDate(cell.iso)} title={`${cell.iso} UTC · ${cell.label}`} aria-label={`${cell.iso}, ${cell.label}`} aria-pressed={cell.iso === selectedDate}><span>{cell.date.getUTCDate()}</span>{cell.state === 'covered' ? <b style={{ '--activity': String((cell.count ?? 0) / maximum) } as CSSProperties}>{(cell.count ?? 0).toLocaleString()}</b> : cell.state === 'loading' ? <i className="calendar-loading-dot" /> : <small>{cell.state === 'outside-window' ? '—' : cell.state === 'error' ? '!' : '·'}</small>}</button>)}</div></div>
    <aside className="calendar-legend"><span><i className="calendar-legend-count" /> Observations returned</span><span><i className="calendar-legend-empty" /> Queried, no records</span><span><i className="calendar-legend-unknown" /> Not queried / unavailable</span></aside>
  </section>
}

function CalendarWeekDetails({ selectedDate, observations, observationState, days, source, windowStart, windowEnd }: { selectedDate: string; observations: FireObservation[]; observationState: 'idle' | 'loading' | 'ready' | 'error'; days: number; source: string; windowStart: string; windowEnd: string }) {
  const weekStart = mondayOfUtcWeek(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftUtcDay(weekStart, index))
  const inWindow = weekDays.filter((day) => day >= windowStart && day <= windowEnd)
  const counts = weekDays.map((day) => ({ day, count: observations.filter((observation) => observation.acquiredAtUtc?.slice(0, 10) === day).length, queried: observationState === 'ready' && day >= windowStart && day <= windowEnd }))
  const weekObservations = observations.filter((observation) => observation.acquiredAtUtc && observation.acquiredAtUtc.slice(0, 10) >= weekStart && observation.acquiredAtUtc.slice(0, 10) < shiftUtcDay(weekStart, 7))
  const max = Math.max(1, ...counts.filter((item) => item.queried).map((item) => item.count))
  const end = shiftUtcDay(weekStart, 6)
  const peak = weekObservations.reduce<FireObservation | null>((current, item) => item.frpMw !== null && (current === null || item.frpMw > (current.frpMw ?? -Infinity)) ? item : current, null)
  const format = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })

  return <>
    <div className="panel-heading"><div><h2>Selected week details</h2><p>{format(weekStart)} – {format(end)}, {end.slice(0, 4)} · {source.replaceAll('_', ' ')}</p></div><CalendarDays size={18} /></div>
    <div className="calendar-week-total"><span>{observationState === 'ready' && inWindow.length ? weekObservations.length.toLocaleString() : '—'}</span><div><b>{observationState === 'ready' && inWindow.length ? 'Returned observations' : observationState === 'loading' && inWindow.length ? 'Loading requested days' : 'No queried week data'}</b><small>{inWindow.length} of 7 days fall inside the selected {days}-day FIRMS request</small></div></div>
    {observationState === 'ready' && inWindow.length > 0 ? <div className="calendar-week-chart" aria-label="Returned FIRMS observations per day">{counts.map(({ day, count, queried }) => <div className="calendar-week-bar" key={day} title={`${day} UTC · ${queried ? `${count} records returned` : 'not queried'}`}><b>{queried ? count.toLocaleString() : '—'}</b><i className={queried && count > 0 ? 'has-count' : ''} style={{ height: `${queried && count ? Math.max(4, (count / max) * 56) : 3}px` }} /><small>{format(day).split(' ')[1]}</small></div>)}</div> : <div className="calendar-detail-empty">{observationState === 'error' ? 'NASA FIRMS could not provide this observation window.' : observationState === 'loading' ? 'The requested observations are loading.' : observationState === 'ready' ? 'No dates in this week were covered by the selected query.' : 'Load the selected product from Dashboard or Live Map; dates without a request remain unknown.'}</div>}
    {peak && <div className="calendar-peak"><Flame size={15} /><span>Highest FRP in this week</span><b>{peak.frpMw} MW</b><small>{peak.acquiredAtUtc ? new Date(peak.acquiredAtUtc).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'time unavailable'}</small></div>}
    <div className="calendar-coverage-note"><AlertTriangle size={14} /><span>Coverage percentage and confidence are not supplied as week-level aggregates by this request. Zero returned records is not proof of no fire.</span></div>
  </>
}

export function App() {
  const workspace = useWorkspaceState()
  const { view: active, setView: setActive, location, setLocation, windVisible, setWindVisible, terrainEnabled, setTerrainEnabled, selectedTime, setSelectedTime, selectedDate, setSelectedDate, firmsProduct, setFirmsProduct, compareProductA: compareSourceA, setCompareProductA: setCompareSourceA, compareProductB: compareSourceB, setCompareProductB: setCompareSourceB, firmsDays, setFirmsDays } = workspace
  const [navOpen, setNavOpen] = useState(false)
  const [windOverride, setWindOverride] = useState<number | null>(null)
  const [horizon, setHorizon] = useState(6)
  const [compareMode, setCompareMode] = useState<'swipe' | 'side-by-side'>('swipe')
  const [compareSplit, setCompareSplit] = useState(50)
  const [transectVisible, setTransectVisible] = useState(true)
  const [terrainRefresh, setTerrainRefresh] = useState(0)
  const [elevation, setElevation] = useState<{ value: number; state: 'loading' | 'ready' | 'error' }>({ value: 0, state: 'loading' })
  const [activeDetection, setActiveDetection] = useState<FireObservation | null>(null)
  const compareMapSync = useRef<MapSyncGroup>({ maps: new Set(), syncing: false })
  const { hours, retrievedAt, state, retry } = useWeather(location.lat, location.lon)
  const windField = useWindField(location.lat, location.lon)
  const firms = useFirms(location.lat, location.lon, firmsProduct, firmsDays)
  const compareA = useFirms(location.lat, location.lon, compareSourceA, firmsDays)
  const compareB = useFirms(location.lat, location.lon, compareSourceB, firmsDays)
  const terrainAnalysis = useTerrainAnalysis(location.lat, location.lon, active === 'Terrain', terrainRefresh)
  const terrainTransect = useMemo(() => terrainTransectCoordinates(location.lat, location.lon), [location.lat, location.lon])
  useEffect(() => { setWindOverride(null); setElevation({ value: 0, state: 'loading' }) }, [location])
  useEffect(() => { setActiveDetection(null) }, [location, firms.source, compareSourceA, compareSourceB, selectedDate])
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ latitude: String(location.lat), longitude: String(location.lon) })
    fetch(`https://api.open-meteo.com/v1/elevation?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Elevation unavailable'); return response.json() })
      .then((payload) => {
        if (typeof payload.elevation?.[0] !== 'number') throw new Error('Elevation unavailable')
        setElevation({ value: payload.elevation[0], state: 'ready' })
      })
      .catch((error: unknown) => { if (!(error instanceof Error && error.name === 'AbortError')) setElevation((current) => ({ ...current, state: 'error' })) })
    return () => controller.abort()
  }, [location])
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
  const nowIndex = Math.max(0, hours.findIndex((hour) => new Date(hour.time).getTime() >= Date.now()))
  const forecastStartIndex = Math.min(nowIndex, Math.max(hours.length - 1, 0))
  const visibleHours = hours.slice(forecastStartIndex, forecastStartIndex + 36)
  const hourCount = visibleHours.length
  const peakObservation = firms.observations.reduce<FireObservation | null>((peak, observation) => observation.frpMw !== null && (peak === null || observation.frpMw > (peak.frpMw ?? -Infinity)) ? observation : peak, null)
  const calendarWindowEnd = firms.fetchedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  const calendarWindowStart = shiftUtcDay(calendarWindowEnd, 1 - firms.days)
  const calendarSelectedDate = selectedDate ?? calendarWindowEnd
  const calendarSelectedRecords = firms.observations.filter((observation) => observation.acquiredAtUtc?.slice(0, 10) === calendarSelectedDate)
  const calendarDateQueried = firms.state === 'ready' && calendarSelectedDate >= calendarWindowStart && calendarSelectedDate <= calendarWindowEnd
  const compareObservations = [...compareA.observations, ...compareB.observations]
  const visibleObservations = active === 'Calendar'
    ? calendarDateQueried ? calendarSelectedRecords : []
    : active === 'Compare' ? compareObservations : firms.observations

  const moduleTitle = active === 'Field Situation' ? 'Field Situation' : active
  const dashboardPanel = <>
    <div className="panel-heading"><div><h2>Selected area briefing</h2><p>{location.name} · {location.lat.toFixed(3)}°, {location.lon.toFixed(3)}°</p></div><span className="status-tag">{firms.state === 'ready' ? 'OBSERVED' : 'CONTEXT'}</span></div>
    {firms.state === 'ready' && peakObservation ? <div className="briefing-hotspot"><div className="hotspot-emblem"><Flame size={19} /></div><div><span>Highest reported FRP in loaded window</span><b>{peakObservation.frpMw} MW</b><small>{peakObservation.satellite ?? firms.source} · {peakObservation.acquiredAtUtc ? new Date(peakObservation.acquiredAtUtc).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'acquisition time unavailable'}</small></div></div> : <div className="dashboard-briefing-state"><Satellite size={18} /><div><b>{firms.state === 'ready' ? 'No detections returned for this request' : firms.state === 'loading' ? 'Requesting satellite observations' : firms.state === 'error' ? 'Satellite request unavailable' : firms.configured === false ? 'NASA FIRMS key not configured' : 'Satellite observations not loaded'}</b><span>{firms.state === 'ready' ? 'This source and window returned no records; that does not establish that no fire is present.' : firms.state === 'error' ? firms.message : firms.configured === false ? 'The server needs FIRMS_MAP_KEY in its local environment before it can request observations.' : 'Load the selected NASA FIRMS product to summarize observed thermal anomalies.'}</span>{firms.state !== 'loading' && <button className="text-button" onClick={() => void firms.load()}>{firms.state === 'error' ? 'Retry FIRMS request' : 'Load selected product'}</button>}</div></div>}
    <div className="dashboard-weather-heading"><span>FIELD CONDITIONS</span><button className="icon-button" aria-label="Refresh weather" onClick={retry}><RefreshCw size={14} /></button></div>
    {state === 'loading' && <div className="data-state"><span className="spinner" /> Loading weather observations…</div>}
    {state === 'error' && <div className="error-box"><AlertTriangle size={17} /><div><strong>Weather unavailable</strong><p>Check your connection, then retry.</p><button className="text-button" onClick={retry}>Retry weather request</button></div></div>}
    {weather && <>
      <div className="weather-primary"><div className="wind-glyph" style={{ transform: `rotate(${directionTo}deg)` }}><Wind size={25} /></div><div className="wind-value">{Math.round(displayWind)} <small>km/h</small><span>Blowing toward {windDirectionLabel(directionTo ?? 0)} · gusts {Math.round(weather.gusts)} km/h</span></div></div>
      <div className="weather-grid"><div className="weather-metric"><span><CloudRain size={15} /> Precipitation</span><b>{weather.precipitation.toFixed(1)} <small>mm</small></b><small>selected hour</small></div><div className="weather-metric"><span><Activity size={15} /> Temperature</span><b>{weather.temperature.toFixed(1)} <small>°C</small></b><small>2 m above ground</small></div></div>
      <div className="weather-grid"><div className="weather-metric"><span><Activity size={15} /> Relative humidity</span><b>{Math.round(weather.humidity)} <small>%</small></b><small>2 m above ground</small></div><div className="weather-metric"><span><Wind size={15} /> Wind gust</span><b>{Math.round(weather.gusts)} <small>km/h</small></b><small>10 m above ground</small></div></div>
      <div className={`wind-field-state ${windField.state}`}><span className="wind-state-mark"><Wind size={14} /></span><div><b>{windField.state === 'ready' ? `${windField.nodes.length} forecast points feeding the map` : windField.state === 'loading' ? 'Building the local wind field…' : 'Wind field unavailable'}</b><small>{windField.state === 'ready' ? `Field interpolated for ${new Date(weather.time).toISOString().slice(0, 16).replace('T', ' ')} UTC; particles show flow, not travel time` : windField.state === 'error' ? 'Map particles are paused because grid data is unavailable.' : 'Fetching hourly speed and direction across the map extent.'}</small></div></div>
      <div className="source-note"><Clock3 size={14} /><span>Valid {new Date(weather.time).toLocaleString('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC · Retrieved {retrievedAt ? new Date(retrievedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '—'} UTC · Open-Meteo</span></div>
    </>}
    <div className="important-note"><Flame size={15} /><span>Satellite thermal detections are not confirmed fires. No historical baseline, incident perimeter or suppression status is available here.</span></div>
  </>

  const firmsStatus = firms.state === 'ready'
    ? <div className="firms-result"><b>{firms.message}</b>{firms.fetchedAt && <small>NASA response retrieved {new Date(firms.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · source {firms.source}</small>}</div>
    : firms.state === 'error'
      ? <div className="firms-error"><AlertTriangle size={15} /><span>{firms.message}{firms.configured === false && <> Request a key at NASA, then save it as <code>FIRMS_MAP_KEY</code> in the server’s local `.env` file.</>}</span></div>
      : <div className="module-empty"><Satellite size={23} /><b>NASA FIRMS observations are not connected</b><p>Load a source for this map extent. The server keeps the MAP_KEY private; without one, the request will remain unavailable.</p><a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer">FIRMS API requirements <ChevronRight size={13} /></a></div>
  const moduleBody = active === 'Dashboard' ? dashboardPanel : active === 'Calendar' ? <CalendarWeekDetails selectedDate={calendarSelectedDate} observations={firms.observations} observationState={firms.state} days={firms.days} source={firms.source} windowStart={calendarWindowStart} windowEnd={calendarWindowEnd} /> : active === 'Live Map' ? <>
    <div className="panel-heading"><div><h2>Map layers & observations</h2><p>Map view · {location.name}</p></div><span className="status-tag">{terrainEnabled ? '3D TERRAIN' : '2D MAP'}</span></div>
    <div className="module-section"><div className="module-label">VISIBLE CONTEXT</div><div className="layer-row"><span><Wind size={15} /> Interpolated wind field</span><b className={windField.state === 'ready' && windVisible ? 'layer-on' : ''}>{windVisible ? windField.state.toUpperCase() : 'HIDDEN'}</b></div><div className="layer-row"><span><Mountain size={15} /> Terrain relief</span><b className={terrainEnabled ? 'layer-on' : ''}>{terrainEnabled ? '3D ON' : '2D'}</b></div><div className="layer-row"><span><CloudRain size={15} /> Hourly precipitation</span><b className="layer-on">LIVE</b></div><div className="layer-row"><span><Flame size={15} /> MODIS / VIIRS hotspots</span><b className={firms.observations.length ? 'layer-on' : ''}>{firms.observations.length ? `${firms.observations.length} LOADED` : 'NOT LOADED'}</b></div><p className="module-hint">Wind streamlines are interpolated between 25 Open-Meteo forecast points. Their animation conveys direction and relative speed, not particle travel time.</p></div>
    <div className="module-section"><div className="module-label">NASA FIRMS PRODUCT</div><div className="selected-product"><Satellite size={14} /><span>{firmsSources.find((item) => item.id === firms.source)?.label ?? firms.source}</span></div><button className="primary-action" onClick={() => void firms.load()} disabled={firms.state === 'loading'}>{firms.state === 'loading' ? <><span className="spinner" /> Requesting NASA FIRMS…</> : <><RefreshCw size={14} /> Load detections · {firms.days === 1 ? 'today UTC' : `${firms.days} UTC days`}</>}</button><small className="module-hint">Area query is centered on {location.name}. The selected UTC-day range is sent to NASA FIRMS; products remain separate and dates are not a rolling forecast period.</small>{firms.state !== 'idle' && firmsStatus}</div>
    {activeDetection && <div className="detection-detail"><div className="module-label">SELECTED SATELLITE OBSERVATION</div><b>{activeDetection.source.replaceAll('_', ' ')}</b><span>{activeDetection.latitude.toFixed(4)}°, {activeDetection.longitude.toFixed(4)}°</span><span>{activeDetection.acquiredAtUtc ? new Date(activeDetection.acquiredAtUtc).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Acquisition time unavailable'}</span><div className="detail-grid"><span>Native confidence</span><b>{activeDetection.confidenceNative ?? 'not provided'}</b><span>FRP</span><b>{activeDetection.frpMw === null ? 'not provided' : `${activeDetection.frpMw} MW`}</b><span>Satellite</span><b>{activeDetection.satellite ?? 'not provided'}</b><span>Product version</span><b>{activeDetection.productVersion ?? 'not provided'}</b></div><small>Thermal anomaly observation · not a confirmed incident</small></div>}
  </> : active === 'Compare' ? <>
    <div className="panel-heading"><div><h2>Sensor comparison</h2><p>MODIS and VIIRS stay separate</p></div><Layers3 size={18} /></div>
    <p className="compare-intro">Both products use the same map extent and UTC request window. Load them separately to preserve their source identity.</p>
    <div className="compare-source-control modis"><label htmlFor="compare-source-a"><span>Sensor A · MODIS</span><select id="compare-source-a" value={compareSourceA} onChange={(event) => setCompareSourceA(event.target.value as FirmsProduct)}>{firmsSources.filter((item) => item.id.startsWith('MODIS')).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div><span className={`compare-state-dot ${compareA.state}`} />{compareA.state === 'ready' ? `${compareA.observations.length.toLocaleString()} records · ${compareA.fetchedAt ? new Date(compareA.fetchedAt).toISOString().slice(11, 16) + ' UTC' : 'loaded'}` : compareA.state === 'error' ? 'Request unavailable' : compareA.state === 'loading' ? 'Requesting NASA FIRMS…' : compareA.configured === false ? 'Server key not configured' : 'Not loaded'}</div><button className="primary-action" onClick={() => void compareA.load()} disabled={compareA.state === 'loading'}>{compareA.state === 'loading' ? <><span className="spinner" /> Loading MODIS…</> : <><RefreshCw size={13} /> {compareA.state === 'error' ? 'Retry MODIS' : 'Load MODIS product'}</>}</button></div>
    <div className="compare-source-control viirs"><label htmlFor="compare-source-b"><span>Sensor B · VIIRS</span><select id="compare-source-b" value={compareSourceB} onChange={(event) => setCompareSourceB(event.target.value as FirmsProduct)}>{firmsSources.filter((item) => item.id.startsWith('VIIRS')).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div><span className={`compare-state-dot ${compareB.state}`} />{compareB.state === 'ready' ? `${compareB.observations.length.toLocaleString()} records · ${compareB.fetchedAt ? new Date(compareB.fetchedAt).toISOString().slice(11, 16) + ' UTC' : 'loaded'}` : compareB.state === 'error' ? 'Request unavailable' : compareB.state === 'loading' ? 'Requesting NASA FIRMS…' : compareB.configured === false ? 'Server key not configured' : 'Not loaded'}</div><button className="primary-action" onClick={() => void compareB.load()} disabled={compareB.state === 'loading'}>{compareB.state === 'loading' ? <><span className="spinner" /> Loading VIIRS…</> : <><RefreshCw size={13} /> {compareB.state === 'error' ? 'Retry VIIRS' : 'Load VIIRS product'}</>}</button></div>
    <div className="compare-metric-grid"><div><span>MODIS returned</span><b>{compareA.state === 'ready' ? compareA.observations.length.toLocaleString() : '—'}</b></div><div><span>VIIRS returned</span><b>{compareB.state === 'ready' ? compareB.observations.length.toLocaleString() : '—'}</b></div><div><span>Dates with records in both</span><b>{compareA.state === 'ready' && compareB.state === 'ready' ? (() => { const a = new Set(compareA.observations.map((item) => item.acquiredAtUtc?.slice(0, 10)).filter(Boolean)); return new Set(compareB.observations.map((item) => item.acquiredAtUtc?.slice(0, 10)).filter((day) => day && a.has(day))).size })() : '—'}</b></div></div>
    <div className="compare-validation"><AlertTriangle size={15} /><div><b>Agreement not evaluated</b><p>Shared dates mean both products returned records on those UTC days. This does not measure shared overpass, spatial coverage, or detection agreement. No calibration score is available.</p></div></div>
    {activeDetection && <div className="detection-detail"><div className="module-label">SELECTED SATELLITE OBSERVATION</div><b>{activeDetection.source.replaceAll('_', ' ')}</b><span>{activeDetection.latitude.toFixed(4)}°, {activeDetection.longitude.toFixed(4)}°</span><span>{activeDetection.acquiredAtUtc ? new Date(activeDetection.acquiredAtUtc).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Acquisition time unavailable'}</span><div className="detail-grid"><span>Native confidence</span><b>{activeDetection.confidenceNative ?? 'not provided'}</b><span>FRP</span><b>{activeDetection.frpMw === null ? 'not provided' : `${activeDetection.frpMw} MW`}</b><span>Satellite</span><b>{activeDetection.satellite ?? 'not provided'}</b><span>Product version</span><b>{activeDetection.productVersion ?? 'not provided'}</b></div><small>Thermal anomaly observation · not a confirmed incident</small></div>}
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
    <div className="source-card"><div><Wind size={16} /><b>Open-Meteo wind grid</b><span className={windField.state === 'ready' ? 'source-live' : 'source-missing'}>{windField.state === 'ready' ? 'CONNECTED' : windField.state.toUpperCase()}</span></div><p>{windField.state === 'ready' ? `${windField.nodes.length} grid locations interpolate hourly wind speed and direction into the animated map field.` : 'A 5 × 5 hourly forecast grid drives the map wind field.'}</p><small>25 locations · UTC · selected timeline hour · direction-aware vector interpolation</small><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">API documentation <ChevronRight size={12} /></a></div>
    <div className="source-card"><div><Mountain size={16} /><b>Mapzen Terrain Tiles · Terrarium</b><span className={terrainAnalysis.state === 'ready' ? 'source-live' : 'source-missing'}>{terrainAnalysis.state === 'ready' ? 'SAMPLED' : terrainAnalysis.state.toUpperCase()}</span></div><p>Bare-earth elevation tiles drive the 3D relief and the selected-point slope/aspect and transect samples.</p><small>Terrarium RGB · Canadian source attribution: Open Government Licence — Canada. Land cover and fuel classes remain unconnected.</small><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Dataset details <ChevronRight size={12} /></a></div>
    <div className="source-card"><div><Mountain size={16} /><b>Open-Meteo Elevation</b><span className={elevation.state === 'ready' ? 'source-live' : 'source-missing'}>{elevation.state === 'ready' ? 'CONNECTED' : elevation.state.toUpperCase()}</span></div><p>{elevation.state === 'ready' ? `Point elevation: ${Math.round(elevation.value)} m.` : 'Point elevation lookup for selected coordinates.'}</p><small>One coordinate sample · metres above sea level</small></div>
    <div className="source-card source-disconnected"><div><Satellite size={16} /><b>NASA FIRMS</b><span className={firms.configured ? 'source-live' : 'source-missing'}>{firms.configured ? 'SERVER KEY SET' : 'KEY NOT SET'}</span></div><p>MODIS / VIIRS area requests run through the server-side proxy. The MAP_KEY is never sent to the browser.</p><small>{firms.state === 'ready' ? `${firms.observations.length.toLocaleString()} normalized detections · ${firms.source}` : 'Product, area, response count and retrieval timestamp are retained per request.'}</small><a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer">FIRMS API documentation <ChevronRight size={12} /></a></div>
  </> : active === 'Scenario' ? <>
    <div className="scenario-banner"><AlertTriangle size={16} /><div><b>SCENARIO ONLY</b><span>Not an operational forecast or instruction</span></div></div>
    <div className="panel-heading"><div><h2>Wind sensitivity</h2><p>Explore an input; no fire spread is computed</p></div><Flame size={18} /></div>
    {weather && <div className="scenario-source">Input at {new Date(weather.time).toISOString().slice(0, 16).replace('T', ' ')} UTC · source forecast {Math.round(weather.windSpeed)} km/h {windDirectionLabel(weather.windDirectionFrom)}</div>}
    <label className="field-label" htmlFor="wind-override">Wind speed hypothesis <b>{windOverride ?? Math.round(weather?.windSpeed ?? 0)} km/h</b></label><input id="wind-override" type="range" min="0" max="100" value={windOverride ?? Math.round(weather?.windSpeed ?? 0)} onChange={(event) => setWindOverride(Number(event.target.value))} />
    <label className="field-label" htmlFor="horizon">Scenario horizon <b>{horizon} hours</b></label><select id="horizon" className="module-select" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}><option value={1}>1 hour</option><option value={3}>3 hours</option><option value={6}>6 hours</option><option value={12}>12 hours</option><option value={24}>24 hours</option></select>
    <div className="module-empty compact-empty"><Mountain size={19} /><b>Spread envelope unavailable</b><p>A dated incident perimeter, documented fuel type, fuel moisture, terrain raster and validated FBP model are missing. This view will not draw synthetic fire growth.</p></div>
    <div className="scenario-input-state"><span>Weather input</span><b>{weather ? 'Available · Open-Meteo' : 'Loading'}</b><span>Incident perimeter</span><b>Missing</b><span>FBP fuel & moisture</span><b>Missing</b><span>Validated model</span><b>Not configured</b></div>
  </> : <>
    <div className="panel-heading"><div><h2>Field situation</h2><p>Read-only context for field teams</p></div><Compass size={18} /></div>
    <div className="field-map-status"><Map size={18} /><div><b>{location.name}</b><span>{weather ? `${Math.round(weather.windSpeed)} km/h wind · blowing ${windDirectionLabel(directionTo ?? 0)}` : 'Weather loading'}</span></div></div>
    <div className="important-note field-warning"><Flame size={15} /><span>No incident perimeter or crew tasking is available. Confirm all operational decisions with incident command.</span></div>
    <div className="module-section"><div className="module-label">FIELD DATA STATUS</div><div className="layer-row"><span><Wind size={15} /> Weather forecast</span><b className={weather ? 'layer-on' : ''}>{weather ? 'LIVE' : 'LOADING'}</b></div><div className="layer-row muted-row"><span><Satellite size={15} /> Satellite detections</span><b>NOT CONNECTED</b></div><div className="layer-row muted-row"><span><Map size={15} /> Incident perimeter</span><b>NOT AVAILABLE</b></div></div>
  </>

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

    <main className={`main-shell ${active === 'Compare' ? 'compare-active' : ''}`}>
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div className="page-heading"><h1>{moduleTitle}</h1><span>Alberta fire intelligence</span></div>
        <div className="global-controls"><label className="control location-control"><LocateFixed size={15} /><select aria-label="Select location" value={workspaceLocations.some((item) => item.name === location.name) ? location.name : '__map__'} onChange={(event) => { const next = workspaceLocations.find((item) => item.name === event.target.value); if (next) setLocation(next) }}>{workspaceLocations.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}{!workspaceLocations.some((item) => item.name === location.name) && <option value="__map__">{location.name}</option>}</select><ChevronDown size={14} /></label><label className="control product-control" title="NASA FIRMS sensor product"><Satellite size={15} /><select aria-label="NASA FIRMS sensor product" value={firmsProduct} onChange={(event) => setFirmsProduct(event.target.value as FirmsProduct)}>{firmsSources.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={14} /></label><label className="control date-control" title="NASA FIRMS UTC observation window"><CalendarDays size={15} /><select aria-label="NASA FIRMS observation window" value={firmsDays} onChange={(event) => setFirmsDays(Number(event.target.value) as 1 | 2 | 3 | 5)}><option value={1}>Today · UTC</option><option value={2}>Last 2 UTC days</option><option value={3}>Last 3 UTC days</option><option value={5}>Last 5 UTC days</option></select><ChevronDown size={14} /></label><button className="help-button" aria-label="Help" title="Satellite detections are observations, not confirmed fires"><CircleHelp size={18} /></button></div>
      </header>

      <section className={`workspace ${active === 'Dashboard' ? 'dashboard-workspace' : active === 'Calendar' ? 'calendar-workspace' : active === 'Compare' ? 'compare-workspace' : active === 'Terrain' ? 'terrain-workspace' : ''}`}>
        <div className="map-column">
          <div className="map-toolbar"><div className="map-title"><span className="eyebrow-icon"><Map size={15} /></span><div><strong>{location.name}</strong><small>{active === 'Scenario' ? 'Hypothetical inputs · no spread perimeter available' : active === 'Compare' ? 'MODIS + VIIRS detections · shared area and UTC window' : `${windField.state === 'ready' ? `${windField.nodes.length} point live wind field` : 'Live wind field loading'} · click map to inspect a location`}</small></div></div><div className="map-actions"><button className="map-mode-button" aria-pressed={terrainEnabled} title={terrainEnabled ? 'Switch to flat 2D map' : 'Enable 3D terrain'} onClick={() => setTerrainEnabled((value) => !value)}><Mountain size={15} /><span>{terrainEnabled ? '3D' : '2D'}</span></button><button className={`map-mode-button ${windVisible ? 'mode-active' : ''}`} aria-pressed={windVisible} title={windVisible ? 'Hide animated wind field' : 'Show animated wind field'} onClick={() => setWindVisible((value) => !value)}><Wind size={15} /><span>Wind</span></button><button className="icon-button" title="Search map" aria-label="Search map" onClick={() => document.querySelector<HTMLSelectElement>('.location-control select')?.focus()}><Search size={16} /></button><button className="icon-button" title="Map layers" aria-label="Map layers" onClick={() => setActive('Live Map')}><Layers3 size={16} /></button></div></div>
          {active === 'Compare' ? <div className={`compare-map-stage ${compareMode}`}>
            <div className="compare-map-a"><MapCanvas lat={location.lat} lon={location.lon} windDirection={weather?.windDirectionFrom} observations={compareA.observations} windNodes={windField.nodes} windTime={weather?.time} windVisible={windVisible} terrainEnabled={terrainEnabled} onSelectPoint={setLocation} onSelectObservation={setActiveDetection} syncGroup={compareMapSync.current} /></div>
            <div className="compare-map-b" style={compareMode === 'swipe' ? { clipPath: `inset(0 0 0 ${compareSplit}%)` } : undefined}><MapCanvas lat={location.lat} lon={location.lon} windDirection={weather?.windDirectionFrom} observations={compareB.observations} windNodes={windField.nodes} windTime={weather?.time} windVisible={windVisible} terrainEnabled={terrainEnabled} onSelectPoint={setLocation} onSelectObservation={setActiveDetection} syncGroup={compareMapSync.current} /></div>
            <div className="compare-mode-control" role="group" aria-label="Comparison map layout"><button className={compareMode === 'swipe' ? 'selected' : ''} onClick={() => setCompareMode('swipe')} aria-pressed={compareMode === 'swipe'}>↔ Swipe</button><button className={compareMode === 'side-by-side' ? 'selected' : ''} onClick={() => setCompareMode('side-by-side')} aria-pressed={compareMode === 'side-by-side'}>▥ Side-by-side</button></div>
            {compareMode === 'swipe' && <><div className="compare-swipe-divider" style={{ left: `${compareSplit}%` }} aria-hidden="true"><span>↔</span></div><input className="compare-swipe-input" type="range" min="15" max="85" value={compareSplit} onChange={(event) => setCompareSplit(Number(event.target.value))} aria-label="Adjust comparison divider" /></>}
            <div className="compare-map-chip modis"><i />{compareSourceA.replaceAll('_', ' ')} · {compareA.state === 'ready' ? compareA.observations.length.toLocaleString() : compareA.state.toUpperCase()}</div><div className="compare-map-chip viirs"><i />{compareSourceB.replaceAll('_', ' ')} · {compareB.state === 'ready' ? compareB.observations.length.toLocaleString() : compareB.state.toUpperCase()}</div>
          </div> : <MapCanvas lat={location.lat} lon={location.lon} windDirection={weather?.windDirectionFrom} observations={visibleObservations} windNodes={windField.nodes} windTime={weather?.time} windVisible={windVisible} terrainEnabled={terrainEnabled} onSelectPoint={setLocation} onSelectObservation={setActiveDetection} terrainTransect={active === 'Terrain' && transectVisible ? terrainTransect : undefined} />}
          {active === 'Dashboard' && <section className="dashboard-map-summary" aria-label="Area activity summary"><div className="dashboard-map-kicker"><span>ALBERTA WILDFIRE SUMMARY</span><span className={firms.state === 'ready' ? 'summary-dot summary-ready' : 'summary-dot'} />{firms.state === 'ready' ? 'SOURCE LOADED' : firms.state === 'loading' ? 'REQUESTING' : firms.configured === false ? 'KEY NOT SET' : 'NOT LOADED'}</div><small>{location.name} · {firms.days} UTC {firms.days === 1 ? 'day' : 'days'}</small><div className="dashboard-detection-count"><span>{firms.state === 'ready' ? firms.observations.length.toLocaleString() : '—'}</span><div><b>Observed detections</b><small>{firms.state === 'ready' ? 'Satellite thermal anomalies' : firms.state === 'loading' ? 'Request in progress' : 'Not confirmed fires'}</small></div></div><div className="dashboard-product-line"><Satellite size={14} /><span>{firmsSources.find((item) => item.id === firms.source)?.label ?? firms.source}</span></div>{weather && <div className="dashboard-condition-row"><div><Wind size={14} /><span>Wind</span><b>{Math.round(weather.windSpeed)} km/h</b></div><div><CloudRain size={14} /><span>Rain</span><b>{weather.precipitation.toFixed(1)} mm</b></div></div>}{firms.configured === false && <small className="dashboard-key-note">Set FIRMS_MAP_KEY in the server’s local environment to load NASA observations.</small>}<button className="dashboard-load-button" onClick={() => void firms.load()} disabled={firms.state === 'loading'}>{firms.state === 'loading' ? <><span className="spinner" /> Loading observations</> : <><RefreshCw size={13} /> {firms.state === 'error' ? 'Retry satellite data' : 'Load satellite data'}</>}</button>{firms.fetchedAt && <small className="dashboard-freshness">Retrieved {new Date(firms.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC</small>}</section>}
          {active === 'Calendar' && <section className="calendar-map-summary" aria-label="Calendar area summary"><div className="dashboard-map-kicker"><span>CALENDAR SUMMARY</span><span className={firms.state === 'ready' ? 'summary-dot summary-ready' : 'summary-dot'} />{firms.state === 'ready' ? 'WINDOW LOADED' : firms.state === 'loading' ? 'REQUESTING' : firms.configured === false ? 'KEY NOT SET' : 'NOT LOADED'}</div><b>{location.name}</b><small>{calendarSelectedDate} UTC · {firms.source.replaceAll('_', ' ')}</small><div className="calendar-summary-count"><span>{calendarDateQueried ? calendarSelectedRecords.length.toLocaleString() : '—'}</span><div><b>{calendarDateQueried ? 'Returned records' : 'Date not queried'}</b><small>{calendarDateQueried ? 'Not an incident count' : `${calendarWindowStart} → ${calendarWindowEnd}`}</small></div></div>{!calendarDateQueried && firms.state !== 'loading' && <button className="dashboard-load-button" onClick={() => void firms.load()}>{firms.state === 'error' ? 'Retry FIRMS request' : 'Load selected product'}</button>}<small className="calendar-summary-caveat">A day outside the requested window is unknown, not a zero.</small></section>}
          {active === 'Terrain' && <section className="terrain-map-controls"><header><Mountain size={16} /><div><b>Terrain layers</b><small>Map & local analysis</small></div></header><button className="terrain-map-layer" onClick={() => setTerrainEnabled((value) => !value)}><Mountain size={15} /><span>Elevation relief</span><b>{terrainEnabled ? '3D' : '2D'}</b></button><button className="terrain-map-layer" onClick={() => setTransectVisible((value) => !value)}><Activity size={15} /><span>Cross-section A—B</span><b>{transectVisible ? 'ON' : 'OFF'}</b></button><div className="terrain-map-layer static-layer"><Activity size={15} /><span>Local slope sample</span><b>{terrainAnalysis.state === 'ready' ? `${terrainAnalysis.slopeDegrees?.toFixed(1)}°` : terrainAnalysis.state.toUpperCase()}</b></div><div className="terrain-map-layer unavailable-layer"><Layers3 size={15} /><span>Land cover / fuels</span><b>NO SOURCE</b></div><div className="terrain-map-key"><i /> Cross-section · 80 km east–west</div></section>}
          <div className="map-legend"><span className="legend-wind"><i /> {windVisible ? `Animated wind field · ${windField.nodes.length || '—'} points` : 'Wind field hidden'}</span><span className="legend-boundary"><i /> Selected location</span><span className="legend-fire"><i className={(active === 'Compare' ? compareObservations.length > 0 : firms.state === 'ready' && visibleObservations.length > 0) ? 'fire-loaded' : ''} /> {active === 'Compare' ? `MODIS ${compareA.state === 'ready' ? compareA.observations.length : '—'} · VIIRS ${compareB.state === 'ready' ? compareB.observations.length : '—'} returned` : active === 'Calendar' ? calendarDateQueried ? `${visibleObservations.length} returned on ${calendarSelectedDate}` : 'Selected date outside loaded window' : firms.state === 'ready' ? `${firms.observations.length} detections returned · ${firms.source}` : 'NASA FIRMS not loaded'}</span></div>
        </div>

        <aside className="inspector">{moduleBody}</aside>

        {active === 'Dashboard' ? <DashboardBottom observations={firms.observations} observationState={firms.state} source={firms.source} days={firms.days} forecast={hours.slice(safeIndex, safeIndex + 24)} onLoad={() => void firms.load()} /> : active === 'Calendar' ? <CalendarBoard observations={firms.observations} observationState={firms.state} days={firms.days} selectedDate={calendarSelectedDate} onSelectDate={setSelectedDate} windowStart={calendarWindowStart} windowEnd={calendarWindowEnd} /> : active === 'Compare' ? <CompareBottom modis={compareA} viirs={compareB} /> : active === 'Terrain' ? <TerrainCrossSection analysis={terrainAnalysis} /> : <div className="bottom-strip"><div className="timeline-title"><Activity size={16} /><div><b>Weather timeline</b><small>Hourly forecast · wind, rain, temperature</small></div></div><div className="timeline-track forecast-track" aria-label="Hourly forecast selector">{visibleHours.map((hour, index) => { const absoluteIndex = forecastStartIndex + index; return <button key={hour.time} className={`forecast-tick ${absoluteIndex === safeIndex ? 'selected' : ''}`} style={{ height: `${Math.max(12, Math.min(34, 10 + hour.windSpeed * 0.28))}px` }} onClick={() => setSelectedTime(hour.time)} title={`${new Date(hour.time).toISOString().slice(0, 16).replace('T', ' ')} UTC · wind ${Math.round(hour.windSpeed)} km/h · rain ${hour.precipitation.toFixed(1)} mm`} aria-label={`Select ${hour.time} UTC, wind ${Math.round(hour.windSpeed)} kilometers per hour`} /> })}{!hours.length && <span className="timeline-empty">Hourly forecast unavailable</span>}</div><div className="timeline-select"><label htmlFor="forecast-time">{weather ? new Date(weather.time).toISOString().slice(11, 16) + ' UTC' : '—'}</label><input id="forecast-time" type="range" min={forecastStartIndex} max={Math.max(forecastStartIndex, forecastStartIndex + hourCount - 1)} value={Math.min(Math.max(safeIndex, forecastStartIndex), Math.max(forecastStartIndex, forecastStartIndex + hourCount - 1))} onChange={(event) => setSelectedTime(hours[Number(event.target.value)]?.time ?? null)} disabled={!hours.length} aria-label="Select forecast hour" /></div></div>}
      </section>
      <footer className="app-footer"><span>Weather: Open-Meteo · basemap: OpenStreetMap · DEM: Mapzen Terrarium via AWS · FIRMS: {firms.configured === false ? 'server key not set' : firms.configured ? 'server key configured' : 'checking configuration'}</span><span>Wind field is an hourly forecast visualization, not a fire-spread prediction</span></footer>
    </main>
  </div>
}
