# Connected vertical places: western districts

This replaces the previous isolated scenic-route pass. These are authored,
compressed gameplay layouts within existing district landmarks, not surveyed
interior plans. No new Google captures were made and no new reference acceptance
is claimed.

| District | Inhabited space | Route choice |
| --- | --- | --- |
| Jurong Lake | JEM and Westgate each contain 6 m and 12 m atrium galleries, replacing their solid interior collision volumes. Original exterior overhang/glazing details remain. | Opposing atrium stairs and two links at different levels form a loop between both buildings. |
| HarbourFront | VivoCity's actual footprint contains 7 m and 14 m gallery rings and the 21.6 m Sky Park. Its old solid mass and conflicting amphitheatre blocks are removed. | Two street approaches and alternating atrium stair flights connect retail, dining and roof spaces; broad wings allow lateral movement and views down the court. |
| Tuas | Two working levels at 6 m and 12 m wrap the existing distillation columns, with equipment remaining inside the central void. | North/south ground entries, opposite upper stairs and circulation along both ends connect the plant decks. Conflicting flare guywire removed. |
| Bukit Timah | The inaccessible nested hill boxes become four broad earth-backed contours at 4, 12, 20 and 28 m. The summit marker moves onto the actual top clearing. | Two ascent branches reconnect across each contour. Continuous grass slopes fill the terrain between contours, with two marked trails. The hill itself is traversable; this is no longer a boardwalk beside a blocked hill. |
| Sentosa | The existing resort podium contains 8 m and 16 m galleries around an open court. Fort Siloso's actual earthwork becomes 4 m, 8 m and 12.2 m playable terrain and gun rampart. | Resort stairs connect arcades and roof wings; two hillside approaches reach the fort with cross-slope alternatives. The existing Palawan crossing remains secondary. |

## Validation

Actual movement traversed connections using the centre and both usable-width
edges. The shared connected-place audit confirms inhabited floor samples are
reachable from the district spawn in all five districts. The first audit caught
isolated Tuas upper landings; explicit upper circulation links corrected them.
Mesh diagnostics were used separately: they caught a Tuas guywire, low resort
pavilion canopy, and a fort gun intersecting an ascent. Geometry or alignment was
changed instead of suppressing those warnings. The diagnostics remain evidence,
not a quality score or a substitute for visual review.

## Sector integration

Bukit Timah needs its old hill-foot sector to describe the now-inhabited hill:
`minX=-215,maxX=-132,minZ=-76,maxZ=49`, with the summit at `(-175,-65)`.
Ground-only bot/stamp anchors must stay at clear trailhead or side approaches,
for example `(-175,43)`, rather than inside an earth-backed elevated floor.
The adjoining reserve sector should end at `z=-78`. The other changes inhabit
existing building/plant footprints already covered by their sector bounds.
Existing street loot remains valid; elevated floor placement must respect the
sector distributions rather than replacing them wholesale.

## Limits

Interior floorplans and hill profiles remain authored compressions. The two mall
complexes use accessible open galleries rather than fully modeled individual
shops. These changes do not establish multilevel bot navigation, surveyed real
stair positions, or physical-device performance certification.

Final browser review caught rectangular pits between the first contour implementation. Continuous earth-backed slopes now fill those gaps in both Bukit Timah and Fort Siloso and carry movement; the trail markings are thin wearing-surface meshes on that terrain. Jurong facade framing and spandrels were also restored around the open link portals after the hollow interior initially left floating window strips.
