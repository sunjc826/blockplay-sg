# West district fidelity pass — 25 September 2026

These maps remain compressed game layouts. This pass corrects identifiable
landmarks and misleading sector names; it does not claim surveyed street
positions. The first Street View batch contained two previews per district. All six were
visually reviewed; four are accepted for the narrow observations listed below
and two rejected. Only implemented, observed features populate `referenceFeatures`.

## Jurong Lake

The mall/interchange cluster represents Jurong East, so the nearby station and
its collectible/sector now say Jurong East rather than Lakeside (a different
station). The seven-storey Cloud Pagoda now uses octagonal walls, pale gallery
balustrades and continuous tiled roofs in place of the overlapping square
floors and gold corner spikes. The anonymous park shelter becomes a branching
iron Lone Tree, with open grass around it. The existing island/causeway remains
a gameplay compression, not a depiction of the whole Chinese Garden.

Sources consulted:

- [NParks: Cloud Pagoda](https://juronglakegardens.nparks.gov.sg/cloud-pagoda/) — seven storeys and garden plateau.
- [NHB: Chinese Garden](https://www.roots.gov.sg/resources-landing/online-exhibitions/chinese-garden) — pagoda, White Rainbow Bridge and garden landmarks.
- [NParks: Grasslands](https://juronglakegardens.nparks.gov.sg/discover/lakeside-garden/grasslands/) — Lone Tree is made of reclaimed iron reinforcement bars, not living timber.

## Bukit Timah

The Rail Corridor becomes a green path with conserved rails confined to the
station node; the former all-map rail line incorrectly implied an operating
railway. A red-brick station with cream bands, tiled pitched roof, low platform
and station sign anchors the heritage node east of the track. The minimap
includes its footprint. The summit sector is renamed hill foot because the
actual playable anchors are beside the impassable hill, not on its top.

Sources consulted:

- [URA: 2022 station restoration](https://www.ura.gov.sg/news/media/pr22-29/) — station/gallery, retained track equipment, red-brick tiled buildings, landscape and platform arrangement. The official station-front photograph was downloaded and visually reviewed: it shows an open waiting shelter between a pale service room and red-brick end room, long orange-tiled roof, low platform and token poles. The scene models that arrangement. [Reviewed photograph](https://isomer-user-content.by.gov.sg/467/1ecadfc8-7855-4631-9761-66a21b5f2403/pr22-29img2.jpg).
- [NParks: Rail Corridor](https://railcorridor.nparks.gov.sg/visit-rail-corridor/) — green corridor and heritage precinct.

## Tuas

The uniform four-storey quarters block is replaced by a long industrial
workshop with loading doors, roller slats, clerestory glazing and canopies;
its sector becomes the workshop apron. Tuas Link gains the distinguishing
concourse above its platforms and a rounded roof silhouette. Its playable
sector is named station approach, since the platforms are not reachable.
Tank-farm, dock and process-plant placement remains a broad industrial collage.

Sources consulted:

- [JTC: Tuas Avenue 13 terrace workshops](https://www.jtc.gov.sg/find-space/tuas-avenue-13-terrace-workshops) — low terrace workshop typology and general manufacturing uses. Two official photos were visually reviewed: pale walls, metal roller doors, blue upper window recesses and projecting pale fins. [Reviewed frontage photograph](https://www.jtc.gov.sg/-/media/e26455c614a44387b2a3e9097b0856c2.jpg).
- [Tuas Link station](https://landtransportguru.net/tuas-link-station/) — elevated upper concourse arrangement; the pending exterior preview is needed for facade review.
- [MPA: Port of the Future](https://www.mpa.gov.sg/maritime-singapore/port-of-the-future) — automated yard operations; existing container yard retained.

## Sector handling

Stable sector IDs retain loot rules and saved associations. Names now match the
accessible ground. The railway station occupies a previously empty patch within
the heritage sector; all anchors, stamps, vehicles, checkpoints and road routes
are checked against actual scene colliders. No district-wide Google refresh is
needed for scene-only or sector-only edits.

## Street View review and implementation

| Preview | Image date | Decision | Applied observations / limits |
| --- | --- | --- | --- |
| Chinese Garden | 2016-06 | Accepted, limited | Unmarked asphalt garden path, shallow edge drain and disc-top lamps. Pagoda not visible; predates redevelopment. |
| Jurong East frontage | 2021-11 | Rejected | Construction wall fills frame; no mall or station facade. |
| Railway station exterior | 2024-07 | Rejected | Google selected King Albert Park residence, not station. URA station photograph remains the facade source. |
| Hindhede approach | 2024-07 | Accepted, limited | Tall forked trees and overlapping entrance canopy modeled. Visitor centre facade not visible. |
| Tuas Link exterior | 2024-07 | Accepted, limited | Deep pale concrete underside and dark green horizontal louvers added. Upper roof/concourse not visible. |
| Tuas Avenue 12 | 2024-07 | Accepted, limited | Tall roadside trees on grassy verges; pale industrial blocks with blue accents. No port/dock geometry verified. |

Both source metadata and image manifests record observations, date and limits.
Rejected sources require a new source ID; they are not eligible for full-view
expansion. Two bounded replacement previews target the public Jurong Gateway
junction and Bukit Timah railway bridge, avoiding the blocked/wrong viewpoints.

The rendered district overviews and street frames were also visually inspected.
They still show game-scale road grids and compressed landmark groups. No claim
is made that these limited views verify all inherited buildings or topology.

## Bounded replacement review

Both replacement images were reviewed and accepted for limited scope.

- **Jurong Gateway, March 2025:** useful lower JEM frontage at 50 Jurong Gateway Road: white projecting cladding, recessed dark glass, slim entrance canopy and planted ledge. These replace the generic window-grid treatment on JEM's main facade. The full building and station are outside this view.
- **Bukit Timah Road, July 2024:** the railway bridge is visible in the distance. Its dark open web and horizontal chords replace the grey solid-sided treatment. Small engineering details cannot be inferred from this image, and temporary construction barriers are omitted.

The two original rejected previews remain rejected. No more Google captures
were requested for these districts. Source and image review records were read
back after writing to verify accepted status, image date and limitations.
