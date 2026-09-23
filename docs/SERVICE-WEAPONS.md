# Singapore service-inspired weapon classes

Added 23 September 2026. Platform identity and nominal caliber are grounded in
public sources; damage, recoil, movement, prices and all named variants are
fictional arcade balancing. The P30 replaces the initially proposed Glock.

## References

- [MINDEF, 19 November 2021](https://www.mindef.gov.sg/news-and-events/latest-releases/19nov21_mq/): SAF introduced the HK P30 in November 2018 to replace the P226.
- [HK P30 product information](https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/Pistols/P30): hammer-fired 9 × 19 mm pistol, with 15/17/20-round magazine options. The game uses 15.
- [PIONEER, 26 November 2025](https://defencepioneer.sg/pioneer-articles/26nov25_news1): SAF Shooting Contingent uses the belt-fed 7.62 mm FN MAG GPMG. This article's competition pistol is not evidence for general-issue sidearms.
- [Singapore Army Armour](https://www.army.gov.sg/our-forces/formations/armour/): lists Bionix 40/50 with the CIS 40/50 twin weapon system.
- [US Army ODIN, CIS/STK 50MG](https://odin.t2com.army.mil/WEG/Asset/3367f70dff8b80d0a8ae73af211f8efb): identifies the Singapore-developed 12.7 mm heavy machine gun and its SAF procurement context.

The heavy MG is normally mounted/crew-served. The base Big Encik now auto-deploys
a prone mount (Z or the touch Prone button), preventing movement until the
player stands/crouches or switches weapons. Unsupported base shots deal 20 recoil damage
standing or 10 crouched. Worn armor absorbs its normal share until depleted;
remaining damage reaches health and can defeat the player. Tuas Shift and Merlion Roar
remain explicitly arcade carryable variants, safe to fire upright. All receive a large
movement penalty, wide hip spread, slow aiming, heavy recoil and long reloads.
Base/Tuas/Merlion damage is 160/168/178. Base body damage bottoms at 120 after
range falloff, so even the free variant kills normal 100–115 HP unarmored targets
in one direct hit. Armor can prevent that kill. Handling and carry burden are
the trade-offs; premium ownership is not required for one-shot lethality.
The existing Ultimax remains a legacy-inspired platform; this addition does not
claim it is the newest SAF standard.

## Playable roles

| Family index | Platform | Caliber | Base capacity | Role |
| --- | --- | --- | --- | --- |
| 0 | SAR 21 | 5.56 mm | 30 | Balanced rifle with magnified optic |
| 1 | Ultimax | 5.56 mm | 60 | Mobile volume of fire, short effective band |
| 2 | HK P30 | 9 mm | 15 | Semi-auto, fast movement/reloads, close range |
| 3 | FN MAG | 7.62 mm | 100 | Sustained fire and longer reach, slower handling |
| 4 | CIS 50MG | 12.7 mm | 50 | Heavy damage and recoil, slowest movement/reload |

One P30 round fires per mouse/touch press; release to fire again. The AI can
re-press at the same cooldown limit. MGs remain automatic. Keys 1/2/3 select main/sidearm/optional extra; Touch Swap cycles only
carried weapons. The permanent extra main slot costs 400 TK. Iron sights do not render a scope lens. Impacts inherit nominal
bore width and resolved variant power: the 9 mm pistol hole is wider than the
7.62 mm GPMG hole, but its lower damage produces less depth and smoke.

## Fixed variants

| Family | Free baseline | Credit variant | Premium variant |
| --- | --- | --- | --- |
| P30 | Provost | Kopi O Kosong — L8, 2,200 CR | Bo Bo CANNOT — L16, 420 TK |
| FN MAG | Carry On | Chope — L14, 4,200 CR | Jaga Corner — L24, 560 TK |
| CIS 50MG | Big Encik | Tuas Shift — L22, 6,500 CR | Merlion Roar — L32, 720 TK |

All families have a free baseline like the existing rifle/support families.
Purchases unlock entire fixed configurations, never modular attachments. Credit
MG variants emphasize longer belts; premium versions retain smaller belts and
favor precision/power. All nine have characteristic-based local names and flavor
text. Existing variants and prices stay unchanged. Field pickups retain the
existing expedition-only equipment behavior, without persistent unlocks.

## Implementation

Family indexes 0–4 are stable save/network keys. `DEFAULT_VARIANTS` supplies
new slots when restoring old two-family v1 saves, preserving balances and valid
old selections, with no refunds. `validWeaponIndex` guards UI, network and loot
boundaries. Arena weapon sanitization accepts up to the registered family count.

`service-weapon-models.ts` authors low-poly models with distinct pistol, stocked
GPMG and spade-grip heavy-MG silhouettes. The shop and FPS share these models,
fittings, skins and named muzzle/ejection/magazine nodes. No generated textures,
external model downloads or new package dependencies are needed. The two
existing GLBs and range prop indexes remain unchanged.


## GPMG balance

Carry On / Chope / Jaga Corner deal 60 / 66 / 70 damage, with full power through
45 m and a 70% floor at 120 m. Each takes two unarmored body hits through 45 m,
three at the range floor (100–115 HP targets). Cadence is .120 / .112 / .108 s.
The base has .042 recoil, .75 recovery and .74 in-hand mobility; slower aim-in,
carry burden and long belt changes reward deliberate positioning. Chope trades
a longer belt change for 125 rounds and a steadier, quicker feed. Jaga keeps
100 rounds and improves power, cadence and recovery at extra weight/mobility cost.
The .50 retains much greater per-shot power; the GPMG handles and aims faster.
