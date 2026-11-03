# Build-time navigation baking

Every production Vite build (normal, Sites and Cloudflare) bakes the static
navigation graph for all 23 registered districts before bundling the app. This
runs the existing directed walking validator; it does not replace collision
checks with approximate straight-line visibility. No paid APIs are involved.

The build uses the same district infrastructure placement as live expeditions,
including camps, vehicle staging anchors, Marina boat approaches, authored
stairs and lift service endpoints. Generated data is emitted as content-hashed
JSON assets; the app fetches only its current expedition district alongside
models before creating the host simulation. Navigation assets are cached on
first use by the service worker, not included in the all-district install cache.
Normal development uses the lazy planner, without a bake or a navigation fetch.
Training/custom arenas also retain the lazy path.

## What remains live

Destination choice, path search, congestion costs, start/end connections, vehicle
obstructions, lift timing and physical walking checks remain runtime work. Only
fixed nodes and validated static graph edges are precomputed. Both successful
and failed edge tests are accounted for, so empty adjacency lists also skip
validation. Edges keep their original order, direction and full JS number
precision. This is not an all-pairs route table or a reduced physics rate.

Every build regenerates the assets. A change to terrain, geometry or movement
rules therefore cannot silently reuse a previous build's graph URL. A geometry
and anchor signature (coordinates rounded to a micrometre to tolerate Node/Chrome
trigonometry rounding; graph values remain lossless) also rejects graphs for a different live world; malformed,
missing or unavailable data falls back to the existing shared lazy planner.
The signature describes serialized geometry, not arbitrary terrain callback
code: compatibility of terrain code and rules is guaranteed by the production
build and its content-hashed asset references. Do not transplant these assets
between builds. No bake is stored in player saves.

The navigator reports source, node count, cached nodes, rejected data and static
validation count for tests/profiling. The FPS canvas records its initial graph
status once in `data-navigation-graph`.

## Commands and evidence

- `pnpm build`, `pnpm build:sites`, `pnpm build:cloudflare`: automatically bake all districts.
- `pnpm bake:navigation`: fresh standalone all-district bake and cost report.
- `NAVIGATION_DISTRICTS=queenstown pnpm bake:navigation`: diagnostic subset only; does not alter production builds.
- `pnpm check:navigation`: rebuild scene inputs and compare 16 lazy/baked route queries per district against the saved assets.
- `pnpm profile:navigation`: seeded 32-bot Queenstown CPU-only comparison, three seeds, alternating lazy/baked order.
- `pnpm test:navigation:browser`: production browser acceptance plus failed-download fallback (requires preview/Chrome; `FPS_APP_ORIGIN`/`FPS_CHROME_ORIGIN`).

Standalone assets, bake timing, route verification and runtime timing go under
`.cache/navigation-bake/`. `NAVIGATION_OUTPUT` changes the standalone output
folder. Generated assets and machine-specific raw profiles are not committed.
Build failures prevent deployment. Browser/profiling results are not estimates
of phone frame rate; navigation's wall-clock budget can also change combat
trajectories between otherwise seeded runs.

## Initial all-district measurement — 2026-11-03

Fresh sequential production build on the development Mac, without rendering.
Includes scene construction, node generation and complete static edge validation;
gzip is an estimate of transport size, not a measured server response encoding.

- Bake wall time: **81.90 seconds**; CPU time: **84.55 seconds**.
- Graph totals: **38,096 nodes**, **388,822 directed connections**.
- JSON total: **9,474,804 bytes**; gzip total: **2,413,507 bytes**.
- Peak process RSS: **836.7 MiB** (includes Vite/scene construction, not graph size).
- Full normal Vite build: approximately **85 seconds**, excluding the preceding typecheck.
- **368 route comparisons** across 23 maps matched exactly, including matching unreachable results; baked queries performed zero static edge validations.

| District | Nodes | Connections | Bake seconds | Gzip KiB |
|---|---:|---:|---:|---:|
| marina-bay | 3,213 | 32,218 | 10.96 | 212.7 |
| raffles-place | 1,679 | 17,336 | 3.40 | 114.0 |
| queenstown | 3,616 | 36,274 | 11.23 | 253.6 |
| chinatown | 2,124 | 21,185 | 2.34 | 122.2 |
| kampong-glam | 2,194 | 22,192 | 3.00 | 128.8 |
| jurong-lake | 1,271 | 12,982 | 3.41 | 76.0 |
| changi | 1,294 | 12,544 | 2.49 | 81.7 |
| upper-thomson | 1,621 | 16,836 | 1.81 | 97.5 |
| punggol | 1,388 | 14,123 | 2.60 | 87.6 |
| harbourfront | 1,617 | 16,148 | 4.72 | 105.2 |
| sentosa | 1,192 | 12,296 | 2.95 | 80.4 |
| geylang | 1,515 | 15,978 | 1.72 | 88.1 |
| tuas | 1,248 | 12,175 | 2.57 | 73.5 |
| woodlands | 1,562 | 16,063 | 5.72 | 90.1 |
| tampines | 1,316 | 13,411 | 3.07 | 89.8 |
| toa-payoh | 1,461 | 15,075 | 4.18 | 88.5 |
| bukit-timah | 1,319 | 13,923 | 1.33 | 74.3 |
| bishan | 1,414 | 14,728 | 2.93 | 89.4 |
| orchard | 2,408 | 24,393 | 5.50 | 137.3 |
| yishun | 1,101 | 11,594 | 1.35 | 65.8 |
| little-india | 1,185 | 12,381 | 1.30 | 65.0 |
| katong-joo-chiat | 1,252 | 12,750 | 1.29 | 65.3 |
| pulau-ubin | 1,106 | 12,217 | 1.16 | 70.1 |

## Queenstown simulation comparison

32 bots, 20 Hz, 2 simulated seconds of warmup plus 60 measured seconds,
three seeds, alternating execution order, no rendering. Runtime scene setup
includes live lifts and boat/camp anchors. These compare this implementation
with its own lazy fallback; do not combine percentages with the earlier audit.

| Seed | Lazy mean tick ms | Baked mean tick ms | Reduction | Lazy p95 ms | Baked p95 ms |
|---|---:|---:|---:|---:|---:|
| 1 | 6.11 | 3.53 | 42.2% | 12.11 | 8.98 |
| 2 | 6.43 | 3.47 | 46.0% | 13.59 | 8.81 |
| 3 | 6.84 | 3.39 | 50.5% | 14.19 | 8.95 |

All baked trials used 3,616 cached nodes and performed zero static connection
validations. Combat trajectories can differ because planning is scheduled by
wall-clock budget. This does not establish a browser or mobile FPS gain.


## Repeated movement checks

The follow-up movement optimization reuses the last padded static grid cell's
candidate list, avoiding repeated string-key creation and map lookups. Crossing
a cell boundary refreshes the list; oversized bodies still use the full static
list. It does not cache collision or floor-support answers. Dynamic vehicle and
lift bodies remain inputs to each query, including when the actor is stationary.
Static movement data is still rebuilt when authored geometry is installed, as
before (for example, after range props load).

Support and jumping checks iterate static/dynamic lists in their original order
without concatenating them. Polygon overlap computes projection extrema directly
without allocating an array for each separating axis. Step sizes, tolerances,
axis order, gravity and overlap mathematics are unchanged.

A differential harness ran 132,480 old/new occupancy, support and movement
comparisons across 23 districts, including changing dynamic bodies, multiple body
radii and tick sizes: every result matched exactly. All 23 rebaked navigation
graphs, including their keys, also matched the previous outputs exactly.
Four regression cases cover grid boundaries/oversized bodies, a moving vehicle,
changing platform/headroom, and polygon vertices changed in place.
A separate mixed-radius Queenstown movement-query benchmark (six alternating
batches per version, 9,600 calls per batch) averaged 4,054 ms before and 3,752 ms after,
about 7.5% less time. This is not a whole-game or mobile FPS measurement.


### Reuse inside one movement call

`canOccupy` and `supportHeight` reuse their most recent identical query during
one synchronous `move` call. The key includes position, height limit/body size
and dynamic-obstacle list. Terrain sampling and geometry stay stable during the
call; the cache is invalidated at both boundaries, including exceptions and
nested calls. Standalone queries and later movement calls read current geometry.
Movement results remain newly owned objects, so paused route generators cannot
have their saved state overwritten by another actor.

Vehicle physics constructs ground lists only for driving, and flight lists only
for flying or wreck support. Per-vehicle buffers retain authored static entries
and refresh other vehicles in simulation order. Authored source lists keep stable
membership (replace the list to replace geometry); changes to objects remain live.
Fallback flight obstacles are copied from current source fields on each query.
Infantry also shares its combined vehicle/lift list for the existing tick lifetime.

The preceding four-seed Queenstown experiments found roughly 2% lower simulation
CPU for movement-query/list reuse and 3.6% for vehicle buffer reuse plus skipping
unused lists. These are separate measurements and should not be added together.
The focused identical movement corpus improved about 40%; neither figure is an
FPS or physical-mobile claim. Small scratch-array pooling showed no meaningful
benefit and is not included.
