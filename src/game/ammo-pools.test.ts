import { describe, expect, it } from 'vitest';
import { addReserveRounds, ammoCalibre, ammoPools, createPooledLoadout, MAX_RESERVE, replacePooledWeapon, startingAmmoPools } from './ammo-pools';
import { advanceWeapon, beginReload, createLoadout, fireWeapon, FPS_WEAPONS, fullLoad, interruptReload } from './fps-rules';
import { createProfile, resolveLoadout, selectCarryWeapon } from './armory-state';
import { EXTRA_SLOT_ID } from './armory-slots';
import { equipmentMovement, roundWeightKg } from './fps-encumbrance';
import { ammoBlocked } from './loot-focus';

const carried = [0, 1, 2];
const poolKey = ammoCalibre(5.56);
const kit = () => {
  const profile = createProfile();
  return resolveLoadout(selectCarryWeapon({ ...profile, owned: [...profile.owned, EXTRA_SLOT_ID] }, 'extra', 1));
};
const totalRifleRounds = (states: ReturnType<typeof createPooledLoadout>) => states[0].magazine + states[1].magazine + states[0].reserve;

describe('carried ammunition pools', () => {
  it('combines only carried starting reserves and keeps magazines separate', () => {
    const states = createPooledLoadout(FPS_WEAPONS, carried);
    expect(states[0].reserve).toBe(300); expect(states[1].reserve).toBe(300);
    expect(startingAmmoPools(FPS_WEAPONS, carried)[poolKey]).toBe(300);
    expect(states[2].reserve).toBe(60); expect(states[5].reserve).toBe(0);
    expect(fireWeapon(states[0], 0)).toBe(true);
    expect(states[0].magazine).toBe(30); expect(states[1].magazine).toBe(60);
    states[1].reserve += 90;
    expect(states[0].reserve).toBe(390); expect(states[2].reserve).toBe(60);
    expect(createPooledLoadout(FPS_WEAPONS, [0, 2])[0].reserve).toBe(120);
  });

  it('lets either gun reload from the same exhausted pool without creating rounds', () => {
    const states = createPooledLoadout(FPS_WEAPONS, carried);
    states[0].magazine = 0; states[0].chambered = false;
    states[1].magazine = 0; states[1].chambered = false;
    states[0].reserve = 40;
    beginReload(states[0], 0); advanceWeapon(states[0], 0, 10);
    expect(states[0].magazine).toBe(30); expect(states[1].reserve).toBe(10);
    beginReload(states[1], 1); advanceWeapon(states[1], 1, 10);
    expect(states[1].magazine).toBe(10); expect(states[0].reserve).toBe(0);
    expect(totalRifleRounds(states)).toBe(40);
    expect(beginReload(states[0], 0)).toBe(false);
  });

  it('returns an interrupted magazine to the shared pool and conserves carry weight', () => {
    const equipment = kit(), states = createPooledLoadout(equipment.weapons, carried);
    states[0].magazine = 12;
    const total = totalRifleRounds(states), mass = equipmentMovement(equipment, 0, states).ammoKg;
    beginReload(states[0], 0, equipment.weapons);
    advanceWeapon(states[0], 0, equipment.weapons[0].reload * .5, equipment.weapons);
    interruptReload(states[0], 0, equipment.weapons);
    expect(states[0].magazineOut).toBe(true); expect(states[1].reserve).toBe(311);
    states[1].magazine = 0; states[1].chambered = false;
    // Account for the sixty rounds explicitly removed for this empty-gun setup.
    beginReload(states[1], 1, equipment.weapons); advanceWeapon(states[1], 1, 10, equipment.weapons);
    beginReload(states[0], 0, equipment.weapons); advanceWeapon(states[0], 0, 10, equipment.weapons);
    expect(totalRifleRounds(states)).toBe(total - 60);
    expect(equipmentMovement(equipment, 0, states).ammoKg).toBeCloseTo(mass - 60 * roundWeightKg(5.56));
  });

  it('weighs a shared reserve once and weighs every loaded magazine', () => {
    const equipment = kit(), states = createPooledLoadout(equipment.weapons, carried);
    const expected = (31 + 60 + 300) * roundWeightKg(5.56) + (16 + 60) * roundWeightKg(9);
    expect(equipmentMovement(equipment, 0, states).ammoKg).toBeCloseTo(expected);
    expect(equipmentMovement(equipment, 1, states).ammoKg).toBeCloseTo(expected);
    states[1].reserve += 25;
    expect(equipmentMovement(equipment, 0, states).ammoKg).toBeCloseTo(expected + 25 * roundWeightKg(5.56));
  });

  it('applies pickup capacity to the shared reserve but never discards returned magazine rounds', () => {
    const states = createPooledLoadout(FPS_WEAPONS, carried);
    states[0].reserve = MAX_RESERVE - 5;
    states[1].reserve = Math.min(MAX_RESERVE, states[1].reserve + 90);
    const guns = carried.map(family => ({ family, spec: FPS_WEAPONS[family], reserve: states[family].reserve }));
    expect(ammoBlocked(5.56, guns, 0)).toBe('Reserve full');
    states[0].magazine = 12;
    const total = totalRifleRounds(states);
    beginReload(states[0], 0); advanceWeapon(states[0], 0, FPS_WEAPONS[0].reload * .5);
    expect(states[1].reserve).toBe(MAX_RESERVE + 11);
    expect(addReserveRounds(states[1], 90)).toBe(0);
    expect(states[1].reserve).toBe(MAX_RESERVE + 11);
    expect(totalRifleRounds(states)).toBe(total);
  });

  it('round-trips through JSON and repeated district travel without multiplying reserves', () => {
    let states = createPooledLoadout(FPS_WEAPONS, carried);
    states[0].reserve = 83; states[0].magazine = 1; states[0].magazineOut = true; states[0].reloadSaved = .5;
    for (let trip = 0; trip < 3; trip++) {
      const checkpoint = JSON.parse(JSON.stringify({ ammunition: states, ammoPools: ammoPools(states, FPS_WEAPONS, carried) }));
      expect(checkpoint.ammoPools[poolKey]).toBe(83);
      states = createPooledLoadout(FPS_WEAPONS, carried, checkpoint);
      expect(states[0].reserve).toBe(83); expect(states[1].reserve).toBe(83);
      expect(states[0].magazineOut).toBe(true); expect(states[0].reloadSaved).toBe(.5);
    }
    states[1].reserve -= 10; expect(states[0].reserve).toBe(73);
  });

  it('merges legacy per-weapon checkpoints and resets to issued pools on respawn', () => {
    const old = createLoadout(); old[0].reserve = 20; old[1].reserve = 35;
    const restored = createPooledLoadout(FPS_WEAPONS, carried, { ammunition: old });
    expect(restored[0].reserve).toBe(55); expect(restored[1].reserve).toBe(55);
    expect(createPooledLoadout(FPS_WEAPONS, carried)[0].reserve).toBe(300);
  });

  it('keeps matching reserves on a swap, including the pool from another carry slot', () => {
    const states = createPooledLoadout(FPS_WEAPONS, carried);
    states[0].reserve = 73; states[1].magazine = 7;
    const next = replacePooledWeapon(states, FPS_WEAPONS, carried, FPS_WEAPONS, [5, 1, 2], 5);
    expect(next[5].reserve).toBe(73); expect(next[1].reserve).toBe(73);
    expect(next[0].reserve).toBe(0); expect(next[5].magazine).toBe(fullLoad(FPS_WEAPONS[5]));
    expect(next[1].magazine).toBe(7);
    const swapped = replacePooledWeapon(next, FPS_WEAPONS, [5, 1, 2], FPS_WEAPONS, [3, 1, 2], 3);
    expect(swapped[3].reserve).toBe(0); expect(swapped[1].reserve).toBe(73);
  });

  it('uses the resolved calibre when a variant changes calibre within its family', () => {
    const states = createPooledLoadout(FPS_WEAPONS, carried), specs = FPS_WEAPONS.map(spec => ({ ...spec }));
    specs[0].caliberMm = 7.62;
    const next = replacePooledWeapon(states, FPS_WEAPONS, carried, specs, carried, 0);
    expect(next[0].reserve).toBe(0); expect(next[1].reserve).toBe(300);
    next[0].reserve = 40; expect(next[1].reserve).toBe(300);
  });
});
