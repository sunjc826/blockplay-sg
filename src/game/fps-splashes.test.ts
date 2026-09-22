import { describe, expect, it } from 'vitest';
import {
  advanceSplashes, createSplashField, DROPLETS_PER_SPLASH, grazingAngle, JET_DROPLETS, MAX_DROPLETS, MAX_SPLASHES,
  recordSplash, SKIP_RESTITUTION, splashColumn, splashRings, WATER_CRITICAL_ANGLE, waterRicochet,
} from './fps-splashes';

const up = { x: 0, y: 1, z: 0 }, surface = { x: 0, y: -0.4, z: 0 };
const at = (degrees: number) => ({ x: 0, y: -Math.sin(degrees * Math.PI / 180), z: -Math.cos(degrees * Math.PI / 180) });
const seeded = (seed = 7) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

describe('rounds meeting water', () => {
  it('measures the angle between a round and the surface it meets', () => {
    expect(grazingAngle(at(4), up)).toBeCloseTo(4 * Math.PI / 180, 10);
    expect(grazingAngle({ x: 0, y: -1, z: 0 }, up)).toBeCloseTo(Math.PI / 2, 10);
  });
  it('skims below the critical angle and climbs away shallower than it arrived', () => {
    const skip = waterRicochet(at(3), up)!;
    expect(skip).not.toBeNull();
    expect(skip.y).toBeGreaterThan(0);
    expect(grazingAngle(skip, up)).toBeLessThan(3 * Math.PI / 180);
    // The climb is the arrival's dive, mirrored and cut to the restitution.
    expect(skip.y / Math.hypot(skip.x, skip.z)).toBeCloseTo(Math.tan(3 * Math.PI / 180) * SKIP_RESTITUTION, 6);
    // Heading along the surface is kept.
    expect(skip.x).toBeCloseTo(0, 10); expect(skip.z).toBeLessThan(0);
  });
  it('goes in at anything steeper than the critical angle', () => {
    const critical = WATER_CRITICAL_ANGLE * 180 / Math.PI;
    expect(waterRicochet(at(critical + 0.5), up)).toBeNull();
    expect(waterRicochet(at(45), up)).toBeNull();
    expect(waterRicochet({ x: 0, y: -1, z: 0 }, up)).toBeNull();
  });
  it('does not skip a round already leaving the surface', () => {
    expect(waterRicochet({ x: 0, y: 0.02, z: -1 }, up)).toBeNull();
  });
});

describe('splashes', () => {
  it('throws a crown and, for a plunging round, a jet up the middle', () => {
    const field = createSplashField();
    recordSplash(field, surface, { x: 0, y: -1, z: 0 }, 1, seeded());
    expect(field.splashes).toHaveLength(1);
    expect(field.droplets).toHaveLength(DROPLETS_PER_SPLASH + JET_DROPLETS);
    expect(field.droplets.every(drop => drop.vy > 0 && drop.floor === surface.y)).toBe(true);
    // A plunge sprays evenly round: no net sideways throw.
    const drift = field.droplets.reduce((sum, drop) => sum + drop.vz, 0) / field.droplets.length;
    expect(Math.abs(drift)).toBeLessThan(0.3);
  });
  it('throws a skim forward along its travel, with no jet', () => {
    const field = createSplashField();
    recordSplash(field, surface, at(3), 1, seeded());
    expect(field.droplets).toHaveLength(DROPLETS_PER_SPLASH);
    const drift = field.droplets.reduce((sum, drop) => sum + drop.vz, 0) / field.droplets.length;
    expect(drift).toBeLessThan(-1);
  });
  it('sprays smaller for a round that has lost energy', () => {
    const strong = createSplashField(), weak = createSplashField();
    recordSplash(strong, surface, { x: 0, y: -1, z: 0 }, 1, seeded(3));
    recordSplash(weak, surface, { x: 0, y: -1, z: 0 }, 0.3, seeded(3));
    const peak = (field: typeof strong) => Math.max(...field.droplets.map(drop => drop.vy));
    expect(peak(weak)).toBeLessThan(peak(strong));
    expect(splashColumn(weak.splashes[0]).height).toBeLessThan(splashColumn(strong.splashes[0]).height);
  });
  it('lets every droplet rise, fall back into the water and go', () => {
    const field = createSplashField();
    recordSplash(field, surface, { x: 0, y: -1, z: 0 }, 1, seeded());
    advanceSplashes(field, 0.1);
    expect(field.droplets.length).toBe(DROPLETS_PER_SPLASH + JET_DROPLETS);
    expect(field.droplets.every(drop => drop.y > surface.y)).toBe(true);
    for (let i = 0; i < 40; i++) advanceSplashes(field, 0.05);
    expect(field.droplets).toHaveLength(0);
    expect(field.splashes).toHaveLength(0);
  });
  it('keeps spray in the air on a slow renderer rather than losing it in one long step', () => {
    // A four-frames-a-second renderer hands over a quarter second at once.
    const slow = createSplashField(), smooth = createSplashField();
    recordSplash(slow, surface, at(10), 0.6, seeded(11));
    recordSplash(smooth, surface, at(10), 0.6, seeded(11));
    advanceSplashes(slow, 0.25);
    for (let i = 0; i < 15; i++) advanceSplashes(smooth, 0.25 / 15);
    expect(slow.droplets.length).toBeGreaterThan(0);
    expect(slow.droplets.length).toBe(smooth.droplets.length);
    slow.droplets.forEach((drop, i) => expect(drop.y).toBeCloseTo(smooth.droplets[i].y, 6));
  });
  it('holds every pool to its ceiling', () => {
    const field = createSplashField();
    for (let i = 0; i < MAX_SPLASHES * 3; i++) recordSplash(field, surface, { x: 0, y: -1, z: 0 });
    expect(field.splashes).toHaveLength(MAX_SPLASHES);
    expect(field.droplets).toHaveLength(MAX_DROPLETS);
  });
  it('opens the outer ring ahead of the inner one and fades both out', () => {
    const splash = { ...surface, age: 0.3, life: 1.3, size: 1, spin: 0 };
    const [outer, inner] = splashRings(splash);
    expect(outer.radius).toBeGreaterThan(inner.radius);
    expect(outer.brightness).toBeGreaterThan(0);
    const [late] = splashRings({ ...splash, age: 1.3 });
    expect(late.brightness).toBe(0);
  });
});
