import { reserveRoom } from './magazine-inventory';
import { describe, expect, it } from 'vitest';
import { needsAmmoRefill, refillAmmo } from './ammo-refill';
import { createPooledLoadout } from './ammo-pools';
import { itemById } from './armory-catalog';
import { consumeItem, createProfile, purchase, resolveLoadout, restoreProfile } from './armory-state';
import { createArena } from './arena-rules';
import { advanceWeapon, beginReload, fireWeapon, FPS_WEAPONS, fullLoad, interruptReload, roundReady } from './fps-rules';
import { advanceSupplyUse, startSupplyUse, supplyProfile } from './fps-healing';
import { utilityOption, utilityOptions } from './utility-wheel';

const id = 'kit-ammo-refill', item = itemById(id)!;
describe('premium Ammo Refill', () => {
  it('buys repeatable token stock, survives saves, packs and consumes one', () => {
    const base = createProfile(), once = purchase(base, id).profile, twice = purchase(once, id).profile;
    expect(twice.tokens).toBe(base.tokens - 100); expect(twice.credits).toBe(base.credits);
    expect(resolveLoadout(restoreProfile(JSON.stringify(twice))).supplies[id]).toBe(2);
    expect(consumeItem(twice, id).consumables[id]).toBe(1);
    expect(purchase({ ...base, tokens: 49 }, id).profile).toEqual({ ...base, tokens: 49 });
  });
  it('is selectable with F and commits once using the ammo animation', () => {
    expect(utilityOptions('recovery', { [id]: 2, 'kit-ammo': 2 }).map(i => i.id)).toEqual([id]);
    expect(utilityOption(id, { [id]: 2 })).toMatchObject({ seconds: 1.8, effects: ['Full weapon + all empty rig pouches'] });
    const profile = supplyProfile(item), use = startSupplyUse(profile);
    expect(profile.style).toBe('ammo');
    expect(advanceSupplyUse(use, 1).commit).toBe(false);
    expect(advanceSupplyUse(use, .5).commit).toBe(true);
    expect(advanceSupplyUse(use, 1).commit).toBe(false);
  });
  it.each([0, 1, 2, 3, 4, 12, 13])('refills family %s without touching other weapons or occupied pouches', family => {
    const carried = family === 2 ? [0, 2] : [family, 2];
    const states = createPooledLoadout(FPS_WEAPONS, carried), state = states[family], inv = state.magazineInventory!;
    const other = states[carried.find(i => i !== family)!].magazine;
    const occupied = structuredClone(inv.slots); inv.slots[0] = null; state.magazine = 0; state.chambered = false;
    expect(refillAmmo(state, FPS_WEAPONS[family])).toBe(true);
    expect(state.magazine).toBe(fullLoad(FPS_WEAPONS[family])); expect(roundReady(state, FPS_WEAPONS[family])).toBe(true);
    expect(inv.slots.at(0)?.group).toBe(state.magazineGroup); occupied.forEach((mag, slot) => { if (slot && mag) expect(inv.slots[slot]).toEqual(mag); });
    expect(reserveRoom(state)).toBe(false);
    expect(states[carried.find(i => i !== family)!].magazine).toBe(other);
    expect(needsAmmoRefill(state, FPS_WEAPONS[family])).toBe(false); expect(refillAmmo(state, FPS_WEAPONS[family])).toBe(false);
  });
  it('restores a partly loaded gun with full pouches and keeps the size of the magazine already loaded', () => {
    const state = createPooledLoadout(FPS_WEAPONS, [0, 2])[0];
    state.loadedCapacity = 20; state.magazine = 8;
    expect(refillAmmo(state, FPS_WEAPONS[0])).toBe(true); expect(state.magazine).toBe(21);
    expect(state.reserve).toBe(120);
  });
  it('returns a grabbed magazine to its reserved pouch and clears interrupted reload state', () => {
    const states = createPooledLoadout(FPS_WEAPONS, [0, 2]), state = states[0]; state.magazine = 2;
    beginReload(state, 0); advanceWeapon(state, 0, FPS_WEAPONS[0].reload * .5); interruptReload(state, 0);
    expect(state.pendingMagazine).toBeDefined(); const slot = state.reloadSlot!, pending = { ...state.pendingMagazine! };
    state.magazineInventory!.slots[1] = null;
    expect(refillAmmo(state, FPS_WEAPONS[0])).toBe(true);
    expect(state.magazineInventory!.slots[slot]).toEqual(pending); expect(state.magazineInventory!.heldSlots).toEqual([]);
    expect(state.pendingMagazine).toBeUndefined(); expect(state.reloadSlot).toBeUndefined(); expect(state.reloadSaved).toBe(0);
    expect(state.reserve).toBe(120); expect(fireWeapon(state, 0)).toBe(true);
  });
  it('keeps pouches held by another weapon reserved', () => {
    const states = createPooledLoadout(FPS_WEAPONS, [0, 2]); states[2].magazine = 1;
    beginReload(states[2], 2); advanceWeapon(states[2], 2, FPS_WEAPONS[2].reload * .5); interruptReload(states[2], 2);
    const slot = states[2].reloadSlot!; states[0].magazine = 1; refillAmmo(states[0], FPS_WEAPONS[0]);
    expect(states[0].magazineInventory!.slots[slot]).toBeNull(); expect(states[2].pendingMagazine).toBeDefined();
  });
  it('refills the authoritative arena gun and enforces owned stock', () => {
    const arena = createArena([], 0), gun = { ...FPS_WEAPONS[0], capacity: 2 };
    arena.addPlayer('one', 'Alpha', 0, 0, [gun]); arena.setPlayerSupplies('one', { [id]: 1 });
    const actor = () => arena.snapshot().actors.find(a => a.id === 'one')!;
    arena.setInput('one', { ...actor(), playing: true, weapon: 0 });
    const shoot = () => arena.shoot('one', actor(), { x: 0, y: 0, z: -1 }, 0);
    for (let i = 0; i < 3; i++) { shoot(); expect(actor().shots).toBe(i + 1); arena.step(.2); }
    expect(arena.useSupply('one', id)).toBe(true);
    shoot(); expect(actor().shots).toBe(4); arena.step(.2);
    expect(arena.useSupply('one', id)).toBe(false);
  });
});
