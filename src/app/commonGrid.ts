export type CommonGridDetection = {
  latitude: number
  longitude: number
  acquiredAtUtc: string | null
  satellite: string | null
}

export type CommonGridRow = {
  utcDay: string
  cellEastIndex: number
  cellNorthIndex: number
  modisDetections: number
  viirsDetections: number
  modisSatellites: string
  viirsSatellites: string
}

export type CommonGridSummary = {
  method: 'local-laea-cell-day-v1'
  earthRadiusM: number
  resolutionM: number
  centerLatitude: number
  centerLongitude: number
  modisEligibleDetections: number
  viirsEligibleDetections: number
  modisObservedCellDays: number
  viirsObservedCellDays: number
  sharedDetectionDays: number
  overlappingObservedCellDays: number
  unionObservedCellDays: number
  descriptiveOverlapPercent: number | null
  rows: CommonGridRow[]
}

export type CommonGridFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, {
  modisDetections: number
  viirsDetections: number
  category: 'modis' | 'viirs' | 'both'
}>

const EARTH_RADIUS_M = 6_371_008.8
const DEFAULT_RESOLUTION_M = 1_000

/**
 * Aggregate two already-separated sensor products on the same candidate
 * equal-area grid and UTC day. This describes returned detections only; it
 * does not estimate observation coverage, sensor agreement, or fire identity.
 */
export function summarizeCommonGrid(
  modis: CommonGridDetection[],
  viirs: CommonGridDetection[],
  center: { latitude: number; longitude: number },
  resolutionM = DEFAULT_RESOLUTION_M,
): CommonGridSummary {
  if (!Number.isFinite(center.latitude) || center.latitude < -90 || center.latitude > 90
    || !Number.isFinite(center.longitude) || center.longitude < -180 || center.longitude > 180) {
    throw new Error('Common-grid center must use valid geographic coordinates.')
  }
  if (!Number.isFinite(resolutionM) || resolutionM <= 0 || resolutionM > 100_000) {
    throw new Error('Common-grid resolution must be between 0 and 100,000 metres.')
  }

  const modisAll = aggregateCellDays(modis, center, resolutionM)
  const viirsAll = aggregateCellDays(viirs, center, resolutionM)
  const viirsDays = new Set([...viirsAll.cells.keys()].map((key) => key.split('|', 1)[0]))
  const sharedDays = new Set([...modisAll.cells.keys()].map((key) => key.split('|', 1)[0]).filter((day) => viirsDays.has(day)))
  const modisCells = restrictToDays(modisAll.cells, sharedDays)
  const viirsCells = restrictToDays(viirsAll.cells, sharedDays)
  const unionKeys = new Set([...modisCells.cells.keys(), ...viirsCells.cells.keys()])
  let overlappingObservedCellDays = 0
  const rows = [...unionKeys].map((key) => {
    const modisCell = modisCells.cells.get(key)
    const viirsCell = viirsCells.cells.get(key)
    if (modisCell && viirsCell) overlappingObservedCellDays += 1
    const [utcDay, eastText, northText] = key.split('|')
    return {
      utcDay,
      cellEastIndex: Number(eastText),
      cellNorthIndex: Number(northText),
      modisDetections: modisCell?.count ?? 0,
      viirsDetections: viirsCell?.count ?? 0,
      modisSatellites: modisCell ? [...modisCell.satellites].sort().join('; ') : '',
      viirsSatellites: viirsCell ? [...viirsCell.satellites].sort().join('; ') : '',
    }
  }).sort((a, b) => a.utcDay.localeCompare(b.utcDay)
    || a.cellNorthIndex - b.cellNorthIndex
    || a.cellEastIndex - b.cellEastIndex)

  return {
    method: 'local-laea-cell-day-v1',
    earthRadiusM: EARTH_RADIUS_M,
    resolutionM,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    modisEligibleDetections: modisCells.eligibleDetections,
    viirsEligibleDetections: viirsCells.eligibleDetections,
    modisObservedCellDays: modisCells.size,
    viirsObservedCellDays: viirsCells.size,
    sharedDetectionDays: sharedDays.size,
    overlappingObservedCellDays,
    unionObservedCellDays: unionKeys.size,
    descriptiveOverlapPercent: unionKeys.size
      ? overlappingObservedCellDays / unionKeys.size * 100
      : null,
    rows,
  }
}

/** Build one polygon per 1 km cell with returned rows during shared UTC dates. */
export function commonGridGeoJson(summary: CommonGridSummary, maxCells = 4_000): CommonGridFeatureCollection {
  const cells = new Map<string, { east: number; north: number; modis: number; viirs: number }>()
  for (const row of summary.rows) {
    const key = `${row.cellEastIndex}|${row.cellNorthIndex}`
    const cell = cells.get(key) ?? { east: row.cellEastIndex, north: row.cellNorthIndex, modis: 0, viirs: 0 }
    cell.modis += row.modisDetections
    cell.viirs += row.viirsDetections
    cells.set(key, cell)
  }
  const selected = [...cells.values()].sort((a, b) => (b.modis + b.viirs) - (a.modis + a.viirs)).slice(0, maxCells)
  return {
    type: 'FeatureCollection',
    features: selected.map((cell) => {
      const west = cell.east * summary.resolutionM
      const south = cell.north * summary.resolutionM
      const east = west + summary.resolutionM
      const north = south + summary.resolutionM
      const ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
        .map(([x, y]) => inverseLambertAzimuthalEqualArea(x, y, summary.centerLatitude, summary.centerLongitude))
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          modisDetections: cell.modis,
          viirsDetections: cell.viirs,
          category: cell.modis && cell.viirs ? 'both' : cell.modis ? 'modis' : 'viirs',
        },
      }
    }),
  }
}

function restrictToDays(cells: Map<string, { count: number; satellites: Set<string> }>, days: Set<string>) {
  const eligibleCells = new Map([...cells].filter(([key]) => days.has(key.split('|', 1)[0])))
  const eligibleDetections = [...eligibleCells.values()].reduce((sum, cell) => sum + cell.count, 0)
  return { cells: eligibleCells, size: eligibleCells.size, eligibleDetections }
}

function aggregateCellDays(
  detections: CommonGridDetection[],
  center: { latitude: number; longitude: number },
  resolutionM: number,
) {
  const cells = new Map<string, { count: number; satellites: Set<string> }>()
  let eligibleDetections = 0
  for (const detection of detections) {
    const utcDay = toUtcDay(detection.acquiredAtUtc)
    if (!utcDay || !Number.isFinite(detection.latitude) || detection.latitude < -90 || detection.latitude > 90
      || !Number.isFinite(detection.longitude) || detection.longitude < -180 || detection.longitude > 180) continue
    const [eastM, northM] = projectLambertAzimuthalEqualArea(detection.latitude, detection.longitude, center.latitude, center.longitude)
    if (!Number.isFinite(eastM) || !Number.isFinite(northM)) continue
    const east = Math.floor(eastM / resolutionM)
    const north = Math.floor(northM / resolutionM)
    const key = `${utcDay}|${east}|${north}`
    const cell = cells.get(key) ?? { count: 0, satellites: new Set<string>() }
    cell.count += 1
    if (detection.satellite) cell.satellites.add(detection.satellite)
    cells.set(key, cell)
    eligibleDetections += 1
  }
  return { cells, size: cells.size, eligibleDetections }
}

function toUtcDay(value: string | null) {
  if (!value) return null
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  const timestamp = isDateOnly || hasTimezone ? value : `${value}Z`
  if (!Number.isFinite(Date.parse(timestamp))) return null
  return new Date(timestamp).toISOString().slice(0, 10)
}

function projectLambertAzimuthalEqualArea(latitude: number, longitude: number, centerLatitude: number, centerLongitude: number): [number, number] {
  const phi = latitude * Math.PI / 180
  const lambda = longitude * Math.PI / 180
  const phi0 = centerLatitude * Math.PI / 180
  const lambda0 = centerLongitude * Math.PI / 180
  const deltaLambda = Math.atan2(Math.sin(lambda - lambda0), Math.cos(lambda - lambda0))
  const denominator = 1 + Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(deltaLambda)
  if (denominator <= 1e-12) return [Number.NaN, Number.NaN]
  const scale = Math.sqrt(2 / denominator)
  const east = EARTH_RADIUS_M * scale * Math.cos(phi) * Math.sin(deltaLambda)
  const north = EARTH_RADIUS_M * scale * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(deltaLambda))
  return [east, north]
}

function inverseLambertAzimuthalEqualArea(east: number, north: number, centerLatitude: number, centerLongitude: number): [number, number] {
  const phi0 = centerLatitude * Math.PI / 180
  const lambda0 = centerLongitude * Math.PI / 180
  const rho = Math.hypot(east, north)
  if (rho < 1e-8) return [centerLongitude, centerLatitude]
  const c = 2 * Math.asin(Math.min(1, rho / (2 * EARTH_RADIUS_M)))
  const phi = Math.asin(Math.cos(c) * Math.sin(phi0) + (north * Math.sin(c) * Math.cos(phi0)) / rho)
  const lambda = lambda0 + Math.atan2(east * Math.sin(c), rho * Math.cos(phi0) * Math.cos(c) - north * Math.sin(phi0) * Math.sin(c))
  return [lambda * 180 / Math.PI, phi * 180 / Math.PI]
}
