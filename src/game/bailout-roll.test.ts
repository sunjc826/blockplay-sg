import { expect, it } from 'vitest';
import { bailoutRoll, BAILOUT_ROLL_SECONDS } from './bailout-roll';

it('tucks before rolling, completes one turn, and restores the normal view', () => {
  expect(bailoutRoll(0)).toMatchObject({ active: true, tuck: 0, angle: 0, eyeDrop: 0, bank: 0 });
  const tucked = bailoutRoll(.18 * BAILOUT_ROLL_SECONDS);
  expect(tucked.tuck).toBe(1);
  expect(Math.abs(tucked.angle)).toBeLessThan(.1);
  expect(bailoutRoll(.45 * BAILOUT_ROLL_SECONDS).angle).toBeCloseTo(-Math.PI);
  expect(bailoutRoll(.8 * BAILOUT_ROLL_SECONDS).angle).toBeCloseTo(-Math.PI * 2);
  for (const age of [undefined, -1, NaN, Infinity, BAILOUT_ROLL_SECONDS, 2]) {
    expect(bailoutRoll(age)).toMatchObject({ active: false, tuck: 0, angle: 0, eyeDrop: 0, pitch: 0, bank: 0, weaponDrop: 0 });
  }
});

it('bounds camera movement and suppresses its dip and rotation with reduced motion', () => {
  for (let age = 0; age < BAILOUT_ROLL_SECONDS; age += 1 / 120) {
    const roll = bailoutRoll(age), reduced = bailoutRoll(age, true);
    expect(roll.eyeDrop).toBeLessThanOrEqual(.85);
    expect(Math.abs(roll.bank)).toBeLessThanOrEqual(.32);
    expect(Math.abs(roll.pitch)).toBeLessThanOrEqual(.55);
    expect(reduced).toMatchObject({ eyeDrop: 0, pitch: 0, bank: 0, tuck: roll.tuck, angle: roll.angle });
  }
});
