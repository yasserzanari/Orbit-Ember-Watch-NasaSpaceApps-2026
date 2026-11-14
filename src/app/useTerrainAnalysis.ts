import { useEffect, useState } from 'react'

const zoom = 12
const tileSize = 256
const earthRadiusMeters = 6_378_137
const transectLengthMeters = 80_000
const transectSamples = 25
const neighborSpacingPixels = 2

export type TerrainProfilePoint = { distanceKm: number; elevationM: number }
export type TerrainEndpoints = [[number, number], [number, number]]
export type TerrainAnalysis = {
  state: 'idle' | 'loading' | 'ready' | 'error'
  elevationM: number | null
  slopeDegrees: number | null
  aspectDegrees: number | null
  profile: TerrainProfilePoint[]
  sampleSpacingM: number | null
  minElevationM: number | null
  maxElevationM: number | null
  error?: string
}

const initial: TerrainAnalysis = {
  state: 'idle', elevationM: null, slopeDegrees: null, aspectDegrees: null,
  profile: [], sampleSpacingM: null, minElevationM: null, maxElevationM: null,
}

type TilePixels = { width: number; height: number; data: Uint8ClampedArray }
const tileCache = new Map<string, Promise<TilePixels>>()

function tilePixel(latitude: number, longitude: number) {
  const n = 2 ** zoom
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude))
  const x = ((longitude + 180) / 360) * n
  const radians = clampedLatitude * Math.PI / 180
  const y = ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * n
  const tileXUnwrapped = Math.floor(x)
  const tileX = ((tileXUnwrapped % n) + n) % n
  const tileY = Math.max(0, Math.min(n - 1, Math.floor(y)))
  return {
    key: `${zoom}/${tileX}/${tileY}`,
    x: Math.floor((x - tileXUnwrapped) * tileSize),
    y: Math.floor((y - Math.floor(y)) * tileSize),
  }
}

function loadTile(key: string): Promise<TilePixels> {
  const cached = tileCache.get(key)
  if (cached) return cached
  const request = (async () => {
    const response = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`)
    if (!response.ok) throw new Error(`Terrain tile request returned HTTP ${response.status}.`)
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) { bitmap.close(); throw new Error('Terrain tile could not be decoded by this browser.') }
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data }
  })()
  tileCache.set(key, request)
  request.catch(() => { if (tileCache.get(key) === request) tileCache.delete(key) })
  if (tileCache.size > 48) tileCache.delete(tileCache.keys().next().value as string)
  return request
}

function decodeElevation(rgb: Uint8ClampedArray, offset: number) {
  return (rgb[offset] * 256 + rgb[offset + 1] + rgb[offset + 2] / 256) - 32_768
}

async function sampleElevations(points: Array<{ latitude: number; longitude: number }>) {
  const locations = points.map((point) => ({ ...tilePixel(point.latitude, point.longitude) }))
  await Promise.all([...new Set(locations.map((item) => item.key))].map(loadTile))
  return Promise.all(locations.map(async (location) => {
    const tile = await loadTile(location.key)
    const x = Math.max(0, Math.min(tile.width - 1, location.x))
    const y = Math.max(0, Math.min(tile.height - 1, location.y))
    return decodeElevation(tile.data, (y * tile.width + x) * 4)
  }))
}

function offsetPoint(latitude: number, longitude: number, eastMeters: number, northMeters: number) {
  const latRadians = latitude * Math.PI / 180
  return {
    latitude: latitude + northMeters / earthRadiusMeters * 180 / Math.PI,
    longitude: longitude + eastMeters / (earthRadiusMeters * Math.max(0.05, Math.cos(latRadians))) * 180 / Math.PI,
  }
}

function classifyTerrain(latitude: number, grid: number[], profileValues: number[], profileLengthMeters: number): TerrainAnalysis {
  const pixelSizeM = earthRadiusMeters * Math.cos(latitude * Math.PI / 180) * 2 * Math.PI / (tileSize * (2 ** zoom))
  const spacingM = pixelSizeM * neighborSpacingPixels
  const [nw,n,ne,w,center,e,sw,s,se] = grid
  const dzEast = ((ne + 2 * e + se) - (nw + 2 * w + sw)) / (8 * spacingM)
  const dzSouth = ((sw + 2 * s + se) - (nw + 2 * n + ne)) / (8 * spacingM)
  const slopeDegrees = Math.atan(Math.hypot(dzEast, dzSouth)) * 180 / Math.PI
  const aspectDegrees = slopeDegrees < 2 ? null : (Math.atan2(-dzEast, dzSouth) * 180 / Math.PI + 360) % 360
  const profile = profileValues.map((elevationM, index) => ({
    distanceKm: index * (profileLengthMeters / (transectSamples - 1)) / 1_000,
    elevationM,
  }))
  return {
    state: 'ready', elevationM: center, slopeDegrees, aspectDegrees, profile,
    sampleSpacingM: spacingM,
    minElevationM: Math.min(...profileValues), maxElevationM: Math.max(...profileValues),
  }
}

function sampleGreatCircle(start: [number, number], end: [number, number], count: number) {
  const radians = Math.PI / 180
  const degrees = 180 / Math.PI
  const [startLongitude, startLatitude] = start
  const [endLongitude, endLatitude] = end
  const phi1 = startLatitude * radians
  const lambda1 = startLongitude * radians
  const phi2 = endLatitude * radians
  const lambda2 = endLongitude * radians
  const deltaPhi = phi2 - phi1
  const deltaLambda = lambda2 - lambda1
  const haversine = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2
  const angularDistance = 2 * Math.asin(Math.min(1, Math.sqrt(haversine)))
  const denominator = Math.sin(angularDistance)
  const points = Array.from({ length: count }, (_, index) => {
    const fraction = index / Math.max(1, count - 1)
    if (angularDistance < 1e-9) return { latitude: startLatitude, longitude: startLongitude }
    const a = Math.sin((1 - fraction) * angularDistance) / denominator
    const b = Math.sin(fraction * angularDistance) / denominator
    const x = a * Math.cos(phi1) * Math.cos(lambda1) + b * Math.cos(phi2) * Math.cos(lambda2)
    const y = a * Math.cos(phi1) * Math.sin(lambda1) + b * Math.cos(phi2) * Math.sin(lambda2)
    const z = a * Math.sin(phi1) + b * Math.sin(phi2)
    return { latitude: Math.atan2(z, Math.hypot(x, y)) * degrees, longitude: Math.atan2(y, x) * degrees }
  })
  return { points, lengthMeters: earthRadiusMeters * angularDistance }
}

async function loadAnalysis(latitude: number, longitude: number, endpoints: TerrainEndpoints): Promise<TerrainAnalysis> {
  const sampleDistanceM = earthRadiusMeters * Math.cos(latitude * Math.PI / 180) * 2 * Math.PI / (tileSize * (2 ** zoom)) * neighborSpacingPixels
  const neighborhood = [
    [-1,-1], [0,-1], [1,-1], [-1,0], [0,0], [1,0], [-1,1], [0,1], [1,1],
  ].map(([column,row]) => offsetPoint(latitude, longitude, column * sampleDistanceM, -row * sampleDistanceM))
  const profile = sampleGreatCircle(endpoints[0], endpoints[1], transectSamples)
  if (profile.lengthMeters > 600_000) throw new Error('The A–B terrain profile is limited to 600 km. Choose two points closer together.')
  const [neighborhoodElevations, profileElevations] = await Promise.all([
    sampleElevations(neighborhood), sampleElevations(profile.points),
  ])
  return classifyTerrain(latitude, neighborhoodElevations, profileElevations, profile.lengthMeters)
}

export function terrainTransectCoordinates(latitude: number, longitude: number): TerrainEndpoints {
  const west = offsetPoint(latitude, longitude, -transectLengthMeters / 2, 0)
  const east = offsetPoint(latitude, longitude, transectLengthMeters / 2, 0)
  return [[west.longitude, west.latitude], [east.longitude, east.latitude]]
}

export function terrainAspectLabel(degrees: number | null) {
  if (degrees === null) return 'Flat'
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees / 45) % 8]
}

export function useTerrainAnalysis(latitude: number, longitude: number, enabled: boolean, retryKey = 0, endpoints?: TerrainEndpoints): TerrainAnalysis {
  const [analysis, setAnalysis] = useState<TerrainAnalysis>(initial)
  useEffect(() => {
    if (!enabled) { setAnalysis(initial); return }
    let cancelled = false
    setAnalysis({ ...initial, state: 'loading' })
    loadAnalysis(latitude, longitude, endpoints ?? terrainTransectCoordinates(latitude, longitude))
      .then((result) => { if (!cancelled) setAnalysis(result) })
      .catch((error: unknown) => {
        if (cancelled) return
        setAnalysis({ ...initial, state: 'error', error: error instanceof Error ? error.message : 'Could not load terrain elevation tiles.' })
      })
    return () => { cancelled = true }
  }, [latitude, longitude, enabled, retryKey, endpoints])
  return analysis
}
