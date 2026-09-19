# Districts

Seven Singapore districts are playable. Every one is an authored, compressed
interpretation built for play — none is a surveyed map, a reconstruction or a
navigation tool. Real place names label stylised counterparts.

| District | Area | Stamps | Provenance |
| --- | --- | ---: | --- |
| Marina Bay | Downtown | 14 | Street View references, reviewed |
| Raffles Place | City core | 11 | Street View references, reviewed |
| Queenstown | Southwest | 8 | Street View references, reviewed |
| Chinatown | Central | 11 | Authored, no reference capture |
| Kampong Glam | Rochor | 11 | Authored, no reference capture |
| Jurong Lake | West | 11 | Authored, no reference capture |
| Changi | East | 11 | Authored, no reference capture |

## Two kinds of provenance

The first three districts were built against cached Google Street View and
Static API imagery, selected and reviewed view by view. Their attribution,
capture ledger, per-image acceptance records and before/after evidence are in
[the build story](BUILD-STORY.md), [visual understanding](visual-understanding.md)
and [`docs/evidence`](evidence/). The image allowances those passes consumed are
exhausted; see [the plan](../.agents/PLAN.md).

The four districts added afterwards were composed **from general knowledge of
those neighbourhoods, with no reference capture and no Google API requests of
any kind**. They make no claim to resemble a specific street, facade or
building, and their scenes record an empty `referenceFeatures` list so the
distinction stays machine-checkable rather than a matter of memory. Treat their
resemblance as thematic: a shophouse terrace, a domed mosque, a tiered pagoda, a
glazed roof with water falling through it.

They also have no source-linked learning catalog yet, so they show no
educational companion panel. Adding one means researching and reviewing cards
with real sources, the way the existing three were done — not generating facts.

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
2. **Stamps** — add the collectible list to `src/data/region-stamps.ts`.
3. **Registry** — add the id to `src/game/region-ids.ts` and the descriptor to
   `src/game/regions.ts`: bounds and movement (`createRegionMovement`), spawn,
   stamps, map roads, schematic furniture and the display copy.
4. **Zone** — add the `WORLD_ZONES` entry and a reversible pair of
   `WORLD_GATEWAYS`, an `FPS_DISTRICTS` range and a `ZONE_LOOT_RULES` profile.
5. **Picker** — add the `src/data/locations.ts` entry and a label slot in
   `SingaporeMap.tsx`, marked `central` if it falls inside the enlarged inset
   and `island` otherwise.

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
