# Bukit Timah and Upper Thomson ground design

Implemented 31 October 2026. These are compressed gameplay landscapes with
relative authored heights, not surveyed terrain or public access directions.
The [Queenstown principles](QUEENSTOWN-LANDSCAPE.md#design-principles) are applied
selectively: a reserve climb, a low heritage-station apron, a wooded bank and a
mall entrance have different ground and seating requirements.

## Bukit Timah: reserve hill and a level heritage node

The existing irregular reserve ridge and its connected higher contours remain.
The hill foot now begins at zero at z=30 and rises across the full footprint to
4 game units at z=20. Previously, two narrow ramps rose to a 4-unit shelf while
crossing the east–west road. The revised hill starts beyond the carriageway;
its two paths join one broad earth slope. The first two trees now meet that
slope instead of keeping their former floating bases. Timber benches occupy
existing level clearings at 12 and 20 units, away from the two walking lines.

The station, conserved track and surrounding street remain at their existing
low datum. A 0.5-unit public waiting apron has approaches from both ends,
each rising over 12 units. These lead into the open waiting shelter. Two timber
benches face the track; no HDB chess-table group has been added. The enclosed
end rooms remain enclosed. The old continuous platform slab is split at the
public waiting area, so apron and waiting surfaces each have one owner.

This is a small access/landscape adaptation, not a claim that the playable
station sits on the reserve hill. Existing truss geometry and the restriction
of retained rails to the heritage node remain intact.

## Upper Thomson: low woodland and a constructed entrance

The three detached forest platforms at 2, 5 and 8 units and their narrow paired
ramps are replaced by one continuous wooded shoulder. It rises gently from the
trail junction through small level stopping places to a maximum of 2 units,
then returns to the flat street edge. A winding dirt trail occupies the actual
terrain triangles. Grass verges slope down along its sides; there is no repeated
hump pattern and no raised grass-box wall around the clearings. Two timber
benches sit beside the path on level ground. Trunks follow the sampled ground,
and layered canopy/understorey planting stays outside the walking line.

The ground sampler uses the exact rendered triangles. Infantry, bots and the
existing ground-aware vehicle/host support consume this through district bounds.
The road grid and shop strip remain level. The raised reservoir boardwalk stays
a separate structure: the ground sampler never turns its deck into ground.
The fictional roadside TreeTop suspension bridge has not returned.

At Thomson Plaza, a low 0.6-unit sheltered entrance landing is reached either
by central steps or a longer side ramp. Four 0.15-unit treads form the direct
route; the side approach rises over 23 units. The steps, ramp and landing share
walk/collision geometry and meet behind the road pavement. This is a constructed
forecourt transition, rather than a hill beneath every shop.

## References actually reviewed

| Reference | Observed feature and use |
| --- | --- |
| Cached `bukit-timah/references/reserve-visitor-centre-preview.png`, July 2024, accepted limited scope | Hindhede entrance has mature forked canopy, planted edges and a paved approach. Retain the existing canopy treatment; this view does not establish summit contours or numerical heights. |
| Cached `bukit-timah/references/rail-bridge-outdoor02-preview.png`, July 2024, accepted limited scope | Dark open truss above the road. Preserve the reviewed bridge; no new bridge layout is inferred. |
| Cached `upper-thomson/references/thomson-shops-road-0.png`, August 2024, accepted limited scope | Low awnings, pitched terrace roofs, parking and a broad street edge. Retain the level shop street and reviewed facades. |
| Cached `upper-thomson/references/thomson-plaza-outdoor02-0.png`, August 2024 | White-clad mall facade, central entrance steps, raised planted frontage and side approach are visible. The new low landing/alternative ramp follows that relationship, with authored dimensions. Existing image/acceptance records remain unchanged. |
| [NParks Windsor stone-path photograph](https://www.nparks.gov.sg/images/default-source/parks-img/windsor-nature-park/windsor-nature-park-hero-stone-path.jpg) | A narrow naturalistic path enclosed by palms and understorey; informs a planted woodland route rather than an exposed series of platforms. |
| [NParks Windsor path photograph](https://www.nparks.gov.sg/images/default-source/parks-img/windsor-nature-park/windsor-nature-park-hero-path.jpg) | A linear walking surface beside grass and dense regenerating vegetation; informs the distinction between a path, its ground and planted margins. |

The two Windsor photographs were downloaded and viewed directly on 31 October
2026. The cached Google photographs were viewed with their attribution/date
overlays intact. All remain reference-only; no photograph is shipped as a texture.

[NParks' station page](https://railcorridor.nparks.gov.sg/bukit-timah-railway-station/)
describes the conserved buildings, gardens, event lawn and accessible community
node. Its low heritage/landscape character supports the decision to retain a
level station precinct. Newly linked station photographs returned HTTP 403 when
retrieved; station architecture therefore retains the earlier URA-based review
in [the west district notes](WEST-DISTRICT-REVIEW.md).
[NParks' Windsor page](https://www.nparks.gov.sg/visit/parks/park-detail/windsor-nature-park)
identifies regenerating secondary forest and a separate journey from Upper
Thomson MRT. The photos inform landscape character, not a surveyed alignment
between the shopping street, Windsor or the reservoir.

## Verification and scope

`bukit-thomson-ground.test.ts` verifies triangle/ray/ground-height agreement,
two-way woodland and lateral-bank walks at both player radii, flat roads,
ground-aware flight clearance, both station approaches and waiting-room access,
a single visible platform finish, both Plaza routes, and a hill foot clear of
the road. The existing complete ridge-route check uses the revised zero-level
trailhead. District reachability, spawn/stamp/vehicle, and facility checks guard
existing play routes.

Visual QA uses walking-height views of the forest path/rest stop, Plaza steps
and side ramp, station approach/waiting shelter, hill foot, plus both overviews.
Source checksums and render/test receipts are kept in
`.cache/bukit-thomson-ground/`. No new Google capture, paid generation or amended
Static-image allowance was used. Numerical grades, furniture locations and the
compressed geography remain authored choices.
