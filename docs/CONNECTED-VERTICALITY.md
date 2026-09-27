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
