# Singapore plants: species, models and places

Research and visual review: 11 November 2026. Seven species, ten original
procedural variants. These are compressed game models and authored planting
choices, **not a survey of plants at real addresses**. Existing buildings, roads,
terrain, landmarks and legacy vegetation are retained. No paid captures, AI image
generation, photo textures or external model assets were used.

## Evidence and visual decisions

| Species and Singapore status | Evidence | Original geometry and placement inference |
| --- | --- | --- |
| Snake plant, *Dracaena trifasciata* — introduced; African origin | [NParks Flora & Fauna Web](https://www.nparks.gov.sg/florafaunaweb/flora/2/4/2420): sun/semi-shade, little water, well-drained soil and container use. Low Wei Teng’s photograph shows stiff tapered blades and transverse mottling. | Pointed folded blades with silver-green bands, in a clay pot or three-clump concrete trough. Bright shop edges and exterior estate bays; never mixed into the moist forest beds. Banding is simplified geometry, not a cultivar identification. |
| Money plant, *Epipremnum aureum* — introduced | [NParks FFW](https://www.nparks.gov.sg/florafaunaweb/flora/1/3/1390): non-native casual, climbing/creeping habit, semi-shade, moderate water; juvenile cordate variegated foliage. Pauline Tay’s photographs were inspected. | Notched heart leaves, yellow patches, visible vines; trailing pot and climbing coir-pole versions. Maintained sheltered residential and shop edges. No planting in native woodland; no claim that juvenile pots have mature deeply divided foliage. |
| Bird’s-nest fern, *Asplenium nidus* — native | [NParks FFW](https://www.nparks.gov.sg/florafaunaweb/flora/1/5/1541), [NParks fern guide](https://www.nparks.gov.sg/publications-resources/articles/is-it-a-fern--double-con-fern!): moist conditions, epiphytic habit, broad undivided fronds. Jeanne Tan’s photograph shows dark midribs and an open rosette. | Continuous folded, arching ribbons around a humus nest. A clay-bowl variant, a planted rosette and a smaller epiphyte supported by a rain-tree crotch. Humid sheltered beds and tended pots; no unsupported floating fronds. |
| Broad sword fern, *Nephrolepis biserrata* — native | [NParks fern guide](https://www.nparks.gov.sg/publications-resources/articles/is-it-a-fern--double-con-fern!): native, large divided fronds. Arthur Ng’s photograph shows numerous narrow pinnae along a central rachis. | Separate paired pinnae on arching rachises. Moist semi-shaded forest shoulders and maintained fern beds are a landscape inference; no tidal inundation or drainage-channel planting. |
| Rain tree, *Samanea saman* — introduced | [NParks Native or Not](https://www.nparks.gov.sg/publications-resources/articles/native-or-not): American origin, planted shade tree with an umbrella crown. Its College Green photograph shows the low fork and broad branching. [Missouri Botanical Garden](https://plantfinder.mobot.org/PlantFinderDetails.aspx?isprofile=0&taxonid=280310) supports sun, moderate moisture and well-drained soil. | Forked trunk, spreading secondary branches, broad shallow crown masses and small compound-leaf accents. A roomy Bishan lawn earns one shade tree. The fern-bearing crotch is an authored association based on fern ecology, not a reproduction of that photographed tree. |
| Sea almond, *Terminalia catappa* — native | [NParks Ketapang](https://biodiversitysg.nparks.gov.sg/our-biodiversity/flowering-plants/trees/ketapang-/): coastal shade tree, horizontal branching tiers and paddle leaves at twig tips. NParks’ [Native or Not](https://www.nparks.gov.sg/publications-resources/articles/native-or-not) photograph supplies russet foliage and branch detail. | Four horizontal tiers with diminishing spread, obovate leaves and sparse russet accents. Sunny Changi coastal lawn inland of the rest strip; no low crown across the walkway. Seasonal accents are fixed, not a simulated seasonal cycle. |
| Sea apple, *Syzygium grande* — native | [NParks FFW](https://www.nparks.gov.sg/florafaunaweb/flora/3/1/3160): coastal/secondary forest, sun, moderate water, oblong irregular crown, opposite leathery leaves and roadside use. Brendon Phuah and Jessica Teo photographs were inspected. | A younger upright tree with irregular crown masses and opposite leaf pairs, at the Ubin visitor-cottage coastal woodland margin. Height is deliberately below mature maximum; the site is an ecological inference, not an inventory record. |

The FFW fern and sea-apple pages intermittently returned HTTP 500. Indexed FFW
text and NParks' fern article supplied evidence; sea-apple photographs were
subsequently retrieved successfully. Free reference images and their URLs are
cached only in ignored `.cache/vegetation/references`; no reference photography
is redistributed with the game.

## Placement and deliberate absence

`vegetation-sites.ts` extends the existing complete-group site validator:

- Queenstown: money-plant and fern pots in sheltered outer residential bays;
  drained snake-plant troughs at bright exterior edges. Lobby routes win over pots.
- Existing named shopfront strips: replace the generic shrub pot with the
  identifiable snake plant, suitable for bright or semi-shaded maintained edges.
- Katong: a coir-pole money plant under the Red House frontage shelter and a
  watered fern bowl at the pavilion eave.
- Changi: small fern beds in the filtered-light Jewel garden, outside its radial
  approaches; sea almonds on open coastal lawn, inland of the pedestrian strip.
- Bishan: a wide-crowned rain tree in the west park lawn, away from the path and
  flood channel. The east candidate conflicts with existing scenery and stays empty.
- Upper Thomson: native ferns on a flat portion of the existing wooded shoulder.
  Other candidates fail access/road checks; the slope is not levelled to fit them.
- Pulau Ubin: a cultivated money plant at the village edge; native sea apple and
  ferns at the visitor-cottage woodland margin. Mangrove water, boardwalks and
  forest clearings receive no ornamental pot scatter.

Species combinations, sizes, irrigation/maintenance assumptions and exact sites
are authored inferences. There are no district quotas, fallback scatter or
relocation attempts after rejection. Other districts remain deliberately open.
Every accepted object retains its site, feature and purpose; rejected groups
retain a reason in `streetPropSiteAudit`. Ground offsets are checked against the
actual finished scene, including Queenstown terrain elevations.

## Runtime and review

`vegetation-props.ts` builds shared geometry/material templates. Fixed parts are
merged by material and instanced by the existing spatial batching system. There
is no new animation loop or texture download. Pots break into bounded cosmetic
pieces; the coir-pole pot can tip; the concrete trough and tree wood are fixed.
Ground ferns and all new foliage are non-solid and excluded from ballistic cover.
Wood-only tree colliders retain clear air beneath crowns. The original geometry
is available for model review; batching preserves the foliage exclusion flag.

All ten variants appear in `/prop-designs` and the existing model discussion
catalog. Tree previews use a larger floor, shadow volume and camera far plane;
the grid is labelled at 1 m for trees and 30 cm for smaller props. Ground ferns
are labelled non-solid planting rather than solid fixtures.

Validation commands: `pnpm test`, `pnpm typecheck`,
`node scripts/street-props-smoke.mjs`, `node scripts/vegetation-smoke.mjs` and
`node scripts/asset-review-smoke.mjs`. Browser scripts accept `FPS_APP_ORIGIN`
and `FPS_CHROME_ORIGIN`; the vegetation smoke writes district overview/walk-height
screenshots and render metrics. Automated tests check shared resources, grounding,
model extents, actual scene floors, complete groups and foliage/wood cover
separation. Render metrics describe the local renderer, not a mobile FPS guarantee.
