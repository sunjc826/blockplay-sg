# Punggol, Woodlands and Tampines review — 25 September 2026

These remain compressed game districts, not surveyed street layouts. This pass
uses published architectural and civic sources to replace conspicuously generic
landmark massing. Google exterior preview plans are separate, limited to two
new images per district. Two first-pass images now inform narrowly scoped
precinct/entrance details, recorded in scene `referenceFeatures` and manifests
below. No learning-card provenance is implied.

| District | Defect addressed | Implemented change | Remaining geographic limitation |
| --- | --- | --- | --- |
| Punggol | Waterway Point was a freestanding office-like box, missing Watertown | Four recessed retail levels, glazed waterfront-facing bands and paired residential balcony slabs above the podium | The grid still compresses the station, mall and remote Punggol Point into one area; their exact spacing is not reproduced |
| Woodlands | Causeway geometry used a negative longitudinal dimension; jetty looked like a timber kelong; mall had generic office window strips | Positive causeway dimensions, checkpoint relocated inland, concrete jetty moved east of the causeway, seven retail floor bands and cladding panels | Waterfront, town centre and checkpoint remain a compressed composite; town-centre roads and Admiralty Park still require a wider topology pass |
| Tampines | Our Tampines Hub was represented as a detached stadium bowl | Community building enclosing a court, recessed glazing behind warm screen fins, planted roof terraces and a central arrival opening | Round Market, quarry and town centre remain compressed into neighbouring blocks; quarry and housing geography still need a larger relocation pass |

## Sources and decision limits

- [RSP — Watertown & Waterway Point](https://rsp.design/project/watertown-waterway-point/): architect's mixed-use project identity. The public project page did not reliably load in the execution environment; its indexed information establishes the residential/retail combination, not measured facade dimensions.
- [Frasers Property — Green starts from within](https://www.frasersproperty.com/the-library/sg/2017/march/frasers-sg-green-starts-from-within): Waterway Point's boardwalk connects the station and waterway park. Retained pedestrian clearances at the mall approach.
- [NParks — Punggol Waterway Park](https://www.nparks.gov.sg/visit/parks/park-detail/punggol-waterway-park): named bridges differ. The generic existing bridge remains labelled a waterway crossing; it is not falsely relabelled Jewel Bridge before an accepted exterior view.
- [DP Architects — Our Tampines Hub](https://www.dpa.com.sg/projects/our-tampines-hub/): interlocking community volumes, porous ground-floor streets and green terraces. The replacement responds to those defining forms instead of depicting only a sports arena. Do not use the inconsistent street address shown on that page as a coordinate source.
- [People's Association — Hub info](https://www.pa.gov.sg/our-network/our-tampines-hub/hub-info/): confirms the integrated community and lifestyle programme.
- [NHB — Tampines Round Market and Food Centre](https://www.roots.gov.sg/places/places-landing/Places/landmarks/tampines-heritage-trail-tampines-town-trail/Tampines-Round-Market-and-Food-Centre): confirms the market and surrounding shophouse setting. Its existing pointed radial roof is retained, rather than inventing a replacement without the pending view.
- [NParks — Woodlands Waterfront Park](https://www.nparks.gov.sg/visit/parks/park-detail/woodlands-waterfront-park): waterfront promenade and long jetty; the jetty is kept distinct from the road causeway.
- [East 9 — Causeway Point](https://east9.com/causeway-point-shopping-centre/): seven-storey retail building with rooftop terrace. The exterior panel rhythm is a simplified massing interpretation, not an exact facade transcription.
- [URA — Woodlands Regional Centre](https://www.ura.gov.sg/guidelines/urban-design/woodlands-regional-centre/): contextual check. Future regional-centre proposals are not depicted as completed buildings.

## Sectors

Stable sector IDs and loot weights are preserved. Names now distinguish the
Waterway Point approach, Causeway Point forecourt and Our Tampines Hub forecourt
from inaccessible building interiors. Hub bounds start outside its collision
footprint. The Woodlands checkpoint sector follows its new inland position and
measures dense cover; its waterfront sector moves west of the booths, while
the jetty sector follows the eastward relocation. Stamps, encounter spawn,
water collision gaps and the schematic map follow the jetty together. The Woodlands green no longer borrows the name Northpoint (a Yishun
landmark). The former Tampines “Eco green” sector is labelled housing courts,
matching the actual scene objects beneath it. A future topology pass must move
anchors, food anchors, stamps, gateways and map overlays together.

## Reviewed first Google previews

All six captures were inspected with their retained Google attribution and dates.
None shows a complete requested landmark exterior. Waterway Point (May 2019)
and Causeway Point (June 2019) snapped inside shops and are rejected. Woodlands
waterfront (August 2024) shows a roadside tree/fence, while Round Market (March
2025) is obscured by roadside vegetation; both are rejected for landmark work.
The old source IDs describe intended targets, not verified image contents.

Two images are accepted only for clearly visible, limited details:

- `jewel-bridge-exterior-0` (September 2022): an HDB access lane and housing
  facade, not the bridge. The scene's random pastel stripes are replaced by the
  observed pale olive and white precinct palette. No bridge acceptance implied.
- `hub-exterior-0` (January 2023): sheltered Hub arrival with white round columns
  and horizontal louvres. Added those visible entrance details. It supplies no
  basis for exact outer facade dimensions.

Per-image manifests record these scopes; source manifests reject expansion
of these unsuitable sources into full exterior coverage. The pending single
outdoor replacement per district has a new source ID and separate bounded plan.

The first six game renders were also inspected. Punggol's mixed-use massing and
Woodlands's inland checkpoint/east jetty are legible in overview. The Tampines
Hub side elevation was blank, so the existing screen/glazing treatment is
continued around it. Its quarry lawn base hid the water; the lawn now sits
below the water surface. The Woodlands street camera is under the checkpoint
looking inland, useful for clearance but insufficient for shore resemblance.

## Final bounded outdoor replacement review

All three replacement images were inspected and their JSON review records were
read back after saving. No further Google capture is part of this pass.

| Image | Google image date | Accepted scope | Geometry response |
| --- | --- | --- | --- |
| `waterway-point-outdoor02-0` | March 2025 | Street-facing retail podium and Watertown residential facade | Continuous grey horizontal podium grille, strong white residential uprights and fine vertical screen fields; temporary roadworks omitted |
| `causeway-point-outdoor02-0` | February 2022 | Close exterior arcade crop only | Silver panel joints, square piers, recessed glazing, stone edge and steel guardrail; no claim that the crop verifies the whole mall silhouette |
| `hub-outdoor02-0` | July 2024 | Visible Hub exterior volume | Replaced regular window/screen grid with terracotta, salmon and tan patchwork panels, sparse colored slit windows, dark lower bands and blue top glazing |

These images establish the visible features listed, not exact dimensions or
whole-district accuracy. The Punggol bridge, Woodlands waterfront jetty and
Tampines Round Market still lack accepted landmark photographs in this pass.
Their first failed captures stay rejected, with the original dates and reasons.

After these geometry changes, all 24 Punggol/Woodlands/Tampines region, sector,
anchor reachability and measured cover tests passed. No further anchor relocation
was needed. The final browser rerender is performed by the integrating agent.
