# Field exchange, progression and FPS equipment

The Armory sidebar offers 31 permanent unlocks and four repeatable supplies: eight weapon variants across two platforms, five cosmetic finishes, four attachments, three carrying rigs, four insert choices and five vehicle wraps. All prices and stats are original arcade balancing. The prototype starts with 1,600 credits and 300 tokens. The explicit +250 demo-token button does not charge money. There is no checkout, expiry, rental or random purchase.

## Play loop

1. Enter any region’s FPS range and clear the eight targets. Each elimination earns 25 XP immediately, including kills in an unfinished exercise.
2. Completion earns `250 + round(accuracy × 100) + max(0, 100 − floor(seconds))` credits. Accuracy counts successful damage hits divided by shots, rather than kills divided by shots. Counter-fire adds 100 credits.
3. Completion also adds `200 + round(accuracy × 100)` XP, plus 100 XP in counter-fire. A fully cleared practice drill earns 400–500 XP in total, including its eight eliminations.
4. Level 2 begins at 300 XP, level 3 at 800, level 4 at 1,500 and level 5 at 2,400. The threshold for level `L` is `100 × (L − 1) × (L + 1)`, capped at level 50. Rank titles are Recruit, Operator, Specialist, Veteran, Elite and Legend.
5. Reaching a level unlocks purchasing, not ownership. Credits/tokens are still required. Tokens do not bypass level requirements. Previewing any item is free, even when locked. Buying and equipping are separate actions.

| Level | Newly purchasable equipment |
| --- | --- |
| 1 | Issued weapons/finish/rig, no inserts, soft armor |
| 2 | Ranger, Patrol, jungle/urban skins, precision optic, quick-change magazine, stabilizer, enhanced LBS, ceramic plates |
| 3 | Vanguard, gold skin, extended magazine |
| 4 | Orchid skin, Sentinel rig, Aegis ceramic inserts |
| 5 | Centurion |
| 6 | Marksman, Penetrator magazine |
| 7 | Bastion |
| 8 | Fragmenting rounds |

No additional item gates currently follow level 7; ranks and XP continue to level 50. Purchases, XP and equipped items persist under `blockplay.armory.v1` in local storage. Old saves without XP migrate to zero XP while retaining valid owned items. Malformed saves fall back to issued equipment; malformed fields and unknown item IDs are sanitized. Existing ownership remains usable. Clearing browser site data resets the profile.

## Weapon differences

| Variant | Damage | Magazine | Cycle | Reload | Recoil |
| --- | ---: | ---: | ---: | ---: | ---: |
| SAR issued | 36 | 30 | .120 s | 1.80 s | .018 |
| SAR Ranger | 39 | 30 | .126 s | 1.65 s | .016 |
| SAR Vanguard | 42 | 36 | .108 s | 1.53 s | .014 |
| Ultimax issued | 30 | 60 | .085 s | 2.50 s | .026 |
| Ultimax Patrol | 32 | 50 | .085 s | 2.10 s | .022 |
| Ultimax Centurion | 35 | 75 | .079 s | 2.10 s | .020 |

Targets alternate 100 and 115 health. Vanguard clears a 115-health target in three landed shots versus four for the issued SAR. Attachments modify reload, capacity, recoil, aiming FOV or movement. The quick-change and extended magazines share one slot, so one replaces the other. Unlocks fit both weapons, with equipment saved separately for each platform. Skin palettes change only materials. Variant accents and equipped attachment markers appear in the preview and viewmodel.

## Platform tiers

Each platform is a four-step ladder, and every weapon's description says where
it sits ("Tier 3 of 4 on this platform"), so the ordering is legible in the shop
without comparing stat rows.

| Tier | SAR 21 | Ultimax |
| --- | --- | --- |
| 1 | Issued, 36 dmg | Issued, 30 dmg |
| 2 | Ranger, 39 dmg | Patrol, 34 dmg |
| 3 | Vanguard, 50 dmg | Centurion, 40 dmg |
| 4 | Marksman, 58 dmg | Bastion, 50 dmg |

Each step shortens time to kill inside the drill, and the two premium tiers buy
a shot off the count outright: Vanguard drops a standard target in two hits at
close range, Marksman drops the tougher one in two. `armory-balance.test.ts`
asserts that time to kill never rises with tier and falls at every step.

## How a weapon is built

There is an attachment system behind every weapon; only the finished weapon is
sold. A variant's figures are not written beside its name, they are computed
from the hardware it is made of, so the shop can say which part is responsible
for which gain: the Vanguard's 50 damage is its match barrel's +14 on the
platform's 36, and the dossier says so.

`applyBuild` folds a variant's internal parts onto the platform. Numeric fields
add, `mobility` multiplies and `ballistics` replaces. Issued weapons have no
parts and are the platform itself. `armory-variants.test.ts` pins what every
weapon resolves to, so a change to a part that moves a figure fails there
first, and it holds that no weapon carries a hand-written `stats` block.

Internal parts take no attachment slot and are never sold separately. Premium
weapons additionally arrive with hardware that does fill a slot, which is then
fixed.

| Weapon | Fitted | Slot |
| --- | --- | --- |
| SAR 21 · Vanguard | Match trigger group | handling |
| SAR 21 · Marksman | Fitted 1.75x match scope, free-floated barrel and match trigger | optic, handling |
| Ultimax · Centurion | Reinforced feed tray and buffer | handling |
| Ultimax · Bastion | Heavy barrel, bipod and buffered carrier | handling |

Two rules keep this from being a downgrade dressed as flavour, and
`armory-state.test.ts` holds both:

- **A fitted part is never worse than anything buyable for its slot**, compared
  part against part on every modifier it could carry, and it must bring any
  trait a rival would have. Giving up the choice gives up nothing.
- **The magazine slot is never fitted.** It carries the ammunition traits, so
  taking it would cost a premium weapon its penetration and burst. Ammunition
  stays the open axis on every weapon, which is also what keeps a purchase
  worth making once the platform is bought.

An attachment already saved in a slot a new platform fits is suppressed rather
than erased, so it comes back when a platform without that hardware is equipped
again. Field and issued weapons keep every slot open: cheap guns are platforms,
premium ones are finished pieces.

## Range and hit zones

Damage is no longer a single number per weapon. `hitDamage` resolves each round
from the range it travelled and the zone it struck, and both the engine and the
shop dossier call it, so a purchased band cannot mean one thing in the range and
another on the item card. Results are rounded, so shots-to-kill breakpoints stay
predictable.

Falloff holds full damage inside `near`, interpolates linearly to `minScale` at
`far`, and holds that floor beyond it. Each target carries a second, smaller
collider above centre mass; a hit there multiplies damage by the weapon's
precision trait. The two colliders never overlap, so the nearest-surface rule
picks exactly one.

| Weapon | Full damage to | Floor at | Floor | Precision |
| --- | --- | --- | --- | --- |
| SAR 21 · Issued | 30 m | 90 m | 55% | 1.6x |
| SAR 21 · Marksman | 45 m | 130 m | 75% | 2.2x |
| Ultimax · Issued | 14 m | 45 m | 40% | 1.5x |
| Ultimax · Bastion | 24 m | 70 m | 60% | 1.9x |

Drill targets sit 12.0-30.3 units from the spawn, so the rifle's band does not
bite inside the range while the support weapon's does. Both paid variants are
strictly better than their platform's issued band at every distance.

Arena damage stays host-authoritative and unchanged: zones and falloff apply to
drills and expedition only until the arena resolves shots per tick. See
[the armory roadmap](ARMORY-ROADMAP.md).

## Travelling rounds

A weapon's `ballistics` gives a muzzle velocity and a downward acceleration.
Hitscan is the degenerate case, not a separate path: infinite velocity and no
drop collapse the arc to the single straight segment the engine has always
raycast, and an instant weapon never enters the in-flight list, so a hitscan
loadout costs exactly the one raycast it always did.

Anything with a finite velocity is stepped per frame and raycast segment by
segment, so it can be blocked in mid-air and arrives late. Falloff reads the
whole arc a round travelled rather than its final segment. Rounds in flight are
capped, and they share one batched draw rather than an object each.

| Weapon | Muzzle velocity | Drop |
| --- | --- | --- |
| Issued and Field variants | instant | none |
| SAR 21 · Marksman | 620 u/s | 9 u/s² |
| Ultimax · Bastion | 520 u/s | 12 u/s² |

At drill ranges the elite variants' travel time is a few hundredths of a second
and their drop is under a centimetre, so they stay a straight upgrade there; the
hold-over only becomes real across an expedition district. Velocity and drop are
catalog values: setting a variant's velocity back to `Infinity` makes it purely
instant again.

The AI pilot compensates. `PilotContact` carries the range to a target and the
observation carries the equipped ballistics, so the controller holds over by the
drop at that range and tests its firing gate against the compensated error
rather than the raw one. Both fields pass through the strategy whitelist, which
copies fields explicitly; a hitscan velocity survives JSON as `null` and is
restored to instant rather than rejected. With no drop the hold-over is zero and
the pilot behaves exactly as before.

Arena shots stay instant and host-authoritative.

## Penetration

A shot resolves every surface it passes through rather than stopping at the
first. Its damage decays once per surface, so a round that reaches a target
through cover lands for less than one that arrives clean, and a round that
lines up two targets damages both. The Penetrator magazine grants two surfaces
at 60% damage each; without it a shot stops at the first surface exactly as
before.

Thickness is not modelled: each intersected face spends one surface, so a solid
prop with front and back faces costs two while a thin panel costs one.
Fragmenting rounds add a burst where the shot stops: everything else within
2.2 m takes a share of the damage, full at the centre and 35% at the edge. The
target struck directly is excluded, having already taken the round itself, and
a round spent on penetration carries its reduced damage into its burst. A round
in flight carries its remaining budget and its decayed damage between frames,
so piercing works the same whether the shot was instant or travelling. The
arena host still resolves only the nearest surface.

## Supplies

Supplies are the shop's repeatable purchase. They are held by count rather than
unlocked once, so buying the same one again stacks it up to a carry limit of
nine, and spending one debits the saved profile. One sits in a quick slot and is
used with `G` or the HUD button.

| Supply | Restores | Price |
| --- | --- | --- |
| Ammunition pouch | 90 reserve rounds | 260 CR |
| Field dressing | 45 health | 300 CR |
| Spare inserts | 45 armor points | 380 CR |
| Trauma kit | full health and 60 armor | 90 TK |

Armor is restored only up to the protection the equipped inserts provide, and
reserve goes to the weapon in hand. Using one with nothing to restore reports
that and spends nothing. `resolveLoadout` carries the selected supply and its
count, so the shop, HUD and engine read the same selection everything else does.

## Carried weight

A rig and its inserts scale walking speed, and now also vertical reach and how
fast the sights settle, so protection is a decision rather than free points. The
heaviest combination gives up roughly 17% of its jump and 14% of its aim-in
speed; the premium inserts are lighter, so they cost less of both while
protecting more. An unencumbered loadout pays nothing.

The shop's armor dossier shows jump height and aim-in speed beside the armor
pool, so the trade is visible before buying.

## Breakpoint analysis

Damage alone does not tell you whether a purchase is felt: only crossing a
shots-to-kill threshold does. A tier that adds damage without removing a shot
reads as a spreadsheet entry, which is why `hitDamage` returns whole numbers.

`pnpm analyse:weapons` prints shots-to-kill and time-to-kill for every
purchasable variant across seven ranges, both health pools and both zones, and
says what each tier removes versus the tier below it on its own platform. Pass
`--json` for the raw rows. The analysis lives in `src/game/armory-balance.ts`
and resolves through the same catalog and `hitDamage` the engine fires through,
so it cannot drift from the game; the script only formats it.

By default it measures against the drill's two target pools. `--opponent <id>`
measures against a named one instead, `--list-opponents` shows them, and
`--plate <id> [--health N]` builds a hypothetical one wearing any catalog
insert. Armor is stepped through the engine's own `applyArmorDamage`, so
absorption and the moment the plates break are modelled rather than
approximated: against the Tank squad's 100 points at 65%, the issued rifle needs
seven hits where a bare drill target takes three. `--fine` samples every 5 m out
to 125 m for a smooth curve.

It reports two problems:

- **Dead buy** — removes no shot at any range. None currently exist, and
  `armory-balance.test.ts` fails if one appears.
- **Unfelt in the drill** — neither removes a shot nor meaningfully shortens
  time to kill between 12 and 30 m, so a player who never leaves the range
  cannot tell it apart from the tier below. None are in this state, and the test
  fails if one appears. Time to kill counts because it is what a player
  experiences; a faster cycle is felt even when the shot count is unchanged.

Run it after any damage, falloff or precision change.

The weapon dossier carries the same reading as a chart: damage against range for
the previewed weapon and the one already equipped, drawn over bands showing how
many hits each damage level needs against a stock 100 hp target. The bands are
the point, because a tier is only felt where the curve crosses into a lower one.
Hovering moves a crosshair and puts the values in the legend rather than a
floating tooltip, so nothing ever covers the lines. Bands too thin to label
collapse into a single floor.

The two series use validated categorical steps for the panel's dark surface
(worst-pair CVD delta E 26.8, normal-vision 31.8, both clear of the floors), and
identity is carried by a legend and an end-of-line label as well as by hue. A
visually hidden table gives the same numbers to a screen reader.

## Armor and counter-fire

The rig slot supplies reserve capacity; the insert slot supplies armor points and absorption. Enhanced LBS adds 60 reserve rounds per weapon at a 2% movement cost; Sentinel adds 90 without a movement penalty. A bare ILBV-inspired carrying rig has zero armor points.

| Insert | Armor | Absorption while available | Movement |
| --- | ---: | ---: | ---: |
| None | 0 | 0% | 100% |
| Soft | 35 | 45% | 98% |
| Ceramic | 75 | 65% | 94% |
| Aegis ceramic | 100 | 72% | 97% |

The optional counter-fire drill uses surviving targets with line of sight within 65 game units. A 0.7-second warning locks an aim point; move at least 0.75 units, clear the attacking target or break line of sight to avoid the shot. A hit deals 18 incoming damage. Armor consumes `min(remaining armor, incoming × absorption)` and health receives the remainder. At zero health, the exercise ends without completion rewards. Pause freezes damage and warning timing. Reset restores health, plates and ammo; owned plates never need repurchasing.

Real-world naming reference: [CMPB's issued-equipment page](https://www.cmpb.gov.sg/life-in-ns/saf/items-issued/) describes the iLBV's modular load carrying and support for armor inserts. [MINDEF's enhanced-equipment factsheet](https://www.mindef.gov.sg/news-and-events/latest-releases/02dec20_fs/) describes the LBS carrying system. Geometry is an original simplified interpretation. All damage, armor, mobility and capacity values here are fictional game statistics, with no real protection-rating claim.

## Announcements and mouse capture

Only target eliminations advance the chain. Eliminations within three seconds of the previous elimination produce Double Kill, Triple Kill, Multi Kill, Ultra Kill, Monster Kill, Unstoppable and Rampage. A longer gap restarts the chain. Pause freezes gameplay time; reset starts a new chain. Each callout shows a banner and synthesized stinger. An installed local English speech voice is used when the browser exposes one; otherwise the banner and stinger remain. The range sound toggle mutes both.

Desktop Enter/Resume requests browser pointer lock directly from the user click. Gameplay begins on successful capture, and cannot silently fall back to an unconstrained cursor. Escape releases the pointer and pauses. Browser/OS focus loss also pauses. Capture denial leaves the ready/paused screen and a retry message. Touch devices use drag-look and touch controls.

## Implementation and validation

- `src/game/armory-catalog.ts`: item definitions, prices, level requirements and modifiers.
- `src/game/armory-state.ts`, `use-armory.ts`: pure purchase/equip/reward rules, validated persistence, immediate state references to prevent repeated clicks charging twice.
- `src/game/progression.ts`: XP thresholds, rank names and timed elimination chains.
- `src/game/armory-visuals.ts`: shared procedural skins, accents, markers and rig/insert models. Preview resources are disposed on selection changes.
- `src/components/ArmoryShop.tsx`, `ArmoryPreview.tsx`: catalog, comparisons, preview and saved loadout.
- `fps-engine.ts`, `FpsGame.tsx`: snapshot the equipped loadout on entry. XP updates do not recreate the engine. Target health, ammo, handling, armor damage, rewards and callouts use that snapshot. Enter the Armory to change equipment for the next exercise.

75 unit tests cover purchase idempotency, level gates, validation, inventory, attachment slots, actual modified ammo/reload timing, health breakpoints, armor exhaustion, rewards, level boundaries and chain timing, alongside existing world/physics checks. Local Chrome checks cover buying/equipping, preview and skin rendering, persistence, narrow layout, armor damage/defeat/reset, XP/level-up, full drill completion, callouts, mouse confinement, denied capture, Escape/pause, renderer cleanup, no uncaught browser errors and zero map requests. The production build passes with pnpm 11.22.0; the existing Three.js chunk warning remains.

This is a local single-player economy, not an authoritative multiplayer inventory or real-money payment system. Actual mobile-device performance and voice availability vary by browser. No packages or release-age exemptions were added.

## Vehicles in the FPS session

Utility 01 is a driveable 4×4 at the starting promenade. Falcon 01 is a flyable helicopter on a nearby marked pad. Press **E** within interaction distance to enter. Vehicles use a chase camera with mouse free look; the same pointer lock and pause rules remain active. Dismount restores the weapon and preserves ammunition, targets, XP and the equipped loadout.

- **Car:** W/S accelerates or reverses, A/D steers, Space brakes. Maximum forward speed is 72 game km/h. Collision uses the rotating vehicle footprint with small movement steps. Brake below 2 game m/s to dismount.
- **Helicopter:** W/S cruises, A/D yaws, Space climbs, C/Ctrl descends, Shift boosts. Releasing lift stabilizes hover. Land on clear ground and slow down before dismounting. Altitude is capped at 120 game meters. Flight uses simplified obstacle volumes and a body clearance radius; roof interiors, rotor strikes and crash damage are not simulated. Water supports overflight but cannot be used as a landing zone.
- **Wraps:** Motor pool olive, Jungle patrol, Desert convoy, Arctic expedition and Black gold. Unlock once, then equip separately on the car and helicopter. They are cosmetic and use the same XP/level/purchase rules as other shop items.
- **Scope:** vehicles are transport inside the existing target exercise. There is no vehicle combat, fuel system, passenger networking or full flight simulator. Character damage in counter-fire continues to use the player's position rather than the chase camera.

`vehicle-rules.ts` owns movement, clearance and safe exit rules. `vehicle-models.ts` supplies original reusable models and wraps. `fps-vehicles.ts` owns the vehicle instances, pad, labels and transitions. `pnpm test:vehicles` covers shop wraps and the full car/helicopter entry, movement, pause, landing and dismount loop in isolated local Chrome.

## Immersive fullscreen

The Fullscreen toolbar button and F shortcut expand the existing FPS/vehicle session. Desktop play fills the display with the game and HUD; the toolbar returns when paused. Escape releases the captured mouse and pauses, and native browser fullscreen exits according to the browser's Escape behavior. The pause screen includes an explicit Exit fullscreen control. Unsupported/denied native requests fall back to a viewport-filling view with an explanatory notice. Exiting restores page scrolling. Touch controls remain available in immersive view.

`use-fps-fullscreen.ts` owns native/fallback state and cleanup. `pnpm test:fullscreen` verifies native entry, FPS/car play, F toggling, Escape capture release, session continuity, denial fallback, scroll restoration and renderer cleanup. These browser checks passed locally. The combined checkout rebased onto `2f27af2` passes all 75 tests and the production build.

## Planned work

Behavioral weapon traits, ballistics, penetration, consumables and the economy
sink are planned but not implemented. See [the armory roadmap](ARMORY-ROADMAP.md)
for the phases, their dependencies and the design decisions already taken.
