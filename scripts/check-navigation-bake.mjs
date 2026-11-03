import { createServer } from 'vite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory = process.env.NAVIGATION_OUTPUT || '.cache/navigation-bake';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const results = [];
try {
  const { REGION_IDS } = await server.ssrLoadModule('/src/game/region-ids.ts');
  const { navigationBakeWorld } = await server.ssrLoadModule('/scripts/lib/navigation-bake-world.ts');
  const { createVerticalNavigator } = await server.ssrLoadModule('/src/game/vertical-navigation.ts');
  for (const id of process.env.NAVIGATION_DISTRICTS?.split(',') ?? REGION_IDS) {
    const data = JSON.parse(await fs.readFile(`${directory}/maps/${id}.json`, 'utf8')), fixture = navigationBakeWorld(id);
    try {
      let start = performance.now();
      const lazy = createVerticalNavigator(fixture.terrain, fixture.anchors), lazyInitMs = performance.now() - start;
      start = performance.now();
      const loaded = createVerticalNavigator(fixture.terrain, fixture.anchors, data), bakedInitMs = performance.now() - start;
      assert.equal(loaded.status().source, 'baked', id);
      const n = data.positions.length / 3;
      const point = i => ({ x: data.positions[i * 3], y: data.positions[i * 3 + 1], z: data.positions[i * 3 + 2] });
      let routes = 0, reachable = 0, lazyRouteMs = 0, bakedRouteMs = 0;
      for (let i = 0; i < Math.min(n, 16); i++) {
        const from = point(Math.floor(i * n / 16)), to = point(Math.floor((i + 7) * n / 16) % n);
        start = performance.now(); const expected = lazy.route(from, to); lazyRouteMs += performance.now() - start;
        start = performance.now(); const actual = loaded.route(from, to); bakedRouteMs += performance.now() - start;
        assert.deepEqual(actual, expected, `${id}: route ${i}`);
        routes++; if (actual.length) reachable++;
      }
      assert.equal(loaded.status().validatedConnections, 0, id);
      const row = { id, routes, reachable, lazyInitMs, bakedInitMs, lazyRouteMs, bakedRouteMs, avoidedValidations: lazy.status().validatedConnections };
      results.push(row); console.log(JSON.stringify(row));
    } finally { fixture.dispose(); }
  }
  assert(results.some(r => r.avoidedValidations > 0), 'Queries must exercise static graph validation');
  await fs.writeFile(`${directory}/verification.json`, JSON.stringify({ passed: true, results }, null, 2));
} finally { await server.close(); }
