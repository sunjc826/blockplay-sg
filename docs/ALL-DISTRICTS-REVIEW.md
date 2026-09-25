# September 2026 district correction pass

All nineteen maps received concrete visual corrections in six parallel work groups.
These remain compressed, authored game districts, not surveyed reconstructions.
The changes improve recognisable landmarks and remove specific false details;
they do not establish street-by-street fidelity. This pass should not be presented
as equivalent in reference depth to the original three districts.

| District | Main corrections | Sector or spatial changes |
| --- | --- | --- |
| Marina Bay | Esplanade folded shades and glazed lower drums | Esplanade cover recalculated |
| Raffles Place | Market roof trim alignment and ventilated ridge | Existing reachable footprints retained |
| Queenstown | Station entrances, screens and hanging greenery | Existing footprints retained |
| Orchard | ION scalloped frontage, TANGS green eaves and tower, red-granite Ngee Ann plaza | ION–Wisma–Ngee Ann on one side; TANGS opposite; Emerald Hill east; median removed; sectors and stamps moved |
| Chinatown | Broader temple massing, pale Pagoda arcades, brick paving and parapets | Temple/complex positions corrected; market and temple sector bounds/anchors updated |
| Kampong Glam | Mosque domes/entrance and closer Bussorah shop rows; palace wall | Fictional canal removed; sector cover recalculated; helicopter moved to clear ground |
| Jurong Lake | Octagonal Cloud Pagoda, iron Lone Tree, garden paths | Jurong East naming replaces misleading Lakeside cluster; sector labels corrected |
| Tuas | Workshop shutters, facade fins, station concourse and green louvers | Sector labels describe accessible ground |
| Bukit Timah | Reviewed restored station, green Rail Corridor, retained heritage tracks | Continuous railway removed; station/corridor sector and minimap corrected |
| Upper Thomson | Shop roofs/awnings and Plaza facade | Fictional roadside TreeTop bridge removed; distant Springleaf label removed |
| Bishan | Ground-level MRT, park pavilion and visible naturalised river | Elevated viaduct removed; station sector moved, cover recalculated |
| Toa Payoh | Open modernist lookout, shaded park path, visible pond | Misleading flyover/park labels corrected |
| Punggol | Stepped Waterway Point/Watertown massing and reviewed precinct details | Outdoor forecourt relabelled instead of atrium |
| Woodlands | Positive causeway geometry, shoreline checkpoint and concrete jetty | Checkpoint moved to shore, jetty east; anchors, encounter spawn, stamp and minimap aligned |
| Tampines | Community-hub volume, central court, facade screens and entrance details | Hub forecourt tightened; hidden quarry water revealed |
| HarbourFront | Low white curved VivoCity frontage, balcony rails and pergola | Misleading frontage labels corrected |
| Sentosa | Palawan suspension bridge/lookouts, Fort Siloso Skywalk and gun parapets | Bridge collision gap and reachable anchor; minimap crossing; visible lagoon water |
| Changi | Jewel triangular roof slopes/glazing, fluted tower and spherical radome | Existing footprints retained |
| Geylang | Pitched clay roofs, varied shop facades, air conditioners and outward signs | Existing lane sectors retained |

## Evidence and limits

- [Original three refinement](evidence/2026-09-25-core-district-refinement.md)
- [Orchard, Chinatown and Kampong Glam](evidence/central-district-review.md)
- [West](WEST-DISTRICT-REVIEW.md)
- [North-central](NORTH-CENTRAL-REVIEW.md)
- [North-east](NORTH-EAST-REVIEW.md)
- [Coast and east](district-reviews/coast-east.md)

Every captured image retains its original date, attribution and checksum. Reviews
live beside images in `reconstruction/<district>/references/`. Acceptance is
limited to the visible feature: a park-path image does not verify an unseen tower,
and a housing lane does not verify a bridge. Rejected indoor and wrong-target
images remain in the cache with reasons. Source approval for further capture is
separate from accepting a limited detail in one image.

The original three reused cached references, with no new Google calls. Orchard
recovered its 36 existing images. The first new batch captured 30 previews across
15 districts. Eight missed targets received one bounded replacement each after
source selection was corrected to require both Google and outdoor collections.
No full-heading expansions or Static API image requests were made. Request history
and exhausted Static image allowances were preserved.

Changing game code or one district's geometry does not recapture other districts.
Only changed canonical plans select capture work; unchanged image fingerprints
reuse cached files. See [capture workflow](REFERENCE-CAPTURE.md).

## Validation

Collision, car-width reachability, road clearance, stamps, vehicle spawns, encounter
positions and measured sector cover are checked against actual scene geometry.
Sector identifiers and loot economics are preserved. Learning guides remain
separate from newly reference-informed geometry.

The offline review tool renders actual registry geometry at overview and street
cameras: `node scripts/review-districts.mjs`. It writes PNGs, a gallery and a report
to `.cache/district-review`, blocks Google requests, and checks JavaScript errors.
Overview fog is disabled only for inspection, and its near plane is adjusted to
avoid depth artifacts at aerial distance. Street views retain scene fog.

Final checks passed: **812 unit tests**, TypeScript check and production build.
The final render report covers **38 views of all19 districts**, with zero
JavaScript errors and zero Google requests. Across the38 new previews and36
recovered Orchard images, **48 are accepted for stated scopes and26 rejected**.
The production build retains its existing large-chunk size advisory.

Desktop interaction smoke passed for Woodlands and Orchard (walking, driving,
reset, orbit, trajectory independence, recenter and mode switching). Bishan's
camera-settling assertion failed; the cause is unresolved. Chrome subsequently
timed out during mobile/map checks, so that phase is incomplete. This is not a
claim that the full browser interaction suite passes. The all-district render
report is saved in [evidence](evidence/2026-09-25-district-render-report.json);
screenshots can be regenerated locally with the committed offline review tool.
