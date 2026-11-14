import { useCallback, useEffect, useState } from 'react'

export type WorkspaceLocation = { name: string; lat: number; lon: number }
export type WorkspaceView = 'Dashboard' | 'Live Map' | 'Calendar' | 'Compare' | 'Terrain' | 'Data & Sources' | 'Scenario' | 'Field Situation'
export type FirmsProduct = 'VIIRS_NOAA20_NRT' | 'VIIRS_NOAA21_NRT' | 'VIIRS_SNPP_NRT' | 'MODIS_NRT' | 'VIIRS_NOAA20_SP' | 'VIIRS_NOAA21_SP' | 'VIIRS_SNPP_SP' | 'MODIS_SP'
export type FirmsDayRange = 1 | 2 | 3 | 5

export const workspaceLocations: WorkspaceLocation[] = [
  { name: 'Calgary, Alberta', lat: 51.0447, lon: -114.0719 },
  { name: 'Edmonton, Alberta', lat: 53.5461, lon: -113.4938 },
  { name: 'Jasper, Alberta', lat: 52.8737, lon: -118.0814 },
  { name: 'Fort McMurray, Alberta', lat: 56.7268, lon: -111.3803 },
]

const views: WorkspaceView[] = ['Dashboard', 'Live Map', 'Calendar', 'Compare', 'Terrain', 'Data & Sources', 'Scenario', 'Field Situation']
const firmsProducts: FirmsProduct[] = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT', 'MODIS_NRT', 'VIIRS_NOAA20_SP', 'VIIRS_NOAA21_SP', 'VIIRS_SNPP_SP', 'MODIS_SP']
const firmsDayRanges: FirmsDayRange[] = [1, 2, 3, 5]

export type WorkspaceState = {
  view: WorkspaceView
  location: WorkspaceLocation
  selectedTime: string | null
  selectedDate: string | null
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

function readWorkspaceState(): WorkspaceState {
  const params = new URLSearchParams(window.location.search)
  const viewParam = params.get('view') as WorkspaceView | null
  const lat = validCoordinate(params.get('lat'), -90, 90)
  const lon = validCoordinate(params.get('lon'), -180, 180)
  const name = params.get('place')?.trim().slice(0, 80)
  const timestamp = params.get('time')
  const dateParam = params.get('date')
  const productParam = params.get('product') as FirmsProduct | null
  const compareAParam = params.get('compareA') as FirmsProduct | null
  const compareBParam = params.get('compareB') as FirmsProduct | null
  const daysParam = Number(params.get('days')) as FirmsDayRange
  const includesTimezone = timestamp ? /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) : false
  const date = timestamp ? new Date(includesTimezone ? timestamp : `${timestamp}Z`) : null
  const selectedTime = date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : null
  const parsedCalendarDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T00:00:00Z`) : null
  const selectedDate = parsedCalendarDate && Number.isFinite(parsedCalendarDate.getTime()) && parsedCalendarDate.toISOString().slice(0, 10) === dateParam ? dateParam : null
  const knownLocation = workspaceLocations.find((item) => item.name === name)
  const location = knownLocation ?? (lat !== null && lon !== null
    ? { name: name || `Map point · ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`, lat, lon }
    : workspaceLocations[0])

  return {
    view: viewParam && views.includes(viewParam) ? viewParam : 'Dashboard',
    location,
    selectedTime,
    selectedDate,
    firmsProduct: productParam && firmsProducts.includes(productParam) ? productParam : firmsProducts[0],
    compareProductA: compareAParam && firmsProducts.includes(compareAParam) && compareAParam.startsWith('MODIS') ? compareAParam : 'MODIS_NRT',
    compareProductB: compareBParam && firmsProducts.includes(compareBParam) && compareBParam.startsWith('VIIRS') ? compareBParam : 'VIIRS_NOAA20_NRT',
    firmsDays: firmsDayRanges.includes(daysParam) ? daysParam : 1,
    windVisible: params.get('wind') !== '0',
    terrainEnabled: params.get('terrain') !== '0',
  }
}

function writeWorkspaceState(state: WorkspaceState) {
  const url = new URL(window.location.href)
  url.searchParams.set('view', state.view)
  url.searchParams.set('lat', state.location.lat.toFixed(4))
  url.searchParams.set('lon', state.location.lon.toFixed(4))
  url.searchParams.set('place', state.location.name)
  if (state.selectedTime) url.searchParams.set('time', state.selectedTime)
  else url.searchParams.delete('time')
  if (state.selectedDate) url.searchParams.set('date', state.selectedDate)
  else url.searchParams.delete('date')
  url.searchParams.set('product', state.firmsProduct)
  url.searchParams.set('compareA', state.compareProductA)
  url.searchParams.set('compareB', state.compareProductB)
  url.searchParams.set('days', String(state.firmsDays))
  url.searchParams.set('wind', state.windVisible ? '1' : '0')
  url.searchParams.set('terrain', state.terrainEnabled ? '1' : '0')
  window.history.replaceState(window.history.state, '', url)
}

export function useWorkspaceState() {
  const [state, setState] = useState<WorkspaceState>(readWorkspaceState)

  useEffect(() => {
    const restore = () => setState(readWorkspaceState())
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  useEffect(() => writeWorkspaceState(state), [state])

  const setView = useCallback((view: WorkspaceView) => setState((current) => ({ ...current, view })), [])
  const setLocation = useCallback((location: WorkspaceLocation) => setState((current) => ({ ...current, location, selectedTime: null, selectedDate: null })), [])
  const setSelectedTime = useCallback((selectedTime: string | null) => setState((current) => ({ ...current, selectedTime })), [])
  const setSelectedDate = useCallback((selectedDate: string | null) => setState((current) => ({ ...current, selectedDate })), [])
  const setFirmsProduct = useCallback((firmsProduct: FirmsProduct) => setState((current) => ({ ...current, firmsProduct })), [])
  const setCompareProductA = useCallback((compareProductA: FirmsProduct) => setState((current) => ({ ...current, compareProductA })), [])
  const setCompareProductB = useCallback((compareProductB: FirmsProduct) => setState((current) => ({ ...current, compareProductB })), [])
  const setFirmsDays = useCallback((firmsDays: FirmsDayRange) => setState((current) => ({ ...current, firmsDays })), [])
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
    setView, setLocation, setSelectedTime, setSelectedDate, setFirmsProduct, setCompareProductA, setCompareProductB, setFirmsDays, setWindVisible, setTerrainEnabled,
  }
}
