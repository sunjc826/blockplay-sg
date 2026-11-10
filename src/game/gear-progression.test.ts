import { describe, expect, it } from 'vitest';
import { itemById } from './armory-catalog';
import { createProfile, equip, expireLoadoutRentals, purchase, resolveLoadout, tickLoadoutRentals } from './armory-state';
import { createPooledLoadout, replacePooledWeapon } from './ammo-pools';
import { addReserveMagazines, frontMagazineSlot, rearMagazineSlot, isRearMagazineSlot, magazinePouch, magazineSlotOrder, spareMagazines } from './magazine-inventory';
import { advanceWeapon, beginReload, interruptReload } from './fps-rules';
import { resupplyEquipment } from './equipment-resupply';
import { equipmentMovement } from './fps-encumbrance';
import { RENTAL_HOUR_MS, weaponTermPrice } from './weapon-rentals';
import { xpForLevel } from './progression';
import { plateOpponent, shotsToKillOpponent } from './armory-balance';
import { rollZoneArmor, ZONE_LOOT_RULES } from './expedition-loot';

const kit = (rig: string, sniper = false) => {
  const profile = createProfile(); profile.rig = rig; profile.owned.push(rig);
  if (sniper) profile.carry.main = 12;
  return resolveLoadout(profile);
};
const checkpoint = (ammunition: ReturnType<typeof createPooledLoadout>) => JSON.parse(JSON.stringify({ ammunition }));

describe('late-game carrying rigs', () => {
  it.each([['rig-pathfinder', 10, 26], ['rig-expedition', 11, 36], ['rig-atlas', 12, 48]] as const)('rents %s at its unlock and provides every advertised pouch', (id, count, hourly) => {
    const item = itemById(id)!;
    const buyer = { ...createProfile(), tokens: 1000, xp: xpForLevel(item.requiredLevel!) - 1 };
    expect(purchase(buyer, id).profile).toEqual(buyer);
    buyer.xp++;
    const rented = equip(purchase(buyer, id).profile, id, 0), equipment = resolveLoadout(rented);
    expect(weaponTermPrice(item, '1h')).toBe(hourly); expect(rented.tokens).toBe(1000 - hourly);
    const states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies);
    expect(states[0].magazineInventory!.pouchCount).toBe(count);
    expect(spareMagazines(states[0])).toBe(count - 2); expect(spareMagazines(states[2])).toBe(2);
    expect(addReserveMagazines(states[0], 10)).toBe(0);
    const full = equipmentMovement(equipment, 0, states).ammoKg;
    states[0].magazineInventory!.slots.fill(null);
    expect(full - equipmentMovement(equipment, 0, states).ammoKg).toBeCloseTo((count - 2) * 30 * .012 + 2 * 15 * .012);
    const expired = expireLoadoutRentals(tickLoadoutRentals(equipment, RENTAL_HOUR_MS));
    expect(expired.rigId).toBe('rig-ilbv'); expect(expired.weapons[0].rigSlots).toBe(6);
  });

  it.each(['rig-pathfinder', 'rig-expedition', 'rig-atlas'])('keeps front and rear sniper magazines separate on %s', rig => {
    const equipment = kit(rig, true), count = equipment.weapons[12].rigSlots!;
    let states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies), sniper = states[12];
    expect(spareMagazines(sniper)).toBe((count - 2) * 2);
    expect(spareMagazines(states[2])).toBe(2);
    const original = sniper.magazineInventory!.slots.map(mag => mag?.group ?? null);
    // Exercise every real magazine through the same reload state machine as play.
    const used: number[] = [];
    while (spareMagazines(sniper)) {
      sniper.magazine = 2; beginReload(sniper, 12, equipment.weapons);
      const source = sniper.reloadSlot!; used.push(source);
      advanceWeapon(sniper, 12, equipment.weapons[12].reload * .5, equipment.weapons); interruptReload(sniper, 12);
      expect(sniper.pendingMagazine?.capacity).toBe(7);
      states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies, checkpoint(states)); sniper = states[12];
      expect(sniper.reloadSlot).toBe(source); expect(sniper.pendingMagazine?.capacity).toBe(7);
      expect(sniper.magazineInventory!.slots[source]).toBeNull();
      beginReload(sniper, 12, equipment.weapons); advanceWeapon(sniper, 12, 10, equipment.weapons);
      expect(sniper.magazine).toBe(8);
    }
    expect(new Set(used).size).toBe((count - 2) * 2);
    expect(used.filter(isRearMagazineSlot)).toHaveLength(count - 2);
    expect(resupplyEquipment(states, equipment.weapons, equipment.carriedFamilies, {}, { ammunition: true, supplies: {} }).rounds).toBe((count - 2) * 14);
    expect(sniper.magazineInventory!.slots.map(mag => mag?.group ?? null)).toEqual(original);
  });

  it('preserves legacy rear addresses when upgrading and drops only unavailable pouches when shrinking', () => {
    const old = kit('rig-sentinel', true), bigger = kit('rig-atlas', true);
    let states = createPooledLoadout(old.weapons, old.carriedFamilies);
    states[12].magazineInventory!.slots[0] = null;
    states[12].magazine = 2; beginReload(states[12], 12, old.weapons);
    expect(states[12].reloadSlot).toBe(9);
    advanceWeapon(states[12], 12, old.weapons[12].reload * .5, old.weapons); interruptReload(states[12], 12);
    const saved = checkpoint(states);
    // Legacy snapshots without a pouchCount are still valid.
    delete saved.ammunition[12].magazineInventory.pouchCount;
    states = createPooledLoadout(bigger.weapons, bigger.carriedFamilies, saved);
    expect(states[12].reloadSlot).toBe(9); expect(states[12].pendingMagazine?.capacity).toBe(7);
    expect(states[12].magazineInventory!.slots[18]).toBeNull();
    expect(spareMagazines(states[12])).toBe(12);
    beginReload(states[12], 12, bigger.weapons); advanceWeapon(states[12], 12, 10, bigger.weapons);
    expect(addReserveMagazines(states[12], 50)).toBe(8);
    const upgraded = checkpoint(states), issued = kit('rig-ilbv', true);
    states = createPooledLoadout(issued.weapons, issued.carriedFamilies, upgraded);
    for (let pouch = 0; pouch < 6; pouch++) for (const slot of [frontMagazineSlot(pouch), rearMagazineSlot(pouch)]) {
      expect(states[12].magazineInventory!.slots[slot]).toEqual(upgraded.ammunition[12].magazineInventory.slots[slot]);
    }
    expect(states[12].magazineInventory!.pouchCount).toBe(6);
    expect(states[12].magazineInventory!.slots).toHaveLength(15);
  });

  it('gives mixed weapons one shared budget and removes rear magazines when switching away from the sniper', () => {
    const sniperKit = kit('rig-atlas', true), rifleKit = kit('rig-atlas');
    let states = createPooledLoadout(sniperKit.weapons, sniperKit.carriedFamilies);
    states = replacePooledWeapon(states, sniperKit.weapons, sniperKit.carriedFamilies, rifleKit.weapons, rifleKit.carriedFamilies, 0);
    expect(spareMagazines(states[2])).toBe(2); expect(spareMagazines(states[0])).toBe(0);
    expect(addReserveMagazines(states[0], 99)).toBe(10);
    for (const slot of magazineSlotOrder(states[0].magazineInventory!)) {
      if (isRearMagazineSlot(slot)) expect(states[0].magazineInventory!.slots[slot]).toBeNull();
      expect(magazinePouch(slot)).toBeLessThan(12);
    }
    const mixed = createPooledLoadout(rifleKit.weapons, [0, 1, 2]);
    expect(mixed[0].magazineInventory).toBe(mixed[1].magazineInventory);
    expect([0, 1, 2].map(i => spareMagazines(mixed[i]))).toEqual([5, 5, 2]);
  });
});

describe('advanced inserts', () => {
  it('improves survival on the lighter paths while preserving heavy specialists', () => {
    const shots = (id: string, damage: number, caliber: number) => shotsToKillOpponent(plateOpponent(id)!, damage, caliber);
    expect(shots('plate-strider', 50, 5.56)).toBeGreaterThan(shots('plate-elite', 50, 5.56));
    expect(shots('plate-guardian', 44, 7.62)).toBeGreaterThan(shots('plate-composite', 44, 7.62));
    expect(shots('plate-strider', 160, 12.7)).toBe(1);
    expect(shots('plate-pillbox', 160, 12.7)).toBe(2);
    expect(itemById('plate-durian')!.absorption).toBeGreaterThan(itemById('plate-guardian')!.absorption!);
    expect(itemById('plate-guardian')!.scent).toBeUndefined();
    for (const id of ['plate-strider', 'plate-guardian']) {
      const item = itemById(id)!, buyer = { ...createProfile(), xp: xpForLevel(item.requiredLevel!), tokens: 1000 };
      const equipment = resolveLoadout(equip(purchase(buyer, id).profile, id, 0));
      expect(equipment.armor).toBe(item.protection); expect(equipment.insert.stops).toBe(item.stops);
      expect(expireLoadoutRentals(tickLoadoutRentals(equipment, RENTAL_HOUR_MS)).armor).toBe(0);
    }
  });

  it('reserves advanced drops for riskier locations without changing the random draw budget', () => {
    const risky = ZONE_LOOT_RULES['raffles-place'], safe = ZONE_LOOT_RULES.queenstown;
    for (const [premium, id] of [[.01, 'plate-guardian'], [.1, 'plate-composite'], [.3, 'plate-strider'], [.8, 'plate-elite']] as const) {
      let draws = 0;
      expect(rollZoneArmor(risky, () => { draws++; return premium * risky.eliteChance; }).id).toBe(id);
      expect(draws).toBe(1);
    }
    expect(rollZoneArmor(safe, () => 0).id).toBe('plate-elite');
    expect(rollZoneArmor(safe, () => 0, 1).id).toBe('plate-guardian');
    let draws = 0;
    expect(rollZoneArmor(risky, () => { draws++; return .9; }).id).toBe('plate-ceramic');
    expect(draws).toBe(2);
  });
});
