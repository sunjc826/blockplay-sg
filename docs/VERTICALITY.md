# Verticality diagnostics

The report supports design judgement; it does not grade a district. A flat promenade can be appropriate, and a high roof is not automatically useful gameplay.

Run `pnpm analyse:verticality -- --district bishan --sectors`, or omit `--district` for all districts. Add `--json` for machine-readable results. District IDs are validated strictly: a typo never silently selects another district. The selected district alone is built and sampled. This is an offline scene analysis; it makes no Google API calls.

## What it measures

The evaluator samples ground and explicitly authored walk surfaces on a 2 m horizontal lattice. It checks standing body clearance with the same vertical movement kernel as gameplay, then validates the connections between adjacent samples using that kernel's small movement steps. Only samples connected to the district spawn count. A decorative roof, inaccessible raised deck, or route blocked by a building cannot inflate reachable area simply by existing in the scene.

| Field | Meaning |
| --- | --- |
| Reachable area | Approximate horizontal area of all reachable sampled levels; stacked floors count separately. |
| Elevated area and fraction | Reachable area with feet at least 2 m above the current street datum, divided by reachable area. |
| Overlapping footprint | Horizontal area with reachable levels separated by at least 2 m. |
| Height distribution | Minimum, 5th percentile, median, 95th percentile, and maximum of reachable sample heights. |
| Distance to elevated space | Median and 90th percentile shortest sampled walking distance from samples below 2 m to reachable samples at or above 2 m. |
| Unreachable distance samples | Otherwise reachable low samples without a directed walking path to elevated space. These are excluded from finite distance percentiles and reported separately. |
| Reachable routes / slopes | Routes with reachable elevated samples; slopes with reachable samples spanning at least 2 m vertically in the summarized area. This counts sampled slope presence, not proven independent entrances. |

Sector summaries use the existing sector bounds and district-wide reachability, so access can pass through another sector. Existing overlapping sectors can both include the same samples; do not sum their areas into a district total.

The baseline disables authored walk surfaces while retaining the current collision scene. It answers “what do these authored walking surfaces enable?” It is **not** a historical measurement of the map before construction or an audit of every legacy decorative staircase.

## Interpretation and limits

These measurements are approximate, standing-player, walking-only diagnostics. They deliberately exclude jumps, free-fall shortcuts, vehicle travel, and flight. A 2 m lattice can miss narrow paths or entrances and can over- or underestimate area at edges. Distances use orthogonal graph paths, so diagonal travel is overestimated. Body clearance and route connectivity are checked against gameplay collision data, not inferred from every visible triangle. Missing or inaccurate authored collision remains a gameplay issue requiring review.

The current ground datum is flat y=0. Future terrain needs elevation relative to local ground before comparing hills with buildings. A low terrace below 2 m still appears in the height distribution but not the elevated-area count. Null height values mean no reachable samples; null distance values mean no finite sampled path. Low elevated-area fractions can coexist with useful local routes in a large district.

Use the report to find isolated decks, sectors with distant access, and concentrated elevation. Then inspect the actual routes: whether ramps are legible, exits are useful, sightlines are fair, and the construction suits the location. There is intentionally no aggregate score, ranking, automatic sector relabelling, or universal minimum elevation target.

## September 2026 district pass

All 19 districts received two authored routes, prioritising existing bridge and
connector conversions, housing galleries, industrial access walks and landscape
terraces. These are gameplay adaptations of the existing compressed maps, not
surveyed copies of real ramps. New routes are not marked as reference-confirmed.

The [recorded report](evidence/2026-09-26-verticality.json) finds spawn-connected
elevated samples on all 38 routes: approximately 7,596 m² across the game maps,
with maximum local route heights from 2.4 to 9.5 m. This is a sampled game-space
measurement, not an estimate of Singapore's real elevated pedestrian area.

Design reviews: [central and original districts](evidence/verticality-core.md),
[north](evidence/verticality-north.md), [west and coast](evidence/verticality-west.md),
and [east and heritage districts](evidence/verticality-east.md). Visual review
rejected several mechanically valid low bridges; solid terrace foundations were
added instead. Sector bounds now include the Bishan river crossings, Changi
viewing walk and Geylang car park gallery. Ground anchors and Punggol's collectible
and encounter point were moved clear of the new structures/water. Loot weights
and pricing remain unchanged.

Walking exploration and FPS infantry use the shared support/clearance kernel,
including slopes, deck landings, jumping, falling and elevated prone stance.
Arena actors preserve elevation, and their shots respect authored decks. Bots
have vertical collision support, but their existing steering does not plan
multilevel routes. Cars remain ground-based; switching an elevated exploration
walk to Drive returns to the district start. Ground interactions require a player
at ground level. The report does not establish combat balance or fun.

Reproduce geometry previews with `node scripts/review-verticality.mjs` while Vite
and Chrome CDP are running (same prerequisites as `review-districts.mjs`). The
38 route regression checks exercise both FPS and exploration radii in both
directions and raycast the actual rendered support faces.

Validation for this pass: 884 unit tests, typecheck and production build passed.
All 38 [route renders](evidence/2026-09-26-verticality-render.json) completed with
zero Google requests or runtime errors. Actual browser FPS ascent, authoritative
height, jump/landing and elevated prone passed; a separate exploration ascent
passed after correcting test-fixture imports. Final visual review also raised
shore-side foliage clear of the Thomson boardwalk. These checks do not certify
physical-phone performance or combat balance.
