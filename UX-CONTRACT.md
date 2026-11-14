# Orbit Ember Watch — UX contract

## Product behavior

The application communicates satellite thermal detections, weather observations/forecasts, environmental context, and model-derived scenarios as distinct evidence types. A detection is not an incident confirmation; a blank detection file is not a no-fire observation; a forecast scenario is not an operational instruction.

## Navigation and shared state

- Canonical shell: shared header, persistent left navigation, shared map canvas, docked inspector, optional timeline.
- Routes: Dashboard, Live Map, Calendar, Compare, Terrain, Data & Sources, Scenario, Mobile Situation.
- AOI, date window, selected platforms, processing branch and selected time bin are app-level state; route changes preserve them. Shareable selections are serializable in URL parameters.
- Moving to another route adds a browser-history entry. Filter changes replace the current entry so Back/Forward traverses workspace routes without adding one entry per slider or layer change. `popstate` restores the route and serialized filters from that entry.
- A selected observation or time bin stays linked across map, chart, calendar and inspector.
- Mobile navigation uses a dismissible drawer; detail panels become accessible bottom sheets.
- Data & Sources may query NASA FIRMS `data_availability` through the server proxy; show returned product date ranges with a retrieval timestamp, explain that dates do not prove coverage for an AOI, and preserve unknown/key-missing/error states.
- Data & Sources reads validated local FIRMS manifest/QA pairs from the server; expose product, observed date range, accepted/rejected/duplicate counts and source hash without serving the private raw or normalized archive files.

## Canonical controls

| Capability | Owner | Contract |
|---|---|---|
| Select/listbox | native HTML `<select>` for compact product and report categories; browser/OS owns popup | labels, native keyboard behavior, visible focus, app-owned form error text |
| FIRMS observation window | shared topbar end-date + day-range control (native date input + native select; currently rendered by `App`) | Store the selected UTC end date in URL state; request the selected 1–5 day inclusive interval ending on that date. With no explicit end date, request the latest interval. Use the server-returned query bounds as authoritative; never interpret an unrequested or failed date as a valid zero. |
| AOI drawing | shared map interaction | keyboard alternative through coordinate/search inputs; preview geometry before apply |
| Sensor selection | shared `SensorFilter` | each satellite separately selectable; unavailable period explains source range |
| Chart | archived Recharts Chart Kit adapter | source and unit labels; no fixture rendered in product data views |
| Map layers | shared `LayerControl` | source, date/resolution and visibility state exposed |
| Notification | shared inline status/live region | status-specific guidance, deduplicated; no raw service errors |
| Export | shared `ExportMenu` | format, scope and provenance described before download |

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native HTML `<select>` | `UX-CONTRACT.md` and native browser control | Native for compact product and field-note categories | Keyboard selection and mobile OS popup remain platform-owned |
| Date | Native date input | Shared UTC observation date contract in `UX-CONTRACT.md` | Native `input[type=date]` | Selected date remains a date-only UTC value in app state |
| Form | `FieldReports` owns submit validation and local persistence | `src/ui/FieldReports.tsx` | Field note form only | `noValidate`, inline errors, first-invalid focus, local-only draft status |

## Data states

Every source-bound view supports: loading, current result, no detections returned, unknown coverage, known valid observation without detection, unavailable product/date, stale cache, offline, request failure, partial data and malformed input. These states must never collapse to a zero count.

Data values carry source, product/model version, native units, valid time, retrieval time, quality status and geographic resolution where available. Conversion of wind direction follows the source convention and is centralized in a tested adapter.

## Scenario state model

`inputs_incomplete → ready_to_run → calculating → scenario_only | failed | stale_inputs | out_of_scope`.

- Scenario inputs are explicit and editable; run output records their snapshot and model version.
- User can view results without starting/accepting a scenario; browsing tabs is never blocked by missing inputs.
- A new run does not silently overwrite an old result. It creates a separately timestamped analysis.
- A stale/failed request preserves the prior result with a visible timestamp and offers retry.
- Only a validated model and in-domain data may show an evaluated potential spread envelope; otherwise show unavailable or unvalidated status.
- No point-of-attack, crew placement, tactical route, evacuation routing or autonomous dispatch recommendation is provided.

## Offline/mobile

- Offline mode is read-only for cached layers and scenario outputs. Every cached layer has a timestamp and an explicit stale state.
- Field reports are attributed, timestamped observations, held as local drafts until a sync service exists; never claim they are synced or verified prematurely.
- Field Situation stores drafts only in this browser, caps the collection at 100 notes, and exports JSON with coordinates omitted by default; sharing/sync remains an explicit external step.
- Location use requires explicit permission and can be hidden from exported reports.
- Mobile targets favor 44×44 CSS px, high contrast, one-handed access and reduced battery use.

## Failure and recovery

Network/API errors retain useful prior content where possible, distinguish stale from current, and provide a retry action. No infinite retry loops. Aborted or older requests cannot overwrite newer filters. Secrets remain server-side and never appear in URL, logs, UI or static assets.

## Verification expectations

Behavior checks cover cross-route state continuity, wind from/to direction conversion, UTC/local rendering, source freshness and request races, offline labels, scenario input snapshot/reproducibility, mobile drawer/sheet keyboard access, and no-scroll desktop shell. Visual checks compare each implemented view against its approved mockup at desktop and phone sizes.
