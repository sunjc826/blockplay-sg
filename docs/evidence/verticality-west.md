# West and harbour verticality pass — 26 September 2026

These are gameplay additions within the existing compressed layouts, not newly
verified real-world structures. No Google requests or new reference claims were
made. The existing referenceFeatures lists are unchanged. Each route has two
street-level approaches and a supported, railed, walkable upper span; the shared
movement kernel reads the same height planes that the meshes render.

| District | Playable change | Design judgment and limit |
| --- | --- | --- |
| Jurong Lake | Existing garden causeway rises to 3 m; a 3.2 m terrace occupies the JEM forecourt | The garden crossing gets a useful lookout and upper/lower choice. The forecourt terrace gives retail circulation an elevated alternative without claiming access to the mall interior. |
| Tuas | 4 m inspection walk beside the dry dock and 4 m service deck beside the process plant | Industrial access fits the dock and pipe-rack context. These overlook existing machinery; they do not grant access to the vessel, cranes or live-looking process equipment. |
| Bukit Timah | 3 m hill-foot contour walk and 2.5 m reserve-edge observation walk | Modest rises fit the trail setting. The short reserve walk is intentionally modest; the existing hill summit remains decorative and inaccessible. |
| HarbourFront | 3.5 m VivoCity east terrace and 3 m Telok Blangah raised timber trail | Retail and planted hillside sectors get different elevated routes. The decorative roof pool and Mount Faber summit are still inaccessible. |
| Sentosa | Existing Palawan crossing becomes a real 2.4 m raised deck; a second 2.4 m terrace sits beside the beach club | Removes the old low crossing boards and obstructing shore benches. The existing suspension silhouette remains; the playable height and ramp compression are authored. The full Fort Siloso Skywalk remains decorative. |

Routes avoid the marked road grid and FPS practice firing lanes. The dry-dock
walk is deliberately narrow (3 m) to fit between the dock lip and crane line;
other routes are 4–6 m wide. Different upper heights alone should not be treated
as proof of good combat flow: these are initial authored improvements requiring
playtesting for exposure, approach fairness and utility.

## Sectors

Existing sector bounds contain the relevant routes, so no new sectors or loot
weight changes are needed. Stable sector IDs and ground anchors remain valid.
Actual rendered-geometry cover measurements change Jurong `pagoda-island` from
open to broken and Tuas `coast-road` from broken to dense; the parent integration
updates those shared labels. All other west cover labels retain their bands.

## Validation

A focused check sampled every route centreline at 0.2 m intervals in both
directions against the original scene colliders, with a 0.5 m radius: all ten
routes have clear base footprints. All five districts' existing sector boundary,
anchor reachability, loot-anchor and point-resolution tests passed. The same
route traversal check also exercises the actual vertical movement kernel; its
initial run exposed the shared ramp-to-deck slab seam blocking a player's radius
just before the landing. The shared kernel now supports the short early step
when the player capsule touches the landing. All ten routes subsequently passed
full end-to-end traversal in both directions, including ascent and descent;
height tolerance permits that normal step (at most 0.35 m).

Final movement and rendering validation is recorded in the integrated report;
this note does not certify a visual browser inspection or physical-device run.

## Visual review

All ten route screenshots in the integrated offline render were visually read.
Approaches and supported upper surfaces were visible in every frame, with no
route passing through trees or buildings. Tuas reads clearly as maintenance
access; the initial retail and beach-club decks looked too much like generic
freestanding footbridges. JEM, VivoCity, the beach-club terrace and the hill-foot
contour therefore use solid foundations, giving them a podium/retaining-terrace
form rather than adding a spurious underpass. Their surroundings retain ground
alternatives. The short reserve walk and Telok Blangah trail remain timber walks.

The review also caught two inherited decorative artifacts: floating arch blocks
beside the new Jurong causeway, and Palawan hangers terminating below the new
deck. The disconnected arch blocks were removed; Palawan hangers now terminate
at cross-joists at the raised deck underside. Jurong and Sentosa's ten focused
sector tests still pass after those adjustments. The six affected final captures were refreshed and visually inspected again.
The disconnected Jurong blocks are gone, Palawan hangers now meet the deck
structure, and all four solid foundations visibly reach the ground. Both access
ramps remain clear in each view. No further blocking visual defect was found.

The final judgment is a modest, coherent increase in usable elevation, not a
complete multilevel district redesign. Industrial maintenance decks and the
existing Palawan crossing are the strongest fits; the retail terraces are still
authored additions beside sealed building volumes. The natural districts retain
low trails rather than implausible access to every tree canopy or summit. These
images support geometry and placement review, not a claim of surveyed fidelity
or a replacement for first-person combat playtesting.
