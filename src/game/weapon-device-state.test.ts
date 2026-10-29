import { expect, it } from 'vitest';
import { createWeaponDevices, fittedWeaponDevices, toggleWeaponDevice, toggleWeaponRail } from './weapon-device-state';
import { accessorySpreadScale } from './weapon-accessories';

it('switches a combined unit light independently without losing the laser or its hip-fire benefit', () => {
  const state = createWeaponDevices(), accessories = { rail: 'laser-light' } as const;
  toggleWeaponDevice(state, accessories, 'light');
  expect(fittedWeaponDevices(state, accessories)).toEqual({ laser: true, light: false });
  expect(accessorySpreadScale(fittedWeaponDevices(state, accessories).laser ? accessories : undefined, 0)).toBe(.5);
  toggleWeaponDevice(state, accessories, 'laser');
  expect(fittedWeaponDevices(state, accessories)).toEqual({ laser: false, light: false });
  toggleWeaponDevice(state, accessories, 'light');
  expect(fittedWeaponDevices(state, accessories)).toEqual({ laser: false, light: true });
  expect(accessorySpreadScale(fittedWeaponDevices(state, accessories).laser ? accessories : undefined, 0)).toBe(1);
});

it('ignores keys for missing emitters without changing their future fitted state', () => {
  const state = createWeaponDevices();
  expect(toggleWeaponDevice(state, { rail: 'laser' }, 'light')).toBe(false);
  expect(toggleWeaponDevice(state, { rail: 'light' }, 'laser')).toBe(false);
  expect(toggleWeaponDevice(state, undefined, 'light')).toBe(false);
  expect(state).toEqual({ light: true, laser: true });
  expect(fittedWeaponDevices(state)).toEqual({ light: false, laser: false });
});

it('retains the touch control that switches fitted emitters together from a mixed state', () => {
  const state = createWeaponDevices(), accessories = { rail: 'laser-light' } as const;
  toggleWeaponDevice(state, accessories, 'light');
  toggleWeaponRail(state, accessories); expect(state).toEqual({ light: false, laser: false });
  toggleWeaponRail(state, accessories); expect(state).toEqual({ light: true, laser: true });
  expect(toggleWeaponRail(state)).toBe(false);
});
