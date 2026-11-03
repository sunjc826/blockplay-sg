import { describe, expect, it } from 'vitest';
import { createPooledLoadout, replacePooledWeapon } from './ammo-pools';
import { createProfile, resolveLoadout } from './armory-state';
import { recoverProxyWeapon, supplyProxyMagazines } from './proxy-equipment';
import { addReserveMagazines, availableMagazineSlots, nextMagazineSlot, spareMagazines } from './magazine-inventory';
import { advanceWeapon, beginReload, interruptReload } from './fps-rules';
import { equipmentMovement } from './fps-encumbrance';
import { resupplyEquipment } from './equipment-resupply';

const kit = (rig = 'rig-ilbv') => resolveLoadout(recoverProxyWeapon({ ...createProfile(), rig }, 'ff-intervention', 0));
describe('Intervention double magazine pouches', () => {
  it.each([['rig-ilbv', 8], ['rig-lbs', 12], ['rig-sentinel', 14]] as const)('doubles sniper spares on %s while keeping seven-round magazines and two pistol spares', (rig, count) => {
    const e = kit(rig), states = createPooledLoadout(e.weapons, e.carriedFamilies), sniper = states[12];
    expect(e.weapons[12].capacity).toBe(7); expect(spareMagazines(sniper)).toBe(count); expect(sniper.reserve).toBe(count * 7);
    expect(spareMagazines(states[2])).toBe(2); expect(availableMagazineSlots(sniper)).toHaveLength(0);
    const fullWeight = equipmentMovement(e, 12, states).ammoKg;
    sniper.magazineInventory!.slots.fill(null, 9);
    expect(fullWeight - equipmentMovement(e, 12, states).ammoKg).toBeCloseTo(count / 2 * 7 * .045);
  });
  it('draws front then rear, preserving the rear position and interrupted magazine across travel', () => {
    const e = kit(); let states = createPooledLoadout(e.weapons, e.carriedFamilies), s = states[12];
    s.magazine = 2; beginReload(s, 12, e.weapons); expect(s.reloadSlot).toBe(0);
    advanceWeapon(s, 12, 10, e.weapons); expect(nextMagazineSlot(s)).toBe(9); expect(s.magazine).toBe(8);
    s.magazine = 2; beginReload(s, 12, e.weapons); advanceWeapon(s, 12, e.weapons[12].reload * .5, e.weapons); interruptReload(s, 12);
    expect(s.reloadSlot).toBe(9); expect(s.pendingMagazine?.capacity).toBe(7); expect(spareMagazines(s)).toBe(6);
    expect(addReserveMagazines(s, 1)).toBe(0);
    for (let trip = 0; trip < 3; trip++) {
      states = createPooledLoadout(e.weapons, e.carriedFamilies, JSON.parse(JSON.stringify({ ammunition: states })));
      s = states[12]; expect(s.reloadSlot).toBe(9); expect(s.pendingMagazine?.capacity).toBe(7); expect(spareMagazines(s)).toBe(6);
    }
    beginReload(s, 12, e.weapons); advanceWeapon(s, 12, 10, e.weapons);
    expect(s.magazine).toBe(8); expect(nextMagazineSlot(s)).toBe(1);
    expect(addReserveMagazines(s, 2)).toBe(2); expect(spareMagazines(s)).toBe(8);
  });
  it('does not let another feed take a half-empty sniper pouch or occupy rear pockets', () => {
    const e = kit(), states = createPooledLoadout(e.weapons, [12, 4, 2]), inv = states[12].magazineInventory!;
    inv.slots[0] = null;
    expect(addReserveMagazines(states[4], 20)).toBe(0); expect(addReserveMagazines(states[2], 20)).toBe(0);
    inv.slots[9] = null;
    expect(addReserveMagazines(states[4], 20)).toBe(1); expect(inv.slots[0]).toMatchObject({ feed: 'belt' }); expect(inv.slots[9]).toBeNull();
  });
  it('supplies eight magazines on cargo pickup and removes both layers when swapping away', () => {
    const base = resolveLoadout(createProfile()), e = kit();
    let states = createPooledLoadout(base.weapons, base.carriedFamilies);
    states = replacePooledWeapon(states, base.weapons, base.carriedFamilies, e.weapons, e.carriedFamilies, 12);
    supplyProxyMagazines(states, 12); expect(spareMagazines(states[12])).toBe(8); expect(spareMagazines(states[2])).toBe(2);
    states = replacePooledWeapon(states, e.weapons, e.carriedFamilies, base.weapons, base.carriedFamilies, 0);
    expect(states[0].magazineInventory!.slots).toHaveLength(6); expect(states[0].reserve).toBe(0); expect(spareMagazines(states[2])).toBe(2);
  });
  it('restores old single-layer saves without awarding ammunition, and rejects rear belt boxes', () => {
    const e = kit(), states = createPooledLoadout(e.weapons, e.carriedFamilies);
    const checkpoint = JSON.parse(JSON.stringify({ ammunition: states, magazineInventory: states[12].magazineInventory }));
    checkpoint.magazineInventory.slots.length = 6;
    let restored = createPooledLoadout(e.weapons, e.carriedFamilies, checkpoint);
    expect(spareMagazines(restored[12])).toBe(4);
    const malformed = JSON.parse(JSON.stringify({ ammunition: restored, magazineInventory: restored[12].magazineInventory }));
    malformed.magazineInventory.slots[9] = { family: 4, caliberMm: 12.7, capacity: 50, feed: 'belt', group: '12.70:belt' };
    restored = createPooledLoadout(e.weapons, e.carriedFamilies, malformed); expect(restored[12].magazineInventory!.slots[9]).toBeNull();
  });
  it('resupplies both layers without replenishing a pouch while its magazine is held', () => {
    const e = kit(), states = createPooledLoadout(e.weapons, e.carriedFamilies), s = states[12];
    s.magazineInventory!.slots[9] = null; s.magazine = 2;
    beginReload(s, 12, e.weapons); advanceWeapon(s, 12, e.weapons[12].reload * .5, e.weapons);
    const stock = { ammunition: true, supplies: {} };
    expect(resupplyEquipment(states, e.weapons, e.carriedFamilies, {}, stock).rounds).toBe(0);
    advanceWeapon(s, 12, 10, e.weapons);
    expect(resupplyEquipment(states, e.weapons, e.carriedFamilies, {}, stock).rounds).toBe(14); expect(spareMagazines(s)).toBe(8);
  });
});
