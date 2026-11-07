# Physical structures and expedition adapter

The physical layer is independent of facility rules. Expedition is its first
production consumer; no additional game mode or mode selector is introduced.

## Responsibilities

- `src/game/structure-types.ts`: fixed physical layouts, assemblies and appearance
  values. A structure may contain props, a console/cabinet, a flag or a pad. None
  requires ownership, health, capture, supplies, deployment or an objective.
- `structure-layout.ts`: physical footprints, overhead collision, navigation
  anchors and installation/removal. Current furnishing footprints support the
  existing cardinal orientations (0 or pi/2), not arbitrary rotations.
- `structure-visuals.ts` and `structure-prop-visuals.ts`: models, existing static
  batching, per-part flight volumes, appearance updates and resource ownership.
- `expedition-structures.ts`: converts expedition definitions into physical
  layouts and facility state into colors, mast visibility and progress bars.
- `expedition-structure-visuals.ts`: applies that presentation and retains legacy
  facility/camp diagnostic tags. `facility-visuals.ts` remains a compatibility
  entry point for existing expedition callers.

`districtInfrastructure()` returns the expedition's fleet, facility definitions
and resolved structure layout. Both `fps-engine.ts` and
`scripts/lib/navigation-bake-world.ts` install that same layout through
`installStructureLayout()`. Navigation anchor order remains significant; the
existing expedition bake signatures are preserved.

## Lifecycle

1. Build district scenery and select/resolve the layout.
2. Install its collision and ceiling volumes. Append the returned navigation
   anchors to the mode's environment.
3. Construct movement/navigation against the completed world, then render the
   layout with `createStructureVisuals()` or the expedition adapter.
4. Supply appearance updates independently of physical layout definitions.
5. Dispose visuals and installed volumes when disposing/rebuilding the world.
   Removal is idempotent and preserves volumes installed by other systems.

Layouts are static for a world lifetime. Removal/replacement is an initialization
or teardown operation, not a live building/destruction API: existing navigators
must be rebuilt with the new geometry. Dynamic topology and mode-aware bake
lookup are future work. Never reuse an expedition navigation bake for a different
layout without the existing geometry-signature validation.

## Collision, cover and damage

Movement footprints, rendered cover and damage targets are different concepts.
Camp roofs and sandbags remain rendered cover. A console's `core.cover` can be
`scene` (rendered cover) or `external` (a mode owns its hit testing). Pad markers
are excluded from scenery rays.

Expedition uses external cores and retains the existing analytical facility
hitboxes and damage rules. Destroying its console still leaves camp cover and
movement footprints intact. Ownership, suppression, damage and work progress
still drive the same colors and indicators. Shared appearance materials continue
to update camp flags without rebuilding meshes.

## Compatibility and scope

`FacilitySite.camp` is intentionally retained as expedition's authored/save/wire
format, including its AI patrol stops. It is translated at the adapter boundary;
physical renderers and geometry helpers do not import facility types or rules.
This pass does not migrate snapshots or generalize arena simulation, objectives,
HUDs, networking, logistics or spawn policies. Existing capture/build/repair,
vehicle production, infantry waves, proxy delivery and district travel keep their
current contracts.

A new mode can author its own `StructureLayout`, including an empty one, and keep
its objectives separately. It must explicitly choose its arena environment rather
than inherit the expedition defaults returned by `buildDistrictWorld()`.

## Validation

`src/game/structure-layout.test.ts` covers independent structures, cover policies,
roof/movement collision, ordinary respawning without facility side effects,
expedition presentation, cleanup and empty layouts. Existing facility/camp,
placement, combat, navigation and travel tests continue to exercise expedition.

For the real-district alternative-layout proof, run Vite and an isolated Chrome
with remote debugging, then:

```sh
STRUCTURE_APP_ORIGIN=http://127.0.0.1:5311 \
STRUCTURE_CHROME_ORIGIN=http://127.0.0.1:9497 \
node scripts/structure-layout-smoke.mjs
```

If the shell routes local requests through a proxy, add
`NO_PROXY=localhost,127.0.0.1`. The fixture uses Toa Payoh scenery with standalone
sandbags and a separate test-only zone. It checks collision/cover, zone occupancy,
respawning/reset, absence of facility/logistics state, layout replacement and
cleanup. It is a composition proof, not a shipped capture mode. Evidence is saved
to `.cache/structure-extraction/`.
