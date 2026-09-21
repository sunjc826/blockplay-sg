import { expect, it } from 'vitest';
import { advanceMuzzle, createMuzzle, FLASH_LIFE, flashEnvelope, igniteMuzzle, muzzleShape, resetMuzzle } from './fps-muzzle';

it('rises in a couple of milliseconds and falls steeper than linear', () => {
  expect(flashEnvelope(0)).toBe(0);
  expect(flashEnvelope(FLASH_LIFE * .18)).toBeCloseTo(1, 6);
  const half = flashEnvelope(FLASH_LIFE * .59);
  expect(half).toBeLessThan(.5); // linear would still be at .5 here
  expect(flashEnvelope(FLASH_LIFE)).toBe(0);
  expect(flashEnvelope(FLASH_LIFE * 4)).toBe(0);
});

it('is dark at rest and lit only while a shot is burning', () => {
  const state = createMuzzle();
  expect(muzzleShape(state).live).toBe(false);
  igniteMuzzle(state, .018, () => .5);
  advanceMuzzle(state, FLASH_LIFE * .18);
  expect(muzzleShape(state).live).toBe(true);
  expect(muzzleShape(state).light).toBeGreaterThan(0);
  advanceMuzzle(state, FLASH_LIFE);
  expect(muzzleShape(state).live).toBe(false);
  expect(muzzleShape(state).light).toBe(0);
});

it('re-rolls the flare each shot and flares harder for a heavier weapon', () => {
  const state = createMuzzle();
  const rolls = new Set<number>();
  for (let i = 0; i < 8; i++) { igniteMuzzle(state, .018, Math.random); rolls.add(state.roll); }
  expect(rolls.size).toBe(8);
  const rifle = createMuzzle(), support = createMuzzle();
  igniteMuzzle(rifle, .018, () => .5); igniteMuzzle(support, .026, () => .5);
  expect(support.power).toBeGreaterThan(rifle.power);
  // The star closes to a point faster than the core does.
  advanceMuzzle(rifle, FLASH_LIFE * .7);
  const shape = muzzleShape(rifle);
  expect(shape.petal / rifle.petal).toBeLessThan(shape.core / rifle.core);
});

it('smokes a worked barrel, not a single aimed shot', () => {
  const single = createMuzzle();
  igniteMuzzle(single, .018, () => .5);
  let puffs = 0;
  for (let t = 0; t < 1; t += 1 / 60) if (advanceMuzzle(single, 1 / 60)) puffs++;
  expect(puffs).toBe(0);
  const worked = createMuzzle();
  for (let i = 0; i < 10; i++) { igniteMuzzle(worked, .026, () => .5); advanceMuzzle(worked, .085); }
  expect(worked.heat).toBeGreaterThan(.3);
  let hot = 0;
  for (let t = 0; t < 1; t += 1 / 60) if (advanceMuzzle(worked, 1 / 60)) hot++;
  expect(hot).toBeGreaterThan(0);
  // Heat bleeds off, so the barrel stops smoking on its own.
  for (let t = 0; t < 4; t += 1 / 60) advanceMuzzle(worked, 1 / 60);
  expect(worked.heat).toBe(0);
  expect(advanceMuzzle(worked, 1 / 60)).toBe(false);
});

it('clears on reset and survives absurd frames', () => {
  const state = createMuzzle();
  igniteMuzzle(state, .026, Math.random);
  advanceMuzzle(state, 0); advanceMuzzle(state, -1); advanceMuzzle(state, 30);
  Object.values(state).forEach(value => expect(Number.isFinite(value)).toBe(true));
  resetMuzzle(state);
  expect(state).toEqual(createMuzzle());
});
