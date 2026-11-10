import { expect, it } from 'vitest';
import { createMaidFollower, MAID_WALK_SPEED } from './maid-companion';
import type { VerticalWorld } from './vertical-movement';
const world: VerticalWorld = { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, surfaces: [], obstacles: [], traversalObstacles: [] };
const origin = { x: 0, y: 0, z: 0 };
it('walks at a fixed maximum speed, falls behind a runner and catches up when they wait', () => {
  const maid = createMaidFollower(world, origin); let target = { ...origin };
  for (let i = 0; i < 100; i++) {
    target.x += .55; const before = maid.position; maid.update(.1, target);
    expect(Math.hypot(maid.position.x - before.x, maid.position.z - before.z)).toBeLessThanOrEqual(MAID_WALK_SPEED * .1 + 1e-8);
  }
  expect(maid.distance).toBeGreaterThan(25); expect(maid.reachable(target)).toBe(false);
  for (let i = 0; i < 350; i++) maid.update(.1, target);
  expect(maid.reachable(target)).toBe(true); expect(maid.distance).toBeLessThan(2);
});
it('keeps following when a runner leaves the local navigation radius', () => {
  const maid = createMaidFollower(world, origin); let target = { ...origin };
  for (let i = 0; i < 180; i++) { target.x += .5; maid.update(.1, target); }
  expect(maid.distance).toBeGreaterThan(35);
  for (let i = 0; i < 500; i++) maid.update(.1, target);
  expect(maid.reachable(target)).toBe(true);
});
it('walks around solid walls and never hands magazines through them', () => {
  const wall = { minX: 4, maxX: 6, minZ: -4, maxZ: 4, maxY: 3 };
  const maid = createMaidFollower({ ...world, obstacles: [wall] }, origin);
  const target = { x: 12, y: 0, z: 0 }; let detoured = false;
  for (let i = 0; i < 500; i++) { maid.update(.1, target); detoured ||= Math.abs(maid.position.z) > 4; expect(maid.position.x < 3.63 || maid.position.x > 6.37 || Math.abs(maid.position.z) > 4.37).toBe(true); }
  expect(detoured).toBe(true); expect(maid.reachable(target)).toBe(true);
  const thinWall = { minX: .8, maxX: 1, minZ: -4, maxZ: 4, maxY: 3 };
  expect(createMaidFollower({ ...world, obstacles: [thinWall] }, origin).reachable({ x: 2, y: 0, z: 0 })).toBe(false);
});
it('preserves district arrival delay and starts from the entry, not a player who ran ahead', () => {
  const maid = createMaidFollower(world, origin, 5), target = { x: 20, y: 0, z: 0 };
  for (let i = 0; i < 40; i++) maid.update(.1, target);
  expect(maid.arriving).toBe(true); expect(maid.position).toEqual(origin); expect(maid.reachable(origin)).toBe(false);
  expect(maid.travelSeconds(target)).toBeGreaterThan(8);
  for (let i = 0; i < 20; i++) maid.update(.1, target);
  expect(maid.arriving).toBe(false); expect(maid.position.x).toBeLessThan(2.5);
});
it('waits at unreachable destinations without teleporting, even after a long wait', () => {
  const maid = createMaidFollower(world, origin);
  for (let i = 0; i < 600; i++) maid.update(.1, { x: 10, y: 10, z: 0 });
  expect(maid.position).toEqual(origin); expect(maid.reachable({ x: 10, y: 10, z: 0 })).toBe(false);
});
it('takes the stairs to an upper floor instead of appearing upstairs', () => {
  const ramp = { id: 'stairs', routeId: 'hall', minX: 0, maxX: 12, minZ: -2, maxZ: 2, axis: 'x' as const, startHeight: 0, endHeight: 3 };
  const floor = { ...ramp, id: 'hall/floor', minX: 12, maxX: 24, minZ: -6, maxZ: 6, startHeight: 3, endHeight: 3 };
  const maid = createMaidFollower({ ...world, surfaces: [ramp, floor] }, { x: 18, y: 0, z: 10 });
  const target = { x: 20, y: 3, z: 0 }; let usedEntrance = false;
  for (let i = 0; i < 1000; i++) { maid.update(.1, target); usedEntrance ||= maid.position.x < .5; }
  expect(usedEntrance).toBe(true); expect(maid.position.y).toBeCloseTo(3); expect(maid.reachable(target)).toBe(true);
});
