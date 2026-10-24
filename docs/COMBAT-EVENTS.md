# Combat events: design

Status: **step 1 is built**, for the open world (expedition) and the solo
arena: the core, the shared blast resolver, the director, **artillery**, and
**troop transports** that bring fallen patrols back by road or air. Air raids,
helicopter raids, the range adapter and LAN remain proposals. Each section
below says which it is.

[Back to README](../README.md)

Combat events are scripted, telegraphed hazards that happen *to* a match rather
than being fought by it: an air raid, a helicopter raid, an artillery barrage,
and later mortars, drone strikes or a supply drop. They are not the same thing
as [world events](WORLD-EVENTS.md), which are weather and celebrations and never
touch damage. The name `combat-events` keeps the two apart.

## What the framework has to respect

The design is shaped by four things the codebase already does:

1. **The host owns damage.** `arena-rules.ts` is the only place an arena actor,
   bot or vehicle loses health, and LAN guests only render snapshots. An event
   that hurts anyone has to run inside that simulation, on the host, and reach
   guests as validated snapshot data (`validArenaSnapshot`).
2. **There are two damage paths.** The range (`fps-engine` with no `arena`) is
   local: `hurtPlayer`, `damageTarget`, `vehicles.damage`. The solo arena, LAN
   arena and expedition (a solo session under the hood) all go through
   `createArena`. Events need one pure core and two thin adapters.
3. **Extensions are registries of statically imported plugins.** Arena roles
   (`registerArenaRole`) validate stats on registration and freeze the plugin.
   Events should look the same, so a fourth event is a new file, not an engine
   change.
4. **Effects are pooled, bounded and never stop a ray.** Everything world-space
   carries `userData.fpsEffect`, has a fixed pool, and is trimmed by reduced
   effects. Event visuals follow the same rules; the one exception is a raid
   helicopter, which is meant to be shot.

## Shape

```
combat-events.ts        types, registry, seeded PRNG, payloads, transport poses (pure)
combat-event-catalog.ts artillery, transport-land, transport-air (pure)
combat-director.ts      when a strike starts and where; where a transport drops (pure, seeded)
combat-blast.ts         blast falloff + stance, shared with vehicle wrecks (pure)
combat-event-visuals.ts shells, fire, smoke, craters, rings, truck, helicopter, ropes (three.js, pooled)
combat-event-audio.ts   whistle, boom, alert, engine/rotor (WebAudio, synthesised)
```

All six exist. Air-raid and helicopter-raid registrations do not yet.

Integration touches `arena-rules.ts` (host step + snapshot), `arena-runtime.ts`
(snapshot validation, visuals), `fps-engine.ts` (range adapter, HUD, shake,
radio), `FpsMinimap.tsx` (danger zones), `world-zones.ts` (per-district event
tables) and `EnvironmentControls.tsx` (frequency setting).

### 1. An event is a descriptor plus a pure timeline

The key decision. A running event is a small, serialisable **descriptor**:

```ts
interface CombatEventDescriptor {
  id: string;            // unique per match
  kind: string;          // registry id: 'artillery', 'air-raid', ...
  seed: number;          // drives every random choice in the timeline
  start: number;         // simulation `elapsed` when the warning began
  target: { x: number; z: number };
  heading: number;       // approach bearing for flyers / barrage axis
  intensity: number;     // 0.5–2, from the director
}
```

and the plugin turns it into a **timeline** with a pure function:

```ts
interface CombatEventPlugin {
  id: string; name: string; description: string;
  /** Seconds of warning before the first payload may land. Enforced, not advisory. */
  warning: number;
  /** Hard ceiling on the event's length, used for validation and cleanup. */
  duration: number;
  /** Radio/HUD copy for the warning phase. */
  announce: { radio: CombatRadioEvent; banner: string };
  /** Pure: same descriptor in, same payloads out, on host and guest alike. */
  timeline(event: Readonly<CombatEventDescriptor>, world: Readonly<CombatWorld>): CombatPayload[];
  /** Optional live behaviour for events whose actors can be shot (raids). */
  raider?: RaiderSpec;
}
```

Because the timeline is a function of the descriptor, the host sends guests
only the descriptor — a few numbers per event — and both sides compute the same
shells, bombs and flight paths. Guests render what the host will resolve,
without a stream of per-shell messages. Snapshot growth is bounded by the event
cap (see budgets), and `validArenaSnapshot` checks each descriptor the way it
checks actors: registered `kind`, finite numbers, target inside bounds, `start`
within `duration` of `elapsed`.

`CombatWorld` is what a timeline may read: bounds, obstacles, the sector list
from `zone-sectors`, and the flight ceiling derived from `flightObstacles`. It
never sees actors, so a guest with a stale actor list still computes the same
timeline.

### 2. Payloads are a small vocabulary

Every event is built from a handful of primitives, each with a fixed time:

| Payload | Fields | Resolved by host as | Rendered as |
| --- | --- | --- | --- |
| `transport` *(built)* | entry, drop, exit, enter/arrive/depart/leave times, cruise/hover heights, `land` or `air` | nothing | truck or helicopter posed by `transportPose`, engine/rotor sound, ropes and downwash |
| `insert` *(built)* | slot, point, time | brings back the bot booked into that slot | a trooper sliding down the rope just before |
| `flyer` | path (3–5 points), speed, model (`jet`, `helicopter`, `drone`), altitude | nothing (unless it is a raider) | model along a spline, flyover audio, shadow |
| `munition` *(built)* | impact point, landing time, flight time, descent direction, `blast` or spotting `smoke` | a blast where its path first meets the rendered world | falling shell streak, whistle 1.2 s before impact |
| `blast` | point, radius, damage, minScale, vehicleScale, `overhead` | `resolveBlast` (below) | flash, debris, dust, crater decal, shake, boom |
| `strafe` | from, to, start, duration, rounds, damage, spread | a sequence of rays or small blasts along the line | tracer line, dirt kicks |
| `marker` *(built)* | point, radius, colour, from, until | nothing; bots run out of it | pulsing ring on the ground, HUD banner (minimap ring not yet) |
| `raider insert` | point, roles[], time | temporary bots (`addPlayer` path) | fast-rope from the raider |

A plugin is just an arrangement of these. New events rarely need a new
primitive; if one does, the primitive is added to `combat-events.ts` with its
own resolver and renderer, and every event can then use it.

### 3. Lifecycle

```
scheduled ──► warning ──► active ──► aftermath ──► done
            (siren,      (payloads   (smoke,       (descriptor
             radio,       land)       craters       dropped from
             markers)                 linger)       snapshot)
```

- `warning` lasts at least the plugin's `warning`. Registration rejects a
  timeline whose first damaging payload is earlier than `start + warning`, and a
  test enforces it for every catalog entry: **nothing hurts before it has been
  announced.**
- `active` ends when the last payload resolves, or when a raider is destroyed
  or leaves.
- `aftermath` is visual only (smoke columns, craters) and costs the host
  nothing.

### 4. Blasts: one resolver for everything that explodes

`damageHull` in `arena-rules.ts` already does a blast: linear falloff from
`vehicleBlastDamage`, a line-of-sight check against boxes and rendered cover
(`clearBlast`), crew killed outright, chained hull damage. Extract it:

```ts
function resolveBlast(blast: Blast, cause: DamageCause): BlastResult
```

- falloff via `splashScale(distance, radius, minScale)` from `fps-rules`;
- occlusion via `worldWallDistance` + the arena's `cover` ray, so a wall between
  you and the shell protects you, which is the point of taking cover;
- `overhead: true` for anything falling from the sky also tests a vertical ray
  from the target up to the blast height, so being indoors, under a void deck
  or under an MRT viaduct protects you from bombs (the atmosphere's roof grid
  answers the same question for rain and can be shared);
- vehicles take `damage * vehicleScale`; crew follow the existing rule;
- prone halves blast damage, crouch takes 0.8 — stance should matter here as
  it does for recoil.

Vehicle wrecks then call the same function, which removes a duplicate.

The range adapter calls the same pure falloff/occlusion code with its own
callbacks: `hurtPlayer`, `vehicles.damage`, `damageTarget`.

### 5. Attribution

`hurtActor` takes an optional attacker. Events pass a `cause` instead. *Built
as a plain string (`hurtActor(victim, damage, undefined, 'Artillery')`); the
typed form below is for when a player can call fire support:*

```ts
type DamageCause = { kind: 'actor'; id: string } | { kind: 'event'; event: string; caller?: string };
```

The feed reads "Artillery killed Assault Orchid". Event kills credit nobody and
do not count toward `ARENA_KILL_LIMIT`, so a barrage cannot end a match. A
`caller` is reserved for player-called fire support later (an armory quick item
that calls a mortar), which *would* credit the caller.

### 6. The director: when and where

`combat-director.ts` is a pure, seeded scheduler stepped by the host:

```ts
createCombatDirector({ table, frequency, seed, world }).step(dt, view) → CombatEventDescriptor | null
```

**When.** A per-mode table lists eligible kinds with weights and cooldowns. The
director keeps a pressure meter that rises with time and falls when an event
fires, so frequency is "about one every N minutes" without a fixed clock.
Global rules:

- nothing in the first 45 s of a match or within 20 s of the local player's
  respawn;
- at most one major event (air raid, helicopter raid) and one minor event
  (artillery, mortar) at once;
- per-kind cooldown, so two air raids are never back to back;
- `frequency: 'off' | 'occasional' | 'frequent'` from the setting.

**Where.** Targeting policies are shared, so plugins say *which*, not *how*:

| Policy | Picks | Used by |
| --- | --- | --- |
| `hotspot` | the cell where actors have dwelt longest (a coarse heat map the director keeps from actor positions) | artillery: punishes camping, rewards moving |
| `sector` | a named sector from `zone-sectors` | air raid over a recognisable area |
| `crossing` | a straight line across the playable bounds through a chosen point, clipped to bounds | air raid run, strafing |
| `near-player` | a point 25–60 m from a random human, never closer | helicopter raid orbit |

Every policy then applies the fairness filters: no target within 15 m of a
spawn point, no first impact within 10 m of any human (bracketing), and the
target must be on the playable side of `bounds`.

**Expedition.** `WorldZone` already carries `risk`. Add an optional
`combatEvents` table to it, so Tuas or Changi favour air raids, Bukit Timah
favours artillery, and low-risk zones get none, with intensity rising with
`risk`. Districts without a table fall back to the risk default.

### 7. The events

**Troop transports** (built). Reinforcements are what make respawning
believable. With `ArenaEnvironment.reinforcements` (every expedition district
sets it), a bot that falls does not reappear at a spawn point after 3 s. It
waits. A transport is booked when two bots are waiting, or one has waited
`REINFORCEMENT_WAIT` (6 s), and only one transport is on the road at a time
(a debug ride counts). A truck seats eight and a helicopter six
(`REINFORCEMENT_SEATS`, capped by `MAX_TROOPS`).

Rides also grow the district. Empty seats are filled with fresh troops while
a side is below its headcount. In expedition districts that headcount comes
from faction heat ([factions](FACTIONS.md#heat)); elsewhere it is
`ArenaEnvironment.population`, which defaults to the starting garrison so only
the fallen come back. With nobody waiting, a top-up ride goes out no sooner
than the side's top-up interval (heat's, or `REINFORCEMENT_TOP_UP`, 20 s)
after the start or its last ride. A recruit is held in reserve, dead and out
of snapshots, until its seat is called, so it first appears stepping off the
transport. Each side runs its own rides, one on the road at a time; a friendly
ride carries `faction: 'forces'` and the HUD calls it a FRIENDLY TRUCK or
HELICOPTER. A match holds at most `MAX_ARENA_BOTS` (20) bots, and `reset()`
goes back to the starting garrison. A full truck unloads in two files, one
down each side. Concurrent events are capped per kind, three transports and
three hazards, so a busy road never holds back a barrage; `MAX_COMBAT_EVENTS`
(6) bounds the total including aftermath.

`planTransport` chooses the drop
from the district's patrol spawns: at least 45 m from every human, and
preferably within 120 m so the arrival can be seen. It then picks the ride:

- **Truck** (`transport-land`) when some straight street of at least 40 m
  leads into the drop. Sixteen bearings are sampled through the district's own
  `move` and vehicle solids, so water and buildings stop it. It drives in at
  11 m/s, slows into the drop, turns round while the troops get out of the
  side in a file, and drives back out the way it came.
- **Helicopter** (`transport-air`) when nothing overhead blocks a hover. It
  comes in at 55 m, drops to a 9 m hover, and fast-ropes the troops down
  either side, then climbs out over the drop.
- When both are possible it is a coin toss. When neither is, it tries again
  5 s later. A bot left waiting `REINFORCEMENT_FALLBACK` (45 s) walks back in
  at a spawn point as before, so a district with no reachable drop still
  refills.

Each trooper is a real bot, fallen or recruited, set down at its `insert` time and place,
facing the nearest player. The transport itself is drawn but cannot be shot
yet (it carries `fpsEffect`, so it stops nothing either). The banner and comms
log say "BLACK KITE TRUCK INBOUND · REINFORCEMENTS · 90 m to your right": every
bot is a Black Kite contractor (see [factions](FACTIONS.md)).

**Artillery** (built)

- Warning 5 s: two alert tones, a countdown banner, a comms-log line saying
  where, and a pulsing red ring (24 m) on the ground. The minimap ring is
  still to do, and so is the voiced radio line (see Presentation).
- A spotting round lands 30–50 m off target (no damage, coloured smoke), a
  second adjusts to ~15 m, then fire-for-effect: 6–12 shells (by intensity) over
  8 s in an ellipse elongated along `heading`, ~10 m dispersion.
- Each shell: whistle 1.2 s before impact, blast radius 8 m, damage 140 at the
  centre to 20% at the edge, vehicle scale 1.5, crouch 0.8× and prone 0.5×,
  craters that fade over a minute. The host finds the impact by casting the
  shell's own path against the rendered scene, so a shell can burst on a roof
  or a wall face.
- Counterplay: leave the ring, or go prone behind hard cover.
- Variant for later: `creeping` moves the aim point along `heading` each salvo.

**Air raid** (major; proposal)

- Warning 10 s: district-wide siren (rising and falling tone), radio, banner
  "Air raid — get under cover", the run line on the minimap.
- 1–3 jets (`flyer`) cross the district along the `crossing` line at 120–160 m,
  above the derived flight ceiling, staggered 2 s apart.
- Each releases a stick of 4–6 bombs spaced 12 m along its track; bombs are
  visible for the last 2.5 s of their fall.
- Blast radius 12 m, damage 200, `overhead: true`: being under a roof is cover.
- Counterplay: get indoors or under a deck. This is the event that makes the
  verticality work pay off.

**Helicopter raid** (major, and the only one with a live actor; proposal)

- Warning 8 s: rotor sound growing from one edge, radio "Helicopter, bearing
  …", a bearing pip on the HUD.
- A hostile helicopter (`raider`) enters, flies to an orbit 30–40 m above a
  `near-player` point and circles for up to 60 s.
  - Its door gunner strafes the nearest visible human in telegraphed bursts:
    a 1 s tracer "walk-in" before damage, then a 1.5 s burst. Sight uses the
    same cached cover check bots use (`clearSight`).
  - It may `insert` 2–4 temporary bots by fast rope (existing roles,
    `temporary: true`: they do not respawn and leave the actor list when the
    event ends). The actor cap of 14 still holds; inserts are trimmed to fit.
  - It is a real target: 900 health (the player helicopter's value), hit by the
    existing `vehicleRayDistance`, destroyed with the existing wreck blast.
    Killing it credits the shooter and pays a bounty in range/expedition.
  - It leaves after the orbit time or below 25% health, and is gone when
    destroyed.
- A raider is the only part of the framework with live state, so the snapshot
  carries `raiders: { event, x, y, z, yaw, health, gunYaw, gunPitch, firing }[]`
  next to the descriptor; the rest is still recomputed from the descriptor.
- Its path is planned above `flightObstacles` and never through a tower.

### 8. Bots

Bots should not stand in a barrage.

- **Built, simply:** a bot inside a warned or active ring (plus 2 m) runs
  straight out of it at 1.3× its speed, still firing if it sees someone.
- Proposed refinement: the director exposes `danger(x, z): number` (0–1) built from the active
  events' markers and remaining payloads.
- `stepBot` adds a repulsion term away from rising danger to the role's
  approach/strafe before clamping, and `ArenaRoleContext` gains `danger` so a
  role plugin can choose differently (a tank might hold, an assault bot runs).
- During an air raid, bots path to the nearest overhead cover using the
  navigator they already have.
- Bots target a raider when it is the nearest visible enemy.

### 9. Presentation

- **Visuals** (`combat-event-visuals.ts`): one pooled renderer reads the current
  descriptors and `elapsed` each frame. Fixed pools: 6 flyers, 32 munitions,
  shared blast particles (extending the `vehicle-effects` icosahedron pool or
  `fps-effects` debris), craters through the existing decal atlas (`crater`
  tile). All `fpsEffect`, all non-raycastable, except raider hulls.
- **Camera shake** by distance and blast size, in the same two-stage manner as
  recoil (impulse to a target that settles), capped, and off under reduced
  motion.
- **Audio** is synthesised with WebAudio in the engine's existing context: a
  siren from two oscillators, a whistle with a falling pitch, a boom delayed by
  distance / 343 m/s so far shells are seen before they are heard.
- **Radio**: new `EncikEvent`s (`artillery`, `air-raid`, `helicopter`,
  `all-clear`). `encik-registers.test.ts` requires every base line to have a
  recording, so new lines either ship with recordings
  ([audition](ENCIK-AUDITION.md)) or start as comms-log `system` entries with no
  voice until they are recorded.
- **HUD**: a warning banner with a countdown, a bearing pip for off-screen
  threats, and danger rings and run lines on `FpsMinimap`.
- **Touch**: no new controls; everything is information.

### 10. Settings and modes

| Mode | Runs events? | Who decides |
| --- | --- | --- |
| Range | Optional, off by default (like counter-fire) | local |
| Solo arena | Setting | local |
| LAN arena | Host's setting, carried in the snapshot | host |
| Expedition | Per-district table × setting | local |
| Walk/drive districts | No | — |

Today the only switch is **Random events** in Debug survival
(`FpsDebugSettings.combatEvents`, on by default, tab-local). It turns off the
director's strikes, not reinforcements. The same panel calls in artillery
35 m ahead, a truck or a helicopter, in solo modes only. The intended home is
still World conditions (`environment-settings.ts`), as
`combatEvents: 'off' | 'occasional' | 'frequent'`.

Director pacing by district risk (`COMBAT_PACE`), in seconds:

| Risk | First strike | Between strikes | Intensity (shells) |
| --- | --- | --- | --- |
| Low | 45–75 | 110–190 | 0.75 (7) |
| Medium | 30–55 | 75–140 | 1 (8) |
| High | 25–40 | 50–100 | 1.4 (10) |

The clock restarts in each district, because each one runs its own match.

## Budgets

- Concurrent events: 2 (one major, one minor). Descriptors in a snapshot: ≤ 4
  (including aftermath). Raiders: ≤ 1.
- Payloads per event: ≤ 48; blasts resolved per host tick: ≤ 8 (excess queue
  to the next tick; at 20 Hz this is invisible).
- Each blast casts at most one ray per actor and vehicle in its radius (≤ 16),
  plus one overhead ray when `overhead`.
- Visual pools are fixed at creation; reduced effects halves particles and
  disables shake and lingering smoke.

## Testing

Pure modules carry the weight, in line with the rest of `src/game`:

- registry: rejects bad ids, non-finite stats, and any timeline with damage
  before `warning` — run against every catalog entry over many seeds;
- determinism: the same descriptor gives identical payloads twice and across a
  JSON round trip (host vs guest);
- blasts: falloff, wall occlusion, overhead shelter, stance scaling, vehicle
  crew rule, single destruction under chains (the existing guarantee);
- director: no event in the grace period, cooldowns, caps, fairness filters
  (spawn and bracketing distances), `off` means never;
- snapshot validation: rejects unknown kinds, out-of-bounds targets, oversized
  lists, stale `start`;
- attribution: event kills credit nobody and never end a match;
- raiders: shot down by existing rays, leave at low health, inserted bots are
  removed with the event.

Built: `combat-events.test.ts` (registry, timelines, poses, validation, blast,
director, transport planner) and `combat-arena.test.ts` (warning-period
safety, attribution, a walled-in player against an open control, the
director's on/off switch, guest snapshot validation, a fallen bot returning
at its insert point, the 45 s fallback, and the unchanged 3 s respawn where
reinforcements are off).

`scripts/fixtures/combat-events.html` runs one event from its descriptor in a
small street scene for visual review: `window.show(kind, seconds, view)`, with
kind `artillery`, `transport-land` or `transport-air` and view `near`, `wide`
or `high`. `pnpm test:combat-events` drives a real expedition with the AI pilot
playing: a debug truck, helicopter and barrage must draw, craters must appear,
and a soak must see the director call a strike of its own.

## Build order

1. **Done.** `combat-events.ts`, `combat-blast.ts` (wreck blasts now use it),
   **artillery** and **troop transports** in the solo arena and expedition, with
   visuals, audio and debug triggers. The director and bot avoidance were
   pulled forward from step 2, so the open world runs strikes and
   reinforcements unattended.
2. Range adapter, a proper setting in World conditions, minimap rings, voiced
   radio lines, shootable transports.
3. **Air raid**: flyers, overhead shelter, siren.
4. **Helicopter raid**: raider state in the snapshot, door-gunner strafe,
   inserts, bounty.
5. LAN: descriptors and raiders in host snapshots, guest validation and
   rendering. Then per-district expedition tables.

Each step ships on its own and leaves the game playable with events off.

## Open questions

- **Tone.** These are air raids and shelling on recognisable Singapore
  districts. Framing them as an exercise — an OPFOR "live-fire exercise" with
  the Encik on the radio, blank-fire smoke, "simulated" in the feed — fits the
  game's NS voice and is gentler than depicting a real attack. That choice
  changes copy, not the framework.
- **Rewards.** Should surviving an event or downing a raider pay credits or XP
  in expedition and range?
- **LAN.** Ship events to LAN at step 5, or keep them solo-only?
- **Player-called support.** The `caller` field leaves room for a mortar or
  artillery quick item in the armory; is that wanted?
