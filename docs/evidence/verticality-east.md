# East and heritage districts: playable elevation, September 2026

This pass adds authored gameplay access in five compressed districts. It does not
claim newly verified Singapore layouts. No Google calls or new reference captures
were made, and existing `referenceFeatures` remain unchanged. The route notes in
each scene retain this distinction for the evaluator and future edits.

| District | Routes | Height | Design judgment |
| --- | --- | --- | --- |
| Chinatown | Complex side gallery; Club Street terrace walk | 3.2 m | Keep temple roofs and busy heritage lanes intact. Offer a side approach by the hawker hall and a hillside route beside the terraces. Narrow the decorative bank so it does not intersect the walking surface. |
| Kampong Glam | Haji rear service gallery; Beach Road retail terrace | 2.8 / 3.2 m | Use a rear lane and the existing modern retail block. Preserve the ground-level Bussorah mosque sightline and heritage lawn. These are authored galleries, not photographed landmark features. |
| Geylang | Lorong service gallery; car park side gallery | 2.8 / 3.6 m | Keep numbered streets and the tile-roof skyline; use the rear service lane and existing schematic car park for modest height changes. The service deck is offset from the stamp at `(0, -45)`. |
| Tampines | Hub arrival gallery; housing court deck | 3.2 m | Place usable pedestrian terraces at the community hub frontage and between housing slabs. Stay clear of bus berths, the cycle path, and existing low sheltered links. |
| Changi | Jewel viewing walk; terminal frontage gallery | 3.2 m | Replace the inaccessible inner scenic ring with an actual viewing route and two ramp approaches. Retain the outer ring as scenic geometry, outside playable-height accounting. The terminal gallery stays below the viaduct and clear of its piers. |

Each route has two ground entrances, rails, structural supports, a useful flat
section and slopes no steeper than 0.32. Walking widths range from 3.2 to 4 m.
The low street route remains a separate choice beneath the central raised decks;
ramps need headroom-aware collision and cannot be treated as pass-through props.
No accessible temple, mosque or control-tower roof is implied.

## Sector review

Retain sector IDs, loot economics and bot weights. Shared-sector integration changes:

- Geylang `guillemard`: extend `minZ` from -30 to -80 and describe the car park
  as well as the bend. This includes both gallery approaches and its deck.
- Changi `vortex`: extend `minZ` from -30 to -70 and include the viewing walk in
  its display name. The old box excluded the north side of the basin and the
  new viewing route. The existing basin anchors remain useful at ground level.
- Chinatown `chinatown-complex`: the added gallery changes measured cover from
  open to broken (median 12.0 m; p90 27.2 m), so its cover label must follow.
- Other routes fit existing relevant sectors. Several sectors intentionally
  remain predominantly flat; district identity does not require equal elevation
  scores or upper routes in every street.

## Focused validation

All ten routes were built through the real region registry and checked with the
shared `createVerticalMovement` kernel, using 0.38 m player radius, 1.8 m player
height and 4 m/s travel. Walking both directions reaches every authored waypoint
at its expected horizontal position and height. The Jewel route has 4 m flat
landings before its right-angle turns: a ramp entering the perpendicular deck
directly produced a genuine headroom collision, which this geometry fixes.

At 1 m intervals, route centerlines were also checked against original 2D scene
obstacles using radius `width / 2 + 0.3`, giving clearance for the walking width.
A separate body-volume screen against original scene mesh bounding boxes found
no intersections along these centerlines (0.4 m horizontal radius; from 0.5 to
1.8 m above the walking surface). That screen caught the original Geylang stamp
intersection before the service gallery was offset.

These checks establish geometry and traversal, not tactical balance or a visual
fidelity score. The body-volume screen is conservative bounding-box screening,
not exhaustive triangle collision or a replacement for browser playtesting.
Final whole-repository checks and browser review are recorded by the integration
pass. The remaining Changi outer ring and upper terminal road are still scenery;
this pass does not make every pre-existing elevated mesh playable.

## Final visual review

Reviewed all ten route renders, then re-reviewed six with corrected cameras after
the original overview angles hid their decks behind buildings or the Jewel roof.
The final images are generated locally under `.cache/verticality-review/`.

The Club Street, retail-frontage and car-park routes read clearly as low supported
pedestrian galleries. Geylang's back-lane deck remains below the heritage roofs
and leaves the stamp visible beside it. The Tampines housing deck fits between
the slabs and stops before the pre-existing sheltered link. Jewel's replacement
walk has visible rails and support beneath it, with the remaining scenic ring
above; the terminal gallery similarly stays separate from the elevated road.
No additional concrete mesh-intersection defect was apparent in these views.

These are deliberately simple galleries, with substantial repeated construction
detail. Their useful change is accessible upper/lower movement, not a claim of
architecturally faithful mezzanines. The closer Jewel, terminal and Haji views
crop the ends of their routes, so they support deck-clearance and material review;
full approach continuity is supported by the bidirectional movement checks above.
Combat balance, route desirability and resemblance to the real locations still
need human playtesting and deeper references.
