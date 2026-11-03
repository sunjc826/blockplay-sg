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
    for (const style of ['eat', 'bandage', 'medkit', 'ammo'] as SupplyStyle[]) {
      expect(supplyMotion(style, 0).weaponDown).toBe(0);
      expect(supplyMotion(style, .5).weaponDown).toBe(1);
      expect(supplyMotion(style, 1).weaponDown).toBe(0);
      for (const p of [0, 1]) { const m = supplyMotion(style, p); expect(Math.max(m.right.y, m.left.y)).toBeLessThan(-.45); }
      const mid = supplyMotion(style, .5);
      expect(Math.min(mid.right.y, mid.item.y)).toBeGreaterThan(-.6);
    }
    expect(supplyMotion('eat', .8).remaining).toBeLessThan(supplyMotion('eat', .25).remaining);
  });
  describe('plates', () => {
    const commit = supplyProfile({ supplyType: 'field-utility', effect: { armor: 45 } }).commit;
    it('keeps the weapon in frame, canted low, with the left hand doing the job', () => {
      for (const p of [0, 1]) { const m = supplyMotion('plates', p); expect(m.weaponTuck).toBeCloseTo(0, 3); expect(m.left.y).toBeLessThan(-.45); expect(m.carrier).toEqual(expect.objectContaining({ y: expect.any(Number) })); expect(m.carrier!.y).toBeLessThan(-.45); }
      for (const p of [.1, .3, .5, .7]) { const m = supplyMotion('plates', p); expect(m.weaponDown).toBe(0); expect(m.weaponTuck).toBeGreaterThan(.5); expect(m.left.y).toBeGreaterThan(-.6); }
    });
    it('goes in on a shove that lands on the commit point, and the view takes the hit there', () => {
      const y = (p: number) => supplyMotion('plates', p).item.y;
      // The last stretch is the fast one.
      expect(y(commit - .03) - y(commit)).toBeGreaterThan((y(.56) - y(.59)) * 2);
      expect(y(commit)).toBeLessThan(-.48);
      const pitch = (p: number) => Math.abs(supplyMotion('plates', p).view.pitch);
      for (const p of [.2, .5, commit - .05, commit + .1, .95]) expect(pitch(commit)).toBeGreaterThan(pitch(p));
      expect(pitch(0)).toBe(0); expect(pitch(1)).toBeCloseTo(0, 3);
    });
    it('keeps the plate behind the carrier lip from the moment it is seated', () => {
      const m = supplyMotion('plates', commit);
      expect(m.item.y + .16).toBeLessThan(m.carrier!.y);
      expect(m.carrier!.z).toBeGreaterThan(m.item.z);
    });
  });
});
