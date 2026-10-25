import { describe, expect, it } from 'vitest';
import { advanceWeapon, beginReload, chamberRound, createLoadout, EMPTY_RELOAD, fireWeapon, FPS_WEAPONS, fullLoad, interruptReload, magazineRounds, RELOAD_POINTS, reloadCommit, reloadProgress, roundReady, hitDamage, movementInput, splashScale, FPS_SPAWN, FPS_TARGETS } from './fps-rules';
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
  it('starts a closed bolt with one in the chamber and an open bolt without', () => {
    const [sar, ultimax] = createLoadout();
    expect(sar.magazine).toBe(31); expect(chamberRound(sar, FPS_WEAPONS[0])).toBe(1); expect(magazineRounds(sar, FPS_WEAPONS[0])).toBe(30);
    expect(ultimax.magazine).toBe(60); expect(chamberRound(ultimax, FPS_WEAPONS[1])).toBe(0);
    expect(fullLoad(FPS_WEAPONS[0])).toBe(31); expect(fullLoad(FPS_WEAPONS[1])).toBe(60);
  });
  it('returns a removed magazine\'s rounds to the reserve and conserves every round', () => {
    const state = createLoadout()[0]; state.magazine = 24; state.reserve = 3;
    beginReload(state, 0); advanceWeapon(state, 0, 1);
    // Past MAG OUT: only the chambered round is still in the gun.
    expect(state.magazine).toBe(1); expect(state.magazineOut).toBe(true); expect(state.reserve).toBe(26);
    advanceWeapon(state, 0, 1);
    expect(state.magazine).toBe(27); expect(state.reserve).toBe(0); expect(state.magazineOut).toBe(false);
    expect(beginReload(state, 0)).toBe(false);
  });
  it('does not refill or reset reload timing on repeated reload input', () => {
    const state = createLoadout()[1];
    expect(beginReload(state, 1)).toBe(false);
    state.magazine = 5; beginReload(state, 1); advanceWeapon(state, 1, 1);
    expect(beginReload(state, 1)).toBe(false);
    expect(state.reloadRemaining).toBe(1.5);
    state.reloadRemaining = 0; // a cancelled reload creates no ammunition
    advanceWeapon(state, 1, 5); expect(state.magazine + state.reserve).toBe(185);
    expect(createLoadout()[1].magazine).toBe(60);
  });
  it('keeps the chambered round on a tactical reload: a full magazine plus one', () => {
    const state = createLoadout()[0], reload = FPS_WEAPONS[0].reload; state.magazine = 12;
    beginReload(state, 0); expect(state.reloadEmpty).toBe(false);
    advanceWeapon(state, 0, reload * (RELOAD_POINTS.seat - .02)); expect(state.magazine).toBe(1); expect(state.reserve).toBe(131);
    advanceWeapon(state, 0, reload * .04); expect(state.magazine).toBe(31); expect(state.reserve).toBe(101);
    // Ready at the seat, still reloading through the settle, and nothing more moves.
    expect(state.reloadRemaining).toBeGreaterThan(0); expect(fireWeapon(state, 0)).toBe(false);
    advanceWeapon(state, 0, reload); expect(state.magazine).toBe(31); expect(state.reserve).toBe(101);
  });
  it('chambers a round from empty, so an empty reload ends one short of a tactical one', () => {
    const state = createLoadout()[0], reload = FPS_WEAPONS[0].reload; state.magazine = 0; state.chambered = false;
    expect(fireWeapon(state, 0)).toBe(false);
    beginReload(state, 0); expect(state.reloadEmpty).toBe(true);
    advanceWeapon(state, 0, reload * (RELOAD_POINTS.seat + .02));
    // Seated but not yet charged: thirty in the magazine, nothing ready to fire.
    expect(state.magazine).toBe(30); expect(roundReady(state, FPS_WEAPONS[0])).toBe(false);
    expect(interruptReload(state, 0)).toBe('suspended'); expect(fireWeapon(state, 0)).toBe(false);
    beginReload(state, 0); advanceWeapon(state, 0, reload);
    expect(state.magazine).toBe(30); expect(chamberRound(state, FPS_WEAPONS[0])).toBe(1); expect(fireWeapon(state, 0)).toBe(true);
  });
  it('leaves only the chambered round to fire when a reload stops with the magazine out', () => {
    const state = createLoadout()[0], reload = FPS_WEAPONS[0].reload; state.magazine = 7;
    beginReload(state, 0); advanceWeapon(state, 0, reload * .5);
    expect(interruptReload(state, 0)).toBe('suspended');
    expect(state.magazineOut).toBe(true); expect(state.magazine).toBe(1); expect(state.reserve).toBe(126); expect(state.reloadSaved).toBeCloseTo(.5);
    expect(fireWeapon(state, 0)).toBe(true); expect(state.magazine).toBe(0); expect(state.chambered).toBe(false);
    advanceWeapon(state, 0, 1); expect(fireWeapon(state, 0)).toBe(false);
    // Resumed from empty, it picks up at MAG IN on the same clock and still has to rack the handle.
    beginReload(state, 0); expect(state.reloadEmpty).toBe(true); expect(state.reloadRemaining).toBeCloseTo(reload * (EMPTY_RELOAD.length - .5));
    advanceWeapon(state, 0, reload * .3); expect(state.magazine).toBe(30); expect(roundReady(state, FPS_WEAPONS[0])).toBe(false);
    advanceWeapon(state, 0, reload * .3); expect(roundReady(state, FPS_WEAPONS[0])).toBe(false);
    advanceWeapon(state, 0, reload * .1); expect(roundReady(state, FPS_WEAPONS[0])).toBe(true);
    expect(interruptReload(state, 0)).toBe('finished'); expect(state.reserve).toBe(96);
  });
  it('lets an open bolt fire nothing with its belt out and re-cocks it after running dry', () => {
    const state = createLoadout()[1], ultimax = FPS_WEAPONS[1]; state.magazine = 1;
    expect(fireWeapon(state, 1)).toBe(true); expect(state.chambered).toBe(false);
    beginReload(state, 1); expect(state.reloadEmpty).toBe(true);
    advanceWeapon(state, 1, ultimax.reload * .5); interruptReload(state, 1);
    expect(state.magazineOut).toBe(true); expect(roundReady(state, ultimax)).toBe(false);
    beginReload(state, 1); advanceWeapon(state, 1, ultimax.reload);
    expect(state.magazine).toBe(60); expect(chamberRound(state, ultimax)).toBe(0); expect(roundReady(state, ultimax)).toBe(true);
  });
  it('never resumes past the point it would be ready, and seats a magazine before chambering', () => {
    const state = createLoadout()[0]; state.magazine = 0; state.reloadSaved = .99;
    beginReload(state, 0);
    expect(reloadProgress(state, 0)).toBeLessThan(reloadCommit(true));
    advanceWeapon(state, 0, FPS_WEAPONS[0].reload); expect(state.magazine).toBe(30); expect(roundReady(state, FPS_WEAPONS[0])).toBe(true);
    state.magazine = 3; state.reloadSaved = Number.NaN; beginReload(state, 0);
    expect(state.reloadRemaining).toBe(FPS_WEAPONS[0].reload);
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
