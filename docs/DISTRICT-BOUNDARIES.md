# Authored district boundaries

The land-facing edges use three layers: a readable physical limit at the existing
movement boundary, nearby buildings or vegetation, and a larger backdrop fading
into the district's existing fog. Ground continues beyond the playable rectangle
so elevated views no longer reveal a floating plate ending in empty sky.

This applies level-design techniques of occlusion, consistent scale and readable
restrictions. [Epic's blockout guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/designer-01-project-setup-and-level-blockout-in-unreal-engine)
explains how scenery can communicate impassable routes and guide movement. The
specific layouts here are authored game scenery, not reconstructions of real
Singapore district borders. No new reference capture or fidelity claim is made.

| Setting | Boundary treatment |
| --- | --- |
| CBD and Orchard | Planters / service walls, office backs and staggered towers |
| Heartland estates | Planted retaining walls, housing backs and layered blocks |
| Heritage neighbourhoods | Rear courtyard walls and low-rise service façades |
| Forest and park districts | Retained banks, dense canopy and deeper forest |
| Airport and industrial areas | Concrete fence bases, tall steel palisades and service buildings |
| Rail termini | Covered, screened turnback yards around the existing track ends |

`src/game/district-boundaries.ts` defines the profiles for all 23 districts and
adds the scenery through the shared region registry. Sea-facing sides remain
open; Punggol preserves its smaller waterfront opening with a matching water
continuation outside the playable edge. The island of Pulau Ubin
retains all four open coastal sides. The river-facing edge at Raffles and the
Causeway outlook at Woodlands retain their open views.

Every nearby district gateway cuts a broad opening in the foreground boundary.
A short road beyond it turns behind the surrounding scenery, suggesting further
streets without showing a straight road into blank space. The real crossing,
arrival, boardwalk width, movement bounds, collision obstacles and train clocks
remain unchanged. Covered rail yards keep their centre lanes clear and use the
same track extents as the train service.

The new geometry uses shared materials and instanced boxes / crowns (at most 16
instanced batches per district, plus ground and approach-road surfaces). Distant scenery and outside ground skirts have raycasting
and per-building window effects disabled. Foreground limits and rail-yard shells
retain shot surfaces. All scenery is excluded from cover-density metrics and
shadow casting; it owns and disposes its resources separately from each scene.
There are no new models, textures, fetches, lights, paid requests or audio.

Verification: boundary tests sweep all 23 profiles for visible inland limits,
open coast sides, checkpoint widths, skirt normals and disposal. Existing rail
cycle tests check rendered support and unobstructed lanes through the covered
yards. Region / boardwalk tests cover collectibles, travel and playable access.
`node scripts/district-boundaries-smoke.mjs` captures 18 ground / elevated edge
views, three explicit coastal outlooks and all five rail yards; start Vite and isolated Chrome first, and set
`FPS_APP_ORIGIN` / `FPS_CHROME_ORIGIN` as needed. Evidence goes into
`.cache/district-boundaries/`.
