# Factions

Every firefight has two sides, defined in `src/game/factions.ts`.

| | Armed Forces (`forces`) | Black Kite Contractors (`mercenaries`) |
|---|---|---|
| Who | Every player | Every bot |
| Uniform | Pixelated green camouflage (`digital`) on shirt, trousers and helmet cover; olive vest; black boots | Coyote shirt in soft-edged camouflage (`blotch`) over plain charcoal trousers; black plate carrier; coyote boots |
| Headwear | Camouflaged helmet | Black cap and wraparound shades; black helmet for heavies; camouflaged boonie for marksmen |
| Left shoulder | Red-over-white flag | Orange kite (diamond) on black |
| Right shoulder | Gold bar on green | Orange chevron on black |
| Chest | Name tape | Orange kite on black |
| Label colour | Teal `#53c1d0` | Orange `#e8833a` |

Black Kite is fictional. The forces' badges are generic, not any real unit's
insignia, and the camouflage is only in the spirit of a pixelated temperate
pattern. The About copy's disclaimer of any Singapore Armed Forces affiliation
still applies.

## Rules

- `ArenaActor.faction` is set by the host: `addPlayer` gives players the
  forces, and bots are enlisted as contractors. Snapshots with an unknown
  faction are rejected.
- `hostile(a, b)`: the two sides are hostile to each other, and contractors
  never fight each other. Players stay hostile to other players, so LAN matches
  remain a free-for-all between humans with bots against everyone human.
- A bot only picks hostile targets. A round that strikes someone on the
  shooter's own side stops there and does no damage. Artillery and vehicle
  wrecks hurt everyone, whatever their side.
- The role still sets the silhouette within a side (plates and a belt-fed gun
  for the tank, a boonie and a scoped rifle for the sniper), and the role
  colour stays on the helmet band and health bar.

## Friendly squads

Wherever a district has heat (every expedition district), the forces field
small squads of their own: one to four soldiers (`FACTION_SCALE.forces`),
against three to fourteen contractors, so the player still does most of the
fighting. They arrive by the same trucks and helicopters, named
`Pte`/`Cpl`/`Sgt` and a surname. Riflemen and marksmen carry the issued
rifle, support gunners the Ultimax, and none of them drops a weapon. They
fight contractors, never the player: their rounds stop on players without
harm, the player's rounds do the same to them, and the AI pilot skips figures
in friendly uniform.

## Heat

`src/game/faction-heat.ts` keeps one heat value, 0–1, per faction per sector,
plus one for the district as a whole ('').

- **Bands.** Each sector may give each faction a band `{ min, max, curve }`.
  A sub-sector without one uses its `parent`'s, and a top-level sector uses
  the district default for its risk (`DISTRICT_HEAT`). A stronghold rests high
  in a high band, a backwater low, and contested ground runs high for both.
- **Losses.** A casualty raises its own side's heat by `HEAT_TUNING.casualty`
  in the most specific sector at the spot, and half of that (`spill`) in each
  sector above it, up to the district.
- **Leak.** Each rise passes `leak` × the rise × the other side's remaining
  room in its band across to the other side. What leaks in never leaks back,
  and the leak fades as the other side nears its ceiling, so the two cannot
  feed each other without limit.
- **Decay.** Heat drains at `decay` per second back to each band's floor.
- **Curves** turn heat into strength. `linear` is proportional; `slow-burn`
  stays quiet and then escalates; `hair-trigger` answers the first trouble
  hard and levels off; `tiers` steps in thirds, wanted-level style.

Strength, weighted over the top-level sectors by `botWeight`, sets each side's
headcount and its top-up interval between the ranges in `FACTION_SCALE`.
Rides head for the sector whose wanted share most exceeds the troops already
there, and the troops make that sector home: they patrol it and only answer
contacts within `HOME_LEASH` (90 m). Kit follows heat too. Armour on each
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

Review: `scripts/fixtures/faction-uniforms.html` (`?zoom=.3&focus=1.3&yaw=1.15&cols=3`
frames the shoulders).
