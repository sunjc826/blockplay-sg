# Armory roadmap: behavioral weapons and a deeper economy

Planned work on the equipment shop described in [ARMORY.md](ARMORY.md). Nothing
here is implemented yet. All values remain fictional arcade balancing.

## Design decisions taken

The shop sells **power on a strict ladder** and **behavior on a second axis**.
Those are orthogonal: each behavioral class gets its own strictly-better
upgrade path, so variety never costs the ladder anything.

| Decision | Rationale |
| --- | --- |
| Strict upgrades are intended | Pay-to-win is a design goal, not an accident. Elite really is better than Field. |
| No sidegrades, no downside-bearing items | Rejected: it contradicts the ladder. |
| No per-weapon upgrade points or mods | Rejected: upgrading means buying a new weapon or variant. One purchase concept, not two. |
| A weapon's figures are the sum of its parts | There is an attachment system behind every weapon; only the finished weapon is sold. A number in the shop is attributable to named hardware rather than written beside the weapon. |
| Premium weapons arrive pre-upgraded | Their fitted hardware justifies their numbers and fixes those slots, rather than being modded together from a parts bin. Never worse than what it blocks, and never the magazine. |
| No weapon condition or jamming | Rejected: no repair loop exists, and upkeep chores cut against a power ladder. |
| Ballistic stats are the preferred paid axis | Velocity, drop, penetration and precision are naturally strictly-orderable, so they need no balancing argument. |
| Expedition field loot is the prototyping sandbox | `expedition-loot.ts` grants temporary weapons that never touch the permanent profile. |

## Why the current system tops out

`resolveLoadout()` is a scalar fold. Every modifier in the catalog is a number
applied to one of six fields (`capacity`, `reload`, `recoil`, `recoilRecovery`,
`mobility`, `aimFov`). A closed set of six numbers is the entire expressive
vocabulary of the shop: an item cannot say it *behaves* differently, only that its numbers
differ. The fold stays, but it must also collect **traits** that the engine
reads at the point of use.

Second, the ladder stops. Twenty-seven items and no level gates past 5 mean
shopping ends once a player reaches level 5 with tokens. A pay-to-win economy
needs a sink, not a finish line.

## Constraints that shape the order of work

**Drill ranges are short.** Targets sit 12.0–30.3 units from `FPS_SPAWN`. At a
realistic ~900 u/s a round reaches the farthest target in 0.03 s — two frames —
and drops a negligible amount. Realistic ballistics are invisible in the range.
Velocities must be tuned arcade-low (roughly 250–450 u/s) for lead to read at
all, and drop and velocity mostly earn their keep in expedition and arena,
whose maps run 368×288 to 556×466 units with genuine sight lines. Long-range
ballistic weapons are therefore expedition gear, which is also a clean product
story.

**Arena damage is host-authoritative and synchronous.** `simulation.shoot()`
returns an `ArenaShot` consumed in the same tick. Travel time makes a shot
resolve later, so `shoot()` must register an in-flight round that the host steps
per tick, delivering hits through the existing `pendingHit` / `frame.hit`
channel. That changes *when* damage resolves, never *who* decides it. It is the
riskiest change here and goes last.

**The AI pilot does not lead or compensate.** `fps-pilot.ts` drives
`yawError`/`pitchError` to zero and fires when aligned. Under ballistics it will
systematically shoot low and behind, worsening the 5/8 stall already recorded in
the handoff. Compensation must land with the phase that introduces travel time.

**The VM is weak.** `firstVisibleHit` traverses the whole scene per shot today.
Per-bullet-per-frame multiplies that, and the Ultimax fires every 0.085 s with
pixel ratio already capped at 1.35 and shadows disabled. Cap concurrent rounds
and raycast a pre-filtered candidate list.

## Phases

Each phase is independently shippable. Files listed are the primary ones.

### Phase 0 — Trait and ballistics foundations *(landed)*

No gameplay change. `WeaponSpec` gains ballistic fields and a trait list;
`ResolvedLoadout` carries `traits` per weapon, collected by the same fold that
handles scalars. A new pure `fps-ballistics.ts` integrates an arc, where
`velocity: Infinity, drop: 0` degenerates to today's instant raycast and keeps a
fast path. Every shipped weapon ships at those degenerate values, so the phase
lands as a pure refactor with identical behavior.

Keeping resolution in `resolveLoadout` preserves the property that shop preview,
FPS engine, arena and expedition cannot drift apart.

*Files:* `fps-rules.ts`, `armory-state.ts`, new `fps-ballistics.ts`.
*Risk:* low. *Feelable:* no, by design.

### Phase 1 — Range matters *(landed)*

Wire ballistics into the solo path only: drills and expedition, arena still
instant. Add damage falloff (`hit.distance` is already in hand) and hit zones
with a precision multiplier (targets already carry a `hitZone` child). Tune
arcade velocities. Add two or three strictly-better variants whose selling
points are velocity, falloff onset and precision.

Deterministic arcs compose cleanly with the existing random dispersion cone:
`sampleShotSpread` picks a direction, the solver integrates it. No rework of
`weaponSpread` or `recordBloomShot`.

This is the first phase a player feels, and it needs no new art.

*Files:* `fps-engine.ts`, `fps-ballistics.ts`, `armory-catalog.ts`.
*Risk:* medium. *Feelable:* yes.

### Phase 1b — Pilot compensation *(landed)*

`PilotContact` gains target range and an aim-point offset so the bot leads and
compensates for drop. Ships with Phase 1, not after it.

*Files:* `fps-pilot.ts`, `fps-pilot-perception.ts`, `pilot-strategy.ts`.
*Risk:* medium. *Feelable:* only as the absence of a regression.

### Phase 2 — Splash *(landed, without self-knockback)*

A shot bursts where it stops, damaging everything else within a radius on a
linear falloff to an edge floor. The directly struck target is excluded, since
it already took the round itself.

Self-knockback and rocket-jumping were dropped at the owner's request. The
movement system is therefore untouched, and the trait carries a radius and an
edge floor only.

*Files:* `fps-ballistics.ts`, `fps-engine.ts`, `armory-catalog.ts`.
*Risk:* medium-high, mostly performance. *Feelable:* yes, strongly.

### Phase 3 — Penetration, reload kinds and optics *(penetration landed)*

Three cheap traits on the Phase 0 foundation:

- **Penetration** — continue through N surfaces with damage decay instead of
  stopping at the nearest. A small change to a small pure function, and a
  strictly-better paid axis.
- **Reload kind** — cancellable single-shell reload alongside magazine swap.
  `beginReload`/`advanceWeapon` are pure and already tested. Deferred rather than
  built: no shipped weapon is shell-fed, so it would be engine complexity and a
  mismatched reload animation in service of data nothing reads. It lands with a
  weapon that wants it.
- **Scope zeroing** — sights zeroed at a distance, with adjustable zeroing as
  the purchasable upgrade. `aimFov`, `opticMagnification` and the PiP reticle
  already exist. Still open, and it is not free: a zeroed sight already holds
  over, so the pilot must subtract the zero from its own compensation or it will
  double-count and shoot high.

*Files:* `fps-raycast.ts`, `fps-rules.ts`, `weapon-optics.ts`.
*Risk:* low. *Feelable:* yes.

### Phase 4 — Economy depth *(consumables landed)*

The missing sink, and the part that keeps the shop alive past level 5.

- **Consumables** — instant health, armor packs, extra reserve. Token-bought,
  consumed per run, repeat revenue, and behavioral because they change in-run
  decisions. Expedition already spawns and applies `medical` and `armor` loot.
- **On-kill traits** — heal, ammo or overheal on elimination. `shoot()` already
  detects `target.health === 0`.
- **Token trickle** — rare token drops from high-tier expedition crates and
  elimination milestones, giving free players a visible slow path. Tokens
  currently come only from `demoTopUp`. `profile.rewarded` already provides
  replay-safe dedupe.
- **Earned behavioral items** — gate one or two behind play conditions (clear a
  drill without reloading, three precision kills in a round) rather than credits.
- **Breakpoint tuning** *(measurement landed; rebalance open)* — `pnpm
  analyse:weapons` now reports shots-to-kill and time-to-kill per variant, per
  range, per pool, and names the tiers that remove no threshold. It found three
  tiers that are identical to the tier below them inside the drill: Vanguard,
  Marksman and Patrol. Deciding what to do about those is a balance call for the
  owner; the measurement and its guard test are in.

*Files:* `armory-catalog.ts`, `armory-state.ts`, `expedition-loot.ts`.
*Risk:* low-medium. *Feelable:* yes.

### Phase 5 — Slots and weight *(weight landed; third slot open)*

- **Armor weight** *(landed)* — rig and plate `mobility` now scale vertical
  reach and aim-in time as well as walking speed. The heaviest combination gives
  up roughly 17% of its jump and 14% of its aim-in; the premium inserts are
  lighter, so they cost less of both while protecting more.
- **Third weapon slot** — not built, and the tuple is not the reason. Two things
  stand in the way, and the second is the real one:
  1. `family` doubles as the slot index in 47 places across the catalog,
     `restoreProfile`, `equip`, `resolveLoadout`, `isEquipped`, the shop and the
     engine. Slots and platforms have to become separate ideas first, which
     means `GunEquipment` carrying which platform it holds.
  2. There are only two weapon platforms and two GLBs, so a third slot can only
     hold a second configuration of one already carried. Widening
     `ArenaRolePlugin.weaponIndex`, the arena host's `slice(0, 2)`,
     `PilotAction.weapon` and the strategy whitelist's `[0, 1]` check buys a
     duplicate weapon until a third platform exists.

  A cheaper unlock with the same "more capacity" feel is a **saved loadout
  preset**: a second configuration of the two weapons, switched in the shop. It
  uses the existing tuple and touches none of the arena, pilot or loot
  contracts. The owner decides which of the two to take.

*Files:* `armory-state.ts`, `armory-catalog.ts`, `fps-engine.ts`.
*Risk:* medium for weight, high for the slot. *Feelable:* yes.

### Phase 6 — Arena deferred resolution

Convert host shot resolution from synchronous return to stepped in-flight
rounds, bringing ballistics to multiplayer. Traits affecting damage evaluate
host-side; feel-only traits may stay client-side. Last, and alone.

*Files:* `arena-rules.ts`, `arena-runtime.ts`, `arena-roles.ts`.
*Risk:* high. *Feelable:* yes, in LAN play only.

## Answered: pay to skip the grind

The owner asked for it, and it landed as `purchaseLevel()` — but not as the
token surcharge proposed here. A surcharge would have unlocked one item early
and left `purchase()`'s condition to grow a second branch; buying the *level*
instead leaves that condition exactly as it was, and the gate keeps meaning one
thing. Tokens buy XP at a flat rate, so a level costs the gap it closes and
earning discounts it. See "Buying levels" in ARMORY.md.

## Sequencing summary

| Phase | Depends on | Risk | Player-visible |
| --- | --- | --- | --- |
| 0 Foundations | — | Low | No |
| 1 Range matters | 0 | Medium | Yes |
| 1b Pilot compensation | 1 | Medium | No |
| 2 Projectile class | 0, 1 | Medium-high | Yes |
| 3 Penetration, reload, optics | 0 | Low | Yes |
| 4 Economy depth | — | Low-medium | Yes |
| 5 Slots and weight | — | Medium | Yes |
| 6 Arena deferred resolution | 0, 1, 2 | High | LAN only |

Phases 3, 4 and 5 are independent of the ballistics line and can be picked up
whenever. Phase 6 should not start until the solo ballistic path has settled.
