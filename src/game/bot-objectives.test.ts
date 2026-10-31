import { describe, expect, it } from 'vitest';
import { objectiveStep } from './bot-objectives';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { FPS_WEAPONS } from './fps-rules';

describe('map objectives during player contact', () => {
  it('advances to its assigned site instead of following a distant player', () => {
    const step = objectiveStep({ x: -40, z: 0 }, { x: 0, z: 0 }, { dx: 0, dz: 1 }, 1);
    expect(step).toEqual({ dx: 1, dz: 0 });
    expect(objectiveStep({ x: 0, z: 0 }, { x: 0, z: 0 }, { dx: .1, dz: .1 }, 1)).toEqual({ dx: .1, dz: .1 });
    expect(objectiveStep({ x: 0, z: .99 }, { x: 0, z: 0 }, { dx: 0, dz: .1 }, 1)).toEqual({ dx: 0, dz: 0 });
  });
  it.each([false, true])('keeps map control primary with distracting player fire=%s', harassment => {
    const environment: ArenaEnvironment = { bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
      spawns: [{ x: -45, z: 0 }], playerSpawn: { x: 0, z: 120 }, endless: true, reinforcements: true,
      move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }),
      facilities: { sites: [{ id: 'point', name: 'Objective', kind: 'garage', x: 0, y: 0, z: 0,
        initialOwner: null, deployment: { x: 30, z: 0, yaw: 0 } },
        { id: 'home', name: 'Home post', kind: 'command', x: -50, y: 0, z: -25,
          initialOwner: 'mercenaries', deployment: { x: -50, z: -25, yaw: 0 } }] } };
    const arena = createArena([], 1, 'assault', environment);
    arena.addPlayer('you', 'You', 0, 0, FPS_WEAPONS, undefined, true); arena.setPlayerHealthMultiplier('you', 10);
    for (let i = 0; i < 1100; i++) {
      if (harassment && i % 5 === 0) {
        const actors = arena.snapshot().actors, bot = actors.find(a => a.id === 'bot-1')!, player = actors.find(a => a.id === 'you')!;
        const horizontal = Math.hypot(bot.x - player.x, bot.z - player.z), flight = horizontal / FPS_WEAPONS[0].ballistics.velocity;
        const ray = { x: bot.x + 2 - player.x, y: bot.y - .62 - player.y + .5 * 9.8 * flight * flight, z: bot.z - player.z };
        const length = Math.hypot(ray.x, ray.y, ray.z);
        arena.shoot('you', player, { x: ray.x / length, y: ray.y / length, z: ray.z / length }, 0);
      }
      arena.step(.05);
    }
    const state = arena.snapshot(), bot = state.actors.find(a => a.bot)!;
    expect(state.facilities!.sites[0].owner, JSON.stringify({ bot, objective: state.facilities!.sites[0] })).toBe('mercenaries');
    if (!harassment) expect(Math.hypot(bot.x, bot.z)).toBeLessThan(4);
    // Stray rounds may damage the home post, legitimately creating a repair mission.
    // Neither capture nor repair should become a chase toward the player at z=120.
    expect(bot.z).toBeLessThan(10);
    expect(Math.hypot(bot.x, bot.z - 120)).toBeGreaterThan(100);
    expect(bot.shots).toBeGreaterThan(0);
    expect(bot.health).toBeGreaterThan(0);
    expect(state.actors.find(a => a.id === 'you')!.alive).toBe(true);
  });
});
