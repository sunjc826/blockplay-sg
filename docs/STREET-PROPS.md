# Street props

The [object library](https://blockplaysg.fun/prop-designs) previews twelve original,
procedural models at game scale. Drag to orbit, switch lighting, and try the
break/knock-over and reset controls. The gallery is also linked from faction
studies.

| Behavior | Models |
| --- | --- |
| Fixed, solid scenery | Rain-garden planter, estate bench, reflective bollard, utility cabinet, cold-drinks machine, cycle stand |
| Breakable decoration | Slatted produce crate, terracotta plant pot |
| Movable decoration | Roadwork cone, kopitiam stool, estate wheelie bin, delivery hand trolley |

Every district receives up to 24 deterministic roadside placements on clear,
level ground. Markets, industrial districts and waterfronts use themed subsets;
other districts use the complete collection. Placement avoids existing
obstacles and water, road crossings, collectible stamps, district spawns and
training areas (including targets, firing lanes and vehicle starts). These are
fictional decorations, not reference-backed geographic details.

Fixed fixtures contribute movement bounds and rendered bullet cover. Bounds
come from the original model geometry before batching, so rendering precision
cannot change collision. Production navigation is rebaked by the normal build.

Small props are cosmetic: visible infantry and vehicle rounds can fracture or
tip them, using the round segment clipped to its actual collision. They do not
block walking, stop bullets, absorb blasts or become cover. Motion uses bounded
floor gravity, damping and settling; there is no full rigid-body simulation,
prop-to-prop collision or vehicle pushing. Fragment motion remains within 1.15 m
of the original footprint; whole props move at most 0.8 m along each horizontal
axis. Reactions are local presentation, not network-authoritative state. A world
reset restores the original transforms. Grenades do not trigger these props.

`src/game/street-props.ts` owns the model catalog, shared geometry/material pool
and cosmetic motion. `district-street-props.ts` places and manages them, while
`fps-engine.ts` supplies the visible round segments. Resources are shared per
world and released on disposal; movable objects stop updating after settling.

Validation: `pnpm test:props` uses Vite on port 5175 and Chrome remote debugging
on port 9224 (override with `FPS_APP_ORIGIN` / `FPS_CHROME_ORIGIN`). It checks all
models and their reactions, reset, lighting, phone layouts and actual district
renders. `scripts/fixtures/street-props.html?region=chinatown&prop=crate` is a
local world review fixture. Unit tests additionally cover every district,
placement exclusions and ballistic-cover isolation.
