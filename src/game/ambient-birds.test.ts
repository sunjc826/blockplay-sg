import { describe, expect, it } from 'vitest';
import { BIRDS, createBirds } from './ambient-birds';

const bounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };
const listener = { x: 0, y: 1.7, z: 0 };
const surface = () => 6;
const world = () => {
  const birds = createBirds(3);
  birds.populate(listener, bounds, surface);
  return birds;
};
const toward = (from: typeof listener, to: typeof listener) => ({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });

describe('world bird roosts', () => {
  it('rests on real surfaces before any shots, with folded wings and no drift or expiry', () => {
    const birds = world(), before = structuredClone(birds.flocks);
    expect(birds.count).toBeGreaterThan(0);
    expect(birds.count).toBeLessThanOrEqual(BIRDS.max);
    expect(birds.flocks.every(f => f.resting && f.birds.every(b => b.y === 6.12 && b.flap === 0 && b.vx === 0 && b.vy === 0 && b.vz === 0))).toBe(true);
    for (let i = 0; i < 1000; i++) birds.step(.1);
    expect(birds.flocks).toEqual(before);
  });

  it('never spawns birds in response to gunfire or blasts', () => {
    const birds = createBirds(1);
    for (let i = 0; i < 30; i++) {
      expect(birds.startle(listener, 1, { x: 0, y: 0, z: -1 })).toEqual([]);
      expect(birds.startle(listener, 1)).toEqual([]);
    }
    expect(birds.count).toBe(0);
  });

  it('takes off from existing bird positions and scatters upward away from the shooter once', () => {
    const birds = world(), flock = birds.flocks[0], before = structuredClone(flock.birds);
    const shooter = { x: flock.home.x - 30, y: flock.home.y + 1.6, z: flock.home.z };
    const count = birds.count;
    expect(birds.startle(shooter, .45, toward(shooter, flock.home))).toContain(flock.home);
    expect(flock.resting).toBe(false);
    expect(birds.count).toBe(count);
    expect(flock.birds.map(b => [b.x, b.y, b.z])).toEqual(before.map(b => [b.x, b.y, b.z]));
    expect(flock.birds.every(b => b.vy > 0 && b.vx > 0)).toBe(true);
    expect(birds.startle(shooter, .45, toward(shooter, flock.home))).not.toContain(flock.home);
    for (let i = 0; i < 40; i++) birds.step(.1);
    const mean = flock.birds.reduce((s, b) => ({ x: s.x + b.x / flock.birds.length, y: s.y + b.y / flock.birds.length }), { x: 0, y: 0 });
    expect(mean.x).toBeGreaterThan(flock.home.x + 20);
    expect(mean.y).toBeGreaterThan(flock.home.y + 10);
  });

  it('ignores shots behind, beside, above and beyond the flock, and shots blocked by cover', () => {
    const cases = [
      { offset: { x: -30, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 } },
      { offset: { x: -30, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
      { offset: { x: -30, y: 30, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      { offset: { x: -200, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      { offset: { x: -30, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, clear: () => false },
    ];
    for (const { offset, direction, clear } of cases) {
      const birds = world(), flock = birds.flocks[0], home = flock.home;
      birds.startle({ x: home.x + offset.x, y: home.y + offset.y, z: home.z + offset.z }, .45, direction, clear);
      expect(flock.resting).toBe(true);
    }
  });

  it('flushes nearby roosts for explosions while leaving distant birds resting', () => {
    const birds = world(), flock = birds.flocks[0];
    expect(birds.startle({ ...flock.home, x: flock.home.x + 5 }, .3)).toContain(flock.home);
    expect(birds.flocks.some(f => f.resting)).toBe(true);
  });

  it('leaves flushed cells empty even after flight expires and exploration revisits them', () => {
    const birds = world(), homes = birds.flocks.map(f => f.home);
    homes.forEach(home => birds.startle(home, 2));
    for (let i = 0; i < 170; i++) birds.step(.1);
    expect(birds.count).toBe(0);
    birds.populate(listener, bounds, surface);
    expect(birds.count).toBe(0);
    birds.populate({ x: 300, y: 1.7, z: 300 }, bounds, surface);
    expect(birds.count).toBeGreaterThan(0);
    birds.populate(listener, bounds, surface);
    expect(birds.flocks.every(f => !homes.some(h => h.x === f.home.x && h.z === f.home.z))).toBe(true);
    birds.reset(); birds.populate(listener, bounds, surface);
    expect(birds.flocks.map(f => f.home)).toEqual(homes);
  });

  it('seeds the same world positions independently of time and respects surface edges', () => {
    expect(world().flocks).toEqual(world().flocks);
    const birds = createBirds(3);
    birds.populate(listener, bounds, (x, z) => x > 0 && z > 0 ? 10 : null);
    expect(birds.count).toBeGreaterThan(0);
    expect(birds.flocks.every(f => f.birds.every(b => b.x > 0 && b.z > 0 && b.y === 10.12))).toBe(true);
  });

  it('keeps populations bounded across exploration and repeated gunfire', () => {
    const birds = createBirds(9);
    for (let x = -300; x <= 300; x += 30) {
      birds.populate({ ...listener, x }, bounds, surface);
      birds.startle({ ...listener, x }, 1);
      birds.step(.1);
      expect(birds.count).toBeLessThanOrEqual(BIRDS.max);
    }
  });
});
