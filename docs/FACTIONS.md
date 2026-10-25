# Factions

Every soldier fights for a faction registered in `src/game/arena-factions.ts`
(`registerArenaFaction`). A faction carries the uniform (palette, printed
camouflage, sewn badges), its role accents, and a `side`. Factions on the same
side never fight each other.

| | Armed forces (`armed-forces`) | Black Kite mercenaries (`mercenaries`) |
|---|---|---|
| Who | Every player, the friendly squads, and the crews of friendly fire support | Enemy squads, and the crews of events aimed at players |
| Side | forces | opposition |
| Uniform | Jungle-green pixel camouflage (`digital`) on shirt, trousers and helmet cover | Deep navy, soft `blotch` camouflage on the shirt over plain trousers, near-black plate carriers |
| Headwear | Camouflaged helmet; boonie for marksmen | Cap and wraparound shades on patrol; helmets for heavies; boonies for marksmen |
| Badges | Red-over-white flag (left), gold bar (right), name tape (chest) | Orange kite on black (left, chest), orange chevron (right) |
| Band accent | Leaf green; lime mortar crew, yellow overwatch | Amber, red (tank), lavender (sniper), orange (mortar crew), yellow (overwatch) |

There is no separate militia. The crew roles (`mortar-crew`, `overwatch`)
belong to whichever side owns the event: the side opposing the soldier
nearest the event's target. So a mortar on a player is a mercenary crew, and
a mortar on a mercenary patrol is armed-forces fire support, named FRIENDLY in
the comms log and skipped by the AI pilot.

Black Kite is fictional. The forces' badges are generic, not any real unit's
insignia, and the camouflage is only in the spirit of a pixelated temperate
pattern. The About copy's disclaimer of any Singapore Armed Forces affiliation
still applies.

## Rules

- `ArenaActor.faction` is set by the host: players get `armed-forces`, squad
  bots their squad faction, and event crews their event's faction. Snapshots
  with an unregistered faction are rejected. `arenaFaction` dresses an actor by
  that field, falling back to its role's faction for figures without one.
- `hostile(a, b)`: the two sides fight each other and never their own, and an
  event crew still spares its crew-mates. Players stay hostile to
  other players, so LAN matches remain a free-for-all between humans, with
  bots against every human.
- A bot only picks hostile targets. A round that strikes someone on the
  shooter's own side stops there and does no damage. Artillery and vehicle
  wrecks hurt everyone, whatever their side.
- The role still sets the silhouette within a side (plates and a belt-fed gun
  for the tank, a boonie and a scoped rifle for the sniper), and the role
  colour stays on the helmet band and health bar.

## Friendly squads

Wherever a district has heat (every expedition district), the forces field
small squads of their own: one to six soldiers (`FACTION_SCALE['armed-forces']`),
against three to fourteen contractors, so the player still does most of the
fighting. Every district's forces band rests high enough for one or two
soldiers, below the contractors' floor, and rises as the player fights. They arrive by the same trucks and helicopters, named
`Pte`/`Cpl`/`Sgt` and a surname. Riflemen and marksmen carry the issued
rifle, support gunners the Ultimax, and none of them drops a weapon. They
fight contractors, never the player: their rounds stop on players without
harm, the player's rounds do the same to them, and the AI pilot skips figures
in friendly uniform.

## Heat

`src/game/faction-heat.ts` keeps one heat value, 0–1, per squad faction
(armed forces and mercenaries) per sector, plus one for the district as a
whole (''). A crew's losses count toward its side like anyone else's. This is separate from the arena's activity grid (`heat` in
arena-rules), which only tells the combat director where fighting has been.

- **Bands.** Each sector may give each faction a band `{ min, max, curve }`.
  A sub-sector without one uses its `parent`'s, and a top-level sector uses
  the district default for its risk (`DISTRICT_HEAT`). A stronghold rests high
  in a high band, a backwater low, and contested ground runs high for both.
- **Losses.** A casualty raises its own side's heat by `HEAT_TUNING.casualty`
  in the most specific sector at the spot, and half of that (`spill`) in each
  sector above it, up to the district. The last stretch of a band climbs at
  under half pace, so only a sustained fight pins a side at its ceiling.
- **Contact.** A hit that does not kill adds `contact` (0.1) of a casualty at
  100 damage, so a running firefight builds heat before anyone falls.
- **Who is fighting.** A fight with a player at either end counts in full.
  Bots fighting bots alone count for `skirmish` (0.25), so the war between
  the squads goes on around the player without escalating by itself.
- **Leak.** Each rise passes `leak` × the rise × the other side's remaining
  room in its band across to the other side. What leaks in never leaks back,
  and the leak fades as the other side nears its ceiling, so the two cannot
  feed each other without limit.
- **Hold and decay.** A casualty holds its side's heat in that sector for
  `hold` (30 s); a smaller rise holds it for its share of that, so stray
  rounds cannot keep a sector hot. After that, heat drains toward the band's
  floor at `decay` per second: half that near the floor, twice it at the
  ceiling. A fight's peak falls away within a minute or two and the district
  is back at rest three or four minutes after it ends.
- **Curves** turn heat into strength. `linear` is proportional; `slow-burn`
  stays quiet and then escalates; `hair-trigger` answers the first trouble
  hard and levels off; `tiers` steps in thirds, wanted-level style.

Strength across the district sets each side's headcount and its top-up
interval between the ranges in `FACTION_SCALE`. It is the mean over the
top-level sectors by `botWeight`, pulled halfway to the hottest sector, so
one fight in a big district still moves the whole of it. The top-up interval
is read whenever a ride is checked, so heating up mid-wait sends one sooner.
Rides head for the sector whose wanted share most exceeds the troops already
there, and the troops make that sector home: they patrol it and only answer
contacts within `HOME_LEASH` (90 m), stretched up to twice that by their
side's surge there.

A side's **surge** is how far it has climbed through its band, 0 at the floor
and 1 at the ceiling, taken across the district the same way. Besides the
leash, it sets the combat director's tempo (see
[combat events](COMBAT-EVENTS.md)): contractors at their ceiling roughly
double how often strikes come, and the forces' own surge adds a little more.
The HUD's radio speaks as the hottest sector crosses each step in
`HEAT_CALLS` (Intel for Black Kite, HQ for the forces), and says when a side
that had stepped up twice has stood down. Arriving in a district only takes
a reading. Kit follows heat too. Armour on each
spawn scales from 0.75× to 1.25× the role's with the home sector's strength,
and hotter sides recruit more support gunners and marksmen.

HarbourFront is tuned by hand as the pilot. The quay is held by the forces,
the Cruise Centre is contested, and Keppel wharf is a Black Kite stronghold
on a slow burn. Every other sector uses its district's defaults.

## How the uniform is drawn

The rig is a vertex-coloured, merged mesh per bone, so patterns are not
textures. `printCamo` (character-rig.ts) patches the figure's
`MeshStandardMaterial` in `onBeforeCompile`. Every part carries a `fabric`
attribute (1 on uniform cloth, 0 on skin, kit and badges), and the fragment
shader recolours fabric from the bone-local position:

- `digital`: square cells, `floor(p)`, hashed and blended with a hash of the
  3×3×3 block they fall in, so pixels cluster into blobs.
- `blotch`: two octaves of smooth value noise, thresholded into patches.

Because the pattern is computed per fragment in bone space, it stays crisp at
the rig's low mesh density and moves with each limb. Colours are uniforms per
material, while `customProgramCacheKey` shares one compiled program per style
across every figure.

Badges are flat boxes sewn onto the outside of each upper arm and the left
breast. The arm IK keeps each upper arm's local +x on the elbow hinge, which
points across the body, so the outside of either arm is local `-side·x`.

The badge and camouflage colours are validated `#rrggbb` at registration, like
the rest of the palette. Review: `scripts/fixtures/faction-uniforms.html` (`?zoom=.3&focus=1.3&yaw=1.15&cols=3`
frames the shoulders).
