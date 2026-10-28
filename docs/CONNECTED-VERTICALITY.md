# Connected district verticality

The previous elevation pass established walking support but mainly supplied isolated bridges. The current work replaces that design approach with connected, occupiable floor plates and terrain terraces. A reachable high point alone does not establish good vertical gameplay.

## Review tools

`pnpm analyse:verticality -- --district orchard --sectors --json` reports the existing spawn-connected walking lattice together with connected-place diagnostics. No result is converted into a map-quality grade.

- Every connection is attempted in both directions with the actual walking kernel.
- Each floor has nine interior probes. Furniture-blocked probes are excluded; remaining probes must have support and standing clearance. The report states how many are reachable from the district spawn through the walking lattice.
- Mesh rays sample the body and head envelope on floors and along connections. These identify visual geometry that may be missing from collision metadata. Supporting floor faces and the lowest 0.35 m of legacy ground paving are excluded. Warnings require inspection; sparse rays do not prove the whole volume clear.
- A floor-collapsed graph reports components, branch nodes and independent cycles. It ignores alternate ground paths and fixture partitions within a floor, so its counts are descriptive rather than a navigation guarantee.
- Sector summaries retain the district's spawn connectivity. A sector does not receive an invented local starting point.

The two-metre lattice is approximate: narrow entrances and offset paths can be missed. Reported area is sampled area, not an exact mesh integral. Walking diagnostics exclude jumping, falling, vehicles and decorative roofs. Missing reachability should be investigated against actual movement before changing design to satisfy the sampler.

`node scripts/review-verticality.mjs [district-id ...]` captures each place from an aerial view, its ground entrance and an eye-height view on the largest floor plate at each authored height. `--all-floors` includes every authored floor piece. These use local game geometry, do not request Google imagery, and retain scene fog. Aerial views show layout; standing views are needed to assess the experience from inside the space.

## Judgment still required

Reviewers should follow alternate routes, inspect their entrances from street level, check cross-level visibility and cover, and ask whether the upper and lower levels offer meaningful movement choices. Floor counts, cycle counts and maximum height are not completion targets. A district's architecture and terrain should explain its elevation, and a place should remain legible and useful when viewed from the player's height.

## Implemented district spaces

| Districts | Connected playable space |
| --- | --- |
| Orchard | Open ION, Wisma and Ngee Ann podiums, two retail gallery levels, distributed stairs and rear links |
| Raffles Place, Marina Bay | Open CBD podium arcades and linked promenade retail courts with roof gardens |
| Queenstown, Bishan, Toa Payoh | Housing/community gallery circuits, open ground courts and separate stair approaches |
| Chinatown, Geylang | Open markets with complete upper food/dining circuits |
| Kampong Glam, Tampines | Two retail/community concourses around open atriums and courts |
| Changi | Two Jewel viewing circuits around the forest and waterfall |
| Jurong, HarbourFront, Punggol | Open mall podiums, linked retail floors and accessible roof space where authored |
| Woodlands | Two open multilevel car parks with opposing routes |
| Tuas | Connected equipment decks around the existing industrial columns |
| Bukit Timah, Upper Thomson | Earth-backed contours with branching climbs and alternative descents |
| Sentosa | Resort galleries and roof, plus a climbable fort hillside and rampart |

These are compressed architectural and terrain adaptations of the existing scenes. They do not claim surveyed interior layouts, public access to real roofs, or new reference acceptance. Existing accepted landmark features remain documented separately. No capture plans, reference budgets or Google requests were changed.

## Gameplay and cost

Upper supplies relocate a portion of the existing crate allocation within its selected sector; counts, item contents and sector rolls remain unchanged. Food stays at ground stalls. Pickups compare feet height, preventing collection through floors. Map/intel labels identify upper supplies. Ground-only NPC and checkpoint interactions retain their height checks.

Bots use walk-surface paths validated by the same movement kernel. Cold searches yield across frames in approximately one-millisecond slices per bot; evaluated edges are cached. This is access navigation, not a claim of sophisticated multilevel tactics. The existing exploration autopilot remains a ground planner and does not chase supplies on another floor.

Sectors were extended/renamed around the playable places, with ground spawn anchors moved out of the Bukit Timah and Sentosa terrain. Cover bands were recomputed using the existing cover evaluator. Upper-floor loot positions are separate from ground-only spawn anchors.

Repeated place geometry uses instanced rendering; movement surfaces use spatial buckets. The review and diagnostics run offline. District edits do not trigger reference requests for other districts.

## Verification snapshot

927 tests across101 files, typecheck and production build passed. All19 districts were rendered in84 aerial, entry and player-eye views, with zero JavaScript errors and zero Google requests. Targeted views were refreshed after visual corrections. Real browser walking covered Orchard FPS and exploration ascent, authoritative actor height, jump/landing and prone. All19 districts retain valid vehicle spawn/exit points; vehicle-only collision projections block the new terrain and low structural pieces while keeping clear underpasses usable.

The images still show sparse furnishings and deliberately blocky terrain in places. These checks establish substantial connected playable spaces, not finished architectural interiors, measured geographic fidelity or physical-device performance certification.

## October 3 level-design audit and first revision

The earlier access pass made upper floors reachable; it did not finish the level
layouts. Inspection of the scene builders and player-eye renders found:

- Sixteen of nineteen district builders use `kit.streetGrid`. The repeated
  through-roads, right-angle junctions and perimeter loop make movement similar
  even when landmark silhouettes differ. The other three predate that helper;
  their absence from this count is not evidence of better layouts.
- Orchard repeats almost the same four-sided gallery and stair arrangement for
  three malls. A different facade does not give each interior a different route.
- Chinatown's ordinary shophouse doors were decorative panels on solid masses.
  The open market was usable, but did not supply the intimate rooms, rear exits
  and street-to-building transitions implied by the surrounding architecture.
- Many opened buildings read as roofed platforms. Sparse counters and signs do
  not provide enclosed rooms, controlled views or a useful sheltered alternative.
- Bukit Timah's climb used broad rectangular green ramps, repeated parallel paths
  and guardrails. It offered real elevation but looked and played like an outdoor
  circulation structure rather than a hillside.
- Upper loot already provides a reason to climb, but patrol spawns remain at
  street height. Height and access alone do not establish varied encounter design.

This revision changes three contrasting districts, not all nineteen:

- **Chinatown:** two Smith Street shops at x=-28 and x=8, z=57 now have offset
  front/rear doors, a clear ground shortcut, goods shelves and a 3 m loft with
  stairs. Their side walls support the lofts, avoiding columns in the doorways.
- **Orchard:** Wisma's north galleries contain enclosed book/reading rooms with
  offset entrances, a diagonal shelving partition and clear routes around it.
  Each mall also has a second stair between its 5 m and 10 m galleries, allowing
  a return circuit instead of requiring the same upper stair in both directions.
- **Bukit Timah:** the same four elevations now have tapering, offset terrain
  boundaries, unfenced meandering paths, staggered trees and rock outcrops. The
  hill still has steep faceted sides; this is a first layout revision, not finished
  natural topography or a terrain-engine replacement.

Convex terrain footprints and rotated fixtures now share their actual plan shape
with infantry collision. Terrain also supplies vehicle footprints and filters
upper-loot/navigation samples. Existing rectangular geometry keeps its previous
behavior. Outlined terrain is restricted to solid, unrailed convex bands with
axis-aligned elevation gradients; arbitrary terrain heightfields are not implied.

The major street layouts remain unchanged. The next substantive pass should
replace district-specific routes through the blocks—courtyards and kinked alleys
in shop districts, service/loading loops in industrial districts, and contour
routes in park districts—while updating road maps, spawn/sector anchors and
vehicle clearance together. More identical rooms or extra bridges would not
address that remaining problem.

Local before views: `.cache/level-design-before/`. New eye-height room and trail
views: `.cache/level-design-detail/`; the capture report records runtime errors
and external map requests. The review page accepts an optional camera pose for
spaces that its automatic largest-floor view misses. Route regressions exercise
both directions through the doors, stairs and winding trail with the wider
exploration walker, plus exact terrain/fixture collision and bot/loot support.

Validation for this revision: 984 tests across107 files and production build /
typecheck pass. Live FPS and exploration ascent passed; FPS also checked
camera/authoritative height, elevated jumping/landing and prone. Seven dedicated
room/trail views reported zero runtime errors and zero external map requests.
The production build retains its existing bundle-size advisory.

## October 28 resumption

The October 3 work still supports walking through the shops, ascending the
retail galleries and following the hill trails. This follow-up addresses three
remaining integration/layout gaps:

- Smith Street lofts now have open windows toward the street and rear lane.
  The actual wall is segmented, with a 1.2 m parapet above the loft and its
  existing guard. Rendered rays and host cover both see through the opening;
  standing movement still meets the parapet. These remain authored gameplay
  interiors, without new claims about the real buildings.
- Orchard's offset bookshop doors were missed by the bot graph's nine floor
  samples. Supported approach points at tall wall/shelf corners now connect the
  room in both directions on all three levels. Rails, posts and low props are
  excluded from the added samples to bound graph growth. Edges still use the
  walking kernel and incremental search.
- Footprints reached infantry movement in the original pass, but vehicle driving,
  vehicle spawn/route clearance and authoritative shot tests still treated them
  as their enclosing rectangles. Those consumers now retain the convex shape.
  Shot tests also clip the solid sloped terrain and its top face to the outline.
  Cars retain their existing rectangular body envelope and street-height rules.

To reproduce the detailed visual review, run
`node scripts/review-verticality.mjs orchard chinatown bukit-timah --details`
with Vite and isolated Chrome CDP running at the script's configured origins.
The command adds room, return-stair, loft-window and trail views to the normal
place views. The latest local gallery is
`.cache/verticality-review/index.html`: 29 captures, no JavaScript errors and
no Google requests. Use HMR disabled for the separate
`scripts/verticality-smoke.mjs` movement fixture, as its header requires;
full-page development reloads otherwise discard its camera instrumentation.

Regressions cover supported bot routes through the reading room, real mesh and
host rays through each loft window, retained parapet collision, unequal vehicle
half-extents, both polygon windings, and authoritative rounds beside solid
flat/sloped terrain. Live browser walking verifies FPS/exploration ascent,
authoritative actor height, elevated jumping/landing and prone. District-scale
street layouts and the hill's faceted topography still need a later design pass.

Final validation: all 1,565 tests across 161 files, typecheck and production
build passed after the window change. The existing bundle-size advisory remains.
