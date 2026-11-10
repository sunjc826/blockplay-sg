import { describe, expect, it } from 'vitest';
import { createProfile, resolveLoadout, expireLoadoutRentals } from './armory-state';
import { createPooledLoadout, replacePooledWeapon } from './ammo-pools';
import { equipmentMovement } from './fps-encumbrance';
import { resupplyEquipment } from './equipment-resupply';
import { carrierUsed, restoreCarrier, startingCarrier, stepCarrierTransfer, transferMagazine } from './reserve-carrier';
import { magazineOf } from './magazine-inventory';
import { FPS_WEAPONS, advanceWeapon, beginReload, interruptReload } from './fps-rules';
const kit = (rig: string) => { const profile = createProfile(); profile.rig = rig; profile.owned.push(rig); return resolveLoadout(profile); };
const save = (ammunition: ReturnType<typeof createPooledLoadout>) => JSON.parse(JSON.stringify({ ammunition }));

describe('finite reserve carriers', () => {
  it.each([['rig-encik', 'pack', 24, 11], ['rig-atlas', 'maid', 48, 12]] as const)('%s separates ready pouches and reserve stock', (id, kind, capacity, pouches) => {
    const equipment = kit(id), states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies);
    const inventory = states[0].magazineInventory!;
    expect(inventory.pouchCount).toBe(pouches); expect(inventory.carrier!.kind).toBe(kind);
    expect(carrierUsed(inventory.carrier!)).toBe(capacity);
    expect(states[0].reserve).toBe((pouches - 2) * 30);
    expect(states[0].magazineInventory).toBe(states[2].magazineInventory);
    expect(transferMagazine(states[0])).toBe(false);
    inventory.slots[0] = null;
    expect(transferMagazine(states[0])).toBe(true);
    expect(carrierUsed(inventory.carrier!)).toBe(capacity - 1);
    const restored = createPooledLoadout(equipment.weapons, equipment.carriedFamilies, save(states));
    expect(restored[0].magazineInventory).toEqual(inventory);
    expect(restored[0].magazineInventory).not.toBe(inventory);
  });
  it('takes a full second and cancelling loses only partial progress, never ammunition', () => {
    const equipment = kit('rig-encik'), states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies);
    const inventory = states[0].magazineInventory!; inventory.slots[0] = inventory.slots[1] = null;
    let p = 0, completed = 0;
    for (let i = 0; i < 9; i++) { const result = stepCarrierTransfer(p, .1, true, true, states[0]); p = result.progress; completed += result.completed; }
    expect(completed).toBe(0); expect(inventory.carrier!.magazines).toHaveLength(24);
    p = stepCarrierTransfer(p, .1, false, true, states[0]).progress;
    expect(p).toBe(0);
    for (let i = 0; i < 16; i++) { const result = stepCarrierTransfer(p, .1, true, true, states[0]); p = result.progress; completed += result.completed; }
    expect(completed).toBe(1); expect(inventory.carrier!.magazines).toHaveLength(23);
    expect(stepCarrierTransfer(p, .1, true, false, states[0]).progress).toBe(0);
    expect(inventory.slots[0]).not.toBeNull(); expect(inventory.slots[1]).toBeNull();
  });
  it('does not overwrite magazines grabbed by interrupted reloads', () => {
    const equipment = kit('rig-encik'), states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies), rifle = states[0];
    rifle.magazine = 1; beginReload(rifle, 0, equipment.weapons);
    advanceWeapon(rifle, 0, equipment.weapons[0].reload * .5, equipment.weapons); interruptReload(rifle, 0);
    expect(rifle.pendingMagazine).toBeTruthy(); expect(transferMagazine(rifle)).toBe(false);
    beginReload(rifle, 0, equipment.weapons); advanceWeapon(rifle, 0, 10, equipment.weapons);
    expect(transferMagazine(rifle)).toBe(true);
  });
  it('weighs the pack once; maid stock adds weight only after transferring to the rig', () => {
    for (const id of ['rig-encik', 'rig-atlas']) {
      const equipment = kit(id), states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies);
      const inv = states[0].magazineInventory!, full = equipmentMovement(equipment, 0, states).totalKg;
      inv.slots[0] = null; const before = equipmentMovement(equipment, 0, states).totalKg;
      expect(full - before).toBeCloseTo(.36);
      expect(transferMagazine(states[0])).toBe(true);
      const after = equipmentMovement(equipment, 0, states).totalKg;
      expect(after - before).toBeCloseTo(id === 'rig-atlas' ? .36 : 0);
      inv.carrier!.magazines = [];
      expect(equipmentMovement(equipment, 0, states).totalKg).toBeLessThanOrEqual(after);
    }
    expect(equipmentMovement(kit('rig-encik'), 0).totalKg).toBeGreaterThan(equipmentMovement(kit('rig-atlas'), 0).totalKg + 8);
  });
  it('charges bulky drums and belts multiple slots and shares matching feeds', () => {
    const specs = FPS_WEAPONS.map(s => ({ ...s, reserveCarrier: 'maid' as const }));
    specs[0] = { ...specs[0], feed: 'belt', capacity: 100 };
    specs[1] = { ...specs[1], feed: 'drum', capacity: 100 };
    const stock = startingCarrier(specs, [0, 1, 2])!;
    expect(carrierUsed(stock)).toBe(48); expect(stock.magazines.length).toBeLessThan(30);
    expect(stock.magazines.some(m => m.feed === 'belt')).toBe(true); expect(stock.magazines.some(m => m.feed === 'drum')).toBe(true);
    const shared = startingCarrier(specs, [0, 0, 2])!;
    expect(shared.magazines.filter(m => m.caliberMm === 9).length).toBeGreaterThan(0);
  });
  it('rejects malformed and excess stock, and never grants stock to old checkpoints or other rigs', () => {
    const mag = magazineOf(FPS_WEAPONS[0], 0);
    expect(restoreCarrier('pack', { kind: 'pack', magazines: [{ ...mag, capacity: Infinity }, ...Array(60).fill(mag)] })!.magazines.length).toBe(23);
    expect(restoreCarrier('maid', { kind: 'pack', magazines: [mag] })!.magazines).toEqual([]);
    expect(restoreCarrier(undefined, { kind: 'pack', magazines: [mag] })).toBeUndefined();
    const issued = kit('rig-ilbv'), equipment = kit('rig-atlas');
    const states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies, save(createPooledLoadout(issued.weapons, issued.carriedFamilies)));
    expect(states[0].magazineInventory!.carrier!.magazines).toEqual([]);
  });
  it('leaves incompatible reserve containers behind on a weapon swap without issuing new ones', () => {
    const profile = createProfile(); profile.rig = 'rig-atlas'; profile.owned.push('rig-atlas'); profile.carry.main = 12;
    const sniper = resolveLoadout(profile), rifle = kit('rig-atlas');
    let states = createPooledLoadout(sniper.weapons, sniper.carriedFamilies);
    const sidearmStock = states[2].magazineInventory!.carrier!.magazines.filter(m => m.caliberMm === 9).length;
    states = replacePooledWeapon(states, sniper.weapons, sniper.carriedFamilies, rifle.weapons, rifle.carriedFamilies, 0);
    expect(states[0].magazineInventory!.carrier!.magazines).toHaveLength(sidearmStock);
    expect(states[0].magazineInventory!.carrier!.magazines.every(m => m.caliberMm === 9)).toBe(true);
  });
  it('weapon swaps preserve finite stock and supply stations top up without duplicating it', () => {
    const equipment = kit('rig-atlas'); let states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies);
    const inv = states[0].magazineInventory!; inv.carrier!.magazines.splice(0, 3);
    states = replacePooledWeapon(states, equipment.weapons, equipment.carriedFamilies, equipment.weapons, equipment.carriedFamilies, 0);
    expect(states[0].magazineInventory!.carrier!.magazines).toHaveLength(45);
    expect(resupplyEquipment(states, equipment.weapons, equipment.carriedFamilies, {}, { ammunition: true, supplies: {} }, false).rounds).toBe(0);
    expect(resupplyEquipment(states, equipment.weapons, equipment.carriedFamilies, {}, { ammunition: true, supplies: {} }).rounds).toBe(90);
    expect(resupplyEquipment(states, equipment.weapons, equipment.carriedFamilies, {}, { ammunition: true, supplies: {} }).rounds).toBe(0);
    const expired = expireLoadoutRentals({ ...equipment, equipmentRentals: { 'rig-atlas': 0 } });
    expect(expired.weapons[0].reserveCarrier).toBeUndefined();
    expect(createPooledLoadout(expired.weapons, expired.carriedFamilies, save(states))[0].magazineInventory!.carrier).toBeUndefined();
  });
});
