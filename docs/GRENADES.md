# Grenades

Implemented grenade slot on the utility belt (2026-10-28). All thirteen
catalogue items and their combat effects are available. All figures are made-up arcade balancing, set
against the existing blasts (`MORTAR_ROUND` 110 / 6 m, `ARTILLERY_SHELL`
140 / 8 m, tear gas 7 HP/s) and the food ladder in [ARMORY.md](ARMORY.md#food-effects).

## The rule, borrowed from food

Food works because every effect comes from something in the meal. Grenades
follow the same rule: **every effect comes from part of the grenade.** The
steel body fragments, the filler blasts, the thorns on a durian shred plates,
the smell drives people out. If no part of the item explains an effect, the
item doesn't get it.

Tiers work the same way too:

- **Issued** does one job.
- **Field** does that job plus a second.
- **Elite** does three.
- **Ultra and up** are local legend, not just bigger grenades. Each one does
  the strongest version of whatever it does.

The same ladder test food has applies here: no higher tier carries a weaker or
shorter version of an effect that a lower tier has. Every value in the tables
below has been checked against that test.

The first six items are standard kit, some with local names. The rest are
outlandish.

## Effects

Each effect is built from a primitive that the combat events already have
([COMBAT-EVENTS.md](COMBAT-EVENTS.md#2-payloads-are-a-small-vocabulary)), or it
is a short-lived *condition* on whoever was caught. A condition works the same
way a food effect does: a repeat refreshes it rather than stacking, the
stronger strength and the longer time win, and it shows as a timed chip.

| Effect | Does | Built from |
| --- | --- | --- |
| Blast | Damage at the centre, falling off to an edge share at the radius. Cover and stance protect. | `resolveBlast` (`combat-blast.ts`) |
| Shred | A share of the blast damage goes straight through plates. | `piercing`, as gas already does |
| Bomblets | Several small blasts, scattered. | `resolveBlast` once per bomblet |
| Smoke | A cloud that blocks every line of sight. | `cloud`, `dps: 0` |
| Gas | A cloud that does damage every second, straight through plates. | `cloud`, `dps > 0` |
| Repel | Bots leave the ring and won't go back into it. Players can still enter. | `marker` (bots already run from one) |
| Marked | Enemies inside the ring show on the map and through walls for the thrower's whole side. | **new** `reveal` primitive |
| Dazed | The sights won't come up and the view sways. Bots lose their target. | condition |
| Deafened | No footsteps or callouts, and the corner map goes blank. | condition |
| Retching | Reloads go slower (the reverse of *wired*). | condition |
| Streaming eyes | The sights come up slower and every shot kicks harder (the reverse of *steady*). | condition |
| At attention | Can't move, fire or aim. | condition |
| Fire mission | Calls in mortar rounds on the spot, with the usual warning ring. | `munition` with `caller` |
| Rally | Gives food effects to allies in reach. | `applyFoodEffects` |

## The catalogue

**Throw** is the overarm throw speed in m/s. At 45°, 14 m/s carries about 20 m,
10 m/s about 10 m and 16 m/s about 26 m. Lighter grenades fly further. The fuse
counts from the moment the pin comes out.

### Standard

| Grenade | Tier | Lv | Price | kg | Throw | Fuse | Effects, and where they come from |
| --- | --- | ---: | --- | ---: | ---: | --- | --- |
| Frag grenade | Issued | 1 | 110 CR | 0.40 | 14 | 3.5 s | Blast 100 · 6 m · 20% edge (the steel body, scored to break up) |
| Smoke grenade | Issued | 1 | 80 CR | 0.45 | 14 | 1.5 s | Smoke 6 m, 25 s (white smoke compound) |
| Stun grenade | Field | 2 | 190 CR | 0.35 | 15 | 1.5 s | Dazed 3 s within 8 m, half as long for anyone facing away (the flash); deafened 5 s within 12 m (the bang). Does no damage |
| Chilli padi mini-frag | Field | 3 | 240 CR | 0.20 | 16 | 3 s | Blast 115 · 6 m · 20% (a denser filler); shred 30% (a pre-notched wire coil rather than a cast body) |
| Town council fogging canister | Field | 3 | 210 CR | 0.60 | 13 | 1 s | Smoke 9 m, 35 s (thermal fog); repel 9 m, 35 s (the insecticide, which nobody wants to stand in) |
| Red smoke · fire mission | Elite | 5 | 90 TK | 0.45 | 14 | 1.5 s | Red smoke 9 m, 35 s; marked 12 m, 20 s (the spotter's report); fire mission of four mortar rounds (110 / 6 m) in a 10 m spread, starting 8 s after the smoke goes up |

Flavour lines:

- **Chilli padi:** *Small but chilli padi.* Half the weight of the issued frag,
  the same reach, and it hits harder.
- **Fogging canister:** *The fogging man comes round at five, and every window
  on the block shuts.*
- **Red smoke:** *Throw it where you want the mortars, then don't stand
  there.* The red warning ring goes up for **everyone**, so enemies get the
  same chance to run that players get from enemy mortars. This keeps the
  events' rule that nothing hurts before it has been announced. A player can
  call one fire mission every 60 s, and the kills go to the thrower, using the
  `caller` field COMBAT-EVENTS.md has kept reserved for exactly this.

### Outlandish

| Grenade | Tier | Lv | Price | kg | Throw | Fuse | Effects, and where they come from |
| --- | --- | ---: | --- | ---: | ---: | --- | --- |
| Durian · Mao Shan Wang | Ultra | 10 | 150 TK | 1.60 | 10 | 3.5 s | Blast 135 · 7 m · 20% (the husk bursts); shred 40% (the thorns); retching 25% within 10 m, for as long as you stand in it plus 5 s (the smell); repel 10 m, 40 s. Doesn't block sight. Barely rolls, because the thorns dig in |
| Sambal belacan, void-deck strength | Ultra | 11 | 140 TK | 0.50 | 14 | 2 s | Smoke 10 m, 35 s (shrimp paste and chilli on a heating charge); gas 5 HP/s; streaming eyes 30% inside the cloud plus 6 s |
| Mandarin orange pair | Ultra | 12 | 170 TK | 0.50 | 14 | splits at the top of the arc | Bomblets 8 × 50 · 3.5 m, scattered over 9 m. The pair splits into two, then straight into eight, skipping four |
| Chope packet | Ultra | 10 | 130 TK | 0.05 | 12 | lands flat | Marked 12 m, 45 s; repel 9 m, 45 s. Does no damage and doesn't bounce |
| Encik's whistle | Legendary | 15 | 220 TK | 0.30 | 14 | 2 s | At attention 3.5 s within 14 m, for every enemy that hears it; deafened 6 s within 14 m; rally for allies within 14 m: steady 20%, 60 s |
| Ah Gong's firecracker string | Legendary | 18 | 260 TK | 0.90 | 12 | 1 s, then 4 s of pops | Bomblets 16 × 55 · 3.5 m along a 12 m line; dazed 3.5 s within 4 m of any pop; deafened 8 s within 14 m; repel 20 m, 60 s |
| Countdown finale shell | Mythic | 24 | 380 TK | 2.20 | 9 | lands upright, launches after 2 s | Embers over 25 m for 6 s: gas 6 HP/s, falling from overhead, so a roof leaves 20%. Dazed 3.5 s for enemies within 30 m. Rally for allies within 30 m who can see the sky: fired up 15% and energised 15%, 120 s |

Flavour lines, and what each one is about:

- **Durian:** *Not allowed on the MRT. Not allowed in the hotel lobby. Nobody
  said anything about here.* At 1.6 kg it's the shortest throw on the belt,
  and the weight counts against encumbrance like any other kit. It's sold
  wrapped in a raffia net, the way the stalls tie them.
- **Sambal belacan:** *Level 3 smells it. Level 12 smells it. The town council
  gets four emails.* The viewmodel is a sealed tin with a wok-hei heating
  charge on the bottom. The cloud is the orange-brown of frying belacan.
- **Mandarin oranges:** *Always in pairs. Never four. Eight is huat.* Four
  sounds like "death" in Chinese, so it never splits into four, and eight
  sounds like prosperity. Each orange carries a small red-paper sticker.
- **Chope packet:** *A tissue packet on the table means taken. Everyone knows.
  Even them.* It's the cheapest way to hold a doorway. Bots treat the spot as
  taken and route around it. An enemy player who stands there anyway is marked
  to your whole side, because everyone saw them take someone's seat.
- **Encik's whistle:** a parade whistle taped to a thunderflash. It bangs, the
  whistle shrieks, and Encik shouts "FALL IN!" in the voice register the
  player has reached ([ENCIK-VOICE.md](ENCIK-VOICE.md)). From level 35 it's
  "Sorry sir, fall in please." Caught players get a STAND BY overlay while
  they stand at attention.
- **Ah Gong's firecracker string:** *Ah Gong kept one box back in 1972. It is
  time.* (Singapore banned firecrackers that year.) The string unrolls in
  flight and lands as a line of red. The 20 m repel is the old story: the
  Nian beast runs from the noise, and so do bots.
- **Countdown finale shell:** the last shell of the big fireworks night,
  in a mortar-style rack. Throw it, it lands upright, and two seconds later it
  fires 60 m up and bursts in a gold chrysanthemum. Everyone looks up. The embers use the bomb rule that already
  exists (`overhead`), so a void deck or an MRT viaduct gives the same cover
  it gives in an air raid. *The whole island counts down with you.*

Keep it generic: no national day, parade, flag, crest, anthem lyrics or
national colours on any of these. This matches the disclaimer the uniforms already carry
([FACTIONS.md](FACTIONS.md)).

### Ladder check

| Effect | Rungs (tier: strength) |
| --- | --- |
| Blast | Issued 100 · 6 m → Field 115 · 6 m → Ultra 135 · 7 m |
| Shred | Field 30% → Ultra 40% |
| Smoke | Issued 6 m / 25 s → Field 9 m / 35 s → Elite 9 m / 35 s → Ultra 10 m / 35 s |
| Repel | Field 9 m / 35 s → Ultra 10 m / 40 s and 9 m / 45 s → Legendary 20 m / 60 s |
| Marked | Elite 12 m / 20 s → Ultra 12 m / 45 s |
| Dazed | Field 3 s → Legendary 3.5 s → Mythic 3.5 s |
| Deafened | Field 5 s → Legendary 6 s and 8 s |
| Gas | Ultra 5 HP/s → Mythic 6 HP/s |
| Bomblets | Ultra 8 × 50 → Legendary 16 × 55 |

## Controls

Grenades go in a sixth belt slot, **Grenade, key `9`**, and work the way the
food slot does:

- **Tap `9`** to get a grenade out, which takes 0.35 s. **Hold `9`** to open
  the same picker the food slot uses: Auto first, then every grenade carried.
  Auto hands out the first one held in catalogue order, so the issued frag
  comes out before a durian does. A pinned pick stays until the last one is
  thrown.
- **Fire** pulls the pin. Holding it *cooks* the grenade: a ring around the
  crosshair fills toward the fuse. Releasing fire throws overarm. Holding aim
  as you release makes it an underarm lob at half the speed. If you cook past
  the fuse, it goes off in your hand.
- Before the pin is out, `1`–`3` put the grenade away. After that, the only
  way to get rid of it is to throw it.
- `G` already means "use the last slot again", so after a throw, `G` gets the
  next grenade out.
- On touch, the belt gets a ninth button, and the grenade button acts as the
  fire button while a grenade is out.

The weights go into encumbrance with everything else (`fps-encumbrance.ts`).
You can carry up to four of each grenade, and two of each Legendary or Mythic.

A live grenade you can hear within its blast radius + 2 m shows the usual
direction indicator around the crosshair.

## How it fits the existing systems

**Flight.** A new pure module, `grenade-flight.ts`, steps the arc with the
drop integrator from `fps-ballistics.ts`. It adds bounces against
`worldWallDistance` and the cover rays. Each bounce keeps 30% of the speed,
except the durian (15%) and the chope packet (no bounce at all). The mandarin
splits at the top of its arc, and the finale shell launches from wherever it
comes to rest.

**Catalogue.** Grenades are consumables with `supplyType: 'grenade'` and a
`grenade: { fuse, throwSpeed, bounce, effects }` field next to `foodEffects`.
`utilityKind` files them under the new `'grenade'` kind. `foodEffectLines`
gets a sibling, `grenadeEffectLines`, for the shop card and the line under
the belt.

**Conditions.** `grenade-effects.ts` sits next to `food-effects.ts` and has the
same shape: kinds, labels, apply (which refreshes rather than stacks),
advance, and the HUD view. The engine reads it the way it reads food. Dazed
blocks `aimSpeedScale`, streaming eyes scales recoil up, retching scales
reload down, and at attention zeroes input. Against human players, the two
conditions that take control away, dazed and at attention, last **half as
long**: 3.5 s at attention is a fair price for a bot and harsh for a person.
Bots get the full time. The ladder still holds, since every rung is halved
alike. In an arena, an
`arenaConditionModifiers` goes alongside `arenaFoodModifiers`.

**Host authority.** This follows the same pattern as supplies:

- The client sends `throwGrenade { id, origin, direction, under, cooked }`.
- The host refuses a grenade the thrower didn't bring, a throw from the dead,
  an origin more than 1.5 m from the actor's hand, or a throw sooner than
  0.9 s after the last one.
- The host flies it, detonates it, and turns the result into the combat-event
  payloads above, so guests render it from the same numbers they already
  validate.
- Grenades still in flight ride in the snapshot as `grenades`, capped at 24.
  Conditions ride on the actor as `actor.conditions`, validated when they
  arrive, the same way `actor.food` is.

**Damage and credit.** Blasts follow the rule for rounds: they never hurt the
thrower's own side, with one exception. **The thrower is hurt by their own
grenade**, because that is the whole risk of cooking one. Kills credit the
thrower and count toward `ARENA_KILL_LIMIT`, since a player threw it. That
differs from event kills, which credit nobody. Against vehicles, blasts use a
`vehicleScale` of 0.6, and shred doesn't apply to hulls.

**Bots.**

- *Avoiding grenades:* a live grenade puts a `marker` ring of its radius +
  2 m on its predicted landing spot, and bots already run out of rings.
- *Carrying them:* Black Kite assault bots carry one frag, and tanks carry one
  smoke.
- *Throwing them:* a bot throws at a contact it last saw behind cover within
  25 m, no more than once every 20 s, with a director cap on how many are in
  the air at once.
- *The AI pilot:* the pilot sees live grenades in its observation, so it can
  dodge them. The strategy whitelist then needs the new fields.
- *The outlandish set:* Black Kite never carries any of it. They're
  mercenaries; nobody told them about chope.

**Expedition.** Downed Black Kite bots can drop their frag or smoke as a
pickup that lasts the rest of the expedition, the same way taken weapons do.

## Order of work

1. **Frag and smoke, solo.** The belt slot, the viewmodel, `grenade-flight.ts`,
   blast and cloud through the engine's own adapter, the indicator, and the
   ladder test. This is the first version a player can feel.
2. **Arena authority.** `throwGrenade`, the host's checks, and the snapshot
   fields. Bots run from rings.
3. **Conditions and the Field tier.** Stun, chilli padi and fogging, plus
   `grenade-effects.ts` and the condition chips.
4. **Fire mission.** The typed `DamageCause` with `caller`, and the per-player
   cooldown.
5. **The outlandish set.** Models first, since these items are all about how
   they look: the durian net, the tin, the oranges, the tissue packet, the
   string, the rack. Then the `reveal` primitive, at attention, and rally.
6. **Bots throwing**, and the AI pilot dodging.

## Decisions taken

| Decision | Rationale |
| --- | --- |
| The thrower is hurt by their own grenade | Cooking one too long is the risk that makes cooking a choice. Allies are still spared, as with rounds. |
| The Mythic is the generic Countdown finale shell | No national event, symbol or colours in a weapon's name or look. |
| Dazed and at attention last half as long against human players | Being held still for 3.5 s in a LAN free-for-all is harsh. Bots take the full time. |


## Implementation and verification (2026-10-28)

- `grenade-catalog.ts` holds the thirteen items and descriptions;
  `grenade-models.ts` builds their held/world props. They are sold under field
  utilities, weigh against encumbrance and use per-item caps of four (two for
  Legendary/Mythic). The food picker also presents grenades, including Auto.
- `grenade-flight.ts` uses constant-gravity integration in 10 ms collision
  segments. Live games use rendered surface normals, including elevated decks
  and ceilings. Chope lands flat, oranges split two then eight, and the finale
  rests before launching. Timed grenades can detonate in the hand.
- `grenade-system.ts` owns flight, deterministic pops and lingering areas.
  It emits the existing blast/cloud/marker/munition vocabulary and the new
  `reveal` payload. `grenadeEvents` carry bounded detonation descriptors beside
  the bounded `grenades` snapshot array, keeping the world-event director's
  six slots independent of player equipment. Mortars and falling orange
  bomblets land against rendered cover. Damage uses the normal resolver and
  kill credit; a shred blast is one hit, so Ah Ma's save cannot be spent twice.
- All arena roles use host checks for inventory, origin, life, conditions,
  throw cadence and fire-mission cooldown. Guests spend an item only after
  acceptance. Respawning does not refill grenades; match reset restores the
  brought set. Disconnect removes that caller's remaining ordnance.
- Conditions refresh without stacking, publish on actors, affect hands,
  movement and senses, and display timed chips. Human daze/attention lasts
  half as long. Smoke also blocks bot/pilot perception and minimap contacts.
  Marked enemies have a map contact and a silhouette through cover for the
  caller's side. Finale embers respect roofs and its rally requires open sky.
- Mercenary assault/tank bots carry one frag/smoke, throw at recent covered
  contacts with a three-bot-flight cap, and avoid live or repelling rings.
  Unthrown grenades join expedition body loot. The pilot's public observation
  includes audible grenade warnings and prioritises escape.

`pnpm test:fps:grenades` runs the real controls in Chrome (desktop picker,
cooking/throwing, holstering, self-damage, touch controls and solo arena).
Use the origins configured at the top of the script or its environment
variables, and turn off Vite HMR during the run. Pure and host/runtime tests
also cover catalogue progression, caps, physics, all condition modifiers,
refused guest throws, damage credit, fire-mission warning/cooldown, roofs,
snapshot rejection and observation whitelisting.

The whistle plays a synthesised bang/shriek and displays its register-aware
Encik line, including "Sorry sir, fall in please." at level 35. The new line
has no recording in the existing Encik voice pack; it remains a subtitle,
consistent with that pack's exact-text lookup. No paid voice generation was
run. Two-browser WebRTC and a complete expedition loot/throw circuit have not
been browser-verified; shared authority and drops have automated coverage.
