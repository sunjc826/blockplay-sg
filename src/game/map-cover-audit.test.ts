import { expect, it } from 'vitest';
import { REGIONS } from './regions';
import { auditMapCover } from './map-cover-audit';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { createSceneCover } from './scene-cover';
import { buildChangiScene } from './changi-scene';
import { buildRafflesScene } from './raffles-scene';
import { arenaWallDistance, createArena } from './arena-rules';
import { getTraversalObstacles } from './vertical-routes';

for (const region of REGIONS) it(`${region.id}: authority agrees with visible geometry at multiple heights`, () => {
  const world = region.build();
  try {
    world.stamps.forEach(s => { s.visible = false; });
    accelerateInstancedRaycasts(world.scene);
    const audit = auditMapCover(world.scene, world.obstacles, 40);
    expect(audit.probes).toBeGreaterThan(0);
    expect(audit.authorityMismatches, JSON.stringify(audit.examples)).toBe(0);
  } finally { world.dispose(); }
}, 30_000);

it('Changi: shots pass through railing gaps but hit top rails and posts on both viewing levels', () => {
  const world = buildChangiScene();
  try {
    accelerateInstancedRaycasts(world.scene);
    const cover = createSceneCover(world.scene), direction = { x: 1, y: 0, z: 0 };
    for (const floor of [4.8, 9.6]) {
      const from = { x: -111, y: floor + .6, z: -75 };
      expect(arenaWallDistance(from, direction, getTraversalObstacles(world.scene))).toBeLessThan(2);
      expect(cover.distance(from, direction, 2)).toBe(2);
      expect(cover.distance({ ...from, y: floor + 1.08 }, direction, 2)).toBeLessThan(2);
      expect(cover.distance({ ...from, z: -74 }, direction, 2)).toBeLessThan(2);
    }
  } finally { world.dispose(); }
});

it('Raffles: a host round crosses above the lawn bed and damages a target; the stone bed still blocks low rays', () => {
  const world = buildRafflesScene();
  try {
    accelerateInstancedRaycasts(world.scene);
    const cover = createSceneCover(world.scene), from = { x: -44, y: 1.75, z: -33 }, direction = { x: 1, y: 0, z: 0 };
    expect(arenaWallDistance(from, direction, world.obstacles)).toBe(5);
    expect(cover.distance(from, direction, 32)).toBe(32);
    expect(cover.distance({ ...from, y: .4 }, direction, 32)).toBeCloseTo(5);
    const arena = createArena(world.obstacles, 0, 'mixed', {
      bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
      spawns: [{ x: -44, z: -33 }, { x: -12, z: -33 }], move: p => p,
    }, undefined, undefined, cover.distance);
    arena.addPlayer('one', 'One'); arena.addPlayer('two', 'Two');
    const shooter = arena.snapshot().actors.find(a => a.id === 'one')!;
    arena.shoot('one', shooter, direction, 0);
    for (let t = 0; t < .2; t += .01) arena.step(.01);
    expect(arena.snapshot().actors.find(a => a.id === 'two')!.health).toBeLessThan(100);
    expect(arena.snapshot().impacts).toHaveLength(1);
  } finally { world.dispose(); }
});
