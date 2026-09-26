# Playable verticality: Marina Bay, Raffles Place, Queenstown and Orchard

September 2026. These are authored gameplay adaptations of the existing compressed
maps, not surveyed reconstructions. No Google requests or reference acceptance
changes were made. Existing reference-informed landmark silhouettes were retained;
new ramps and terraces are not added to `referenceFeatures`.

| District | Route | Height / width | Design judgment |
| --- | --- | --- | --- |
| Marina Bay | Civic waterfront terrace | 2 / 6 m | Replace the existing impassable stepped plinths with a two-ended terrace. Keep the ground promenade alongside it. |
| Marina Bay | Barrage lawn overlook | 3 / 8 m | A broad low landscape terrace provides an overlook within the existing lawn sector; it does not purport to reproduce the actual Barrage roof. |
| Raffles Place | Collyer elevated connector | 8.9 / 3.2 m | Make the existing elevated glazed connector traversable. Retain the bridge's height; add compact ramp approaches, openings in side glazing and a landing beyond the old slab before descending. |
| Raffles Place | Telok Ayer garden terrace | 2.6 / 6 m | Add a modest two-ended garden terrace rather than placing a bridge across the historic market or central square. |
| Queenstown | Estate access gallery | 3.4 / 3.6 m | A raised gallery alongside the existing block uses the estate's corridor vocabulary. Both ends connect to ground; the void deck and sheltered path remain available. |
| Queenstown | Dawson courtyard terrace | 2.4 / 5 m | A low courtyard level adds a second walking elevation without turning the station railway into a pedestrian route. |
| Orchard | Gateway elevated link | 9.5 / 4 m | Open the existing glazed overhead link for traversal. Replace its solid glass interior with side glazing and a roof; replace the obsolete blocked access with two usable ramps. |
| Orchard | Somerset seating terrace | 3.6 / 5 m | Replace the authored solid seating steps with a usable two-ended terrace facing the existing plaza screen. |

The taller two routes reuse existing bridge elevations; imposing the same height
on every district would weaken their identities. The other routes are deliberately
lower, so meaningful elevation does not require inventing landmark-scale flyovers.
Visual inspection rejected the first low-terrace render because the open stilts
made five unrelated places look like generic footbridges. Civic, Barrage, Telok
Ayer, Dawson and Somerset therefore use solid foundations; the access gallery
and the two existing elevated links retain open supports.
All ramps are at most 0.405 rise/run. These compact gameplay gradients should not
be described as real accessibility-compliant ramp designs.

## Placement and sectors

The routes sit within the existing civic/Barrage, Collyer/Telok Ayer,
void-deck/Dawson, and Somerset/Gateway-area sectors. No sector bounds or loot
weights were changed in this work. Orchard's Gateway route crosses the Ngee Ann,
Emerald Hill and Dhoby Ghaut sector edges; those existing overlapping ground
sectors are retained rather than pretending a new elevation is a separate district.

The existing Collyer tree that occupied the bridge interior was removed. Two
Orchard rain-tree crowns immediately beside the Gateway link were removed because
they intersected the player's upper body on the elevated deck. Other landmark
buildings and the Queenstown railway remain intact.

## Focused validation

- All eight routes traverse end-to-end in both directions using the actual
  vertical movement kernel, sampled every 0.2 m. Horizontal error stayed within
  0.01 m and vertical error within the controller's 0.35 m step allowance.
- Base obstacles checked every 0.5 m at the centre and both usable edge lanes;
  no player-footprint conflicts remain. The Collyer support columns have their
  real 8 m top recorded so the existing 8.9 m deck is usable above them.
- Conservative bounds of actual scene meshes, including every instanced mesh,
  checked every metre at the centre and both usable edge lanes. No overlaps remain
  in the body/head envelope from 0.5 to 1.8 m above the route. The lower 0.5 m is
  excluded because the legacy maps have shallow visual paving above their
  controller's zero-height ground. This is a geometric screen, not visual approval.
- The 13 dedicated original-three scene tests passed after integration.

The metrics support these judgments. They do not establish that every sector
needs elevation, certify geographic accuracy, or replace camera inspection and
playtesting for sightlines and fairness.

## Final visual review

The five solid-foundation rerenders and the recovered Queenstown gallery render
were inspected after the refinement. Together with the earlier Gateway and
Collyer views, all eight routes have now been visually reviewed. The gallery sits
clear of the HDB facade and the sheltered ground path. Both bridge conversions
retain their existing overhead-crossing silhouette. Low routes now read as raised
plinths with supported approaches rather than bridges on thin posts; their ramp
ends and adjacent ground paths remain visibly distinct.

This is acceptable as a first playable elevation pass, with a remaining design
limitation: the five low terraces still share a simple straight-plan shape and
rail treatment. Solid foundations improve their fit, but do not establish highly
distinctive landscape architecture or reference-accurate plaza layouts. The
Somerset platform is a simplified replacement for seating steps, not detailed
seating furniture. These limitations should remain explicit rather than treating
successful traversal or a higher metric as proof of finished district design.
