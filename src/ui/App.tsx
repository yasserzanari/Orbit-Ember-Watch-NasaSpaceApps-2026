import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
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

function MapCanvas({ lat, lon, windDirection, onSelectPoint }: { lat: number; lon: number; windDirection?: number; onSelectPoint: (point: MapPoint) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const selectPoint = useRef(onSelectPoint)
  useEffect(() => { selectPoint.current = onSelectPoint }, [onSelectPoint])

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
        },
        layers: [{ id: 'osm-raster-base', type: 'raster', source: 'osmRaster', minzoom: 0, maxzoom: 19 }],
      },
      center: [lon, lat],
      zoom: 6.2,
      pitch: 38,
      bearing: -12,
      attributionControl: false,
    })
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.current.getCanvas().style.cursor = 'crosshair'
    map.current.on('click', (event) => {
      const { lat: pointLat, lng: pointLon } = event.lngLat
      const latLabel = `${Math.abs(pointLat).toFixed(3)}° ${pointLat >= 0 ? 'N' : 'S'}`
      const lonLabel = `${Math.abs(pointLon).toFixed(3)}° ${pointLon >= 0 ? 'E' : 'W'}`
      selectPoint.current({ name: `Map point · ${latLabel} ${lonLabel}`, lat: pointLat, lon: pointLon })
    })
    return () => { map.current?.remove(); map.current = null }
  }, [lat, lon])

  useEffect(() => {
    if (!map.current) return
    map.current.easeTo({ center: [lon, lat], duration: 900 })
  }, [lat, lon])

  const direction = windDirection === undefined ? undefined : toWindDirection(windDirection)
  return <div className="map-frame">
    <div ref={element} className="map-canvas" aria-label="Map centered on the selected Alberta area" />
    <div className="map-coordinates"><Compass size={13} /> {lat.toFixed(3)}° N · {Math.abs(lon).toFixed(3)}° W</div>
    {direction !== undefined && <div className="map-wind" style={{ transform: `rotate(${direction}deg)` }} aria-label={`Wind blows toward ${windDirectionLabel(direction)}`}><Wind size={24} /></div>}
    <div className="map-caption">Basemap: OpenStreetMap · Weather: Open-Meteo</div>
  </div>
}

export function App() {
  const [active, setActive] = useState('Dashboard')
  const [location, setLocation] = useState(locations[0])
  const [navOpen, setNavOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [windOverride, setWindOverride] = useState<number | null>(null)
  const [horizon, setHorizon] = useState(6)
  const [elevation, setElevation] = useState<{ value: number; state: 'loading' | 'ready' | 'error' }>({ value: 0, state: 'loading' })
  const { hours, retrievedAt, state, retry } = useWeather(location.lat, location.lon)
  useEffect(() => { setSelectedIndex(null); setWindOverride(null); setElevation({ value: 0, state: 'loading' }) }, [location])
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
      <div className="source-note"><Clock3 size={14} /><span>Valid {new Date(weather.time).toLocaleString('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC · Retrieved {retrievedAt ? new Date(retrievedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '—'} UTC · Open-Meteo</span></div>
    </>}
    <div className="section-divider" />
    <div className="panel-heading detection-heading"><div><h2>Satellite detections</h2><p>Thermal anomaly observations</p></div><span className="status-tag">Not connected</span></div>
    <div className="empty-detections"><Satellite size={21} /><strong>FIRMS feed is not configured</strong><p>Fire points will appear here after the NASA FIRMS source is connected. Weather data above is live.</p><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">About NASA FIRMS <ChevronRight size={13} /></a></div>
    <div className="important-note"><Flame size={15} /><span>Satellite thermal detections are not confirmed fires. A period without detections does not prove there was no fire.</span></div>
  </>

  const noFirms = <div className="module-empty"><Satellite size={23} /><b>NASA FIRMS observations are not connected</b><p>This workspace has no FIRMS API credential or published observation file. The map will not display example hotspots as real detections.</p><a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer">FIRMS API requirements <ChevronRight size={13} /></a></div>
  const moduleBody = active === 'Dashboard' ? weatherPanel : active === 'Live Map' ? <>
    <div className="panel-heading"><div><h2>Map layers & observations</h2><p>Map view · {location.name}</p></div><span className="status-tag">2D map</span></div>
    <div className="module-section"><div className="module-label">VISIBLE CONTEXT</div><div className="layer-row"><span><Wind size={15} /> Wind at selected point</span><b className="layer-on">LIVE</b></div><div className="layer-row"><span><CloudRain size={15} /> Hourly precipitation</span><b className="layer-on">LIVE</b></div><div className="layer-row muted-row"><span><Flame size={15} /> MODIS / VIIRS hotspots</span><b>UNAVAILABLE</b></div><p className="module-hint">Weather is a single forecast grid-point. No area-wide wind field or interpolated raster is drawn.</p></div>{noFirms}
  </> : active === 'Calendar' ? <>
    <div className="panel-heading"><div><h2>Observation calendar</h2><p>Satellite activity by date</p></div><CalendarDays size={18} /></div>
    {noFirms}<div className="module-section"><div className="module-label">AVAILABLE IN THIS VIEW</div><p className="module-hint">The bottom timeline is the actual hourly weather forecast. It is not a satellite activity calendar and does not substitute for FIRMS observations.</p><div className="source-note"><Clock3 size={14} /><span>Forecast window: {hours.length ? `${new Date(hours[0].time).toISOString().slice(0, 10)} — ${new Date(hours.at(-1)!.time).toISOString().slice(0, 10)} UTC` : 'not loaded'}</span></div></div>
  </> : active === 'Compare' ? <>
    <div className="panel-heading"><div><h2>Sensor comparison</h2><p>MODIS and VIIRS stay separate</p></div><Layers3 size={18} /></div>
    <div className="compare-sensors"><div><b>MODIS</b><span>Terra · Aqua</span><small>FIRMS data unavailable</small></div><div><b>VIIRS</b><span>NOAA-20 · NOAA-21</span><small>FIRMS data unavailable</small></div></div>
    <div className="module-empty compact-empty"><AlertTriangle size={19} /><b>Comparison not evaluated</b><p>No observations are loaded for a shared area or time window. Counts, agreement scores, and calibration are withheld.</p></div>
    <div className="module-section"><div className="module-label">COMPARISON REQUIREMENTS</div><p className="module-hint">A validated comparison needs overlapping coverage, product-aware quality filters, a shared spatial support, and a held-out evaluation.</p></div>
  </> : active === 'Terrain' ? <>
    <div className="panel-heading"><div><h2>Terrain context</h2><p>Selected forecast grid point</p></div><Mountain size={18} /></div>
    <div className="terrain-elevation"><span>Elevation above sea level</span><b>{elevation.state === 'ready' ? `${Math.round(elevation.value)} m` : elevation.state === 'loading' ? 'Loading…' : 'Unavailable'}</b><small>Open-Meteo Elevation API · point estimate</small></div>
    <div className="module-section"><div className="module-label">LAYERS</div><div className="layer-row"><span><Mountain size={15} /> Elevation at selected point</span><b className="layer-on">{elevation.state === 'ready' ? 'LIVE' : elevation.state.toUpperCase()}</b></div><div className="layer-row muted-row"><span><Layers3 size={15} /> Land cover / fuel class</span><b>NOT LOADED</b></div><div className="layer-row muted-row"><span><Activity size={15} /> Slope / aspect raster</span><b>NOT LOADED</b></div><p className="module-hint">A single elevation sample is not a terrain model and cannot provide slope, aspect, or an FBP fuel class.</p></div>
  </> : active === 'Data & Sources' ? <>
    <div className="panel-heading"><div><h2>Data & provenance</h2><p>Sources currently used in this view</p></div><Database size={18} /></div>
    <div className="source-card"><div><Wind size={16} /><b>Open-Meteo Forecast</b><span className="source-live">CONNECTED</span></div><p>Hourly wind, gust, precipitation, temperature and relative humidity at 10 m / 2 m.</p><small>Coordinate query · UTC · 7-day forecast + 1 day past</small><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">API documentation <ChevronRight size={12} /></a></div>
    <div className="source-card"><div><Mountain size={16} /><b>Open-Meteo Elevation</b><span className={elevation.state === 'ready' ? 'source-live' : 'source-missing'}>{elevation.state === 'ready' ? 'CONNECTED' : elevation.state.toUpperCase()}</span></div><p>{elevation.state === 'ready' ? `Point elevation: ${Math.round(elevation.value)} m.` : 'Point elevation lookup for selected coordinates.'}</p><small>One coordinate sample · metres above sea level</small></div>
    <div className="source-card source-disconnected"><div><Satellite size={16} /><b>NASA FIRMS</b><span className="source-missing">NOT CONNECTED</span></div><p>MODIS / VIIRS area feeds require a NASA MAP_KEY. No key is stored in this frontend.</p><small>Server-side proxy and source manifest still required</small><a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer">FIRMS API documentation <ChevronRight size={12} /></a></div>
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
          <div className="map-toolbar"><div className="map-title"><span className="eyebrow-icon"><Map size={15} /></span><div><strong>{location.name}</strong><small>{active === 'Scenario' ? 'Hypothetical inputs · no spread perimeter available' : 'Click the map to inspect weather at a point · satellite detections are not connected'}</small></div></div><div className="map-actions"><button className="icon-button" title="Search map" aria-label="Search map" onClick={() => document.querySelector<HTMLSelectElement>('.location-control select')?.focus()}><Search size={16} /></button><button className="icon-button" title="Map layers" aria-label="Map layers" onClick={() => setActive('Live Map')}><Layers3 size={16} /></button></div></div>
          <MapCanvas lat={location.lat} lon={location.lon} windDirection={weather?.windDirectionFrom} onSelectPoint={setLocation} />
          <div className="map-legend"><span className="legend-wind"><i /> Wind vector</span><span className="legend-boundary"><i /> Selected location</span><span className="legend-fire"><i /> Fire detections: not connected</span></div>
        </div>

        <aside className="inspector">{moduleBody}</aside>

        <div className="bottom-strip"><div className="timeline-title"><Activity size={16} /><div><b>Weather timeline</b><small>Hourly forecast · wind, rain, temperature</small></div></div><div className="timeline-track forecast-track" aria-label="Hourly forecast selector">{visibleHours.map((hour, index) => { const absoluteIndex = forecastStartIndex + index; return <button key={hour.time} className={`forecast-tick ${absoluteIndex === safeIndex ? 'selected' : ''}`} style={{ height: `${Math.max(12, Math.min(34, 10 + hour.windSpeed * 0.28))}px` }} onClick={() => setSelectedIndex(absoluteIndex)} title={`${new Date(hour.time).toISOString().slice(0, 16).replace('T', ' ')} UTC · wind ${Math.round(hour.windSpeed)} km/h · rain ${hour.precipitation.toFixed(1)} mm`} aria-label={`Select ${hour.time} UTC, wind ${Math.round(hour.windSpeed)} kilometers per hour`} /> })}{!hours.length && <span className="timeline-empty">Hourly forecast unavailable</span>}</div><div className="timeline-select"><label htmlFor="forecast-time">{weather ? new Date(weather.time).toISOString().slice(11, 16) + ' UTC' : '—'}</label><input id="forecast-time" type="range" min={forecastStartIndex} max={Math.max(forecastStartIndex, forecastStartIndex + hourCount - 1)} value={Math.min(Math.max(safeIndex, forecastStartIndex), Math.max(forecastStartIndex, forecastStartIndex + hourCount - 1))} onChange={(event) => setSelectedIndex(Number(event.target.value))} disabled={!hours.length} aria-label="Select forecast hour" /></div></div>
      </section>
      <footer className="app-footer"><span>Weather & elevation: Open-Meteo · basemap: OpenStreetMap · FIRMS: not connected</span><span>Wind arrows show direction the wind blows toward · forecast is not a fire-spread prediction</span></footer>
    </main>
  </div>
}
