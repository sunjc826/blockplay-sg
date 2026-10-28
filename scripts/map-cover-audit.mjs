// Offline audit of the actual 19 district meshes, including instanced structures.
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { REGIONS, isRegionId } = await import('../src/game/regions.ts');
const { accelerateInstancedRaycasts } = await import('../src/game/instanced-raycast.ts');
const { auditMapCover } = await import('../src/game/map-cover-audit.ts');
let only, json = false;
const args = process.argv.slice(2).filter(arg => arg !== '--');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--district') {
    only = args[++i];
    if (!isRegionId(only)) throw new Error(`Invalid district: ${only}`);
  } else if (args[i] === '--json') json = true;
  else throw new Error(`Unknown argument: ${args[i]}`);
}
const results = [];
for (const region of REGIONS.filter(r => !only || r.id === only)) {
  const world = region.build();
  try {
    world.stamps.forEach(stamp => { stamp.visible = false; });
    accelerateInstancedRaycasts(world.scene);
    results.push({ district: region.id, ...auditMapCover(world.scene, world.obstacles) });
  } finally { world.dispose(); }
}
if (json) console.log(JSON.stringify(results, null, 2));
else {
  console.log('Cover audit: six horizontal probes per movement obstacle. Coordinates and mesh/instance IDs: --json.');
  console.log('Movement differences describe why movement envelopes must not be used as shot cover. They are not failed movement checks.');
  console.table(results.map(({ district, probes, authorityMismatches, movementEnvelopeDifferences }) => ({ district, probes, authorityMismatches, movementEnvelopeDifferences })));
}
if (results.some(r => r.authorityMismatches)) process.exitCode = 1;
