import { describe, expect, it } from 'vitest';
import { WORLD_GATEWAYS, resolveWorldBorderCrossing } from './world-zones';
import { getRegion } from './regions';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';

describe('physical boardwalk crossing', () => {
  const view = { yaw: 2.8, pitch: -.24 };
  it('preserves lateral position, view and overshoot, with immediate deliberate return', () => {
    const outward = resolveWorldBorderCrossing('harbourfront', { x: 111, z: 209.9 }, { x: 111.05, z: 210.1 }, view)!;
    expect(outward.to).toBe('sentosa');
    expect(outward.spawn.x).toBeCloseTo(110.05);
    expect(outward.spawn.z).toBeCloseTo(-204.75);
    expect(outward.spawn).toMatchObject(view);
    expect(resolveWorldBorderCrossing('sentosa', outward.spawn, { ...outward.spawn, z: -204.5 }, view)).toBeNull();
    const back = resolveWorldBorderCrossing('sentosa', outward.spawn, { x: 110.05, z: -205.1 }, view)!;
    expect(back.to).toBe('harbourfront');
    expect(back.spawn.x).toBeCloseTo(111.05);
    expect(back.spawn.z).toBeCloseTo(209.75);
    expect(back.spawn).toMatchObject(view);
    expect(resolveWorldBorderCrossing('harbourfront', back.spawn, { ...back.spawn, z: 209.5 }, view)).toBeNull();
  });
  it('ignores proximity, inward/parallel motion, wrong districts, water and non-finite input', () => {
    expect(resolveWorldBorderCrossing('harbourfront', { x: 109, z: 209 }, { x: 109, z: 209.8 }, view)).toBeNull();
    expect(resolveWorldBorderCrossing('harbourfront', { x: 109, z: 210.1 }, { x: 109, z: 209.9 }, view)).toBeNull();
    expect(resolveWorldBorderCrossing('harbourfront', { x: 108, z: 210.1 }, { x: 109, z: 210.1 }, view)).toBeNull();
    expect(resolveWorldBorderCrossing('marina-bay', { x: 109, z: 209.9 }, { x: 109, z: 210.1 }, view)).toBeNull();
    expect(resolveWorldBorderCrossing('harbourfront', { x: 115, z: 209.9 }, { x: 115, z: 210.1 }, view)).toBeNull();
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(resolveWorldBorderCrossing('harbourfront', { x: bad, z: 209.9 }, { x: 109, z: 210.1 }, view)).toBeNull();
      expect(resolveWorldBorderCrossing('harbourfront', { x: 109, z: 209.9 }, { x: 109, z: 210.1 }, { ...view, yaw: bad })).toBeNull();
    }
  });
  for (const gateway of WORLD_GATEWAYS.filter(g => g.border)) it(`${gateway.from}: real boundary and mapped arrivals are walkable across their width`, () => {
    const region = getRegion(gateway.from), world = region.build();
    const destination = getRegion(gateway.to), target = destination.build();
    try {
      expect(Math.abs(gateway.position.z - (gateway.border!.direction > 0 ? region.bounds.maxZ : region.bounds.minZ))).toBeLessThanOrEqual(5);
      const movement = createVerticalMovement({ bounds: region.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
      const targetMovement = createVerticalMovement({ bounds: destination.bounds, obstacles: target.obstacles, surfaces: getWalkSurfaces(target.scene), traversalObstacles: getTraversalObstacles(target.scene) });
      for (const offset of [-4.5, 0, 4.5]) {
        let p = { x: gateway.position.x + offset, z: gateway.position.z - gateway.border!.direction * 2, y: 0, velocityY: 0 };
        for (let i = 0; i < 22; i++) p = movement.move(p, 0, gateway.border!.direction * .1, .025, .38, 1.8);
        expect((p.z - gateway.position.z) * gateway.border!.direction).toBeGreaterThan(0);
        const crossing = resolveWorldBorderCrossing(gateway.from, { ...p, z: p.z - gateway.border!.direction * .3 }, p, view)!;
        expect(crossing).not.toBeNull();
        expect(targetMovement.canOccupy(crossing.spawn.x, 0, crossing.spawn.z, .38, 1.8)).toBe(true);
      }
    } finally { world.dispose(); target.dispose(); }
  });
});
