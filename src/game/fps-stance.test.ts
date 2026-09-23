import { expect, it } from 'vitest';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { weaponBraced, unsupportedRecoilDamage } from './fps-stance';

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
