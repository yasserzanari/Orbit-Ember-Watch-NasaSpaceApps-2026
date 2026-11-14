import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, ClipboardList, Clock3, Download, MapPin, Save, Trash2, Wind } from 'lucide-react'
import type { WorkspaceLocation } from '../app/useWorkspaceState'

type ReportKind = 'Fire or smoke observed' | 'Wind shift' | 'Access obstruction' | 'Visible damage' | 'Other field note'
type FieldReport = {
  id: string
  kind: ReportKind
  note: string
  author: string
  observedAtUtc: string
  location: WorkspaceLocation
  weather: { windSpeedKmh: number; windDirectionTo: string; validAtUtc: string } | null
}

const storageKey = 'orbit-ember-watch:field-report-drafts:v1'
const reportKinds: ReportKind[] = ['Fire or smoke observed', 'Wind shift', 'Access obstruction', 'Visible damage', 'Other field note']

function readDrafts(): FieldReport[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is FieldReport => Boolean(item && typeof item === 'object'
      && typeof item.id === 'string' && typeof item.kind === 'string' && reportKinds.includes(item.kind)
      && typeof item.note === 'string' && typeof item.author === 'string'
      && typeof item.observedAtUtc === 'string' && item.location && Number.isFinite(item.location.lat) && Number.isFinite(item.location.lon)))
  } catch {
    return []
  }
}

export function FieldReports({
  location,
  wind,
}: {
  location: WorkspaceLocation
  wind: { speedKmh: number; directionTo: string; validAtUtc: string } | null
}) {
  const [reports, setReports] = useState<FieldReport[]>(readDrafts)
  const [kind, setKind] = useState<ReportKind>(reportKinds[0])
  const [author, setAuthor] = useState('')
  const [note, setNote] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [storageState, setStorageState] = useState<'checking' | 'saved' | 'unavailable'>('checking')
  const [includeCoordinates, setIncludeCoordinates] = useState(false)
  const authorInput = useRef<HTMLInputElement>(null)
  const noteInput = useRef<HTMLTextAreaElement>(null)
  const authorMissing = submitAttempted && !author.trim()
  const noteMissing = submitAttempted && !note.trim()

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(reports))
      setStorageState('saved')
    } catch {
      setStorageState('unavailable')
    }
  }, [reports])

  function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitAttempted(true)
    if (!author.trim()) { authorInput.current?.focus(); return }
    if (!note.trim()) { noteInput.current?.focus(); return }
    const report: FieldReport = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      kind,
      note: note.trim(),
      author: author.trim(),
      observedAtUtc: new Date().toISOString(),
      location: { ...location },
      weather: wind ? { windSpeedKmh: wind.speedKmh, windDirectionTo: wind.directionTo, validAtUtc: wind.validAtUtc } : null,
    }
    setReports((current) => current.length >= 100 ? current : [report, ...current])
    setNote('')
    setSubmitAttempted(false)
  }

  function exportReports() {
    const exportedReports = reports.map((report) => includeCoordinates ? report : {
      ...report,
      location: { name: 'Location withheld from export', lat: null, lon: null },
    })
    const payload = { schemaVersion: 1, status: 'local-drafts-not-synced', coordinatesIncluded: includeCoordinates, exportedAtUtc: new Date().toISOString(), reports: exportedReports }
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `orbit-ember-field-notes-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <>
    <div className="panel-heading"><div><h2>Field situation</h2><p>Observations for incident command · no tasking</p></div><ClipboardList size={18} /></div>
    <div className="field-report-status" role="status"><span className="field-report-status-icon"><AlertTriangle size={15} /></span><div><b>{storageState === 'saved' ? 'LOCAL DRAFTS · NOT SYNCED' : storageState === 'checking' ? 'CHECKING LOCAL STORAGE' : 'LOCAL STORAGE UNAVAILABLE'}</b><small>{storageState === 'saved' ? 'Names, notes, and coordinates stay on this device until you export them.' : storageState === 'checking' ? 'Checking whether this browser can retain notes on this device.' : 'Drafts may disappear when this page closes. Export notes as soon as possible.'}</small></div></div>

    <div className="field-map-status"><MapPin size={18} /><div><b>{location.name}</b><span>{Math.abs(location.lat).toFixed(4)}° {location.lat >= 0 ? 'N' : 'S'} · {Math.abs(location.lon).toFixed(4)}° {location.lon >= 0 ? 'E' : 'W'}</span></div></div>

    <div className="field-condition-grid">
      <div><Wind size={14} /><span>Forecast wind</span><b>{wind ? `${Math.round(wind.speedKmh)} km/h · ${wind.directionTo}` : 'Unavailable'}</b><small>{wind ? `${wind.validAtUtc.slice(11, 16)} UTC · Open-Meteo` : 'No current forecast value'}</small></div>
      <div><Clock3 size={14} /><span>Observation time</span><b>Captured when saved</b><small>UTC · device clock</small></div>
    </div>

    <form className="field-report-form" noValidate onSubmit={saveReport}>
      <div className="field-report-form-heading"><div><b>New field note</b><small>Attribute what you observed; do not enter operational orders.</small></div><span>{reports.length} / 100 SAVED</span></div>
      <label className="field-label" htmlFor="field-author">Name or call sign</label>
      <input ref={authorInput} id="field-author" className="module-select field-text-input" maxLength={60} autoComplete="name" required aria-invalid={authorMissing} aria-describedby={authorMissing ? 'field-author-error' : undefined} value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Required for attribution" />
      {authorMissing && <small className="field-validation-error" id="field-author-error">Enter a name or call sign so the note is attributed.</small>}
      <label className="field-label" htmlFor="field-kind">Observation type</label>
      <select id="field-kind" className="module-select" value={kind} onChange={(event) => setKind(event.target.value as ReportKind)}>{reportKinds.map((item) => <option key={item}>{item}</option>)}</select>
      <label className="field-label" htmlFor="field-note">What did you observe?</label>
      <textarea ref={noteInput} id="field-note" className="field-note-input resize-none" maxLength={500} rows={4} required aria-invalid={noteMissing} aria-describedby={noteMissing ? 'field-note-error' : undefined} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the observation, location context, and time if known." />
      {noteMissing && <small className="field-validation-error" id="field-note-error">Add a short factual description before saving.</small>}
      <div className="field-note-footer"><small>{reports.length >= 100 ? 'Export or delete a note before saving another.' : `${note.length}/500 · location is selected on the map`}</small><button className="primary-action" type="submit" disabled={reports.length >= 100}><Save size={14} /> Save local note</button></div>
    </form>

    <div className="field-reports-list-heading"><b>Recent notes on this device</b><div><label className="field-export-location"><input type="checkbox" checked={includeCoordinates} onChange={(event) => setIncludeCoordinates(event.target.checked)} /> Include coordinates</label><button type="button" onClick={exportReports} disabled={!reports.length}><Download size={13} /> Export JSON</button></div></div>
    {reports.length ? <div className="field-reports-list">{reports.map((report) => <article className="field-report-item" key={report.id}><div><span>{report.kind}</span><button type="button" aria-label={`Delete note from ${report.author}`} onClick={() => setReports((current) => current.filter((item) => item.id !== report.id))}><Trash2 size={13} /></button></div><p>{report.note}</p><small>{report.author} · {new Date(report.observedAtUtc).toISOString().slice(0, 16).replace('T', ' ')} UTC</small><small>{report.location.name} · {report.location.lat.toFixed(4)}, {report.location.lon.toFixed(4)}</small>{report.weather && <small>Forecast context when saved: {Math.round(report.weather.windSpeedKmh)} km/h toward {report.weather.windDirectionTo} · valid {report.weather.validAtUtc.slice(0, 16).replace('T', ' ')} UTC</small>}<em>Unverified · local only</em></article>)}</div> : <div className="field-report-empty"><ClipboardList size={17} /><span>No field notes saved on this device.</span></div>}
    <div className="important-note field-warning"><AlertTriangle size={15} /><span>Weather is forecast context, not a fire-spread estimate. Notes are unverified and unsynced. Follow incident command for operational decisions.</span></div>
  </>
}
