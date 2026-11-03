import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

/** Uses the production planner and scene builders, without loading app plugins. */
export async function bakeNavigation({ output = '.cache/navigation-bake', districts, onMap = () => {} } = {}) {
  await mkdir(`${output}/maps`, { recursive: true });
  const server = await createServer({ configFile: false, cacheDir: '.cache/navigation-bake/vite',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  const start = performance.now(), cpu = process.cpuUsage(), maps = [];
  try {
    const { REGION_IDS } = await server.ssrLoadModule('/src/game/region-ids.ts');
    const { navigationBakeWorld } = await server.ssrLoadModule('/scripts/lib/navigation-bake-world.ts');
    const { createVerticalNavigator } = await server.ssrLoadModule('/src/game/vertical-navigation.ts');
    for (const id of districts ?? REGION_IDS) {
      if (!REGION_IDS.includes(id)) throw new Error(`Unknown navigation district: ${id}`);
      const mapStart = performance.now(), mapCpu = process.cpuUsage();
      const fixture = navigationBakeWorld(id), worldMs = performance.now() - mapStart;
      try {
        const nodeStart = performance.now(), nav = createVerticalNavigator(fixture.terrain, fixture.anchors), nodesMs = performance.now() - nodeStart;
        const edgeStart = performance.now(), data = nav.bake(), edgesMs = performance.now() - edgeStart;
        const json = JSON.stringify(data), used = process.cpuUsage(mapCpu);
        const row = { id, nodes: data.positions.length / 3, edges: data.targets.length, candidates: nav.status().validatedConnections,
          worldMs, nodesMs, edgesMs, totalMs: performance.now() - mapStart, cpuMs: (used.user + used.system) / 1000,
          jsonBytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).length, rssBytes: process.memoryUsage().rss };
        await writeFile(`${output}/maps/${id}.json`, json);
        await onMap(id, json);
        maps.push(row);
        console.log(`[navigation bake] ${id}: ${row.nodes} nodes, ${row.edges} edges, ${(row.totalMs / 1000).toFixed(2)}s, ${(row.gzipBytes / 1024).toFixed(1)} KiB gzip`);
      } finally { fixture.dispose(); }
    }
    const used = process.cpuUsage(cpu);
    const report = { format: 1, method: 'Fresh sequential bake of every selected open-world district using the live walking validator; includes scene construction. Gzip sizes are estimates.',
      totalMs: performance.now() - start, cpuMs: (used.user + used.system) / 1000,
      jsonBytes: maps.reduce((s, m) => s + m.jsonBytes, 0), gzipBytes: maps.reduce((s, m) => s + m.gzipBytes, 0),
      peakProcessRssKiB: process.resourceUsage().maxRSS, maps };
    await writeFile(`${output}/profile.json`, JSON.stringify(report, null, 2));
    return report;
  } finally { await server.close(); }
}
