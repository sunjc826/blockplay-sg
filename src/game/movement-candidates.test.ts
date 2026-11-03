import { expect, it } from 'vitest';
import { createVerticalMovement, type VerticalWorld } from './vertical-movement';
import { overlapsObstacle, type Obstacle } from './region-collision';

const empty: VerticalWorld = { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, obstacles: [], traversalObstacles: [], surfaces: [] };

it('refreshes static candidates across positive and negative cell boundaries, including large bodies', () => {
  const walls = [-16, 0, 16, 32].map(x => ({ minX: x + .9, maxX: x + 1.1, minZ: -2, maxZ: 2, maxY: 3 }));
  const movement = createVerticalMovement({ ...empty, obstacles: walls });
  // Alternate cells, repeat a cell, and revisit it after an oversized query.
  for (const x of [-16.01, 15.99, 16.01, -15.99, -.01, .01, 31.99, -16.01]) {
    expect(movement.canOccupy(x, 0, 0, .38)).toBe(true);
    expect(movement.canOccupy(x, 0, 0, 1.2)).toBe(false);
    expect(movement.canOccupy(x, 0, 0, .38)).toBe(true);
    expect(movement.canOccupy(x + 1, 0, 0, .38)).toBe(false);
  }
});

it('sees a vehicle move into and out of the same cached cell without rebuilding static data', () => {
  const movement = createVerticalMovement(empty), car: Obstacle = { minX: 4, maxX: 6, minZ: -2, maxZ: 2, maxY: 3 };
  const extras = [car], state = { x: 0, y: 0, z: 0, velocityY: 0 };
  expect(movement.move(state, 1, 0, .1, .38, 1.8, extras).x).toBeCloseTo(1);
  car.minX = .5; car.maxX = 2.5;
  const blocked = movement.move(state, 1, 0, .1, .38, 1.8, extras);
  expect(blocked.x).toBeLessThanOrEqual(car.minX - .38 + 1e-5);
  car.minX = 4; car.maxX = 6;
  expect(movement.move(state, 1, 0, .1, .38, 1.8, extras).x).toBeCloseTo(1);
});

it('rechecks stationary support and jumping headroom against changing lift geometry', () => {
  const movement = createVerticalMovement(empty), platform: Obstacle = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: .8, maxY: 1, supportsTop: true };
  expect(movement.supportHeight(0, 0, 2, .38, 1.8, [platform])).toBe(1);
  platform.minY = 1.3; platform.maxY = 1.5;
  expect(movement.supportHeight(0, 0, 2, .38, 1.8, [platform])).toBe(1.5);
  const state = { x: 0, y: 1.5, z: 0, velocityY: 0 };
  expect(movement.move(state, 0, 0, .05, .38, 1.8, [platform]).grounded).toBe(true);
  expect(movement.move(state, 0, 0, .05).y).toBeLessThan(1.5);
  const roof = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: 2, maxY: 2.2 };
  const jump = { x: 0, y: 0, z: 0, velocityY: 5.2 };
  expect(movement.move(jump, 0, 0, .1, .38, 1.8, [roof]).y).toBeLessThanOrEqual(.2);
  roof.minY = 5; roof.maxY = 5.2;
  expect(movement.move(jump, 0, 0, .1, .38, 1.8, [roof]).y).toBeGreaterThan(.2);
});

it('uses current polygon vertices when a dynamic footprint changes in place', () => {
  const obstacle = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, footprint: [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }] };
  expect(overlapsObstacle(obstacle, 1.5, 0, .2)).toBe(false);
  for (const p of obstacle.footprint) p.x += 1;
  expect(overlapsObstacle(obstacle, 1.5, 0, .2)).toBe(true);
});
