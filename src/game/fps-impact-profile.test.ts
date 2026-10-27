import { expect, it } from 'vitest';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { effectStyleForWeapon, registerEffectStyle, resolveEffectStyle, unregisterEffectStyle } from './fps-effect-styles';
import { impactProfile, sanitizeImpactProfile } from './fps-impact-profile';
import { FPS_WEAPONS } from './fps-rules';
import { createImpactField, impactDust, recordImpact } from './fps-impacts';

it('widens holes with caliber independently of weapon power', () => {
  const rifle = impactProfile(5.56, 36), large = impactProfile(7.62, 36);
  expect(large.holeRadius / rifle.holeRadius).toBeCloseTo(Math.pow(7.62 / 5.56, 1.5));
  expect(large.holeDepth).toBe(rifle.holeDepth);
  const stronger = impactProfile(5.56, 58);
  expect(stronger.holeRadius).toBe(rifle.holeRadius);
  expect(stronger.holeDepth).toBeGreaterThan(rifle.holeDepth * 2);
  expect(stronger.smokeSize).toBeGreaterThan(rifle.smokeSize * 1.5);
  expect(stronger.smokeOpacity).toBeGreaterThan(rifle.smokeOpacity);
  expect(stronger.smokeLifetime).toBeGreaterThan(rifle.smokeLifetime);
});
it('resolves each real variant from its power, including both variants in the same premium tier', () => {
  const impactOf = (item: typeof ARMORY_CATALOG[number], family: number) => {
    const base = createProfile(), owner = equip({ ...base, owned: [...base.owned, item.id] }, item.id, family);
    const weapon = resolveLoadout(owner).weapons[family];
    expect(weapon.caliberMm).toBe(5.56);
    const result = effectStyleForWeapon(weapon).impact;
    expect(result).toEqual(resolveEffectStyle({ variant: item.id }).impact);
    return result;
  };
  for (const family of [0, 1]) {
    const weapons = ARMORY_CATALOG.filter(item => item.category === 'weapon' && item.family === family);
    const ladder = weapons.filter(item => !item.specialist).sort((a, b) => (a.requiredLevel ?? 1) - (b.requiredLevel ?? 1));
    const profiles = ladder.map(item => impactOf(item, family));
    const damage = ladder.map(item => resolveLoadout(equip({ ...createProfile(), owned: [...createProfile().owned, item.id] }, item.id, family)).weapons[family].damage);
    // The crater follows the round, so a rung that buys its gain in cycle or kit
    // at the same damage (the Night Owl over the Own Time, Own Target) digs the same.
    profiles.slice(1).forEach((profile, i) => {
      expect(profile.holeRadius).toBe(profiles[i].holeRadius);
      const grows = damage[i + 1] > damage[i] ? 'toBeGreaterThan' : 'toBeGreaterThanOrEqual';
      expect(profile.holeDepth)[grows](profiles[i].holeDepth);
      expect(profile.smokeSize)[grows](profiles[i].smokeSize);
    });
    // A specialist sits beside the ladder; it still hits harder than issue.
    for (const item of weapons.filter(item => item.specialist)) {
      const profile = impactOf(item, family);
      expect(profile.holeRadius).toBe(profiles[0].holeRadius);
      expect(profile.holeDepth).toBeGreaterThan(profiles[0].holeDepth);
    }
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
    const result = sanitizeImpactProfile({ holeRadius: n, holeDepth: n, smokeLifetime: n, smokeOpacity: n, smokeSize: n, sparkCount: n, debrisCount: n, debrisSize: n, spallMarks: n });
    expect(Object.values(result).every(Number.isFinite)).toBe(true);
    expect(result.sparkCount).toBeLessThanOrEqual(16);
    expect(result.debrisCount).toBeLessThanOrEqual(5); expect(result.spallMarks).toBeLessThanOrEqual(4);
    expect(result.smokeLifetime).toBeLessThanOrEqual(3.2);
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

it('keeps heavy-caliber craters readable and all heavy variants distinct after sanitizing', () => {
  const base = createProfile();
  const profiles = ['cis50-issued', 'cis50-tuas', 'cis50-merlion'].map(id => {
    const weapon = resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, 4)).weapons[4];
    const profile = effectStyleForWeapon(weapon).impact;
    const field = createImpactField();
    const impact = recordImpact(field, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 'surface', 1, () => .5, id, profile);
    // The main hole is recorded after any spall chips, so it draws over them.
    expect(field.scorches.at(-1)!.radius * 2).toBeGreaterThan(.5);
    expect(profile.holeRadius).toBeGreaterThan(impactProfile().holeRadius * 3);
    return impact.profile;
  });
  for (let i = 1; i < profiles.length; i++) {
    expect(profiles[i].holeDepth).toBeGreaterThan(profiles[i - 1].holeDepth);
    expect(profiles[i].smokeSize).toBeGreaterThan(profiles[i - 1].smokeSize);
    expect(profiles[i].smokeLifetime).toBeGreaterThan(profiles[i - 1].smokeLifetime);
  }
});
it('throws more and bigger fragments, and more marks, the heavier the calibre', () => {
  const [rifle, , pistol, gpmg, heavy] = FPS_WEAPONS.map(w => impactProfile(w.caliberMm, w.damage));
  // The issued rifle is the reference look; a pistol is close to it, not lighter or heavier by much.
  expect(rifle).toMatchObject({ debrisCount: 1, debrisSize: 1, spallMarks: 0 });
  expect(Math.abs(pistol.debrisCount - 1)).toBeLessThan(.15); expect(pistol.spallMarks).toBe(0);
  expect(gpmg.debrisCount).toBeGreaterThan(1.5); expect(gpmg.spallMarks).toBeGreaterThanOrEqual(1);
  expect(heavy.debrisCount).toBeGreaterThan(gpmg.debrisCount * 2);
  expect(heavy.debrisSize).toBeGreaterThan(gpmg.debrisSize); expect(heavy.spallMarks).toBeGreaterThan(gpmg.spallMarks);

  const struck = (profile: ReturnType<typeof impactProfile>, energy = 1) => {
    const field = createImpactField();
    recordImpact(field, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 'surface', energy, () => .5, undefined, profile, 'concrete');
    return field;
  };
  const light = struck(rifle), big = struck(heavy), spent = struck(heavy, .2);
  expect(big.debris.length).toBeGreaterThan(light.debris.length * 3);
  // The visibility boost (fps-impacts) lifts a rifle's fragments more than a .50's, narrowing the gap.
  expect(big.debris[0].sx).toBeGreaterThan(light.debris[0].sx * 1.5);
  expect(light.scorches).toHaveLength(1);
  expect(big.scorches).toHaveLength(1 + heavy.spallMarks);
  // Spall chips sit in the struck face around the hole, smaller than it, and the hole is drawn last.
  const hole = big.scorches.at(-1)!;
  big.scorches.slice(0, -1).forEach(chip => {
    expect(chip.z).toBeCloseTo(hole.z); expect(chip.radius).toBeLessThan(hole.radius * .5);
    expect(Math.hypot(chip.x - hole.x, chip.y - hole.y)).toBeGreaterThan(hole.radius * .8);
  });
  // A round already spent on cover throws less and spalls nothing.
  expect(spent.debris.length).toBeLessThan(big.debris.length);
  expect(spent.scorches.length).toBeLessThan(big.scorches.length);
});
