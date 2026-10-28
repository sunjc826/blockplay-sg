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
const { analyseSceneCover } = await import('../src/game/scene-cover-metrics.ts');

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
    // Collectibles are hidden in FPS and must not improve its cover diagnostic.
    const stampVisibility = world.stamps.map(stamp => stamp.visible);
    world.stamps.forEach(stamp => { stamp.visible = false; });
    const analysis = analyseSceneCover(world.scene, region.bounds, world.obstacles);
    world.stamps.forEach((stamp, i) => { stamp.visible = stampVisibility[i]; });
    // Only ground a player can stand on counts as exposed; the harbour does not.
    const standable = (x, z) => region.canOccupy(x, z, 0.4, world.obstacles);
    const crouch = measureCover(region.bounds, masses.crouch, standable);
    const stand = measureCover(region.bounds, masses.stand, standable);
    const sectors = zoneSectors(region.id).map(sector => ({
      id: sector.id, name: sector.name, declared: sector.cover,
      crouch: measureCover(sector.bounds, masses.crouch, standable),
      stand: measureCover(sector.bounds, masses.stand, standable),
      proximity: analysis.measure(sector.bounds),
    }));
    report.push({ id: region.id, bounds: region.bounds, crouch, stand, proximity: analysis.measure(), landscape: world.scene.userData.landscape, sectors });
  } finally { world.dispose(); }
}

if (asJson) {
  console.log(JSON.stringify(report, (_key, value) => (value === Infinity ? null : value), 2));
} else {
  console.log('Ground cover proximity: mean / median / p90 metres. Solid stops rounds; visual includes solid + foliage.');
  console.log('2m horizontal proximity proxy, 25cm terrain bands; not walking distance or directional protection.\n');
  const print = (name, proximity) => {
    for (const posture of ['stand', 'crouch', 'prone']) {
      const format = s => s ? [s.mean, s.median, s.p90].map(metres).join(' / ').padStart(26) : 'no occupiable samples'.padStart(26);
      console.log(`${name.padEnd(24)} ${posture.padEnd(6)} solid ${format(proximity[posture].solid)}  visual ${format(proximity[posture].visual)}`);
    }
  };
  for (const row of report) {
    print(row.id, row.proximity);
    if (wantSectors) for (const sector of row.sectors) print(`  ${sector.id}`, sector.proximity);
  }
}
