import { describe, expect, it } from 'vitest';
import { HITSCAN } from './fps-ballistics';
import { advanceRound, createRound, MAX_SKIPS, needsFlight, SKIP_SPEED, skipRound } from './fps-projectiles';

const origin = { x: 0, y: 1.75, z: 0 }, forward = { x: 0, y: 0, z: -1 };
const arcade = { velocity: 350, drop: 25 };

describe('rounds in flight', () => {
  it('never puts an instant weapon in flight', () => {
    expect(needsFlight(HITSCAN)).toBe(false);
    expect(needsFlight({ velocity: 0, drop: 0 })).toBe(false);
    expect(needsFlight(arcade)).toBe(true);
  });
  it('hands back a contiguous chain of segments', () => {
    const round = createRound(1, 0, origin, forward, arcade);
    const first = advanceRound(round, .05, 200), second = advanceRound(round, .05, 200);
    expect(first.from).toEqual(origin); expect(second.from).toEqual(first.to);
    expect(round.time).toBeCloseTo(.1, 10);
    expect(round.travelled).toBeCloseTo(first.distance + second.distance, 10);
  });
  it('covers muzzle velocity over a second and falls while it travels', () => {
    const round = createRound(2, 0, origin, forward, arcade);
    const step = advanceRound(round, 1, 1000);
    expect(step.to.z).toBeCloseTo(-350, 6);
    expect(step.to.y).toBeCloseTo(origin.y - .5 * 25, 6);
    expect(step.expired).toBe(false);
  });
  it('marks the final segment expired without discarding it', () => {
    const round = createRound(3, 0, origin, forward, arcade);
    expect(advanceRound(round, .1, 40).expired).toBe(false);
    const last = advanceRound(round, .1, 40);
    expect(last.expired).toBe(true); expect(last.distance).toBeGreaterThan(0);
  });
  it('treats a non-positive step as no movement rather than reversing', () => {
    const round = createRound(4, 0, origin, forward, arcade);
    const step = advanceRound(round, -1, 200);
    expect(step.to).toEqual(origin); expect(round.travelled).toBe(0); expect(round.time).toBe(0);
  });
});

describe('rounds skipping off water', () => {
  it('restarts the arc from the skip point, slower and weaker, and pierces nothing more', () => {
    const round = createRound(5, 0, origin, forward, arcade, 2);
    advanceRound(round, .05, 200);
    const exit = { x: 0, y: -0.39, z: -17 }, heading = { x: 0, y: 0.02, z: -1 };
    expect(skipRound(round, exit, heading, .5)).toBe(true);
    expect(round.position).toEqual(exit); expect(round.time).toBe(0);
    expect(round.ballistics.velocity).toBeCloseTo(arcade.velocity * SKIP_SPEED, 10);
    expect(round.scale).toBe(.5); expect(round.pierced).toBe(0); expect(round.skips).toBe(1);
    const next = advanceRound(round, .01, 200);
    expect(next.from).toEqual(exit); expect(next.to.z).toBeLessThan(exit.z);
    // The weapon's own spec is untouched: only this round slowed.
    expect(arcade.velocity).toBe(350);
  });
  it('lets the water take a round once it has used its skips', () => {
    const round = createRound(6, 0, origin, forward, arcade);
    for (let i = 0; i < MAX_SKIPS; i++) expect(skipRound(round, origin, forward, .5)).toBe(true);
    expect(skipRound(round, origin, forward, .5)).toBe(false);
    expect(round.skips).toBe(MAX_SKIPS);
  });
});
