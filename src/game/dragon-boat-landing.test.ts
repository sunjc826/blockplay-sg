import { expect, it, vi } from 'vitest';
import * as vehicleRules from './vehicle-rules';
import { buildDistrictWorld } from './district-world';
import { createArena } from './arena-rules';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createSceneCover } from './scene-cover';
import { DRAGON_BOAT_SPAWNS } from './marina-water';

const exits = vi.hoisted(() => ({ calls: 0 }));
vi.mock('./vehicle-rules', async importOriginal => {
  const actual = await importOriginal<typeof vehicleRules>();
  return { ...actual, vehicleExit: (...args: Parameters<typeof actual.vehicleExit>) => { exits.calls++; return actual.vehicleExit(...args); } };
});

it('works out a moored boat\'s landing once per step, however many bots are near it', () => {
  // The Marina Bay open world as the engine builds it: full battlefield, both boats moored.
  const world = buildDistrictWorld('marina-bay'), cover = createSceneCover(world.scene);
  const traversal = { bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) };
  const arena = createArena(world.obstacles, world.zone.botCount, world.zone.composition, world.environment,
    { spawns: { car: { x: -110, z: 90, yaw: 0 }, helicopter: { x: 110, z: 90, yaw: 0 }, ...DRAGON_BOAT_SPAWNS }, openWorld: true }, traversal, cover.distance);
  try {
    // Let the troops land from their transports, as a real battle has by the time anyone looks.
    for (let i = 0; i < 200; i++) arena.step(.05);
    const onFoot = arena.snapshot().actors.filter(a => a.bot && a.alive && !a.transport && !a.vehicle).length;
    expect(onFoot).toBeGreaterThan(15);
    const before = exits.calls, steps = 40;
    for (let i = 0; i < steps; i++) arena.step(.05);
    // Two boats; boarding and exits add the odd call, but never one per bot.
    expect((exits.calls - before) / steps).toBeLessThanOrEqual(4);
  } finally { world.dispose?.(); }
});
