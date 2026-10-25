# Combat events: design

Status: **steps 1, 3 and 4 are built**, for the open world (expedition) and
the solo arena: the core, the shared blast resolver, the director, and twelve
events. They are **artillery**, **troop transports** (truck and helicopter),
**air raid**, **helicopter raid**, **mortar fire**, **loitering drone**,
**rooftop sniper**, **supply drop**, **smoke screen**, **tear gas** and
**blackout**. Still proposals: the range adapter, a World conditions setting,
LAN, raid inserts and bounties. Each section below says which it is.

[Back to README](../README.md)

Combat events are scripted, telegraphed hazards that happen *to* a match rather
than being fought by it: an air raid, a helicopter raid, an artillery barrage,
mortars, a drone, a sniper, gas, and one that helps, a supply drop. They are not the same thing
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
combat-event-catalog.ts every shipped event, registered on import (pure)
combat-director.ts      when a strike starts and where; where a transport drops (pure, seeded)
combat-blast.ts         blast falloff + stance, shared with vehicle wrecks (pure)
combat-event-visuals.ts shells, fire, smoke, craters, rings, truck, helicopter, ropes (three.js, pooled)
combat-event-audio.ts   whistle, boom, alert, engine/rotor (WebAudio, synthesised)
```

All six exist. The two crew roles an event can field (`mortar-crew`,
`overwatch`) are registered in `arena-roles.ts` as `eventOnly`, so they are
never a squad choice or a balance opponent. They wear the militia's khaki
rather than the squads' mercenary navy (`arena-factions.ts`).

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
| `flyer` *(built)* | straight line `from`→`to`, height, enter/leave, model `jet` or `cargo` | nothing | jet or cargo plane posed by `flyerPose`, jet roar |
| `munition` *(built)* | impact point, landing time, flight time, descent direction, `blast` or spotting `smoke`, `kind` (shell, mortar, bomb, canister), optional `launch` point | a blast where its path first meets the rendered world | shell streak or a falling bomb, whistle 1.2 s before impact, a thump at `launch` |
| `blast` *(built, inside munitions)* | radius, damage, minScale, vehicleScale, stance, `overhead` | `resolveBlast` (below); `overhead` leaves 20% to a body with a roof over it | flash, debris, dust, crater decal, shake, boom |
| `orbit` *(built)* | entry, center, radius, exit, enter/arrive/leave/gone | the raid helicopter's position, from `orbitPose`; its health and gunner are live | the dark helicopter, rotor sound |
| `crate` *(built)* | point, release/land/until, drop height | contested: a player who reaches it opens it, patrols that hold it 5 s carry it off | crate under a canopy, `cratePose` |
| `cloud` *(built)* | center, radius, from/until, `dps`, colour | blocks every line of sight through it; `dps` above zero hurts whoever is inside, past armour | billboard puffs; a screen overlay when you stand in it |
| `jam` *(built)* | from/until | nothing | the map shows static; at night the exposure drops |
| `presence` *(built)* | until | how long a crew, sniper or drone stays if nobody stops it | nothing |
| `marker` *(built)* | point, radius, colour, from, until | nothing; bots run out of a hazard's ring while it is live | pulsing ring on the ground and on the map, HUD banner |
| `raider insert` | point, roles[], time | temporary bots | fast-rope from the raider *(not built)* |

**Ending early.** A descriptor may carry `ended` (simulation time) and an
`outcome` (`downed`, `silenced`, `claimed`, `secured`, `detonated`,
`withdrawn`). `combatTimeline` then cuts its own timeline. Rounds already in
the air still land, nothing more is fired, the presence and markers stop, and
a raid helicopter's orbit turns for home from where it is. Guests get the same
cut from the same two numbers.

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
`REINFORCEMENT_WAIT` (6 s), and only one ride is on the road at a time. Each
ride carries up to `REINFORCEMENT_SEATS` (4). `planTransport` chooses the drop
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

Each trooper is a real, waiting bot, returned at its `insert` time and place,
facing the nearest player. The transport itself is drawn but cannot be shot
yet (it carries `fpsEffect`, so it stops nothing either). The banner and comms
log say "ENEMY TRUCK INBOUND · REINFORCEMENTS · 90 m to your right".

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

**Air raid** (built)

- Warning 10 s: a siren that wails through the warning and the run, a banner
  ("AIR RAID · GET UNDER A ROOF") with a countdown, an orange 40 m ring.
- One to three jets (by intensity) cross the target in parallel 16 m apart at
  140 m and up, 110 m/s, 2.2 s apart.
- Each drops a stick of five bombs spaced 12 m along its track. Bombs are drawn
  at about their real speed for the last 2.5 s of their fall.
- Blast radius 12 m, damage 200, vehicle scale 2, `overhead: true`. Anyone with
  something solid within 40 m above them (`roofed`: a roof, deck or viaduct, box
  or rendered mesh) takes 20% of what reaches them.
- Counterplay: get indoors or under a deck. This is the event that makes the
  verticality work pay off. Bots run out of the ring rather than for a roof.

**Helicopter raid** (built, except inserts and the bounty)

- Warning 8 s: the heavier rotor growing as it comes in, a countdown banner.
- A dark attack helicopter flies the pure `orbit` path. It comes in 220 m along
  the heading and circles 30 m round a point 6–16 m from a player. It holds a
  height (`altitude`) 18 m above every roof the host samples round the ring and
  at least 30 m above the ground. It circles for 32–56 s by intensity, then
  leaves. Both sides draw it from the descriptor.
- Its door gunner is live on the host. It belongs to nobody: it picks the
  nearest actor, player or patrol, it has a smoke-free line to (within 110 m) and walks tracers onto them for 1 s, which
  does no damage. Then it fires a 1.5 s burst at 10 rounds a second, 12 damage
  each with a 0.06 spread (about half land at orbit range), each round a ray
  that a wall, hull or body can stop. It pauses 2.5–4 s
  between bursts.
- It is a real target: 700 health, two spheres (body and tail) in the host's
  `resolveShot`. Below 25% it breaks off (`withdrawn`: its orbit turns for
  home). At zero it falls, and the feed credits the shooter ("Alpha downed the
  raid helicopter"), which counts toward the kill chain callout but not kills.
- The snapshot carries `raiders: { event, kind, x, y, z, yaw, health,
  maxHealth, state, aim, shots }[]`; a rising `shots` is a tracer to draw.
- Not built: fast-rope inserts and a bounty.

**Mortar fire** (built)

- The host picks a pit 55–125 m from the target and 40 m from every player,
  preferring one that cannot be seen from the target. Two `mortar-crew` bots
  kneel at it, hold their post, fire at whoever they can see (patrols fight
  them like anyone else), and hold fire until the 4 s warning has passed.
- Five to eight salvos of two rounds, 7 s apart, land inside an 18 m ring:
  radius 6 m, damage 110. Each launch thumps at the pit before the rounds land.
- Kill both crew and the event ends `silenced`. Rounds in the air still land,
  and the banner stops naming the crew's bearing.

**Loitering drone** (built)

- It flies in from 140 m back along the heading, at a height 10 m over the
  roofs round the target (at least 32 m above the ground), and circles 14 m
  round a point near a player, whining.
- From 1.5 s after its 6 s warning it looks for the nearest actor, player or
  patrol, it has a smoke-free line to within 80 m. It locks on for 1.6 s (rapid beeps, "DRONE LOCKED ON"
  banner). Lose it for a second and it goes back to circling. Then it dives at
  28 m/s, steering until 9 m out and then committing. It detonates on contact,
  within 1.6 m of a player, or at the point it was diving for: radius 6 m,
  damage 130.
- 30 health and a 0.75 m sphere: a burst of rifle fire brings it down, and it
  falls harmlessly. Unused after 60 s, it flies home (`withdrawn`).

**Rooftop sniper** (built)

- The host samples 48 points 45–95 m round the target. It slides each roof
  sample toward the target to the parapet, then takes the highest flat roof at
  least 5 m above the street with a clear line to the nearest actor there,
  and no more than 110 m (`OVERWATCH.reach`) from them. Whoever it watches can
  always shoot back: rifles carry 125 m. With no
  rendered scene, or no such roof, it takes a clear spawn 35–110 m away. One
  `overwatch` bot kneels there and holds it (`anchor`, and `ground` in the
  snapshot so the rig kneels on a roof the walk surfaces do not know about).
- Its scope glints (`aiming`) whenever it has a line, and it waits 1.4 s from
  first sight to first shot: 68 damage, 0.006 spread, 2.4 s between shots. It
  holds fire through its 3 s warning, leaves after 80 s, and ends `silenced` if
  killed (90 health, no plates). It appears on the map once it has glinted or
  fired.
- Patrols do not look for a sniper on a roof: only one it has shot (a `grudge`,
  8 s from the last hit) looks up and fires back. Otherwise every bot would
  spend the event staring at the skyline.

**Supply drop** (built; helps rather than hurts)

- A cargo aircraft crosses at 150 m and releases a crate over a point 35–90 m
  from a player. It sinks under a canopy for about 18 s and lies there until
  95 s, marked by a dashed green ring on the map.
- The first player within 2.8 m opens it (`claimed`). On an expedition that
  sets out a weapon rolled a tier up, a double ammunition kit and a medical kit
  (`expedition-loot` `supply`). Anywhere else it tops up ammunition, health and
  plates. Patrols with nobody in sight make for a landed crate; one that stands
  over it for 5 s carries it off (`secured`).

**Smoke screen** (built) and **tear gas** (built)

- Smoke: four canisters land in a line across the heading, 9 m apart, and raise
  8 m clouds from about 3 s to 38–42 s. Nobody sees through a cloud: bots,
  gunners, drones and snipers alike (`smokeBetween`), and a player standing in
  one gets a grey screen.
- Gas: three canisters round the target; 7 m clouds from just after the 4 s
  warning to 32 s, inside a 15 m ring. Anyone inside loses 7 health a second,
  once however many clouds overlap, and plates do not stop it (`piercing`).
  Bots leave the ring. The screen goes yellow and stings.

**Blackout** (built; no damage)

- A `jam` from 3 s to 48 s: the corner map and the district map show static and
  nothing on them, and the banner says COMMS JAMMED. At night (`lighting.shift`)
  exposure falls by up to half, so the district goes dark.

### 8. Bots

Everyone fights everyone, as patrols always have: an event's crew fights
patrols too, and raiders shoot whoever they see. Crew-mates leave each other
alone, and a sniper on a roof is only a target for someone it has hit.

Patrols with nobody in sight make for a landed supply crate, then for a fresh
wreck (a downed raid helicopter or drone, for 45 s), so one event draws a
crowd that becomes the next event's hotspot.

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
  threats, and danger rings and run lines on `FpsMinimap`. *Built:* an event
  more than 130 m away is news (an Intel line, a quiet notice banner, no alert
  tones) until it comes your way.
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
director's events, not reinforcements. The same panel calls in any event in
solo modes only. Area events land ahead of you: 35 m, smoke 25 m, a supply drop
30 m, a blackout on you. Hunters (helicopter raid, drone, sniper) come for you,
and a transport plans its own drop. The intended home is
still World conditions (`environment-settings.ts`), as
`combatEvents: 'off' | 'occasional' | 'frequent'`.

What the director picks from (`COMBAT_TABLES`, weight / cooldown in seconds):

| Risk | Table |
| --- | --- |
| Low | artillery 3/45, mortar 2/90, supply drop 2/150, smoke 1/90, drone 1/120, blackout 1/240 |
| Medium | artillery 3/45, mortar 2/90, drone 2/90, sniper 2/120, supply drop 2/150, smoke 1/90, tear gas 1/90, air raid 1/180, helicopter raid 1/180, blackout 1/240 |
| High | artillery 3/45, mortar 2/75, drone 2/75, sniper 2/100, air raid 2/150, helicopter raid 2/150, tear gas 1/90, smoke 1/90, supply drop 1/150, blackout 1/240 |

**The world, not just the player.** When the host offers `heat` (shots, kills
and blasts, warmed into 16 m cells that cool over 45 s) or `places` (the
patrol spawns), a share of events is aimed there instead of at a player:
70% in low-risk districts, 60% at medium, 50% at high (`COMBAT_WORLD_SHARE`).
Such an event lands within 15 m of a hotspot drawn by weight, or of a random
place when nothing is hot. A patrol firefight across the district draws fire
whether or not anyone is watching. The same fairness rules hold: nothing
damaging is aimed within 10 m of a player.

Only hazards hold the director up: a reinforcement truck, a supply drop or a
blackout running does not stop the next barrage. When the host cannot place
what it is handed (no perch for a sniper, no pit for a mortar) the director
forgets it and looks again 5 s later.

A plugin's `targeting` says where. `area` (the default) aims 25–80 m from a
player (or its own `range`), never with a damaging round within 10 m of a
player or gas within its radius plus 3 m. `player` aims 6–16 m from a player,
for events that hunt and carry their own warning. Per-district tables (the
`sector` and `hotspot` policies above) are still to do.

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

`combat-event-catalog.test.ts` covers every new timeline: purity, warning
before damage and gas, the air raid's sticks and ring, the mortar's launches and
its silenced cut, the orbit's path and early turn, the crate, smoke, gas and
jam. It also covers the descriptor's new fields and the full director tables
and targeting. `combat-arena-events.test.ts` runs them in the arena: roof
shelter, the mortar crew, the raid helicopter's warning, gunner and shoot-down,
the drone's lock, dive, line-of-sight loss and shoot-down, the sniper's perch,
glint and relocation and its blindness in smoke, the crate claimed and secured,
and gas through armour and bots leaving it.

`scripts/fixtures/combat-events.html` runs one event from its descriptor in a
small street scene for visual review: `window.show(kind, seconds, view)`, with
kind `artillery`, `transport-land` or `transport-air` and view `near`, `wide`
or `high` (artillery and transports only). `pnpm test:combat-events` drives a
real expedition with the AI pilot playing. A debug truck, helicopter and
barrage must draw, and craters must appear. Then every other event is called
once and must draw something (a pit, jets, a raider, a cloud, a crate, a
jammed map) and announce itself. Finally a soak must see the director call an
event of its own. `COMBAT_SMOKE_ONLY=mortar,drone` limits the second pass.

## Build order

1. **Done.** `combat-events.ts`, `combat-blast.ts` (wreck blasts now use it),
   **artillery** and **troop transports** in the solo arena and expedition, with
   visuals, audio and debug triggers. The director and bot avoidance were
   pulled forward from step 2, so the open world runs strikes and
   reinforcements unattended.
2. Range adapter, a proper setting in World conditions, voiced radio lines,
   shootable transports. *(Minimap rings are done: hazard rings, the supply
   ring and raider pips, hidden while jammed.)*
3. **Done.** **Air raid**: flyers, overhead shelter, siren.
4. **Done, except inserts and the bounty.** **Helicopter raid**: raider state in
   the snapshot, the door gunner. Built alongside it: mortar fire, the drone,
   the rooftop sniper, the supply drop, smoke, tear gas and blackout, with
   temporary event crews (`temporary`, `anchor`) and the `ended`/`outcome` cut.
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
