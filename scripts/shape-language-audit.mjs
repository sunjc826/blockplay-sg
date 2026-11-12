// Offline survey of every registered district against the block module (docs/SHAPE-LANGUAGE.md).
// node --experimental-strip-types scripts/shape-language-audit.mjs [district ...] [--json] [--out file]
import { register } from 'node:module';
import { writeFileSync } from 'node:fs';
register('./ts-extension-hook.mjs', import.meta.url);
const { REGIONS } = await import('../src/game/regions.ts');
const { auditShapeLanguage } = await import('../src/game/shape-language-audit.ts');
const { SHAPE_FREEFORM_ZONES } = await import('../src/game/block-module.ts').catch(() => ({ SHAPE_FREEFORM_ZONES: {} }));
const args = process.argv.slice(2).filter(arg => arg !== '--');
const outIndex = args.indexOf('--out'), out = outIndex >= 0 ? args[outIndex + 1] : undefined;
const requested = args.filter((arg, i) => !arg.startsWith('--') && (outIndex < 0 || i !== outIndex + 1));
if (requested.some(id => !REGIONS.some(r => r.id === id))) throw new Error('Unknown district');
const results = [];
for (const region of REGIONS.filter(r => !requested.length || requested.includes(r.id))) {
  const world = region.build();
  try {
    world.car.visible = false; world.stamps.forEach(s => { s.visible = false; });
    results.push({ district: region.id, ...auditShapeLanguage(world.scene, SHAPE_FREEFORM_ZONES[region.id] ?? []) });
  } finally { world.dispose(); }
}
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
if (args.includes('--json')) console.log(JSON.stringify(results, null, 2));
else console.table(results.map(r => ({
  district: r.district, generic: r.genericBoxes, freeform: r.freeformBoxes + r.rotatedBoxes,
  'box .1': r.modules['0.1'].boxes, 'dims .1': r.modules['0.1'].dims, 'edge .1': r.modules['0.1'].planEdges, 'edge .5': r.modules['0.5'].planEdges,
  'thin<.1 plan': r.thin['0.1'].plan, 'thin<.1 raised': r.thin['0.1'].raised, 'gap<.1': r.gaps['0.1'].gaps,
  caps: r.ground.caps, 'cap edge .1': r.ground.edges['0.1'], 'sliver<.1': r.ground.slivers['0.1'],
  draws: r.drawables, tris: r.triangles,
})));
