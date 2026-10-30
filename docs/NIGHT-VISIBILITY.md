# Night visibility and equipment advantage

Clear direct moonlight should support walking at normal speed: road edges,
kerbs, nearby obstacles and exposed silhouettes should be readable. It should
not make fine detail, uniforms or people in shade easy to identify. The review
target is route reading over roughly 5–15 m, with an exposed figure around
20 m detectable as a silhouette. These are gameplay tuning targets, not fixed
detection guarantees across materials, weather and districts.

Night uses 0.24 directional moonlight, 0.24 sky fill and 1.05 exposure. Sky fill
is a muted blue-grey, with restrained ground bounce. Overcast/rain reduce both
moonlight and sky fill. Streetlamps, windows, vehicle/weapon lights and flashes
retain their local illumination. Existing soft lamp-pool edges and the sky's
ground bounce provide transitions around illuminated areas.

## Geometry controls shelter

`night-exposure.ts` collects static opaque scenery as oriented boxes, retaining
instanced roofs and rotated walls. Sloping route decks are flattened for
clipping so their enclosing boxes do not falsely shadow the exposed top. Effects, invisible meshes, water, glass and
small trim are excluded; green canopy boxes transmit partial light. A bounded
BVH accelerates upward sky and directional moon visibility queries.

The result is baked into nine height slices, with a 4 m target horizontal cell
size capped at 160 cells on each axis. Lit materials sample two adjacent height
slices. This attenuates natural diffuse/specular light while leaving emissive
lamp pools, windows and local lights alone. First-person weapon lighting uses
the same local visibility. Thermal temperature materials remain independent.

Open streets, roofs and elevated spaces can receive moonlight. Walls, roofs
and surrounding buildings reduce it in alleys, interiors and underpasses.
Shelter retains a small residual sky contribution so NVG can amplify a signal
that remains nearly black unaided. The geometry field runs with GPU shadows
and ambient occlusion disabled too. It is a coarse static visibility model,
not triangle-accurate or dynamic object shadowing.

The field bakes once when the atmosphere is created. As the moon moves about
five degrees, its channel is rebuilt in batches of 2,048 samples per frame and
uploaded atomically. No extra scene render pass is added. In the browser review,
initial creation took approximately 0.3–0.9 s across Bishan, Queenstown and Marina
Bay; this is loading work, not a recurring frame cost.

Water body brightness follows moon/sky intensity rather than a fixed nighttime
percentage. Its reflections and glint use the same local visibility field.

## Verification

`night-exposure.test.ts` covers moonlit ground, building shadow, roofs, rotated
walls, instancing, foliage, invisible geometry, height sampling, atomic moon
updates and material-hook cleanup. Lighting and water tests cover twilight,
weather, restored daylight and lifecycle resets.

`node scripts/fps-moonlight-smoke.mjs` compares the previous and candidate builds
in the same calibration yard, then reviews eye-level figures and three real
districts. It checks usable direct moonlight, much darker shelter, a strong NVG
advantage, darker storms and unchanged daylight. Vite defaults are 5200 for the
previous build and 5201 for the candidate, with Chrome DevTools on 9228. Both
servers need the current `vision-render.html`; disable HMR for stable captures.
Evidence is saved in `.cache/fps-moonlight/`.
