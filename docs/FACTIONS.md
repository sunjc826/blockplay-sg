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
