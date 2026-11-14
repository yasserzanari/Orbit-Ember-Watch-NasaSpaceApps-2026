# NASA Space Apps — submission draft

## Project title

**Orbit Ember Watch — A Coverage-Aware Fire Activity Calendar**

## High-level summary

Orbit Ember Watch helps regional fire analysts explore satellite fire detections without confusing a missing observation with a quiet day. It maps NASA FIRMS MODIS and VIIRS detections, keeps sensor products and native attributes separate, and marks dates outside available data as unknown. A distinct historical CWFIS panel adds regional context with source, sensor, and satellite provenance retained on each returned record. Weather and wind are shown as context, not as a fire-spread prediction.

## What is useful about it

Fire calendars can suggest a false change when sensor products with different spatial resolutions, revisit patterns, and detection characteristics are combined. Orbit Ember Watch makes the data boundary visible: which product was queried, which dates the feed could cover, which detections were returned, and which dates remain unknown. The analyst can compare the instruments before deciding whether any harmonized series is defensible.

The prototype does **not** claim validated historical harmonization, a calibrated agreement score, incident confirmation from a hotspot, or a seasonal anomaly result. The historical NASA standard archive and an independent fire-perimeter evaluation are still outstanding. CWFIS Fire M3 is displayed only as mixed-source regional context, and its panel requires the team to confirm that the CWFIS End-User Agreement covers this use.

## 90-second demonstration

1. **Start with the decision problem (10 s).** “A blank day can mean no returned detections, or that the satellite feed did not cover the date. The calendar keeps those states apart.”
2. **Show live observations (20 s).** Load the Canada public NRT feed for Edmonton. Select one detection and show its time, product, and native attributes. Say explicitly that a hotspot is not a confirmed incident.
3. **Compare instruments (20 s).** Open Compare and show MODIS and VIIRS as separate series. Explain that different pixel sizes and revisit opportunities can change raw counts.
4. **Show historical provenance (25 s).** In Calendar, confirm the CWFIS terms precondition and load the Alberta west May 4–20, 2023 context. Show source-specific sensor series and the source breakdown. Explain that it is regional and composite, not a FIRMS archive or Pembina perimeter match.
5. **Close with the value and boundary (15 s).** “Orbit Ember Watch gives analysts a transparent path from detections to comparison. It avoids a confident-looking zero or calibration when coverage and validation are missing.”

## Short pitch

**Orbit Ember Watch turns satellite fire detections into a transparent activity calendar. It keeps MODIS and VIIRS comparable without hiding missing coverage, source differences, or the limits of what a hotspot can prove.**

## Submission checklist

- Confirm all registered team members and selected challenge appear on the official team page.
- Add the project summary, working demo link, source citations, and requested materials.
- If sharing a video or deck, test public access in a private browser window and follow the local event’s format and language requirements.
- Rehearse the demo without relying on an unverified calibration or a stable live detection count.
- Verify any local judging form and deadline with the local event. The global site lists project submission through November 15 at 11:59 PM local time for the 2026 event.
- Before presenting CWFIS data publicly, confirm the team has reviewed and accepted the required End-User Agreement; retain the full CWFIS attribution shown in the app.

## Primary references

- [2026 NASA Space Apps Challenge](https://www.spaceappschallenge.org/2026/)
- [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/)
- [NASA FIRMS Archive Download](https://firms.modaps.eosdis.nasa.gov/download/)
- [CWFIS Fire M3 metadata and attribution](https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/archive/fireM3_hotspots_metadata_NAP_ISO_19115_2003.pdf)
