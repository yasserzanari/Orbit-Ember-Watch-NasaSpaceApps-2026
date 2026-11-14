# NASA Space Apps — submission draft

## Project title

**Orbit Ember Watch — A Traceable Fire Activity Calendar**

## High-level summary

Orbit Ember Watch helps regional fire analysts explore satellite fire detections without confusing a missing observation with a quiet day. It maps NASA FIRMS MODIS and VIIRS detections, keeps sensor products and native attributes separate, and marks dates outside available data as unknown. A distinct historical CWFIS panel adds regional context with source, sensor, and satellite provenance retained on each returned record. Weather and wind are shown as context, not as a fire-spread prediction.

## What is useful about it

Fire calendars can suggest a false change when sensor products with different spatial resolutions, revisit patterns, and detection characteristics are combined. Orbit Ember Watch makes the data boundary visible: which product was queried, which dates the feed could cover, which detections were returned, and which dates remain unknown. The analyst can compare the instruments before deciding whether any harmonized series is defensible.

The prototype does **not** claim validated historical harmonization, a calibrated agreement score, incident confirmation from a hotspot, or a seasonal anomaly result. The historical NASA standard archive and an independent fire-perimeter evaluation are still outstanding. CWFIS Fire M3 is displayed only as mixed-source regional context. The team has reviewed and accepted the required CWFIS End-User Agreement for this project; the server-side access flag is enabled for the local demo.

For a reproducible regional context query near the Pembina Complex origin area (May 4–20, 2023; fetched November 14, 2026), the CWFIS service returned 15,457 hotspot rows across NASA, NASA_can, and USFS source labels. These are source-labelled detection rows, not 15,457 fires; overlapping feeds and unknown coverage prevent treating them as independent or complete activity counts. The demo exposes this provenance beside the daily series.

## 90-second demonstration

1. **Start with the decision problem (10 s).** “No row is not proof that no fire occurred. Dates outside the public feed window are marked unknown; dates inside it show returned detections, not a measure of satellite observation coverage.”
2. **Show live observations (20 s).** Load the Canada public NRT feed for Edmonton. Select one detection and show its time, product, and native attributes. Say explicitly that a hotspot is not a confirmed incident.
3. **Compare instruments (20 s).** Open Compare and show MODIS and VIIRS as separate series. Explain that different pixel sizes and revisit opportunities can change raw counts.
4. **Show historical provenance (25 s).** Load the Alberta west May 4–20, 2023 CWFIS context. Show source-specific sensor series and the source breakdown; explain that it is regional and composite, not a FIRMS archive or Pembina perimeter match. The team accepted the required CWFIS agreement and the local server has its access flag enabled. In the live Calendar, keep the 5-day window and set its end date to four UTC days before today; the leading date will be outside the 7-day public feed window and marked unknown.
5. **Close with the value and boundary (15 s).** “Orbit Ember Watch gives analysts a transparent path from detections to comparison. It keeps dates outside the source window unknown and does not present returned detections as incident counts.”

## Short pitch

**Orbit Ember Watch turns satellite fire detections into a transparent activity calendar. It puts MODIS and VIIRS side by side without implying that raw counts are directly equivalent, and makes dates outside the feed window visibly unknown.**

## Optional 30-second video voiceover

> A blank day in a fire calendar does not prove that no fire occurred. Orbit Ember Watch maps NASA FIRMS detections, shows MODIS and VIIRS side by side, and marks dates outside the available feed as unknown. Analysts can inspect each product and its limits before drawing conclusions. The raw counts are not treated as equivalent, and missing feed dates are not treated as observed inactivity.

If the local event requests a slide deck, use these seven beats: **challenge → analyst’s question → live map → MODIS/VIIRS comparison → unknown-coverage calendar → provenance and limits → next validation step**. Use real captures from the running build; do not reuse mockup numbers as measured results.

## Submission checklist

- Fill in the team name and members, public demo URL, repository URL, and any local event submission form; these details are not available in the workspace draft.
- Confirm all registered team members and selected challenge appear on the official team page.
- Add the project summary, working demo link, source citations, and requested materials.
- If sharing a video or deck, test public access in a private browser window and follow the local event’s format and language requirements.
- Rehearse the demo without relying on an unverified calibration or a stable live detection count.
- Verify any local judging form and deadline with the local event. The global site lists project submission through November 15 at 11:59 PM local time for the 2026 event.
- For any deployment other than the local demo, enable the CWFIS access flag only after the team has reviewed and accepted the applicable End-User Agreement; retain the full CWFIS attribution shown in the app.

## Primary references

- [2026 NASA Space Apps Challenge](https://www.spaceappschallenge.org/2026/)
- [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/)
- [NASA FIRMS Archive Download](https://firms.modaps.eosdis.nasa.gov/download/)
- [CWFIS Fire M3 metadata and attribution](https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/archive/fireM3_hotspots_metadata_NAP_ISO_19115_2003.pdf)
