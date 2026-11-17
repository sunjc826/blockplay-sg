// How open each district's ground is, from its built colliders: building share, raised floor, how much of
// the ground round a soldier is in sight, and the same by thirds of the map. A level review starts here.
//
// The measurement lives in src/game/layout-metrics.ts (2D, one eye height, colliders only; see its header).
//
// Run: pnpm analyse:layout                         One district: pnpm analyse:layout -- --district marina-bay
//      pnpm analyse:layout -- --cell 4 --reach 80  Machine-readable: pnpm analyse:layout -- --json
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { REGIONS, getRegion } = await import('../src/game/regions.ts');
const { measureLayout } = await import('../src/game/layout-metrics.ts');
const { getWalkSurfaces } = await import('../src/game/vertical-routes.ts');

const flag = name => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? process.argv[at + 1] : undefined; };
const only = flag('district'), asJson = process.argv.includes('--json');
const options = { cell: Number(flag('cell')) || undefined, reach: Number(flag('reach')) || undefined };
const percent = value => `${(value * 100).toFixed(1)}%`.padStart(6);

const report = [];
for (const region of (only ? [getRegion(only)] : REGIONS)) {
  const world = region.build();
  try {
    report.push({ id: region.id, ...measureLayout(region.bounds, world.obstacles, (x, z) => region.canOccupy(x, z, .4, world.obstacles), { ...options, surfaces: getWalkSurfaces(world.scene) }) });
  } finally { world.dispose?.(); }
}
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  const first = report[0];
  console.log(`Layout openness per district: ${first?.cell} m grid, sightlines to ${first?.reach} m at standing eye height, colliders only.`);
  console.log('Open = mean share of the surrounding disc in sight (higher is more exposed). Sight = average clear distance round a soldier, mean / median.\n');
  console.log(`${'district'.padEnd(18)} ${'built'.padStart(6)} ${'raised'.padStart(6)} ${'open'.padStart(6)}   ${'north'.padStart(6)} ${'middle'.padStart(6)} ${'south'.padStart(6)}   sight`);
  for (const row of report) console.log(`${row.id.padEnd(18)} ${percent(row.buildingShare)} ${percent(row.raisedShare)} ${percent(row.openness)}   ${row.bands.map(band => percent(band.openness)).join(' ')}   ${row.sightline.mean.toFixed(0)} / ${row.sightline.median.toFixed(0)} m`);
}
