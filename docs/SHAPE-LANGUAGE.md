# Shape language: the block module

The districts keep their blocky style, but on purpose: generic buildings,
streets, kerbs, paving, plazas and props are built from one module so that
neighbouring edges meet on the same lines and nothing is modelled finer than
the world can draw steadily. Constants and snap helpers live in
`src/game/block-module.ts`.

## The rules

| Rule | Value | Name |
| --- | --- | --- |
| Structural module | 0.5 m | `BLOCK` |
| Detail sub-unit | 0.1 m (a fifth of a block) | `DETAIL` |
| Thinnest modelled feature | 0.1 m | `MIN_DETAIL` |
| Storey (floor to floor) | 3 m, six blocks | `STOREY` |
| Window bay | 3 m | `BAY` |
| Door | 1 x 2 m | `DOOR` |
| Paving slab | 1 x 1 m | `SLAB` |
| Kerb | 0.2 m high, 0.5 m stone | `KERB` |
| Storey band | 0.2 m | `BAND` |
| Guard rail | 0.1 m posts and rails, 1.2 m high, 1.5 m pitch | `RAIL` |
| Road line | 0.2 m wide | `ROAD_LINE` |

1. **Sizes** of structure (footprints, storeys, bays, slabs, roads, plazas)
   are whole blocks; sizes of detail (bands, trim, posts, furniture) are whole
   sub-units.
2. **Positions** snap so both edges of a box land on the grid. Snapping moves a
   centre by at most half a sub-unit (5 cm), so authored routes, doorways and
   cover keep working.
3. **Detail floor**: nothing is modelled thinner than 0.1 m in plan, nor as a
   raised element thinner than 0.1 m. Finer features become chunkier, become
   paint (ground overlays may stay thin vertically) or are removed. Gaps
   narrower than 0.1 m between neighbours are closed.
4. **Density**: buildings read as buildings through the same mid-scale
   rhythm — one band per 3 m storey, 3 m window bays, a parapet.
5. **Landmarks stay freeform**: real curves and distinctive silhouettes
   (ArtScience Museum, Supertrees, the Flyer, Marina Bay Sands, domes, bridges,
   heritage facades) are not snapped. A district lists them as freeform zones
   (`SHAPE_FREEFORM_ZONES`) so the audit does not count them as generic.

## Why 0.5 m and 0.1 m

The November 2026 survey (`pnpm audit:shape-language`, baseline in
`docs/evidence/shape-language-baseline.json`) measured every registered
district. Authors already worked in decimal metres: 55–91% of generic box
dimensions sit on 0.1 m, against 6–38% on 0.125 m or 0.25 m, and snapping
to 0.1 m moves geometry 2–3 cm on average against 4–6 cm for 0.25 m. The
character rig, the car and the walking eye height are decimal too. A 0.1 m
sub-unit therefore gives every district a shared divisor with the smallest
change, and five of them make the 0.5 m block, which carries the 3 m storey,
the 1 x 2 m door and the 1 m slab exactly.

## How a district gets it

- `createSceneKit` (`scene-kit.ts`) snaps every `box` and `solid` with
  `snapModuleBox` / `snapFootprint`, floors `cylinder` and `beam` radii with
  `minRadius`, and draws the street grid with module kerbs and road lines.
  A box and a collider authored with the same numbers stay identical.
  `kit.freeform(() => ...)` builds landmark boxes without snapping.
- Marina, Raffles and Queenstown keep their own builders (they predate the kit)
  and call the same helpers.

## Audit

```sh
pnpm audit:shape-language                 # every district, table
pnpm audit:shape-language -- marina-bay --json
```

Per district it reports the share of generic box dimensions and edges on each
candidate module, features thinner than candidate minimums (thin in plan, thin
and raised, ground overlays), hairline joints between coplanar tops, ground-cap
slivers, and draw/triangle counts. It is a measurement, not a certificate.
