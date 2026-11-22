# Levolution: design

Status: **the engine and the first event are built** (2026-11-21): stage parts, the
`set`, `crush`, `dust` and `marker` steps, and the Tuas gantry collapse in Team
Deathmatch, Free for All and Hardpoint. Everything else here is still a proposal;
[What is built](#what-is-built) says exactly where the code differs from it.

[Back to README](../README.md) · related: [combat events](COMBAT-EVENTS.md),
[structures](STRUCTURES.md), [arenas](TEAM-ARENAS.md)

A Levolution event changes the map itself partway through a match: a route opens
or closes, cover appears or goes, the ground floods. It differs from a
[combat event](COMBAT-EVENTS.md), which passes over the map and leaves it as it
was. The map after the event must play differently, or it is only an effect.

## What is built

```
stage-parts.ts          parts and their named states; the one function that swaps colliders (pure but for capture)
levolution.ts           steps, archetype registry, bindings, resolve, stage-at-time, snapshot validation (pure)
levolution-catalog.ts   archetypes, registered on import: stack-topple, gantry-collapse, give-way, lockdown, substation
stage-props.ts          pieces a scene stands with one line: tree, canopy, shutters, substation
levolution-bindings.ts  which arena runs which archetype on which parts: container-yard
levolution-host.ts      host: triggers, the obstacle list, what changed
levolution-stage.ts     renderer: swaps a part's meshes, drops tagged meshes into place
```

**Adding an event to a map** is three edits and no engine work:

1. In the scene, wrap the piece in `kit.stage('id', { tags }, () => ...)` and author
   its other state beside it with `kit.stageState('id', 'state', () => ...)`, from
   the same position arguments. A mesh tagged with `stageFall` falls into place.
2. Add a line to `LEVOLUTION_BINDINGS` naming the arena, the archetype and the part.
3. Run `levolution.test.ts`. It builds the arena, resolves the binding, and checks
   every combination of settled events: spawns and patrol points clear, every
   spawn connected, every Hardpoint ring clear and reachable by both teams.

**Tuas, container yard: both gantries come down.** Scaled up on 2026-11-21 after the
owner found the first version (one stack losing its middle) too small to notice.
Two events, `container-yard-west` and `container-yard-east`, both `gantry-collapse`:

- Each rail gantry tips over across an apron, pivoting on one foot and slewing as
  it goes: the west one south, the east one north, so the two halves of the yard
  change the same way turned half a turn and neither team is favoured.
- The leg that swings up through the two stacks beneath takes their middles out.
  All four stacks end with a 6.4 m lane through them, rows stepping down 4, 2 and
  1 high with crates between (a mantle climb to the second tier, 5.4 m), and three
  containers and crates across the apron beyond.
- Where a gantry lies, its two near legs are 21 m chest-high barriers across the
  apron that a player can climb onto, with the end frames as pillars and the far
  legs, beam and trolley hanging overhead.
- Staged over three seconds after the warning: the gantry starts to go (nothing
  of it collides while it is in the air), the stacks burst at 1.5 s and 2.0 s, and
  it lands at 3 s. One bank of five dust clouds per gantry blocks sight for about
  a quarter of a minute (`collapse-dust`, an ordinary combat event the collapse
  starts, so bots, the screen overlay and guests all get it from existing code).
- Both start at 60% of the match, by the clock or by the leader's score towards
  the limit; the east one warns for nine seconds to the west's six, so the yard
  comes down west then east. Either goes early once blasts near it add up to 300.
- Warning: banner with a countdown, alert tone, a ring on the map, bots leave.
  Whoever is under a box or the gantry when it lands is killed, through armour,
  credited to nobody.
- The crane's working hoist is a clock-driven set piece (`district-set-pieces.ts`);
  it is tagged `userData.stagePart` so the stage view hides it with its crane.

**Twelve more maps (2026-11-22).** Each is one line in its scene, from a shared
piece in `stage-props.ts`, and one binding. The pieces are new props stood where
the arena's own layout gives them something to change, not existing scenery.

| Map | Event | Archetype | Piece | Where |
| --- | --- | --- | --- | --- |
| Bukit Timah | Rain tree falls south across the open middle | `give-way` | `stageTree` | (90, 56), 14 m |
| Upper Thomson | Rain tree falls across the cross street | `give-way` | `stageTree` | (-46, 19), 11 m |
| Jurong Lake | Rain tree falls across the north path | `give-way` | `stageTree` | (-90, -197), 12 m |
| Pulau Ubin | Rain tree falls north into the village crossing | `give-way` | `stageTree` | (-5, 126), 12 m |
| Chinatown | Roof over the east food street comes down | `give-way` | `stageCanopy` | (11, 80), 14 × 7 m |
| Woodlands | Lawn shelter comes down | `give-way` | `stageCanopy` | (112, 74) |
| Kampong Glam | Court awning comes down | `give-way` | `stageCanopy` | (120, 122) |
| Changi | Arrival garden canopy comes down | `give-way` | `stageCanopy` | (-215, -2) |
| Tampines | Shutters close the west ground concourse | `lockdown` | `stageShutters` | x 6 to 24.5 at z -35 |
| Geylang | Substation fails, lights out | `substation` | `stageSubstation` | (0, -77) |
| Little India | Substation fails, lights out | `substation` | `stageSubstation` | (-70, 73) |
| Yishun | Substation fails, lights out | `substation` | `stageSubstation` | (0, 24) |

- **Tree.** A fallen trunk is 1.05 m high: a player vaults it, a bot goes round.
  The crown beyond it blocks. Starts at 50% of the match or after 200 blast
  damage at its foot.
- **Canopy.** The overhead cover goes (so air strikes and rain reach); two roof
  panels lie on the ground as crouch cover and two posts stay as stumps.
- **Shutters.** Clock only, at 50%. Whoever is under them takes 40 damage and is
  pushed clear; nobody is killed. The east concourse and the raised court stay open.
- **Substation.** The kiosk burns out and the lamps, signs and windows go out for
  the rest of the match. **It only shows after dark.** By day nothing changes but
  the kiosk, so on the default Singapore clock it matters in evening matches only.
  Blast damage of 150 on the kiosk, or 50% of the match.

Two changes from the list agreed on 2026-11-21: Changi has a canopy instead of a
terminal lockdown (shutters across the east strip would have trapped a team's
spawns), and Jurong Lake and Pulau Ubin have trees instead of a bridge and a tide
(no bridge inside the Jurong arena; a tide needs the `water` step).

**Still to do:** Bishan, Orchard, Punggol, Toa Payoh, Katong and Sentosa (all
need `water`); HarbourFront's quay crane; and Queenstown, Raffles Place and
Marina Bay, whose scenes are hand-built and do not use the scene kit the shared
pieces are written for.

**Where the build differs from the proposal below:**

- **Steps.** `remove` and `place` are one step, `set`: a part takes a named state
  or none. `move` is a state whose group is tagged `stageTip` and animated by the view;
  a `set` step's `lead` draws a state before it is solid, so a thing is seen falling
  and kills only when it lands. `dust` raises a cloud bank and `light` puts the
  district's lights out. `water` is not built.
- **After-states are authored, not derived.** The fallen boxes are placed by the
  scene relative to the stack. Nothing chooses the fall direction by rule.
- **Triggers.** `blast` and `clock` only. No `interact`, `streak` or shot-damage
  trigger. A player who sets it off is named in the feed but not credited with
  the kills.
- **No match setting.** It runs in every match on a map that has a binding.
- **No ring on the ground**, only on the map.
- **Navigation.** When colliders change the host builds a fresh lazy navigator
  and bots replan. On Tuas that took about 60 ms in Node including 18 routes,
  for either state. Baked navigation is dropped after a change, which only
  matters once Expedition runs events.
- **Not updated after a change:** the baked sky-visibility and lamp light, roof
  detail, and vehicle collision buffers (arena matches have no vehicles).
- **Starting one by hand.** The debug panel has a Levolution button, but the
  panel is not shown in `/play` matches, so today it is reachable only where
  debug tools are mounted. `scripts/fixtures/levolution.html?area=container-yard&t=8.3&view=south`
  shows any moment of an arena's events (`view=high|south|north|west|east|lane`, no dust); `scripts/levolution-smoke.mjs`
  plays a real Tuas match until the clock starts it.

## Reviewing events in the debug view

Status: **step 1 of the build order is built** (2026-11-21): the timeline strip with
sound, arena dressing, and the ring, landing, dust and collider overlays. The rest
is a proposal. Before this an event could only be judged by playing a match to 60%
or by reading a fixture page on the development Mac. The design puts events on the [level review board](LEVEL-REVIEW.md), which already has
what a review needs: the built district held still under an orbit camera, pins on
real surfaces, drawn routes, areas and sightlines, verdicts, and cloud sync so
nothing depends on this host.

The board's 3D layout builds `region.build()`, and stage parts live in that
scene, so every state of every part is already there to show.

### 1. See it: a stage timeline on the 3D layout

A **Levolution** strip under the 3D layout, shown when the district has stage
parts:

- **Arena and events.** The district's arenas that have bindings, and their
  events as chips (`West gantry`, `East gantry`); select one, several or all.
- **Timeline.** A scrubber from the start of the warning to settled, with a
  tick at every step (`set`, `crush`, `dust`) and the phases labelled. **As
  built** and **Settled** jump to the ends; **Play** runs it at 1x, 0.25x or step
  by step. It drives the same `createStageView` the game uses, so the board
  cannot show something the match would not.
- **Arena dressing.** A toggle draws what a match adds to the district and the
  board does not otherwise build: the arena's bounds, both teams' spawns, patrol
  points, Hardpoint rings, match cover and barricades.
- **Parts.** A list of the district's stage parts and their states, including
  ones no event uses yet. Selecting one frames it and outlines its colliders.

### 2. Judge it: overlays computed from the same data the host uses

Each is a toggle, drawn without a depth test like the board's routes:

| Overlay | Shows | From |
| --- | --- | --- |
| Warning ring | where bots flee and the map ring is drawn | `marker` steps |
| Crush footprint | where standing at that moment kills, per step | colliders each `crush` step adds |
| Colliders | each state's boxes and turned footprints, with top heights | the part's obstacles |
| Walkable change | ground that opened (green) or closed (red) between two moments | `createVerticalMovement` sampled on a 1 m grid inside the arena |
| Climbs | tops a player can reach from the ground by mantles, and the rise of each step | `supportsTop` colliders |
| Dust | the cloud bank and how long it lasts | the `collapse-dust` timeline |
| Sight change | for a chosen standing point, what it could see before and after | the layout metrics' sight disc |

A **Checks** panel runs what `levolution.test.ts` runs, for the selected
combination of settled events, and lists each as pass or fail with the place:
spawns and patrol points clear, every spawn connected, Hardpoint rings clear and
reached by both teams, nothing that falls overlapping scenery or leaving the
arena, the two halves matching where the binding says they should. It also
prints the navigation rebuild time on this device. A failing check drops a pin
where it failed.

### 3. Discuss it: threads that know which moment they are about

A pin on a fallen container means nothing on the map as built. So a level
thread's anchor gains an optional stage:

```ts
anchor.stage?: { arena: string; events: string[]; t: number }   // which events were running, and the second
```

- A pin or drawing placed while the timeline is off **As built** records it.
  Selecting the thread restores the events and the moment, then the saved view.
- Stage threads are hidden when the timeline is somewhere else, with a count
  (`3 comments at Settled`), so the as-built board stays readable.
- The changed-geometry check runs in the thread's own stage.
- Like the rest of the anchor it is part of the immutable header, carried by
  **Copy AI brief** and the cloud CLI.

### 4. Propose it: an event before it exists

The agreed list has two dozen events not yet built. Each goes on the board as a
proposal first, pushed by the AI (the designer does not author proposals), using what the board already draws plus one grouping field:

```ts
thread.proposal?: { kind: 'levolution'; id: string; archetype: string; arena: string }
```

The AI pushes one group per event: an area for what comes down and where it
lands, a route for what opens, a sightline for what is cut, each *proposal*
tone, with the trigger and the reading in the thread text. The board lists
proposed events beside built ones in the strip and shows a group's drawings
together. The designer gives **Agree**, **Disagree** or **Needs rework** on the
group. Nothing is built before Agree. When it is built, the binding's id takes
the proposal's id, the group is marked built, and the same threads carry the
playtest verdict.

### 5. Play it: a match on demand

The debug panel's Levolution button already exists but nothing mounts it in a
match. Add **Play this event** to the strip: it opens a solo match of that
arena inside the debug workspace (`/debug?tool=arena&area=container-yard&mode=team-deathmatch&levolution=container-yard-west`),
where debug tools are mounted, and offers:

- start the event now, or in 10 s so there is time to get into position;
- spawn at a chosen point, taken from a pin on the board;
- restart the match, which puts the map back.

### What it touches

| Piece | Change |
| --- | --- |
| `DistrictReviewViewer.tsx` | the strip, the stage view, overlays; the scene stays still apart from the stage |
| `level-review.ts` | `anchor.stage` and `thread.proposal`, parsed and validated like `space` and `shape` |
| `district-review.ts` | overlay builders; pin attachment in a stage |
| `levolution-review.ts` (new, pure) | the checks, lifted out of `levolution.test.ts` so the test and the board run the same code |
| Worker and `scripts/level-review-cloud.mjs` | carry the two new fields. Deploy the schema before pushing data that uses it |
| `DebugApp.tsx`, debug workspace URL | an arena match by area and mode, with a named event |

### Build order

1. **Built.** Timeline strip with sound, arena dressing and the collider, ring
   and crush overlays (`levolution-review.ts`, `stage-review-audio.ts`, the strip in
   `DistrictReviewViewer.tsx`; `scripts/levolution-review-smoke.mjs`). Not in it yet:
   the parts list, and collider top heights as labels. Dust is drawn as domes, not
   as the game's particles.
2. Lit view: `createDistrictRenderer` extracted and used by the board.
3. `anchor.stage`, so comments can be left on a moment.
4. Checks panel, with the checks moved into a shared module.
5. Walkable change and climbs. Sight change last: it is the most work.
6. Proposals, then the first unbuilt event (the Geylang blackout) put up that way.
7. Play this event.

### Decided (owner, 2026-11-21)

- **Sound is on.** The timeline plays the alert, the thumps and the dust as the
  match would, through the board's existing mute.
- **The board shows the lit game, not a second renderer.** See below.
- **Proposals come from the AI only.** The board needs no tool for drawing an
  event's footprint by hand; the designer reads the group and gives a verdict.

### Lit view

The game has no single renderer to hand the board. Its look is assembled from
modules that each take a scene and a camera, and the walk and drive view
(`RegionGame.tsx`) already assembles most of them over an orbiting camera:

| Module | Gives | In the walk view today |
| --- | --- | --- |
| `world-atmosphere.ts` | sun and sky by hour, weather, haze, clouds, district look | yes |
| `world-occlusion.ts` | ambient occlusion and the water surface pass (refraction, caustics on Ultra) | yes |
| `world-night-lights.ts` | street lamps, lit windows, rooms behind glass, blackout | no, first-person modes only |
| `fps-sun-shadows.ts` | the camera-following sun shadow map | no, first-person modes only |
| post chain and grade | tone mapping and the per-hour grade | assembled inline in `fps-engine.ts` |

So the board gets a **Lit** switch beside Schematic and 3D layout that assembles
the same modules, with the existing World conditions control for hour and
weather. The assembly moves out of `fps-engine.ts` into one function,
`createDistrictRenderer(renderer, scene, camera, region)`, that the engine, the
walk view and the board all call, so the three cannot drift apart. That
extraction is the real work here and is worth doing for its own sake.

What stays out, because it belongs to a player's eye and not to the place: the
lens (flare, dust, rain on glass), the weapon and its lights, scopes, vision
devices, hit effects.

Limits to expect:

- The sun shadow map covers about 130 m round the camera. An orbit camera high
  over a district sees past that, so far shadows fade out as they do in play.
- A whole district lit from above costs more than a street seen from the
  ground. The board uses the saved graphics preset and falls back to 3D layout
  on a software renderer.
- A blackout can be judged here once the `light` step exists; a flood once
  `water` does. Neither step is built yet.

Build order changes: the lit view goes in after step 1 (timeline and
overlays), since the overlays do not need it and the extraction is the larger
job.

## The portability problem

Maps here are still being redrawn. An event written as "at (112, -40) remove this
box, add these six" breaks the first time the crane moves. So an event is split
into three parts, and only the smallest one knows about a map:

| Layer | Knows about | Lives in | Changes when a map is redrawn |
| --- | --- | --- | --- |
| **Stage ops** | collision, rays, navigation, snapshot, rendering | `stage-ops.ts` | never |
| **Archetype** | what happens and in what order ("a crane drops its load") | `levolution-catalog.ts`, one plugin each | never |
| **Binding** | which named parts of which map, and tuning | `levolution-bindings.ts`, per arena id | only if a named part is renamed or removed |

Bindings hold **no coordinates**. They name parts; positions, footprints and
heights are read from the built scene when the match loads.

### Stage parts: what a scene publishes

A scene marks the pieces an event may act on as it builds them:

```ts
kit.stage('gantry-crane', { tags: ['crane', 'overhead'] }, () => { /* build as usual */ });
```

`stage` records the meshes added and the `Obstacle`s pushed inside the callback
into `scene.userData.stageParts`, keeps them out of the shared static batches
(a part has to be hidden or moved alone), and derives its footprint, top and
bounds. The three hand-built districts get the same thing through a standalone
`stagePart(world, id, ...)`. A part costs nothing if no event uses it.

Parts may also be **places** with no geometry of their own: `kit.stageArea('canal',
footprint)` for a flood basin, `kit.stageLine('track', a, b)` for a rail line.

Moving, resizing or restyling a part needs no change to any event. Renaming or
deleting one fails `levolution-bindings.test.ts`, which builds every real arena
and resolves every binding against it (the way `zone-sectors.test.ts` guards
sectors).

### Bindings

```ts
{ arena: 'tuas-container-yard', id: 'crane-drop', archetype: 'overhead-drop',
  parts: { source: 'gantry-crane', load: 'crane-load', landing: 'north-apron' },
  trigger: [{ kind: 'damage', part: 'crane-load', health: 600 }, { kind: 'clock', at: .6 }],
  tune: { warning: 6 } }
```

Anything positional that the archetype needs and the parts do not give is
*derived by rule* (rubble spreads along the longest clear bearing from the
footprint; a flood rises to the lowest kerb of the basin), so it follows the map.
A binding may pin a choice relative to a part (`toward: 'north-apron'`), never in
world coordinates.

## Stage ops

Every archetype is an arrangement of these. Each op has one host resolver, one
collider change, one navigation change and one renderer.

| Op | World change | Plays as |
| --- | --- | --- |
| `remove` | a part's obstacles and meshes go | a wall or stack is gone: new sightline, new route |
| `place` | a prebuilt hidden part (rubble, a fallen span) becomes solid and visible | new cover, a ramp, a blocked lane |
| `move` | a part follows a pure pose to a new rest (gate, shutter, bridge deck, dropped load) | route opens or closes |
| `water` | a basin's water level rises or falls to a height | wading, swimming, drowned low routes, boats usable |
| `light` | lamps and windows in an area go out or come on | dark sector, NVG matters |
| `hazard` | existing combat payloads (`blast`, `cloud`, `marker`) at a part | the dangerous moment of the transition |

After-state geometry (rubble, the fallen span) is authored with the part, in the
same `stage` call, hidden until placed. Nothing is fractured at run time.

## An event is a descriptor and a pure timeline

Same contract as combat events, so it inherits host authority and LAN for free:

```ts
interface LevolutionDescriptor { id: string; binding: string; seed: number; start: number; cause?: string }
interface LevolutionPlugin {
  id: string; warning: number; duration: number;
  parts: Record<string, PartRequirement>;           // what a binding must supply, checked on registration
  timeline(event, resolved: ResolvedParts): StageStep[];  // pure: host and guest compute the same steps
  safe?(resolved, arena): string[];                 // archetype-specific reasons it cannot run on this map
}
```

Lifecycle: `armed → warning → transition → settled`. The snapshot carries the
descriptors and one `stage` bitset of settled events. A guest joining late
applies settled events at once with no animation.

### Triggers

BF4's were mostly player-made, and that is the better half. Each binding lists
one or more:

- `damage`: a part's weak points have pooled health on the host (shoot the load's
  cables, the dam gate). Credits the shooter in the feed and the match score.
- `interact`: E at a console, through the existing action prompt.
- `clock`: fraction of match time, as a fallback so most matches see the event.
- `streak`: a killstreak reward calls it (fits the new streak loadout).

Proposed default: one player trigger plus a `clock` fallback at 60% of the match.

### Rules every transition obeys

1. **Warned.** Nothing becomes solid, lethal or deep before `warning` has run,
   enforced on registration as for combat events. The affected footprint is
   ringed on the ground and the map.
2. **Nobody is entombed.** At commit, actors inside a footprint that becomes
   solid take the op's crush damage and survivors are moved to the nearest free
   standing point. Vehicles likewise.
3. **The map still works afterwards.** Checked by test for every binding, in the
   after-state: every spawn still connects to every other, no spawn or Hardpoint
   station is inside new solids or deep water, each station keeps at least two
   approaches. A binding that fails is not shipped; an archetype may instead
   declare a replacement station.
4. **One way.** Events do not undo within a match. `reset()` restores the map.
5. **At most two per map**, so a map has four states at most to validate.

## What it touches

- **Collision.** `world.obstacles` is already mutated at install and dispose by
  `installTeamArenaCover` and `installStructureLayout`; stage ops do the same
  mid-match, through one function that also bumps a `stageVersion`.
- **Rays.** `scene-graph-version.ts` already makes the gameplay ray index rewalk
  when a mesh is added or removed. `move` needs the moved part's bounds refreshed.
- **Navigation.** The hard part. [STRUCTURES.md](STRUCTURES.md) says layouts are
  static for a world's lifetime and navigators must be rebuilt. Arenas use the
  lazy planner, so the proposal is to build a second lazy navigator for each
  after-state at load and swap at commit, with bots replanning on `stageVersion`.
  Closed routes alone could use `plan`'s existing `extra` obstacles, but opened
  routes and new decks cannot. **Not measured:** the cost of a second navigator
  per state on the larger arenas.
- **Baked navigation** (expedition). A bake's signature covers one geometry.
  Expedition therefore waits for a later step: either a bake per stage state or
  lazy fallback after an event.
- **Baked light.** The sky-visibility field, the lamp light map and roof detail
  are built once. After a transition the field needs re-baking round the
  footprint (it already bakes in bounded 4 ms steps). Until that exists, v1
  events should avoid large changes in roof cover.
- **Snapshot.** Descriptors plus the bitset, validated in `validArenaSnapshot`:
  known binding for this arena, `start` within duration, bitset within range.
- **Bots.** Leave a warned footprint (existing ring-avoidance). A bot role may
  go for a `damage` or `interact` trigger when its side is behind.
- **Minimap.** Reads obstacles and water from the stage state, not the load-time
  copy.

## Modes

| Mode | v1 | Later |
| --- | --- | --- |
| TDM, FFA, Hardpoint (solo and hosted) | yes, host's setting | |
| Expedition | no | needs per-state bakes and state saved across district travel |
| Range, walk/drive | no | debug trigger only |

A match setting `Levolution: off / on` next to the existing match options; a
debug panel entry fires any binding on the current map.

## Candidate events

What to destroy is a tone question as much as a design one
([combat events](COMBAT-EVENTS.md#open-questions) left it open). Proposed line:
**infrastructure, weather and industry only.** No places of worship, no homes, no
named heritage buildings, and no building is brought down. A landmark may be
changed only under the rules in [Landmark events](#landmark-events).

These are candidates from what the scenes are known to contain. None has been
checked against its arena's bounds yet; that is the review-board step.

| Archetype | Ops | Maps it could bind to | What changes |
| --- | --- | --- | --- |
| `overhead-drop` | hazard, move, place | Tuas (gantry crane), HarbourFront (quay crane) | a container stack lands across an apron: long lane cut, new climbable cover |
| `flash-flood` | water, light | Bishan (the river park is built to flood), Orchard (boulevard), Punggol (waterway), Marina (garden edge) | low ground becomes wading or swimming; high routes and decks gain value |
| `stack-topple` | remove, place, hazard | Tuas (container alleys) | a wall of boxes becomes a ramp to the top row and opens an alley |
| `derailment` | hazard, place | Queenstown (viaduct train), Bukit Timah (rail approach), Punggol (LRT) | a stopped train becomes a long piece of cover and a raised walkway |
| `lockdown` | move | Orchard (mall canopies), Tampines (hub concourses), Changi (terminal edge) | shutters close one flank and open a service passage |
| `canopy-fall` | remove, place, hazard | Chinatown (Smith Street roof), Woodlands (shelters), Bishan (shade court) | overhead cover goes (air raids and rain now reach), debris cover below |
| `span-drop` | move, hazard | Sentosa (suspension bridge), Jurong Lake (garden bridge), Marina | a crossing is cut; the other route becomes the choke point |
| `substation` | light | any map, best at night: Geylang, Little India, Yishun | a sector goes dark until the match ends |
| `tide` | water | Sentosa (palm court to beach), Pulau Ubin (jetty), Changi | slower than a flood, timed: the beach approach comes and goes |
| `tree-fall` | place, hazard | Pulau Ubin, Upper Thomson, Jurong Lake, Bukit Timah (in a squall) | a trunk across a lane: vault-height cover, vehicles blocked |

`flash-flood`, `substation` and `tree-fall` can read the shared weather, so a
thunderstorm makes them likelier. That is free given the automatic conditions
are already the same on every peer.

### Landmark events

Two events on Marina Bay's landmarks, agreed with the owner on 2026-11-21 as worth
keeping on the list. A Sands tower collapse was considered and ruled out: it is a
hotel, with a room drawn behind every pane.

Rules for any landmark event:

1. **The cause is an accident, weather or mechanical failure**, never an enemy
   strike on the landmark. No bomb, missile or killstreak triggers one.
2. **Nobody is imagined inside.** The landmark is visibly closed and empty first.
3. **The structure stays standing.** A part fails; the building does not fall.
4. **It changes the fight.** A landmark event that only plays on the skyline is
   not built.

| Archetype | Ops | What happens | What changes |
| --- | --- | --- | --- |
| `pool-burst` | hazard, water | The SkyPark pool's edge fails. A waterfall comes down the tower face for the rest of the match and the ground below floods. | The promenade under Sands becomes wading depth; the waterfall is a moving sight screen; the SkyPark deck loses its water and gains a dry basin to fight in. |
| `wheel-drop` | hazard, move, place | The Flyer goes dark and stops, its capsules empty. The rim comes off the hub and settles on its side into the bay. | The fallen rim is a walkable arc from the shore out over the water, with the capsules as cover along it; the hub and service core stay as an overwatch point. |

Both use `clock` or weather as the trigger (a squall for the wheel, monsoon rain
for the pool), not `damage`, so no player brings a landmark down. `wheel-drop`
has a mild variant with no `move`: the wheel stops dark and one empty capsule
falls.

**Where they can run.** Both landmarks are in the Marina Bay district, so both
events can run in any mode that plays the whole district. Neither is inside the
small Garden pavilions slice that Team Deathmatch, Hardpoint and Free for All use
(x -57 to 58, z 58 to 117; the Sands lifts and SkyPark deck are near x 90 to 151,
z -18, and the Flyer's service core near x 180, z -165). The district is open
for a redesign, and the events are authored relative to the landmark so they
follow it wherever it ends up.

**Not yet in the scene.** The SkyPark is modelled as a planted combat deck
(`sands-skypark`) with no pool, so `pool-burst` needs the pool built first. The
Flyer's rim and capsules are a non-colliding set piece (`district-set-pieces.ts`)
turning on the world clock, while its service core, terminal and gantries are
solid; `wheel-drop` needs the rim as a stage part with an authored fallen state.

## Event list by district

One headline event per district, agreed as the working list on 2026-11-21.
Features come from the scene notes; exact placement on each map is still open.
**Bold** marks the first batch.

| District | Event | Archetype | What changes in the fight |
| --- | --- | --- | --- |
| Marina Bay | **Wheel drop**: the empty Flyer's rim settles into the bay | `wheel-drop` | A walkable arc over the water, capsules as cover |
| Marina Bay | Pool burst: the SkyPark pool fails down the tower face | `pool-burst` | Flooded promenade, a waterfall as a sight screen |
| Tuas | **Stack topple**: a wall of containers falls | `stack-topple` | An alley opens; the fallen boxes are cover and a climb |
| Tuas | Crane drop: the gantry crane drops its load | `overhead-drop` | A long apron lane is cut by new climbable cover |
| HarbourFront | Quay crane drop | `overhead-drop` | The gateway court's central crossing is blocked |
| Bishan | **Flash flood**: the river park fills | `flash-flood` | Low lawn becomes wading; the shade court is the dry high ground |
| Orchard | Boulevard flood in monsoon rain | `flash-flood` | The carriageway slows everyone; canopies become the fast routes |
| Punggol | Waterway surge | `flash-flood` | The channel banks drown; crossings become choke points |
| Queenstown | Stalled train: it stops on the viaduct with doors open | `derailment` | A raised walkway and firing line above the estate green |
| Bukit Timah | Tree fall across the rail corridor in a squall | `tree-fall` | Vault-height cover; the corridor's long sightline is broken |
| Upper Thomson | Tree fall across the cross street | `tree-fall` | Vehicles blocked; the route behind the houses matters more |
| Pulau Ubin | Tide: the jetty approach floods and drains on a timer | `tide` | The jetty route comes and goes |
| Sentosa | Span drop: the suspension bridge is cut | `span-drop` | One crossing left; the beach approach becomes the flank |
| Jurong Lake | Garden bridge drop | `span-drop` | The garden circuit stops being a loop |
| Changi | Terminal lockdown: shutters close | `lockdown` | One flank shuts and a service passage opens |
| Tampines | Hub lockdown: concourse shutters | `lockdown` | Ground routes close; the galleries become the way through |
| Chinatown | Canopy fall: the Smith Street roof panels come down | `canopy-fall` | Overhead cover goes; debris cover in the lane |
| Woodlands | Shelter collapse in a squall | `canopy-fall` | The lawn's dividing cover is rearranged |
| Raffles Place | Scaffold fall: hoarding comes down in the square | `canopy-fall` | The central spine is blocked; the arcades are the way round |
| Kampong Glam | Awning fall: street awnings come down in a squall | `canopy-fall` | Lane cover changes; nothing heritage is touched |
| Geylang | **Substation blackout** | `substation` | The lorongs go dark for the rest of the match |
| Little India | Substation blackout | `substation` | The arcade stays lit by shopfronts; side passages go black |
| Yishun | Substation blackout | `substation` | The courts go dark; the retail wings stay lit |
| Toa Payoh | Water main burst | `flash-flood` | The courtyard floods ankle-deep and a spray screens the centre |
| Katong | Water main burst in the street | `flash-flood` | The street-side rotation slows; the veranda route gains value |

Weakest entries: Raffles Place (assumes scaffolding we would add), Kampong Glam,
Katong and Toa Payoh, where the obvious features are heritage or homes.

## Build order

1. **Stage parts and ops** with `remove`, `place`, `hazard`; the binding test;
   debug trigger. Pilot: **Tuas `stack-topple`** (pure add and remove of solids,
   the simplest case, on a map made of boxes).
2. **Navigation swap** measured on Tuas, then the after-state validation test.
3. **`water`** with **Bishan `flash-flood`**: reuses Marina's swimming and the
   shared water surface, and exercises a non-box change.
4. **`move`** with **Tuas `overhead-drop`**; triggers `damage` and `clock`;
   snapshot and hosted matches.
5. Remaining maps, one binding at a time, each drawn on the review board first.
6. Expedition, light re-bake, `streak` trigger.

## Open questions

- **Tone:** is the "infrastructure, weather and industry" line right?
- **Trigger default:** player trigger with a clock fallback, or player only?
- **Hardpoint:** may an event move a station, or must events avoid them?
- **Pilot map:** Tuas first, or a map currently being redrawn (it is the better
  test of portability, and the worse first build)?
