// Project scene-dependent public map furniture to a small Node/Worker-safe index.
// Run after editing district placement. The parity test checks the saved projection.
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';

const vite = await createServer({ configFile: false, envFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true }, appType: 'custom' });
try {
  const { projectMapFurniture } = await vite.ssrLoadModule('/scripts/lib/cast-map-index.ts');
  const { REGION_IDS } = await vite.ssrLoadModule('/src/game/region-ids.ts');
  const rows = REGION_IDS.map(id => '  ' + JSON.stringify(id) + ': ' + JSON.stringify(projectMapFurniture(id)));
  await writeFile('src/data/cast-map-index.json', '{\n' + rows.join(',\n') + '\n}\n');
} finally {
  await vite.close();
}
