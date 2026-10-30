# Map cover and confirmed wounds

Shots in scene-backed solo, expedition and LAN games use the rendered cover
meshes, including their instance transforms. Movement footprints and traversal
guards remain movement constraints. They must not also become bullet walls.
Scene-less simulations retain the footprint/surface fallback.

The Changi viewing circuits draw open rails but use continuous guard volumes to
keep actors from walking off the edge. Combining that volume with mesh cover
filled every gap with an invisible wall. Raffles Square's 0.635 m stone beds
have legacy ground footprints without a maximum height; treating those as
shot cover extended them to 200 m. The same combination affected low props and
open structures throughout the districts.

`createSceneCover` supplies shot/blast cover and sight queries. Designated
visual-only foliage participates in sight without becoming ballistic cover.
Other rendered surfaces, including glass, still block shots. Do not infer
bullet permeability from material opacity. Effects, avatars and vehicles are
excluded from static cover; the simulation resolves actors and vehicles itself.
Flying rounds check each flight segment, including gravity drop, instead of
being permanently clipped to an initial straight aim ray.

## Repeatable checks

Run `pnpm audit:map-cover` for every district, or
`pnpm audit:map-cover -- --district changi --json` for coordinates, mesh names
and instance IDs. The command builds actual district scenes, enables the same
instance acceleration as the game, and casts across each movement obstacle on
both horizontal axes at three heights. Elevated guards use their local base
height. A nonzero `authorityMismatches` count fails the command.

`movementEnvelopeDifferences` describes differences between movement envelopes
and the meshes. Such differences are often necessary: an actor cannot walk
between bars that a bullet can pass through. This column is diagnostic context,
not a count of broken colliders. Thin-post padding and rays starting inside
scenery also appear here.

The regular test suite samples every district, with dedicated positive and
negative regressions for Changi's two railing levels and Raffles' lawn and
stone beds. Other tests fire host-owned rounds through a guard gap and into
a bar, and check dropped rounds against cover outside their initial aim line.

For geometry changes:

1. Add paired ray assertions: one through an intended opening and one into its
   visible frame. Test above and below low cover, both approach directions, and
   each playable storey. Include a real host damage assertion for reported bugs.
2. Run the map audit and existing vertical movement/navigation checks. Treat
   movement and shot cover as separate contracts.
3. Inspect the changed spot in the browser with ray endpoints overlaid. Include
   standing, crouched and prone sightlines, sloped stairs, rotated fixtures and
   instanced rails. Save coordinates with screenshots so another person can
   reproduce the view.
4. In LAN, check a guest's shot against the host's result. Cosmetic trails and
   avatar meshes are not evidence of damage.

The audit is a deterministic geometry sample, not an exhaustive screenshot or
pixel-alpha audit. It does not prove every point on every mesh is correct.
Continue adding targeted probes for newly reported gaps and props.

## Blood without damage

Previously a cosmetic client round emitted flesh effects whenever it touched a
rendered avatar. Damage was resolved separately on the host against its own
body shapes, positions, cover and armor. A continuous rail guard could reject
a shot that the cosmetic round saw passing through a gap. Avatar interpolation,
equipment outside the damage body, friendly actors, spawn protection and armor
deflection could also make cosmetic contact disagree with actual damage.

Cosmetic avatar contact now emits no arena blood. The host publishes bounded,
short-lived wound events only after health decreases, with the resolved impact
point, direction and gun profile. Each client deduplicates these events and
renders mist and nearby wall spatter once, including for a lethal hit. Hits
that do no damage produce neither blood nor a damage marker. Normal tracer and
scenery effects can still be predicted locally.

Regression coverage includes real health loss, lethal wounds, blocked/missed
shots, deflections, repeated snapshots, stale events, malformed network events,
and reset. A moving-target miss also remains covered by the flight tests.

## Review evidence (2026-10-29)

The full district probe run covered 133,506 rays over 19 maps with zero
shot-query/render-ray differences. The [JSON report](evidence/map-cover-audit.json)
contains bounded examples of movement-envelope differences for each district.
The [browser render](evidence/map-cover-review.png) shows the two reported spots:
green rays pass through openings; red rays stop at the visible bars or stone.

A focused browser engine smoke also ran live solo combat: the pilot fired,
the host confirmed damage and published a wound, and the effect pool rendered
impacts without browser exceptions. The older general solo-arena smoke stopped
at its scoreboard DOM assertion before combat; it was not counted as a pass.

Final validation: 136 targeted map/combat tests across 14 files passed, plus
the visibility-cache regression rerun. TypeScript and the production Vite build
passed. The full suite was not rerun to completion on the final checkout.
