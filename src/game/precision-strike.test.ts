import { expect, it } from 'vitest';
import { precisionStrikeDamage, precisionStrikePlacement } from './precision-strike';
import { createVerticalMovement } from './vertical-movement';
import type { Obstacle } from './region-collision';
const bounds = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
const origin = { x: 0, y: 1.75, z: 0 }, target = { x: 0, y: 0, z: -200 };
const movement = (obstacles: Obstacle[] = []) => createVerticalMovement({ bounds, obstacles, surfaces: [], traversalObstacles: [] });
const options = { movement: movement(), wallDistance: () => Infinity, spawns: [], protectedEnemies: [] };

it('designates distant ground and near-cover surfaces without a soldier-sized footprint', () => {
  expect(precisionStrikePlacement(origin, target, options).at).toEqual({ ...target, y: .4 });
  const m = movement([{ minX: .3, maxX: 1, minZ: -201, maxZ: -199, minY: 0, maxY: 2 }]);
  expect(m.canOccupy(0, 0, -200, .5, 1.4)).toBe(false);
  expect(precisionStrikePlacement(origin, target, { ...options, movement: m }).at).not.toBeNull();
});
it('retains bounded targeting, solid cover, supported floors and protection for the whole blast zone', () => {
  for (const at of [null, { ...target, x: NaN }, { ...target, y: 4 }, { ...target, z: -251 }])
    expect(precisionStrikePlacement(origin, at, options).at).toBeNull();
  expect(precisionStrikePlacement(origin, target, { ...options, wallDistance: () => 100 }).reason).toContain('obstacle');
  expect(precisionStrikePlacement(origin, target, { ...options, spawns: [{ ...target, x: 8 }] }).at).toBeNull();
  expect(precisionStrikePlacement(origin, target, { ...options, protectedEnemies: [{ ...target, x: 8 }] }).at).toBeNull();
  expect(precisionStrikePlacement(origin, target, { ...options, spawns: [{ ...target, x: 10 }] }).at).not.toBeNull();
});
it('keeps a lethal core, meaningful outer damage and a hard radius limit', () => {
  expect(precisionStrikeDamage(0)).toBe(250);
  expect(precisionStrikeDamage(4)).toBe(250);
  expect(precisionStrikeDamage(6)).toBe(155);
  expect(precisionStrikeDamage(8)).toBe(60);
  expect(precisionStrikeDamage(8.01)).toBe(0);
});
