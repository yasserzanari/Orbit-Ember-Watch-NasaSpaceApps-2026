import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { summarizeCommonGrid, type CommonGridDetection } from '../app/commonGrid'
import './common-grid.css'

type Props = {
  modis: CommonGridDetection[]
  viirs: CommonGridDetection[]
  modisProduct: string
  viirsProduct: string
  modisAccess: string | null
  viirsAccess: string | null
  queryRange: { start: string; end: string } | null
  center: { latitude: number; longitude: number }
  state: 'idle' | 'loading' | 'ready' | 'error' | 'mismatch'
}

export function CommonGridPreview({ modis, viirs, modisProduct, viirsProduct, modisAccess, viirsAccess, queryRange, center, state }: Props) {
  const [exportError, setExportError] = useState<string | null>(null)
  const summary = useMemo(() => summarizeCommonGrid(modis, viirs, center), [modis, viirs, center.latitude, center.longitude])
  const ready = state === 'ready'
  const exportCsv = () => {
    try {
      const header = [
        'method', 'projection_earth_radius_m', 'resolution_m', 'grid_center_latitude', 'grid_center_longitude', 'query_start_utc', 'query_end_utc', 'shared_detection_days', 'modis_product', 'viirs_product',
        'modis_access_mode', 'viirs_access_mode', 'utc_day',
        'cell_east_index', 'cell_north_index', 'modis_returned_detections', 'viirs_returned_detections',
        'modis_satellites', 'viirs_satellites',
      ]
      const rows = summary.rows.map((row) => [
        summary.method, summary.earthRadiusM, summary.resolutionM, summary.centerLatitude, summary.centerLongitude, queryRange?.start ?? '', queryRange?.end ?? '', summary.sharedDetectionDays, modisProduct, viirsProduct,
        modisAccess ?? '', viirsAccess ?? '', row.utcDay,
        row.cellEastIndex, row.cellNorthIndex, row.modisDetections, row.viirsDetections,
        row.modisSatellites, row.viirsSatellites,
      ])
      const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
      const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `orbit-ember-watch-common-grid-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setExportError(null)
    } catch {
      setExportError('The common-grid CSV could not be created in this browser.')
    }
  }

  return <section className="common-grid-preview" aria-label="Exploratory common-grid comparison">
    <header className="common-grid-heading">
      <div>
        <span className="common-grid-eyebrow">EXPLORATORY · NOT CALIBRATED</span>
        <h3>Common 1 km grid · daily returned detections</h3>
        <p>{modisProduct} ({modisAccess ?? 'access unknown'}) ↔ {viirsProduct} ({viirsAccess ?? 'access unknown'}) · spherical local Lambert azimuthal equal-area grid centered on the selected location.</p>
      </div>
      <button type="button" onClick={exportCsv} disabled={!ready || summary.rows.length === 0}>
        <Download size={13} /> Export grid CSV
      </button>
    </header>
    {state === 'mismatch' ? <p className="common-grid-state">The products were loaded for different UTC windows. Select the same window before comparing them.</p>
      : state === 'loading' ? <p className="common-grid-state">Waiting for both sensor products to load for the same area and UTC window.</p>
      : state === 'error' ? <p className="common-grid-state">The common-grid preview is unavailable until both product requests succeed.</p>
        : !summary.sharedDetectionDays ? <p className="common-grid-state">No UTC date has returned a row from both products in this window. No common-grid overlap is calculated; this does not establish zero fire activity or observation coverage.</p>
          : !summary.unionObservedCellDays ? <p className="common-grid-state">No mapped cell-days are available for the shared detection dates. This does not establish zero fire activity or observation coverage.</p>
          : <>
            <div className="common-grid-metrics">
              <div><span>MODIS occupied cell-days</span><b>{summary.modisObservedCellDays.toLocaleString()}</b><small>{summary.modisEligibleDetections.toLocaleString()} mapped rows · {modisProduct}</small></div>
              <div><span>VIIRS occupied cell-days</span><b>{summary.viirsObservedCellDays.toLocaleString()}</b><small>{summary.viirsEligibleDetections.toLocaleString()} mapped rows · {viirsProduct}</small></div>
              <div><span>Observed overlap / union</span><b>{summary.overlappingObservedCellDays.toLocaleString()} / {summary.unionObservedCellDays.toLocaleString()}</b><small>{summary.descriptiveOverlapPercent === null ? '—' : `${summary.descriptiveOverlapPercent.toFixed(1)}% descriptive overlap · ${summary.sharedDetectionDays} shared-row days`}</small></div>
            </div>
            <p className="common-grid-caveat">This compares presence in the same 1 km candidate cell on UTC dates when both products returned at least one row. It does not measure shared overpasses, valid observation coverage, sensor agreement, or unique fires. Other dates and cells remain unknown.</p>
          </>}
    {exportError && <p className="common-grid-error" role="status">{exportError}</p>}
  </section>
}
