import { describe, expect, it } from 'vitest';
import { createPooledLoadout } from './ammo-pools';
import { advanceWeapon, beginReload, FPS_WEAPONS } from './fps-rules';
import { rangeEquipmentStock, resupplyEquipment } from './equipment-resupply';
import { createProfile } from './armory-state';
import { magazineOf, spareMagazines } from './magazine-inventory';
import { OICW_LAUNCHER, OICW_RIFLE, QTS_LAUNCHER, QTS_RIFLE } from './weapon-modes';

describe('equipment station stock', () => {
  it('refills empty rig positions once and preserves magazines, chamber and reload progress', () => {
    const carried = [0, 1, 2], states = createPooledLoadout(FPS_WEAPONS, carried), original = states[0].reserve;
    states[0].reserve = 0; states[1].reserve = 0; states[2].reserve = 0; states[0].magazine = 2; states[0].reloadSaved = .3; states[0].magazineOut = true;
    const supplies = {}, result = resupplyEquipment(states, FPS_WEAPONS, carried, supplies, rangeEquipmentStock({}));
    expect(states[0].reserve).toBe(original); expect(states[1].reserve).toBe(120);
    expect(states[0]).toMatchObject({ magazine: 2, magazineOut: true, reloadSaved: .3 });
    expect(result.rounds).toBe(original + 120 + 30);
    expect(resupplyEquipment(states, FPS_WEAPONS, carried, supplies, rangeEquipmentStock({}))).toEqual({ rounds: 0, items: 0 });
  });
  it('provides bounded grenades and utilities without accumulating or changing a profile', () => {
    const p = createProfile(); p.consumables = { 'grenade-frag': 1, 'kit-trauma': 2 };
    const before = JSON.stringify(p), supplies = { ...p.consumables }, states = createPooledLoadout(FPS_WEAPONS, [0, 2]);
    const stock = rangeEquipmentStock(p.consumables);
    resupplyEquipment(states, FPS_WEAPONS, [0, 2], supplies, stock);
    expect(supplies).toMatchObject({ 'grenade-frag': 2, 'grenade-smoke': 2, 'kit-bandage': 3, 'kit-trauma': 2 });
    delete supplies['grenade-frag']; resupplyEquipment(states, FPS_WEAPONS, [0, 2], supplies, stock); expect(supplies['grenade-frag']).toBe(2);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('preserves filled magazines and ignores uncarried guns and invalid stock entries', () => {
    const states = createPooledLoadout(FPS_WEAPONS, [0]); states[0].reserve = 999; states[4].reserve = 0;
    const supplies = {}; resupplyEquipment(states, FPS_WEAPONS, [0], supplies, { ammunition: true, supplies: { 'sar-issued': 4, 'grenade-frag': Infinity } });
    expect(states[0].reserve).toBe(180); expect(states[4].reserve).toBe(0); expect(supplies).toEqual({});
  });
  describe('launcher grenades', () => {
    const noSupplies = { ammunition: true, supplies: {} };
    const resupply = (states: ReturnType<typeof createPooledLoadout>, carried: number[]) => resupplyEquipment(states, FPS_WEAPONS, carried, {}, noSupplies);
    const pack = (states: ReturnType<typeof createPooledLoadout>, families: (number | null)[]) => {
      const { slots } = states[2].magazineInventory!;
      families.forEach((family, slot) => { slots[slot] = family === null ? null : magazineOf(FPS_WEAPONS[family], family); });
    };

    it.each([[OICW_RIFLE, OICW_LAUNCHER], [QTS_RIFLE, QTS_LAUNCHER]])('restores both spare magazines of rifle %i wherever they were carried', (rifle, launcher) => {
      const carried = [rifle, 2, launcher], states = createPooledLoadout(FPS_WEAPONS, carried);
      // As a rack weapon is issued: rifle spares in front, launcher spares behind them.
      pack(states, [rifle, rifle, launcher, launcher, 2, 2]);
      for (let i = 0; i < 2; i++) { states[launcher].magazine = 0; expect(beginReload(states[launcher], launcher)).toBe(true); advanceWeapon(states[launcher], launcher, 10); }
      expect(spareMagazines(states[launcher])).toBe(0);
      expect(resupply(states, carried).rounds).toBe(FPS_WEAPONS[launcher].capacity * 2);
      expect(spareMagazines(states[launcher])).toBe(2); expect(spareMagazines(states[rifle])).toBe(2);
    });
    it('puts grenades in an empty pouch the starting layout gives to another gun', () => {
      const carried = [7, OICW_RIFLE, 2, OICW_LAUNCHER], states = createPooledLoadout(FPS_WEAPONS, carried);
      pack(states, [7, OICW_RIFLE, 7, null, 2, 2]);
      expect(resupply(states, carried).rounds).toBe(FPS_WEAPONS[OICW_LAUNCHER].capacity);
      expect(states[2].magazineInventory!.slots[3]?.family).toBe(OICW_LAUNCHER);
      expect(spareMagazines(states[7])).toBe(2); expect(spareMagazines(states[OICW_RIFLE])).toBe(1);
    });
    it('never swaps out a carried magazine, even for a launcher with no spares', () => {
      const carried = [7, OICW_RIFLE, 2, OICW_LAUNCHER], states = createPooledLoadout(FPS_WEAPONS, carried), slots = states[2].magazineInventory!.slots;
      pack(states, [7, OICW_RIFLE, 7, OICW_RIFLE, 2, 2]);
      const before = structuredClone(slots);
      expect(resupply(states, carried).rounds).toBe(0);
      expect(slots).toEqual(before); expect(spareMagazines(states[OICW_LAUNCHER])).toBe(0);
    });
    it('counts a grabbed launcher magazine and leaves its pouch reserved', () => {
      const carried = [OICW_RIFLE, 2, OICW_LAUNCHER], states = createPooledLoadout(FPS_WEAPONS, carried), state = states[OICW_LAUNCHER], { slots } = state.magazineInventory!;
      state.magazine = 0; state.pendingMagazine = slots[1]!; state.reloadSlot = 1; slots[1] = null; state.magazineInventory!.heldSlots = [1];
      expect(resupply(states, carried).rounds).toBe(0);
      expect(slots[1]).toBeNull(); expect(spareMagazines(state)).toBe(1);
    });
  });
});
