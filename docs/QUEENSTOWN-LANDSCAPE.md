# Queenstown connected hillsides and residential terraces

Queenstown's northern estate rises from the low station edge into connected
residential terraces at 3.6, 6.4 and 10.2 game units. The nine repeated earth
banks have been removed. A long western shoulder and gentler eastern slope
connect the level housing forecourts, library, market, court and garden sites.
These are relative gameplay heights in the compressed district, informed by
[the Singapore elevation research](SINGAPORE-ELEVATION-RESEARCH.md); they are not
surveyed Singapore ground levels.

## Terrain and access

`queenstown-terrain.ts` defines the ground and level building pads. The renderer
and height sampler use the same indexed triangles, so diagonal cross slopes
have the same elevation in the mesh and movement. Roads preserve continuous
gradual profiles through the hillside, including their junctions. Pavements,
crossings, road markings and forecourt paving follow those profiles.

Housing structure, entrances, collision, upper galleries, return stairs and
facade details share the block's forecourt level. Three downhill terrace edges
have masonry retaining walls and caps. A direct flight of garden steps links
the lower and upper Stirling-inspired forecourts; the longer western estate
approach connects their lateral paths. Bending paths along the western slope
provide a different route character from the straight estate pavements.

The ground sampler is available through the district bounds. Infantry support,
bot navigation, host spawn height, vehicle exit support and car grounding use
that datum. Cars pitch and roll with the local terrain. FPS vehicles use the
same driving kernel on the host; cars cannot climb slopes above its 25 percent
grade limit. Bridges and upper building corridors remain separate walk surfaces,
so the ground sampler never silently turns a roof into ground.

Planting follows the local ground, preserving the distinction between visual
concealment and solid cover. High crowns leave pedestrian views open; shrubs
conceal, while earth, masonry and trunks stop rounds. Existing station, housing,
landmark and stamp layouts remain compressed gameplay adaptations. The new
landform does not add image acceptance records or claim surveyed fidelity.

## Verification

- `queenstown-landscape.test.ts` checks sustained relief and level site interiors,
  terrain raycasts against movement height, two-way walking at both player
  radii, direct terrace steps, road gradients, uphill/downhill driving, elevated
  dismount support and terrain-relative foliage concealment.
- `queenstown-housing.test.ts` checks void decks, ceilings, galleries and stairs
  at each building's actual base level, including bot access.
- Queenstown scene checks cover open roads, reachable stamps, solid furniture,
  retained facade detail and scene batching. Shared movement and vehicle suites
  guard the other districts' flat-ground behaviour.
- `scripts/queenstown-landscape-smoke.mjs` uses ordinary WASD in FPS and exploration
  to climb and descend the sustained estate approach, checking camera feet and
  host actor elevation. Start Vite and an isolated Chrome CDP session, then set
  `FPS_APP_ORIGIN` and `FPS_CHROME_ORIGIN` to those local origins.
- `scripts/review-queenstown-landscape.mjs` saves eight overview and walking-height
  views, including the stairs, retaining edge, contour path and road climb. Set
  `REGION_APP_ORIGIN` and `CHROME_DEBUG_ORIGIN` to the local servers.

## Historical cover comparison

[The earlier cover comparison](evidence/queenstown-cover-comparison.json) and
older `queenstown-landscape-*` evidence images describe the previous nine-bank
layout. Their aggregate distances are historical results, not measurements of
this hillside rebuild. The rebuild's acceptance depends on connected terrain,
usable routes, matching geometry and ground support, and walking-height review.
