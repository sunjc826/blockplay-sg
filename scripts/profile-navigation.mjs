import { createServer } from 'vite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const output = process.env.NAVIGATION_OUTPUT || '.cache/navigation-bake';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const originalRandom = Math.random, results = [];
const stats = a => { const sorted = a.toSorted((a, b) => a - b); return { mean: a.reduce((s, x) => s + x, 0) / a.length, p95: sorted[Math.floor(a.length * .95)], max: sorted.at(-1) }; };
try {
  const { createBattlefieldScenario } = await server.ssrLoadModule('/scripts/lib/battlefield-scenario.ts');
  const { validArenaSnapshot } = await server.ssrLoadModule('/src/game/arena-runtime.ts');
  for (const id of process.env.NAVIGATION_DISTRICTS?.split(',') ?? ['queenstown']) {
    const baked = JSON.parse(await fs.readFile(`${output}/maps/${id}.json`, 'utf8'));
    for (const seed of [1, 2, 3]) for (const mode of seed % 2 ? ['lazy', 'baked'] : ['baked', 'lazy']) {
      let random = seed;
      Math.random = () => ((random = Math.imul(random, 1664525) + 1013904223 >>> 0) / 4294967296);
      const start = performance.now(), scenario = createBattlefieldScenario(id, 32, mode === 'baked' ? baked : undefined), initMs = performance.now() - start;
      try {
        assert.equal(scenario.arena.navigationGraphStatus().source, mode);
        const ticks = [];
        for (let i = 0; i < 1240; i++) { const start = performance.now(); scenario.arena.step(.05); ticks.push(performance.now() - start); }
        assert(validArenaSnapshot(scenario.arena.snapshot(), scenario.environment));
        const graph = scenario.arena.navigationGraphStatus();
        if (mode === 'baked') assert.equal(graph.validatedConnections, 0);
        const row = { id, seed, mode, bots: 32, initMs, coldTickMs: stats(ticks.slice(0, 40)), tickMs: stats(ticks.slice(40)), graph };
        results.push(row); console.log(JSON.stringify(row));
      } finally { scenario.dispose(); }
    }
  }
  await fs.writeFile(`${output}/runtime-profile.json`, JSON.stringify({ method: 'CPU-only 20Hz simulation; 2s cold + 60s measured, three seeds, alternating lazy/baked order. No rendering. Wall-clock navigation budgets can change trajectories; not a phone/FPS benchmark.', results }, null, 2));
} finally { Math.random = originalRandom; await server.close(); }
