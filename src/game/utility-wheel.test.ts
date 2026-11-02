import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG } from './armory-catalog';
import { createProfile, equip, isSupplyCarried, purchase, resolveLoadout, restoreProfile, setSupplyCarried } from './armory-state';
import { rangeEquipmentStock } from './equipment-resupply';
import { initialUtilityChoice, utilityOption, utilityOptions } from './utility-wheel';

describe('field utility loadout', () => {
  it('leaves unequipped stock owned while excluding its weight, quick selection, and wheel entry', () => {
    const base = { ...createProfile(), consumables: { 'food-kaya-toast': 3, 'kit-bandage': 2, 'grenade-smoke': 1 }, quickItem: 'food-kaya-toast' };
    const before = resolveLoadout(base), stowed = setSupplyCarried(base, 'food-kaya-toast', false), after = resolveLoadout(stowed);
    expect(stowed.consumables).toEqual(base.consumables);
    expect(after.supplies).toEqual({ 'kit-bandage': 2, 'grenade-smoke': 1 });
    expect(after.suppliesWeightKg).toBeLessThan(before.suppliesWeightKg);
    expect(after.quickItem).toBeUndefined(); expect(after.quickCount).toBe(0);
    expect(utilityOptions('recovery', after.supplies).map(item => item.id)).toEqual(['kit-bandage']);
    expect(resolveLoadout(equip(stowed, 'food-kaya-toast', 0)).supplies).toEqual(base.consumables);
    expect(base.stowedSupplies).toEqual([]);
  });
  it('persists locker choices, migrates old saves as packed, and rejects malformed ids', () => {
    const base = { ...createProfile(), consumables: { 'kit-bandage': 2 } };
    const legacy = { ...base }; delete legacy.stowedSupplies;
    expect(isSupplyCarried(restoreProfile(JSON.stringify(legacy)), 'kit-bandage')).toBe(true);
    const restored = restoreProfile(JSON.stringify({ ...base, stowedSupplies: ['kit-bandage', 'kit-bandage', 'sar-issued', '__proto__', 7] }));
    expect(restored.stowedSupplies).toEqual(['kit-bandage']);
    expect(isSupplyCarried(restored, 'kit-bandage')).toBe(false);
    expect(setSupplyCarried(base, 'sar-issued', false)).toBe(base);
  });
  it('keeps repeat purchases in the locker until deliberately packed and respects stowing at range resupply', () => {
    const base = { ...createProfile(), consumables: { 'kit-bandage': 1 }, stowedSupplies: ['kit-bandage'] };
    const bought = purchase(base, 'kit-bandage').profile;
    expect(bought.consumables['kit-bandage']).toBe(2);
    expect(resolveLoadout(bought).supplies['kit-bandage']).toBeUndefined();
    expect(rangeEquipmentStock({}, bought.stowedSupplies).supplies['kit-bandage']).toBeUndefined();
  });
});

describe('two exact-item wheels', () => {
  const supplies = Object.fromEntries(ARMORY_CATALOG.filter(item => item.category === 'consumable').map(item => [item.id, 2]));
  it('includes every recovery item and throwable once, without ammo, empty entries, or Auto', () => {
    const recovery = utilityOptions('recovery', supplies), combat = utilityOptions('combat', supplies);
    expect(recovery.some(item => item.id === 'kit-plates')).toBe(true);
    expect(recovery.some(item => item.id === 'kit-first-aid')).toBe(true);
    expect(recovery.some(item => item.id === 'food-kaya-toast')).toBe(true);
    expect(combat.some(item => item.id === 'grenade-smoke')).toBe(true);
    expect(new Set([...recovery, ...combat].map(item => item.id)).size).toBe(recovery.length + combat.length);
    expect([...recovery, ...combat].some(item => item.id === 'kit-ammo')).toBe(false);
    expect(utilityOptions('recovery', {})).toEqual([]);
    expect(utilityOptions('combat', { 'grenade-frag': 0, 'grenade-smoke': 1 }).map(item => item.id)).toEqual(['grenade-smoke']);
  });
  it('retains a depleted selected item and its identity instead of substituting a different effect', () => {
    expect(utilityOption('grenade-smoke', { 'grenade-frag': 2 })).toMatchObject({ id: 'grenade-smoke', count: 0 });
    expect(utilityOption('kit-first-aid', { 'kit-bandage': 2 })).toMatchObject({ id: 'kit-first-aid', count: 0 });
    expect(initialUtilityChoice('recovery', supplies, 'kit-first-aid')).toBe('kit-first-aid');
    expect(initialUtilityChoice('combat', supplies, 'kit-first-aid')).toBe('grenade-frag');
  });
});
