# Central district improvement pass — 25 September 2026

These are compressed playable interpretations, not surveyed reconstructions.
Coordinates, block proportions and outer roads still depart from the real city.

## Orchard Road

Reviewed all 36 recovered screenshots in `reconstruction/orchard/references`.
The source JSON and each image manifest record acceptance and scope. Google
attribution/date remain in the images. No new Orchard requests in this pass.

| Sources | Decision | What the scene uses |
| --- | --- | --- |
| orchard-junction, ion-frontage, wisma-frontage; four headings each | Reject 12 | Indoor retail panoramas cannot inform street facades. |
| junction-road-02; four headings | Accept 4 | ION scalloped metallic/glass mesh; TANGS/Marriott silhouette; junction scale. |
| tangs-road-02; four headings | Accept 4 | Green eaves and angular hotel tower opposite ION, entrance steps and footway planting. |
| wisma-road-02; four headings | Accept 4, context only | This is a north-side shopping canopy/street view, not an unobstructed Wisma facade. No facade-detail claim. |
| ngee-ann-frontage; four headings | Accept 4 | Red granite, monumental entrance columns, paved square with dark grid, flags and steps. |
| somerset-frontage; four headings | Accept 4, dated context | One-way carriageway and Gateway glass link. Temporary construction is not reproduced as current. |
| emerald-hill-mouth; four headings | Accept 4 | Pale facades, green trim, narrow lane and glass bridge at the Somerset end. |

ION, Wisma and Ngee Ann now run along the same side of the boulevard; TANGS
sits opposite ION. Emerald Hill moves to the Somerset end. The invented
planted central median and Ngee Ann fountain have been removed. ION now has
a scalloped glass/metal net, Ngee Ann has a granite forecourt/colonnade, and
TANGS has its hotel silhouette. Wisma is a simplified blue frontage; its fine
facade details remain unverified. The side-court and outer park remain play
space. The topology is compressed into existing game blocks.

The TANGS, Ngee Ann, Somerset and Emerald sectors move with their landmarks;
Wisma replaces the invented Orchard Terraces label. Stable sector IDs preserve
save/gameplay references. Minimap masses, stamps and Somerset food anchors
move with them. All three districts' sector anchors and cover bands were
recomputed from actual reachable geometry, retaining loot/bot weights.

## Chinatown

The temple and museum's official site locates Buddha Tooth Relic Temple at
288 South Bridge Road. The revised model gives it a broad multi-storey hall
with closely sized roof tiers, instead of a rapidly tapering small pagoda.
Buddha Tooth Relic Temple and Sri Mariamman now share the eastern street edge;
Chinatown Complex moves west beside the market lanes. Their sectors, stamps
and minimap follow the changed blocks. People's Park's podium/slab composition
remains, with a more coherent ochre/green palette.

Primary context:
- https://www.buddhatoothrelictemple.org.sg/
- https://www.roots.gov.sg/places/places-landing/Places/surveyed-sites/peoples-park-complex

Two outdoor previews are now reviewed and accepted with explicit scope:
`south-bridge-road-01-preview` (June 2024) shows stepped parapets and tiled
five-foot ways; `pagoda-street-01-preview` (October 2021) shows pale colonnades,
dark shutters and brick pedestrian paving with kiosks along one side. These
specific features now populate `referenceFeatures`. The scene gains stepped
parapets, pale Pagoda frontages, brick paving and a single kiosk edge. Neither
preview shows the temple facades; those remain informed by primary textual
context, with simplified decorative detail.

## Kampong Glam

NHB describes two large gold domes, bottle bases beneath them, and Indo-Saracenic
architecture. The scene now uses two onion-shaped domes along the prayer hall
with dark base bands, rather than one dome with two side half-domes. Istana
Kampong Gelam has a broad limas/hipped roof, replacing the invented cupola.
The invented canal beside the mosque quarter becomes a paved Beach Road edge;
its map feature, sector label and stamp change together. The canal's old ID
remains for compatibility. The existing lane grid remains a gameplay abstraction.

Primary architectural context:
- https://www.roots.gov.sg/places/places-landing/Places/national-monuments/sultan-mosque
- https://www.roots.gov.sg/places/places-landing/Places/national-monuments/istana-kampong-glam
- https://www.ura.gov.sg/conservation/find-a-building/conservation-portal/kpgl/

Two April 2021 outdoor previews were reviewed. `bussorah-street-01-preview`
clearly shows the axial gold dome/dark drum above close cream shophouses,
palms and awnings. The scene now brings shop fronts along both sides of this
corridor and adds the tall central windowed entrance bay beneath the dome;
these visible features populate `referenceFeatures`. The helicopter moves
to the open southern approach so the new shop rows do not trap its spawn. The other
preview, `kandahar-street-01-preview`, selected Sultan Gate instead: it supports
only boundary-wall/partial-palace context, not a full roof or street-alignment
claim. Both source and image JSON manifests state these limits.
