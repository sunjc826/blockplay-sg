import { describe, expect, it } from 'vitest';
import { advanceSupplyUse, startSupplyUse, supplyMotion, supplyProfile, supplyProgress, type SupplyStyle } from './fps-healing';
import { ARMORY_CATALOG } from './armory-catalog';

describe('supply use', () => {
  it('picks a way of using every consumable in the catalog, bigger meals taking longer', () => {
    const consumables = ARMORY_CATALOG.filter(item => item.category === 'consumable');
    expect(consumables.length).toBeGreaterThan(4);
    for (const item of consumables) {
      const profile = supplyProfile(item);
      expect(profile.seconds).toBeGreaterThan(1); expect(profile.commit).toBeGreaterThan(.5); expect(profile.commit).toBeLessThan(1);
    }
    expect(supplyProfile({ supplyType: 'food', effect: { health: 100 } }).seconds).toBeGreaterThan(supplyProfile({ supplyType: 'food', effect: { health: 20 } }).seconds);
    expect(supplyProfile({ supplyType: 'medical', effect: { health: 45 } }).style).toBe('bandage');
    expect(supplyProfile({ supplyType: 'medical', effect: { health: 100, armor: 60 } }).style).toBe('medkit');
    expect(supplyProfile({ supplyType: 'field-utility', effect: { armor: 45 } }).style).toBe('plates');
    expect(supplyProfile({ supplyType: 'field-utility', effect: { reserve: 90 } }).style).toBe('ammo');
  });
  it('commits once, at the commit point, and finishes at the end', () => {
    const use = startSupplyUse(supplyProfile({ supplyType: 'medical', effect: { health: 45 } }));
    const steps: { commit: boolean; done: boolean }[] = [];
    while (!steps.at(-1)?.done) steps.push(advanceSupplyUse(use, .05));
    expect(steps.filter(step => step.commit)).toHaveLength(1);
    const at = steps.findIndex(step => step.commit);
    expect((at + 1) * .05 / use.profile.seconds).toBeGreaterThanOrEqual(use.profile.commit);
    expect(supplyProgress(use)).toBe(1);
  });
  it('lowers the weapon for the use, raises it after, and keeps the hands out of view at both ends', () => {
    for (const style of ['eat', 'bandage', 'medkit', 'plates', 'ammo'] as SupplyStyle[]) {
      expect(supplyMotion(style, 0).weaponDown).toBe(0);
      expect(supplyMotion(style, .5).weaponDown).toBe(1);
      expect(supplyMotion(style, 1).weaponDown).toBe(0);
      for (const p of [0, 1]) { const m = supplyMotion(style, p); expect(Math.max(m.right.y, m.left.y)).toBeLessThan(-.45); }
      const mid = supplyMotion(style, .5);
      expect(Math.min(mid.right.y, mid.item.y)).toBeGreaterThan(-.6);
    }
    expect(supplyMotion('eat', .8).remaining).toBeLessThan(supplyMotion('eat', .25).remaining);
  });
});
