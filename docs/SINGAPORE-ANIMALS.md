# Singapore habitat animals

Six original procedural Three.js models are available in the existing model
review picker under **Animals**, starting at
[/debug?asset=animal/javan-myna](https://blockplaysg.fun/debug?asset=animal/javan-myna).
Review poses are frozen so surface comments stay attached. District instances
have bounded head/bill motion and tail flicks; three otters swim a small loop.
There is no combat, feeding, collection or network-authoritative wildlife system.

## Evidence and modelling decisions

Research and photographic inspection: 11 November 2026. These are common or
habitat-appropriate animals, not an island-wide census. No photos are shipped as
textures, and no paid image, reference or audio requests were made.

| Model / scientific name | Evidence and inspected reference | Distinguishing model features | Authored scale and grouping |
| --- | --- | --- | --- |
| Javan myna / *Acridotheres javanicus* | [NParks: Native or Not?](https://www.nparks.gov.sg/publications-resources/articles/native-or-not) describes an introduced, very common urban bird; its Francis Yap photograph was inspected. | Charcoal body, compact crest, pale iris, yellow bill and legs; small white patch on folded wings. Taller stance than the dove. | About 26 cm overall length; three at each selected urban lawn/verge. |
| Zebra dove / *Geopelia striata* | [NParks: Dove vs Pigeon](https://www.nparks.gov.sg/publications-resources/articles/dove-vs-pigeon--what-s-the-difference) documents widespread ground foraging in small groups, blue facial skin and barring. Francis Yap photograph inspected. | Lower, smaller brown body, long tapered tail, blue-grey face, dark neck and body bands, muted pink feet. | About 22 cm long; two at each quiet garden/park pocket. |
| Community domestic cat / *Felis catus* | [AVS community-cat programme](https://avs.nparks.gov.sg/community-animals/population-management/community-cats/) establishes local community cats and management; [HDB community partnerships](https://www.hdb.gov.sg/sitecore/content/hdbinfoweb/home/managing-my-home/living-in-my-community/hdb-community-day/partnerships) describes estate care. AVS photo host denied access. A [Best Friends community-cat photograph](https://bestfriends.org/advocacy/protecting-community-cats) was inspected for domestic tabby anatomy only; it is not Singapore location evidence. | Seated domestic shorthair, triangular ears, green slit eyes, pale muzzle/paws, body-conforming tabby bands and a curved tail. This is a domestic cat, not a leopard cat. | About 48 cm seated height; one at a sheltered estate margin. Coat pattern is an art choice, not a local breed claim. |
| Plantain squirrel / *Callosciurus notatus* | [NParks species account](https://www.nparks.gov.sg/florafaunaweb/fauna/4/8/488) describes a common animal of parks, gardens and wooded habitats, mainly arboreal. Photograph in [NParks: Who, What and Where of Wallace](https://www.nparks.gov.sg/publications-resources/articles/who--what-and-where-of-wallace) inspected. | Olive-brown back, rusty belly, cream-over-dark flank stripes, pale eye rings, small ears, pointed muzzle and a bushy upright tail. | About 22 cm head/body plus tail; single animals at two tree-associated pockets. Ground foraging is a deliberately limited game vignette, not a claim that it is mainly terrestrial. |
| Malayan water monitor / *Varanus salvator* | [NParks BiodiversitySG](https://biodiversitysg.nparks.gov.sg/our-biodiversity/reptiles/lizards/malayan-water-monitor/) identifies the common monitor and preference for habitats around water. NParks image host denied access; [Nick Baker's Sungei Buloh photograph](https://www.ecologyasia.com/verts/lizards/malayan_water_monitor.htm) was inspected. | Low elongated torso, long neck, angular snout, splayed clawed limbs, pale dorsal spots and a banded tail tapering for over half the silhouette. | About 1.67 m overall; solitary basking animals on two freshwater banks. Not a Komodo dragon and not placed in generic shopping streets. |
| Smooth-coated otter / *Lutrogale perspicillata* | [Singapore Biodiversity Online species account](https://m.singapore.biodiversity.online/taxo4254/mainSpace/Lutrogale%20perspicillata.html) describes urban waterways, small families, round head, pale throat and flattened tail. Max Khoo portrait inspected. | Sleek brown torso, broad rounded head, tiny ears, pale muzzle/throat, short webbed feet and flat tapered tail. | About 1.12 m long; one group of three in Bishan's river. Group size is authored, not an assertion about a current named family. |

The sources support anatomy and habitat, not exact game coordinates or current
occupancy. The maps are compressed interpretations. Counts, poses, timing and
locations below are explicitly **game-design inference**. Otters are confined to
one suitable river pocket rather than duplicated along every waterfront. Rare
iconic species such as pangolins are not represented as everyday street animals.

## Placement and density

| District | Named existing setting | Animals | Reason |
| --- | --- | --- | --- |
| Queenstown | ESTATE block west lawn | 3 mynas | Open urban ground outside void-deck approaches. |
| Queenstown | Commonwealth garden quiet paved interior | 2 zebra doves | Small ground-foraging pair away from the picnic furniture and main access. |
| Queenstown | HOME block sheltered rear margin | 1 cat | A quiet sheltered resting place outside lobby/stair routes. |
| Queenstown | Commonwealth garden south shade-tree group | 1 squirrel | Short foraging vignette beside existing trees. |
| Bishan | Northern river-park lawn | 2 zebra doves | Open lawn below the walking path. |
| Bishan | Naturalised southern river grass shelf | 1 monitor | Basking ground beside fresh water. |
| Bishan | West meander pool | 3 otters | Small family swimming clear of bridge approaches and stepping stones. |
| Upper Thomson | Reservoir secondary-forest floor | 1 squirrel | Tree-associated ground east of the boardwalk, outside its route. |
| Jurong Lake | Northern grassy shore | 1 monitor | Bank habitat away from the island crossing. |
| Jurong Lake | Northeast garden verge | 3 mynas | Open garden ground separated from roads. |

Total: 18 animals in ten named sites, distributed 7 / 6 / 1 / 4. Other districts
have no new animals; empty space is not a reason to populate it. Existing
buildings, roads, terrain, generic noise-reactive rooftop flocks, and high-level
map layouts are preserved.

`animal-sites.ts` records intent; `district-animals.ts` validates every group
against world bounds, streets, spawns, targets, vehicles, stamps, encounter/sector
anchors, gateways and building connections/routes. It checks actual rendered
ground/water with rays, rejects obstacles and uneven footing, and tests the
whole swimming envelope with a body/tail margin. Whole groups are omitted on
failure; `scene.userData.animalSiteAudit` records why. A 16-animal district cap is
a safety ceiling, never a density target. The runtime placements are exposed as
`scene.userData.animalPlacements`.

The initial Bishan swim site failed bridge-access clearance; the final pocket
is farther west. The initial forest squirrel failed the slope check; its final
position uses a nearby level patch. Queenstown's garden is on elevated terrain,
so height is derived from the actual surface rather than assumed to be zero.

## Implementation and review

`singapore-animals.ts` owns six distinct model builders, shared resources and
absolute-time idle poses. Static pieces merge by material within head, tail and
body groups; copies share geometry/materials but have independent transforms.
Models use roughly 900–4,800 triangles before view culling. District LOD hides
them beyond 65 m with hysteresis. All are cosmetic: `fpsEffect` excludes the
whole wildlife root from gameplay cover rays, and no movement obstacles are
added. Disposing a district releases the kit; resetting time restores poses.

Otters move at an authored slow pace along a two-metre by 0.55-metre ellipse,
in a spaced formation. The body intersects the waterline and the head remains
above it. Ground animals remain rooted, with head turns/bobs and tail motion;
there is no sliding walk cycle, chase, combat response or wildlife audio. The
existing rooftop flock system remains the combat-startle presentation.

Local animated orbit previews and actual district views:

```
/scripts/fixtures/singapore-animals.html?animal=plantain-squirrel
/scripts/fixtures/singapore-animals.html?region=bishan&site=river-family
```

`node scripts/animal-smoke.mjs` uses isolated Vite 5186 / Chrome 9233 by default
(override `FPS_APP_ORIGIN` / `FPS_CHROME_ORIGIN`). It renders all models and every
accepted site, records dimensions, draw-call/triangle deltas and site audits,
and saves screenshots/report to `.cache/animals/`. Those reference photos and
test outputs remain local. `singapore-animals.test.ts` checks independent joints,
bounded animation/reset, feet on actual surfaces, swim bounds, complete species
coverage, protected spawn rejection and exclusion from ballistic cover.
