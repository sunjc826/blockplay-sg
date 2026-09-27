// Offline diagnostics from the actual district scenes and walking kernel.
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { REGIONS, isRegionId } = await import('../src/game/regions.ts');
const { getWalkSurfaces, getTraversalObstacles } = await import('../src/game/vertical-routes.ts');
const { measureVerticality } = await import('../src/game/verticality-metrics.ts');
const { getVerticalPlaces } = await import('../src/game/vertical-places.ts');
const { inspectVerticalPlaces } = await import('../src/game/vertical-place-diagnostics.ts');
const { zoneSectors } = await import('../src/game/zone-sectors.ts');

let only;
let sectors = false, json = false;
const args = process.argv.slice(2).filter(arg => arg !== '--');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--district') {
    only = args[++i];
    if (!isRegionId(only)) throw new Error(`Invalid --district ${JSON.stringify(only)}. Choose: ${REGIONS.map(r => r.id).join(', ')}`);
  } else if (args[i] === '--sectors') sectors = true;
  else if (args[i] === '--json') json = true;
  else throw new Error(`Unknown argument: ${args[i]}`);
}
const report = [];
for (const region of REGIONS.filter(region => !only || region.id === only)) {
  const world = region.build();
  try {
    const surfaces = getWalkSurfaces(world.scene);
    const input = { bounds: region.bounds, spawn: region.spawn, obstacles: world.obstacles, surfaces, traversalObstacles: getTraversalObstacles(world.scene) };
    const after = measureVerticality(input);
    // Counterfactual in the current scene, not a historical pre-change snapshot.
    const before = measureVerticality({ ...input, surfaces: [] });
    report.push({
      id: region.id, parameters: after.parameters,
      baselineDescription: 'Current scene with authored walk surfaces disabled; not a historical snapshot.',
      baseline: before.district, current: after.district,
      unreachableSamples: after.unreachableSamples,
      places: inspectVerticalPlaces(world.scene, input, getVerticalPlaces(world.scene), after.isReachable),
      authoredRouteIds: [...new Set(surfaces.map(s => s.routeId))].sort(),
      ...(sectors ? { sectors: zoneSectors(region.id).map(sector => ({ id: sector.id, name: sector.name, baseline: before.summarize(sector.bounds), current: after.summarize(sector.bounds) })) } : {}),
    });
  } finally { world.dispose(); }
}
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log('Verticality diagnostics: 2 m lattice; elevated = feet >= 2 m above street. No score or pass/fail.');
  console.log('Only spawn-connected standing walking paths count. No jumps, falls, flying, or decorative roofs.');
  console.log('Distances follow sampled walking paths; null/none means no sampled route to elevated space.');
  console.log('Baseline disables authored walk surfaces in the current scene; it is not historical.\n');
  const m = value => value === null ? 'none' : value.toFixed(1);
  const line = (name, row) => console.log(`${name.padEnd(24)} elevated ${row.elevatedAreaM2.toFixed(0).padStart(5)} m² (${(row.elevatedAreaFraction * 100).toFixed(2)}%) | overlap ${row.overlappingFootprintM2.toFixed(0)} m² | max ${m(row.heightM.max)} m | access median/p90 ${m(row.distanceToElevatedSpaceM.median)}/${m(row.distanceToElevatedSpaceM.p90)} m | slopes ${row.reachableSlopeIds.length}`);
  for (const row of report) {
    line(`${row.id} [baseline]`, row.baseline);
    line(row.id, row.current);
    for (const sector of row.sectors ?? []) line(`  ${sector.id}`, sector.current);
    for (const place of row.places) {
      console.log(`  ${place.id}: floors ${place.floors.map(f => `${f.id} ${f.spawnReachableSamples}/${f.standingSamples} reachable probes`).join('; ')}`);
      for (const c of place.connections) if (!c.forward || !c.reverse) console.log(`    BLOCKED connection ${c.id}: forward=${c.forward}, reverse=${c.reverse}`);
      const warnings = [...place.floors, ...place.connections].reduce((sum, item) => sum + item.meshClearanceWarnings.length, 0);
      if (warnings) console.log(`    ${warnings} visual body/headroom probes need inspection (see --json); not a quality score.`);
    }
    const unreachableRoutes = row.authoredRouteIds.filter(id => !row.current.reachableRouteIds.includes(id));
    if (unreachableRoutes.length) console.log(`  No spawn-connected samples for: ${unreachableRoutes.join(', ')}`);
  }
}
