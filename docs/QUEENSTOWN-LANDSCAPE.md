# Queenstown connected hillsides and residential terraces

Queenstown's northern estate rises from the low station edge into connected
residential terraces at 3.6, 6.4 and 10.2 game units. The nine repeated earth
banks have been removed. A long western shoulder and gentler eastern slope
connect the level housing forecourts, library, market, court and garden sites.
These are relative gameplay heights in the compressed district, informed by
[the Singapore elevation research](SINGAPORE-ELEVATION-RESEARCH.md); they are not
surveyed Singapore ground levels.

## Design principles

- Shape a continuous landform before adding local cover and planting. Hillsides
  should connect places and change the horizon over a sustained walk.
- Set buildings and communal spaces on level pads within that landform. Explain
  level differences with retaining edges, slopes and deliberate access routes.
- Make roads, pavements, entrances and forecourts meet at coherent levels.
- Preserve separate surfaces for bridges, upper galleries and the routes below
  them; one ground height cannot describe stacked circulation.
- Give each visible ground area one surface owner. Inside a void deck or stair
  entrance, its concrete floor replaces the terrain and exterior paving.
- Share geometry data with movement and collision. Fix overlaps in the geometry
  rather than hiding them with camera-dependent depth bias or floating floors.
- Keep authored relative heights distinct from surveyed elevations and keep
  feature-level reference provenance explicit.
- Verify the result at walking height and on complete routes, alongside overhead
  views and automated checks.

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

## Void deck surface ownership

The housing layout defines the concrete deck and stair-entry footprints once.
Those same edges split the terrain grid and clip exterior paving, leaving a
single visible floor at the existing walking datum. This prevents coplanar grass
and concrete from flickering and keeps exterior paths from painting over the
interior finish. Terrain ray acceleration reads the actual rendered triangle
indices, preserving these openings in collision and cover queries as well.

## Communal furniture and photo references

Void decks have two small social pockets per block, with twelve pedestal tables
across the six blocks, separate three-seat benches, four- or six-stool groups,
and paired curved benches. Granite, jade mosaic and terracotta finishes vary
between pockets. Four of the twelve tables carry an inlaid game panel: two
Chinese-chess grids with a river and palace diagonals, and two checkerboards.
The panel is baked into the actual tabletop cap material, with no coplanar decal.
Seats and backs have finite-height collision derived from their geometry;
curved seats preserve the openings around the table. The middle passage,
cross-deck route and stair approaches remain open. Furniture uses each block's
existing level pad rather than sampling a new local height for every seat.

The following real photographs were directly viewed on 2026-10-31:

- [The Lion Raw, *Communal Chinese chess tables*, 20 June 2013](https://thelionraw.wordpress.com/2013/06/20/communal-chinese-chess-tables/):
  `img_1193.jpg` shows a granite pedestal table, built-in checkerboard and six
  drum stools; `img_1195.jpg` shows red mosaic tables, white edges and curved
  benches. These informed the two seating families and stone proportions.
- [Jonathan Tan, *Lepak Downstairs*, reproduced by frankie, 4 June 2021](https://www.frankie.com.au/gallery/symmetrical-snaps-from-singapores-public-housing-blocks-565513):
  photographs `...frankie-4.jpg` and `...frankie-11.jpg` show a green mosaic
  horseshoe bench around a plain dark tabletop, and a blue mosaic table with
  six stools and an inset Chinese-chess grid. These informed curved backs,
  plain-table variation and the grid's river/palace layout.

The geometry, surface patterns and furniture positions are authored adaptations.
Reference photos are review-only and are not redistributed as game textures.
These public-photo references do not add Google capture allowance, accepted
Static imagery records or claims about the current furniture at particular
Queenstown addresses. `scene.userData.voidDeckFurniture` records their scope
separately from the district's existing accepted reference features.

## Verification

- `queenstown-landscape.test.ts` checks sustained relief and level site interiors,
  terrain raycasts against movement height, two-way walking at both player
  radii, direct terrace steps, road gradients, uphill/downhill driving, elevated
  dismount support and terrain-relative foliage concealment.
- `queenstown-housing.test.ts` checks void decks, ceilings, galleries and stairs
  at each building's actual base level, including bot access. Ground-deck
  regression rays check that each of the 18 deck/entry footprints has one visible
  floor and no hidden terrain surface.
- Furniture checks cover table/bench collision, single tabletop caps, the social
  approaches and pad heights. Existing complete deck/stair routes remain part of
  the checks. Flight checks guard against merged furniture sealing open airspace.
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
