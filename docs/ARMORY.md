# Field exchange, progression and FPS equipment

The Armory sidebar offers twenty-six fixed weapon variants across five platforms, five cosmetic finishes, three carrying rigs, four insert choices, five vehicle wraps, repeatable food and field supplies, and a token-priced level skip. Weapon performance changes only by buying and equipping a complete variant. Optics, magazines, ammunition, handling hardware and [accessories](#accessories) cannot be bought or swapped separately. All prices and stats are original arcade balancing. The prototype starts with 1,600 credits and 300 tokens. The explicit +250 demo-token button does not charge money. There is no checkout, expiry, rental or random purchase. Three further platforms are carried only by the enemy and taken in the field; see [enemy-issue weapons](#enemy-issue-weapons).

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
| 3 | Garang, P30 Blur Like Sotong, Ultimax Jalan Jalan, gold skin |
| 4 | Orchid skin, Sentinel rig, Aegis ceramic inserts |
| 5 | Encik’s Favourite, SAR 21 Sharpshooter |
| 6 | Own Time, Own Target, Ultimax Kongsi |
| 7 | Fort Siloso |
| 8 | P30 Kopi O Kosong, P30 Lights Out (Ultra), Pineapple · Ong Lai inserts |
| 9 | Ultimax Lights Up (Ultra) |
| 10 | FN MAG Tumpang |
| 12 | SAR 21 Night Owl (Legendary), Steel · Lao Jiao inserts |
| 14 | FN MAG Chope, P30 Chiong Ah (Legendary) |
| 15 | P30 Kiasu Hunter (Ultra) |
| 16 | P30 Bo Bo CANNOT |
| 20 | P30 Atas Race Gun (Mythic) |
| 22 | CIS 50MG Tuas Shift, SAR 21 Two Eyes Open (Mythic), Composite · Tahan inserts |
| 24 | FN MAG Jaga Corner |
| 28 | FN MAG Lepak Position |
| 30 | Durian · Mao Shan Wang inserts |
| 32 | CIS 50MG Merlion Roar |
| 34 | Heavy · Pillbox inserts |
| 36 | CIS 50MG Bukit Timah |

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
| SAR Sharpshooter (semi) | 66 | 30 | .220 s | 1.80 s | .014 |
| SAR Night Owl | 58 | 36 | .094 s | 1.80 s | .0079 |
| SAR Two Eyes Open | 60 | 36 | .088 s | 1.80 s | .0076 |
| Ultimax issued | 30 | 60 | .085 s | 2.50 s | .026 |
| Ultimax Route March | 34 | 50 | .080 s | 2.10 s | .022 |
| Ultimax Encik’s Favourite | 40 | 75 | .075 s | 2.10 s | .0148 |
| Ultimax Fort Siloso | 50 | 80 | .072 s | 2.00 s | .0119 |
| Ultimax Lights Up | 54 | 75 | .068 s | 2.50 s | .0112 |
| Ultimax Jalan Jalan (specialist) | 36 | 50 | .078 s | 2.20 s | .014 |
| Ultimax Kongsi (specialist) | 40 | 30 | .075 s | 1.50 s | .018 |

Targets alternate 100 and 115 health. Garang clears a 115-health target in three landed shots versus four for the issued SAR. The dossier draws two charts: damage against range, over hits-to-kill bands, and the spray pattern of a twenty-round held burst, laid over the same target at 12, 20 and 30 m. Both simulate through the engine's own code — `hitDamage` and the recoil module — so the shop cannot advertise a figure the range does not produce. Each variant fixes its optic, magazine capacity, recoil, recovery and ammunition behavior. Skin palettes change only materials. Variant accents and built-in hardware appear in both the preview and viewmodel.

## Weapon names and flavour

Display names reflect each fixed configuration. Internal item IDs stay unchanged so existing saves and effect bindings continue to work. Flavour text appears separately from the gameplay description in the dossier.

| Weapon | Configuration | Flavour |
| --- | --- | --- |
| SAR 21 · BMT | Baseline 30-round rifle with integrated scope | Thirty rounds, an integrated scope, and strict instructions not to lose either. |
| SAR 21 · Steady Lah | Modest damage and handling upgrade | Same familiar rifle. A little more punch, a little less jump. Steady, lah. |
| SAR 21 · Garang | 50 damage, 36 rounds and quicker cycling | Hits harder, cycles quicker, brings six extra rounds. Volunteered before the briefing ended. |
| SAR 21 · Own Time, Own Target | Precision scope, long-range barrel and boosted headshot damage | The barrel is matched. The scope is set. For once, nobody is rushing you. |
| SAR 21 · Sharpshooter | Semi-automatic, integrated 3.0× sight, long heavy barrel | Three times the scope, one round per press. Aim properly, don’t anyhow whack. |
| Ultimax · Sai Kang | Issued 60-round support weapon | Sixty rounds of section support. You looked strong, so this one became your problem. |
| Ultimax · Route March | 50-round drum, faster movement and reload | Ten rounds lighter. By the eighteenth kilometre, you will appreciate the difference. |
| Ultimax · Encik’s Favourite | 75-round drum and buffered recoil | Seventy-five rounds, a steady muzzle, and fewer interruptions. Encik approves. |
| Ultimax · Fort Siloso | 80-round drum, bipod and strongest support recoil control | Eighty rounds and a bipod. You have selected this position for a reason. |
| Ultimax · Jalan Jalan | No bipod, softest recoil, laser for hip fire, short reach | Encik calls it marching fire. You call it a stroll with a drum. |
| Ultimax · Kongsi | SAR 21 thirty-round magazines instead of a drum | Your buddy’s SAR magazines fit. Your buddy has been informed. |
| FN MAG · Tumpang | Short barrel, sliding stock, fifty-round pouch, no bipod | Short enough to tumpang the assault section. Heavy enough that they notice. |
| FN MAG · Lepak Position | Sustained-fire barrel, 4× prism, must be fired prone | Find a good spot. Lie down. Do not move until somebody brings dinner. |
| CIS 50MG · Bukit Timah | Single shots, 6× prism, armour-piercing round through cover | Highest point on the island, 163 metres. Everything else is in range. |

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

The **SAR 21 · Sharpshooter** (level 5, 300 tokens) is a sidegrade among the
Elite rifles, not a rung, after the real rifle's 3.0× marksman configuration.
It is semi-automatic (a trigger-group part sets `fireMode`), its long barrel
brings 66 damage, full damage to 60 m, an 80% floor and 2.4× precision, and it
cycles at .22 s and moves at 97%. Inside the drill it is slower to kill than
the Garang, so `ShopItem.specialist` takes it off the ladder: it is not ranked
against the other Elite rifles, the ladder tests (time to kill, damage, recoil,
impact) skip it, and the breakpoint analysis measures it against the issued
BMT. It still out-kills the BMT and Steady Lah at every range, and every
higher tier has to out-kill it (see [what outranks what](#what-outranks-what)).

## Role variants

Five variants change how a platform is *played* rather than adding to its
figures. Each is built on something the platform already is, and each pays for
what it gains in something the shop shows.

| Variant | Tier · level · price | What it changes | What it costs |
| --- | --- | --- | --- |
| Ultimax · Jalan Jalan | Field specialist · 3 · 1,600 CR | Made to fire on the move: no bipod, the softest recoil on the platform (a longer constant-recoil spring), a laser that halves the hip cone | Reach: full damage only to 10 m, 40% by 40 m; ten rounds fewer |
| Ultimax · Kongsi | Elite specialist · 6 · 260 TK | Runs on the SAR 21's thirty-round magazines (a `feed` part): a rifle's 1.5 s reload, 6% quicker on its feet, the Encik's Favourite's damage and cycle | Changes magazine two and a half times as often |
| FN MAG · Tumpang | Field specialist · 10 · 3,600 CR | The one GPMG that moves with the section: short barrel, sliding stock, fifty-round pouch, 84% movement, a 3.4 s belt change, the Chope's .112 s cycle | No bipod, half the belt, and past 30 m it falls off sooner than any other GPMG |
| FN MAG · Lepak Position | Elite · 28 · 620 TK | The sustained-fire gun: full damage to 70 m, two hits drop a drill target at 120 m, a 4× prism on the feed cover, 150 rounds, the heavy bipod | Must be fired prone like the issued .50 (20 health a burst standing, 10 crouched); 67% movement |
| CIS 50MG · Bukit Timah | Elite · 36 · 760 TK | The .50 as a long rifle: single shots, 220 damage, full damage to 120 m, a 6× prism, and an armour-piercing round (`penetration`: three surfaces, 30% lost at each) that goes through cover and lines up two people | One round per press at .35 s; still needs the prone mount |

All five clear [what outranks what](#what-outranks-what). The two sidegrades
that trade reach had to be tuned to it: Jalan Jalan's band first fell below the
issued Ultimax at 30 m, and the Tumpang was at first "no better than Carry On
anywhere", a handling sidegrade the kill model cannot see, so it took the short
barrel's slightly faster cycle. The GPMG keeps its envelope (two body hits to
45 m, three at 120 m) on every variant except the Lepak, the one gun that has to
be braced to reach further (`service-weapons.test.ts`).

A **low-rate FN MAG** (a slower, steadier regulator setting) was considered and
left out: the outrank model assumes every round lands, so a slower gun always
reads as worse than the issued one, whatever it gains in accuracy. It needs a
rate switch on one gun, or an outrank model that counts accuracy.

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
| SAR 21 · Sharpshooter | Integrated 3.0× sight in the issued housing | optic |
| Ultimax · Encik’s Favourite | Reinforced feed tray and buffer | handling |
| Ultimax · Fort Siloso | Heavy barrel, bipod and buffered carrier | handling |
| [Accessory variants](#accessories) | Suppressors, compensators, lasers, lights, sights and a brace | optic, muzzle, rail, handling |

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

## Accessories

Eight variants are built around what is fitted to them. Seven are the
platforms' top tiers and out-kill everything they outrank (see
[what outranks what](#what-outranks-what)); the Blur Like Sotong is a Field
sidegrade (`specialist: true`). Each accessory is a `FittedPart` with
`accessories` (`weapon-accessories.ts`), resolved onto the weapon's spec, and
each one changes something in play besides a figure in the dossier:

| Accessory | In play | Where it is read |
| --- | --- | --- |
| Suppressor | Muzzle flash cut to a tenth; the report a fraction as loud, and heard by other players as if from 2.5× further off; arena heat from the shot ×0.3, so world events are drawn to you far less; the round leaves 8–10% slower | `fps-effect-styles`, `gunshot-audio`, `gunfire-reports`, `arena-rules` |
| Compensator | Recoil ×0.78–0.8; a bigger flash, a louder, sharper report and more heat | the same |
| Laser | Hip-fire cone halved (aimed fire unchanged); a red beam and a dot where the crosshair meets the world. **B** switches it | `accessorySpreadScale` in `fps-engine`, `weapon-rail-effects` |
| Weapon light | A spot cone from the muzzle that lights the scene at night (a tenth as bright by day); the lens glows. **L** switches it | `weapon-rail-effects` |
| Folding brace | Recoil ×0.75, recovery ×1.2, hip cone ×0.75 | `resolveLoadout`, `accessorySpreadScale` |
| Slide-cut red dot | A 1× dot over the P30's iron sights, which co-witness through the window | `weapon-sight-housings`, `weapon-optics` |
| Holographic sight | A 1× window with a 65 MOA ring around the dot | the same |
| 4× prism | A magnified prism with the `prism-chevron` reticle | the same, `scope-reticles` |
| Offset dot | A 1× dot at 45° beside the prism. **X** rolls the weapon over onto it and back; the HUD and the scope picture switch with it | `WeaponSight.offset`, `fps-engine` |
| Pistol scope | A 2.5× long eye-relief scope on a slide-ride mount | `weapon-sight-housings` |

| Variant | Tier | Level / price | Fitted | Damage · rounds · cycle |
| --- | --- | --- | --- | --- |
| P30 · Blur Like Sotong | Field | 3 · 1,500 CR | Laser-light module, 21-round magazine | 28 · 21 · .20 s semi |
| P30 · Lights Out | Ultra | 8 · 400 TK | Match barrel and trigger, slide-cut red dot, suppressor | 36 · 15 · .20 s semi |
| P30 · Kiasu Hunter | Ultra (specialist) | 15 · 450 TK | Long hunting barrel, 2.5× pistol scope, 2.4× precision | 50 · 15 · .32 s semi |
| Ultimax · Lights Up | Ultra | 9 · 420 TK | Heavy barrel, tuned gas, 75-round drum, holographic sight, weapon light, compensator | 54 · 75 · .068 s |
| SAR 21 · Night Owl | Legendary | 12 · 540 TK | Threaded match barrel, match carrier, holographic sight, suppressor, laser in the handguard | 58 · 36 · .094 s |
| P30 · Chiong Ah | Legendary | 14 · 520 TK | Selective-fire sear, 33-round stick, compensator, folding brace | 36 · 33 · .09 s **auto** |
| P30 · Atas Race Gun | Mythic | 20 · 680 TK | Long slide, race trigger, 20-round magazine, slide-cut red dot, compensator | 50 · 20 · .13 s semi |
| SAR 21 · Two Eyes Open | Mythic | 22 · 720 TK | Chrome-lined match barrel, competition carrier, 4× prism with offset dot, compensator | 60 · 36 · .088 s |

**Tiers above Elite.** Rarity runs Issued, Field, Elite, then **Ultra**,
**Legendary** and **Mythic** (`ITEM_TIERS`, `tierRank`). The first three are the
ladder every platform climbs; the top three are the most heavily kitted
variants, and they are also the strongest for their level: each one
out-kills every gun it outranks. They are token-priced and unlock later the
higher they go. Each has its own shop colours (teal, violet, crimson with a
gold edge and a slow glow, which reduced motion stills), its own flash, tracer
and brass (`fps-effect-styles`), and a rarity chip beside the weapon's name in
the field HUD from Elite up. Enemy issue stays within Issued to Elite, so bots
never carry these and expedition loot never rolls them.

The sidearm carries most of them because it has the least balance to protect:
it already trails the main weapons, so the P30 gets a machine pistol and a
scoped hunting handgun as well as the quiet and the lit builds.

Models: `weapon-accessory-models.ts` builds the muzzle devices, rail devices and
brace on the platform's own model, and leaves `fps-muzzle-exit` (where the
flash and the shot's origin move to), `fps-laser-emitter` and
`fps-light-emitter` for the engine; `weapon-sight-housings.ts` builds the sight
housings and says where `weapon-optics` puts each lens. Mount points were
measured off the GLBs by binning vertices along -Z, as for the build fittings.
The torch exists only when the loadout carries one and is switched by
intensity, because adding a light recompiles every lit material.
Touch play gets two pad buttons (`cant`, `rail`) only for a weapon that has them.

The machine guns take their sights on a rail along the feed cover, as the real
guns do. The sight rides the cover (`SightHousing.carrier`): the housing is
reparented to the cover node, offset by its rest position, so it swings up with
the cover on a belt change and sits exactly where the housing says while the
cover is shut. The rear aperture or notch folds away under it
(`SightHousing.folds`), restored when the sight comes off. The Lepak Position's
4× and the Bukit Timah's 6× use it.

Review any variant at `/scripts/fixtures/weapon-accessories.html?variant=p30-silent`
(`&view=side|hip|ads|cant`, `&night=1`, and `&yaw=`, `&zoom=`, `&cz=`, `&cy=`
for side close-ups). `scripts/fps-accessories-smoke.mjs` drives the cant and
the laser-light through the real engine; `weapon-accessories.test.ts` covers
the rules, the sounds, the models and the dossier without a browser.

## Parameterized bullet impacts

Surface hits leave lit, normal-mapped craters with a chipped rim and cavity
occlusion. This is apparent depth on a decal, not a change to world geometry or
penetration. The normal data is linear; only the colour texture is sRGB. Each
instance stores its own depth and fade, so holes from different weapons share
one draw call. The normal map's strength is the square root of the hole's
depth-to-radius against the issued 5.56 mm round's (`scorchRelief` in
`fps-impacts.ts`), so that round shows the atlas's authored slopes, a wide 9 mm
hole still reads at about 0.6 and a .50 at about 1.8; blood is flat. The pooled
dust/smoke uses three normally blended wisps per hit, visible against bright
scenery as well as dark surfaces.

`WeaponSpec.caliberMm` sets bore diameter. Both current platforms are 5.56 mm;
a future complete variant can change caliber through an internal build part.
`fps-impact-profile.ts` derives these visual parameters from caliber and resolved
damage (an arcade power proxy, not a physical energy calculation):

| Parameter | Main driver |
| --- | --- |
| Hole radius | Caliber; 7.62 mm is 1.6 times the width of 5.56 mm at equal power |
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
| SAR 21 · Sharpshooter | 60 m | 150 m | 80% | 2.4x |
| Ultimax · Sai Kang | 14 m | 45 m | 40% | 1.5x |
| Ultimax · Fort Siloso | 24 m | 70 m | 60% | 1.9x |

Drill targets sit 12.0-30.3 units from the spawn, so the rifle's band does not
bite inside the range while the support weapon's does. Both paid variants are
strictly better than their platform's issued band at every distance.

Arena damage stays host-authoritative and unchanged: zones and falloff apply to
drills and expedition only until the arena resolves shots per tick. See
[the armory roadmap](ARMORY-ROADMAP.md).

## Travelling rounds

Every carried gun's rounds travel. A weapon's `ballistics` gives a muzzle
velocity and a downward acceleration, set by `muzzleBallistics` from the gun's
real muzzle velocity times `BALLISTIC_SCALE` (.55) under real gravity (9.8). The
districts are compressed and most fights happen at short range: at real speed a round
would read as instant, and scaled by the whole compression it would crawl. At
.55 a rifle round crosses 100 m in about a fifth of a second, so a long shot on
a moving target needs a little lead. Longer shots require more holdover.
Hitscan (`HITSCAN`, infinite velocity) is still the degenerate case of the same
code, but no catalog weapon uses it.

Rounds are stepped per frame and raycast segment by segment, so they can be
blocked in mid-air and arrive late. Falloff reads the whole arc a round
travelled rather than its final segment. Rounds in flight are capped, and they
share one batched draw rather than an object each.

Infantry travel limits are shared by the range, arena authority and local
visuals: rifles and light MGs reach 300 m, the carried FN MAG and CIS 50MG
reach 400 m, and the P30 reaches 180 m. These limits are separate from damage
falloff: each weapon retains its existing minimum damage beyond its far band.
Cover still stops rounds along their actual arc. Vehicle-gun limits are separate.

Infantry identification builds gradually for each observed actor. Role sight
figures are reference distances for spotting speed; passive identification can
reach the carried weapon's travel limit when sight is clear and the target stays
exposed long enough. For ordinary assault infantry, a stationary standing target
takes about 0.4 seconds at 20 m, 1.2 seconds at 65 m, 4 seconds at 150 m and
9 seconds at 250 m to identify, followed by the existing reaction delay. Moving
targets are easier to notice; settled crouch and prone reduce exposure to 60%
and 28%. Accepted shots add a brief fading visual cue, with compensators more
conspicuous and suppressors less conspicuous. Walls, foliage and smoke still
block visual evidence. Partial glimpses fade; identifying one actor does not
identify another or a new respawned life. Normal visual memory lasts six seconds
and stores only the last confirmed position. Each bot performs at most one
normal sight sample per 0.2-second recheck, rotating past obstructed candidates.
Nearby newcomers can interrupt slow identification of a distant target; an
occluded nearby actor cannot monopolize attention.

Direct hits and bullets passing within 2.5 m create a twelve-second threat report and alert up to
four same-faction bots within 35 m. Alerted bots evade for four seconds, seeking
nearby cover when available, and can return fire at a visually confirmed attacker
out to their own weapon's travel limit, even beyond their sector leash. Cover,
foliage and smoke still control sight. Hidden attackers leave a saved position
to investigate; reports expire rather than tracking their hidden movement.
Existing reaction delays, aim spread and the two-bot firing limit remain.

Capture squads keep their assigned facility as their movement goal while
observing or firing at players. At the site they stay close enough to complete
capture/build/repair work. Searching for a lost player cannot replace that
objective. A short evasive action may interrupt the approach, but repeated
harassment cannot restart that four-second detour indefinitely. Barrage escape
and explicit squad orders retain their priority. Unassigned patrols search a
last confirmed position briefly, then return to patrolling; they do not follow
the live coordinates of unidentified or hidden players.

| Weapon | Real m/s | Game m/s | 100 m flight |
| --- | ---: | ---: | ---: |
| SAR 21, Ultimax | 970 | 534 | .19 s |
| G36, XM8 | 920 | 506 | .20 s |
| MG4 | 925 | 509 | .20 s |
| CIS 50MG | 890 | 490 | .20 s |
| FN MAG | 840 | 462 | .22 s |
| P30 | 360 | 198 | .51 s |
| SAR 21 · Own Time, Own Target | 1130 | 622 | .16 s |
| SAR 21 · Sharpshooter | 1150 | 633 | .16 s |
| XM8 · Sharpshooter | 1160 | 638 | .16 s |
| Ultimax · Fort Siloso | 1050 | 578 | .17 s |

In the arena and the open world the host flies the real round (`launch` and
`stepRounds` in arena-rules): walls, rendered cover, people, vehicles and raiders are tested along each
tick's stretch of its arc, so a target can step out of its way. Hits reach the
shooter when the round lands (`takeHits`; a guest gets an `arena-hit` message
then). The shooter's own screen flies a show-only copy along the same arc for
the tracer and impact. Bots aim ahead of a moving target by their rank's `lead`
share of the round's flight, and up by its drop.

Vehicle guns fly too: the car's roof GPMG at 462 m/s and the helicopter's chin
HMG at 490 (`VEHICLE_COMBAT[kind].ballistics`), leaving their own hull, in the
arena and on the Training range alike. The raid helicopter's door gun flies at
468 m/s; its walk-in rounds are real tracers that harm nobody. Snapshots carry
every round in flight (`rounds`), and each screen flies show-only copies of
everyone else's, and of every vehicle's and raider's, for tracers and impacts
(`adoptPublishedRounds`), within 220 m of the viewer. Each published round
names its gun as its strike's look is built, bore (`calibre`, mm) and the damage
the look is sized by (`power`): a bot's drawn variant, a vehicle gun's own
figures, and for the raid door gun a GPMG's (7.62 mm, 60), since its in-game
damage is set low for balance. Each screen builds and registers that look on
first sight, so a .50's strike reads as a .50's wherever it came from.

The AI pilot compensates. `PilotContact` carries the range to a target and the
observation carries the equipped ballistics, so the controller holds over by the
drop at that range and tests its firing gate against the compensated error
rather than the raw one. Both fields pass through the strategy whitelist, which
copies fields explicitly; a hitscan velocity survives JSON as `null` and is
restored to instant rather than rejected.

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
nine, and spending one debits the saved profile. Everything carried rides on a
utility belt drawn above the ammo block, one slot per job (`utility-belt.ts`):

| Slot | Key | Holds |
| --- | --- | --- |
| Food | `4` | kaya toast, curry puff, chicken rice, bak kut teh, field ration, mala da la, Ah Ma's tingkat, smoking corner set (see below) |
| Bandage | `5` | elastic bandage (25 health, 150 CR), field dressing (45 health, 300 CR) |
| First aid | `6` | first aid kit (75 health, 560 CR), combat medic pack (full health and 60 armor, 90 TK) |
| Plates | `7` | spare inserts (45 armor points, 380 CR) |
| Ammo | `8` | ammunition pouch (two compatible magazines, 260 CR) |

A slot's key (or a tap on touch) uses it; `G` uses the last slot again, and the
armory's quick slot only picks which slot `G` starts on. A slot with several
items hands out the smallest heal that covers the wound, or the biggest when
none does, and the line under the belt names it. Empty slots stay drawn, dimmed,
and while health is low the slots that heal are marked green. The catalog's
`medical` field ('dressing' or 'kit') files a medical item and chooses its hands:
a kit is opened and worked through (4.4 s), a dressing wound on (2.7–3 s).

### Food effects

Food heals and then keeps working for a while (`food-effects.ts`). Every effect
comes from something in the food, and the tier is how much of a meal it is: a
snack carries one effect, a hawker plate two, a full ration three. Ultra and up
are local legend rather than bigger meals and carry the strongest version of
what they give. A test holds that no higher tier carries a weaker or shorter
version of an effect a lower tier has.

| Food | Tier | Heals | Effects, and where they come from |
| --- | --- | --- | --- |
| Kaya toast set | Issued | 20 | Wired: reloads 12% faster, 60 s (the kopi) |
| Curry puff | Issued | 30 | Energised: 5% faster on foot, 45 s (pastry and potato) |
| Chicken rice | Field | 60 | Well fed 1 HP/s, 40 s; energised 5%, 90 s (slow-burning rice) |
| Bak kut teh | Field | 45 | Load bearer: load feels 35% lighter, 120 s (the dock coolies' breakfast); well fed 0.8 HP/s, 40 s |
| Malt field ration | Elite | 100 | Well fed 1.5 HP/s, 60 s; energised 8%, 120 s; load bearer 50%, 180 s |
| Mala xiang guo · Da La | Ultra | 80 | Numb: 20% less damage, 90 s (the ma); fired up: 12% faster fire and 12% more damage, 90 s (the la); well fed 1.5 HP/s, 60 s |
| Ah Ma's tingkat | Legendary | 100 | Well fed 2 HP/s, 90 s; energised 10%, 180 s; load bearer 60%, 240 s; Ah Ma's watching: once in 300 s, a lethal hit leaves 35 HP. Takes 7 s to eat |
| Smoking Corner Special · Cigar and Milo Set | Mythic | 50 | Five cigarettes bundled into one "cigar", a BBQ slab smoked over them, an iced Milo. Well fed 2.5 HP/s, 90 s; energised 15%, 240 s; steady aim (25% faster onto the sights, 25% less kick), 180 s; wired 25%, 180 s. Takes 6 s |

An effect already running is refreshed, never stacked: the stronger strength and
the longer time win. The effects show as timed chips over the belt and end when
the player goes down or the exercise resets.

Tapping `4` eats from the food slot. Holding it opens the food picker over the
crosshair: Auto first, then every food carried. Point with the mouse and let go
of `4` to pin a food to the slot (on touch, the chooser under the belt opens it
and a tap picks). Picking does not eat. Auto heals to need as the other healing
slots do; a pinned food is handed out while any is held, can be eaten at full
health, and the slot returns to Auto when the last one is gone. A food chosen as
the armory's quick item starts as the pin.

In any arena (a shared LAN match, Solo vs bots, every expedition) the host owns
supplies. At the commit point the engine sends the item's id (`useSupply`,
`arena-supply` over the wire). The host then heals, refills the inserts up to
what is worn, and starts the meal from the catalogue's figures, never the
client's. It runs the timers, the healing over time, the gun and damage effects
and Ah Ma's save. A guest's supplies are counted from the profile they joined
with, which the host already trusts for their weapons and armor. A use is
refused for something not brought, for the dead, and for a use sooner than half
the item's own commit time after the last, so a modified client cannot eat
faster than hands can. Each player's meals ride in the snapshot (`actor.food`,
validated on arrival), and the engine copies them for the HUD and for what the
host never sees: the stride, the load and the sights. A player using a supply
sends its progress with their input, so everyone else sees them kneel to patch
up or eat, as bots do. Ammo pouches stay with the engine, which owns the physical magazine inventory.

Armor is restored only up to the protection the equipped inserts provide, and
ammunition fills up to two empty rig pouches with magazines compatible with the weapon in hand. Using one with nothing to restore reports
that and spends nothing. `resolveLoadout` carries the selected supply and its
count, and the belt's contents as `supplies`, so the shop, HUD and engine read
the same selection everything else does; encumbrance weighs what is still on the belt.

## Weapon slots

Every loadout has one main weapon and one P30 sidearm. A permanent **400 TK**
unlock adds an optional second main slot, with no level gate. It may be left
empty to travel lighter; main and extra must use different platforms. Premium
weapon variants can occupy any compatible slot without this unlock.

The Armory slot selectors choose among stored platform configurations. Equipping
a variant from an uncarried main platform replaces main. Existing ownership,
balances and variant selections survive old-save migration, which starts with
SAR + P30. Field pickups replace a slot rather than expanding the loadout.

Keys **1 / 2 / 3** select main / sidearm / extra. Touch Swap cycles only carried
weapons. The multiplayer host rejects attempts to use an uncarried family.

## Enemy-issue weapons

Opposing forces carry three platforms the exchange never sells: an **XM8**
modular carbine, a **G36** rifle and an **MG4** light machine gun (families 5–7,
`xm8-inspired`, `g36-inspired`, `mg4-inspired`). They are catalog entries like
any other weapon, marked `source: 'enemy'`, so variants, builds, falloff, bipods
and the shop's own maths all apply; `isEnemyIssue` keeps them off the shop
shelf, the platform tabs, the carry selectors, the free issued kit and supply
crates, and `purchase` refuses them. A restored save, or a LAN peer's profile,
claiming one gets the baseline instead: taken weapons last one expedition.

| Variant | Tier | Config | Damage | Rounds | Notes |
| --- | --- | --- | ---: | ---: | --- |
| XM8 · Carbine | Issued | carbine | 33 | 30 | Integrated red dot on the carry handle |
| XM8 · Compact Carbine | Field | compact | 30 | 30 | Fastest cycle, shortest reach, short stock |
| XM8 · Sharpshooter | Elite | sharpshooter | 53 | 20 | Long barrel, 3.5× telescope, 45 m full damage, 2.1× precision, quick bipod, travelling rounds |
| XM8 · Automatic Rifle | Elite | automatic | 36 | 100 | Heavy barrel, twin drum, bipod |
| G36 | Issued | rifle | 36 | 30 | SAR-like reach, steadier, slower reload; 3× dual optic |
| G36K | Field | k | 34 | 30 | Short barrel and birdcage |
| G36C | Field | c | 32 | 30 | Compact; fastest G36; rail-mounted 1× red dot |
| MG36 | Elite | mg | 42 | 100 | Heavy barrel, twin drum, bipod |
| MG4 | Issued | standard | 31 | 100 | Belt-fed, bipod |
| MG4KE | Field | short | 29 | 100 | Short barrel, quick bipod |
| MG4 · Sustained Fire | Elite | heavy | 38 | 200 | Heavy barrel, 200-round box |

**Who carries what.** Each bot role lists weighted `armament`
(`arena-roles.ts`), drawn again at every spawn on its own seeded stream:
assault squads carry XM8 and G36 rifles, tanks the MG4 family, MG36 and XM8 AR,
snipers the XM8 Sharpshooter or a G36. The draw decides what they hold, what
they leave behind and how they fight with it: a bot's loadout slot takes the
drawn variant's own figures (`variantSpec`), so its damage, falloff and
precision multiplier (`hitDamage`, by range and by whether the round reached
the head), cycle, magazine and reload are the variant's. A role's `weapon` is
only the fallback for a slot no draw fills. Every mode's bots are armed this
way; only an expedition has pickups.

**How bots shoot it** (`arena-bot-combat.ts`). A trigger pull is a burst of
the role's `burst` length (assault 2–4, tank 4–8, sniper 1) at the weapon's own
cycle plus a little trigger slack (`botFireCadence`), then the role's
`shotDelay` pause. The role's aim error is the first round's cone; each round
already fired opens it by the weapon's recoil, and a magnified sight tightens
the opening round (`botShotSpread`). So an MG4 gunner lays down long, loosening
bursts, a G36 rifleman places short accurate ones, and a sharpshooter's single
round can land a 2.1× head hit.

**Bots patch up.** Each spawn carries the role's `medkits` (assault and sniper
1, tank 2). Below half health a bot out of sight for a moment kneels, slings
its rifle and winds a dressing round its forearm for 3.2 s, coming back up
with 55% of its health restored; in sight it backs away first, unless it is
below a quarter and nobody has hit it for 2.5 s. A hit stops the dressing and
the kit is kept. Bots never patch up inside a marked barrage. The snapshot's
`healing` share drives the shared rig's pose (`CharacterDrive.healing`).

**Drops.** On an expedition, a bot seen alive and then dead (any cause,
artillery included) leaves its kit where it fell (`ExpeditionLoot.fallen`).
An enemy leaves its variant; a friendly leaves the issued weapon of its
family (SAR 21 · BMT, or Ultimax · Sai Kang in support). The weapon carries
only its magazine; beside it lie its rounds as a pickup of their own, half the
platform's issued reserve in its calibre (`WEAPON_AMMO`). Either side then
rolls `FALLEN_KIT` by rank: recruits 35% for an elastic bandage and never a
plate; regulars 50% for a field dressing or first aid kit and 30% for soft
inserts; veterans 75% for a first aid kit or combat medic pack and 70% for
ceramic plates (one in five of those Aegis). A dressing restores its catalog
health. For plates, **E / Collect** adds the dropped set's armor value to
your current armor, capped at the capacity of your worn inserts; absorption,
weight, rating and special traits stay with the worn set. Full armor leaves
the pickup on the ground. With no inserts, Collect equips the dropped set at
full armor. **I / Swap inserts** deliberately replaces the worn set and
fills the new set to capacity, even if that lowers your current armor. The
card previews both outcomes, including the swap's absorption, weight, rating
and special traits; touch controls offer separate Collect and Swap buttons.
The pilot only collects and never swaps inserts automatically. Rolls are
seeded by the expedition, district and the bot's life, so
the same body always leaves the same kit. The weapon is drawn as itself on its
side, in a tier-coloured ring with a label, and the HUD prompt reads like a
crate's: `E · Elite MG4 · Sustained Fire · replace main`; the kit lies within
a metre round it as a case or a pair of plates. Taking a weapon uses the crate
path (a loaded magazine and preserved compatible spares, or one full spare
magazine in an empty pouch if the same variant is already carried). A district keeps the newest six weapons and, apart from
them, the newest twelve kits; none are written into a checkpoint. A kill of
your own puts "… dropped by …" on the radio, and a friendly falling within
90 m puts "… is down, 40 m to your left. Left …".

**Models.** `enemy-weapon-models.ts` builds each platform procedurally, with
every configuration's barrel, handguard, stock and feed on one model in groups
tagged `userData.configs`; `applyEnemyWeaponConfig` (called by `dressWeapon`)
shows the variant's set and moves the muzzle socket to its flash hider. Sights
follow the real rifles. The XM8 carries its integrated sighting module (ISM): a
squared body on the carry handle with a round window, rubber eyepiece, front
shade, laser pod and battery cap, aimed as a 1× red dot. The XM8 Sharpshooter
swaps the ISM for a 3.5× telescope (the prototype's sharpshooter sight was
3.5×): a rail along the handle, two rings, turrets, bells and a rubber eyecup,
fitted as a fixed `optic` and etched with the generic `xm8-mil` reticle, since
no reference for the original's was reviewed. The G36, G36K and MG36
carry the German dual optic: the carry handle is a 3× scope, objective in the
front leg and eyecup behind the rear block, with a small hooded reflex on top
(modelled, not aimed through). The G36C swaps it for a short rail handle with
a tube red dot, a fixed `optic` fitting on that variant. Each configuration
names its sight in `enemy-weapon-layout.ts` (`optic`: kind, height, lens
position, radius, eye depth), and `fitWeaponOptic` fits the same collimated
dot and coated glass as the Ultimax, or the SAR's picture-in-picture scope, at
that lens; the model supplies the housing. The MG4 keeps an aperture and a
hooded post.
`enemy-weapon-layout.ts` holds the sight height, eye depth, hand poses and
muzzle positions the viewmodel and models share. Review them at
`/scripts/fixtures/enemy-weapons.html` (`?view=sight` for the aimed picture,
`?view=ground` for drops, `?only=id,id&yaw=0.5` for close-ups);
`/scripts/fixtures/reflex-render.html?variant=g36-rifle` (any enemy-issue id)
shows the fitted sight against a world, PiP included;
`/scripts/fixtures/enemy-drops.html` runs a live Marina Bay expedition with the
autopilot for checking drops end to end.

## Prone heavy-weapon mount

Big Encik, the base CIS 50MG, requires grounded prone support for safe firing.
Press **Z** or tap **Prone** to deploy the mount; it locks movement while the
base weapon is in hand. Stand/crouch or switch weapons to reposition. Other
weapons allow slow prone crawling; prone disables sprinting and jumping.

Unsupported base shots still fire: **20 recoil damage standing, 10 crouched**.
Worn armor absorbs its normal share, consuming armor points; depleted armor
leaves the remaining damage to health. The weapon HUD warns before firing. Empty/cooldown/reload attempts cause
no damage. The multiplayer host enforces both self-damage and the movement lock.
Tuas Shift and Merlion Roar retain safe upright firing as arcade carryable
configurations; their weight, handling and movement penalties remain.
The CIS 50MG · Bukit Timah keeps the mount, and the FN MAG · Lepak Position is
the one GPMG that takes it on: the same rule, for the reach it buys.

## Carried weight

Spare ammunition is a physical magazine inventory, bounded by the worn rig:
ILBV has six positions, Enhanced LBS eight, Sentinel nine. The issued rifle and
pistol start with four rifle magazines and two pistol magazines, plus the loaded
magazine in each gun. A single drum/belt main starts with three spare containers;
rig upgrades add positions. A second main divides the main's allocation rather
than adding an invisible reserve. Damage and reload durations are unchanged.

Compatibility follows six gameplay groups: 5.56 rifle magazines (SAR, box-fed
XM8/G36 variants, Ultimax Kongsi); 5.56 drums (other Ultimax variants, XM8 Automatic
Rifle, MG36); MG4 5.56 belt boxes; P30 9 mm magazines; FN MAG 7.62 belt boxes;
CIS 50MG 12.7 belt boxes. Extended containers fit within their group and keep
their own capacity: a 36-round rifle magazine still holds 36 rounds in an XM8.

Reloading discards rounds in the removed magazine, preserving a closed-bolt
weapon's chambered round. A full magazine cannot be reloaded, and a usable last
magazine cannot be ejected without a replacement. A seated, uncharged magazine
can still be readied without a spare. The hand takes compatible magazines from
the upper torso row first, then the lower row and side pouches. Each pouch stays
put; empty cloth folds flat against the vest and the retaining band settles
down, exposing the pouches below. Refilling restores their loaded shape. The
spare disappears at the grab stage,
not on pressing R. A grabbed magazine remains with its interrupted reload until
seated and cannot be counted, picked up or consumed twice.

The support hand now reaches the actual pouch visual, closes its fingers,
extracts a matching magazine vertically, carries it clear of the rig and aligns
it with the weapon's physical magazine well. A connected upper arm and forearm
follow the wrist; the gun parks to the right to clear the path. Body and weapon
camera projections are matched, including when leaving ADS. The carry visual
shares the pouch's geometry and materials until seating; the gun's own seated
magazine is hidden during that transfer. Reload duration, grab/seat timings,
ammunition rules and recorded sound onsets are unchanged.

`node scripts/fps-pouch-reload-smoke.mjs` captures reach, grip, extraction,
carry and insertion in the training world. Set `POUCH_RELOAD_FAMILY=0..7` and
`POUCH_RELOAD_RIG=rig-ilbv|rig-lbs|rig-sentinel` to exercise each platform and
pouch layout, using the same Vite/Chrome environment variables as the ammo smoke.

Calibre pickups provide whole containers for the matching held weapon (or a
matching carried weapon), capped by free pouches. Ammo kits fill at most two
pouches. Range stations refill missing starting positions without changing loaded
or held magazines. Found weapons bring only their loaded magazine; compatible
spares retain their size and position, while spares no longer usable by a carried
weapon leave with the replaced gun. District travel saves exact pouch positions,
capacities and interrupted reloads. Legacy round pools migrate once into bounded
whole magazines; respawn restores the starting inventory.

The HUD shows rounds in the inserted magazine, the chambered round separately,
and the number of compatible spare magazines. `pnpm test:fps:ammo` checks physical
pouch removal, separate rifle/drum stock, ammo kits, HUD and reset in a real browser
(Vite on 5175, isolated Chrome DevTools on 9228; overridable through the script's
environment variables).

Movement now combines **total carried load** and **the weapon in hand**.
`fps-encumbrance.ts` is the common calculation used by gameplay and the shop:

- Every slotted weapon counts once, including the active weapon, plus rig,
  inserts, loaded/reserve ammunition, and every held supply stack. Owned but
  unequipped variants, spare armor and cosmetic skins add no weight.
- `weightKg` is fictional arcade carry tuning, not a real equipment specification.
  Complete variants can override platform mass; lighter patrol configurations
  reduce the burden even when another weapon is in hand.
- Carried mobility is `armorMobility / (1 + totalKg * 0.006)`, bounded to 35–100%.
  Existing rig/insert mobility values represent handling bulk in addition to mass.
- The active variant's mobility multiplies that carried factor, bounded to
  20–100% final movement. Walking, sprinting, crouching and aimed movement all
  use this same factor. Swapping to the pistol does not discard the stowed MGs.
- Jump velocity is `0.5 + 0.5 * movement`; displayed jump height squares that
  factor. Aim-in speed is `(0.35 + 0.65 * carried) * inHand`, with a positive
  minimum. Both remain usable under extreme burdens. Vehicles are unaffected.
- Actual ammunition mass decreases when fired and increases when picked up.
  Each physical spare is weighed once, plus loaded and hand-held ammunition.
  Discarded rounds reduce carried weight; taking and seating a spare conserve it. Consuming supplies removes their mass exactly once,
  including after expedition equipment is re-resolved. Spent armor remains worn.

The shop compares full-load weight, carried mobility, in-hand mobility and
combined movement; its armor view also compares jump height and aim-in speed.
The FPS ammunition HUD reports live kilograms carried and final movement percent.
A premium rig's extra reserve ammo now has weight even without extra rig bulk.

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

### What outranks what

A gun has to be at least as good as every gun it outranks, and better
somewhere (`mustOutrank`, `outrankFailures`, asserted in
`armory-balance.test.ts`). On the same platform, gun A outranks gun B when A
unlocks at the same or a later level **and** sits in the same or a higher tier,
and is above B on at least one of the two. "At least as good" means never more
shots to kill and never a slower kill, to the body or the head, at any of the
seven ranges against either drill pool; "better somewhere" means a shot off the
count or a kill at least 5% faster at some range.

Where one gun has the later level and the other the higher tier, neither
outranks the other: a high tier at a low level is strong for its level, and a
lower tier further up can be its equal. The P30 shows it: Lights Out (Ultra,
level 8) and Bo Bo CANNOT (Elite, level 16) are near equals, while the Atas
Race Gun (Mythic, level 20) has to beat both. A sidegrade (`specialist`) trades one
strength for another inside its own tier, so it is not ranked against that
tier, but lower tiers below its level must lose to it everywhere, and higher
tiers from its level up must beat it at drill range (12–30 m). They are not
held to its specialty. Held to it at every range, as they first were, each
higher tier had to carry every sidegrade's strength at once: the SAR 21's
Night Owl took the semi-auto Sharpshooter's 66 damage held to 150 m at an
automatic rate, and Two Eyes Open, which had to beat that, reached 72 damage,
more per round and more reach than any GPMG. They are now 58 (the Own Time,
Own Target's barrel, threaded for the can) and 60 (full damage to 55 m), and
`armory-balance.test.ts` keeps the top rifle at or below the Lepak Position's
damage at every range.

The P30 had the same problem from two directions. The Kiasu Hunter, a scoped
sidegrade that was not marked as one, dropped the tougher drill target in two
58-damage hits, and the Chiong Ah fired 36 damage at 857 rounds a minute, more
output than the Garang rifle; the Atas Race Gun had to beat both, so it reached
60 damage. Now the Kiasu Hunter is an Ultra specialist at level 15 with 50
damage at .32 s and the longest reach on the sidearm; the Chiong Ah cycles at
.09 s (about 670 rounds a minute); and the Atas Race Gun is 50 damage at .13 s,
full damage to 30 m but falling to 50% by 70 m, short of the hunting barrel. The shop shelves by level with tier as the tiebreak
(`byUnlock`), so reading a platform left to right, each gun beats everything
before it that it outranks.

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

The rig slot supplies reserve capacity; the insert slot supplies armor points and absorption. Enhanced LBS adds two visible magazine positions at a 2% movement cost; Sentinel adds three without an extra rig handling penalty; the ammunition still adds carry weight. A bare ILBV-inspired carrying rig has zero armor points.

| Insert | Level · price | Armor | Absorption while available | Rated for | Movement | Besides |
| --- | --- | ---: | ---: | --- | ---: | --- |
| None | 1 | 0 | 0% | — | 100% | |
| Soft | 1 · 400 CR | 35 | 45% | rifle | 98% | |
| Ceramic | 2 · 900 CR | 75 | 65% | rifle | 94% | |
| Aegis ceramic | 4 · 160 TK | 100 | 72% | rifle | 97% | |
| Pineapple · Ong Lai | 8 · 1,800 CR | 40 | 35% | rifle | 99% | One round in five glances off |
| Steel · Lao Jiao | 12 · 2,400 CR | 90 | 55% | GPMG | 90% | |
| Composite · Tahan | 22 · 260 TK | 110 | 72% | GPMG | 95% | |
| Durian · Mao Shan Wang | 30 · 360 TK | 150 | 85% | GPMG | 93% | It smells |
| Heavy · Pillbox | 34 · 420 TK | 150 | 80% | heavy MG | 84% | |

**Ratings** (`armor-inserts.ts`). Rounds come in four classes by calibre:
pistol (9–12 mm), rifle (5.56), GPMG (7.62) and heavy (12.7 and up). An insert
takes its full share of anything up to its rating and half as much for each
class past it (`OVERMATCH`), so a .50 meets rifle plates at a quarter of their
share and kills through the Aegis in one hit, and only the Pillbox holds it. A
hit that is not a round (a blast, gas, the gun's own recoil) meets the full
share. The four inserts from before ratings are all rifle-rated, so nothing
changes for them against rifles and pistols; against a GPMG or a .50 they hold
less than they did. That includes the vehicles' roof GPMG and chin HMG, and the
raid gunship. The tank bots wear GPMG-rated plates, so a GPMG meets them as
before. Ratings run wherever a calibre is known: the arena host (every round
carries its calibre), the drill's counter-fire (rifle) and the breakpoint
analysis (`shotsToKillOpponent` takes the weapon's calibre).

**Pineapple · Ong Lai** is the luckiest insert and one of the weakest: each
round has a one-in-five chance (`deflect`, at most 30%) of glancing off the
crown, taking nothing from the pool or the wearer. The host draws for it only
for a lucky insert, so every other fight keeps its random sequence. The radio
says "Ong lai!" when it happens, in the drill and in the arena. The breakpoint
analysis leaves the luck out, since a shot count cannot hold a chance.

**Durian · Mao Shan Wang** is the thickest insert there is and gives you away.
In the arena it sets `scent` on the wearer's actor, and opponents' minimaps,
which show no other opponent, draw a smell cloud where they stand. Bots see a
scented target from half again as far (`sightRangeAgainst`) and through smoke
(`smokeHides`); the drill's counter-fire targets do too.

The optional counter-fire drill uses surviving targets with line of sight within 65 game units. A 0.7-second warning locks an aim point; move at least 0.75 units, clear the attacking target or break line of sight to avoid the shot. A hit deals 18 incoming damage. Armor consumes `min(remaining armor, incoming × absorption)` and health receives the remainder. At zero health, the exercise ends without completion rewards. Pause freezes damage and warning timing. Reset restores health, plates and ammo; owned plates never need repurchasing.

Real-world naming reference: [CMPB's issued-equipment page](https://www.cmpb.gov.sg/life-in-ns/saf/items-issued/) describes the iLBV's modular load carrying and support for armor inserts. [MINDEF's enhanced-equipment factsheet](https://www.mindef.gov.sg/news-and-events/latest-releases/02dec20_fs/) describes the LBS carrying system. Geometry is an original simplified interpretation. All damage, armor, mobility and capacity values here are fictional game statistics, with no real protection-rating claim.

## Night vision and thermal

The **Night vision** tab sells head-mounted devices, after the tiers of
S.T.A.L.K.E.R.'s suit night vision. One is worn at a time (`profile.vision`,
default `vision-none`); it is a permanent unlock and its weight counts with the
rig and inserts. **N** switches it on, **J** cycles a thermal core's palettes,
and on a touchscreen one eye button walks off → on → each palette → off and
carries the device's state as a badge. A device comes up from cold over its
warm-up, and stays on across an expedition gateway.

Switching is animated (`VisionState.mount` and `fading`). The device's body
swings down from the top of the view in 0.28 s (`VISION_MOUNT_SECONDS`), the
naked-eye world showing round it, and only powers once it is in front of the
eyes, so neither the tube's gain nor the thermal material swap touches the world
before then. A tube lights from the middle out and overshoots before its
brightness control reins it in; a thermal core shows a flat field with boot
noise, scans its first picture in from the top and clicks its shutter. Switched
off, a tube's phosphor glows on with its last picture, brightest parts longest,
closing towards the middle (`shutdown`: 0.9 s on a first-generation tube, 0.35 s
on white phosphor), and a thermal display folds to a line, then a point; then
the device swings back up. Switching off before it lit just swings it up. With
reduced motion the swing and the dying are skipped. The canvas records
`data-vision-motion` as mount:fading.

| Device | Tier | Gain at night | Screen inside the image | Grain | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| NV-1 · Blur Like Sotong | Field, LV 2, 850 CR | 4.4× | 68% | 42% | Soft, barrel-distorted, noticeable halos, 1.4 s warm-up |
| NV-2+ · Jaga Malam | Field, LV 4, 1,900 CR | 5.2× | 82% | 32% | Smaller halos, 0.8 s |
| NV-3 · Confirm Plus Chop | Elite, LV 6, 280 TK | 7.5× | 92% | 13% | White phosphor, sharp, 0.35 s |
| TI-1 · Cheap and Good | Field, LV 5, 2,600 CR | — | 68% | 30% | 160 lines, white-hot only, freezes 0.4 s every 26 s to recalibrate |
| TI-2 · Kiasu Fusion | Elite, LV 8, 420 TK | — | 92% | 10% | 360 lines, edge enhancement, white-hot / black-hot / ironbow |

Gen 1 should reveal nearby obstacles and people in shade well enough to justify
wearing it. It keeps the smallest view, softer optics, more grain and bloom, and
a slower startup than Gen 2. NVG grain follows the available image signal so
noise cannot wash out faint detail; occasional bright scintillation remains.

Powered, lowered NVGs also change the response of visible aiming lights. Laser
spots stand out more at the same hit point and angular size, with tube colour
and tier-dependent halo supplied by the intensifier. Red-dot, holographic and
canted sights automatically use an NV illumination profile: a readable core or
ring with less broad optical scatter. This is a simplified intensifier response,
not a separate IR-laser mode. Raising or switching off the NVGs restores the
normal sight illumination; thermal does not enable this profile. Magnified
scopes retain their existing etching and target image.


A tube is a worse *instrument* at a lower tier, not a different filter: less
gain, so the dark stays dark; more grain, worst when the gain is up; a narrower
image circle; and halos that hide what stands under a lamp. All three NVG
tiers use circular lenses with diameters of 76%, 88% and 98%
of the viewport's longer side. The circle extends beyond the shorter edges
on portrait, landscape and ultrawide screens, giving Gen 3 roughly 92% screen
coverage at 16:9. A dark rolled edge, subtle bevel highlights and
peripheral refraction make the lens read as curved glass; the basic tube bends
and softens edges most. Thermal cores use the same longer-side sizing,
with diameters of 76% and 98%: basic thermal matches Gen 1 NVG and advanced
thermal matches Gen 3, including on portrait and ultrawide screens. Their edge feather scales
with the lens so the rim stays consistent across aspect ratios. The table's
screen shares use a 16:9 viewport. A tube's automatic brightness control holds
the gain near 1 by day and opens it as the hour's light
goes (`visionGain`), further in a blackout, so a tube at noon is a washed-out
green picture rather than a blinding one.

Thermal sees heat. While it is on, every opaque mesh draws with an unlit
temperature shader: character rigs (`impactSurface: 'flesh'`) are hot, vehicles
and the raid truck (`userData.heat = 'engine'`) warm, the range's targets heated
(`'target'`), a figure's rifle cut out (`'none'`). Dark and sun-facing surfaces
are a little warmer, green ones, bare metal and water cooler, lamps hot, the sky
cold, and distance fades everything towards the air. Glass on a hot object goes
opaque as it does in long-wave infrared. Effects keep their own look, so a
muzzle flash is the hottest thing on screen, and a thermal core sees through
most of a smoke or gas cloud (`cloudOpacity`). Because the swap is on the meshes,
the PiP scope and optic reflections show the same picture. Ambient occlusion is
off while thermal is on.

Clear direct moonlight supports unaided navigation, while sheltered detail
remains difficult without NVG or a weapon light. Geometry controls sky/moon
visibility instead of dimming every location alike; see [night visibility](NIGHT-VISIBILITY.md).

Code: `vision-devices.ts` (specs, state, gain), `fps-vision.ts` (the thermal
material swap and both post passes, which read the finished canvas back),
`FpsVisionChip.tsx` (desktop HUD chip), `visionModel` in `armory-visuals.ts`
(shop preview). Tests in `vision-devices.test.ts`; `pnpm test:fps:lens` watches
both kinds switch in a browser. `node scripts/fps-night-vision-smoke.mjs` checks
the rendered circles and peripheral refraction at four viewport sizes, and
captures city views for all three tubes and both thermal cores using
`scripts/fixtures/vision-render.html`. Gameplay values are
fictional and the device names are game names, not real products.

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

A rate switch for the FN MAG's regulator, and the CIS 50MG's dual feed (ball
and armour-piercing belts, switched in play), are designed but not built; see
[role variants](#role-variants). The arena host still resolves only the nearest
surface, so the Bukit Timah's penetration works in the single-player engine only.

Behavioral weapon traits, ballistics, penetration, consumables and the economy
sink are planned but not implemented. See [the armory roadmap](ARMORY-ROADMAP.md)
for the phases, their dependencies and the design decisions already taken.


### Grenades

The sixth utility-belt slot is Grenade, key **9**. Tap to ready; hold to pick
from carried grenades or Auto (catalogue order). Hold fire to cook, release to
throw, and hold aim for a half-speed underarm lob. A live pin prevents
holstering; cooking past the fuse detonates in hand. **G** readies the next
one after a throw. Touch uses the grenade slot as a hold/release trigger once
readied. All thirteen items, tiers, effects and prices are in [GRENADES.md](GRENADES.md).
Grenades contribute their actual carried mass and cap at four of each item,
or two of each Legendary/Mythic. Allies are protected from grenade damage;
the thrower can still be hurt. Arena hosts validate and resolve every throw.


## Practice range equipment

Field ranges use session copies of carried consumables. The equipment box near
the start provides free ammunition, fragmentation/smoke grenades and medical /
utility supplies. Using or restocking those items cannot spend purchased stock
or add free stock to the saved profile. Other modes retain their existing
consumption rules. See [range drills and resupply](RANGE-DRILLS.md).
