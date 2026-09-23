import { EXTRA_SLOT_ID } from './armory-slots';
import { describe, expect, it } from 'vitest';
import { createProfile, equip, resolveLoadout, selectCarryWeapon } from './armory-state';
import { createLoadout } from './fps-rules';
import { equipmentMovement, roundWeightKg } from './fps-encumbrance';

const variant = (id: string, family: number) => {
  const base = createProfile();
  return resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, family));
};
describe('total carried load plus weapon in hand', () => {
  it('counts all slotted guns once and preserves their weight when switching', () => {
    const base = createProfile();
    const kit = resolveLoadout(selectCarryWeapon({ ...base, owned: [...base.owned, EXTRA_SLOT_ID] }, 'extra', 4));
    const rifle = equipmentMovement(kit, 0), pistol = equipmentMovement(kit, 2), heavy = equipmentMovement(kit, 4);
    expect(rifle.weaponsKg).toBeCloseTo(3.8 + .8 + 30);
    expect(pistol.totalKg).toBe(rifle.totalKg); expect(heavy.totalKg).toBe(rifle.totalKg);
    expect(pistol.carried).toBe(rifle.carried);
    expect(pistol.movement).toBeGreaterThan(rifle.movement);
    expect(heavy.movement).toBeLessThan(rifle.movement);
    expect(pistol.movement).toBeLessThan(1); // stowed MGs still count
    expect(heavy.jumpVelocity).toBeLessThan(pistol.jumpVelocity);
    expect(heavy.aimSpeed).toBeLessThan(pistol.aimSpeed);
  });
  it('a heavier stowed variant slows even the pistol; unused owned gear and skins do not', () => {
    const base = createProfile(), light = resolveLoadout(base);
    const heavier = variant('cis50-merlion', 4);
    expect(equipmentMovement(heavier, 2).movement).toBeLessThan(equipmentMovement(light, 2).movement);
    const owned = { ...base, owned: [...base.owned, 'cis50-merlion', 'skin-gold', 'plate-elite'] };
    expect(equipmentMovement(resolveLoadout(equip(owned, 'skin-gold', 4)), 2)).toEqual(equipmentMovement(light, 2));
    expect(equipmentMovement(variant('ult-patrol', 1), 2).carried).toBeGreaterThan(equipmentMovement(variant('ult-issued', 1), 2).carried);
  });
  it('counts actual remaining ammunition, conserving weight during reloads', () => {
    const kit = variant('cis50-issued', 4), ammo = createLoadout(kit.weapons);
    const full = equipmentMovement(kit, 2, ammo);
    ammo[4].magazine -= 10;
    const fired = equipmentMovement(kit, 2, ammo);
    expect(full.totalKg - fired.totalKg).toBeCloseTo(10 * roundWeightKg(12.7));
    expect(fired.movement).toBeGreaterThan(full.movement);
    ammo[4].magazine += 10; ammo[4].reserve -= 10;
    expect(equipmentMovement(kit, 2, ammo)).toEqual(fired);
    ammo[4].reserve += 30;
    expect(equipmentMovement(kit, 2, ammo).movement).toBeLessThan(fired.movement);
  });
  it('counts all held supplies and subtracts spent quick items exactly once', () => {
    const base = createProfile();
    const id = 'kit-dressing';
    const profile = { ...base, consumables: { [id]: 3 }, quickItem: id };
    const kit = resolveLoadout(profile), full = equipmentMovement(kit, 0);
    expect(full.suppliesKg).toBe(1.5);
    const spent = equipmentMovement(kit, 0, undefined, 2);
    expect(spent.suppliesKg).toBe(1);
    const refreshed = resolveLoadout({ ...profile, consumables: { [id]: 2 } });
    expect(equipmentMovement(refreshed, 0, undefined, 2)).toEqual(spent);
    expect(equipmentMovement(kit, 0, undefined, 0).suppliesKg).toBe(0);
  });
  it('counts armor mass and rig ammunition as well as their handling cost', () => {
    const base = createProfile(), light = resolveLoadout(base);
    const owner = { ...base, owned: [...base.owned, 'plate-ceramic', 'rig-sentinel'] };
    const armored = resolveLoadout(equip(owner, 'plate-ceramic', 0));
    expect(equipmentMovement(armored, 0).totalKg - equipmentMovement(light, 0).totalKg).toBeCloseTo(6);
    expect(equipmentMovement(armored, 0).movement).toBeLessThan(equipmentMovement(light, 0).movement);
    const reserves = resolveLoadout(equip(owner, 'rig-sentinel', 0));
    expect(reserves.mobility).toBe(light.mobility);
    expect(equipmentMovement(reserves, 0).movement).toBeLessThan(equipmentMovement(light, 0).movement);
  });
  it('extreme or malformed loads never reverse motion, jumping or aiming', () => {
    const kit = resolveLoadout(createProfile());
    for (const value of [NaN, Infinity, -100, 1000000, 0]) {
      const dirty = { ...kit, armorWeightKg: value, suppliesWeightKg: value, mobility: value,
        weapons: kit.weapons.map(w => ({ ...w, weightKg: value, mobility: value })) };
      const result = equipmentMovement(dirty, 4);
      for (const n of [result.movement, result.jumpVelocity, result.aimSpeed, result.totalKg]) expect(Number.isFinite(n)).toBe(true);
      expect(result.movement).toBeGreaterThanOrEqual(.2); expect(result.movement).toBeLessThanOrEqual(1);
      expect(result.jumpVelocity).toBeGreaterThan(0); expect(result.aimSpeed).toBeGreaterThan(0);
    }
  });
});
