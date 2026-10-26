import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { createProfile, resolveLoadout } from './armory-state';
import { supplyProfile } from './fps-healing';
import { heldSupplies, pickUtility, utilityBelt, utilityKind, UTILITY_SLOTS } from './utility-belt';

describe('utility belt', () => {
  it('gives every consumable a slot, and every slot something to sell', () => {
    for (const item of ARMORY_CATALOG.filter(entry => entry.category === 'consumable')) expect(utilityKind(item)).not.toBeNull();
    for (const slot of UTILITY_SLOTS) expect(ARMORY_CATALOG.some(item => utilityKind(item) === slot.kind)).toBe(true);
    expect(utilityKind(itemById('sar-issued'))).toBeNull();
    expect(new Set(UTILITY_SLOTS.map(slot => slot.key)).size).toBe(UTILITY_SLOTS.length);
    expect(UTILITY_SLOTS.some(slot => ['1', '2', '3', 'g'].includes(slot.key))).toBe(false);
  });
  it('files bandages and first aid kits apart, and uses each with its own hands', () => {
    expect(utilityKind(itemById('kit-bandage'))).toBe('bandage');
    expect(utilityKind(itemById('kit-dressing'))).toBe('bandage');
    expect(utilityKind(itemById('kit-first-aid'))).toBe('first-aid');
    expect(utilityKind(itemById('kit-trauma'))).toBe('first-aid');
    expect(utilityKind(itemById('food-curry-puff'))).toBe('food');
    expect(utilityKind(itemById('kit-plates'))).toBe('plates');
    expect(utilityKind(itemById('kit-ammo'))).toBe('ammo');
    // A first aid kit heals only, but is opened and worked through like the medic pack.
    expect(supplyProfile(itemById('kit-first-aid')!).style).toBe('medkit');
    expect(supplyProfile(itemById('kit-bandage')!).seconds).toBeLessThan(supplyProfile(itemById('kit-dressing')!).seconds);
  });
  it('hands out the smallest heal that covers the wound, else the biggest', () => {
    const held = { 'kit-bandage': 2, 'kit-dressing': 1 };
    expect(pickUtility('bandage', held, { health: 85, maxHealth: 100 })?.id).toBe('kit-bandage');
    expect(pickUtility('bandage', held, { health: 70, maxHealth: 100 })?.id).toBe('kit-dressing');
    expect(pickUtility('bandage', held, { health: 10, maxHealth: 100 })?.id).toBe('kit-dressing');
    expect(pickUtility('bandage', { 'kit-dressing': 1 }, { health: 99, maxHealth: 100 })?.id).toBe('kit-dressing');
    const meals = { 'food-kaya-toast': 1, 'food-chicken-rice': 1, 'food-field-ration': 1 };
    expect(pickUtility('food', meals, { health: 50, maxHealth: 100 })?.id).toBe('food-chicken-rice');
    expect(pickUtility('first-aid', {}, { health: 10, maxHealth: 100 })).toBeUndefined();
  });
  it('draws every slot in order, counting all of a kind', () => {
    const belt = utilityBelt({ 'kit-bandage': 2, 'kit-dressing': 3, 'food-curry-puff': 1 }, { health: 90, maxHealth: 100 });
    expect(belt.map(slot => slot.kind)).toEqual(UTILITY_SLOTS.map(slot => slot.kind));
    expect(belt.find(slot => slot.kind === 'bandage')).toMatchObject({ count: 5, next: { id: 'kit-bandage', effect: '+25 HP' } });
    expect(belt.find(slot => slot.kind === 'food')?.count).toBe(1);
    expect(belt.find(slot => slot.kind === 'first-aid')).toMatchObject({ count: 0, next: null });
  });
  it('carries the profile\'s supplies into the loadout, cleaned', () => {
    expect(heldSupplies({ 'kit-bandage': 2.7, 'sar-issued': 1, 'kit-ammo': 0, nonsense: 4, 'kit-plates': 40 })).toEqual({ 'kit-bandage': 2, 'kit-plates': 9 });
    const loadout = resolveLoadout({ ...createProfile(), consumables: { 'kit-first-aid': 2, 'food-kaya-toast': 1 } });
    expect(loadout.supplies).toEqual({ 'kit-first-aid': 2, 'food-kaya-toast': 1 });
  });
});
