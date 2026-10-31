import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { FPS_WEAPONS } from './fps-rules';
import type { MuzzleDevice } from './weapon-accessories';

interface Trial { distance?: number; speed?: number; eye?: number; prone?: boolean; firing?: boolean; muzzle?: MuzzleDevice }
function firstShot({ distance = 150, speed = 0, eye = 1.75, prone = false, firing = false, muzzle }: Trial) {
  const environment: ArenaEnvironment = {
    bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, spawns: [{ x: 0, z: distance }],
    playerSpawn: { x: 0, z: 0 }, endless: true,
    move: (p, dx, dz) => p.z === distance ? p : { x: p.x + dx, z: p.z + dz },
  };
  let hidden = true;
  const arena = createArena([], 1, 'assault', environment, undefined, undefined, (_p, _ray, range) => hidden ? 0 : range);
  const weapons = FPS_WEAPONS.map(w => ({ ...w, accessories: { ...w.accessories, muzzle } }));
  arena.addPlayer('you', 'You', 0, 0, weapons, undefined, true); arena.setPlayerHealthMultiplier('you', 10);
  // Let spawn protection expire behind cover, so it does not hide spotting differences.
  for (let i = 0; i < 64; i++) arena.step(.05);
  hidden = false;
  for (let i = 0; i < 600; i++) {
    const player = arena.snapshot().actors.find(a => a.id === 'you')!;
    arena.setInput('you', { ...player, x: player.x + speed * .05, y: eye, prone, playing: true });
    if (firing && i % 4 === 0) {
      const shooter = arena.snapshot().actors.find(a => a.id === 'you')!;
      // Fire away from the observer: only the visual flash can help spotting.
      arena.shoot('you', shooter, { x: 0, y: 0, z: -1 }, 0);
    }
    arena.step(.05);
    if (arena.snapshot().actors.find(a => a.bot)!.shots > 0) return (i + 1) * .05;
  }
  throw Error('No detection in thirty seconds');
}

describe('authoritative infantry spotting', () => {
  it('delays distant contact and uses actual player motion to speed detection', () => {
    const near = firstShot({ distance: 25 }), far = firstShot({});
    expect(far).toBeGreaterThan(near + 2);
    expect(firstShot({ speed: 4.2 })).toBeLessThan(far - .5);
    expect(firstShot({ speed: 7 })).toBeLessThan(far - 1);
  });
  it('makes settled crouch and prone harder to detect', () => {
    const standing = firstShot({}), crouch = firstShot({ eye: 1.15 }), prone = firstShot({ eye: .55, prone: true });
    expect(crouch).toBeGreaterThan(standing + 1);
    expect(prone).toBeGreaterThan(crouch + 2);
  });
  it('uses host-fired muzzle signatures without a hit or near miss', () => {
    const quiet = firstShot({}), suppressed = firstShot({ firing: true, muzzle: 'suppressor' });
    const bare = firstShot({ firing: true }), compensated = firstShot({ firing: true, muzzle: 'compensator' });
    expect(suppressed).toBeLessThan(quiet); expect(bare).toBeLessThan(suppressed);
    expect(compensated).toBeLessThanOrEqual(bare);
  });
  it('does not follow an unidentified player through the map', () => {
    const environment: ArenaEnvironment = { bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
      spawns: [{ x: 0, z: 200 }], playerSpawn: { x: 0, z: 0 }, endless: true,
      move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }) };
    const arena = createArena([], 1, 'assault', environment);
    arena.addPlayer('you', 'You', 0, 0, FPS_WEAPONS, undefined, true);
    for (let i = 0; i < 40; i++) arena.step(.05);
    const bot = arena.snapshot().actors.find(a => a.bot)!;
    expect(Math.hypot(bot.x, bot.z - 200)).toBeLessThan(.1);
    expect(bot.shots).toBe(0);
  });
});
