# North districts: playable elevation, September 2026

These changes adapt the existing compressed layouts for play. They do not add
reference acceptance or claim that new ramp dimensions reproduce Singapore.
No Google calls or new reference captures were made. Existing scoped photographic
features remain intact; see `NORTH-CENTRAL-REVIEW.md` and `NORTH-EAST-REVIEW.md`.

| District | Routes and reason | Height | Sector implications |
| --- | --- | --- | --- |
| Upper Thomson | Replace the northern decorative reservoir boardwalk with a supported low rise; a separate modest planted masonry terrace offers a view across the neighbourhood green. The forest stays at ground level and no roadside TreeTop Walk returns. | 2.4 m each | Boardwalk jetty / reservoir approach and neighbourhood green; existing bounds and anchors retained. |
| Bishan | Make both existing park footbridges actual crossings. Replace the inaccessible decorative arches and solid landing blocks with shallow ramps and useful upper decks. Water remains visible and blocks ground movement; its finite-height collision permits walking above it. | 3.2 m each | River park path and meander sector bounds expand to include their respective bridge and bank approaches. Bridges improve bank-to-bank movement without inventing another elevated railway. |
| Toa Payoh | Extend the lowest existing housing access deck above the dragon courtyard into a usable two-ended gallery. Replace the decorative pond-bank bridge with a low supported walk. The landmark lookout and dragon geometry remain unchanged. | 4.4 m gallery; 2.4 m bank walk | Dragon playground measures broken cover after the change; bank walk lies in Town Park. No boundary expansion or loot-weight change. |
| Woodlands | A modest two-ended viewing deck gives the waterfront lawn a raised alternative. A central raised walk on the existing broad concrete jetty leaves lower routes alongside it. The lower jetty deck is aligned to ground height to meet ramp ends cleanly. | 2.8 m each | Waterfront and jetty sector bounds retained; jetty now measures broken cover. Neither route intrudes into checkpoint lanes or the railway. |
| Punggol | Replace the decorative waterway bridge deck with a genuinely traversable rise. Add a broad two-ended approach terrace ahead of the mall podium, clear of its accepted facade treatment. | 4.8 m crossing; 3.2 m terrace | Stable arch-bridge ID retains saves while its display name becomes Waterway crossing. Water continues below the crossing; its old ground-level channel anchor moves onto a dry bank approach. Mall approach boundaries remain suitable. |

The new routes use shared support surfaces, ramp geometry and guardrails. Both
ends meet ground and each route has a useful level deck. They provide reachable
elevation, not access to every decorative roof or building interior. Their modest
heights intentionally preserve the districts' different identities.

## Checks

A temporary focused test sampled every half metre of all ten routes. It traversed
every route in both directions with the shared movement kernel and verified
position and supported height. All ten passed. A second check verified occupancy
and upward centreline rays from 0.36 m above the floor to standing head height;
no existing static geometry obstructed these rays (collectible stamp markers
excluded). This is a clearance diagnostic, not a substitute for visual review
or combat playtesting. Existing sector anchor/reachability checks passed for all
five districts; the integrating pass updates measured cover labels and performs
whole-project checks.

Remaining limits: NPC route choice and combat balance need playtesting; bridge
and gallery placements remain authored compression. Two-ended access alone does
not establish good sightlines or balanced high ground. The diagnostic metrics
are evidence for those judgments, not a district quality score.

## Visual review

All ten route renders were inspected. The initial views caught a terrace ramp
ending in Upper Thomson's perimeter road and a grass strip beneath Punggol's
bridge. The terrace was shortened and given a planted solid base; the bridge now
spans continuous water. Revised views confirm those corrections and show the mall
terrace remaining clear of the accepted podium facade. Both Bishan crossings,
Toa Payoh gallery/bank walk and Woodlands viewing/jetty routes have visible
supports, clear approaches and proportions consistent with the authored scenes.

The reservoir-side boardwalk view additionally exposed low foliage overlapping
its eastern edge, outside the centreline ray samples. The adjacent shoreline crowns were raised above standing head clearance.
A focused check used each instanced crown's transformed bounding box across
the full boardwalk width and sampled every half metre; all clear standing heads
by at least 0.2 m. This finding illustrates
why numerical centreline checks alone are insufficient for visual judgment.

The final Thomson rerender after raising the shore-side canopy was inspected;
the boardwalk deck and usable width are clear. This preserves the forest edge
while removing the leaf intersection found in the first reservoir-side view.
