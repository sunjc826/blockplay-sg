# East and heritage districts: inhabited vertical spaces

This replaces the September first pass's ten isolated access galleries with five
substantial places inside existing landmark footprints. These are authored,
compressed gameplay interiors. No new reference photographs were captured and no
claim of surveyed interior fidelity is added to `referenceFeatures`.

| District | Inhabited space | Route choice |
| --- | --- | --- |
| Chinatown | Open Chinatown Complex ground market and 4.8 m dining circuit around an atrium, approximately 2,840 m² of upper floor | Two stairs on opposite sides; clockwise/counterclockwise dining aisles; ground market remains traversable below |
| Kampong Glam | Beach Road retail podium opened beneath retained upper building; complete 4.8 m shop and 9.6 m studio circuits | Two ground approaches and two independent inter-storey stairs; every upper floor connects around the atrium |
| Geylang | Existing Geylang Serai market shell opened; retained pitched roof and ground stalls, with a 4.8 m food gallery | Opposing stairways feed a full upper market circuit; lower stall aisles remain an alternative |
| Tampines | Accessible Hub court and lower community wings, with complete 4.8 m and 9.6 m concourses beneath the retained warm patchwork upper structure | Opposite court stairs and two cross-level approaches; upper concourses overlook the court and connect all four wings |
| Changi | Jewel forest valley has complete 4.8 m garden and 9.6 m canopy circuits, replacing inaccessible decorative ring geometry | Two distributed ground approaches, two long inter-storey viewing stairs, and two directions around each circuit; basin remains a real central void |

The changes remove sealed box fills and blanket footprint colliders where players
now inhabit the buildings. Chinatown tables and Geylang stalls have bounded
collision heights so they do not become invisible walls on upper floors.
Counters, seating-sized fixtures and planting distinguish the usable floor area
from an empty bridge. Heritage temple and mosque roofs remain inaccessible.
Existing façade roofs, silhouettes and recorded reference features are retained;
Jewel's rectangular interior circuits are a gameplay abstraction rather than a
claim about its real curved interior circulation.

## Validation and corrections

All 16 connections passed actual movement in both directions with infantry
(0.38 m) and exploration (0.65 m) radii. The movement checks found overlapping
Geylang stair bases and a low crossing between Tampines' lower and upper stairs;
both layouts were corrected. All eight complete upper-floor circuits also passed
clockwise and counterclockwise traversal with the wider 0.65 m walker. The rendered-body diagnostic samples floor interiors
and connection centre lines; those checks returned no visual headroom warnings.

Additional probes traverse the centre and both usable sides of every stair
(width / 2 minus 0.7 m), with rendered-body clearance rays along those paths.
This caught side interference between Kampong Glam staircases which centre-line
checks missed; those stairs are now separated by eight metres. The repeated width-probe pass
returned no movement failures or visual clearance warnings.

These checks establish sampled movement and clearance. They do not certify
architectural accuracy, combat balance, or every possible player trajectory.
The spawned-floor audit passes for all five districts. It caught a further
Geylang issue: opposing stairs sharing a ground tip were traversable from the tip
but boxed out the ground approach. Their axes are now separated. Sector
integration and browser review remain part of the shared integration pass.

## Browser visual review

Reviewed actual browser entry and upper-floor captures for all five places, plus
Kampong Glam's aerial. Stairs, open ground aisles, atrium edges and connected tiers
are visible without apparent body clipping in these views. The review found that
removing the old opaque podiums left Kampong Glam's retained tower and Tampines'
upper wings visually unsupported above the highest concourse. Added structural
piers through those storeys, positioned away from stairs and circulation loops.

The large usable circuits are visible, but furnishings are still simple block
representations and the upper spaces read as open galleries. This is not detailed
shop fit-out or verified architectural reconstruction.
