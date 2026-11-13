import { describe, expect, it } from 'vitest';
import { createVerticalMovement } from './vertical-movement';
import type { Obstacle } from './region-collision';
import { MANTLE_AIR_MIN, MANTLE_AIR_REACH, MANTLE_GROUND_MIN, MANTLE_REACH, advanceMantle, createMantle, planMantle, startMantle } from './fps-mantle';

const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
const world = (...obstacles: Obstacle[]) => createVerticalMovement({ bounds, obstacles, surfaces: [], traversalObstacles: [] });
const crate = (maxY: number, supportsTop = true, depth = 4): Obstacle => ({ minX: 0, maxX: depth, minZ: -2, maxZ: 2, minY: 0, maxY, supportsTop });
const ground = { minLift: MANTLE_GROUND_MIN, reach: MANTLE_REACH, vault: true };
const at = (x: number, y = 0) => ({ x, y, z: 0 });

describe('planning a mantle', () => {
  it('climbs onto cover between a hop and the top of the reach', () => {
    for (const height of [.8, 1.25, 1.6]) expect(planMantle(world(crate(height)), at(-.4), 1, 0, ground)).toMatchObject({ y: height, vault: false });
    // Low enough to jump, too tall to reach, and nothing there at all.
    expect(planMantle(world(crate(.6)), at(-.4), 1, 0, ground)).toBeNull();
    expect(planMantle(world(crate(1.75)), at(-.4), 1, 0, ground)).toBeNull();
    expect(planMantle(world(crate(Infinity)), at(-.4), 1, 0, ground)).toBeNull();
    expect(planMantle(world(), at(-.4), 1, 0, ground)).toBeNull();
  });
  it('needs the cover close and ahead', () => {
    const cover = world(crate(1.2));
    expect(planMantle(cover, at(-1.5), 1, 0, ground)).toBeNull();
    expect(planMantle(cover, at(-.4), -1, 0, ground)).toBeNull();
    expect(planMantle(cover, at(-.4), 0, 1, ground)).toBeNull();
    expect(planMantle(cover, at(-.6), 1, 0, ground)).not.toBeNull();
  });
  it('lands with the feet on the top and room to stand', () => {
    const cover = world(crate(1.2)), plan = planMantle(cover, at(-.4), 1, 0, ground)!;
    expect(plan.x).toBeGreaterThan(0); expect(cover.canOccupy(plan.x, plan.y, plan.z, .38, 1.8)).toBe(true);
    expect(cover.supportHeight(plan.x, plan.z, plan.y + .01)).toBe(1.2);
  });
  it('refuses a ledge with no headroom over it or over the climber', () => {
    const shelf: Obstacle = { minX: 0, maxX: 4, minZ: -2, maxZ: 2, minY: 2.2, maxY: 2.5 };
    expect(planMantle(world(crate(1.2), shelf), at(-.4), 1, 0, ground)).toBeNull();
    const lintel: Obstacle = { minX: -2, maxX: 0, minZ: -2, maxZ: 2, minY: 1.9, maxY: 2.2 };
    expect(planMantle(world(crate(1.2), lintel), at(-.4), 1, 0, ground)).toBeNull();
    expect(planMantle(world(crate(.8), lintel), at(-.4), 1, 0, ground)).toBeNull();
  });
  it('vaults a low wall that has no top, onto the ground beyond', () => {
    const wall = world(crate(1, false, .3)), plan = planMantle(wall, at(-.4), 1, 0, ground)!;
    expect(plan.vault).toBe(true); expect(plan.y).toBeGreaterThanOrEqual(1); expect(plan.y).toBeLessThan(1.2);
    expect(plan.x).toBeGreaterThan(.3 + .38);
    // It ends in the air past the wall and falls to the ground from there.
    expect(wall.move({ ...plan, velocityY: 0 }, 0, 0, 1).y).toBe(0);
    // Too deep to cross, low enough to hop, and too tall.
    expect(planMantle(world(crate(1, false, 3)), at(-.4), 1, 0, ground)).toBeNull();
    expect(planMantle(world(crate(.5, false, .3)), at(-.4), 1, 0, ground)).toBeNull();
    expect(planMantle(world(crate(1.8, false, .3)), at(-.4), 1, 0, ground)).toBeNull();
    expect(planMantle(wall, at(-.4), 1, 0, { ...ground, vault: false })).toBeNull();
  });
  it('catches a ledge in mid-air, but not from the ground and not past the hands', () => {
    const cover = world(crate(1.5)), air = { minLift: MANTLE_AIR_MIN, vault: false };
    expect(planMantle(cover, at(-.4, .9), 1, 0, { ...air, reach: MANTLE_AIR_REACH })).toMatchObject({ y: 1.5 });
    expect(planMantle(cover, at(-.4, .1), 1, 0, { ...air, reach: MANTLE_AIR_REACH })).toBeNull();
    // Reach left over from where the jump began.
    expect(planMantle(cover, at(-.4, .9), 1, 0, { ...air, reach: .4 })).toBeNull();
    expect(planMantle(cover, at(-.4, .9), 1, 0, { ...air, reach: -1 })).toBeNull();
  });
  it('treats live cover like the map', () => {
    const truck = crate(1.3);
    expect(planMantle(world(), at(-.4), 1, 0, { ...ground, extra: [truck] })).toMatchObject({ y: 1.3 });
  });
});

describe('climbing', () => {
  it('takes longer for a taller ledge and for a heavier load, at any frame rate', () => {
    const run = (height: number, pace: number, fps: number) => {
      const state = createMantle(); startMantle(state, at(-.4), { x: .45, y: height, z: 0, vault: false }, pace);
      let time = 0, last = at(-.4);
      while (state.active && time < 3) { last = advanceMantle(state, 1 / fps); time += 1 / fps; }
      expect(last).toEqual({ x: .45, y: height, z: 0 });
      return time;
    };
    expect(run(1.5, 1, 60)).toBeGreaterThan(run(.8, 1, 60));
    expect(run(1.2, .7, 60)).toBeGreaterThan(run(1.2, 1, 60));
    expect(run(1.6, .7, 60)).toBeLessThan(1);
    expect(Math.abs(run(1.2, 1, 30) - run(1.2, 1, 144))).toBeLessThan(1 / 30 + 1e-6);
  });
  it('goes up before it goes across and reports its direction for the exit', () => {
    const state = createMantle(); startMantle(state, at(-.4), { x: .45, y: 1.2, z: 0, vault: false });
    expect(state.dirX).toBe(1); expect(state.dirZ).toBe(0);
    for (let i = 0; i < 200 && state.active; i++) { const p = advanceMantle(state, 1 / 120); if (p.x > -.4 + 1e-9) expect(p.y).toBe(1.2); }
    expect(state.active).toBe(false);
    expect(advanceMantle(state, 1)).toEqual({ x: .45, y: 1.2, z: 0 });
  });
});
