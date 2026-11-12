# Districts

Twenty-three Singapore districts are playable. Every one is an authored, compressed
interpretation built for play — none is a surveyed map, a reconstruction or a
navigation tool. Real place names label stylised counterparts.

| District | Area | Stamps | Provenance |
| --- | --- | ---: | --- |
| Marina Bay | Downtown | 14 | Reviewed Street View and hotel-atrium architectural photographs |
| Raffles Place | City core | 11 | Street View references, reviewed |
| Queenstown | Southwest | 8 | Street View references, reviewed |
| Chinatown | Central | 11 | Reviewed details; schematic layout |
| Kampong Glam | Rochor | 11 | Reviewed details; schematic layout |
| Jurong Lake | West | 11 | Reviewed details; schematic layout |
| Changi | East | 11 | Reviewed details; schematic layout |
| Upper Thomson | North-central | 11 | Reviewed details; schematic layout |
| Punggol | North-east | 11 | Reviewed details; schematic layout |
| HarbourFront | South | 11 | Reviewed details; schematic layout |
| Sentosa | Island | 11 | Reviewed details; schematic layout |
| Geylang | East-central | 11 | Reviewed details; schematic layout |
| Tuas | Far west | 11 | Reviewed details; schematic layout |
| Woodlands | North | 11 | Reviewed details; schematic layout |
| Tampines | East | 11 | Reviewed details; schematic layout |
| Toa Payoh | Central-north | 11 | Reviewed details; schematic layout |
| Bukit Timah | North-west | 11 | Reviewed details; schematic layout |
| Bishan | Central-north | 11 | Reviewed details; schematic layout |
| Orchard Road | Central | 11 | Reviewed details; schematic layout |
| Yishun | North | 11 | Researched landmarks; schematic geometry, no reviewed photograph claims |
| Little India | Rochor | 11 | Researched landmarks; schematic geometry, no reviewed photograph claims |
| Katong / Joo Chiat | East coast | 11 | Researched landmarks; schematic geometry, no reviewed photograph claims |
| Pulau Ubin | Northeast island | 11 | Researched landmarks; schematic geometry, no reviewed photograph claims |

## Reference coverage

The original nineteen maps received a September 2026 correction pass. Their
original three scenes reuse reviewed cached imagery; the other sixteen have
bounded previews, acceptance/rejection records and feature corrections. The
[district review](ALL-DISTRICTS-REVIEW.md) records those changes and limits.

[Yishun](YISHUN.md), [Little India and Katong/Joo Chiat](HERITAGE-DISTRICTS.md),
and [Pulau Ubin](PULAU-UBIN.md) were added later with researched landmark selection and schematic geometry.
These four additions have no accepted photographic-reference features or
reviewed learning cards. Yishun’s exaggerated danger is fictional game tuning.

`scene.userData.referenceFeatures` lists only features actually informed by
accepted references. It does not certify an entire district. Source and image
reviews retain dates and scope: a shop interior cannot establish a mall facade,
and a park path cannot establish an unseen tower. Capture plans and pending
images are not proof of resemblance.

Learning catalogs remain separate: the original three retain their source-linked
guides. Newly reviewed scene details do not automatically create learning cards.
Existing exhausted Static API allowances remain unchanged. Capture orchestration
is cache-first and selects only changed district plans; see [reference capture](REFERENCE-CAPTURE.md).

## What every district has

- Walk and drive controls, collision, stamps and a schematic map.
- An FPS practice range with eight targets, a car and a helicopter.
- An expedition zone: threat rating, loot profile, patrol preset, encounter
  spawns and reversible checkpoints into the district network.
- A local FPS minimap drawn from the same roads and bounds as the region map.

The expedition network is a connected graph, so every district is reachable
from every other. See [world zones](WORLD-ZONES.md).

## Adding a district

A district is a registry entry plus a scene file. Nothing else needs a new
branch: the walk/drive harness, minimaps, selection, tests and the browser
smoke all read the registry.

1. **Scene** — `src/game/<id>-scene.ts` exports `<ID>_SPAWN`, `<ID>_BOUNDS`,
   `<ID>_MAP_ROADS` and `build<Name>Scene()`. Build it with
   `createSceneKit` (`src/game/scene-kit.ts`), which supplies tracked geometry
   and materials, `box`/`cylinder`/`beam`/`blob`, canvas signs, trees, walkers,
   a car, stamp rings, a street grid, and the instanced-batch/dispose pass.
   Marina, Raffles and Queenstown predate the kit and keep their own copies.
   Pass `module: true` so the district is built on the block module
   ([shape language](SHAPE-LANGUAGE.md)): boxes and colliders snap to the
   0.1 m grid with a 0.1 m thickness floor, rhythm uses `STOREY`, `BAY` and
   `SLAB` from `src/game/block-module.ts`, and landmarks go inside
   `kit.freeform(() => ...)`. Run `pnpm audit:shape-language -- <id>` after.
   Pass `look` with a preset name for the gradient sky, blocky clouds, height
   haze, baked daytime indirect light and colour grade every district shares
   (see "Picking a look" below).
2. **Stamps** — add the collectible list to `src/data/region-stamps.ts`.
3. **Registry** — add the id to `src/game/region-ids.ts` and the descriptor to
   `src/game/regions.ts`: bounds and movement (`createRegionMovement`), spawn,
   stamps, map roads, schematic furniture and the display copy.
4. **Zone** — add the `WORLD_ZONES` entry and a reversible pair of
   `WORLD_GATEWAYS`, an `FPS_DISTRICTS` range and a `ZONE_LOOT_RULES` profile.
5. **Picker** — add the `src/data/locations.ts` entry and a label slot in
   `SingaporeMap.tsx`, marked `central` if it falls inside the enlarged inset
   and `island` otherwise.

### Picking a look

Every district shares one lighting language (`src/game/district-look.ts`):
named presets derived from shared defaults, each changing only what differs
for its kind of place.

| Preset | For | Districts |
| --- | --- | --- |
| `city` | Glass and stone towers (the defaults, as tuned on Marina) | Marina Bay, Raffles Place, Orchard Road |
| `heartland` | HDB estates: slab blocks, painted walls, softer warmer shade | Queenstown, Toa Payoh, Tampines, Bishan, Yishun, Woodlands, Punggol |
| `heritage` | Shophouse streets: warm light, deep five-foot ways, more grime | Chinatown, Kampong Glam, Little India, Katong / Joo Chiat, Geylang |
| `nature` | Forest, reservoir, island: humid air, green-tinted shade | Bukit Timah, Upper Thomson, Jurong Lake, Pulau Ubin |
| `coast` | Sea fronts and the airport by the sea: bright air, sand bounce | Sentosa, HarbourFront, Changi |
| `industrial` | Yards and plants: flatter colour, harder contrast, bigger panels | Tuas |

A kit district passes `look: 'heartland'` (say) to `createSceneKit`; the kit
turns its `background` into the look's `skyTint`, so the gradient sky keeps
the district's own hue rather than the weather's plain blue. Where a preset
clearly does not fit one field, pass `look: districtLook('heartland',
'#ccd8dc', { bounce: .2 })` instead of copying the preset. Scenes built
without the kit set `scene.userData.districtLook` to the same call. Every walk,
drive, FPS, expedition and arena mode builds the district through
`region.build()`, so they all pick the look up; reduced effects drop the
clouds, surface variation and bake, and software renderers keep three's fog.
Graded ground (`groundHeight`) needs nothing extra: the atmosphere hands it
to the exposure field, which measures wall feet from it.

`src/game/regions.test.ts` then holds the new district to the same bar as every
other: spawn, stamps, checkpoints, FPS spawn and vehicles must all be clear at
car width and reachable from the spawn by a collision-aware flood fill; every
displayed road must be drivable end to end; geometry must batch and dispose.

### Two things that will bite

**Footprints versus roads.** Colliders must stay clear of every displayed road
centreline, or the road test fails. A deliberate median is allowed — the test
checks that a lane is drivable, not that the centreline itself is empty, because
Queenstown's viaduct piers stand in its carriageway. A building that spans a
cross street must instead be split, as Changi's terminal is into three halls.

**Water and walls are one-way doors.** A lake, a canal or a seawall is a
collider like any other, and a continuous one will quietly cut a district in
two. Jurong's lake is five rectangles that leave exactly one causeway across,
and its seawall parts at the causeway mouth; Kampong Glam's canal is bridged at
every cross street. Prefer arranging the obstacle around the route you intend.

Cast water as a list of spans rather than one rectangle when a road has to get
through it. Punggol's waterway is six spans with a gap at every cross street and
a pair either side of the arch bridge, which is what makes that bridge a real
crossing instead of scenery. Upper Thomson's reservoir is two pools with the
road between them. Anything drawn along the bank — a bund, reeds, a promenade
rail — has to stop at the same gaps, or it re-closes what the water left open.

Water does not have to be a rectangle. Bishan's river is a chain of short
boxes stepped along a sine curve, each overlapping its neighbours, so a
meander collides as one continuous bank while every box stays axis-aligned.
The same gap rule applies to the chain.

**The grid helper runs every road edge to edge.** `streetGrid` draws each street
across the whole district, so a street that has to stop short — at a quay, a
shore, a rail corridor — cannot come from it. Lay that one by hand and give
`mapRoads` the partial segment; HarbourFront's middle street does this so the
basin can reach the eastern cross street without swallowing the road. Keeping
the water clear of the grid entirely is simpler where the layout allows it:
Sentosa's two seas sit outside the perimeter loop for exactly that reason.
