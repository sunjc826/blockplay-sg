import { expect, it } from 'vitest';
import { cycleWeaponFamily, OICW_LAUNCHER, OICW_RIFLE } from './weapon-modes';

it('walks the carried guns in slot order and wraps both ways', () => {
  const carried = [0, 1, 2];
  expect(cycleWeaponFamily(carried, 0, 1)).toBe(1);
  expect(cycleWeaponFamily(carried, 2, 1)).toBe(0);
  expect(cycleWeaponFamily(carried, 0, -1)).toBe(2);
  expect(cycleWeaponFamily(carried, 1, -40)).toBe(0);
});
it('treats a launcher mode as its rifle and never selects one', () => {
  const carried = [OICW_RIFLE, 2, OICW_LAUNCHER];
  expect(cycleWeaponFamily(carried, OICW_LAUNCHER, 1)).toBe(2);
  expect(cycleWeaponFamily(carried, 2, 1)).toBe(OICW_RIFLE);
});
it('does nothing with one gun or no step, and recovers from a gun no longer carried', () => {
  expect(cycleWeaponFamily([2], 2, 1)).toBeUndefined();
  expect(cycleWeaponFamily([0, 2], 0, 0)).toBeUndefined();
  expect(cycleWeaponFamily([0, 2], 5, 1)).toBe(0);
});
