import { expect, it } from 'vitest';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { weaponBraced, unsupportedRecoilDamage, stanceRecoilMultiplier } from './fps-stance';

it('requires ground support only for the base .50, including restored variant builds', () => {
  const base = createProfile();
  for (const id of ['cis50-issued', 'cis50-tuas', 'cis50-merlion']) {
    const weapon = resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, 4)).weapons[4];
    expect(unsupportedRecoilDamage(weapon, false, true)).toBe(id === 'cis50-issued' ? 20 : 0);
    expect(unsupportedRecoilDamage(weapon, false, true, true)).toBe(id === 'cis50-issued' ? 10 : 0);
    expect(unsupportedRecoilDamage(weapon, false, false, true)).toBe(id === 'cis50-issued' ? 20 : 0);
    expect(unsupportedRecoilDamage(weapon, true, true)).toBe(0);
    expect(unsupportedRecoilDamage(weapon, true, false)).toBe(id === 'cis50-issued' ? 20 : 0);
    expect(weaponBraced(weapon, true, true)).toBe(id === 'cis50-issued');
  }
  for (const weapon of resolveLoadout(base).weapons.slice(0, 4)) expect(unsupportedRecoilDamage(weapon, false, true)).toBe(0);
});

it('reduces grounded crouch recoil by 25% and prone recoil by 50%, with no airborne discount', () => {
  expect(stanceRecoilMultiplier('stand', true)).toBe(1);
  expect(stanceRecoilMultiplier('crouch', true)).toBe(.75);
  expect(stanceRecoilMultiplier('prone', true)).toBe(.5);
  for (const stance of ['stand', 'crouch', 'prone'] as const) expect(stanceRecoilMultiplier(stance, false)).toBe(1);
});

it('earns support during lowering and immediately removes excess support when rising', () => {
  expect(stanceRecoilMultiplier('crouch', true, 1.75)).toBe(1);
  expect(stanceRecoilMultiplier('crouch', true, 1.45)).toBeCloseTo(.875);
  expect(stanceRecoilMultiplier('prone', true, 1.15)).toBeCloseTo(.75);
  expect(stanceRecoilMultiplier('crouch', true, .55)).toBe(.75);
  expect(stanceRecoilMultiplier('stand', true, .55)).toBe(1);
  expect(stanceRecoilMultiplier('prone', true, 2)).toBe(1);
  expect(stanceRecoilMultiplier('prone', true, -.1)).toBe(.5);
  expect(stanceRecoilMultiplier('prone', true, NaN)).toBe(1);
});
