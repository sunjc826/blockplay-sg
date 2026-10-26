import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, isEnemyIssue, itemById } from './armory-catalog';
import { applyBuild, createProfile, equip, resolveLoadout, variantSpec } from './armory-state';
import { FPS_WEAPONS, magnifiedFov, HIP_FOV } from './fps-rules';
import { muzzleBallistics } from './fps-ballistics';

/**
 * What every purchasable weapon resolves to, pinned. These numbers were tuned
 * against the breakpoint ladder, so anything that changes them changes balance
 * and should be a deliberate edit here rather than a side effect elsewhere.
 */
const SAR_BAND = { kind: 'falloff', near: 30, far: 90, minScale: .55 };
const ULT_BAND = { kind: 'falloff', near: 14, far: 45, minScale: .4 };
/** A can slows the round: the platform's own velocity, scaled by the suppressor's modifier. */
const slowed = (metresPerSecond: number, scale: number) => ({ ...muzzleBallistics(metresPerSecond), velocity: Math.round(muzzleBallistics(metresPerSecond).velocity * scale) });
const EXPECTED = {
  'sar-issued': { damage: 36, capacity: 30, interval: .12, reload: 1.8, recoil: .018, recoilRecovery: 1, mobility: 1, aimFov: magnifiedFov(1.5), optic: 'integrated', ballistics: muzzleBallistics(970), traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }] },
  'sar-ranger': { damage: 39, capacity: 30, interval: .115, reload: 1.65, recoil: .016, recoilRecovery: 1.08, mobility: 1, aimFov: magnifiedFov(1.5), optic: 'integrated', ballistics: muzzleBallistics(970), traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }] },
  'sar-vanguard': { damage: 50, capacity: 36, interval: .105, reload: 1.53, recoil: .01008, recoilRecovery: 1.4336, mobility: 1, aimFov: magnifiedFov(1.5), optic: 'integrated', ballistics: muzzleBallistics(970), traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }] },
  'sar-marksman': { damage: 58, capacity: 36, interval: .1, reload: 1.5, recoil: .00816, recoilRecovery: 1.6284, mobility: 1, aimFov: 40, optic: 'precision', ballistics: muzzleBallistics(1130), traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }, { kind: 'falloff', near: 45, far: 130, minScale: .75 }, { kind: 'precision', multiplier: 2.2 }] },
  // Beside the ladder rather than on it: semi-automatic, slower, and far longer reaching.
  'sar-sharpshooter': { damage: 66, capacity: 30, interval: .22, reload: 1.8, recoil: .014, recoilRecovery: 1.2, mobility: .97, aimFov: magnifiedFov(3), optic: 'integrated', ballistics: muzzleBallistics(1150), traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }, { kind: 'falloff', near: 60, far: 150, minScale: .8 }, { kind: 'precision', multiplier: 2.4 }] },
  'ult-issued': { damage: 30, capacity: 60, interval: .085, reload: 2.5, recoil: .026, recoilRecovery: .85, mobility: 1, aimFov: HIP_FOV, optic: 'reflex', ballistics: muzzleBallistics(970), traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }] },
  'ult-patrol': { damage: 34, capacity: 50, interval: .08, reload: 2.1, recoil: .022, recoilRecovery: .91, mobility: 1.02, aimFov: HIP_FOV, optic: 'reflex', ballistics: muzzleBallistics(970), traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }] },
  'ult-centurion': { damage: 40, capacity: 75, interval: .075, reload: 2.1, recoil: .0148, recoilRecovery: 1.344, mobility: 1, aimFov: HIP_FOV, optic: 'reflex', ballistics: muzzleBallistics(970), traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }] },
  'ult-bastion': { damage: 50, capacity: 80, interval: .072, reload: 2, recoil: .01188, recoilRecovery: 1.5762, mobility: 1, aimFov: HIP_FOV, optic: 'reflex', ballistics: muzzleBallistics(1050), traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }, { kind: 'falloff', near: 24, far: 70, minScale: .6 }, { kind: 'precision', multiplier: 1.9 }] },
  'p30-issued': { damage: 28, capacity: 15, interval: 0.22, reload: 1.25, recoil: 0.022, recoilRecovery: 1.35, mobility: 1.14, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(360), traits: [{ kind: 'falloff', near: 12, far: 42, minScale: 0.35 }, { kind: 'precision', multiplier: 1.8 }] },
  'p30-kopi': { damage: 32, capacity: 15, interval: 0.22, reload: 1.05, recoil: 0.022, recoilRecovery: 1.55, mobility: 1.14, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(360), traits: [{ kind: 'falloff', near: 12, far: 42, minScale: 0.35 }, { kind: 'precision', multiplier: 1.8 }] },
  'p30-marksman': { damage: 42, capacity: 15, interval: 0.2, reload: 1.25, recoil: 0.016, recoilRecovery: 1.35, mobility: 1.083, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(360), traits: [{ kind: 'falloff', near: 12, far: 42, minScale: 0.35 }, { kind: 'precision', multiplier: 1.8 }, { kind: 'precision', multiplier: 2.1 }] },
  // Specialist pistols, each built around what is fitted to it rather than a rung of the ladder.
  'p30-silent': { damage: 36, capacity: 15, interval: .2, reload: 1.3, recoil: .0187, recoilRecovery: 1.35, mobility: 1.1058, aimFov: HIP_FOV, optic: 'reflex', ballistics: slowed(360, .9), traits: [{ kind: 'falloff', near: 12, far: 42, minScale: 0.35 }, { kind: 'precision', multiplier: 1.8 }] },
  'p30-sotong': { damage: 28, capacity: 21, interval: .2, reload: 1.35, recoil: .022, recoilRecovery: 1.35, mobility: 1.1286, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(360), traits: [{ kind: 'falloff', near: 12, far: 42, minScale: 0.35 }, { kind: 'precision', multiplier: 1.8 }] },
  'p30-chiong': { damage: 36, capacity: 33, interval: .07, reload: 1.7, recoil: .01638, recoilRecovery: 1.782, mobility: 1.083, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(360), traits: [{ kind: 'falloff', near: 12, far: 42, minScale: 0.35 }, { kind: 'precision', multiplier: 1.8 }] },
  'p30-atas': { damage: 60, capacity: 20, interval: .13, reload: 1.1, recoil: .01716, recoilRecovery: 1.512, mobility: 1.14, aimFov: HIP_FOV, optic: 'reflex', ballistics: muzzleBallistics(480), traits: [{ kind: 'falloff', near: 12, far: 42, minScale: 0.35 }, { kind: 'precision', multiplier: 1.8 }, { kind: 'falloff', near: 30, far: 90, minScale: .6 }, { kind: 'precision', multiplier: 2.4 }] },
  'p30-kiasu': { damage: 58, capacity: 15, interval: .34, reload: 1.25, recoil: .022, recoilRecovery: 1.35, mobility: 1.083, aimFov: magnifiedFov(2.5), optic: 'precision', ballistics: muzzleBallistics(470), traits: [{ kind: 'falloff', near: 12, far: 42, minScale: 0.35 }, { kind: 'precision', multiplier: 1.8 }, { kind: 'falloff', near: 30, far: 90, minScale: .6 }, { kind: 'precision', multiplier: 2.4 }] },
  'sar-nightowl': { damage: 66, capacity: 36, interval: .094, reload: 1.8, recoil: .00792, recoilRecovery: 1.7, mobility: .97, aimFov: HIP_FOV, optic: 'reflex', ballistics: slowed(1150, .92), traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }, { kind: 'falloff', near: 60, far: 150, minScale: .8 }, { kind: 'precision', multiplier: 2.4 }] },
  'sar-twoeyes': { damage: 72, capacity: 36, interval: .088, reload: 1.8, recoil: .0076, recoilRecovery: 1.76, mobility: 1, aimFov: magnifiedFov(4), optic: 'precision', ballistics: muzzleBallistics(1180), traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }, { kind: 'falloff', near: 70, far: 160, minScale: .85 }, { kind: 'precision', multiplier: 2.5 }] },
  'ult-lights': { damage: 54, capacity: 75, interval: .068, reload: 2.5, recoil: .0112, recoilRecovery: 1.62, mobility: 1, aimFov: HIP_FOV, optic: 'reflex', ballistics: muzzleBallistics(1050), traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }, { kind: 'falloff', near: 30, far: 80, minScale: .62 }, { kind: 'precision', multiplier: 2 }] },
  'mag-issued': { damage: 60, capacity: 100, interval: 0.12, reload: 4.6, recoil: 0.042, recoilRecovery: 0.75, mobility: 0.74, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(840), traits: [{ kind: 'falloff', near: 45, far: 120, minScale: 0.7 }, { kind: 'precision', multiplier: 1.5 }] },
  'mag-chope': { damage: 66, capacity: 125, interval: 0.112, reload: 5, recoil: 0.037, recoilRecovery: 0.87, mobility: 0.74, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(840), traits: [{ kind: 'falloff', near: 45, far: 120, minScale: 0.7 }, { kind: 'precision', multiplier: 1.5 }] },
  'mag-jaga': { damage: 70, capacity: 100, interval: 0.108, reload: 4.6, recoil: 0.034, recoilRecovery: 0.95, mobility: 0.7104, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(840), traits: [{ kind: 'falloff', near: 45, far: 120, minScale: 0.7 }, { kind: 'precision', multiplier: 1.5 }] },
  'cis50-issued': { damage: 160, capacity: 50, interval: 0.14, reload: 5.8, recoil: 0.064, recoilRecovery: 0.65, mobility: 0.55, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(890), traits: [{ kind: 'falloff', near: 55, far: 140, minScale: 0.75 }, { kind: 'precision', multiplier: 1.4 }] },
  'cis50-tuas': { damage: 168, capacity: 75, interval: 0.12, reload: 6.4, recoil: 0.054, recoilRecovery: 0.75, mobility: 0.5225, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(890), traits: [{ kind: 'falloff', near: 55, far: 140, minScale: 0.75 }, { kind: 'precision', multiplier: 1.4 }] },
  'cis50-merlion': { damage: 178, capacity: 50, interval: 0.115, reload: 5.8, recoil: 0.052, recoilRecovery: 0.83, mobility: 0.528, aimFov: HIP_FOV, optic: 'iron', ballistics: muzzleBallistics(890), traits: [{ kind: 'falloff', near: 55, far: 140, minScale: 0.75 }, { kind: 'precision', multiplier: 1.4 }] },
} as const;

const resolved = (id: string) => {
  const item = itemById(id)!, base = createProfile();
  return resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, item.family!)).weapons[item.family!];
};

describe('what each weapon resolves to', () => {
  it('covers every weapon the catalog sells', () => {
    expect(ARMORY_CATALOG.filter(item => item.category === 'weapon' && !isEnemyIssue(item)).map(item => item.id).sort())
      .toEqual(Object.keys(EXPECTED).sort());
  });
  for (const [id, want] of Object.entries(EXPECTED)) it(`resolves ${id} unchanged`, () => {
    const got = resolved(id);
    expect(got.damage).toBe(want.damage); expect(got.capacity).toBe(want.capacity);
    expect(got.interval).toBeCloseTo(want.interval, 10); expect(got.reload).toBeCloseTo(want.reload, 10);
    expect(got.recoil).toBeCloseTo(want.recoil, 10); expect(got.recoilRecovery).toBeCloseTo(want.recoilRecovery, 10);
    expect(got.mobility).toBeCloseTo(want.mobility, 10);
    expect(got.aimFov).toBeCloseTo(want.aimFov, 6); expect(got.optic).toBe(want.optic);
    expect(got.ballistics).toEqual(want.ballistics);
    expect(got.traits).toEqual(want.traits);
  });
  it('carries each variant\u2019s accessories onto the weapon', () => {
    expect(resolved('p30-silent').accessories).toEqual({ sight: 'mini-reflex', muzzle: 'suppressor' });
    expect(resolved('p30-sotong').accessories).toEqual({ rail: 'laser-light' });
    expect(resolved('p30-chiong').accessories).toEqual({ muzzle: 'compensator', brace: true });
    expect(resolved('sar-nightowl').accessories).toEqual({ sight: 'holo', muzzle: 'suppressor', rail: 'laser' });
    expect(resolved('sar-twoeyes').accessories).toEqual({ sight: 'prism', offsetDot: true, muzzle: 'compensator' });
    expect(resolved('ult-lights').accessories).toEqual({ sight: 'holo', rail: 'light', muzzle: 'compensator' });
    expect(resolved('sar-issued').accessories).toBeUndefined();
  });
  it('turns the machine pistol to full automatic and leaves every other pistol semi', () => {
    expect(resolved('p30-chiong').fireMode).toBe('auto');
    for (const id of ['p30-issued', 'p30-silent', 'p30-sotong', 'p30-atas', 'p30-kiasu']) expect(resolved(id).fireMode, id).toBe('semi');
  });
  it('fires the sharpshooter one round per press', () => {
    expect(resolved('sar-sharpshooter').fireMode).toBe('semi');
    expect(resolved('sar-marksman').fireMode).toBeUndefined();
  });
});

describe('how a variant gets its figures', () => {
  const weapons = ARMORY_CATALOG.filter(item => item.category === 'weapon');
  it('never writes a weapon figure beside the weapon instead of into a part', () => {
    // The whole point of the build: a number in the shop is the sum of named
    // hardware, so there is somewhere to point when asked where it came from.
    for (const weapon of weapons) expect(weapon.stats).toBeUndefined();
  });
  it('builds every paid variant out of parts and leaves the issued ones bare', () => {
    // Enemy issue has no price, so its baseline is the Issued tier rather than the free one.
    for (const weapon of weapons) {
      if (weapon.tier === 'Issued') expect(weapon.build ?? []).toEqual([]);
      else expect(weapon.build?.length).toBeGreaterThan(0);
    }
  });
  it('sums its parts, so the advertised figures are the hardware', () => {
    const vanguard = itemById('sar-vanguard')!, base = FPS_WEAPONS[0];
    const parts = vanguard.build!;
    const sum = (key: 'damage' | 'capacity') => parts.reduce((total, part) => total + (part[key] ?? 0), 0);
    expect(variantSpec(vanguard)!.damage).toBe(base.damage + sum('damage'));
    expect(variantSpec(vanguard)!.capacity).toBe(base.capacity + sum('capacity'));
    // Removing the barrel removes exactly its contribution and nothing else.
    const without = applyBuild(base, parts.filter(part => part.id !== 'sar-match-barrel'));
    expect(without.damage).toBe(variantSpec(vanguard)!.damage - 14);
    expect(without.capacity).toBe(variantSpec(vanguard)!.capacity);
  });
  it('climbs both recoil ratings with every rung of a platform', () => {
    // The handling slot is where recoil is bought, and a premium weapon arrives
    // with it filled. A tier that kicked harder or settled slower than the one
    // below it would be a rung nobody should climb.
    for (const family of [0, 1]) {
      const ladder = weapons.filter(item => item.family === family && !item.specialist)
        .sort((a, b) => (a.requiredLevel || 1) - (b.requiredLevel || 1))
        .map(item => ({ name: item.name, spec: resolved(item.id) }));
      ladder.forEach((rung, i) => {
        if (!i) return;
        const below = ladder[i - 1];
        expect(rung.spec.recoil, `${rung.name} vs ${below.name}`).toBeLessThan(below.spec.recoil);
        expect(rung.spec.recoilRecovery, `${rung.name} vs ${below.name}`).toBeGreaterThan(below.spec.recoilRecovery);
      });
    }
  });
  it('gives every part an id, a name and something it is responsible for', () => {
    for (const weapon of weapons) for (const part of weapon.build ?? []) {
      expect(part.id).toMatch(/^[a-z][a-z0-9-]*$/); expect(part.name.length).toBeGreaterThan(0);
      expect(part.description.length).toBeGreaterThan(20);
      const carries = ['damage', 'capacity', 'interval', 'reload', 'recoil', 'recoilRecovery', 'mobility'] as const;
      expect(carries.some(key => part[key] !== undefined) || !!part.ballistics || !!part.traits?.length).toBe(true);
    }
  });
});
