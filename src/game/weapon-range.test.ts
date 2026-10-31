import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaPoint } from './arena-rules';
import { FPS_WEAPONS, hitDamage } from './fps-rules';
import { MAX_WEAPON_RANGE, weaponRange } from './weapon-range';

const environment = (distance: number): ArenaEnvironment => ({
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  spawns: [{ x: 0, z: 0 }, { x: 0, z: -distance }],
  move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), endless: true,
});

function fire(distance: number, family = 0, requested?: number, wall = false) {
  const arena = createArena(wall ? [{ minX: -10, maxX: 10, minZ: -205, maxZ: -200, maxY: 10 }] : [], 0, 'mixed', environment(distance));
  arena.addPlayer('one', 'One', 0, 0, FPS_WEAPONS);
  arena.addPlayer('two', 'Two', 0, 0, FPS_WEAPONS);
  const [shooter, victim] = arena.snapshot().actors;
  arena.setInput('one', { ...shooter, weapon: family, playing: true });
  const spec = FPS_WEAPONS[family], flight = distance / spec.ballistics.velocity;
  const direction: ArenaPoint = { x: 0, y: victim.y - .65 - shooter.y + .5 * spec.ballistics.drop * flight * flight, z: victim.z - shooter.z };
  const length = Math.hypot(direction.y, direction.z); direction.y /= length; direction.z /= length;
  arena.shoot('one', shooter, direction, family, requested);
  const limit = arena.snapshot().rounds?.[0]?.limit;
  for (let i = 0; i < 150 && arena.inFlight('one'); i++) arena.step(.01);
  return { hits: arena.takeHits('one'), victim: arena.snapshot().actors.find(a => a.id === 'two')!, limit };
}

describe('shared infantry bullet travel', () => {
  it.each([124, 126, 179, 181, 299])('lands rifle rounds at %i m without the old cutoffs', distance => {
    const result = fire(distance);
    expect(result.limit).toBe(300);
    expect(result.hits[0]).toMatchObject({ hitId: 'two' });
    expect(result.victim.health).toBeLessThan(100);
  });
  it.each([3, 4])('extends MG family %i to 400 m', family => {
    expect(fire(399, family).hits[0]?.hitId).toBe('two');
    expect(fire(401, family, 10000).hits).toEqual([]);
  });
  it('caps client-requested distances and retains shorter cover restrictions', () => {
    expect(fire(301, 0, 10000)).toMatchObject({ hits: [], limit: 300 });
    expect(fire(126, 0, 100)).toMatchObject({ hits: [], limit: 100 });
    expect(fire(126, 0, NaN).hits).toEqual([]);
    expect(fire(126, 0, Infinity).hits).toEqual([]);
  });
  it('keeps rendered-distance-independent collision cover at long range', () => {
    expect(fire(250, 0, undefined, true).hits).toEqual([]);
  });
  it('keeps a shorter pistol range and the existing damage floors', () => {
    expect(weaponRange(FPS_WEAPONS[2])).toBe(180);
    expect(fire(179, 2).hits[0]?.hitId).toBe('two');
    expect(fire(181, 2).hits).toEqual([]);
    expect(FPS_WEAPONS.every(w => weaponRange(w) <= MAX_WEAPON_RANGE)).toBe(true);
    for (const distance of [126, 180, 300, 400]) {
      expect(hitDamage(FPS_WEAPONS[0], distance)).toBe(20);
      expect(hitDamage(FPS_WEAPONS[3], distance)).toBe(42);
      expect(hitDamage(FPS_WEAPONS[4], distance)).toBeGreaterThanOrEqual(120);
    }
  });
});
