import { describe, expect, it } from 'vitest';
import { applyArmorDamage } from './armory-state';
import { getArenaRole } from './arena-roles';
import { insertTraits } from './armor-inserts';
import { RANGE_ARMOR_TIERS, createRangeDamageMeter, damageRangeDummy, expireRangeDamage } from './range-damage';

describe('training dummy damage', () => {
  it('uses current enemy role equipment and the same caliber-aware armor rules', () => {
    for (const [index, roleId] of ['sniper', 'assault', 'tank', 'elite-commander'].entries()) {
      const tier = RANGE_ARMOR_TIERS[index + 1], role = getArenaRole(roleId)!;
      expect([tier.health, tier.armor, tier.absorption, tier.stops]).toEqual([role.health, role.armor, role.absorption, role.stops]);
      for (const caliberMm of [5.56, 7.62, 12.7, undefined]) {
        const meter = createRangeDamageMeter();
        const result = damageRangeDummy(meter, tier, tier.health, tier.armor, 60, 1, caliberMm);
        expect(result).toEqual(applyArmorDamage(role.health, role.armor, 60, role.absorption, { insert: insertTraits(role), caliberMm }));
        expect(meter.last + meter.lastArmor).toBeCloseTo(60);
      }
    }
  });
  it('tracks actual health and armor loss, including depletion and overkill', () => {
    const meter = createRangeDamageMeter(), tier = RANGE_ARMOR_TIERS[2];
    const first = damageRangeDummy(meter, tier, 100, 25, 60, 1, 5.56);
    expect(first.health).toBe(61); expect(first.armor).toBe(4);
    const second = damageRangeDummy(meter, tier, first.health, first.armor, 300, 2, 5.56);
    expect(second.health).toBe(0); expect(second.armor).toBe(0);
    expect(meter).toMatchObject({ last: 61, total: 100, lastArmor: 4, totalArmor: 25 });
  });
  it('lets grenade shred bypass the same armor share as live enemies', () => {
    const meter = createRangeDamageMeter(), tier = RANGE_ARMOR_TIERS[4];
    const result = damageRangeDummy(meter, tier, 150, 150, 100, 1, undefined, .4);
    expect(result.armor).toBeCloseTo(103.2);
    expect(result.health).toBeCloseTo(96.8);
    expect(meter.last).toBeCloseTo(53.2); expect(meter.lastArmor).toBeCloseTo(46.8);
  });
  it('keeps separate totals per dummy and expires at eight seconds since its own last hit', () => {
    const a = createRangeDamageMeter(), b = createRangeDamageMeter(), tier = RANGE_ARMOR_TIERS[0];
    damageRangeDummy(a, tier, 100, 0, 10, 1); damageRangeDummy(b, tier, 100, 0, 20, 4);
    damageRangeDummy(a, tier, 90, 0, 15, 8);
    expect(a.total).toBe(25); expect(b.total).toBe(20);
    expect(expireRangeDamage(a, 15.99)).toBe(false);
    expect(expireRangeDamage(b, 12)).toBe(true); expect(b.total).toBe(0);
    expect(expireRangeDamage(a, 16)).toBe(true); expect(a).toEqual(createRangeDamageMeter());
  });
  it('starts a fresh total even when the next hit arrives before an idle update', () => {
    const meter = createRangeDamageMeter(), tier = RANGE_ARMOR_TIERS[0];
    damageRangeDummy(meter, tier, 100, 0, 10, 1);
    damageRangeDummy(meter, tier, 90, 0, 20, 9);
    expect(meter.total).toBe(20);
  });
  it('accumulates across fast reappearances without refilling armor on an idle reset', () => {
    const meter = createRangeDamageMeter(), tier = RANGE_ARMOR_TIERS[3];
    damageRangeDummy(meter, tier, tier.health, tier.armor, 500, 1);
    damageRangeDummy(meter, tier, tier.health, tier.armor, 500, 5);
    expect(meter.total).toBe(tier.health * 2); expect(meter.totalArmor).toBe(tier.armor * 2);
    expect(expireRangeDamage(meter, 13)).toBe(true);
    const hit = damageRangeDummy(meter, tier, 50, 0, 10, 14, 5.56);
    expect(hit.health).toBe(40); expect(hit.armor).toBe(0); expect(meter.total).toBe(10);
  });
});
