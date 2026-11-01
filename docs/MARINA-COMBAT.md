# Marina Bay compact ground battlefield

Marina Bay's playable footprint is now **435.6 × 369.6 game metres**, down from
726 × 616: 40% shorter on each axis and **64% less ground area**. This supersedes
the first garden-only concentration pilot. The entire compact district remains
playable, including the bases of the landmark structures. There is no separate
large, empty exploration map outside the battle pocket.

## Layout and combat

Three equal-priority forward objectives use different routes around the bay:
Esplanade crossing to the north, Waterfront garden court to the south, and
Sands garden approach to the east. Civic and Flyer-approach command posts face
across this network. Spawns, reinforcements and deployment choices now use the
whole compact district; three patrol areas replace the single garden area.
The default population remains 32, with 48 and 64 available. Faction numbers,
weapons, movement speed and vehicle dimensions are unchanged.

The bay, SkyPark, ArtScience Museum, Flyer, Supertrees, conservatories, civic
arcades, road circuits, district checkpoint and fourteen collectibles remain.
The authored scenery is uniformly reduced to 60% in all axes to preserve
landmark proportions. For example, the SkyPark deck is now about 110 × 12 m,
at a tower height of 64.8 m. This is an authored gameplay layout, not a new
geographical reconstruction. Landmark interiors, rooftop objectives, lifts,
Flyer firing positions and rooftop helicopter deployment are future work.

Ground-level cover remains sized for normal players: 2.6 m sight-blocking
screens and 1.05 m low walls. The southern pavilions retain standing clearance,
and their narrower footprints have two tested passages around each counter.
Twelve additional screens break up northern, western and eastern approaches.
There are 23 tactical walls in total, four pavilions and two service kiosks.
Existing road centre lines remain driveable, and all collectibles and sector
anchors are reachable. A few anchors were moved away from narrowed margins.

`marina-layout.ts` is the shared coordinate conversion for scene bounds,
collectibles, sectors, checkpoints, practice positions and minimap geometry.
Static scene geometry and collision are compacted before human-scale cover,
stamps, the car and gameplay actors are added. Elevated civic floors and stairs
use matching coordinates; their rails are generated at normal height. Ambient
walkers keep their original body size. Flyer lighting inherits its wheel's
transform, and the other bay-show effects use the same scenery scale.

Facilities retain the opt-in `combatFocus` allocation policy: multiple squads
can contest a front, and captured fronts are held instead of automatically
swarming the opposing staging camp. Other districts retain their existing
layout and allocation. Camps are still ordinary damageable/capturable sites.

## Vehicle participation

Operational command posts no longer veto road/air reinforcement transports.
These still share each faction's existing regular roster, require casualties or
recruitment room, obey the 80-second external reserve clock and avoid overlapping
rides. An operational post permits drops toward the sector needing troops;
without one, the existing edge-entry preference remains. Road/air choice still
requires a clear driving corridor/open descent column. This correction applies
to command-and-control districts generally.

The one drivable Humvee recruits existing eligible soldiers, instead of adding
bots. Marina’s motor pool is now on the Flyer approach beside its owning
command post, where those soldiers can reach it. Distant visible enemies no longer prevent boarding: threats within 35 m
still do. A healthy driver with a gunner and ammunition stops to engage visible
enemies within 90 m, without counting that combat stop as being stuck. A lone
crew, a damaged hull, immediate hazards and genuinely stuck movement still cause
unloading. Ammunition remains finite. Explicit orders and player pickups retain
priority. The drivable helicopter still requires a human pilot; autonomous air
transport and raid crews belong to the separate scripted event system. This
change does not implement autonomous helipad sorties or multiple Humvees.

## Exploratory measurements

The original experiment remains in `.cache/marina-combat/`. The compact-layout
comparison is in `.cache/marina-compact/`, with frozen before/after sources and
raw trial data. These are local experiments, not production telemetry APIs or
shipped analytics dependencies.

The probe uses the actual battlefield scene, collision, AI, navigation,
facilities and reinforcement systems. Three seeds run for 180 simulated seconds
at each of 32 and 64 bots, with 0.05-second simulation steps and one-second
population samples. It records living dismounted infantry, positions, accepted
shots and intended targets, original bullet-origin hit distances, quiet periods
and actor-pair episodes split after five seconds without targeted fire. Final
trials additionally sample hull occupancy, ammunition, transports and raiders.

The observer is idle. No active-player tactics or proxy campaign are simulated.
Vehicle weapons, hazards and temporary event crews are excluded from infantry
fire metrics. The live navigation CPU budget means seeded runs are not exactly
reproducible under different machine load. Spatial proximity does not imply
line of sight, a clear walking route or an ongoing fight. Three-minute runs can
expose pacing and distribution problems but cannot establish long-match balance.

### Results of the compact-layout trial

Three seeds per size, compared with local commit `a715c79` (the earlier
large-map/garden-concentration layout), using the final map and motor pool:

| Mean across trials | Previous 32 | Compact 32 | Previous 64 | Compact 64 |
| --- | ---: | ---: | ---: | ---: |
| Walkable ground samples within 60 m of living regular infantry | 11% | 37% | 13% | 54% |
| First targeted infantry shot | 16.2 s | 22.8 s | 1.3 s | 2.7 s |
| Longest infantry firing gap, including opening | 16.2 s | 22.8 s | 15.3 s | 3.9 s |
| Mean intended-target firing distance | 97 m | 97 m | 100 m | 122 m |
| Mean living allied dismounted infantry | 4.9 | 10.8 | 8.6 | 13.7 |

At 32 bots, nearest-front attribution of shot origins is approximately
42% north, 19% south and 38% east: several active approaches rather than one
central choke. At 64, the distribution is less even (52% north, 35% south,
13% east). Attribution is geometric proximity, not a claim about objective
capture or line of sight. The comparison image is `distribution.png` in the
local experiment directory; raw samples retain faction and coordinates.

Every final trial produced both road and air reinforcement transports, with
2–3 arrivals in 180 seconds. The Humvee had a driver and gunner for 66–101
sampled seconds per trial; five of six trials recorded mounted gunfire. This
is evidence of participation, not a guarantee of constant vehicle combat.
The final simulations ran about 3.4–6.3 times real time on this machine.

The smaller map uses substantially more of its playable ground, but the
32-bot opening is slower, and 64-bot engagements are longer-ranged than the
concentrated pilot. Further sightline tuning and active-player playtesting are
still warranted. This pass does not establish perfect pacing or long-term
faction balance.

## Validation

Tests cover actual bullet/sight obstruction, low-cover firing, pavilion passages,
road circuits, collectible reachability, sector anchors and measured cover bands,
minimap/checkpoint alignment, facility placement, practice target sightlines,
landmark transforms, civic traversal, water and animated set pieces. Browser
checks inspect the district at ground level and from above and exercise the real
FPS engine with 32 and 64 soldiers. No paid reference or audio requests are used.


## Dragon boats and the floating campsite

Marina FPS ranges and expeditions have two unarmed four-seat dragon boats,
Red Dragon at the south jetty and Golden Dragon at the north jetty. W/S paddles
or reverses, A/D steers (including at rest), Space brakes, C changes view and V
changes seats. E boards from a jetty or landing and disembarks only at a dry
landing below 0.8 m/s. Touch uses the movement stick and brake control.
Occupied paddler seats improve acceleration; solo steering remains possible.
Maximum forward speed is 5 m/s. Hulls cannot cross quays, decks or each other.
Passengers in the last two seats retain their carried firearms. Open boat
occupants can be hit directly; boats have 300 hull health and no explosive blast.

The central 24 by 20 metre floating campsite has a low shelter, bedrolls,
separated waist-high cover and three landing arms facing north, south and east.
It is authored gameplay scenery, not a reconstruction of a real Marina island.
The decking stands at promenade level; surrounding water still blocks infantry.
All four occupants can disembark to distinct dry positions. There is no central
score objective, spawn point or unlimited resupply reward. The map shows the
decks and parked boats. Autonomous AI water routes are not implemented; human
players can steer and share the boats through the existing arena authority.

Expedition boats recover at their own jetties after wreck cleanup or distant
abandonment when the berth is clear and players are away. They do not consume
motor-pool supplies or replace an occupied hull. Other districts and vehicle
finish ownership retain their two motor-vehicle choices.

`pnpm test:dragon-boats` runs the dedicated browser fixture with Vite on 5219
and Chrome remote debugging on 9379 (override with `FPS_APP_ORIGIN` and
`FPS_CHROME_ORIGIN`). Unit coverage uses shipped campsite collision, a fully
crewed authority crossing and unload, exposed occupants, water confinement,
coasting/braking, clear jetties, camera models and reset behaviour.
