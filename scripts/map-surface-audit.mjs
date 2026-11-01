// Offline diagnostic of exposed coplanar static faces in every registered district.
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { REGIONS } = await import('../src/game/regions.ts');
const { accelerateInstancedRaycasts } = await import('../src/game/instanced-raycast.ts');
const { auditMapSurfaces } = await import('../src/game/map-surface-audit.ts');
const requested = process.argv.slice(2).filter(arg => arg !== '--json');
if (requested.some(id => !REGIONS.some(r => r.id === id))) throw new Error('Unknown district');
const results = [];
for (const region of REGIONS.filter(r => !requested.length || requested.includes(r.id))) {
  const world = region.build();
  try {
    world.car.visible = false; world.stamps.forEach(s => { s.visible = false; });
    accelerateInstancedRaycasts(world.scene);
    results.push({ district: region.id, ...auditMapSurfaces(world.scene) });
  } finally { world.dispose(); }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else console.table(results.map(r => ({ district: r.district, faces: r.faces, candidates: r.candidatePairs, conflicts: r.conflicts.length })));
if (results.some(r => r.conflicts.length)) process.exitCode = 1;
