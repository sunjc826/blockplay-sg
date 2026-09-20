import { describe, expect, it } from 'vitest';
import { advanceWeapon, beginReload, createLoadout, fireWeapon, FPS_WEAPONS, hitDamage, movementInput, splashScale, FPS_SPAWN, FPS_TARGETS } from './fps-rules';
import { buildMarinaScene } from './marina-scene';
import { canOccupy } from './marina-collision';

describe('FPS ammunition lifecycle', () => {
  it('enforces the cooldown, empty magazine and reload interlock', () => {
    const state = createLoadout()[0]; state.magazine = 2;
    expect(fireWeapon(state, 0)).toBe(true);
    expect(fireWeapon(state, 0)).toBe(false);
    advanceWeapon(state, 0, FPS_WEAPONS[0].interval);
    expect(fireWeapon(state, 0)).toBe(true);
    advanceWeapon(state, 0, 1);
    expect(fireWeapon(state, 0)).toBe(false);
    expect(beginReload(state, 0)).toBe(true);
    expect(fireWeapon(state, 0)).toBe(false);
  });
  it('conserves ammo for partial reloads, including the final reserve', () => {
    const state = createLoadout()[0]; state.magazine = 24; state.reserve = 3;
    beginReload(state, 0); advanceWeapon(state, 0, 1);
    expect(state.magazine).toBe(24); expect(state.reserve).toBe(3);
    advanceWeapon(state, 0, 1);
    expect(state.magazine).toBe(27); expect(state.reserve).toBe(0);
    expect(beginReload(state, 0)).toBe(false);
  });
  it('does not refill or reset reload timing on repeated reload input', () => {
    const state = createLoadout()[1];
    expect(beginReload(state, 1)).toBe(false);
    state.magazine = 5; beginReload(state, 1); advanceWeapon(state, 1, 1);
    expect(beginReload(state, 1)).toBe(false);
    expect(state.reloadRemaining).toBe(1.5);
    state.reloadRemaining = 0; // switching weapons cancels the animation without creating ammo
    advanceWeapon(state, 1, 5); expect(state.magazine).toBe(5);
    expect(createLoadout()[1].magazine).toBe(60);
  });
});
it('normalizes diagonal movement and keeps movement relative to camera yaw', () => {
  const diagonal = movementInput(1, 1, 0, 4, 1);
  expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(4);
  const turned = movementInput(1, 0, Math.PI / 2, 4, 1);
  expect(turned.x).toBeCloseTo(-4); expect(turned.z).toBeCloseTo(0);
});
it('places FPS spawn and all target stands clear of Marina obstacles', () => {
  const world = buildMarinaScene();
  try {
    for (const p of [FPS_SPAWN, ...FPS_TARGETS]) expect(canOccupy(p.x, p.z, 0.38, world.obstacles), JSON.stringify(p)).toBe(true);
  } finally { world.dispose(); }
});

describe('range and zone damage', () => {
  const [rifle, support] = FPS_WEAPONS;
  it('returns flat damage for a weapon with no falloff trait', () => {
    const plain = { ...rifle, traits: [] };
    expect(hitDamage(plain, 5)).toBe(rifle.damage); expect(hitDamage(plain, 500)).toBe(rifle.damage);
  });
  it('leaves the rifle untouched across the drill but degrades the support weapon', () => {
    // Drill targets sit 12.0-30.3 units out; the rifle's band starts past that.
    expect(hitDamage(rifle, 12)).toBe(rifle.damage); expect(hitDamage(rifle, 30)).toBe(rifle.damage);
    expect(hitDamage(support, 12)).toBe(support.damage);
    expect(hitDamage(support, 30)).toBeLessThan(support.damage);
  });
  it('applies precision only to a head zone, and composes it with falloff', () => {
    expect(hitDamage(rifle, 12, 'head')).toBe(Math.round(rifle.damage * 1.6));
    expect(hitDamage(rifle, 12, 'body')).toBe(rifle.damage);
    expect(hitDamage(rifle, 12, undefined)).toBe(rifle.damage);
    expect(hitDamage(support, 40, 'head')).toBeLessThan(hitDamage(support, 14, 'head'));
  });
  it('always lands at least one point of damage and always a whole number', () => {
    const feeble = { ...rifle, damage: 2, traits: [{ kind: 'falloff', near: 1, far: 2, minScale: 0 } as const] };
    expect(hitDamage(feeble, 900)).toBe(1);
    for (const range of [7, 23, 41, 88]) expect(Number.isInteger(hitDamage(support, range))).toBe(true);
  });
});

describe('burst damage', () => {
  it('is full at the centre, the floor at the edge and nothing beyond', () => {
    expect(splashScale(0, 3, .35)).toBe(1);
    expect(splashScale(3, 3, .35)).toBeCloseTo(.35, 10);
    expect(splashScale(3.01, 3, .35)).toBe(0);
    expect(splashScale(1.5, 3, .35)).toBeCloseTo(.675, 10);
  });
  it('stays finite for a zero radius, a negative distance or a clamped floor', () => {
    expect(splashScale(0, 0, .5)).toBe(0);
    expect(splashScale(-4, 3, .5)).toBe(1);
    expect(splashScale(3, 3, -2)).toBe(0); expect(splashScale(3, 3, 5)).toBe(1);
  });
});
