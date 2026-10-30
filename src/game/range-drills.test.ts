import { createVerticalMovement } from './vertical-movement';
import { describe, expect, it } from 'vitest';
import { createRangeDirector, rangeTargetRise, rangeTargetHeight, RANGE_DURATION } from './range-drills';
import { claimReward, createProfile, type ExerciseReward } from './armory-state';

describe('range director', () => {
  it('keeps the classic eight-target drill finite and rejects duplicate eliminations', () => {
    const d = createRangeDirector('classic', 8, 7);
    expect(d.view(0)).toMatchObject({ active: 8, spawned: 8, goal: 8, remaining: null });
    for (let i = 0; i < 8; i++) { expect(d.eliminate(i, d.slots[i].activation, 0)).toBe(true); expect(d.eliminate(i, d.slots[i].activation, 0)).toBe(false); }
    d.step(100); expect(d.slots.every(s => s.phase === 'inactive')).toBe(true);
  });
  it('keeps spawning after eight eliminations without growing the pool', () => {
    const d = createRangeDirector('continuous', 8, 7); let cleared = 0;
    for (let time = .1; time < 100; time += .1) {
      d.step(time);
      const i = d.slots.findIndex(s => s.phase === 'active');
      if (i >= 0) cleared += Number(d.eliminate(i, d.slots[i].activation, time));
      expect(d.slots.filter(s => s.phase === 'active' || s.phase === 'appearing').length).toBeLessThanOrEqual(3);
    }
    expect(cleared).toBeGreaterThan(30); expect(d.slots).toHaveLength(8); expect(d.view(100).goal).toBeNull();
  });
  it('has a visible appearance phase, pauses with the simulation clock and respects unavailable anchors', () => {
    const d = createRangeDirector('continuous', 8, 4), i = d.slots.findIndex(s => s.phase === 'appearing');
    expect(rangeTargetRise(d.slots[i], 0)).toBe(0);
    expect(rangeTargetRise(d.slots[i], .225)).toBeCloseTo(.5);
    const paused = JSON.stringify(d.slots); d.step(0); expect(JSON.stringify(d.slots)).toBe(paused);
    d.step(.5);
    for (let n = 0; n < 8; n++) if (d.slots[n].phase === 'active') d.eliminate(n, d.slots[n].activation, .5);
    d.step(6, [7]); expect(d.slots.filter(s => s.phase === 'appearing')).toHaveLength(1); expect(d.slots[7].phase).toBe('appearing');
  });
  it('assigns a fresh activation on reuse and ignores stale damage identifiers', () => {
    const d = createRangeDirector('continuous', 1, 7); d.step(.5); const old = d.slots[0].activation;
    expect(d.eliminate(0, old, .5)).toBe(true); d.step(6); d.step(7);
    expect(d.slots[0].activation).not.toBe(old); expect(d.eliminate(0, old, 7)).toBe(false);
    expect(d.eliminate(0, d.slots[0].activation, 7)).toBe(true);
  });
  it('is seeded, bounded by the challenge clock and inert after finishing', () => {
    const a = createRangeDirector('timed', 8, 12), b = createRangeDirector('timed', 8, 12);
    expect(a.slots).toEqual(b.slots); a.step(.5); const index = a.slots.findIndex(s => s.phase === 'active');
    expect(a.eliminate(index, a.slots[index].activation, RANGE_DURATION)).toBe(false);
    expect(a.view(RANGE_DURATION + 4).remaining).toBe(0); a.finish(); const before = JSON.stringify(a.slots); a.step(100); expect(JSON.stringify(a.slots)).toBe(before);
    a.reset(12); expect(a.slots).toEqual(b.slots);
    expect(() => createRangeDirector('classic', 0, 1)).toThrow();
  });
});
describe('drill completion rewards', () => {
  const base: ExerciseReward = { id: 'drill-1', drill: 'timed', hits: 12, shots: 40, landed: 20, elapsed: 90, combat: false };
  it('pays a finished timed challenge once even after more than eight targets', () => {
    const p = createProfile(), paid = claimReward(p, base);
    expect(paid.credits).toBeGreaterThan(p.credits); expect(paid.exercises).toBe(1); expect(claimReward(paid, base)).toBe(paid);
  });
  it('rejects early, continuous, idle and malformed results', () => {
    const p = createProfile();
    for (const result of [{ ...base, elapsed: 89 }, { ...base, drill: 'continuous' as const }, { ...base, hits: 0 }, { ...base, hits: NaN }, { ...base, shots: -1 }, { ...base, landed: 41 }]) expect(claimReward(p, result)).toBe(p);
  });
  it('uses the classic goal rather than a global count of eight, including grenade-only clears', () => {
    const p = createProfile(); expect(claimReward(p, { ...base, drill: 'classic', targetCount: 4, hits: 4, shots: 0, landed: 0, elapsed: 15 })).not.toBe(p);
    expect(claimReward(p, { ...base, drill: 'classic', targetCount: 4, hits: 3 })).toBe(p);
  });
});

it('opens movement through a fully retracted target without rebuilding the spatial index', () => {
  const d = createRangeDirector('continuous', 1, 3), collider = { minX: -.42, maxX: .42, minZ: -.42, maxZ: .42, maxY: 0 };
  const world = createVerticalMovement({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, obstacles: [collider], surfaces: [], traversalObstacles: [] });
  expect(world.canOccupy(0, 0, 0)).toBe(true);
  d.step(.5); collider.maxY = rangeTargetHeight(d.slots[0], .5); expect(world.canOccupy(0, 0, 0)).toBe(false);
  d.eliminate(0, d.slots[0].activation, .5); d.step(1, []); collider.maxY = rangeTargetHeight(d.slots[0], 1);
  expect(world.canOccupy(0, 0, 0)).toBe(true);
  d.step(8, []); expect(d.slots[0].phase).toBe('cooldown');
});
