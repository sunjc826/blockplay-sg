import { expect, it } from 'vitest';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { effectStyleForWeapon, registerEffectStyle, resolveEffectStyle, unregisterEffectStyle } from './fps-effect-styles';
import { impactProfile, sanitizeImpactProfile } from './fps-impact-profile';
import { createImpactField, impactDust, recordImpact } from './fps-impacts';

it('widens holes with caliber independently of weapon power', () => {
  const rifle = impactProfile(5.56, 36), large = impactProfile(7.62, 36);
  expect(large.holeRadius / rifle.holeRadius).toBeCloseTo(7.62 / 5.56);
  expect(large.holeDepth).toBe(rifle.holeDepth);
  const stronger = impactProfile(5.56, 58);
  expect(stronger.holeRadius).toBe(rifle.holeRadius);
  expect(stronger.holeDepth).toBeGreaterThan(rifle.holeDepth * 2);
  expect(stronger.smokeSize).toBeGreaterThan(rifle.smokeSize * 1.5);
  expect(stronger.smokeOpacity).toBeGreaterThan(rifle.smokeOpacity);
  expect(stronger.smokeLifetime).toBeGreaterThan(rifle.smokeLifetime);
});
it('resolves each real variant from its power, including both variants in the same premium tier', () => {
  for (const family of [0, 1]) {
    const profiles = ARMORY_CATALOG.filter(item => item.category === 'weapon' && item.family === family)
      .sort((a, b) => (a.requiredLevel ?? 1) - (b.requiredLevel ?? 1)).map(item => {
        const base = createProfile(), owner = equip({ ...base, owned: [...base.owned, item.id] }, item.id, family);
        const weapon = resolveLoadout(owner).weapons[family];
        expect(weapon.caliberMm).toBe(5.56);
        const result = effectStyleForWeapon(weapon).impact;
        expect(result).toEqual(resolveEffectStyle({ variant: item.id }).impact);
        return result;
      });
    profiles.slice(1).forEach((profile, i) => {
      expect(profile.holeRadius).toBe(profiles[i].holeRadius);
      expect(profile.holeDepth).toBeGreaterThan(profiles[i].holeDepth);
      expect(profile.smokeSize).toBeGreaterThan(profiles[i].smokeSize);
    });
  }
});
it('supports bounded variant overrides without adding renderer branches', () => {
  try {
    registerEffectStyle('sar-ranger', { impact: { smokeLifetime: 1.2, holeDepth: .02 } });
    const style = resolveEffectStyle({ variant: 'sar-ranger' });
    expect(style.impact.smokeLifetime).toBe(1.2); expect(style.impact.holeDepth).toBe(.02);
    expect(style.impact.holeRadius).toBe(impactProfile().holeRadius);
    expect(itemById('sar-ranger')!.price).toBe(900);
  } finally { unregisterEffectStyle('sar-ranger'); }
});
it('handles malformed parameters without unbounded pools or shader values', () => {
  for (const n of [NaN, Infinity, -100, 1e9]) {
    const result = sanitizeImpactProfile({ holeRadius: n, holeDepth: n, smokeLifetime: n, smokeOpacity: n, smokeSize: n, sparkCount: n });
    expect(Object.values(result).every(Number.isFinite)).toBe(true);
    expect(result.sparkCount).toBeLessThanOrEqual(16);
    expect(result.smokeLifetime).toBeLessThanOrEqual(2);
    expect(result.smokeOpacity).toBeLessThan(1);
    expect(Object.values(impactProfile(n, n)).every(Number.isFinite)).toBe(true);
  }
});
it('attenuates smoke and depth on spent rounds and snapshots the shot profile', () => {
  const point = { x: 0, y: 1, z: 0 }, normal = { x: 0, y: 0, z: 1 };
  const full = createImpactField(), spent = createImpactField(), profile = impactProfile(5.56, 58);
  const a = recordImpact(full, point, normal, 'surface', 1, () => .5, 'strong', profile);
  const b = recordImpact(spent, point, normal, 'surface', .3, () => .5, 'strong', profile);
  a.age = a.life * .2; b.age = b.life * .2;
  expect(spent.scorches[0].depth).toBeLessThan(full.scorches[0].depth);
  expect(impactDust(b).brightness).toBeLessThan(impactDust(a).brightness);
  expect(impactDust(b).scale).toBeLessThan(impactDust(a).scale);
  const remembered = a.profile.holeDepth;
  profile.holeDepth = 10;
  expect(a.profile.holeDepth).toBe(remembered);
});
