# Toa Payoh and Tampines: local ground and social spaces

Implemented 31 October 2026. These are compressed gameplay adaptations, not
surveyed street layouts or a statement of current access at the real sites.
The Queenstown principles were applied selectively: broad estate ground and all
mapped road centrelines remain flat in both districts.

## Toa Payoh: open decks and low park paths

The two playable slab blocks beside the dragon court now have actual level
concrete deck floors, with three small social pockets. A blue table has one
built-in checkerboard; the other two stone tables are plain, with different
four/six-stool arrangements. Separate backed and backless benches leave the
main deck and court approaches clear. Ground piers stop at their real soffit
height rather than becoming invisible columns through the upper galleries.

A level north forecourt and two shallow ramps connect the decks to the sand
court. The sand's existing rendered level, 0.33 game units, is now also its
walking height. These local ramps are about 6–7 percent. They do not turn the
estate into Queenstown's hillside terraces. Ground-level areas keep one visible
finish: the new supported floors replace the old sand and path slabs.

The retained shaded park path joins two low pond-side walks through short side
links. Their paving sits at 0.22 game units; the pond edging is low masonry,
replacing the previous waist-high uninterrupted stone strips. The path stops at
the street kerb, rather than overlapping it. The older separate bank-side walk
and historic-lookout interpretation remain; no new claim of a measured bridge
or restored tower has been added.

## Tampines: a shallow civic threshold and reclaimed quarry banks

The Hub has a shallow, level arrival floor at 0.18 game units and a level sports
surface at its existing 0.7-unit visual datum. A paved collar joins them, while
the front approach descends about 3 percent towards the street. The kerb opens
at that approach. Both court stairs start at the actual sports-surface height.
Orange beam seats recall the cached arrival photo; timber/metal study-table
pockets sit under the concourses. There are no old tiled chess tables at the Hub.

The quarry's repeated exposed-rock stair blocks have been removed. Two unequal
vegetated banks, 0.8 and 1.6 game units high, join a northern dirt approach and
fall back to ordinary ground at their southern ends. Crest paths, low shore
edges and planted slopes share the landform. Trees and loose scrub follow its
height; planting leaves the paths, loot anchors and surrounding roads clear.
The quarry is a former sand-working landscape, not a granite cliff amphitheatre.

`tampines-ground.ts` defines the vertices and triangle split used by both the
rendered mesh and `TAMPINES_BOUNDS.groundHeight`. Walking and vehicle grounding
therefore see the same slopes, including diagonal transitions. Continuous
ground is marked as a ground surface so its bounding box does not close the
low airspace. The town centre, market precincts, range and road network retain
their existing broad flat datum outside these local patches.

The quarry is still spatially compressed beside the town centre. The new banks
and paths are authored relationships, not mapped trail locations, surveyed
heights or a claim that a new public quarry park has been completed.

## References actually inspected

- The cached [Toa Payoh town-park image](../reconstruction/toa-payoh/references/town-park-road-0.png),
  May 2016, shows a straight paver path, level grass verges and mature trees.
  Its existing accepted scope remains unchanged.
- The cached [Hub arrival image](../reconstruction/tampines/references/hub-exterior-0.png),
  January 2023, shows round columns, steps, a sloping side approach and orange
  beam seating. The cached [July 2024 Hub exterior](../reconstruction/tampines/references/hub-outdoor02-0.png)
  retains its existing facade scope. Neither verifies the game's full interior.
- [Little Day Out, Toa Payoh Town Park](https://www.littledayout.com/toa-payoh-town-park-islets-iconic-tower-and-time-travel/),
  photo `03-toa-payoh-town-park-2.jpg`, directly viewed: low stone-lined water,
  grass verges, mature shade trees and small masonry bridges. This is historical
  park vocabulary; the article's redevelopment information is not a survey of
  current conditions.
- [DP Architects, Our Tampines Hub](https://www.dpa.com.sg/projects/our-tampines-hub/),
  project description and `OTH_Carousel_01.jpg`, directly inspected: porous
  ground-floor streets, community gathering and planted terraces; the photograph
  shows the street-facing complex. The model's small study pockets are an
  authored response to that programme, not copies of visible surveyed furniture.
- [NHB, Former Quarries of Tampines](https://www.roots.gov.sg/places/places-landing/Places/landmarks/tampines-heritage-trail-green-spaces-trail/Former%20Quarries%20of%20Tampines):
  indexed official history identifies former sand quarries and the disused
  Tampines Avenue 10 pit. Direct page retrieval met bot verification.
- [Tampines Quarry visitor photographs](https://www.tripadvisor.com/Attraction_Review-g294265-d22978600-Reviews-Tampines_Quarry-Singapore.html),
  photo `1c/73/3b/a2/path.jpg`, directly viewed: an earthen path, eroded ground,
  dense low growth and trees. This supports a vegetated dirt-trail character,
  not the exact bank profile authored in the game.
- [NHB, Former 1973 SEAP Games Village](https://www.roots.gov.sg/places/places-landing/Places/landmarks/Toa-Payoh-Heritage-Trail/Former-1973-SEAP-Games-Village):
  the indexed photograph describes Toa Payoh's blue/white communal board table.
  The page/image could not be retrieved directly (bot verification/404), so no
  exact model or new photo acceptance is claimed. General stone/stool proportions
  were compared with the already viewed public photos linked in the
  [Queenstown notes](QUEENSTOWN-LANDSCAPE.md#communal-furniture-and-photo-references).

Public photographs are review-only, not shipped textures. Game-board patterns
are generated within the actual tabletop material. No new paid imagery was
requested, capture budgets were unchanged and no Google acceptance records were
created. New design metadata is separate from `referenceFeatures`.

## Verification

`toa-payoh-tampines-ground.test.ts` checks unchanged road levels, a single visible
supported finish, bidirectional walking with both player radii, actual terrain
triangles versus sampled support, car grounding in both directions on the quarry
approach and low airspace. Existing region/sector checks guard spawn, stamp,
checkpoint, loot-anchor and vehicle reachability, cover labels and draw budgets.
Existing inhabited-floor checks cover the retained galleries and court stairs.
Walking-height renders inspect the table, deck approaches, park links, Hub seats,
court collar and quarry trails; overhead views supplement them.
