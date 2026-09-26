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

The September 25 follow-up initially left Bishan camera settling and mobile/map
checks unresolved. These were investigated on September 26:

- Bishan started facing a lamp at `(-60, -78)`, about 2.4 m of car clearance
  ahead. Driving into it stopped the car; the camera correctly retained its
  stationary orbit. The starting heading now faces east along the clear park
  path in both exploration and expedition. A real-geometry regression verifies
  30 m of unobstructed forward driving from reset.
- Browser movement checks now wait for observed motion and camera settling,
  instead of long fixed accelerator holds. Scene switches wait for a rendered
  frame from the selected canvas, preventing stale scene checks.
- Bishan passed desktop walking/driving, stationary and moving orbit, reset,
  recenter and independent-trajectory checks, followed by mobile/map checks.
- All 19 districts passed a separate 390 px mobile-emulation run: selected-scene
  rendering, page width and touch controls. Map click/keyboard selection passed;
  no uncaught errors or Google requests were recorded. This is emulated coverage,
  not a physical-device performance certification.

The all-district render report remains in
[evidence](evidence/2026-09-25-district-render-report.json). Screenshots and
browser checks can be regenerated without Google requests:

```sh
# With Vite and Chrome CDP running as described in CLAUDE.md:
REGION_SMOKE_PACE=6 REGION_SMOKE_REGIONS=bishan pnpm test:browser
REGION_SMOKE_MODE=mobile pnpm test:browser
```

`REGION_SMOKE_MODE` accepts `all` (default), `desktop` or `mobile`.
`REGION_SMOKE_REGIONS` optionally limits a diagnostic run to comma-separated
registry IDs. Without either setting, the suite retains desktop and mobile
coverage of every registered district.

The September 26 follow-up also passed all 827 unit tests, typecheck and the production build.

## Playable elevation follow-up

The September 26 [verticality pass](VERTICALITY.md) adds actual walking support and
38 routes across all districts, with revised sector boundaries/anchors where
needed. This is a gameplay adaptation; the new access ramps are not additional
reference-fidelity claims. It requires no new Google captures.
