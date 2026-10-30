import { describe, expect, it } from 'vitest';
import { createPooledLoadout } from './ammo-pools';
import { FPS_WEAPONS } from './fps-rules';
import { rangeEquipmentStock, resupplyEquipment } from './equipment-resupply';
import { createProfile } from './armory-state';

describe('equipment station stock', () => {
  it('tops up shared carried ammunition once and preserves magazines, chamber and reload progress', () => {
    const carried = [0, 1, 2], states = createPooledLoadout(FPS_WEAPONS, carried), original = states[0].reserve;
    states[0].reserve = 0; states[2].reserve = 0; states[0].magazine = 2; states[0].reloadSaved = .3; states[0].magazineOut = true;
    const supplies = {}, result = resupplyEquipment(states, FPS_WEAPONS, carried, supplies, rangeEquipmentStock({}));
    expect(states[0].reserve).toBe(original); expect(states[1].reserve).toBe(original);
    expect(states[0]).toMatchObject({ magazine: 2, magazineOut: true, reloadSaved: .3 });
    expect(result.rounds).toBe(original + FPS_WEAPONS[2].reserve);
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
  it('preserves surplus rounds and ignores uncarried guns and invalid stock entries', () => {
    const states = createPooledLoadout(FPS_WEAPONS, [0]); states[0].reserve = 999; states[4].reserve = 0;
    const supplies = {}; resupplyEquipment(states, FPS_WEAPONS, [0], supplies, { ammunition: true, supplies: { 'sar-issued': 4, 'grenade-frag': Infinity } });
    expect(states[0].reserve).toBe(999); expect(states[4].reserve).toBe(0); expect(supplies).toEqual({});
  });
});
