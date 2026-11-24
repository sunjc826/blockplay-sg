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
| Sea almond, *Terminalia catappa* — native | [NParks Ketapang](https://biodiversitysg.nparks.gov.sg/our-biodiversity/flowering-plants/trees/ketapang-/): coastal shade tree, horizontal branching tiers and paddle leaves at twig tips. NParks’ [Native or Not](https://www.nparks.gov.sg/publications-resources/articles/native-or-not) photograph supplies russet foliage and branch detail. | Four horizontal tiers with diminishing spread, obovate leaves and sparse russet accents. Sunny Changi coastal sandy strip inland of the rest strip; no low crown across the walkway. Seasonal accents are fixed, not a simulated seasonal cycle. |
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
- Changi: tended fern bowls at the filtered-light Jewel garden edge, outside its radial
  approaches; sea almonds on the coastal sandy planting strip, inland of the pedestrian strip.
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

## Palms (23 November 2026)

Four palms that grow in Singapore replace the pole-and-star palms. Morphology is
from each species' NParks Flora & Fauna Web page, read on 23 November 2026;
where FFW gives no figure the fallback is named. Numbers live in
`src/game/palm-species.ts`, geometry in `src/game/palm-models.ts`. Original
procedural geometry; no photographs, textures or outside models.

| Species and status (as NParks states it) | Evidence | Geometry and placement |
| --- | --- | --- |
| Coconut, *Cocos nucifera* — originally Western Pacific, now pantropical | [FFW 5618](https://www.nparks.gov.sg/florafaunaweb/flora/5/6/5618): solitary; slender grey trunk prominently ringed with leaf scars; pinnate leaves to 5 m, ascending to spreading to drooping; 80–100 pairs of lanceolate leaflets 50–150 cm; inflorescence from within the lower fronds; ovoid fruit to 30 cm, green or yellow ripening brown. Landscape use: coastal, roadside, beachfront. Photographs by Jessica Teo and Robert Teo Chee Hin. | Leaning ringed trunk with a flared foot, no crownshaft, a fibrous boss, 14 fronds from an upright spear to one dead hanging frond, flat-plane drooping leaflets, a cluster of nuts. Sentosa beaches and lawns, Changi coastal strip. The lean and flared foot are not on FFW; they are common habit, authored. |
| Royal palm, *Roystonea regia* — introduced (Florida, Mexico, Central America, Caribbean) | [FFW 2682](https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2682): solitary; massive trunk bulging slightly towards the middle, concrete-grey with closely spaced rings; glossy green crownshaft to 2 m; pinnate leaves to 3 m, plumose and rather tangled; dead fronds fall whole; inflorescence below the crownshaft; "impressive when formally massed along avenues". About 15 leaves is from Wikipedia citing Zona (1996). | Straight grey trunk with a mid-height bulge, green crownshaft, 14 fronds with leaflets in four planes, no hanging dead fronds. Marina Bay: PWP Landscape Architecture describes the waterfront promenade's "[triple allée of Roystonia palms](https://pwpla.com/projects/marina-bay)"; the species within *Roystonea* is not confirmed. Kampong Glam mall: an authored avenue choice. |
| Sealing wax palm, *Cyrtostachys renda* — native, Critically Endangered | [FFW 2618](https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2618): clustering; distinctively red crownshaft, red leaf sheaths about 60 cm; leaves about 1.5 m by 0.6 m with bright red stalks and midribs; boat-shaped leaflets about 45 by 4 cm; semi-shade or sun, wet ground; the palm in the Singapore Botanic Gardens' logo. Stems to 10 cm are from Wikipedia citing Heatubun et al. (2009). Photographs by Mervyn Tan, Jennie Tang Yurue and Shi Biying. | A clump of six slender ringed stems of mixed heights, red crownshafts and red ribs, stiff upswept fronds. Built and in the lineup; **not placed in any district yet** (it wants a wet garden edge, such as a Botanic Gardens level). |
| Footstool palm, *Saribus rotundifolius* — non-native (spontaneous, casual) | [FFW 2653](https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2653): solitary; long-stalked, spirally arranged fan leaves, blades almost round, regularly divided to about half their length, 1.2 m across; "suitable for growing along streetscapes". Trunk 15–25 cm with shallow rings is from Wikipedia citing Whitmore. | Slender trunk, a round head of long-stalked pleated fans whose outer half is free tips. Built and in the lineup; **not placed in any district yet**. |

Limits and unknowns:

- Game-scale heights (6–12 m) are younger palms, far under the species maxima.
- A drawn frond carries 8–14 pairs of wide leaflets where the plant has 50–100
  narrow ones; each stands for several.
- Bussorah Street's real palms were not identified from any source; royal palms
  there are an authored choice, not a record. Sentosa's coconuts rest on FFW's
  beachfront use and travel guides, not an official planting list.
- Raffles Place keeps its earlier folded fan palms.
- Colliders, cover and what stops a round are unchanged: palm fronds still stop
  rounds as the old fronds did, and each palm keeps its 0.9–1 m square collider.

Cost: a coconut or royal palm is about 1,430–1,500 triangles in two instanced
draws per shape (three shapes per species). Marina Bay's 79 palms are about
119,000 of the district's 583,000 triangles; Sentosa's 81 are about 116,000 of
283,000 (its old blob palms were about 880 each). Counted from the built scene,
not a frame-rate measurement.

### Leaf light

`src/game/leaf-shading.ts` gives foliage a transmitted-light term: light landing
on the far face of a thin leaf comes through yellower, for the sun, moon and
lamps, after their shadows; closed crown shapes get a wider wrap; both get a
small unshadowed share of the sun for the light a crown passes down through
itself. It applies to palm fronds, every wind-batched crown (`batchTrees`), the
species props above and street-prop foliage. Colour detail on palms (ring scars,
paler ribs, darker leaflet tips, yellowing old fronds, shade inside the crown)
is in vertex colours, not textures.

Review: `scripts/fixtures/palms.html` shows the four species, three shapes each,
beside a 1.75 m figure, with the same controls as `vegetation.html`.

## Botanic Gardens plants (24 November 2026)

Five more plants, built for the Botanic Gardens district. Morphology is from the
NParks pages named below, read on 24 November 2026. Numbers live in
`src/game/plant-species.ts` (and `palm-species.ts` for the nibong), geometry in
`src/game/plant-models.ts`. Original procedural geometry; no photographs,
textures or outside models. `scripts/fixtures/plants.html` shows them in a row.

| Species and status (as NParks states it) | Evidence | Geometry and placement |
| --- | --- | --- |
| Nibong, *Oncosperma tigillarium* — native, Least Concern | [FFW 2659](https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2659): tall, slender, tuft-forming palm massed with armed trunks; trunks to 15 cm across, ringed, up to 50 to a clump, densely armed with slender black spines 5–10 cm long; conspicuous armed crownshaft; pendulous, arched fronds with drooping leaflets; purple to black fruit 1 cm across | Six slender stems to a clump, black spines standing off each, hanging leaflets. On Swan Lake's island and at its shore |
| Tembusu, *Cyrtophyllum fragrans* — native, Least Concern | [FFW 2895](https://www.nparks.gov.sg/florafaunaweb/flora/2/8/2895): to 30 m, deeply fissured bark, buttress roots to 2.5 m tall, irregular shape, elliptic leaves 5–13 cm, berries turning orange or red. [HT 2001-26](https://heritagetrees.nparks.gov.sg/heritagetrees/ht-2001-26/): the Lawn E tree is 20 m tall with a 5 m girth, dark brown fissured bark, light green leaves and a "unique lower lateral branch" | Dark bark in alternating strips, limbs that leave level and turn up, small buttresses, orange berries. Half the lawn trees; the Lawn E tree is its own shape with the long low limb |
| Jelawai Jaha, *Terminalia subspathulata* — native, Critically Endangered | [HT 2001-25](https://heritagetrees.nparks.gov.sg/heritagetrees/ht-2001-25/), the tree at the Rain Forest entrance: 38.4 m tall, girth 8 m, "buttresses are up to 5 m high", trunk heavily buttressed, bark pale brown with narrow cracks, crown wide, flat-topped, open and tiered. [FFW 3302](https://www.nparks.gov.sg/florafaunaweb/flora/3/3/3302): to 45 m | Six plank buttresses to 5 m, a clear pale bole, three flat tiers of limbs. One Rain Forest tree in six, at 25–31 m |
| Torch ginger, *Etlingera elatior* — non-native, grown as an ornamental | [FFW 1990](https://www.nparks.gov.sg/florafaunaweb/flora/1/9/1990): upright, arching at the tips, 2–6 m, in large colonies; leaves in two ranks, 38–85 by 8–18 cm; an egg-shaped head of crimson-pink bracts on its own stalk 60–200 cm long | Nine arching stems with two-ranked leaves and heads on separate stalks. Most Ginger Garden clumps, 2.6–3.8 m |
| Hanging lobster claw, *Heliconia rostrata* 'Green Tip' — non-native, cultivated only | [FFW 8045](https://www.nparks.gov.sg/florafaunaweb/flora/8/0/8045): about 1.5 m, paddle-shaped leaves, pendant inflorescences in one plane, bright red bracts with yellow edges | Long-stalked paddle leaves and hanging chains of red and yellow bracts. Drifts along Palm Valley's east rim, where SBG places its Heliwalk |

What NParks does not state, and so is authored:

- Nibong: frond length, crownshaft and trunk colour, and its place in the
  Gardens. The NParks page that described Swan Lake's island returned 404; the
  nibong there rests on a search summary of that page, not a page I could read.
- Tembusu: the low limb's length, height and girth (modelled 10 m long, leaving
  2 m up). NParks' own figures for the tree disagree: 20 m and 5 m girth on the
  register, 30 m and 6 m in a 2016 SBG list. The register's are used.
- Jelawai Jaha: buttress spread and thickness, and the height of clear bole.
  Other large trees NParks names for the Rain Forest (Jelutong, Nemesu, Seraya,
  Kempas) are not modelled; this one was chosen because its buttresses are
  measured.
- Torch ginger: the size of the flower head. Heliconia: leaf size and the
  number of bracts. The Ginger Garden page names no species, so torch ginger
  there is an authored choice from the ginger order it holds.
- A tree's leaf sprays and a herb's leaves are far fewer and larger than life.

Cost: a Tembusu is about 1,500 triangles, a Jelawai Jaha 2,200, a nibong clump
3,500, a ginger clump 700 and a heliconia 300. The Botanic Gardens draws about
463,000 triangles in all, 157,000 of them these trees and herbs and 120,000 its
palms. No frame-rate measurement was taken on a real GPU.

## More Botanic Gardens species (24 November 2026, second pass)

Seven more shapes, replacing every stand-in tree in the Botanic Gardens. Pages
read on 24 November 2026. Trees are in `plant-species.ts`; the cycad and tree
fern are palm-shaped, so they are in `palm-species.ts` and drawn by the palm
builder.

| Species and status (as NParks states it) | Evidence | Geometry and placement |
| --- | --- | --- |
| Rain tree, *Samanea saman* — non-native (northern tropical South America), widely cultivated | [FFW 3106](https://www.nparks.gov.sg/florafaunaweb/flora/3/1/3106): usually to 30 m in cultivation; crown symmetrically umbrella-shaped, 20–30 m across, branching low; bark dark brown, fissured; bipinnate leaves of small leaflets; powderpuff flowers pink above, white below | A short dark bole forking low into limbs that level out under a flat crown wider than the tree is tall; pink flecks. Half the lawn trees, 9–14 m |
| Yellow rain tree — the same species | [SBG heritage landscapes](https://sbg.nparks.gov.sg/attractions/heritage-trees-and-landscapes/): the Bandstand's lawn is "planted with a ring of Yellow Rain Trees (Samanea saman), some of which were reproduced by cloning" | The rain tree in yellow-green leaf. Eight in a ring round the Bandstand |
| Jelutong, *Dyera costulata* — native, Vulnerable | [HT 2015-239](https://heritagetrees.nparks.gov.sg/heritagetrees/ht-2015-239/), at the Rain Forest entrance: 29.2 m tall, girth 4.10 m; crown lofty, dense and dome-like, of many ascending limbs each ending in a conical head of foliage; leaves in whorls, emerging reddish-pink. [FFW 2866](https://www.nparks.gov.sg/florafaunaweb/flora/2/8/2866): to 80 m; bark dark grey, brown to black; crown distinctly tiered when young, irregular when mature | Grown form: a clear dark bole under a dome of ascending limbs, 20–27 m, about one forest tree in seven. Young form: level whorls of limbs up a leader, 11–18 m, about two in three |
| Kapur, *Dryobalanops aromatica* — non-native (Sumatra, Borneo, Peninsular Malaysia) | [HT 2012-193](https://heritagetrees.nparks.gov.sg/heritagetrees/ht-2012-193/), near the Bandstand: 18 m tall, girth 3.25 m, planted July 1942. [FFW 2862](https://www.nparks.gov.sg/florafaunaweb/flora/2/8/2862): to about 45 m, trunk fissured, buttresses, ovate leaves 4–6 cm. The SBG page lists Kapur near Swan Lake, the Bandstand and the Heritage Garden | A straight fissured bole on small buttresses, an open crown of small sprays up a leader. One by the Bandstand (18 m), one by Swan Lake |
| Paku Raja, *Cycas edentata* — native, Critically Endangered | [FFW 5651](https://www.nparks.gov.sg/florafaunaweb/flora/5/6/5651): palm-like, usually unbranched trunk to about 10 m; spiny fronds to 2.3 m of 100–200 glossy, stiff, narrowly boat-shaped leaflets set neatly either side | A squat scarred trunk and a stiff shuttlecock of flat fronds. Evolution Garden, 1–2 m of trunk |
| Tree fern, *Alsophila latebrosa* — native, Least Concern | [FFW 1544](https://www.nparks.gov.sg/florafaunaweb/flora/1/5/1544): a single trunk to 4 m bearing several large fronds, "Fountain (Palm-like)"; fronds bipinnate, middle pinnae up to 75 by 25 cm | A slender dark trunk and arching fronds of broad pinnae. Evolution Garden, 2–3.6 m |

What NParks does not state, and so is authored:

- Rain tree: that the Gardens' lawn trees are rain trees. NParks lists heritage
  rain trees at the Nassim drop-off, not on these lawns. The yellow form's leaf
  colour and the ring's count of eight are authored; the Bandstand's own NParks
  page returned 404, so "yellow from a mutation" rests on a search summary.
- Jelutong: buttresses (neither page mentions any, so none are drawn), the
  height of clear bole, and the share of the forest it makes up. The two NParks
  pages place the heritage tree differently (Rain Forest entrance; "between
  Maranta Avenue and the Ginger Garden").
- Kapur: bark colour, crown shape beyond Corner's "open, fine-leafed", and
  buttress size. NParks' older figures for the Bandstand tree differ from the
  register's; the register's are used.
- Cycad and tree fern: the Evolution Garden's own page returned 404. That it
  shows cycads and tree ferns rests on a search summary of NParks' guide, and
  no species is named, so both species are an authored choice of the natives.
  Trunk girth and colour for both, and the tree fern's frond length, are not
  on FFW. The tree fern's pinnae are drawn whole, not divided a second time.

Cost: a rain tree is about 1,170 triangles, a grown Jelutong 1,300, a young
one under 700, a Kapur 1,400, a cycad 1,270 and a tree fern 770.
The Botanic Gardens now holds about 651,000 triangles in all, up from 463,000
with stand-in trees and above Marina Bay's 583,000. No frame-rate measurement
was taken on a real GPU.

## Leaves on the sprays (24 November 2026, third pass)

A broadleaf tree's crown is built from flat sprays one to two and a half
metres across. Until this pass each was a plain green sheet, and read as one.
`src/game/leaf-cards.ts` now draws each spray as a twig carrying separate
leaves and cuts the rest of the sheet away. The geometry, cover and what a
round strikes are unchanged; this is presentation only.

| Tree | Arrangement drawn | NParks statement it follows |
| --- | --- | --- |
| Tembusu | pairs of elliptic leaves opposite each other | FFW 2895: opposite, elliptic, 5-13 by 2-5.5 cm |
| Kapur | small ovate leaves alternating on fine twigs | FFW 2862: broadly ovate, 4-6 by 2-4 cm |
| Jelutong | whorls of five to seven long leaves | FFW 2866: whorls of 4-8, 5.5-42 cm long |
| Jelawai Jaha | rosettes of spoon-shaped leaves at twig ends | FFW 3302: spoon-shaped, spiralled at twig ends |
| Rain tree | twice-divided leaves, rows of small leaflets on each pinna | FFW 3106: bipinnate, small leaflets |

- The leaves are drawn from numbers into one 1024-pixel atlas (three sprays
  per arrangement) the first time a leaf material compiles. No photographs.
- Each leaf swings about the point its stalk meets the twig, on its own clock,
  and brightens and darkens a little as it turns. A rain tree's leaflets turn
  with their pinna. Each spray also flaps and twists about its base. Both
  follow the tree wind's strength and gust fronts and stop under reduced
  effects.
- A crown's shadow is cut the same way.
- The dark solid that used to fill the middle of each leaf mass is gone; three
  sprays crossing through the centre stand in for it, two triangles fewer per
  mass.

Authored, not stated by NParks: leaves are about twice life size (each stands
for several); the number of leaves on a spray; the twig's branching; the
angle a leaf leaves its twig at; the count of pinnae and leaflets on a rain
tree leaf; how far and how fast a leaf swings.

Limits: palms, the cycad, the tree fern, the gingers and heliconias already
model each leaf or leaflet as geometry and are unchanged. Under thermal vision
a spray is still a whole sheet. A spray seen edge-on is hidden rather than
drawn as a streak. Checked in software-rendered captures only; no frame-rate
measurement on a real GPU.

### Every other district (24 November 2026, fourth pass)

The trees of the other districts are a trunk under rounded crown shapes, with
no species. `batchTrees` in `src/game/tree-wind.ts` now draws each such shape
as a mass of 48 leaf sprays the size of the shape (`leafMassGeometry`), in the
crown's own colour, each crown turned differently, with the same per-leaf and
per-spray motion and leaf-cut shadows.

- This covers every tree built through the scene kit's `tree()` and the
  hand-built trees of Raffles Place, Queenstown, Marina Bay and Pulau Ubin:
  any wind-animated crown that is an icosahedron.
- Cover is exactly as built. The rounded shape stays in the scene, undrawn, and
  is what a line of sight or a round meets; the sprays take no rays and are
  marked `coverApart`, so the drawn district and the simulation's copy agree.
  Sprays reach a little past the shape, so a leaf at the edge of a crown hides
  nothing.
- These trees have no species, so the leaf is not a claim about one: simple
  elliptic leaves in opposite pairs, the Tembusu's tile. Naming and modelling
  each district's trees from NParks is a separate piece of work.
- Cost: 96 drawn triangles a crown in place of 80 (20 in Marina Bay's
  low-detail crowns), and one more instanced draw per crown material.

Not changed in this pass: shrubs, hedges and planters built from the same
rounded shape (see the fifth pass below), the boundary backdrop, and crowns
under thermal vision. This pass also missed the crowns six districts build
without a wind tag; the fifth pass covers them. Seen in captures of Pulau Ubin and Bishan only; the other
districts share the same code path and were not each looked at.

### Shrubs, reeds and grass (24 November 2026, fifth pass)

**Shrubs and hedges.** A planting built as a rounded green shape and tagged
`leafShape(...)` (`src/game/tree-wind.ts`) is drawn as the same mass of leaf
sprays a tree crown gets, at shrub size, so its leaves come out about 10 cm
long. It sways about its own foot. Its shape stays, undrawn, as the cover.
Tagged in Changi, Tampines, Jurong Lake, HarbourFront, Sentosa, Upper Thomson,
Yishun and the Botanic Gardens' remaining ginger clumps.

**Reeds and sedges.** A tagged shape half again taller than it is wide is
drawn as a clump of long blades instead: six upright cards of a new atlas
tile, a fan of 46 blades from one foot (`leafReedGeometry`, 12 triangles in
place of 80). Punggol, Tampines, Bukit Timah, Bishan.

**Tree crowns the fourth pass missed.** Orchard Road, HarbourFront, Bukit
Timah, Woodlands, Jurong Lake and Upper Thomson build some crowns as plain
rounded shapes known only to the falling-leaf effect (`registerFoliageDrift`).
Those are now drawn as leaf masses too. They have no bending trunk, so each
sways about its own base.

**Grass.**
- The lawn between the tufts is no longer a flat colour: within 16 to 42 m the
  ground shader draws short blades lying two ways, with paler thatch where the
  sward is thin (`soilMaterial` in `src/game/ground-cover.ts`).
- A tuft takes the colour of the lawn it grows from, darker at its foot and
  paler at its tip. Before, every tuft in every district was one olive green.
- Grass is longer on lush ground and shorter on dry ground, in the same broad
  patches the colour already followed, with an occasional ragged clump.
- No triangles were added to the grass.

## A mown lawn, blade by blade (sixth pass, Botanic Gardens only)

A trial after looking at how Crysis 3 drew grass (Crytek's GDC 2013 talk):
dense fields of separate blades that bend along their length. Singapore lawn
is short, so the height is not copied; the density and the curl are.

- **Species.** NParks names cowgrass, *Axonopus compressus*, as the most common
  turfgrass in Singapore and rates it coarse in texture, low in density and
  medium green. The blades are drawn broad and blunt for that reason. Which
  turf the Gardens' own lawns carry was not checked.
- **The sward.** A district that sets `scene.userData.lawnSward` gets a third
  grass mesh, `Lawn sward`, beside the two tuft meshes (`createGrass` in
  `src/game/ground-cover.ts`). Each instance is a clump of five blades, 8 to
  14 cm tall, arching outward; each blade has three joints (25 triangles a
  clump). The wind's lean grows with the square of height, so a jointed blade
  curls over where the tufts' straight blades tip.
- **Budget** (`swardDetail` in `src/game/environment-quality.ts`): none on Low
  or with reduced effects. High: 10 m reach, a clump every 22 cm (about 7,600
  clumps, 190,000 triangles). Ultra: 13 m, every 19 cm. Phones get 7 m and 9 m
  at wider spacing. The last four metres thin out clump by clump.
- It uses the tufts' shader, so it leans to the same gust fronts, lies down
  under bodies and shakes from shots and blasts. No blade is simulated.
- It follows the viewer in 2 m steps. A rebuild took 1 to 6 ms in the test
  VM; frame rate on a real GPU has not been measured.

**A fault this pass found and fixed.** The fifth pass coloured each tuft from
its lawn's material colour. Ground painted vertex by vertex (Botanic Gardens,
Upper Thomson, HarbourFront and Sentosa, Queenstown) has a white material, so
its tufts came out white and its lawn had no blade pattern. Tufts there now
take the painted colour (`terrainTint`), and the blade pattern is drawn
wherever the paint is green.

No species is claimed for any of these: the districts do not say what their
shrubs, reeds or lawns are, and no NParks page was read for this pass.

Not changed: Marina Bay's, Queenstown's and Raffles Place's own planters;
Geylang's rooftop and five-foot-way planting (the same shapes are also
lanterns there); the boundary backdrop; tuft count and blade shape. Seen in
captures of HarbourFront (shrubs), Punggol (reeds) and Bishan (grass) only.
