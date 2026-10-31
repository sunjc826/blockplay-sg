import { describe, expect, it } from 'vitest';
import { BOT_THREAT, nearBullet } from './bot-threat';
import { createArena, type ArenaCoverDistance, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { FPS_WEAPONS } from './fps-rules';

const find = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
function advance(arena: ArenaSimulation, seconds: number) {
  for (let t = 0; t < seconds - 1e-8; t += .02) arena.step(Math.min(.02, seconds - t));
}
function scenario(distance = 250, spots = [{ x: 0, z: distance }], cover?: ArenaCoverDistance, mobile = false) {
  const environment: ArenaEnvironment = {
    bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, spawns: spots,
    move: (p, dx, dz) => mobile || p.z < 10 ? { x: p.x + dx, z: p.z + dz } : p,
    endless: true, playerSpawn: { x: 0, z: 0 },
  };
  const arena = createArena([], spots.length, 'assault', environment, undefined, undefined, cover);
  arena.addPlayer('you', 'You', 0, 0, [{ ...FPS_WEAPONS[0], damage: 10 }], undefined, true);
  arena.setPlayerHealthMultiplier('you', 10);
  return arena;
}
function fire(arena: ArenaSimulation, miss = 0) {
  const you = find(arena, 'you'), bot = find(arena, 'bot-1');
  const flight = Math.hypot(bot.x - you.x, bot.z - you.z) / FPS_WEAPONS[0].ballistics.velocity;
  const aim = { x: bot.x + miss - you.x, y: bot.y - .62 - you.y + .5 * 9.8 * flight * flight, z: bot.z - you.z };
  const length = Math.hypot(aim.x, aim.y, aim.z);
  arena.shoot('you', you, { x: aim.x / length, y: aim.y / length, z: aim.z / length }, 0);
  advance(arena, .7);
}

describe('bot under-fire response', () => {
  it('keeps passive spotting limits, then returns fire at a visually confirmed distant attacker', () => {
    const arena = scenario(); advance(arena, 4);
    expect(find(arena, 'bot-1').shots).toBe(0);
    fire(arena);
    expect(find(arena, 'bot-1').health).toBeLessThan(100);
    advance(arena, 8);
    expect(find(arena, 'bot-1').shots).toBeGreaterThan(0);
  });
  it('reacts to a near miss without needing damage', () => {
    const arena = scenario(); const before = find(arena, 'bot-1').health;
    fire(arena, 2);
    expect(find(arena, 'bot-1').health).toBe(before);
    advance(arena, 8);
    expect(find(arena, 'bot-1').shots).toBeGreaterThan(0);
  });
  it('does not alert from a bullet that passed well away', () => {
    const arena = scenario(); fire(arena, 12); advance(arena, 8);
    expect(find(arena, 'bot-1').shots).toBe(0);
  });
  it('shares contact locally without alerting every enemy on the map', () => {
    const arena = scenario(250, [{ x: 0, z: 250 }, { x: 15, z: 250 }, { x: 90, z: 250 }]);
    fire(arena); advance(arena, 8);
    expect(find(arena, 'bot-1').shots).toBeGreaterThan(0);
    const bots = arena.snapshot().actors.filter(a => a.bot);
    expect(bots.find(a => a.x === 15)!.shots).toBeGreaterThan(0);
    expect(bots.find(a => a.x === 90)!.shots).toBe(0);
  });
  it('stops firing behind cover and searches the last report rather than tracking hidden movement', () => {
    let blocked = false;
    const arena = scenario(250, undefined, (_p, _ray, range) => blocked ? Math.min(.1, range) : range);
    fire(arena); blocked = true; advance(arena, 1);
    const before = find(arena, 'bot-1').shots, you = find(arena, 'you');
    arena.setInput('you', { ...you, x: 1, playing: true });
    expect(find(arena, 'you').x).toBe(1);
    advance(arena, 2);
    expect(find(arena, 'bot-1').shots).toBe(before);
    expect(find(arena, 'bot-1').yaw).toBeCloseTo(0, 6);
  });
  it('expires hidden reports, then requires normal spotting to reacquire', () => {
    let blocked = false;
    const arena = scenario(250, undefined, (_p, _ray, range) => blocked ? 0 : range);
    fire(arena); blocked = true; advance(arena, BOT_THREAT.memory + 1);
    blocked = false; advance(arena, 3);
    expect(find(arena, 'bot-1').shots).toBe(0);
  });
  it('takes evasive action when there is no nearby cover', () => {
    const arena = scenario(250, undefined, undefined, true);
    fire(arena, 2); advance(arena, 1);
    expect(Math.abs(find(arena, 'bot-1').x)).toBeGreaterThan(1);
  });
  it('dashes toward nearby cover that blocks the reported attack direction', () => {
    const cover: ArenaCoverDistance = (p, ray, range) => {
      const t = (240 - p.z) / ray.z, x = p.x + ray.x * t;
      return t >= 0 && t < range && x >= 2 && x <= 6 ? t : range;
    };
    const arena = scenario(250, undefined, cover, true);
    fire(arena); advance(arena, 2);
    expect(find(arena, 'bot-1').x).toBeGreaterThan(2);
  });
  it('clears threat memory on reset', () => {
    const arena = scenario(); fire(arena); arena.reset(); advance(arena, 6);
    expect(find(arena, 'bot-1').shots).toBe(0);
  });
});

it('limits near misses to the clear collision segment, including its endpoints', () => {
  const origin = { x: 0, y: 1, z: 0 }, ray = { x: 0, y: 0, z: 1 };
  expect(nearBullet({ x: 2, y: 1, z: 5 }, origin, ray, 10)).toBe(true);
  expect(nearBullet({ x: 3, y: 1, z: 5 }, origin, ray, 10)).toBe(false);
  expect(nearBullet({ x: 0, y: 1, z: 20 }, origin, ray, 10)).toBe(false);
});
