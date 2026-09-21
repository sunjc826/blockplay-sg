// How far a player must run to reach cover, per district and per sector.
//
// Formatting only: the measurement itself lives in src/game/cover-metrics.ts,
// so this report and the sector label guard in zone-sectors.test.ts cannot
// disagree, and neither can drift from the scenes the game ships.
//
// Run: pnpm analyse:cover                   One district: pnpm analyse:cover -- --district bishan
//      pnpm analyse:cover -- --sectors      Machine-readable: pnpm analyse:cover -- --json
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { REGIONS, getRegion } = await import('../src/game/regions.ts');
const { coverMasses, measureCover } = await import('../src/game/cover-metrics.ts');
const { zoneSectors } = await import('../src/game/zone-sectors.ts');

const flag = name => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const only = flag('district');
const wantSectors = process.argv.includes('--sectors');
const asJson = process.argv.includes('--json');
const metres = value => (value === Infinity ? 'none' : `${value.toFixed(1)}m`);

const report = [];
for (const region of (only ? [getRegion(only)] : REGIONS)) {
  const world = region.build();
  try {
    const masses = coverMasses(world.scene);
    // Only ground a player can stand on counts as exposed; the harbour does not.
    const standable = (x, z) => region.canOccupy(x, z, 0.4, world.obstacles);
    const crouch = measureCover(region.bounds, masses.crouch, standable);
    const stand = measureCover(region.bounds, masses.stand, standable);
    const sectors = zoneSectors(region.id).map(sector => ({
      id: sector.id, name: sector.name, declared: sector.cover,
      crouch: measureCover(sector.bounds, masses.crouch, standable),
      stand: measureCover(sector.bounds, masses.stand, standable),
    }));
    report.push({ id: region.id, bounds: region.bounds, crouch, stand, sectors });
  } finally { world.dispose(); }
}

if (asJson) {
  console.log(JSON.stringify(report, (_key, value) => (value === Infinity ? null : value), 2));
} else {
  console.log('Median distance to cover. Crouch cover reaches 1.15m, standing cover 1.75m —');
  console.log('the engine\'s two eye heights. Lower is more defensible.\n');
  console.log(`${'district'.padEnd(15)} ${'crouch'.padStart(7)} ${'p90'.padStart(7)}  ${'stand'.padStart(7)} ${'p90'.padStart(7)}  solid`);
  for (const row of [...report].sort((a, b) => b.crouch.median - a.crouch.median)) {
    console.log(`${row.id.padEnd(15)} ${metres(row.crouch.median).padStart(7)} ${metres(row.crouch.p90).padStart(7)}  ${metres(row.stand.median).padStart(7)} ${metres(row.stand.p90).padStart(7)}  ${String(Math.round(row.crouch.solid * 100)).padStart(3)}%`);
    if (!wantSectors) continue;
    for (const sector of row.sectors) {
      console.log(`  ${sector.id.padEnd(13)} ${metres(sector.crouch.median).padStart(7)} ${metres(sector.crouch.p90).padStart(7)}  ${metres(sector.stand.median).padStart(7)} ${metres(sector.stand.p90).padStart(7)}  ${String(Math.round(sector.crouch.solid * 100)).padStart(3)}%  declared ${sector.declared}`);
    }
  }
}
