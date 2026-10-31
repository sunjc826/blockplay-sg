# Singapore elevation patterns for the Queenstown map

Research date: 31 October 2026. Scope: terrain research and a proposed modelling
approach; no map geometry changes.

Queenstown should have connected slopes and distinct site levels that shape its
roads, housing and walking routes. Repeating small earth banks across a flat
estate misses those relationships. The strongest starting point is a hilly
Stirling / Mei Ling setting, combined with carefully identified examples of
terraced housing sites and infrastructure crossings.

## What the sources establish

| Location or subject | Evidence | Implication for the map |
| --- | --- | --- |
| Stirling | HDB describes hilly terrain and shows housing rising behind sports facilities. Its guidance connects building massing to topography. See the Queenstown Town Design Guide, pages 50–52. | Author a connected hillside with level pads for buildings and facilities. Avoid giving every block the same ground elevation. |
| Holland and Commonwealth | HDB identifies hillside housing and undulating terrain, with terraces and lookout points responding to contours. See pages 67 and 69. | Use irregular, connected slopes and contour-following routes. This is a distinct neighbourhood character, not a template for every Queenstown lawn. |
| Queensway Rail Corridor node | URA identifies an elevated mound west of the trail, sloping sides along the trail, and sheltered space below the flyover. | Model the relationship between trail, banks, adjacent land and overhead road. An isolated mound cannot convey the crossing. |
| Dawson | HDB's 2016 SkyOasis design describes a second-level roof garden accessible from ground level, using terrain differences to connect to Alexandra Canal Linear Park. | A garden can meet uphill ground while covering rooms on its downhill side. Preserve both the landform and the structure. The source describes a design, not an as-built survey. |
| Alexandra Canal Linear Park | NParks describes the park as decked over Alexandra Canal, extending from Queenstown MRT through Strathmore towards Tanglin Road. | Represent the park surface separately from the covered drainage infrastructure. Do not turn this entire corridor into an exposed canal or generic valley. |

Sources: [HDB Queenstown Town Design Guide](https://www.hdb.gov.sg/-/media/about-us/our-role/plan-and-design-towns/town-design-guides/Queenstown-Town-Design-Guide.pdf),
[URA Rail Corridor, Queensway Node section](https://www.ura.gov.sg/land-planning/shaping-our-city/identity-corridors/rail-corridor/),
[HDB SkyOasis design description, pages 4–5](https://www.nas.gov.sg/archivesonline/data/pdfdoc/20161118003/Embargoed%20till%2020%20Nov%201pm%20-%20Press%20Release_LEAF%20_Nov16.pdf),
and [NParks Gardenwise, August 2020, printed page 20](https://www.nparks.gov.sg/sbg/research/publications/-/media/sbg/gardenwise/gw_pdf_2020-2029/gw_2020_vol_55_%28aug%29.pdf).
Page numbers for the HDB guide refer to the numbers printed on the relevant
pages; its contents list does not consistently match the later sections.

## Patterns to distinguish across Singapore

The following are modelling categories inferred from the examples. They describe
different relationships between land and construction, rather than a list of
objects to distribute evenly.

1. **Continuous hillsides and ridges.** The ground rises over a substantial area,
   with asymmetrical slopes, shoulders and low routes between higher ground.
   Roads and paths should have a reason to climb, turn or follow a contour.
   For a larger landscape example, URA describes the Southern Ridges as retaining
   original terrain and a ridge extending westwards towards Clementi.
   [URA Southern Ridges Conservation Area](https://www.ura.gov.sg/conservation/find-a-building/conservation-portal/sridges/)

2. **Level building pads within sloping land.** A block, court or forecourt can be
   level even when its neighbours sit higher or lower. Connect the pads with
   planted slopes, retaining edges and deliberate access routes. URA's earthworks
   guidance explicitly recognises differences within a site and between sites
   and roads. It discourages extensive terrain alteration and high retaining
   walls. These guidelines concern flats and condominiums; they are useful
   context, not measurements of existing HDB estates.
   [URA Earthworks, Retaining Walls, and Boundary Walls](https://www.ura.gov.sg/guidelines/development-control/development-control-handbooks/residential/flats-condominiums/earthworks/)

3. **Routes connecting different levels.** A short stair route and a longer ramp
   can connect the same destinations. Landings, retaining walls, sheltered links
   and visible entrances should explain the connection. Their exact locations
   and gradients need site evidence; do not invent a switchback at every bank.

4. **Transport crossings with multiple surfaces.** A flyover, trail and adjacent
   slope can occupy the same plan area at different heights. The Queensway
   example supports this directly. The player's view beneath a crossing matters
   as much as the silhouette from above.

5. **Ground joining a roof or podium.** The Dawson example supports a gradual
   transition from outdoor ground to a structural garden deck. A terrain mesh
   alone cannot represent occupied or traversable space beneath that deck.

6. **Drainage depressions and floodplain slopes.** These are a separate pattern
   from hillside housing or covered canals. At Bishan–Ang Mo Kio Park, low
   parkland beside a naturalised river accommodates higher water during storms.
   Use that pattern for suitable river maps; do not transfer it wholesale to
   Alexandra Canal Linear Park.
   [NUS Cities on Bishan–Ang Mo Kio Park](https://cde.nus.edu.sg/nuscities/how-to-make-cities-more-water-sensitive/)

The common visual language comes from the transitions: a wall visible on the
downhill side, a path with a cross-slope, a building entrance meeting a landing,
or a low route continuing beneath a bridge. Small details should explain the
larger terrain rather than substitute for it.

## Why the current Queenstown terrain feels repetitive

[`queenstown-landscape.ts`](../src/game/queenstown-landscape.ts) defines nine
rectangular banks, ranging from 1.6 to 3.2 game units high. Each uses the same
small crest and four flared planar slopes. `queenstownTerrainHeight` takes the
maximum bank contribution and returns zero outside them. Each bank therefore
climbs from, and descends back to, the same surrounding datum.

[`queenstown-scene.ts`](../src/game/queenstown-scene.ts) places the main ground,
roads and ordinary paths at a common level. Special bank paths follow the banks,
but the street network does not participate in the landform.
[`queenstown-housing.ts`](../src/game/queenstown-housing.ts) similarly starts all
six older housing blocks' void decks at zero.

The banks do supply walkable slopes and interrupt sightlines. The existing
landscape tests check those properties and cover distances. They do not check
neighbourhood landform, road gradients, differences between building pads or
terrain fidelity. Passing those tests cannot establish that the estate resembles
Queenstown's topography.

## Proposed Queenstown rebuild

Keep the compressed game layout explicit. Before assigning terrain to game
coordinates, map the selected real examples to the existing landmarks and choose
a consistent geographic orientation. A Commonwealth-inspired block label alone
does not establish its surveyed location. Southern Ridges terrain belongs to the
wider context; it should not become a large hill beside Queenstown MRT simply
because it is within the broader planning area.

Build one coherent route first:

**Lower street and transport edge → rising estate access → level housing
forecourt → higher residential terrace.**

The arrows describe a proposed gameplay sequence, not a surveyed transect.
Give it a direct pedestrian climb, a longer accessible route and a road that
reaches a plausible vehicle entrance. From the lower road, the upper forecourt
should remain visibly higher. Walking past a single crest and immediately
returning to the original ground level should no longer be the dominant pattern.

Then extend the terrain around that route:

- Shape a broad, asymmetrical hillside across several plots. Keep some long
  slopes and some flatter areas; avoid uniform noise and equally spaced peaks.
- Cut level pads into the hillside for housing, shops and recreation. Use
  retaining edges where a pad meets lower land, and slopes where there is room.
- Give roads explicit height profiles and match junction elevations. Make
  pavements, crossings, bus stops and driveways meet their roads.
- Rebase building structure, collision, entrances, stairs and facade details
  together. Lifting the decorative building while leaving the void deck at zero
  would create a false entrance and broken movement.
- Add a Queensway-inspired crossing only where the compressed layout can explain
  its trail and surrounding terrain. Keep proposed community-node designs
  distinct from existing site conditions.
- Use a Dawson-inspired garden deck where the architecture supports it, with
  separate upper and lower surfaces and a believable connection to the park.
- Add drains, kerbs, walls, planting and railings after the heights and routes
  work. Their geometry should follow the site rather than repeat at fixed gaps.

Represent base terrain and building pads in shared height data used by rendering,
walking support and object placement. Keep bridges, decks and underpasses as
separate surfaces: a single height for each horizontal position cannot describe
stacked routes. Review vehicle grounding and movement separately before claiming
that sloping roads work in drive mode.

Use relative levels for the first prototype. These sources establish terrain
types and some vertical relationships; they do not establish exact ground heights
or gradients at the game's coordinates. Select numerical heights after checking
the chosen sites, route lengths and the game's compressed scale.

## Elevation data and reference strategy

| Source | Appropriate use | Important limit |
| --- | --- | --- |
| HDB guide, URA site descriptions and NParks material | Identify local terrain character, named places and relationships between land and infrastructure. | Planning illustrations and design intentions do not establish present-day constructed levels. |
| SLA OneMap | Locate roads, buildings and named reference sites before relating them to game coordinates. | The existence of a map or 3D viewer does not establish access to a reusable ground-elevation dataset. |
| SLA National 3D Mapping Programme | Potential authoritative source to investigate for detailed terrain. | SLA describes mapping cycles in 2014, 2019 and 2024; its article does not supply an unrestricted terrain download. |
| Copernicus GLO-30 | Broad terrain context, checked against other evidence. | Approximately 30 m spacing; it is a surface model including buildings, infrastructure and vegetation. It cannot resolve estate stairs or small retaining edges. |
| FABDEM | Candidate for comparing broad ground shape after reducing building and tree biases. | Approximately 30 m spacing remains coarse. The published licence is CC BY-NC-SA 4.0; obtain suitable rights before commercial incorporation. |

Sources: [SLA OneMap](https://www.sla.gov.sg/geospatial/onemap/),
[SLA on national mapping](https://www.sla.gov.sg/articles/-the-lines-that-define-singapore/),
[Copernicus DEM documentation](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM),
and [University of Bristol FABDEM V1-2](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/).

The next reference pass should concentrate on a few useful sections: road to
housing forecourt at Stirling / Mei Ling; Queensway trail to bank to flyover; and
Dawson garden deck to park. For each, record where the route starts and ends,
which surfaces are higher, the retaining edges, and whether a photograph shows an
existing condition or a proposal. Record source dates and any measured heights
with their datum. Prefer cached accepted site references before new captures,
following [the repository reference workflow](REFERENCE-CAPTURE.md).

## Acceptance criteria for implementation

- A walk across several plots shows a sustained change in level, with coherent
  flat areas and slopes between them.
- Buildings visibly meet their own forecourts, and every public entrance meets
  its approach route without a hidden step or floating threshold.
- Direct and longer pedestrian routes reach the same landing; the return journey
  works without jumping or snagging.
- Road junctions, pavements and driveways connect continuously. Vehicle behaviour
  on slopes is tested in drive mode.
- Lower and upper routes remain independently traversable beneath a crossing.
  Collision and cover match the rendered earth and retaining structures.
- Walking-height comparisons show distinct terrain character at the selected
  locations. Overhead screenshots and aggregate cover scores are supplementary.
- Provenance identifies which relationships follow references and which heights
  or spatial arrangements remain gameplay adaptations.
