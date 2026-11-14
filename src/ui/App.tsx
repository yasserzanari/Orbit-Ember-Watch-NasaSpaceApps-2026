import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import {
  Activity, AlertTriangle, CalendarDays, ChevronDown, ChevronRight, CircleHelp,
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

function useFirms(lat: number, lon: number) {
  const [source, setSource] = useState(firmsSources[0].id)
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
  }, [lat, lon, source])

  async function load() {
    const west = Math.max(-180, lon - 2.1)
    const east = Math.min(180, lon + 2.1)
    const south = Math.max(-90, lat - 1.4)
    const north = Math.min(90, lat + 1.4)
    const params = new URLSearchParams({ source, bbox: [west, south, east, north].join(','), days: '1' })
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

  return { source, setSource, observations, state, message, fetchedAt, configured, load }
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

const locations = [
  { name: 'Calgary, Alberta', lat: 51.0447, lon: -114.0719 },
  { name: 'Edmonton, Alberta', lat: 53.5461, lon: -113.4938 },
  { name: 'Jasper, Alberta', lat: 52.8737, lon: -118.0814 },
  { name: 'Fort McMurray, Alberta', lat: 56.7268, lon: -111.3803 },
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
  const glow = context.createRadialGradient(34, 32, 2, 34, 32, 29)
  glow.addColorStop(0, '#efffff')
  glow.addColorStop(0.16, '#8dffff')
  glow.addColorStop(0.38, '#3de1e0bb')
  glow.addColorStop(1, '#27bed500')
  context.fillStyle = glow
  context.beginPath(); context.arc(34, 32, 29, 0, Math.PI * 2); context.fill()
  context.strokeStyle = '#a4ffffcc'; context.lineWidth = 4; context.lineCap = 'round'
  context.beginPath(); context.moveTo(3, 32); context.lineTo(20, 32); context.stroke()
  return context.getImageData(0, 0, canvas.width, canvas.height)
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
      'line-color': ['interpolate', ['linear'], ['get', 'speedKmh'], 0, '#59dce0', 18, '#4ac5dc', 38, '#f4b12f', 70, '#f2683b'],
      'line-width': ['interpolate', ['linear'], ['get', 'speedKmh'], 0, 1.2, 35, 2.3, 70, 3.2],
      'line-opacity': 0.8,
      'line-blur': 0.5,
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

function MapCanvas({ lat, lon, windDirection, observations, windNodes, windTime, windVisible, terrainEnabled, onSelectPoint, onSelectObservation }: { lat: number; lon: number; windDirection?: number; observations: FireObservation[]; windNodes: WindNode[]; windTime?: string; windVisible: boolean; terrainEnabled: boolean; onSelectPoint: (point: MapPoint) => void; onSelectObservation: (observation: FireObservation | null) => void }) {
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
            tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: '&copy; AWS Terrain Tiles',
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
    return () => { map.current?.remove(); map.current = null }
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
      for (const id of ['wind-vector-arrows', 'wind-flow-trails', 'wind-flow-heads']) instance.setLayoutProperty(id, 'visibility', windVisible ? 'visible' : 'none')
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
  return <div className={`map-frame ${terrainEnabled ? 'terrain-active' : 'terrain-flat'}`}>
    <div ref={element} className="map-canvas" aria-label="Map centered on the selected Alberta area" />
    <div className="map-coordinates"><Compass size={13} /> {lat.toFixed(3)}° N · {Math.abs(lon).toFixed(3)}° W</div>
    {direction !== undefined && !windVisible && <div className="map-wind" style={{ transform: `rotate(${direction}deg)` }} aria-label={`Wind blows toward ${windDirectionLabel(direction)}`}><Wind size={24} /></div>}
    <div className="map-field-badge"><span className={windVisible && windNodes.length ? 'field-live-dot' : ''} />{windVisible ? `${windNodes.length || '—'}-point wind field` : 'Wind field hidden'} · {terrainEnabled ? '3D relief' : '2D'}</div>
    <div className="map-caption">Basemap © OpenStreetMap · Terrain © AWS Terrain Tiles · Wind: Open-Meteo</div>
  </div>
}

export function App() {
  const [active, setActive] = useState('Dashboard')
  const [location, setLocation] = useState(locations[0])
  const [navOpen, setNavOpen] = useState(false)
  const [windVisible, setWindVisible] = useState(true)
  const [terrainEnabled, setTerrainEnabled] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [windOverride, setWindOverride] = useState<number | null>(null)
  const [horizon, setHorizon] = useState(6)
  const [elevation, setElevation] = useState<{ value: number; state: 'loading' | 'ready' | 'error' }>({ value: 0, state: 'loading' })
  const [activeDetection, setActiveDetection] = useState<FireObservation | null>(null)
  const { hours, retrievedAt, state, retry } = useWeather(location.lat, location.lon)
  const windField = useWindField(location.lat, location.lon)
  const firms = useFirms(location.lat, location.lon)
  useEffect(() => { setSelectedIndex(null); setWindOverride(null); setElevation({ value: 0, state: 'loading' }) }, [location])
  useEffect(() => { setActiveDetection(null) }, [location, firms.source])
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
    setSelectedIndex((current) => current === null ? Math.max(0, hours.findIndex((hour) => new Date(hour.time).getTime() >= Date.now())) : Math.min(current, hours.length - 1))
  }, [hours])
  const safeIndex = Math.min(Math.max(selectedIndex ?? 0, 0), Math.max(hours.length - 1, 0))
  const weather = hours[safeIndex] ?? null
  const directionTo = weather ? toWindDirection(weather.windDirectionFrom) : undefined
  const displayWind = windOverride ?? weather?.windSpeed ?? 0
  const nowIndex = Math.max(0, hours.findIndex((hour) => new Date(hour.time).getTime() >= Date.now()))
  const forecastStartIndex = Math.min(nowIndex, Math.max(hours.length - 1, 0))
  const visibleHours = hours.slice(forecastStartIndex, forecastStartIndex + 36)
  const hourCount = visibleHours.length

  const moduleTitle = active === 'Field Situation' ? 'Field Situation' : active
  const weatherPanel = <>
    <div className="panel-heading"><div><h2>Weather at {location.name.split(',')[0]}</h2><p>{weather ? `Hourly forecast · ${new Date(weather.time).toLocaleString('en-CA', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC` : 'Current surface conditions'}</p></div><button className="icon-button" aria-label="Refresh weather" onClick={retry}><RefreshCw size={15} /></button></div>
    {state === 'loading' && <div className="data-state"><span className="spinner" /> Loading weather observations…</div>}
    {state === 'error' && <div className="error-box"><AlertTriangle size={17} /><div><strong>Weather unavailable</strong><p>Check your connection, then retry.</p><button className="text-button" onClick={retry}>Retry weather request</button></div></div>}
    {weather && <>
      <div className="weather-primary"><div className="wind-glyph" style={{ transform: `rotate(${directionTo}deg)` }}><Wind size={25} /></div><div className="wind-value">{Math.round(displayWind)} <small>km/h</small><span>from {windDirectionLabel(weather.windDirectionFrom)} · gusts {Math.round(weather.gusts)} km/h</span></div></div>
      <div className="weather-grid"><div className="weather-metric"><span><CloudRain size={15} /> Precipitation</span><b>{weather.precipitation.toFixed(1)} <small>mm</small></b><small>selected hour</small></div><div className="weather-metric"><span><Activity size={15} /> Temperature</span><b>{weather.temperature.toFixed(1)} <small>°C</small></b><small>2 m above ground</small></div></div>
      <div className="weather-grid"><div className="weather-metric"><span><Activity size={15} /> Relative humidity</span><b>{Math.round(weather.humidity)} <small>%</small></b><small>2 m above ground</small></div><div className="weather-metric"><span><Wind size={15} /> Wind gust</span><b>{Math.round(weather.gusts)} <small>km/h</small></b><small>10 m above ground</small></div></div>
      <div className="wind-compass"><div className="compass-ring"><span className="north">N</span><span className="east">E</span><span className="south">S</span><span className="west">W</span><div className="compass-arrow" style={{ transform: `rotate(${directionTo}deg)` }}><span /></div></div><div className="compass-copy"><b>Wind direction</b><span>Blowing toward {windDirectionLabel(directionTo ?? 0)} ({Math.round(directionTo ?? 0)}°)</span><small>Source reports direction wind comes from: {Math.round(weather.windDirectionFrom)}°</small></div></div>
      <div className={`wind-field-state ${windField.state}`}><span className="wind-state-mark"><Wind size={14} /></span><div><b>{windField.state === 'ready' ? `${windField.nodes.length} forecast points feeding the map` : windField.state === 'loading' ? 'Building the local wind field…' : 'Wind field unavailable'}</b><small>{windField.state === 'ready' ? `Grid interpolated for ${new Date(weather.time).toISOString().slice(0, 16).replace('T', ' ')} UTC · arrows show local direction and relative speed` : windField.state === 'error' ? 'The point forecast remains available; map particles are paused.' : 'Fetching hourly speed and direction across the map extent.'}</small></div></div>
      <div className="source-note"><Clock3 size={14} /><span>Valid {new Date(weather.time).toLocaleString('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC · Retrieved {retrievedAt ? new Date(retrievedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '—'} UTC · Open-Meteo</span></div>
    </>}
    <div className="section-divider" />
    <div className="panel-heading detection-heading"><div><h2>Satellite detections</h2><p>Thermal anomaly observations</p></div><span className="status-tag">Not connected</span></div>
    <div className="empty-detections"><Satellite size={21} /><strong>{firms.state === 'ready' ? `${firms.observations.length.toLocaleString()} observations returned · ${firms.source}` : firms.state === 'loading' ? 'Loading NASA FIRMS observations…' : firms.state === 'error' ? 'NASA FIRMS request unavailable' : 'NASA FIRMS data'}</strong><p>{firms.state === 'ready' ? firms.message : firms.state === 'error' ? firms.message : 'Load the latest UTC day for the selected point area. Satellite detections are not confirmed fires.'}</p>{firms.state === 'idle' && <button className="text-button" onClick={() => void firms.load()}>Load latest UTC day</button>}{firms.state === 'loading' && <span className="spinner" />}{firms.state === 'error' && <button className="text-button" onClick={() => void firms.load()}>Retry FIRMS request</button>}<a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">About NASA FIRMS <ChevronRight size={13} /></a></div>
    <div className="important-note"><Flame size={15} /><span>Satellite thermal detections are not confirmed fires. A period without detections does not prove there was no fire.</span></div>
  </>

  const firmsStatus = firms.state === 'ready'
    ? <div className="firms-result"><b>{firms.message}</b>{firms.fetchedAt && <small>NASA response retrieved {new Date(firms.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · source {firms.source}</small>}</div>
    : firms.state === 'error'
      ? <div className="firms-error"><AlertTriangle size={15} /><span>{firms.message}{firms.configured === false && <> Request a key at NASA, then save it as <code>FIRMS_MAP_KEY</code> in the server’s local `.env` file.</>}</span></div>
      : <div className="module-empty"><Satellite size={23} /><b>NASA FIRMS observations are not connected</b><p>Load a source for this map extent. The server keeps the MAP_KEY private; without one, the request will remain unavailable.</p><a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer">FIRMS API requirements <ChevronRight size={13} /></a></div>
  const moduleBody = active === 'Dashboard' ? weatherPanel : active === 'Live Map' ? <>
    <div className="panel-heading"><div><h2>Map layers & observations</h2><p>Map view · {location.name}</p></div><span className="status-tag">{terrainEnabled ? '3D TERRAIN' : '2D MAP'}</span></div>
    <div className="module-section"><div className="module-label">VISIBLE CONTEXT</div><div className="layer-row"><span><Wind size={15} /> Interpolated wind field</span><b className={windField.state === 'ready' && windVisible ? 'layer-on' : ''}>{windVisible ? windField.state.toUpperCase() : 'HIDDEN'}</b></div><div className="layer-row"><span><Mountain size={15} /> Terrain relief</span><b className={terrainEnabled ? 'layer-on' : ''}>{terrainEnabled ? '3D ON' : '2D'}</b></div><div className="layer-row"><span><CloudRain size={15} /> Hourly precipitation</span><b className="layer-on">LIVE</b></div><div className="layer-row"><span><Flame size={15} /> MODIS / VIIRS hotspots</span><b className={firms.observations.length ? 'layer-on' : ''}>{firms.observations.length ? `${firms.observations.length} LOADED` : 'NOT LOADED'}</b></div><p className="module-hint">Wind streamlines are interpolated between 25 Open-Meteo forecast points. Their animation conveys direction and relative speed, not particle travel time.</p></div>
    <div className="module-section"><div className="module-label">NASA FIRMS PRODUCT</div><label className="sr-only" htmlFor="firms-product">FIRMS product</label><select id="firms-product" className="module-select" value={firms.source} onChange={(event) => firms.setSource(event.target.value)}>{firmsSources.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button className="primary-action" onClick={() => void firms.load()} disabled={firms.state === 'loading'}>{firms.state === 'loading' ? <><span className="spinner" /> Requesting NASA FIRMS…</> : <><RefreshCw size={14} /> Load detections · today UTC</>}</button><small className="module-hint">Area query is centered on {location.name}; NASA’s one-day range means the current UTC date, not a rolling 24 hours. Products remain separate.</small>{firms.state !== 'idle' && firmsStatus}</div>
    {activeDetection && <div className="detection-detail"><div className="module-label">SELECTED SATELLITE OBSERVATION</div><b>{activeDetection.source.replaceAll('_', ' ')}</b><span>{activeDetection.latitude.toFixed(4)}°, {activeDetection.longitude.toFixed(4)}°</span><span>{activeDetection.acquiredAtUtc ? new Date(activeDetection.acquiredAtUtc).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Acquisition time unavailable'}</span><div className="detail-grid"><span>Native confidence</span><b>{activeDetection.confidenceNative ?? 'not provided'}</b><span>FRP</span><b>{activeDetection.frpMw === null ? 'not provided' : `${activeDetection.frpMw} MW`}</b><span>Satellite</span><b>{activeDetection.satellite ?? 'not provided'}</b><span>Product version</span><b>{activeDetection.productVersion ?? 'not provided'}</b></div><small>Thermal anomaly observation · not a confirmed incident</small></div>}
  </> : active === 'Calendar' ? <>
    <div className="panel-heading"><div><h2>Observation calendar</h2><p>Satellite activity by date</p></div><CalendarDays size={18} /></div>
    {firmsStatus}<div className="module-section"><div className="module-label">AVAILABLE IN THIS VIEW</div><p className="module-hint">The bottom timeline is the actual hourly weather forecast. It is not a satellite activity calendar and does not substitute for FIRMS observations.</p><div className="source-note"><Clock3 size={14} /><span>Forecast window: {hours.length ? `${new Date(hours[0].time).toISOString().slice(0, 10)} — ${new Date(hours.at(-1)!.time).toISOString().slice(0, 10)} UTC` : 'not loaded'}</span></div></div>
  </> : active === 'Compare' ? <>
    <div className="panel-heading"><div><h2>Sensor comparison</h2><p>MODIS and VIIRS stay separate</p></div><Layers3 size={18} /></div>
    <div className="compare-sensors"><div><b>MODIS</b><span>Terra · Aqua</span><small>FIRMS data unavailable</small></div><div><b>VIIRS</b><span>NOAA-20 · NOAA-21</span><small>FIRMS data unavailable</small></div></div>
    <div className="module-empty compact-empty"><AlertTriangle size={19} /><b>Comparison not evaluated</b><p>No observations are loaded for a shared area or time window. Counts, agreement scores, and calibration are withheld.</p></div>
    <div className="module-section"><div className="module-label">COMPARISON REQUIREMENTS</div><p className="module-hint">A validated comparison needs overlapping coverage, product-aware quality filters, a shared spatial support, and a held-out evaluation.</p></div>
  </> : active === 'Terrain' ? <>
    <div className="panel-heading"><div><h2>Terrain context</h2><p>Selected forecast grid point</p></div><Mountain size={18} /></div>
    <div className="terrain-elevation"><span>Elevation above sea level</span><b>{elevation.state === 'ready' ? `${Math.round(elevation.value)} m` : elevation.state === 'loading' ? 'Loading…' : 'Unavailable'}</b><small>Open-Meteo Elevation API · point estimate</small></div>
    <div className="module-section"><div className="module-label">LAYERS</div><div className="layer-row"><span><Mountain size={15} /> AWS Terrain Tiles DEM</span><b className={terrainEnabled ? 'layer-on' : ''}>{terrainEnabled ? '3D ON' : 'AVAILABLE'}</b></div><div className="layer-row"><span><Mountain size={15} /> Elevation at selected point</span><b className="layer-on">{elevation.state === 'ready' ? 'LIVE' : elevation.state.toUpperCase()}</b></div><div className="layer-row muted-row"><span><Layers3 size={15} /> Land cover / fuel class</span><b>NOT LOADED</b></div><div className="layer-row muted-row"><span><Activity size={15} /> Slope / aspect raster</span><b>NOT LOADED</b></div><p className="module-hint">The DEM draws 3D relief and hillshade. Land cover, fuel classes, slope, and aspect analysis still need dedicated raster data and are not inferred from the visual terrain.</p></div>
  </> : active === 'Data & Sources' ? <>
    <div className="panel-heading"><div><h2>Data & provenance</h2><p>Sources currently used in this view</p></div><Database size={18} /></div>
    <div className="source-card"><div><Wind size={16} /><b>Open-Meteo wind grid</b><span className={windField.state === 'ready' ? 'source-live' : 'source-missing'}>{windField.state === 'ready' ? 'CONNECTED' : windField.state.toUpperCase()}</span></div><p>{windField.state === 'ready' ? `${windField.nodes.length} grid locations interpolate hourly wind speed and direction into the animated map field.` : 'A 5 × 5 hourly forecast grid drives the map wind field.'}</p><small>25 locations · UTC · selected timeline hour · direction-aware vector interpolation</small><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">API documentation <ChevronRight size={12} /></a></div>
    <div className="source-card"><div><Mountain size={16} /><b>AWS Terrain Tiles · Terrarium</b><span className={terrainEnabled ? 'source-live' : 'source-missing'}>{terrainEnabled ? 'VISIBLE' : 'AVAILABLE'}</span></div><p>Public elevation raster drives MapLibre terrain and hillshade rendering.</p><small>Attribution: © AWS Terrain Tiles · visual relief is not a slope or fuel analysis.</small></div>
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
      <nav className="nav-list">{navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => { setActive(label); setNavOpen(false) }} aria-current={active === label ? 'page' : undefined}>
        <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Scenario' && <span className="nav-soon">WHAT-IF</span>}
      </button>)}</nav>
      <div className="sidebar-bottom"><div className="source-mark"><Satellite size={16} /><span>Earth observation workspace</span></div><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS <ChevronRight size={13} /></a></div>
    </aside>
    {navOpen && <button className="nav-backdrop" onClick={() => setNavOpen(false)} aria-label="Close navigation" />}

    <main className="main-shell">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div className="page-heading"><h1>{moduleTitle}</h1><span>Alberta fire intelligence</span></div>
        <div className="global-controls"><label className="control location-control"><LocateFixed size={15} /><select aria-label="Select location" value={locations.some((item) => item.name === location.name) ? location.name : '__map__'} onChange={(event) => { const next = locations.find((item) => item.name === event.target.value); if (next) setLocation(next) }}>{locations.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}{!locations.some((item) => item.name === location.name) && <option value="__map__">{location.name}</option>}</select><ChevronDown size={14} /></label><div className="control date-control"><CalendarDays size={15} /><span>{weather ? new Date(weather.time).toLocaleString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC' : 'Forecast loading'}</span></div><button className="help-button" aria-label="Help" title="Data notes: satellite detections are not confirmed fires"><CircleHelp size={18} /></button></div>
      </header>

      <section className="workspace">
        <div className="map-column">
          <div className="map-toolbar"><div className="map-title"><span className="eyebrow-icon"><Map size={15} /></span><div><strong>{location.name}</strong><small>{active === 'Scenario' ? 'Hypothetical inputs · no spread perimeter available' : `${windField.state === 'ready' ? `${windField.nodes.length} point live wind field` : 'Live wind field loading'} · click map to inspect a location`}</small></div></div><div className="map-actions"><button className="map-mode-button" aria-pressed={terrainEnabled} title={terrainEnabled ? 'Switch to flat 2D map' : 'Enable 3D terrain'} onClick={() => setTerrainEnabled((value) => !value)}><Mountain size={15} /><span>{terrainEnabled ? '3D' : '2D'}</span></button><button className={`map-mode-button ${windVisible ? 'mode-active' : ''}`} aria-pressed={windVisible} title={windVisible ? 'Hide animated wind field' : 'Show animated wind field'} onClick={() => setWindVisible((value) => !value)}><Wind size={15} /><span>Wind</span></button><button className="icon-button" title="Search map" aria-label="Search map" onClick={() => document.querySelector<HTMLSelectElement>('.location-control select')?.focus()}><Search size={16} /></button><button className="icon-button" title="Map layers" aria-label="Map layers" onClick={() => setActive('Live Map')}><Layers3 size={16} /></button></div></div>
          <MapCanvas lat={location.lat} lon={location.lon} windDirection={weather?.windDirectionFrom} observations={firms.observations} windNodes={windField.nodes} windTime={weather?.time} windVisible={windVisible} terrainEnabled={terrainEnabled} onSelectPoint={setLocation} onSelectObservation={setActiveDetection} />
          <div className="map-legend"><span className="legend-wind"><i /> {windVisible ? `Animated wind field · ${windField.nodes.length || '—'} points` : 'Wind field hidden'}</span><span className="legend-boundary"><i /> Selected location</span><span className="legend-fire"><i className={firms.state === 'ready' && firms.observations.length ? 'fire-loaded' : ''} /> {firms.state === 'ready' ? `${firms.observations.length} detections returned · ${firms.source}` : 'NASA FIRMS not loaded'}</span></div>
        </div>

        <aside className="inspector">{moduleBody}</aside>

        <div className="bottom-strip"><div className="timeline-title"><Activity size={16} /><div><b>Weather timeline</b><small>Hourly forecast · wind, rain, temperature</small></div></div><div className="timeline-track forecast-track" aria-label="Hourly forecast selector">{visibleHours.map((hour, index) => { const absoluteIndex = forecastStartIndex + index; return <button key={hour.time} className={`forecast-tick ${absoluteIndex === safeIndex ? 'selected' : ''}`} style={{ height: `${Math.max(12, Math.min(34, 10 + hour.windSpeed * 0.28))}px` }} onClick={() => setSelectedIndex(absoluteIndex)} title={`${new Date(hour.time).toISOString().slice(0, 16).replace('T', ' ')} UTC · wind ${Math.round(hour.windSpeed)} km/h · rain ${hour.precipitation.toFixed(1)} mm`} aria-label={`Select ${hour.time} UTC, wind ${Math.round(hour.windSpeed)} kilometers per hour`} /> })}{!hours.length && <span className="timeline-empty">Hourly forecast unavailable</span>}</div><div className="timeline-select"><label htmlFor="forecast-time">{weather ? new Date(weather.time).toISOString().slice(11, 16) + ' UTC' : '—'}</label><input id="forecast-time" type="range" min={forecastStartIndex} max={Math.max(forecastStartIndex, forecastStartIndex + hourCount - 1)} value={Math.min(Math.max(safeIndex, forecastStartIndex), Math.max(forecastStartIndex, forecastStartIndex + hourCount - 1))} onChange={(event) => setSelectedIndex(Number(event.target.value))} disabled={!hours.length} aria-label="Select forecast hour" /></div></div>
      </section>
      <footer className="app-footer"><span>Weather: Open-Meteo · basemap: OpenStreetMap · 3D terrain: AWS Terrain Tiles · FIRMS: not connected</span><span>Wind field is an hourly forecast visualization, not a fire-spread prediction</span></footer>
    </main>
  </div>
}
