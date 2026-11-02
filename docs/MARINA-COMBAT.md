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

Mixed enemy squads now include a dedicated **Heavy MG** role alongside assault,
tank and sniper infantry; the same role is selectable in arena lobbies. These
armored, slow-moving gunners carry MG4s (standard or sustained-fire variants).
Friendly heavy reinforcements use the FN MAG. This changes the roster mix without
adding soldiers to the configured population.

Heavy gunners prioritize visible hostile helicopter hulls within 220 m, including
occupied drivable helicopters, scripted gunships and air transports. They lead
moving aircraft and fire normal travelling rounds with the weapon's own damage,
falloff, magazines and belt reloads. Cover and smoke block identification;
abandoned and friendly aircraft are ignored. Their aim takes time to settle,
and movement orders, objectives, healing and danger avoidance still apply.
Breaking sight or attacking during a belt change gives a pilot an opening.

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

The centre is now a compact octagonal Merlion islet, about six metres in
radius, replacing the old 24 by 20 metre campsite. Its main dry area is roughly
75% smaller. The existing Merlion model and fountain have moved from the west
promenade onto the islet; its pedestal provides cover, with two low peripheral
barriers. Three landing arms face north, south and east. This is an authored
combat layout, not the Merlion's real-world location or a surveyed Marina island.
All four boat occupants can still disembark to distinct dry positions.

Players can swim in Marina's central bay at up to 1.25 m/s (carry burden can
make them slower), compared with a boat's 5 m/s. There is no swim sprint or
jump, no ADS, no rifle or grenade fire, and no firing while moving. A stationary
player can hip-fire their P30 sidearm with a large accuracy penalty; landed
bullet damage is unchanged. Supplies cannot be used while swimming. Movement
speed, stationary-only sidearm fire and extra shot dispersion are enforced by
the authority as well as the local player. Remote swimmers appear partly
submerged and animate surface strokes. There is no breath or drowning timer.

Gold ladders mark automatic climb-out points at the three islet landings and
both shore jetties. Ordinary quay edges cannot be climbed. Ladder positions and
the Merlion appear on the FPS map. Infantry water blockers remain in place for
cars and dry AI navigation; swimming is player traversal only. There is no
central score objective, extra spawn, bridge, channel or resupply reward. AI
water routes and boat piloting remain unimplemented.

Expedition boats recover at their own jetties after wreck cleanup or distant
abandonment when the berth is clear and players are away. They do not consume
motor-pool supplies or replace an occupied hull. Other districts and vehicle
finish ownership retain their two motor-vehicle choices.

`pnpm test:dragon-boats` runs the dedicated browser fixture with Vite on 5219
and Chrome remote debugging on 9379 (override with `FPS_APP_ORIGIN` and
`FPS_CHROME_ORIGIN`). `pnpm test:swimming` uses the same server/browser ports for swim controls and Merlion views. Unit coverage uses shipped islet collision, a fully
crewed authority crossing and unload, exposed occupants, water confinement,
coasting/braking, clear jetties, camera models and reset behaviour.

## Playable landmarks and AI drivable helicopters

MBS now has two separate service stair towers leading to a covered SkyPark
fighting deck at 66.4 m. The Flyer has service stairs and fixed overlooks at
18 m and 33 m. Gardens by the Bay has two stair approaches to a connected
7.2 m canopy walk and terraces. Each landmark has a capturable supply site,
bringing Marina to ten facilities while retaining the three ground fronts.
These access structures are authored gameplay additions, not architectural
reconstructions. Flyer capsules are not rideable. Rooftop helicopter spawning
and landing/dismount support are not part of this pass.

`marina-landmarks.ts` holds these walk surfaces, cover and objectives. Infantry
navigation targets the actual elevated floor; supply sites do not create
unsupported rooftop reinforcement spawns. Both SkyPark entrances, both garden
entrances and the Flyer access are tested through the normal movement kernel.

`helicopter-autopilot.ts` provides drivable mission selection and normal pilot
controls. Existing squads can choose to stay infantry, transport passengers,
or provide short air support. The normalized weights consider ground soldiers
remaining after the proposed crew leaves, objective pressure, useful gun range
and sight, transport distance, and nearby friendly scripted gunship coverage.
Routes and landing clearance are hard gates. Each squad draws once per
opportunity, with a 30-second decision cooldown and an independent RNG stream.

Only eligible members of that squad receive boarding reservations (within
45 m). The pilot waits at least 3 seconds, departs when reservations resolve,
and waits at most 18 seconds. Dead, reordered, healing, unavailable or stalled
passengers lose their reservation; five seconds without approach progress
counts as stalled. A transport without passengers cancels rather than flying
empty. A support mission may fly with only its pilot. Human pickup behavior
continues to work.

Flights climb above a collision-checked corridor, fly to a validated ground
landing or firing station, then return. Support lasts up to 30 seconds on
station; low hull health, exhausted gun ammunition, a resolved objective,
new orders or the 150-second outbound mission limit trigger return. A blocked
home landing column uses a validated nearby recovery point. Weapons
retain their actual ammunition, line-of-sight and damage rules. No extra bots
are spawned. Scripted gunships, raids and deployment transports retain their
existing controllers. Marina starts with an allied operational helicopter
near the allied staging area so squads can actually use this behavior.

Regression coverage includes full arena transport boarding/delivery/return,
a support sortie firing its gun and returning, pilot loss, weighted choices,
reservation expiry, and flight over solid obstacles using real vehicle physics.

## November 2026 CPU profile

A report of sub-20 FPS at 32 bots on Edge prompted profiling. The reported
laptop has an i9-14900HX and RTX 4060; the user confirmed hardware-accelerated
WebGL and an ANGLE RTX 4060 renderer. These are device details, not an on-device
trace. The measurements below were taken locally in Chrome with native Metal
rendering, using the real FPS scene, AI, collision and navigation.

Infantry movement and navigation repeatedly raycast beneath every vehicle to
decide which hulls block walking. With four Marina vehicles, every moving bot
repeated identical expensive scene-mesh queries each tick. Against `d34e22c`,
ground-height queries accounted for approximately 86% of simulation CPU time
in the 32-bot sample. Infantry now shares a lazy hull snapshot per tick, built
after vehicle motion. It refreshes next tick and on reset, preserving ground,
roof and airborne classification, hull dimensions and navigation height bounds.

| 32 bots, same entry and viewport | Before | Shared hull snapshot |
| --- | ---: | ---: |
| Mean simulation CPU per tick | 19.58 ms | 3.74 ms |
| Ground-height queries per tick | 112.8 | 4.7 |
| Native average FPS | 59.5 | 60.0 |
| Average FPS with artificial 4× CPU throttling | 6.3 | 17.0 |

Each trial warms up for 20 seconds, then records 15 seconds of frame timings;
function timers and the CPU sampling profiler cover approximately 17 seconds
including measurement setup. The observer is kept alive. Native trials use
1280 × 800 at device pixel ratio 1. Both native 32-bot runs reach the display
cap, so the approximately 81% CPU reduction represents headroom rather than
an equivalent FPS multiplier. The artificial throttle exposes CPU sensitivity;
it does not model or predict the user's laptop. Live navigation scheduling
and battle evolution introduce variation between runs.

A fixed 64-bot trial at `approach-28` averaged 60.0 FPS and 7.45 ms per
simulation tick. It has no matched baseline in this experiment and is only
one camera view. These short stationary trials do not establish long-session
performance, all-view rendering cost, or the complete cause of the laptop's
slowdown. Raw traces, function timing receipts, screenshots and the temporary
instrumentation harness are in `.cache/marina-profile/`; instrumentation is
not shipped. Tests cover constant query count across different infantry counts,
reset, and rebuilding at the vehicle's newly moved position within the tick.


### Merlion sculpture

The central Merlion uses a dedicated procedural sculpture: a carved lion face
with almond-shaped eye recesses, muzzle and mouth, layered mane on all sides,
shallow scalloped fish scales, curled tail fins and blue tiled wave arches.
The fountain starts at the mouth and tapers down to the bay surface. Water in
the decorative jet does not block shots. The existing cover envelope, island,
boat landings and swimming exits are unchanged.

The cached September reference images support the fish scales and plinth;
their cropped head does not establish a detailed facial likeness. The new head
and mane are an authored stylization. No new reference capture was made.
Carvings are merged by material, keeping the whole sculpture to seven meshes
and fewer than 30,000 triangles. `pnpm test:merlion` captures front, side, rear,
three-quarter, islet and swimmer views with the same local ports as the swimming
fixture; output is in `.cache/merlion/`.


## Merlion pressure station

In Marina combat sessions the central Merlion is a shared suppression station.
Approach the brass wheel on the south side of its plinth and press **E** to
operate it. Mouse or touch look rotates the statue (maximum 1.6 radians/second);
hold **Fire** for the aimed water cannon, **Q** for a mist burst, and **E** to
leave. Touch controls also provide mist and exit buttons. The operator's body
stays exposed at the wheel; the camera looks from above the mouth. The statue's
existing central movement-cover envelope stays fixed while its sculpture turns.

The cannon reaches up to 65m, stops at rendered scenery, vehicle/transport hulls
and the bay surface, and affects actors intersecting its roughly 1.9m-wide jet.
A direct hit produces an almost opaque water-sheet overlay on players and blocks
bot sight/target acquisition while contact continues. Both recover within 0.24s
of leaving the stream. It deals no health damage and can obscure allies. It has
seven seconds of full-pressure firing, replenishes over 18 seconds while idle,
and needs three seconds of pump recovery after exhaustion. Released, dead,
disconnected or paused operators cannot leave a permanently firing cannon.

Mist consumes 40% of the same pressure reserve, lasts 4.5 seconds in a 10m radius,
and has a shared 22-second cooldown. The visible cloud and screen haze obscure
both factions, including its operator; authority sight checks account for rays
passing through the cloud. Mist does not block bullets.

The marked cache beside the east side of the plinth has **three shared packs**.
Each pickup applies a 25-health field dressing and adds one current-weapon spare
magazine if a rig pouch is free. It cannot exceed maximum health or rig capacity.
There is an eight-second pickup interval per actor; one pack replenishes every
45 active simulation seconds. Spent stock, recharge and cooldowns persist across
expedition district travel. A new arena match resets the station.

Bots already on the island can navigate to the wheel, claim it when free, rotate
and fire at visible enemies, use mist against nearby threats, and release a post
with no target. Boat missions now bring nearby squads to the island (see below);
infantry still uses dry walking routes to board and disembark. Host authority
owns occupancy, aiming rate, pressure, supplies and water contact in solo and shared combat sessions; clients submit intent only.

Verification: `pnpm test:merlion:gameplay` uses Vite5219/Chrome9379 and the real FPS
engine for desktop/touch operation, mist, finite supplies and a bot-operated
cannon blinding/releasing the player. Unit and arena tests cover cover clipping,
stock/cooldown bounds, timed recovery, bot aiming and network validation.


## Bot dragon boat missions

Nearby infantry can reserve an available dragon boat, walk to its actual dry
boarding point, gather up to three existing squadmates and paddle to the Merlion
island. This works in expedition and shared Marina combat. Recruitment is local
(within 45m), respects explicit orders, and does not add soldiers to the match.
A player approaching an empty boat gets priority; friendly bots join a player's
boat only after a sustained stop, including gather followers. They cannot take
the empty driver seat while a player remains aboard.

Pilots follow water routes for the entire oriented 9m hull, first clearing narrow
jetties before turning. They brake for turns and docks, reverse into shore berths,
choose another landing when blocked, and replan a stalled route at a bounded rate.
Boarding waits are bounded (3s minimum/8s maximum for reserved crew); no gunner or
ammunition is required. Dragon boats remain unarmed transports.

At a valid island landing the crew disembarks to separate dry points and spends
90s contesting/guarding the Merlion. They can operate its existing cannon/mist
controls. With passengers, the pilot stays aboard and returns the boat to a
clear shore berth for reuse; a lone pilot can land and contest directly. Expired
island duties permit return trips. Loss of a pilot at sea permits a surviving
bot to take over only when no player remains aboard. Failed landings retain the
crew aboard and try another berth; bots never jump into open water or teleport
to the campsite. Normal faction, health, cooldown, boat collision and vehicle
snapshot rules apply.

Verification: 10 new route/authority tests cover both boats' round trips, blocked
berths, dry walking approaches, squad delivery in open/shared modes, actual
pilot casualties and player control priority. `pnpm test:dragon-boats:ai`
(Vite5219/Chrome9379) runs the real FPS engine through boarding, crossing,
disembarkation, an island bot operating the Merlion, and the pilot returning to
shore, with screenshots and actor counts.


## Integrated landmark access

The freestanding MBS switchback towers are replaced by three enterable tower
lobbies with bay-facing/north entrances, reception desks, seating and ceilings.
Two enclosed express lift cores in the outer towers connect directly to the
SkyPark. The playable interiors are these lobbies and the roof access rooms;
intermediate hotel rooms are not modeled. The exterior tower silhouette stays
intact, with openings through the lobby and actual holes through the roof deck.

The lifts run opposite phases of the same automatic shuttle cycle: seven seconds
of boarding at each stop and twelve seconds of travel. Signs and a nearby status
prompt explain boarding; walk inside when the doors open. Multiple players and
bots ride the same car. The host carries passengers, refuses movement out of a
moving cabin, and releases them at a stopped car. Closed landing doors block
entry when the car is elsewhere. AI navigation includes explicit lift edges and
walks the real approach and exit; it does not invent stairs or teleport to roofs.
Crouched passengers stand when boarding. Death, respawn and reset clear carriage.

Two Gardens staircases now spiral around the north and south Supertree trunks,
with purple radial brackets, gold handrails, tangential landings and bridges into
the existing canopy circuit. Angular walk surfaces follow the curved treads;
player and bot movement use the same collision. The Flyer access is unchanged.
All of these are authored gameplay adaptations, not surveyed building interiors.

Validation includes full-width stair/landing clearance, ground-to-objective
navigation, actual rendered support faces, shared lift boarding/return/reset,
AI objective approach/ride/exit, and real FPS-engine player ascent/descent and
spiral traversal. `pnpm test:marina:access` uses Vite on 5224 and Chrome remote
debugging on 9384 (override `FPS_APP_ORIGIN` / `FPS_CHROME_ORIGIN`). The fixture
also has a `?render` review mode. Local receipts are in `.cache/marina-access/`.

Lift structure and stair details use instancing. Small façade seam adjustments
avoid hundreds of unique meshes from coplanar-face partitioning; the final Marina
scene stays within its existing scene-child budget. Verticality diagnostics now
include explicitly authored lift service and collision-checked intermediate
points at curved landings, without counting those points as additional floor area.
