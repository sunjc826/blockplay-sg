import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { loadoutComparison } from './loadout-comparison';
import { EXTRA_SLOT_ID } from './armory-slots';
import type { LoadoutTarget } from './loadout-store';
const target = (slot: LoadoutTarget['slot'], family = 0): LoadoutTarget => ({ slot, family, vehicle: 'car' });
const rows = (result: ReturnType<typeof loadoutComparison>) => Object.fromEntries(result.groups.flatMap(group => group.rows.map(row => [row.label, row])));

describe('loadout comparison', () => {
  it('includes the original weapon and movement figures without spending or equipping', () => {
    const profile = createProfile(), snapshot = JSON.stringify(profile);
    const result = rows(loadoutComparison(profile, itemById('sar-vanguard')!, target('main')));
    for (const label of ['Caliber', 'Damage', 'Fire rate', 'Magazine', 'Reload', 'Recoil', 'Recoil recovery', 'Damage at 60 m', 'Precision hit', 'Sight magnification', 'Weapon weight', 'Total carried weight', 'Carried-load mobility', 'Weapon-in-hand mobility', 'Combined movement']) expect(result[label], label).toBeDefined();
    expect(result.Damage.preview).toBeGreaterThan(result.Damage.current as number);
    expect(result.Reload.lower).toBe(true);
    expect(JSON.stringify(profile)).toBe(snapshot);
  });
  it('compares a different platform with the weapon in the destination, not its locker variant', () => {
    const profile = createProfile();
    const different = ARMORY_CATALOG.find(i => i.category === 'weapon' && i.family === 1)!;
    const result = loadoutComparison(profile, different, target('main', 1));
    expect(result.worn?.id).toBe('sar-issued');
    expect(rows(result).Damage.current).toBe(resolveLoadout(profile).weapons[0].damage);
    expect(rows(result)['Total carried weight'].preview).not.toBe(rows(result)['Total carried weight'].current);
  });
  it('leaves weapon baselines empty for an empty extra slot and includes the added carried weight', () => {
    const base = createProfile(), profile = { ...base, owned: [...base.owned, EXTRA_SLOT_ID] };
    const weapon = ARMORY_CATALOG.find(i => i.category === 'weapon' && i.family === 1)!;
    const result = rows(loadoutComparison(profile, weapon, target('extra', 1)));
    expect(result.Damage.current).toBeUndefined();
    expect(result['Total carried weight'].preview).toBeGreaterThan(result['Total carried weight'].current as number);
    expect(profile.carry.extra).toBeNull();
  });
  it('does not present unchanged loadout numbers as a valid duplicate-platform preview', () => {
    const base = createProfile(), profile = { ...base, owned: [...base.owned, EXTRA_SLOT_ID] };
    const result = loadoutComparison(profile, itemById('sar-ranger')!, target('extra'));
    expect(result.error).toContain('already in your other main slot');
    expect(rows(result)['Total carried weight']).toBeUndefined();
    expect(rows(result).Damage.preview).toBeGreaterThan(0);
  });
  it('preserves armor trade-offs when replacing a special insert with plain armor', () => {
    const special = ARMORY_CATALOG.find(i => i.category === 'plate' && i.scent)!;
    const base = createProfile(), profile = equip({ ...base, owned: [...base.owned, special.id] }, special.id, 0);
    const result = rows(loadoutComparison(profile, itemById('plate-soft')!, target('plate')));
    expect(result.Smell.current).toBe('On opponents’ maps');
    expect(result.Smell.preview).toBe('No map reveal');
    for (const label of ['Armor pool', 'Absorption', 'Rated for', 'Rig / insert mobility', 'Jump height', 'Aim-in speed', 'Magazine pouches']) expect(result[label], label).toBeDefined();
    expect(Object.keys(result).some(label => label.endsWith('rounds in pouches'))).toBe(true);
  });
  it('shows the loss of thermal and IFF capabilities as well as the replacement’s figures', () => {
    const base = createProfile(), thermal = ARMORY_CATALOG.find(i => i.category === 'vision' && i.id.startsWith('thermal'))!;
    const profile = equip({ ...base, owned: [...base.owned, thermal.id] }, thermal.id, 0);
    const result = rows(loadoutComparison(profile, itemById('nvg-gen1')!, target('vision')));
    expect(result['Sensor lines'].current).toBeGreaterThan(0);
    expect(result['Sensor lines'].preview).toBe(0);
    for (const label of ['Light gain at night', 'Screen inside the image', 'Sharpness', 'Grain at full gain', 'Halo around lights', 'Palettes', 'Warm-up']) expect(result[label], label).toBeDefined();
  });
});
