# Singapore furniture and placement research

Reviewed 11 November 2026. This pass replaces the equal-count district scatter
with furnishing plans attached to existing map features. Research supports
object types, relationships and use. **Game dimensions and positions are authored
adaptations, not a survey or a claim that a particular real building has these
exact objects.** Existing roads, buildings, landmarks and terrain are retained.
No new Google Maps captures or paid reference requests were made.

## Evidence and modelling decisions

| Evidence | Model / placement decision |
| --- | --- |
| [NEA: National Recycling Programme](https://www.nea.gov.sg/our-services/waste-management/3r-programmes-and-resources/national-recycling-programme) describes mixed paper/plastic/glass/metal collection in blue bins, accessible open locations, and exclusion from HDB void decks. Its bin photograph was visually inspected. | Replace the generic three-colour recycling station with a single blue body, broad aperture, hood and guidance panel. Collection points sit outside residential blocks, separately from social furniture. |
| [NEA: Cleaner Tables](https://www.nea.gov.sg/media/news/advisories/index/cleaner-tables-in-hawker-centres-and-coffeeshops) discusses rack visibility, access and balancing dining capacity; racks and mobile trolleys serve return points. | Add open steel tray-return racks at dining-area edges. Fixed dining sets occupy rows beside the market aisles; the centre and stair approaches remain clear. |
| [CNA: Tray-return commentary and photograph](https://www.channelnewsasia.com/commentary/tray-return-public-hygiene-campaign-nea-table-cleaner-job-fine-196291) was visually inspected: steel shelf frames, a header, stacked trays/crockery, laminate tables and fixed round stools. | Model those construction details with original geometry, retaining an open rack silhouette. No photo texture, copied sign artwork or official logo is shipped. |
| [NHB: Void Decks](https://www.roots.gov.sg/~/media/Roots/Images/resources/e-books/nhb_ebook_void_decks.pdf), indexed text, describes letterboxes, bicycle racks, tables, stools and benches as common amenities. Direct PDF access was robot-blocked. [Jonathan Tan’s photographic series in ST](https://www.straitstimes.com/multimedia/graphics/2025/06/hdb-void-decks-singapore/index.html) supplied a visually inspected blue mosaic tabletop and stools. | Blue mosaic trim, checkerboard surface, concrete supports and four stools form the estate social set. Place it in explicitly modelled sheltered bays, beside rather than across lobby/stair circulation. |
| [IMDA: Letter Box Specifications and Guidelines](https://www.imda.gov.sg/regulations-and-licensing-listing/postal/letter-box-specifications-and-guidelines) establishes individual letterboxes for building units. | A compact bank of separate metal doors, slots, locks and plates belongs beside a residential ground lobby. Its scale and unit count are illustrative. |
| [NParks landscape handbook](https://www.nparks.gov.sg/docs/default-source/resources/2023/guidelines-greenery-provision-tree-conservation-developments-version4.pdf), indexed guidance, associates seating with footpaths and locates bins 3–5 m from benches. The indexed 2023 handbook is used as historical design evidence; the [current publication page](https://www.nparks.gov.sg/services/development-plan-submission/before-submit-development-plan) lists a newer edition. | Path-side rest bays, oriented to the park/waterfront; hooded ground-mounted litter bins 4 m along the bay from each bench. No claim of regulatory certification or exact NParks-standard reproduction. |
| [URA: Outdoor refreshment areas](https://www.ura.gov.sg/-/media/Corporate/Guidelines/Development-control/Circulars/2019/Nov/dc19-18/WC/dc19-18.pdf) describes dining as an extension of adjoining F&B premises and calls for clear pedestrian thoroughfares. [Enterprise Singapore](https://www.enterprisesg.gov.sg/smepeo/outdoor-refreshment-areas-of-coffee-shops) similarly locates these areas beside coffee shops. | Café sets follow identified food frontages. Parasols appear in outdoor dining bays; covered kopitiam rows use tables/stools alone. Pots sit at shop edges, not across five-foot-way circulation. |
| [JTC: Defu Industrial City](https://www.jtc.gov.sg/find-space/jtc-defu-industrial-city) describes dedicated loading/unloading bays. | Pallets, bagged supplies, hand trolleys and sealed drums occupy shutter-side staging strips at Tuas workshops. The adjacent driving aisle stays open. Produce crates are restricted to market/shop delivery contexts. |

These observations are typology evidence. Assigning them to a compressed game
feature is a design inference, explicitly recorded by each site's `feature`.
Photographs are reference-only and remain in the ignored local research cache.

## How a location earns its furniture

`src/game/street-prop-sites.ts` records the named existing feature, furnishing
program, bounded strip, spacing, orientation and surface offset. Coordinates
were read from the corresponding scene builders. Queenstown uses its actual
housing layout data; Marina uses its existing layout scale. No global grid,
road-order shuffle, random district-wide theme or fill-to-count fallback remains.

A dining bay receives complete table/stool arrangements. A sheltered residential
bay receives social furniture and a separate lobby receives its letterbox bank.
An external collection apron receives a blue bin. A park path receives rest
furniture; a delivery edge receives goods-handling equipment. Entire small
arrangements are rejected when any member conflicts with existing obstacles,
roads, protected gameplay areas, stairs, entrances, other furniture or slope.
This avoids orphan stools and parasols. The 240-object/80-reactive caps are
performance ceilings, not design targets; districts intentionally differ.

Named strips can yield no placement when an existing access reservation wins.
`scene.userData.streetPropSiteAudit` reports the exact site and rejection reason.
`streetPropPlacements` records site, feature and use for every accepted object.
The local fixture accepts `?region=chinatown&site=complex-dining-0` to inspect a
whole furnishing strip in context. Furnishings supplement existing scenery;
these counts do not include built-in scene furniture.

## Review examples

- **Chinatown:** fixed dining sets and tray returns in the existing Complex;
  kopitiam sets beside Smith Street food stalls; crates at the rear shop edge.
- **Queenstown:** mosaic social sets in the real modelled void-deck bays;
  letterbox banks beside lift lobbies; blue bins outside the blocks.
- **Tuas:** staged workshop supplies beside shutter frontages and container-yard
  service edges, with no café set or residential chess table scattered in the yard.
- **Punggol / Jurong Lake:** rest bays follow the actual waterside promenades.
- **Pulau Ubin:** village coffee-shop seating, provisions and cycle parking;
  forest and wetland interiors receive no grid of urban furniture.

Full source locations and current accepted/rejected counts are available through
the site registry and local audit, rather than a uniform density target.
