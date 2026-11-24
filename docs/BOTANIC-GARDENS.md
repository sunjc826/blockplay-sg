# Botanic Gardens

The twenty-fourth playable district is the Tanglin and Central cores of the
Singapore Botanic Gardens, compressed to 430 m by 530 m. It was built on
23 November 2026 as a first pass from the level plan in
`docs/level-reviews/botanic-gardens-plan.json`, so the layout could be walked and
judged on the review board (`/debug?review=botanic-gardens`) rather than on a
drawing. Named places are stylised counterparts, not surveys.

It is also the vegetation testing ground: the first district where every palm is
a modelled species (`src/game/palm-species.ts`) and where the ground itself, not
buildings, divides the map.

## What is there

| Place | As built |
| --- | --- |
| Tanglin Gate | Gate court, the Botany Centre as two blocks over an open arcade, Holttum Hall |
| Swan Lake | Elliptical lake with an island, a gazebo on a landing at its south end, a path round it |
| Lawn E | Open lawn under the heritage Tembusu with its low branch |
| Bandstand hill | 6 m dome with the Bandstand on its crown, ringed by yellow-leaved trees |
| Ginger Garden | Head-high clumps that hide a figure and stop nothing; a waterfall wall with a way through behind the water |
| National Orchid Garden | Hill terraced at 4, 8 and 11 m, trellis arches up the path, hedged rooms, Burkill Hall on top |
| Orchid Plaza | Paved saddle at 6 m with the clock tower and fountain |
| Palm Valley | Lawn falling from 6 m to 1 m with one 1.5 m step, six island beds of palms |
| Rain Forest | Ridge 5 to 6.5 m high under a closed canopy, emergents on buttress roots, two clearings |
| Symphony Lake | Lake with the stage on an islet joined to its north shore |
| Corner House | On its own 4 m slope east of the lake |
| Secret Ravine and Cool House | Rock walls either side of the path down to a glasshouse with a door at each end |
| Nassim Gate | Long roof on columns over an open concourse; Evolution Garden planting along the north edge |

Burkill Hall and the Corner House each have a walled ground floor and an open
upper verandah reached by one outside stair.

## How it is built

- `src/game/botanic-gardens-ground.ts` holds the ground. One sampled grid
  (about 3 m) is both the drawn mesh and `groundHeight`, so the two cannot drift.
  Buildings stand on level pads cut into it. The ring road has its own grade,
  kept under 1 in 6, and the ground is level within 8 m of the perimeter roads.
- Paths, the ring road and every paved floor are one mesh draped on the ground.
  It carries `userData.groundPaving`, which `ground-cover.ts` reads to keep grass
  off it.
- Each lake is drawn as an ellipse and collides as rows of rectangles parted
  around the land standing in it (`lakeSpans`).
- `src/game/botanic-gardens-scene.ts` places everything else and exports the
  paths and building footprints the schematic map draws.

## Where the build departs from the plan

- The valley and plaza keep the plan's 6 m, and the forest's west rim was raised
  to 6.5 m so the valley still lies below both its sides.
- Symphony Lake is 56 m in half-width, not 66 m, and the Corner House stands 8 m
  further east, so its slope stays out of the water. The visitor centre moved
  east to make room.
- The Orchid hill's centre moved 10 m north so the ring road passes its foot on
  level ground.
- The rain forest boardwalk is not raised: Lane C runs on the forest floor.
- The Botany Centre blocks were shifted so all three lanes leave the gate court
  without passing through a building.
- Command posts and objectives are not built as game objects; the district uses
  the same stamps, practice range and expedition zone as every other. Its one
  arena, the Cool House lawn, is the flat north-west corner and has a
  falling-tree event.

## Limits

- Modelled species (docs/SINGAPORE-VEGETATION.md): coconut, royal, sealing wax,
  footstool and nibong palms; Tembusu, with the Lawn E heritage tree as its own
  shape; rain trees on the lawns and yellow-leaved ones ringing the Bandstand;
  Kapur by the Bandstand and Swan Lake; Jelawai Jaha and Jelutong in the Rain
  Forest; the native cycad and tree fern in the Evolution Garden; torch ginger;
  and hanging heliconia along the valley's east rim. No tree is a stand-in
  shape any more. A real forest holds hundreds of species; this one holds two.
  About three Ginger Garden clumps in ten are still plain masses.
- No reviewed photograph informed the geometry, so `referenceFeatures` is empty.
  Positions follow the official visitor map (August 2026) and NParks pages
  listed in the plan file; every height is authored.
- The Rain Forest, Ginger Garden and Nassim Gate measure `broken` on the cover
  test; every other sector measures `open`. The forest measured open (median
  67 m to cover) while its trees were stand-ins.
- Visibility targets in the plan are unmeasured. `pnpm analyse:layout` counts
  colliders only, so it does not see ground folds or foliage.
- The Cool House has no fog, Holttum Hall has no stair, and the waterfall has no
  walkable top.
- Paths lie about 10 cm above the ground they are draped on.
