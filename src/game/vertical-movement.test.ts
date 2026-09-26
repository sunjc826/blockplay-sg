import { createArena } from './arena-rules';
import { createRegionMovement } from './region-collision';
import { describe, expect, it } from 'vitest';
import { createVerticalMovement } from './vertical-movement';
import type { WalkSurface, TraversalObstacle } from './vertical-routes';
import type { Obstacle } from './region-collision';

const ramp: WalkSurface = { id: 'ramp', routeId: 'route', minX: 0, maxX: 12, minZ: -2, maxZ: 2, axis: 'x', startHeight: 0, endHeight: 3 };
const deck: WalkSurface = { ...ramp, id: 'deck', minX: 12, maxX: 22, startHeight: 3, endHeight: 3 };
const world = (surfaces: WalkSurface[] = [ramp, deck], obstacles: Obstacle[] = [], traversalObstacles: TraversalObstacle[] = []) => createVerticalMovement({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, surfaces, obstacles, traversalObstacles });
const start = { x: -1, z: 0, y: 0, velocityY: 0 };

describe('authored vertical movement', () => {
  it('walks continuously up and down a ramp, crossing its shared deck boundary', () => {
    const movement = world([ramp, deck], [], [{ minX: 12, maxX: 22, minZ: -2, maxZ: 2, minY: 2.78, maxY: 3 }]);
    const top = movement.move(start, 18, 0, 4);
    expect(top.x).toBeCloseTo(17); expect(top.y).toBeCloseTo(3); expect(top.grounded).toBe(true);
    const bottom = movement.move(top, -18, 0, 4);
    expect(bottom.x).toBeCloseTo(-1); expect(bottom.y).toBe(0);
  });
  it('allows underpasses but cannot walk through a ramp with inadequate headroom', () => {
    const movement = world();
    expect(movement.canOccupy(17, 0, 0)).toBe(true);
    expect(movement.canOccupy(4, 0, 0)).toBe(false);
    expect(movement.canOccupy(4, 1, 0)).toBe(true);
  });
  it('solid terraces have no phantom underpass beneath their ramp or deck', () => {
    const movement = world([{ ...ramp, solidBelow: true }, { ...deck, solidBelow: true }]);
    expect(movement.canOccupy(17, 0, 0)).toBe(false);
    expect(movement.canOccupy(11, 0, 0)).toBe(false);
    expect(movement.move(start, 18, 0, 4).y).toBeCloseTo(3);
  });
  it('never treats a decorative obstacle roof as an authored floor', () => {
    const movement = world([], [{ minX: 0, maxX: 5, minZ: -2, maxZ: 2, maxY: 2 }]);
    expect(movement.supportHeight(2, 0, 3)).toBeNull();
    expect(movement.move(start, 9, 0, 2).x).toBeLessThan(0);
  });
  it('rejects steps taller than the configured step limit', () => {
    const movement = world([{ ...deck, minX: 0, startHeight: .6, endHeight: .6 }]);
    expect(movement.move(start, 4, 0, 1).x).toBeLessThan(0);
    expect(world([{ ...deck, minX: 0, startHeight: .3, endHeight: .3 }]).move(start, 4, 0, 1).y).toBeCloseTo(.3);
  });
  it('can jump and land on an elevated deck and falls after leaving it', () => {
    const movement = world();
    let state = movement.move({ x: 17, z: 0, y: 3, velocityY: 5.2 }, 0, 0, .2);
    expect(state.y).toBeGreaterThan(3); expect(state.grounded).toBe(false);
    state = movement.move(state, 0, 0, 1); expect(state.y).toBe(3); expect(state.grounded).toBe(true);
    state = movement.move(state, 10, 0, 2); expect(state.y).toBe(0); expect(state.grounded).toBe(true);
  });
  it('stops a jump at an overhead slab and blocks rails without tunnelling', () => {
    const slab = { minX: -5, maxX: 5, minZ: -5, maxZ: 5, minY: 2, maxY: 2.2 };
    const movement = world([], [], [slab, { minX: 1, maxX: 1.1, minZ: -5, maxZ: 5, minY: 0, maxY: 1.2 }]);
    const jump = movement.move({ ...start, velocityY: 5.2 }, 0, 0, .06);
    expect(jump.y).toBeLessThanOrEqual(.2 + 1e-6);
    expect(movement.move(start, 20, 0, 1).x).toBeLessThan(1);
  });
  it('permits bridge traversal over water without granting a walkable water floor', () => {
    const movement = world([ramp, deck], [{ minX: 13, maxX: 20, minZ: -5, maxZ: 5, maxY: .2 }]);
    expect(movement.canOccupy(17, 0, 0)).toBe(false);
    expect(movement.supportHeight(17, 0, .2)).toBeNull();
    expect(movement.move(start, 18, 0, 4).y).toBe(3);
  });
  it('supports deterministic walk-only metric edges without simulating elapsed time', () => {
    const movement = world();
    const top = movement.move(start, 18, 0, 0);
    expect(top.y).toBeCloseTo(3); expect(top.grounded).toBe(true);
    expect(movement.move(top, 10, 0, 0).grounded).toBe(false);
  });
});

it('host accepts the same ramp/deck traversal and elevated prone stance', () => {
  const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
  const terrain = { bounds, obstacles: [], surfaces: [ramp, deck], traversalObstacles: [{ minX: 12, maxX: 22, minZ: -2, maxZ: 2, minY: 2.78, maxY: 3 }] };
  const movement = createVerticalMovement(terrain);
  const arena = createArena([], 0, 'mixed', { bounds, move: createRegionMovement(bounds).move, spawns: [{ x: -1, z: 0 }], playerSpawn: { x: -1, z: 0 } }, undefined, terrain);
  arena.addPlayer('walker', 'Walker', 0, 0, undefined, undefined, true);
  let state = { ...start, grounded: true };
  for (let i = 0; i < 180; i++) {
    state = movement.move(state, .1, 0, .025);
    arena.step(.025);
    arena.setInput('walker', { x: state.x, y: state.y + 1.75, z: state.z, yaw: 0, pitch: 0, weapon: 0, playing: true });
  }
  let actor = arena.snapshot().actors[0];
  expect(actor.x).toBeCloseTo(17); expect(actor.y).toBeCloseTo(4.75);
  arena.setInput('walker', { ...actor, y: 3.55, prone: true, playing: true });
  actor = arena.snapshot().actors[0]; expect(actor.prone).toBe(true); expect(actor.y).toBeCloseTo(3.55);
});

it('authoritative shots cannot pass sideways through a solid sloped foundation', () => {
  for (const solidBelow of [false, true]) {
    const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
    const terrain = { bounds, obstacles: [], surfaces: [{ ...ramp, solidBelow }], traversalObstacles: [] };
    const arena = createArena([], 0, 'mixed', { bounds, move: createRegionMovement(bounds).move, spawns: [{ x: 8, z: -5 }, { x: 8, z: 5 }] }, undefined, terrain);
    arena.addPlayer('one', 'One'); arena.addPlayer('two', 'Two');
    const [a, b] = arena.snapshot().actors;
    const d = Math.hypot(b.x - a.x, b.y - .6 - a.y, b.z - a.z);
    const result = arena.shoot(a.id, a, { x: (b.x - a.x) / d, y: (b.y - .6 - a.y) / d, z: (b.z - a.z) / d }, a.weapon);
    expect(result.hitId).toBe(solidBelow ? null : 'two');
  }
});
