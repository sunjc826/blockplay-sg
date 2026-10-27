import { expect, it } from 'vitest';
import { advanceShotSmoke, MAX_SHOT_SMOKE, recordShotSmoke, SHOT_SMOKE_END, SHOT_SMOKE_START, shotSmokeOpacity, type ShotSmoke } from './fps-shot-smoke';

const point = (z: number) => ({ x: 0, y: 1, z });
const fixed = () => .5;

it('leaves a short wake behind the round, with clearance around the sights and no pieces past the hit', () => {
  const pool: ShotSmoke[] = [];
  recordShotSmoke(pool, point(0), point(12.3), 12.3, fixed);
  expect(pool.length).toBeGreaterThan(5);
  for (const wisp of pool) {
    expect(wisp.z - wisp.length / 2).toBeGreaterThanOrEqual(SHOT_SMOKE_START - 1e-6);
    expect(wisp.z + wisp.length / 2).toBeLessThanOrEqual(12.3);
  }
  const close: ShotSmoke[] = [];
  recordShotSmoke(close, point(0), point(1), 1, fixed);
  expect(close).toHaveLength(0);
});

it('samples by distance consistently across small frames and a single fast step', () => {
  const fast: ShotSmoke[] = [], slow: ShotSmoke[] = [];
  recordShotSmoke(fast, point(0), point(20), 20, fixed);
  for (let n = 1; n <= 200; n++) recordShotSmoke(slow, point((n - 1) / 10), point(n / 10), n / 10, fixed);
  expect(slow).toHaveLength(fast.length);
  slow.forEach((wisp, i) => {
    expect(wisp.z).toBeCloseTo(fast[i].z, 6);
    expect(wisp.length).toBeCloseTo(fast[i].length, 6);
  });
});

it('bounds the wake length and pool under sustained fire', () => {
  const pool: ShotSmoke[] = [];
  for (let n = 0; n < 100; n++) recordShotSmoke(pool, point(0), point(10000), 10000, fixed);
  expect(pool).toHaveLength(MAX_SHOT_SMOKE);
  expect(Math.max(...pool.map(wisp => wisp.z + wisp.length / 2))).toBeLessThanOrEqual(SHOT_SMOKE_END);
});

it('arrives softly, drifts upward and clears completely after a long frame', () => {
  const pool: ShotSmoke[] = [];
  recordShotSmoke(pool, point(0), point(10), 10, fixed);
  const wisp = pool[0];
  expect(shotSmokeOpacity(wisp)).toBe(0);
  advanceShotSmoke(pool, .04);
  const peak = shotSmokeOpacity(wisp);
  expect(peak).toBeGreaterThan(0); expect(peak).toBeLessThan(.16);
  expect(wisp.y).toBeGreaterThan(1);
  advanceShotSmoke(pool, .25);
  expect(shotSmokeOpacity(wisp)).toBeLessThan(peak);
  advanceShotSmoke(pool, 2);
  expect(pool).toHaveLength(0);
});

it('shows a newly resolved shot once on a slow renderer, then ages it in real time', () => {
  const pool: ShotSmoke[] = [];
  recordShotSmoke(pool, point(0), point(10), 10, fixed);
  advanceShotSmoke(pool, 1);
  expect(pool.length).toBeGreaterThan(0);
  expect(shotSmokeOpacity(pool[0])).toBeGreaterThan(0);
  advanceShotSmoke(pool, 1);
  expect(pool).toHaveLength(0);
});
