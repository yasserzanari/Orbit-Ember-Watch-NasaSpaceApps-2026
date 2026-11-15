import { useCallback, useEffect, useRef, useState } from 'react'

export type WorkspaceLocation = { name: string; lat: number; lon: number }
export type WorkspaceView = 'Dashboard' | 'Live Map' | 'Calendar' | 'Compare' | 'Terrain' | 'Data & Sources' | 'Scenario' | 'Field Situation'
export type FirmsProduct = 'VIIRS_NOAA20_NRT' | 'VIIRS_NOAA21_NRT' | 'VIIRS_SNPP_NRT' | 'MODIS_NRT' | 'VIIRS_NOAA20_SP' | 'VIIRS_NOAA21_SP' | 'VIIRS_SNPP_SP' | 'MODIS_SP'
export type FirmsDayRange = 1 | 2 | 3 | 5
export type WorkspaceObservationSelection = {
  restoredFromLink: boolean
  id: string
  latitude: number
  longitude: number
  source: FirmsProduct
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

export const workspaceLocations: WorkspaceLocation[] = [
  { name: 'Calgary, Alberta', lat: 51.0447, lon: -114.0719 },
  { name: 'Edmonton, Alberta', lat: 53.5461, lon: -113.4938 },
  { name: 'Jasper, Alberta', lat: 52.8737, lon: -118.0814 },
  { name: 'Fort McMurray, Alberta', lat: 56.7268, lon: -111.3803 },
]
const defaultWorkspaceLocation = workspaceLocations.find((location) => location.name === 'Edmonton, Alberta') ?? workspaceLocations[0]

const views: WorkspaceView[] = ['Dashboard', 'Live Map', 'Calendar', 'Compare', 'Terrain', 'Data & Sources', 'Scenario', 'Field Situation']
const firmsProducts: FirmsProduct[] = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT', 'MODIS_NRT', 'VIIRS_NOAA20_SP', 'VIIRS_NOAA21_SP', 'VIIRS_SNPP_SP', 'MODIS_SP']
const firmsDayRanges: FirmsDayRange[] = [1, 2, 3, 5]

export type WorkspaceState = {
  view: WorkspaceView
  location: WorkspaceLocation
  selectedTime: string | null
  queryEndDate: string | null
  calendarDate: string | null
  selectedObservation: WorkspaceObservationSelection | null
  firmsProduct: FirmsProduct
  compareProductA: FirmsProduct
  compareProductB: FirmsProduct
  firmsDays: FirmsDayRange
  windVisible: boolean
  terrainEnabled: boolean
}

function validCoordinate(value: string | null, min: number, max: number) {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function validUtcDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

function validNullableText(value: unknown, maxLength = 80): string | null {
  return typeof value === 'string' && value.length <= maxLength ? value : null
}

function parseObservation(value: string | null): WorkspaceObservationSelection | null {
  if (!value || value.length > 1400) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const source = parsed.source
    const latitude = parsed.latitude
    const longitude = parsed.longitude
    if (typeof parsed.id !== 'string' || parsed.id.length < 1 || parsed.id.length > 180
      || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || typeof source !== 'string' || !firmsProducts.includes(source as FirmsProduct)) return null
    const acquiredAtUtc = validNullableText(parsed.acquiredAtUtc, 40)
    if (acquiredAtUtc && !Number.isFinite(Date.parse(acquiredAtUtc))) return null
    const frpMw = parsed.frpMw === null ? null : typeof parsed.frpMw === 'number' && Number.isFinite(parsed.frpMw) && parsed.frpMw >= 0 ? parsed.frpMw : null
    return {
      restoredFromLink: true,
      id: parsed.id, latitude, longitude, source: source as FirmsProduct,
      satellite: validNullableText(parsed.satellite), instrument: validNullableText(parsed.instrument), acquiredAtUtc,
      confidenceNative: validNullableText(parsed.confidenceNative), frpMw,
      brightness4: typeof parsed.brightness4 === 'number' && Number.isFinite(parsed.brightness4) ? parsed.brightness4 : null,
      brightness5: typeof parsed.brightness5 === 'number' && Number.isFinite(parsed.brightness5) ? parsed.brightness5 : null,
      scanKm: typeof parsed.scanKm === 'number' && Number.isFinite(parsed.scanKm) && parsed.scanKm >= 0 ? parsed.scanKm : null,
      trackKm: typeof parsed.trackKm === 'number' && Number.isFinite(parsed.trackKm) && parsed.trackKm >= 0 ? parsed.trackKm : null,
      dayNight: validNullableText(parsed.dayNight, 8), productVersion: validNullableText(parsed.productVersion, 40),
    }
  } catch {
    return null
  }
}

function readWorkspaceState(): WorkspaceState {
  const params = new URLSearchParams(window.location.search)
  const viewParam = params.get('view') as WorkspaceView | null
  const lat = validCoordinate(params.get('lat'), -90, 90)
  const lon = validCoordinate(params.get('lon'), -180, 180)
  const name = params.get('place')?.trim().slice(0, 80)
  const timestamp = params.get('time')
  const dateParam = validUtcDay(params.get('date'))
  const calendarDateParam = validUtcDay(params.get('day'))
  const productParam = params.get('product') as FirmsProduct | null
  const compareAParam = params.get('compareA') as FirmsProduct | null
  const compareBParam = params.get('compareB') as FirmsProduct | null
  const daysParam = Number(params.get('days')) as FirmsDayRange
  const includesTimezone = timestamp ? /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) : false
  const date = timestamp ? new Date(includesTimezone ? timestamp : `${timestamp}Z`) : null
  const selectedTime = date && Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16)}Z` : null
  const knownLocation = workspaceLocations.find((item) => item.name === name)
  const location = knownLocation ?? (lat !== null && lon !== null
    ? { name: name || `Map point · ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`, lat, lon }
    : defaultWorkspaceLocation)

  return {
    view: viewParam && views.includes(viewParam) ? viewParam : 'Dashboard',
    location,
    selectedTime,
    queryEndDate: dateParam,
    calendarDate: calendarDateParam ?? dateParam,
    selectedObservation: parseObservation(params.get('obs')),
    firmsProduct: productParam && firmsProducts.includes(productParam) ? productParam : firmsProducts[0],
    compareProductA: compareAParam && firmsProducts.includes(compareAParam) && compareAParam.startsWith('MODIS') ? compareAParam : 'MODIS_NRT',
    compareProductB: compareBParam && firmsProducts.includes(compareBParam) && compareBParam.startsWith('VIIRS') ? compareBParam : 'VIIRS_NOAA20_NRT',
    firmsDays: firmsDayRanges.includes(daysParam) ? daysParam : 5,
    windVisible: params.get('wind') !== '0',
    // Start with the stable 2D basemap; shared links can explicitly request 3D with terrain=1.
    terrainEnabled: params.get('terrain') === '1',
  }
}

function writeWorkspaceState(state: WorkspaceState, mode: 'push' | 'replace') {
  const url = new URL(window.location.href)
  url.searchParams.set('view', state.view)
  url.searchParams.set('lat', state.location.lat.toFixed(4))
  url.searchParams.set('lon', state.location.lon.toFixed(4))
  url.searchParams.set('place', state.location.name)
  if (state.selectedTime) url.searchParams.set('time', state.selectedTime)
  else url.searchParams.delete('time')
  if (state.queryEndDate) url.searchParams.set('date', state.queryEndDate)
  else url.searchParams.delete('date')
  if (state.calendarDate) url.searchParams.set('day', state.calendarDate)
  else url.searchParams.delete('day')
  if (state.selectedObservation) {
    const { restoredFromLink: _restoredFromLink, ...shareableObservation } = state.selectedObservation
    url.searchParams.set('obs', JSON.stringify(shareableObservation))
  } else url.searchParams.delete('obs')
  url.searchParams.set('product', state.firmsProduct)
  url.searchParams.set('compareA', state.compareProductA)
  url.searchParams.set('compareB', state.compareProductB)
  url.searchParams.set('days', String(state.firmsDays))
  url.searchParams.set('wind', state.windVisible ? '1' : '0')
  url.searchParams.set('terrain', state.terrainEnabled ? '1' : '0')
  const existing = window.history.state
  const historyState = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {}
  const nextHistoryState = { ...historyState, orbitEmberWatch: true }
  if (mode === 'push') window.history.pushState(nextHistoryState, '', url)
  else window.history.replaceState(nextHistoryState, '', url)
}

export function useWorkspaceState() {
  const [state, setState] = useState<WorkspaceState>(readWorkspaceState)
  const previousView = useRef(state.view)
  const restoringHistory = useRef(false)

  useEffect(() => {
    const restore = () => {
      restoringHistory.current = true
      setState(readWorkspaceState())
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  useEffect(() => {
    const mode = restoringHistory.current ? 'replace' : previousView.current !== state.view ? 'push' : 'replace'
    writeWorkspaceState(state, mode)
    previousView.current = state.view
    restoringHistory.current = false
  }, [state])

  const setView = useCallback((view: WorkspaceView) => setState((current) => ({ ...current, view })), [])
  const setLocation = useCallback((location: WorkspaceLocation) => setState((current) => ({ ...current, location, selectedTime: null, queryEndDate: null, calendarDate: null, selectedObservation: null })), [])
  const setSelectedTime = useCallback((selectedTime: string | null) => setState((current) => ({ ...current, selectedTime })), [])
  const setQueryEndDate = useCallback((queryEndDate: string | null) => setState((current) => ({ ...current, queryEndDate, calendarDate: queryEndDate ?? current.calendarDate, selectedObservation: null })), [])
  const setCalendarDate = useCallback((calendarDate: string | null) => setState((current) => ({ ...current, calendarDate, selectedObservation: current.selectedObservation?.acquiredAtUtc?.slice(0, 10) === calendarDate ? current.selectedObservation : null })), [])
  const setSelectedObservation = useCallback((selectedObservation: WorkspaceObservationSelection | null) => setState((current) => ({ ...current, selectedObservation })), [])
  const setFirmsProduct = useCallback((firmsProduct: FirmsProduct) => setState((current) => ({ ...current, firmsProduct, selectedObservation: null })), [])
  const setCompareProductA = useCallback((compareProductA: FirmsProduct) => setState((current) => ({ ...current, compareProductA, selectedObservation: null })), [])
  const setCompareProductB = useCallback((compareProductB: FirmsProduct) => setState((current) => ({ ...current, compareProductB, selectedObservation: null })), [])
  const setFirmsDays = useCallback((firmsDays: FirmsDayRange) => setState((current) => ({ ...current, firmsDays, selectedObservation: null })), [])
  const setWindVisible = useCallback((windVisible: boolean | ((current: boolean) => boolean)) => setState((current) => ({
    ...current,
    windVisible: typeof windVisible === 'function' ? windVisible(current.windVisible) : windVisible,
  })), [])
  const setTerrainEnabled = useCallback((terrainEnabled: boolean | ((current: boolean) => boolean)) => setState((current) => ({
    ...current,
    terrainEnabled: typeof terrainEnabled === 'function' ? terrainEnabled(current.terrainEnabled) : terrainEnabled,
  })), [])

  return {
    ...state,
    setView, setLocation, setSelectedTime, setQueryEndDate, setCalendarDate, setSelectedObservation, setFirmsProduct, setCompareProductA, setCompareProductB, setFirmsDays, setWindVisible, setTerrainEnabled,
  }
}
