# HarbourFront and Sentosa: coastal ground and stopping places

Research and implementation: 31 October 2026. These maps remain compressed
gameplay interpretations. The relative heights and routes below are authored,
not a survey or a claim about current furniture positions.

## Different terrain relationships

HarbourFront retains a level quay, mall frontage and boardwalk. The Mount Faber
counterpart is a separate wooded shoulder rising behind the waterfront. Its
former five stacked rectangular blocks are replaced by a continuous hillside,
a direct stair climb with intermediate landings, a longer contour path, a level
rest pad and a lookout. The highest authored level is 22 game units. A retained
edge and open view rail explain the lookout boundary. Trees grow from the
slope, and slatted timber benches occupy level stopping places. Near the mall,
three cargo-cage groups become seating and planted edges; baggage and cargo
details remain on the terminal/wharf side. Existing VivoCity white balcony
bands, rails and pergola are retained.

Sentosa keeps the beach, lagoon, boardwalk and resort approaches low. Its fort
has a compact sequence of defensive terraces at 4, 8 and 12.2 game units,
blended into planted shoulders. The two lower paths now start at `z=12` and
finish before the `z=20` road, rather than climbing across the carriageway.
Longer slopes join the terraces, with short retained side edges and three
timber stopping places. The gun positions fit within the upper terrace.
Palawan's raised suspension crossing, its shore ramps and lookout structures,
and the existing Fort Siloso Skywalk structure remain separate from the ground.

Neither map receives Queenstown's HDB table groups, mosaic chess tables or a
district-wide blanket of hills. The waterfront, beach and inland climb have
different purposes and materials.

## Sources and observed features

The existing accepted reference images were directly reviewed again:

- `reconstruction/harbourfront/references/vivo-waterfront-0.png`, October 2017:
  broad level paving, planted frontage, pale balcony rails and restaurant
  pergola. This supports retaining the low waterfront and its reviewed facade
  vocabulary, not reconstructing the whole mall or the inland ridge.
- `reconstruction/sentosa/references/palawan-beach-0.png`, February 2015:
  low sand shore, palms, suspension crossing and two roofed lookouts. This
  supports preserving the coastal setting and existing bridge approaches.

Public sources inspected without paid imagery requests:

| Source | Observation and implementation scope |
| --- | --- |
| [NParks, Mount Faber Park](https://www.nparks.gov.sg/visit/parks/park-detail/mount-faber-park) | Identifies Marang Trail as a footpath/stair ascent from the base of the hill and describes viewpoints toward the coast. Its Faber Point photo shows a guarded lookout within vegetation. Supports a distinct inland climb and level stopping place. |
| [Little Day Out, Marang Trail, 30 September 2021](https://www.littledayout.com/marang-trail-climbing-up-stairs-mount-faber/) | The directly viewed `02-marang-trail.jpg` shows concrete steps, intermediate landings, timber handrails and dense planting. Informs stair/landing/rail relationships, not a claim that this game's straight stair traces the real trail. |
| [Little Day Out, Fort Siloso Skywalk and Siloso Trail, 21 June 2017](https://www.littledayout.com/fort-siloso-skywalk-siloso-trail-sentosa/) | The directly viewed `e-silosotrail2.png` shows a planted nature route rising under the Skywalk, with timber stopping places. Informs trail-side seating and the distinction between earth and elevated structure. |
| [VivoCity visitor information](https://www.vivocity.com.sg/tourist) | Distinguishes the waterfront promenade/boardwalk connection from the Level 3 Sky Park. Supports keeping these as separate surfaces and levels. |

Public reference images are cached only for review in `.cache/coastal-ground/`.
No downloaded photograph is shipped as a game texture. The new source scope is
recorded in `scene.userData.groundDesign`, separately from accepted Google
reference features. Existing review receipts, rejected images and exhausted
capture budgets are unchanged.

## Geometry, movement and surface ownership

`harbourfront-sentosa-ground.ts` supplies the terrain grids, exact triangle
height samplers and fort terrace layout. Each district exports the sampler
through its bounds, so the existing infantry, host navigation, vehicle grounding,
grade limit, dismount and flight systems use the same ground datum.

The HarbourFront grid is clipped beneath its concrete stair strip. Each tread
or landing owns that finish; the movement profile follows the existing game's
continuous stair contract, with visual risers no more than 0.15 units above it.
The contour path and rest/lookout paving are colored into the terrain itself.
The Sentosa grid is clipped at the exact fort floor and connection boundaries;
the existing earth-backed walk surfaces own those areas. Stone path cladding
follows their grades. No extra coincident terrain is left beneath them.

Benches, shade supports and new tree trunks have finite heights. The broad
terrain and earth-backed surfaces use ground sampling for flight clearance,
instead of treating their enclosing boxes as walls above a slope. The ground
samplers never turn the bridge, Skywalk or a roof into ground.

## Verification

- `harbourfront-sentosa-ground.test.ts` checks coastal/road datums, exact
  terrain ray heights, the level ridge rest pad, surface ownership beneath
  stairs and terraces, both directions of the direct and contour routes at two
  player radii, low flight clearance and solid trail seating.
- The existing registry checks test spawn/stamp/checkpoint/vehicle reachability,
  car-width road clearance and batching for both maps. Place diagnostics test
  the complete inherited mall/resort/fort connections, including wider walkers
  near the sides of each connection.
- Browser review covers overviews, walking-height ridge/stair/rest views, the
  level quay, fort approaches and terraces, and the Palawan beach/bridge.
  Local review blocks Google requests. Evidence and source-image checksums are
  retained in `.cache/coastal-ground/`.
