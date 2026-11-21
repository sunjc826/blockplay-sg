# Levelution: design

Status: **proposal, nothing built.** Per-map events below are candidates; each one
goes on the [level review board](LEVEL-REVIEW.md) for a verdict before geometry.

[Back to README](../README.md) · related: [combat events](COMBAT-EVENTS.md),
[structures](STRUCTURES.md), [arenas](TEAM-ARENAS.md)

A Levelution event changes the map itself partway through a match: a route opens
or closes, cover appears or goes, the ground floods. It differs from a
[combat event](COMBAT-EVENTS.md), which passes over the map and leaves it as it
was. The map after the event must play differently, or it is only an effect.

## The portability problem

Maps here are still being redrawn. An event written as "at (112, -40) remove this
box, add these six" breaks the first time the crane moves. So an event is split
into three parts, and only the smallest one knows about a map:

| Layer | Knows about | Lives in | Changes when a map is redrawn |
| --- | --- | --- | --- |
| **Stage ops** | collision, rays, navigation, snapshot, rendering | `stage-ops.ts` | never |
| **Archetype** | what happens and in what order ("a crane drops its load") | `levelution-catalog.ts`, one plugin each | never |
| **Binding** | which named parts of which map, and tuning | `levelution-bindings.ts`, per arena id | only if a named part is renamed or removed |

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
deleting one fails `levelution-bindings.test.ts`, which builds every real arena
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
interface LevelutionDescriptor { id: string; binding: string; seed: number; start: number; cause?: string }
interface LevelutionPlugin {
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

A match setting `Levelution: off / on` next to the existing match options; a
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
