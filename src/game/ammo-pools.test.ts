import { describe, expect, it } from 'vitest';
import { addReserveRounds, createPooledLoadout, replacePooledWeapon, startingAmmoPools } from './ammo-pools';
import { advanceWeapon, beginReload, chamberRound, createLoadout, fireWeapon, FPS_WEAPONS, interruptReload } from './fps-rules';
import { addReserveMagazines, magazineCapacity, magazineGroup, reserveRoom, spareMagazines } from './magazine-inventory';
import { createProfile, resolveLoadout, variantSpec } from './armory-state';
import { itemById } from './armory-catalog';
import { equipmentMovement, roundWeightKg } from './fps-encumbrance';

const specs = FPS_WEAPONS;
const inventory = (states: ReturnType<typeof createPooledLoadout>) => states[0].magazineInventory!;
describe('physical magazine inventory', () => {
  it('packs four rifle and two pistol spares in six positions; stored guns add nothing', () => {
    const states = createPooledLoadout(specs, [0, 2]);
    expect(inventory(states).slots.map(m => m?.family)).toEqual([0, 0, 0, 0, 2, 2]);
    expect(states[0].reserve).toBe(120); expect(states[2].reserve).toBe(30); expect(states[1].reserve).toBe(0);
    expect(startingAmmoPools(specs, [0, 2])).toEqual({ '5.56:magazine': 120, '9.00:magazine': 30 });
    expect(addReserveMagazines(states[0], 1)).toBe(0);
  });
  it('shares rifle magazines across platforms and splits capacity with an extra weapon', () => {
    const states = createPooledLoadout(specs, [0, 2, 5]);
    expect(spareMagazines(states[0])).toBe(4); expect(spareMagazines(states[5])).toBe(4);
    expect(inventory(states).slots.filter(Boolean)).toHaveLength(6);
    states[5].magazine = 3;
    beginReload(states[5], 5); advanceWeapon(states[5], 5, 10);
    expect(spareMagazines(states[0])).toBe(3); expect(inventory(states).slots[0]).toBeNull();
    expect(inventory(states).slots[1]?.family).toBe(5);
  });
  it('implements the six groups including box-fed Kongsi and enemy support drums', () => {
    const group = (id: string) => magazineGroup(variantSpec(itemById(id)!)!);
    expect(group('sar-vanguard')).toBe(group('xm8-sharpshooter')); expect(group('g36c')).toBe(group('ult-kongsi'));
    expect(group('ult-centurion')).toBe(group('xm8-automatic')); expect(group('mg36')).toBe(group('ult-issued'));
    expect(new Set(['sar-issued', 'ult-issued', 'mg4-standard', 'p30-chiong', 'mag-tumpang', 'cis50-tuas'].map(group)).size).toBe(6);
  });
  it('discards remaining rounds at removal, takes upper-row spares at the grab, and keeps chambered rounds', () => {
    const states = createPooledLoadout(specs, [0, 2]), state = states[0]; state.magazine = 12;
    beginReload(state, 0); expect(state.reloadSlot).toBe(0);
    advanceWeapon(state, 0, specs[0].reload * .39);
    expect(state.magazine).toBe(1); expect(state.reserve).toBe(120); expect(state.pendingMagazine).toBeUndefined();
    advanceWeapon(state, 0, specs[0].reload * .1);
    expect(state.pendingMagazine?.capacity).toBe(30); expect(spareMagazines(state)).toBe(3);
    expect(inventory(states).slots[0]).toBeNull(); expect(inventory(states).slots[3]).not.toBeNull();
    advanceWeapon(state, 0, 10); expect(state.magazine).toBe(31); expect(chamberRound(state, specs[0])).toBe(1);
    expect(state.pendingMagazine).toBeUndefined(); expect(beginReload(state, 0)).toBe(false);
  });
  it('keeps donor magazine capacity, including smaller marksman and extended magazines', () => {
    const custom = specs.map(s => ({ ...s })); custom[0].capacity = 36;
    const states = createPooledLoadout(custom, [0, 2, 5]); states[5].magazine = 0; states[5].chambered = false;
    beginReload(states[5], 5, custom); advanceWeapon(states[5], 5, 10, custom);
    expect(states[5].magazine).toBe(36); expect(magazineCapacity(states[5], custom[5])).toBe(36);
    states[5].magazine = 37; expect(beginReload(states[5], 5, custom)).toBe(false);
    custom[5].capacity = 20;
    states[0].magazineInventory!.slots[1] = { ...states[5].reserveMagazine!, capacity: 20 };
    states[0].magazine = 2; beginReload(states[0], 0, custom); advanceWeapon(states[0], 0, 10, custom);
    expect(states[0].magazine).toBe(21); expect(magazineCapacity(states[0], custom[0])).toBe(20);
  });
  it('resumes a grabbed magazine once after a switch, with no duplicated stock or carry weight', () => {
    const equipment = resolveLoadout(createProfile()), states = createPooledLoadout(equipment.weapons, [0, 2]), state = states[0];
    state.magazine = 10; const before = equipmentMovement(equipment, 0, states).ammoKg;
    beginReload(state, 0); advanceWeapon(state, 0, specs[0].reload * .5); interruptReload(state, 0);
    expect(equipmentMovement(equipment, 0, states).ammoKg).toBeCloseTo(before - 9 * roundWeightKg(5.56));
    expect(reserveRoom(state)).toBe(false); expect(addReserveMagazines(state, 1)).toBe(0);
    beginReload(state, 0); advanceWeapon(state, 0, 10);
    expect(spareMagazines(state)).toBe(3); expect(state.magazine).toBe(31);
    expect(equipmentMovement(equipment, 0, states).ammoKg).toBeCloseTo(before - 9 * roundWeightKg(5.56));
    expect(addReserveMagazines(state, 2)).toBe(1); expect(spareMagazines(state)).toBe(4);
  });
  it('never ejects a usable last magazine and can chamber an already seated one without a spare', () => {
    const states = createPooledLoadout(specs, [0, 2]), state = states[0]; state.reserve = 0; state.magazine = 8;
    expect(beginReload(state, 0)).toBe(false); expect(state.magazineOut).not.toBe(true);
    state.chambered = false; beginReload(state, 0); advanceWeapon(state, 0, 10);
    expect(state.magazine).toBe(8); expect(fireWeapon(state, 0)).toBe(true);
  });
  it('preserves holes, pending magazine and capacities through repeated JSON travel', () => {
    let states = createPooledLoadout(specs, [0, 2]); states[0].magazine = 6;
    beginReload(states[0], 0); advanceWeapon(states[0], 0, specs[0].reload * .5); interruptReload(states[0], 0);
    for (let trip = 0; trip < 3; trip++) {
      const checkpoint = JSON.parse(JSON.stringify({ ammunition: states, magazineInventory: inventory(states) }));
      states = createPooledLoadout(specs, [0, 2], checkpoint);
      expect(inventory(states).slots[0]).toBeNull(); expect(spareMagazines(states[0])).toBe(3);
      expect(states[0].pendingMagazine?.capacity).toBe(30); expect(states[0].reloadSaved).toBeCloseTo(.5);
    }
    beginReload(states[0], 0); advanceWeapon(states[0], 0, 10); expect(states[0].magazine).toBe(31); expect(spareMagazines(states[0])).toBe(3);
  });
  it('bounds legacy migration and rejects malformed saved containers without replenishing them', () => {
    const old = createLoadout(); old[0].reserve = 60; old[2].reserve = 15;
    let states = createPooledLoadout(specs, [0, 2], { ammunition: old });
    expect(spareMagazines(states[0])).toBe(2); expect(spareMagazines(states[2])).toBe(1);
    states = createPooledLoadout(specs, [0, 1, 2], { ammunition: old, ammoPools: { '5.56': 120, '9.00': 30 } });
    expect(states[0].reserve).toBe(120); expect(states[1].reserve).toBe(0);
    const checkpoint = JSON.parse(JSON.stringify({ ammunition: states, magazineInventory: inventory(states) }));
    checkpoint.magazineInventory.slots[0].capacity = 999;
    states = createPooledLoadout(specs, [0, 1, 2], checkpoint); expect(inventory(states).slots[0]).toBeNull();
  });
  it('keeps compatible magazines and their capacities on a pickup; never grants hidden reserves', () => {
    const states = createPooledLoadout(specs, [0, 2]); inventory(states).slots[0]!.capacity = 36;
    const swapped = replacePooledWeapon(states, specs, [0, 2], specs, [5, 2], 5);
    expect(swapped[5].reserve).toBe(126); expect(swapped[5].magazineInventory!.slots[0]!.capacity).toBe(36);
    expect(swapped[0].reserve).toBe(0);
    const heavy = replacePooledWeapon(swapped, specs, [5, 2], specs, [3, 2], 3);
    expect(heavy[3].reserve).toBe(0); expect(addReserveRounds(heavy[3], 100)).toBe(100);
    expect(spareMagazines(heavy[3])).toBe(1);
  });
});
