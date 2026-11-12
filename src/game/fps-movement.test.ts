import { describe, expect, it } from 'vitest';
import { INFANTRY_SPEED, movementFrameSteps, advanceBodyMotion, advanceGroundMotion, bufferJump, consumeJump, createMovementMotion, INFANTRY_GRAVITY, INFANTRY_JUMP_SPEED, landMovement, resetMovementMotion } from './fps-movement';
import { runningWeaponMotion } from './fps-weapon-run';
import { createVerticalMovement } from './vertical-movement';

const flat = () => createVerticalMovement({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, obstacles: [], surfaces: [], traversalObstacles: [] });
describe('weighted infantry movement', () => {
  it('a running jump over a low solid prop with no top to stand on does not fall into it', () => {
    const prop = { minX: 3, maxX: 6, minZ: -3, maxZ: 3, maxY: 1.2 };
    const world = createVerticalMovement({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, obstacles: [prop], surfaces: [], traversalObstacles: [] });
    let state = { x: 0, y: 0, z: 0, velocityY: INFANTRY_JUMP_SPEED };
    const step = (dx: number) => { state = { ...state, ...world.move(state, dx, 0, 1 / 60, .38, 1.8, [], INFANTRY_GRAVITY) }; };
    for (let i = 0; i < 60 && state.x < 4.5; i++) step(7 / 60);
    expect(state.x).toBeGreaterThanOrEqual(4.5);
    for (let i = 0; i < 90; i++) step(0);
    expect(state.y).toBeGreaterThanOrEqual(1.2);
    expect(world.canOccupy(state.x, state.y, state.z, .38, 1.8)).toBe(true);
    for (let i = 0; i < 60; i++) step(4 / 60);
    expect(state.x).toBeGreaterThan(6.38);
    for (let i = 0; i < 90; i++) step(0);
    expect(state.y).toBe(0);
  });
  it('ramps up, brakes promptly and travels the same distance at 30/60/144 fps', () => {
    const distances = [30, 60, 144].map(fps => {
      const state = createMovementMotion(); let distance = 0;
      for (let i = 0; i < fps; i++) distance += advanceGroundMotion(state, 4.2, 0, true, 1, 'stand', false, 1 / fps).x;
      expect(state.x).toBeGreaterThan(4.19);
      const stop = advanceGroundMotion(state, 0, 0, true, 1, 'stand', false, .25);
      expect(stop.x).toBeLessThan(.27); expect(state.x).toBeLessThan(.08);
      return distance;
    });
    expect(distances[0]).toBeCloseTo(distances[2], 8);
    expect(distances[1]).toBeCloseTo(distances[2], 8);
    const state = createMovementMotion(); advanceGroundMotion(state, 4.2, 0, true, 1, 'stand', false, 1 / 60);
    expect(state.x).toBeGreaterThan(0); expect(state.x).toBeLessThan(1);
  });
  it('preserves air momentum without input and limits reversals', () => {
    const air = createMovementMotion(), ground = createMovementMotion(); air.x = ground.x = 5;
    advanceGroundMotion(air, 0, 0, false, 1, 'stand', false, .2);
    expect(air.x).toBeGreaterThan(4.8);
    advanceGroundMotion(air, -5, 0, false, 1, 'stand', false, .1);
    advanceGroundMotion(ground, -5, 0, true, 1, 'stand', false, .1);
    expect(air.x).toBeGreaterThan(3); expect(ground.x).toBeLessThan(0);
  });
  it('heavy gear accelerates more slowly and a deployed mount stops all drift', () => {
    const light = createMovementMotion(), heavy = createMovementMotion();
    advanceGroundMotion(light, 4, 0, true, 1, 'stand', false, .1);
    advanceGroundMotion(heavy, 4, 0, true, .3, 'stand', false, .1);
    expect(heavy.x).toBeLessThan(light.x);
    expect(advanceGroundMotion(light, 4, 0, true, 1, 'prone', true, .1)).toEqual({ x: 0, z: 0 });
    expect(light.x).toBe(0);
  });
  it('buffers a late jump, grants a brief ledge grace period and never double-jumps', () => {
    const state = createMovementMotion();
    consumeJump(state, true, true, .016); bufferJump(state);
    expect(consumeJump(state, false, true, .04)).toBe(true);
    bufferJump(state); expect(consumeJump(state, false, true, .016)).toBe(false);
    expect(consumeJump(state, false, true, .2)).toBe(false);
    bufferJump(state); expect(consumeJump(state, false, true, .08)).toBe(false);
    expect(consumeJump(state, true, true, .016)).toBe(true);
    bufferJump(state); expect(consumeJump(state, true, false, .3)).toBe(false);
    expect(consumeJump(state, true, true, .016)).toBe(false);
  });
  it('eases stances without overshoot, with a slower prone transition and quiet airborne gait', () => {
    const crouch = createMovementMotion(), prone = createMovementMotion();
    advanceBodyMotion(crouch, 1.15, 'crouch', 0, true, false, 0, 0, .1);
    advanceBodyMotion(prone, .55, 'prone', 0, true, false, 0, 0, .1);
    expect(crouch.eye).toBeGreaterThan(1.15); expect(crouch.eye).toBeLessThan(1.75);
    expect((1.75 - prone.eye) / 1.2).toBeLessThan((1.75 - crouch.eye) / .6);
    for (let i = 0; i < 120; i++) {
      advanceBodyMotion(prone, .55, 'prone', 3, false, false, 0, 0, 1 / 60);
      expect(prone.eye).toBeGreaterThanOrEqual(.55);
    }
    expect(prone.eye).toBeCloseTo(.55, 5); expect(prone.gait).toBe(0);
  });
  it('returns impact speed even when landing happens inside a long frame, and settles the spring', () => {
    const landed = flat().move({ x: 0, z: 0, y: 2, velocityY: -2 }, 0, 0, 1, .38, 1.8, [], INFANTRY_GRAVITY);
    expect(landed.grounded).toBe(true); expect(landed.y).toBe(0); expect(landed.impactSpeed).toBeGreaterThan(8);
    const state = createMovementMotion(); landMovement(state, landed.impactSpeed);
    advanceBodyMotion(state, 1.75, 'stand', 0, true, false, 0, 0, .05);
    expect(state.compression).toBeLessThan(-.02); expect(state.compression).toBeGreaterThanOrEqual(-.16);
    for (let i = 0; i < 120; i++) advanceBodyMotion(state, 1.75, 'stand', 0, true, false, 0, 0, 1 / 60);
    expect(state.compression).toBeCloseTo(0, 5);
    state.x = 4; bufferJump(state); resetMovementMotion(state, .55);
    expect(state.x).toBe(0); expect(state.eye).toBe(.55); expect(state.jumpBuffer).toBe(0);
  });
  it('clears low obstacles with a bounded arc and falls faster than it rises', () => {
    const movement = flat(); let state = { x: 0, y: 0, z: 0, velocityY: INFANTRY_JUMP_SPEED };
    let peak = 0, rise = 0, fall = 0;
    for (let i = 0; i < 180; i++) {
      const next = movement.move(state, 0, 0, 1 / 120, .38, 1.8, [], INFANTRY_GRAVITY);
      if (next.velocityY > 0) rise++; else fall++;
      peak = Math.max(peak, next.y); state = next; if (next.grounded) break;
    }
    expect(peak).toBeGreaterThan(1.5); expect(peak).toBeLessThan(1.65); expect(fall).toBeLessThan(rise);
  });
});

describe('wall-clock traversal and running presentation', () => {
  it('preserves sprint distance at 5–144 FPS, including irregular slow frames', () => {
    const travel = (frames: number[]) => {
      const state = createMovementMotion(); let distance = 0;
      for (const elapsed of frames) for (const dt of movementFrameSteps(elapsed)) distance += advanceGroundMotion(state, INFANTRY_SPEED.sprint, 0, true, 1, 'stand', false, dt).x;
      return distance;
    };
    const reference = travel(Array(600).fill(1 / 60));
    for (const fps of [5, 10, 15, 20, 30, 144]) expect(travel(Array(fps * 10).fill(1 / fps))).toBeCloseTo(reference, 8);
    expect(travel(Array.from({ length: 100 }, (_, i) => i % 2 ? .18 : .02))).toBeCloseTo(reference, 8);
    expect(reference).toBeGreaterThan(89); expect(reference).toBeLessThan(91);
    expect(movementFrameSteps(20).reduce((a, b) => a + b, 0)).toBeCloseTo(.25);
    for (const bad of [0, -1, NaN, Infinity]) expect(movementFrameSteps(bad)).toEqual([]);
  });
  it('keeps slow-frame sprint collisions solid', () => {
    const wall = { minX: 5, maxX: 5.1, minZ: -10, maxZ: 10, maxY: 5 };
    const world = createVerticalMovement({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, obstacles: [wall], surfaces: [], traversalObstacles: [] });
    const motion = createMovementMotion(); let at = { x: 0, y: 0, z: 0, velocityY: 0 };
    for (let frame = 0; frame < 30; frame++) for (const dt of movementFrameSteps(.1)) {
      const delta = advanceGroundMotion(motion, INFANTRY_SPEED.sprint, 0, true, 1, 'stand', false, dt);
      at = world.move(at, delta.x, delta.z, dt, .38, 1.8, [], INFANTRY_GRAVITY);
    }
    expect(at.x).toBeGreaterThan(4.5); expect(at.x).toBeLessThanOrEqual(4.62);
  });
  it('ties a complete running cycle to two footfalls and suppresses optional motion in ADS/reduced motion', () => {
    const state = createMovementMotion();
    advanceBodyMotion(state, 1.75, 'stand', 8.8, true, true, 0, 8.8, .5);
    expect(state.gait).toBeCloseTo(Math.PI * 2);
    const first = runningWeaponMotion(state, { id: 'sar21-inspired', weightKg: 3 });
    state.gait += Math.PI / 2; const next = runningWeaponMotion(state, { id: 'sar21-inspired', weightKg: 3 });
    expect(Math.abs(first.x - next.x)).toBeGreaterThan(.02);
    for (const value of Object.values(runningWeaponMotion(state, { id: 'sar21-inspired', weightKg: 3 }, 1))) expect(value).toBeCloseTo(0);
    const reduced = runningWeaponMotion(state, { id: 'sar21-inspired', weightKg: 3 }, 0, true); state.gait += 1;
    expect(runningWeaponMotion(state, { id: 'sar21-inspired', weightKg: 3 }, 0, true)).toEqual(reduced);
    expect(reduced.y).toBeLessThan(0);
  });
});
