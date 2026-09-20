import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { applyBuild, createProfile, equip, resolveLoadout, variantSpec } from './armory-state';
import { FPS_WEAPONS, magnifiedFov, HIP_FOV } from './fps-rules';
import { HITSCAN } from './fps-ballistics';

/**
 * What every purchasable weapon resolves to, pinned. These numbers were tuned
 * against the breakpoint ladder, so anything that changes them changes balance
 * and should be a deliberate edit here rather than a side effect elsewhere.
 */
const SAR_BAND = { kind: 'falloff', near: 30, far: 90, minScale: .55 };
const ULT_BAND = { kind: 'falloff', near: 14, far: 45, minScale: .4 };
const EXPECTED = {
  'sar-issued': { damage: 36, capacity: 30, interval: .12, reload: 1.8, recoil: .018, mobility: 1, aimFov: magnifiedFov(1.5), optic: 'integrated', ballistics: HITSCAN, traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }] },
  'sar-ranger': { damage: 39, capacity: 30, interval: .115, reload: 1.65, recoil: .016, mobility: 1, aimFov: magnifiedFov(1.5), optic: 'integrated', ballistics: HITSCAN, traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }] },
  'sar-vanguard': { damage: 50, capacity: 36, interval: .105, reload: 1.53, recoil: .01008, mobility: 1, aimFov: magnifiedFov(1.5), optic: 'integrated', ballistics: HITSCAN, traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }] },
  'sar-marksman': { damage: 58, capacity: 36, interval: .1, reload: 1.5, recoil: .00816, mobility: 1, aimFov: 40, optic: 'precision', ballistics: { velocity: 620, drop: 9 }, traits: [SAR_BAND, { kind: 'precision', multiplier: 1.6 }, { kind: 'falloff', near: 45, far: 130, minScale: .75 }, { kind: 'precision', multiplier: 2.2 }] },
  'ult-issued': { damage: 30, capacity: 60, interval: .085, reload: 2.5, recoil: .026, mobility: 1, aimFov: HIP_FOV, optic: 'reflex', ballistics: HITSCAN, traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }] },
  'ult-patrol': { damage: 34, capacity: 50, interval: .08, reload: 2.1, recoil: .022, mobility: 1.02, aimFov: HIP_FOV, optic: 'reflex', ballistics: HITSCAN, traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }] },
  'ult-centurion': { damage: 40, capacity: 75, interval: .075, reload: 2.1, recoil: .0148, mobility: 1, aimFov: HIP_FOV, optic: 'reflex', ballistics: HITSCAN, traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }] },
  'ult-bastion': { damage: 50, capacity: 80, interval: .072, reload: 2, recoil: .01188, mobility: 1, aimFov: HIP_FOV, optic: 'reflex', ballistics: { velocity: 520, drop: 12 }, traits: [ULT_BAND, { kind: 'precision', multiplier: 1.5 }, { kind: 'falloff', near: 24, far: 70, minScale: .6 }, { kind: 'precision', multiplier: 1.9 }] },
} as const;

const resolved = (id: string) => {
  const item = itemById(id)!, base = createProfile();
  return resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, item.family!)).weapons[item.family!];
};

describe('what each weapon resolves to', () => {
  it('covers every weapon the catalog sells', () => {
    expect(ARMORY_CATALOG.filter(item => item.category === 'weapon').map(item => item.id).sort())
      .toEqual(Object.keys(EXPECTED).sort());
  });
  for (const [id, want] of Object.entries(EXPECTED)) it(`resolves ${id} unchanged`, () => {
    const got = resolved(id);
    expect(got.damage).toBe(want.damage); expect(got.capacity).toBe(want.capacity);
    expect(got.interval).toBeCloseTo(want.interval, 10); expect(got.reload).toBeCloseTo(want.reload, 10);
    expect(got.recoil).toBeCloseTo(want.recoil, 10); expect(got.mobility).toBeCloseTo(want.mobility, 10);
    expect(got.aimFov).toBeCloseTo(want.aimFov, 6); expect(got.optic).toBe(want.optic);
    expect(got.ballistics).toEqual(want.ballistics);
    expect(got.traits).toEqual(want.traits);
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
    for (const weapon of weapons) {
      if (weapon.price === 0) expect(weapon.build ?? []).toEqual([]);
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
  it('gives every part an id, a name and something it is responsible for', () => {
    for (const weapon of weapons) for (const part of weapon.build ?? []) {
      expect(part.id).toMatch(/^[a-z][a-z0-9-]*$/); expect(part.name.length).toBeGreaterThan(0);
      expect(part.description.length).toBeGreaterThan(20);
      const carries = ['damage', 'capacity', 'interval', 'reload', 'recoil', 'mobility'] as const;
      expect(carries.some(key => part[key] !== undefined) || !!part.ballistics || !!part.traits?.length).toBe(true);
    }
  });
});
