import { describe, expect, it } from 'vitest';
import { createProfile, equip, purchase, resolveLoadout, restoreProfile, selectCarryWeapon } from './armory-state';
import { carriedFamilies, pickupSlot, EXTRA_SLOT_ID, restoreCarrySlots } from './armory-slots';
import { createLoadout } from './fps-rules';
import { equipmentMovement } from './fps-encumbrance';
import { createArena } from './arena-rules';

describe('main, sidearm and premium extra carry slots', () => {
  it('migrates existing saves to a rifle and pistol without losing owned variants or balances', () => {
    const { carry: _, ...old } = createProfile();
    const saved = restoreProfile(JSON.stringify({ ...old, owned: [...old.owned, 'cis50-merlion'], credits: 12, tokens: 28 }));
    expect(saved.carry).toEqual({ main: 0, extra: null }); expect(carriedFamilies(saved)).toEqual([0, 2]);
    expect(saved.owned).toContain('cis50-merlion'); expect(saved.credits).toBe(12); expect(saved.tokens).toBe(28);
  });
  it('requires a one-time token purchase, then permits an optional second main', () => {
    const base = createProfile();
    expect(selectCarryWeapon(base, 'extra', 4)).toBe(base);
    expect(purchase(base, EXTRA_SLOT_ID).profile).toBe(base); // 300 < 400
    const bought = purchase({ ...base, tokens: 500 }, EXTRA_SLOT_ID).profile;
    expect(bought.tokens).toBe(100); expect(bought.carry.extra).toBeNull();
    expect(purchase(bought, EXTRA_SLOT_ID).profile).toBe(bought);
    const assigned = selectCarryWeapon(bought, 'extra', 4);
    expect(carriedFamilies(assigned)).toEqual([0, 2, 4]);
    expect(restoreProfile(JSON.stringify(assigned))).toEqual(assigned);
    expect(carriedFamilies(selectCarryWeapon(assigned, 'extra', null))).toEqual([0, 2]);
    expect(assigned.tokens).toBe(100);
  });
  it('rejects duplicate weapons, pistols in main slots and forged extra slots', () => {
    const base = createProfile(), paid = { ...base, owned: [...base.owned, EXTRA_SLOT_ID] };
    expect(selectCarryWeapon(paid, 'extra', 0)).toBe(paid);
    for (const family of [2, -1, 5, .5, NaN]) expect(selectCarryWeapon(paid, 'main', family)).toBe(paid);
    expect(restoreCarrySlots({ main: 4, extra: 3 }, base.owned)).toEqual({ main: 4, extra: null });
    expect(restoreCarrySlots({ main: 2, extra: 2 }, paid.owned)).toEqual({ main: 0, extra: null });
    expect(restoreCarrySlots({ main: 3, extra: 3 }, paid.owned)).toEqual({ main: 3, extra: null });
  });
  it('equipping another platform replaces the main without adding a fourth gun', () => {
    const base = createProfile();
    const paid = selectCarryWeapon({ ...base, owned: [...base.owned, EXTRA_SLOT_ID, 'mag-jaga'] }, 'extra', 4);
    const swapped = equip(paid, 'mag-jaga', 3);
    expect(swapped.carry).toEqual({ main: 3, extra: 4 }); expect(carriedFamilies(swapped)).toEqual([3, 2, 4]);
    const updatedExtra = equip(swapped, 'cis50-issued', 4);
    expect(updatedExtra.carry).toEqual(swapped.carry);
    expect(equip(updatedExtra, 'p30-issued', 2).carry).toEqual(swapped.carry);
  });
  it('leaving a weapon unslotted removes both its weight and its ammunition', () => {
    const base = createProfile(), light = resolveLoadout(base), ammo = createLoadout(light.weapons);
    const before = equipmentMovement(light, 0, ammo);
    ammo[4].reserve = 999;
    expect(equipmentMovement(light, 0, ammo)).toEqual(before);
    const paid = selectCarryWeapon({ ...base, owned: [...base.owned, EXTRA_SLOT_ID] }, 'extra', 4);
    const burdened = equipmentMovement(resolveLoadout(paid), 0, ammo);
    expect(burdened.totalKg).toBeGreaterThan(before.totalKg); expect(burdened.movement).toBeLessThan(before.movement);
  });
  it('the host refuses uncarried weapon selection, reloads and shots', () => {
    const arena = createArena([], 0), kit = resolveLoadout(createProfile());
    arena.addPlayer('a', 'A', 0, 0, kit.weapons, undefined, false, kit.carriedFamilies);
    const actor = arena.snapshot().actors[0];
    arena.setInput('a', { ...actor, weapon: 4, playing: true });
    expect(arena.snapshot().actors[0].weapon).toBe(0);
    arena.reloadPlayer('a', 4); arena.shoot('a', actor, { x: 0, y: 0, z: -1 }, 4);
    expect(arena.snapshot().actors[0].shots).toBe(0);
    arena.setInput('a', { ...actor, weapon: 2, playing: true });
    arena.shoot('a', actor, { x: 0, y: 0, z: -1 }, 2);
    expect(arena.snapshot().actors[0].shots).toBe(1);
    arena.setPlayerLoadout('a', 0, 0, kit.weapons, [4, 2]);
    arena.setInput('a', { ...actor, weapon: 4, playing: true });
    expect(arena.snapshot().actors[0].weapon).toBe(4);
    arena.setPlayerLoadout('a', 0, 0, kit.weapons, [0, 2]);
    expect(arena.snapshot().actors[0].weapon).toBe(0);
  });
});

it('field loot replaces the matching or held slot instead of expanding the loadout', () => {
  const base = createProfile(), paid = { ...base, owned: [...base.owned, EXTRA_SLOT_ID], carry: { main: 3, extra: 4 } };
  expect(pickupSlot(base, 4, 2)).toBe('main');
  expect(pickupSlot(paid, 1, 4)).toBe('extra');
  expect(pickupSlot(paid, 1, 2)).toBe('main');
  expect(pickupSlot(paid, 3, 4)).toBe('main');
  expect(pickupSlot(paid, 2, 4)).toBe('sidearm');
});
