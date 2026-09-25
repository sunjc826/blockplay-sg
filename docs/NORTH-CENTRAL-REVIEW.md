# North-central district correction pass — 25 September 2026

These three maps remain compressed playable interpretations. This pass corrects
specific errors from researched public material. It is **not** a claim that the
whole scene has been rebuilt from reviewed Street View imagery. The canonical
browser plans request two exterior previews per district; source selection and
acceptance must be recorded separately after capture. `referenceFeatures` now records only the individually reviewed features below,
not whole-district acceptance.

## Upper Thomson

- [NHB: Thomson Plaza](https://www.roots.gov.sg/places/places-landing/Places/surveyed-sites/Thomson-Plaza)
  describes the intentionally low-rise mall. The [mall owner's page](https://www.lprivileges.com/malls/thomson-plaza)
  supplies a facade image showing white cladding, blue framing and coloured
  panels. The model now carries those features and a red name sign; its exact
  bay count and dimensions remain authored. The unsupported exposed helical
  vehicle ramp has been removed.
- [NParks TreeTop Walk guide](https://www.nparks.gov.sg/-/media/nparks-real-content/gardens-parks-and-nature/diy-walk/diy-walk-pdf-files/treetop_walk_eguide_lres.pdf)
  describes a roughly 7 km return walk from Windsor Nature Park. The giant
  suspension bridge beside the restaurant strip implied a false adjacency.
  Replace it with a modest forest trail junction and rename its stamp.
- The reservoir and shopping strip still occupy compressed game blocks. The
  causeway is a gameplay connection, not a mapped real road.
- “Springleaf green” becomes “Thomson neighbourhood green”: there is no model of
  Springleaf in that sector. Keep its stable internal ID for saved game data.

## Bishan

- [NParks park guide](https://www.nparks.gov.sg/visit/parks/bishan-ang-mo-kio-park/activities)
  describes open lawns and gently sloping grassy banks. Replace the continuous
  high stone courses with broad low grass shelves; retain the meandering water
  collider and road crossing gaps. With those walls removed, the stepping-stone
  and upper-river sectors are measured again for cover instead of retaining
  their old combat labels.
- [Bishan station documentation](https://landtransportguru.net/bishan-station/)
  identifies the ground-level North–South platforms, with the Circle Line
  underground. Remove the elevated viaduct. The low station entrance is still
  an approximation awaiting the exterior capture, not a facade survey.
- Junction 8 names the town mall. Move the station sector east to surround the
  modeled entrance and update its safe anchors. The old “Ang Mo Kio field” name
  south of the river becomes “Bishan station approach”.
- The park and town are compressed together; north is toward negative z and the
  town centre is south of the river. Neither distance nor street-grid geometry
  is surveyed.

## Toa Payoh

- [URA conservation record](https://www.ura.gov.sg/conservation/find-a-building/conservation-portal/tptp-00001/)
  documents the Town Park lookout as a modernist landmark over the pond.
  Replace the invented solid drum, external spiral and red conical roof with
  a slim open frame, hexagonal decks and a wide flat cap. Exact framing and
  dimensions are approximate and need exterior-image review.
- [NHB heritage trail](https://www.roots.gov.sg/places/places-landing/trails/Toa-Payoh-Heritage-Trail----Of-Public-Housing-and-Shared-Spaces)
  supports the dragon playground and town-park identity. The dragon, hub and
  housing have not been declared reference-accepted by this pass.
- “Braddell flyover” becomes “Northern approach” because no flyover exists in
  that sector's geometry. Its stable ID, loot weights and anchors are retained.

No Google requests are made by this code. Capture is performed only through the
per-district workflow and the six bounded preview requests in the three plans.


## Captured-view review

The six first-pass PNGs were inspected directly. Attribution/date overlays were
retained. Each source and image manifest carries a scoped `visualReview`.

| View | Date | Decision and scope |
| --- | --- | --- |
| thomson-shops-road-0 | 2024-08 | Accept two-storey terrace, red pitched roofs, long awnings and frontage parking; leftmost facade partly blurred. Added pitched roofs and parking lines. |
| thomson-plaza-road-0 | 2019-07 | Reject: indoor supermarket corridor. |
| bishan-park-road-0 | 2014-04 | Accept oval grey pavilion, open lawn, mature trees and paving. Added oval canopy with round piers and horizontal louvres; river is not visible in this frame. |
| bishan-station-road-0 | 2022-03 | Reject for station: service street points away from entrance. |
| town-park-road-0 | 2016-05 | Accept straight paved path beneath trees with grass verges. Added this path; tower is not visible in this frame. |
| dragon-road-0 | 2024-03 | Reject: medical-centre loading bay, wrong point north of playground. |

A single replacement preview per district is planned with new `outdoor02`
source IDs; accepted images are reused without another request. The dragon
camera was corrected after checking the playground coordinate; Plaza uses a
geotagged exterior camera position, and Bishan reverses the viewing direction.

The first overview renders also revealed that Bishan's park slab obscured the
river and Toa Payoh's lawn slab obscured its pond. Lowered those lawn layers below
water level without changing collisions. The water is a defining landmark and
must remain visible.


## Final bounded replacement review

- **thomson-plaza-outdoor02-0 (August 2024): accepted for the visible facade.**
  Mostly blank square white cladding and a small offset cluster of blue-framed
  coloured squares replace the earlier overly extensive glazing grid. This is
  the Soo Chow Garden Road side; other elevations and roof remain approximate.
- **bishan-station-outdoor02-0 (March 2022): rejected for landmark geometry.**
  The opposite view still shows utility buildings and lawn rather than the
  passenger entrance. Ground-level station geometry stays public-source based.
- **dragon-outdoor02-0 (March 2024): rejected for detailed geometry.** The distant
  orange head is partly visible beyond a tree and sign, but too small/occluded to
  justify changes to the dragon structure. The existing dragon remains authored.

There are no further captures in this pass. Four of nine previews support
explicit, narrowly scoped model features; five are rejected for their intended
landmark purpose. Public-source corrections and rendering fixes are documented
separately from accepted photographic features.
