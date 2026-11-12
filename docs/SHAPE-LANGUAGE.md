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
| Road line | 0.2 m wide, 5 m dashes | `ROAD_LINE` |

1. **Sizes** of structure (footprints, storeys, bays, slabs, roads, plazas)
   are whole blocks; sizes of detail (bands, trim, posts, furniture) are whole
   sub-units.
2. **Positions** snap so both edges of a box land on the 0.1 m grid
   (`snapSpan`, `snapModuleBox`). A centre moves by at most half a sub-unit
   (5 cm), so authored routes, doorways and cover keep working. An edge that
   is already on the grid anchors the span, so trim mounted on a wall grows
   outward rather than sinking into it. A collider authored with the same
   numbers as its box (`snapFootprint`) snaps identically.
3. **Detail floor**: nothing is modelled thinner than 0.1 m in plan, nor as a
   raised element thinner than 0.1 m; cylinders keep a 0.1 m diameter. Finer
   features become chunkier, become paint or are removed. Snapping closes
   joints narrower than 0.05 m and turns 0.05–0.1 m joints into 0.1 m ones.
4. **Ground stays with ground cover**: paint and paving thinner than the floor,
   and any low slab that starts below 0.3 m and tops out below 0.6 m, keep
   their authored level and height. `withGroundCover` levels those surfaces
   anyway; snapping them vertically would bury the paint laid on them.
5. **Density**: buildings read as buildings through the same mid-scale
   rhythm — one band per 3 m storey, 3 m window bays, a parapet.
6. **Landmarks stay freeform**: real curves and distinctive silhouettes
   (ArtScience Museum, Supertrees, the Flyer, Marina Bay Sands, domes, bridges,
   heritage facades, playground and park follies) are not snapped, nor are
   features implemented from accepted reference images. Characters, the car,
   animated groups and graded ground with authored walking heights are left
   as authored too.

## Why 0.5 m and 0.1 m

The November 2026 survey (`pnpm audit:shape-language`, baseline in
`docs/evidence/shape-language-baseline.json`) measured every registered
district. Authors already worked in decimal metres: 55–91% of generic box
dimensions sit on 0.1 m, against 6–38% on 0.125 m or 0.25 m, and snapping
to 0.1 m moves geometry 2–3 cm on average against 4–6 cm for 0.25 m. The
car, the street-grid widths and most authored storeys are decimal too. A
0.1 m sub-unit therefore gives every district a shared divisor with the
smallest change, and five of them make the 0.5 m block, which carries the
3 m storey, the 1 x 2 m door and the 1 m slab exactly.

## How a district gets it

- `createSceneKit({ ..., module: true })` (`scene-kit.ts`) snaps every `box`
  and `solid`, floors `cylinder` and `beam` radii, and draws the street grid
  with module road lines and kerbs. Build a landmark inside
  `kit.freeform(() => ...)` to keep it exact; `walker` and `car` always are.
  Without `module: true` a district builds exactly as authored.
- The flag also sets `scene.userData.blockModule`, which shared builders read:
  `withDistrictBoundaries` snaps its scenery boxes on module districts.
- Use the named constants for rhythm: `for (let y = ...; y < h; y += STOREY)`.
- Marina Bay predates the kit and is compacted by 0.6 after authoring, so it
  applies the same helpers in world metres after compaction, with its
  landmark zones in `SHAPE_FREEFORM_ZONES['marina-bay']`.

Districts on the module (November 2026): Marina Bay, Toa Payoh, Tampines,
Bishan and Pulau Ubin. The rest build as authored until converted; heritage
shophouse districts (Chinatown, Kampong Glam, Little India, Katong/Joo Chiat,
Geylang) are mostly heritage facade and need a decision on what counts as
generic first. Shared builders that are not yet module-aware: street props,
vegetation props, vertical places and lifts, set pieces and animals.

## Snapping and surface ownership

Snapping puts more faces on the same planes. `withSurfaceOwnership` resolves
every coincident pair, and each distinct cut becomes an instanced variant, so
a module district can gain a few draws. Check `scene.children.length` and the
audit's draw count after converting; merging unique static geometry of one
material (with `userData.flightBounds` per part, see `flight-obstacles.ts`)
is the remedy Marina used.

## Audit

```sh
pnpm audit:shape-language                 # every district, table
pnpm audit:shape-language -- marina-bay --json
```

Per district it reports the share of generic box dimensions and edges on each
candidate module, features thinner than candidate minimums (thin in plan, thin
and raised, ground overlays), joints narrower than a candidate minimum between
coplanar tops, ground-cap slivers, and draw/triangle counts. Boxes inside a
district's freeform zones, rotated boxes and non-box meshes are reported as
freeform. It is a measurement, not a certificate. Before/after numbers for the
converted districts are in `docs/evidence/shape-language-converted-before.json`
and `docs/evidence/shape-language-after.json`.
