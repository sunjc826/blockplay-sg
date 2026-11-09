import { expect, it } from 'vitest';
import { guardianPlacement } from './guardian-placement';
import { createVerticalMovement } from './vertical-movement';
import { createArena } from './arena-rules';
import { createRegionMovement, type Obstacle } from './region-collision';
import { shootAndLand } from './arena-test-shots';
import { buildHardpointWorld } from './hardpoint-world';
import { getPhysicalWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createSceneCover } from './scene-cover';
import { SMITH_CONTROL_SITES } from './hardpoint';

const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const origin = { x: 0, y: 1.75, z: 0 }, target = { x: 0, y: 0, z: -3 };
const movement = (obstacles: Obstacle[] = []) => createVerticalMovement({ bounds, obstacles, surfaces: [], traversalObstacles: [] });
const options = { movement: movement(), wallDistance: (_from: unknown, _ray: unknown, range: number) => range, enemySpawns: [], protectedEnemies: [] };

it('fits beside cover and beneath a low awning using the Guardian footprint', () => {
  const m = movement([{ minX: .45, maxX: 1, minZ: -4, maxZ: -2, minY: 0, maxY: 2 },
    { minX: -1, maxX: 1, minZ: -4, maxZ: -2, minY: 1.3, maxY: 2 }]);
  expect(m.canOccupy(0, 0, -3, .5, 1.4)).toBe(false);
  expect(guardianPlacement(origin, target, { ...options, movement: m }).at).toEqual({ ...target, y: .7 });
});
it('rejects solids, unsupported targets, map edges, distant targets and walls', () => {
  const solid = movement([{ minX: -1, maxX: 1, minZ: -4, maxZ: -2, minY: 0, maxY: 2 }]);
  expect(guardianPlacement(origin, target, { ...options, movement: solid }).at).toBeNull();
  for (const at of [null, { ...target, y: 3 }, { ...target, x: NaN }, { ...target, z: -9 }]) expect(guardianPlacement(origin, at, options).at).toBeNull();
  expect(guardianPlacement({ x: 48, y: 1.75, z: 0 }, { x: 49.8, y: 0, z: 0 }, options).at).toBeNull();
  expect(guardianPlacement(origin, target, { ...options, wallDistance: () => 1 }).reason).toContain('obstacle');
});
it('keeps enemy spawn and shield protection', () => {
  expect(guardianPlacement(origin, target, { ...options, enemySpawns: [target] }).at).toBeNull();
  expect(guardianPlacement(origin, target, { ...options, protectedEnemies: [target] }).at).toBeNull();
});
it('accepts real clear ground around every Hardpoint capture station', () => {
  const world = buildHardpointWorld();
  try {
    world.stamps.forEach(s => { s.visible = false; });
    const m = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getPhysicalWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
    const cover = createSceneCover(world.scene);
    for (const site of SMITH_CONTROL_SITES) for (const dx of [-2, 2]) {
      const at = { x: site.x + dx, y: site.y, z: site.z };
      expect(guardianPlacement({ ...at, y: at.y + 1.75, z: at.z + 2 }, at, { ...options, movement: m, wallDistance: cover.distance }).at, site.id).not.toBeNull();
    }
  } finally { world.dispose(); }
});

it('authority deploys at an allied spawn through smoke and consumes only an accepted reward', () => {
  const area = { id: 'smith-street' as const, name: 'Test', region: 'chinatown' as const, bounds, spawns: { alpha: [{ x: 0, z: 0 }], bravo: [{ x: 30, z: 0 }] }, patrols: [] };
  const sim = createArena([], 0, 'mixed', { bounds, move: createRegionMovement(bounds).move, spawns: [...area.spawns.alpha, ...area.spawns.bravo], teamDeathmatch: area });
  for (const id of ['one', 'two']) sim.addPlayer(id, id, 0, 0, [{ damage: 200, interval: .06, capacity: 100, reload: .4 }]);
  expect(sim.configureStreaks('one', ['interceptor', 'recon', 'strike'])).toBe(true);
  const tick = (n: number) => { for (let i = 0; i < n; i++) sim.step(.05); };
  const actor = (id: string) => sim.snapshot().actors.find(a => a.id === id)!;
  tick(65);
  for (let i = 0; i < 4; i++) {
    sim.setPlayerVitals('two', { health: 100 });
    const a = actor('one'), b = actor('two'), length = Math.hypot(b.x - a.x, b.y - .6 - a.y, b.z - a.z);
    expect(shootAndLand(sim, 'one', a, { x: (b.x - a.x) / length, y: (b.y - .6 - a.y) / length, z: (b.z - a.z) / length }, 0).killed).toBe(true);
    tick(2);
  }
  expect(sim.activateStreak('one', 'interceptor', { ...target, y: 4 })).toBe(false);
  expect(sim.snapshot().streaks!.players.one.ready).toContain('interceptor');
  sim.setPlayerGrenades('one', { 'grenade-smoke': 1 });
  expect(sim.throwGrenade('one', { id: 'grenade-smoke', origin: actor('one'), direction: { x: 0, y: -1, z: 0 }, cooked: 0, under: true })).toBe(true);
  tick(80);
  expect(sim.snapshot().grenadeEvents?.some(e => e.id === 'grenade-smoke')).toBe(true);
  expect(sim.activateStreak('one', 'interceptor', target)).toBe(true);
  expect(sim.snapshot().streaks!.players.one.ready).not.toContain('interceptor');
  expect(sim.snapshot().streaks!.effects.find(e => e.kind === 'interceptor')).toMatchObject({ ...target, y: .7 });
});
