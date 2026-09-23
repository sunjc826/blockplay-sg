# Field exchange, progression and FPS equipment

The Armory sidebar offers seventeen fixed weapon variants across five platforms, five cosmetic finishes, three carrying rigs, four insert choices, five vehicle wraps, repeatable food and field supplies, and a token-priced level skip. Weapon performance changes only by buying and equipping a complete variant. Optics, magazines, ammunition and handling hardware cannot be bought or swapped separately. All prices and stats are original arcade balancing. The prototype starts with 1,600 credits and 300 tokens. The explicit +250 demo-token button does not charge money. There is no checkout, expiry, rental or random purchase.

## Play loop

1. Enter any region’s FPS range and clear the eight targets. Each elimination earns 25 XP immediately, including kills in an unfinished exercise.
2. Completion earns `250 + round(accuracy × 100) + max(0, 100 − floor(seconds))` credits. Accuracy counts successful damage hits divided by shots, rather than kills divided by shots. Counter-fire adds 100 credits.
3. Completion also adds `200 + round(accuracy × 100)` XP, plus 100 XP in counter-fire. A fully cleared practice drill earns 400–500 XP in total, including its eight eliminations.
4. Level 2 begins at 300 XP, level 3 at 800, level 4 at 1,500 and level 5 at 2,400. The threshold for level `L` is `100 × (L − 1) × (L + 1)`, capped at level 50. Rank titles are Recruit, Operator, Specialist, Veteran, Elite and Legend.
5. Reaching a level unlocks purchasing, not ownership. Credits/tokens are still required. A level can be earned in the range or bought with tokens (below), but neither discounts the item behind it. Previewing any item is free, even when locked. Buying and equipping are separate actions.

| Level | Newly purchasable equipment |
| --- | --- |
| 1 | Issued weapons/finish/rig, no inserts, soft armor |
| 2 | Steady Lah, Route March, jungle/urban skins, enhanced LBS, ceramic plates |
| 3 | Garang, gold skin |
| 4 | Orchid skin, Sentinel rig, Aegis ceramic inserts |
| 5 | Encik’s Favourite |
| 6 | Own Time, Own Target |
| 7 | Fort Siloso |
| 8 | P30 Kopi O Kosong |
| 14 | FN MAG Chope |
| 16 | P30 Bo Bo CANNOT |
| 22 | CIS 50MG Tuas Shift |
| 24 | FN MAG Jaga Corner |
| 32 | CIS 50MG Merlion Roar |

Ranks and XP continue to level 50. Purchases, XP and equipped items persist under `blockplay.armory.v1` in local storage. Old two-platform saves gain the three free baseline classes without changing balances or existing selections. Unknown IDs are sanitized and retired attachments are discarded without refunds. Clearing browser site data resets the profile.

See [service-inspired classes](SERVICE-WEAPONS.md) for source references, controls, role tradeoffs and the new fixed variants.

## Rank insignia

What a level is *called* is a set, and there are four of them. The choice is
free — insignia is dress, not equipment, so nothing is bought and nothing is
gated — and it is saved with the profile under `rankSet`. The shop's INSIGNIA
row previews every set at the level you are, so you pick by looking at your own
badge rather than at an example.

| Set | Reads as | Ladder |
| --- | --- | --- |
| **Field** (default) | `Specialist` | Six unnumbered steps, Recruit to Legend. What the range always called you. |
| **Numerals** | `37` | No titles at all. The level number, in a badge that deepens every ten levels. |
| **Service** | `Corporal III` | Twelve graded ranks: chevrons, bars, diamonds, stars. |
| **Shadows** | `Marksman VI` | Gun silhouettes, sidearm up to crossed rifles. |

A set is a list of **bands** over the fifty levels, and two decisions keep fifty
badges cheap to define:

- **The emblem is a vocabulary, not a drawing.** `{ kind: 'star', count: 3,
  wreath: true }` is a rank. `RankBadge` generates the art — a star is polar
  arithmetic, three chevrons are one chevron three times — so a band is one
  line and no set needs fifty pictures.
- **Grades come from the band, not from more bands.** A band covering levels
  10–13 has four grades, so `Corporal II` needs no entry. `grade` picks how
  that reads: `roman`, `arabic`, the `level` itself, or `none` for a set whose
  titles stand alone.

`registerRankSet(set)` adds one at runtime, so a set can ship from anywhere
that knows the shape. Bands are sorted on the way in, a set that does not cover
level 1 is refused rather than left to resolve to nothing, and a profile naming
a set that is no longer registered falls back to Field instead of breaking.

Crossing into a new band is a promotion rather than a level: the range's
completion card reads `PROMOTED` on the level a band starts and `LEVEL UP`
inside one, from the same `promoted` flag.

The Encik notices too. His lines have registers keyed to your level — he stops
insulting you, then starts using your rank, then starts apologising for
speaking — and the shop's ENCIK row switches between that and the recorded
shouting he greets a recruit with. See
[Registers](ENCIK-VOICE.md#registers-he-defers-as-you-outrank-him).

**On drawing a wreath at 40 pixels.** Two attempts failed the same way and the
shape is worth keeping: a *stroked* wreath with tick-mark leaves aliases into a
bowl with rays, and any mark above it then reads as a pair of eyes over a
smile. Filled leaves fanned along a stem read as laurel at badge size, because
each leaf is a shape rather than two converging lines. A wreathed mark is also
scaled into the laurel's opening rather than laid over it.

## Buying levels

Levels are for sale as well as earnable. The control sits in the shop's
progression strip and buys the next level only — there is no jump to an
arbitrary one, so the climb is visible a step at a time.

**Tokens buy XP at one flat rate, and a level's price is the gap it closes**
(`XP_PER_TOKEN = 25`, floored at `MIN_SKIP_PRICE = 5`). Nothing is written
beside a level number, which gives two properties a price table would not:

- **Earning discounts the skip.** Standing halfway up a level halves what the
  rest of it costs, so playing and paying combine rather than competing. The
  strip's price falls as you shoot.
- **Higher levels cost more, without a second rule.** The gap from level `L` to
  `L + 1` is `100 × (2L + 1)`, so the price rises with it.

A bought level lands exactly on its threshold and opens at zero progress: you
are charged for the XP you were missing and credited with precisely that.

| Skip | XP gap | Price |
| --- | ---: | ---: |
| 1 → 2 | 300 | 12 TK |
| 2 → 3 | 500 | 20 TK |
| 3 → 4 | 700 | 28 TK |
| 4 → 5 | 900 | 36 TK |
| 7 → 8 | 1,500 | 60 TK |
| 1 → 8, from zero | 6,300 | 252 TK |

Level 8 is the last equipment gate, so 252 TK buys the right to purchase
everything in the catalog — less than the 340 TK Fragmenting rounds that gate
holds back, and less than the 360 TK Bastion behind level 7 (192 TK). That
ordering is deliberate: levels are a shortcut past the climb, not the sink.

Each item still costs its own price, a locked item's dossier names both the
XP and the token climb in front of it (`skipCostFrom`), and the breakpoint
report prints the same figure beside a tier's gate (`LV7 (+192TK)`), so the
true cost of reaching a weapon is legible rather than implied.

Level 50 is the ceiling and the control disappears there. XP bought this way is
XP like any other: it advances rank titles and persists in the same profile.

## Weapon differences

| Variant | Damage | Magazine | Cycle | Reload | Recoil |
| --- | ---: | ---: | ---: | ---: | ---: |
| SAR issued | 36 | 30 | .120 s | 1.80 s | .018 |
| SAR Steady Lah | 39 | 30 | .115 s | 1.65 s | .016 |
| SAR Garang | 50 | 36 | .105 s | 1.53 s | .0101 |
| SAR Own Time, Own Target | 58 | 36 | .100 s | 1.50 s | .0082 |
| Ultimax issued | 30 | 60 | .085 s | 2.50 s | .026 |
| Ultimax Route March | 34 | 50 | .080 s | 2.10 s | .022 |
| Ultimax Encik’s Favourite | 40 | 75 | .075 s | 2.10 s | .0148 |
| Ultimax Fort Siloso | 50 | 80 | .072 s | 2.00 s | .0119 |

Targets alternate 100 and 115 health. Garang clears a 115-health target in three landed shots versus four for the issued SAR. The dossier draws two charts: damage against range, over hits-to-kill bands, and the spray pattern of a twenty-round held burst, laid over the same target at 12, 20 and 30 m. Both simulate through the engine's own code — `hitDamage` and the recoil module — so the shop cannot advertise a figure the range does not produce. Each variant fixes its optic, magazine capacity, recoil, recovery and ammunition behavior. Skin palettes change only materials. Variant accents and built-in hardware appear in both the preview and viewmodel.

## Weapon names and flavour

Display names reflect each fixed configuration. Internal item IDs stay unchanged so existing saves and effect bindings continue to work. Flavour text appears separately from the gameplay description in the dossier.

| Weapon | Configuration | Flavour |
| --- | --- | --- |
| SAR 21 · BMT | Baseline 30-round rifle with integrated scope | Thirty rounds, an integrated scope, and strict instructions not to lose either. |
| SAR 21 · Steady Lah | Modest damage and handling upgrade | Same familiar rifle. A little more punch, a little less jump. Steady, lah. |
| SAR 21 · Garang | 50 damage, 36 rounds and quicker cycling | Hits harder, cycles quicker, brings six extra rounds. Volunteered before the briefing ended. |
| SAR 21 · Own Time, Own Target | Precision scope, long-range barrel and boosted headshot damage | The barrel is matched. The scope is set. For once, nobody is rushing you. |
| Ultimax · Sai Kang | Issued 60-round support weapon | Sixty rounds of section support. You looked strong, so this one became your problem. |
| Ultimax · Route March | 50-round drum, faster movement and reload | Ten rounds lighter. By the eighteenth kilometre, you will appreciate the difference. |
| Ultimax · Encik’s Favourite | 75-round drum and buffered recoil | Seventy-five rounds, a steady muzzle, and fewer interruptions. Encik approves. |
| Ultimax · Fort Siloso | 80-round drum, bipod and strongest support recoil control | Eighty rounds and a bipod. You have selected this position for a reason. |

## Platform tiers

Each platform is a four-step ladder, and every weapon's description says where
it sits ("Tier 3 of 4 on this platform"), so the ordering is legible in the shop
without comparing stat rows.

| Tier | SAR 21 | Ultimax |
| --- | --- | --- |
| 1 | Issued, 36 dmg | Issued, 30 dmg |
| 2 | Steady Lah, 39 dmg | Route March, 34 dmg |
| 3 | Garang, 50 dmg | Encik’s Favourite, 40 dmg |
| 4 | Own Time, Own Target, 58 dmg | Fort Siloso, 50 dmg |

Each step shortens time to kill inside the drill, and the two premium tiers buy
a shot off the count outright: Garang drops a standard target in two hits at
close range, Own Time, Own Target drops the tougher one in two. `armory-balance.test.ts`
asserts that time to kill never rises with tier and falls at every step.

## How a weapon is built

There is a hardware build behind every weapon; only the finished weapon is
sold. A variant's figures are not written beside its name, they are computed
from the hardware it is made of, so the shop can say which part is responsible
for which gain: the Garang's 50 damage is its match barrel's +14 on the
platform's 36, and the dossier says so.

`applyBuild` folds a variant's internal parts onto the platform. Numeric fields
add, `mobility` multiplies and `ballistics` replaces. Issued weapons have no
parts and are the platform itself. `armory-variants.test.ts` pins what every
weapon resolves to, so a change to a part that moves a figure fails there
first, and it holds that no weapon carries a hand-written `stats` block.

Internal parts and fitted hardware are permanently part of the selected variant. The optic, magazine and handling summaries are read-only on every weapon, including issued and field variants.

| Weapon | Fitted | Slot |
| --- | --- | --- |
| SAR 21 · Garang | Match trigger group | handling |
| SAR 21 · Own Time, Own Target | Fitted 1.75x match scope, free-floated barrel and match trigger | optic, handling |
| Ultimax · Encik’s Favourite | Reinforced feed tray and buffer | handling |
| Ultimax · Fort Siloso | Heavy barrel, bipod and buffered carrier | handling |

Legacy saves discard modular attachment ownership and clear all weapons' attachment selections, without refunds. All other valid progress and equipment survive. Runtime resolution ignores injected attachment data too, so switching variants or opening a preview cannot revive an old modification.

## What the build looks like

There is one GLB per platform, so a tier used to reach the preview as the same
silhouette in a different accent: the figures said the Own Time, Own Target was a different
rifle and the picture said it was a repaint. A variant now wears its parts.

`weapon-hardware.ts` derives that from the build rather than from a second list
keyed on weapon ids, so a variant added tomorrow arrives wearing its hardware
with nothing to update. A part is read by what it does:

| A part that… | reads as | and shows up as |
| --- | --- | --- |
| adds damage | a barrel | a thicker profile, flutes past half weight, a machined chamber collar |
| adds damage *and* movement | a lightened barrel | a slotted shroud with cooling ports, since weight removed cannot look like weight added |
| carries its own `ballistics` | a match barrel | the longest profile, behind a ported muzzle brake |
| adds or gives up rounds | a magazine | a longer magazine and baseplate on the rifle, a deeper or shallower drum with an accent band on the support weapon |
| shortens the cycle | a gas system | a gas block, regulator and tube above the barrel, vents scaling with how much quicker |
| is fitted to the handling slot | a bipod, a free-float nut or a buffer | legs stowed forward under the barrel, a barrel nut with daylight behind it, or a pad on the butt |

How pronounced a fitting is comes from the share of the *platform's own* figure
its part shifts, against the share that reads as the heaviest hardware on the
ladder (`REFERENCE`). Relative to the platform rather than to the rest of the
catalog, so a heavier barrel added later cannot quietly reshape every weapon
already on the shelf.

`weapon-fittings.ts` turns that plan into geometry, and `dressWeapon` calls it,
so the shop preview and the FPS viewmodel show the same weapon. Every fitting
lands in a zone the authored mesh leaves empty — the bare barrel ahead of the
handguard, past the muzzle, under that barrel, on the magazine node, or off the
back of the butt — so nothing has to intersect geometry it cannot see. The
anchors in `ANCHORS` were measured off the GLBs themselves, by binning vertex
positions of each primitive along the model's -Z axis to find where the mesh
stops and where the empty air is; re-measure the same way if the assets are
re-exported. The magazine is the one authored node the fittings touch: a drum
scales in place and a box magazine grows downward through a child mesh, so the
viewmodel's reload animation, which reads position and rotation only, still
plays over the change.

The words follow the geometry. The preview chips each fitting over the model
("Match barrel", "Deeper drum"), and the dossier prints what to look for under
the part that paid for it, next to the stat it bought. `weapon-hardware.test.ts`
covers the plan without a renderer and `weapon-fittings.test.ts` covers the
scene graph headlessly — which meshes land where, what the magazine ends up
scaled to, and that a teardown puts the model back exactly as it was found.

## Parameterized bullet impacts

Surface hits leave lit, normal-mapped craters with a chipped rim and cavity
occlusion. This is apparent depth on a decal, not a change to world geometry or
penetration. The normal data is linear; only the colour texture is sRGB. Each
instance stores its own depth and fade, so holes from different weapons share
one draw call. The pooled dust/smoke uses three normally blended wisps per hit,
visible against bright scenery as well as dark surfaces.

`WeaponSpec.caliberMm` sets bore diameter. Both current platforms are 5.56 mm;
a future complete variant can change caliber through an internal build part.
`fps-impact-profile.ts` derives these visual parameters from caliber and resolved
damage (an arcade power proxy, not a physical energy calculation):

| Parameter | Main driver |
| --- | --- |
| Hole radius | Caliber; 7.62 mm is 1.37 times the width of 5.56 mm at equal power |
| Apparent hole depth | Variant power and remaining shot energy |
| Smoke size, opacity and lifetime | Variant power; caliber also affects cloud size |
| Spark count | Variant power, bounded to the fixed pool budget |

Relative to BMT, Own Time, Own Target keeps the same bore width but resolves to
2.14 times the apparent depth, 1.69 times the smoke size, and about 0.88 seconds
of smoke instead of 0.60. Per-variant art direction can override fields through
`registerEffectStyle(id, { impact: { ... } })`; the renderer has no weapon-name
branches. Penetration and ricochet energy losses attenuate the effect. Projectiles
keep their firing weapon's style when landing after a swap. Water still splashes,
and practice targets still omit smoke and persistent holes. Surface normals
include instance transforms, so marks align on rotated batched scenery.

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
| SAR 21 · BMT | 30 m | 90 m | 55% | 1.6x |
| SAR 21 · Own Time, Own Target | 45 m | 130 m | 75% | 2.2x |
| Ultimax · Sai Kang | 14 m | 45 m | 40% | 1.5x |
| Ultimax · Fort Siloso | 24 m | 70 m | 60% | 1.9x |

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
| SAR 21 · Own Time, Own Target | 620 u/s | 9 u/s² |
| Ultimax · Fort Siloso | 520 u/s | 12 u/s² |

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
lines up two targets damages both. Penetration remains an engine trait for authored weapons; the retired Penetrator and Fragmenting magazines are no longer purchasable. No current variant grants those traits, so current player weapons stop at the first surface.

Thickness is not modelled: each intersected face spends one surface, so a solid
prop with front and back faces costs two while a thin panel costs one.
The splash trait adds a burst where the shot stops: everything else within
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
- `src/game/progression.ts`: XP thresholds, level pricing and timed elimination chains.
- `src/game/rank-insignia.ts`: the rank sets and their bands; `RankBadge.tsx` draws them.
- `src/game/encik-registers.ts`: what the Encik says, and how it changes with your rank.
- `src/game/armory-visuals.ts`: shared procedural skins, accents, markers and rig/insert models. Preview resources are disposed on selection changes.
- `src/game/weapon-hardware.ts`, `weapon-fittings.ts`: what a variant's parts put on the model, and the geometry that puts it there. Both the shop preview and the viewmodel dress through `dressWeapon`, so they agree.
- `src/components/ArmoryShop.tsx`, `ArmoryPreview.tsx`: catalog, comparisons, preview and saved loadout.
- `fps-engine.ts`, `FpsGame.tsx`: snapshot the equipped loadout on entry. XP updates do not recreate the engine. Target health, ammo, handling, armor damage, rewards and callouts use that snapshot. Enter the Armory to change equipment for the next exercise.

75 unit tests cover purchase idempotency, level gates, validation, inventory, fixed configurations, legacy attachment removal, variant ammo/reload timing, health breakpoints, armor exhaustion, rewards, level boundaries and chain timing, alongside existing world/physics checks. Local Chrome checks cover buying/equipping, preview and skin rendering, persistence, narrow layout, armor damage/defeat/reset, XP/level-up, full drill completion, callouts, mouse confinement, denied capture, Escape/pause, renderer cleanup, no uncaught browser errors and zero map requests. The production build passes with pnpm 11.22.0; the existing Three.js chunk warning remains.

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
