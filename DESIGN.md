# Orbit Ember Watch — design system

## North Star

An operations-grade Earth observation console: the map is the work surface, while compact analysis docks explain what the user sees. The identity comes from terrain, satellite passes, wind vectors and fire behavior—not generic SaaS cards or NASA-branded imitation. NASA data sources are cited without implying NASA endorsement.

## Visual direction

- Product register: data-heavy geospatial tool for fire analysts, land managers and field personnel.
- Density: high but calm; full viewport on desktop, one clear priority per panel, details progressively disclosed.
- Signature: a dark terrain canvas with a restrained cyan wind/vector overlay and amber-to-red thermal activity. The map remains dominant; panels never obscure its essential boundary or scale.
- Sidebar: fixed square outer rail, dark translucent surface, fine border; active route uses a cyan edge and readable fill. Labels remain available on hover and keyboard focus.
- Avoid: decorative NASA marks, fake live status, giant KPI cards, generic green-dot badges, synthetic propagation extents presented as observations, tiny low-contrast data labels.
- Glass overlays: map docks use a dark ink glass surface at 76% opacity, a fine cool edge and 16 px blur so terrain remains perceptible behind them. Use this treatment for information anchored to the map; keep long-form inspectors and controls solid enough for reading and do not add blur to every shell surface.

## Palette tokens

| Token | Hex | Meaning |
|---|---|---|
| `ink-950` | `#07111A` | app background |
| `ink-900` | `#0B1722` | shell/sidebar surface |
| `ink-800` | `#122330` | panel surface |
| `line` | `#28404D` | divider and outline |
| `text` | `#E7F0F3` | primary text |
| `muted` | `#91A5AE` | secondary labels |
| `cyan` | `#25D2D8` | wind, selection, interactive focus |
| `amber` | `#F4B12F` | caution, scenario, moderate thermal signal |
| `ember` | `#F2683B` | high thermal intensity |
| `danger` | `#EF4C4C` | high-severity data indication only, never operational order |

## Runtime mapping

`DESIGN.md` is the approved visual intent. `src/styles/tokens.css` is the single runtime token implementation. Components consume semantic variables; never duplicate primitive values in feature CSS when a token exists.

| Semantic CSS variable | Source token | Consumer |
|---|---|---|
| `--app-bg` | `ink-950` | page canvas |
| `--shell-surface` | `ink-900` | top header and sidebar |
| `--panel-surface` | `ink-800` | docks, inspector, popovers |
| `--glass-surface` | `rgba(11, 23, 34, .76)` | map overlay panels |
| `--glass-surface-raised` | `rgba(18, 35, 48, .78)` | nested overlay cards |
| `--glass-border` | `rgba(148, 202, 212, .24)` | glass panel outlines |
| `--glass-highlight` | `rgba(231, 240, 243, .08)` | subtle glass edge sheen |
| `--glass-shadow` | `0 16px 36px rgba(0, 0, 0, .38)` | overlays above the map |
| `--glass-blur` | `16px` | map-overlay backdrop blur |
| `--border-subtle` | `line` | panel separators |
| `--text-primary` | `text` | headings and values |
| `--text-secondary` | `muted` | supporting information |
| `--accent-wind` | `cyan` | wind vectors and focus |
| `--accent-caution` | `amber` | warning/scenario controls |
| `--signal-high` | `ember` | high heatmap bucket |
| `--signal-critical` | `danger` | highest heatmap bucket |

## Type and numbers

- Interface: `IBM Plex Sans`, fallback `system-ui, sans-serif`.
- Measurements and timestamps: `IBM Plex Mono`, fallback `ui-monospace, monospace`.
- Headlines use medium weight and sentence case; no decorative overlines.
- Numbers align with tabular figures; units are visible at the value and exact UTC time is available in detail.

## Layout and responsive behavior

Desktop: header 56–64 px; left rail 68 px collapsed/220 px expanded; central map fills remaining width; left/right docks are retractable; timeline stays within viewport bottom. No document-level vertical scroll at 1440×900; panels may scroll internally when content exceeds height.

Tablet: sidebar is tap-expandable; map remains primary; one dock visible at a time.

Mobile: drawer navigation, 2D map default, bottom sheet for selection, tabs for Map / Updates / Layers / Report. Scenario controls become sequential sheets. Terrain 3D is optional and never required to access data.

## Motion and states

Motion is reserved for time playback, wind vectors, map transitions and selected-feature focus. Respect `prefers-reduced-motion`; pause playback when hidden. Loading, stale, offline, unknown coverage, unavailable product, empty results and validation states each have distinct copy and behavior.

## Accessibility

Target WCAG 2.2 AA. Keyboard-visible focus, 44 px preferred touch targets, semantic controls, non-color sensor encoding, reduced motion, readable panel contrast, and a table/text alternative for important map and chart values.
