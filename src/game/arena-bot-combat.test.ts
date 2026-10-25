import { describe, expect, it } from 'vitest';
import { BOT_AIM, BOT_HEAL, botAimScale, botFireCadence, botShotSpread, botWantsHeal } from './arena-bot-combat';
import { createArena, SPAWN_SHIELD_SECONDS, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { itemById } from './armory-catalog';
import { variantSpec } from './armory-state';
import { FPS_WEAPONS, hitDamage } from './fps-rules';

const environment = (bot: { x: number; z: number }, player: { x: number; z: number }): ArenaEnvironment => ({
  bounds: { minX: 900, maxX: 1100, minZ: 900, maxZ: 1100 }, spawns: [bot],
  move: (p, dx, dz, radius) => ({ x: Math.max(900 + radius, Math.min(1100 - radius, p.x + dx)), z: Math.max(900 + radius, Math.min(1100 - radius, p.z + dz)) }),
  endless: true, playerSpawn: { ...player, yaw: 0, pitch: 0 },
});
const find = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
function shootBot(arena: ArenaSimulation) {
  const you = find(arena, 'you'), bot = find(arena, 'bot-1');
  const x = bot.x - you.x, y = bot.y - .6 - you.y, z = bot.z - you.z, length = Math.hypot(x, y, z);
  const hit = arena.shoot('you', you, { x: x / length, y: y / length, z: z / length }, you.weapon);
  arena.step(.13);
  return hit;
}

describe('bot wound decisions', () => {
  const base = { health: 40, healthMax: 100, medkits: 1, sinceHurt: 3, visible: false, danger: false };
  it('patches up out of sight once the hits stop, and backs away while still in view', () => {
    expect(botWantsHeal(base)).toBe('heal');
    expect(botWantsHeal({ ...base, sinceHurt: .2 })).toBe('retreat');
    expect(botWantsHeal({ ...base, visible: true })).toBe('retreat');
    expect(botWantsHeal({ ...base, visible: true, health: 20 })).toBe('heal');
  });
  it('fights on when healthy, out of dressings or standing in a marked barrage', () => {
    expect(botWantsHeal({ ...base, health: 80 })).toBe(false);
    expect(botWantsHeal({ ...base, medkits: 0 })).toBe(false);
    expect(botWantsHeal({ ...base, danger: true })).toBe(false);
  });
});

describe('bot weapon handling', () => {
  const g36 = FPS_WEAPONS.find(w => w.id === 'g36-inspired')!, mg4 = FPS_WEAPONS.find(w => w.id === 'mg4-inspired')!;
  it('fires a burst at the weapon’s own cycle, never faster than it can', () => {
    expect(botFireCadence(mg4)).toBeLessThan(botFireCadence(g36));
    for (const weapon of [g36, mg4]) expect(botFireCadence(weapon)).toBeGreaterThan(weapon.interval);
  });
  it('opens the cone through a burst by the weapon’s recoil, tighter behind a magnified sight', () => {
    expect(botShotSpread(.05, mg4, 5)).toBeGreaterThan(botShotSpread(.05, mg4, 0));
    expect(botShotSpread(.05, g36, 0)).toBeLessThan(botShotSpread(.05, mg4, 0));
  });
  it('aims wide on first sight and settles over a second and a half, wider against a mover or on the move', () => {
    expect(botAimScale(0, 0, 0)).toBeCloseTo(BOT_AIM.settled * BOT_AIM.opening);
    expect(botAimScale(BOT_AIM.settle, 0, 0)).toBeCloseTo(BOT_AIM.settled);
    expect(botAimScale(10, 0, 0)).toBeCloseTo(BOT_AIM.settled);
    expect(botAimScale(10, 7, 0)).toBeCloseTo(botAimScale(10, 0, 0) * 2.05);
    expect(botAimScale(10, 4.2, 0)).toBeGreaterThan(botAimScale(10, 0, 0));
    expect(botAimScale(10, 0, 1)).toBeCloseTo(botAimScale(10, 0, 0) * (1 + BOT_AIM.ownMotion));
  });
});

describe('bots in the arena', () => {
  it('hit with the drawn variant’s own damage, priced by range and zone, and say where it came from', () => {
    const arena = createArena([], 1, 'tank', environment({ x: 1000, z: 1012 }, { x: 1000, z: 1000 }));
    arena.addPlayer('you', 'You', 0, 0, undefined, undefined, true);
    let before = find(arena, 'you').health, checked = 0;
    for (let t = 0; t < 20 && checked < 3; t += .05) {
      const shooter = find(arena, 'bot-1');
      arena.step(.05);
      const you = find(arena, 'you');
      if (you.health < before - .01) {
        const spec = variantSpec(itemById(shooter.variant!)!)!, range = Math.hypot(shooter.x - you.x, shooter.y - you.y, shooter.z - you.z);
        expect([hitDamage(spec, range), hitDamage(spec, range, 'head')]).toContain(Math.round(before - you.health));
        expect(you.hurtFrom).toMatchObject({ x: expect.closeTo(shooter.x, 0), z: expect.closeTo(shooter.z, 0) });
        checked++;
      }
      before = you.health;
      if (!you.alive) break;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('hold fire on a freshly spawned player until the shield lapses', () => {
    const arena = createArena([], 1, 'tank', environment({ x: 1000, z: 1012 }, { x: 1000, z: 1000 }));
    arena.addPlayer('you', 'You', 0, 0, undefined, undefined, true);
    expect(find(arena, 'you').shield).toBe(SPAWN_SHIELD_SECONDS);
    expect(find(arena, 'bot-1').shield).toBeUndefined();
    for (let t = 0; t < SPAWN_SHIELD_SECONDS - .1; t += .05) arena.step(.05);
    expect(find(arena, 'bot-1').shots).toBe(0);
    expect(find(arena, 'you').health).toBe(100);
    expect(find(arena, 'you').shield).toBeGreaterThan(0); expect(find(arena, 'you').shield).toBeLessThanOrEqual(.15);
    arena.step(.15); expect(find(arena, 'you').shield).toBeUndefined();
    for (let t = 0; t < 10 && find(arena, 'you').health === 100; t += .05) arena.step(.05);
    expect(find(arena, 'you').health).toBeLessThan(100);
  });

  it('drop the spawn shield as soon as the player fires', () => {
    const arena = createArena([], 1, 'tank', environment({ x: 1000, z: 1012 }, { x: 1000, z: 1000 }));
    arena.addPlayer('you', 'You', 0, 0, undefined, undefined, true);
    shootBot(arena);
    expect(find(arena, 'you').shield).toBeUndefined();
    for (let t = 0; t < SPAWN_SHIELD_SECONDS - .5; t += .05) arena.step(.05);
    expect(find(arena, 'bot-1').shots).toBeGreaterThan(0);
  });

  it('let no more than two of a squad fire on one player at once', () => {
    const spots = [{ x: 990, z: 1022 }, { x: 1000, z: 1025 }, { x: 1010, z: 1022 }, { x: 1020, z: 1018 }];
    const arena = createArena([], 4, 'assault', { ...environment(spots[0], { x: 1000, z: 1000 }), spawns: spots });
    arena.addPlayer('you', 'You', 0, 0, undefined, undefined, true); arena.setPlayerHealthMultiplier('you', 10);
    const fired = new Set<string>();
    let before = new Map(arena.snapshot().actors.map(a => [a.id, a.shots]));
    for (let t = 0; t < SPAWN_SHIELD_SECONDS + 10; t += .05) {
      arena.step(.05);
      const bots = arena.snapshot().actors.filter(a => a.bot);
      for (const bot of bots) if (bot.shots > before.get(bot.id)!) fired.add(bot.id);
      before = new Map(bots.map(a => [a.id, a.shots]));
    }
    expect(fired.size).toBe(BOT_AIM.shooters);
  });

  it('kneel to apply a dressing out of sight, and a hit interrupts it without spending it', () => {
    // An assault bot sees 65 m; the player stands 100 m off and can still reach it.
    const arena = createArena([], 1, 'assault', environment({ x: 1000, z: 1050 }, { x: 1000, z: 950 }));
    arena.addPlayer('you', 'You', 0, 0, [{ ...FPS_WEAPONS[0], damage: 24 }], undefined, true);
    for (let i = 0; i < 4; i++) expect(shootBot(arena).hitId).toBe('bot-1');
    const wounded = find(arena, 'bot-1');
    expect(wounded.health).toBeLessThan(50);
    expect(wounded.hurtFrom).toMatchObject({ x: 1000, z: 950 });
    for (let t = 0; t < BOT_HEAL.quiet + .3; t += .1) arena.step(.1);
    expect(find(arena, 'bot-1').healing).toBeGreaterThanOrEqual(0);
    expect(find(arena, 'bot-1').y).toBeCloseTo(BOT_HEAL.kneelEye, 2);
    const interrupted = shootBot(arena);
    expect(interrupted, JSON.stringify(find(arena, 'bot-1'))).toMatchObject({ hitId: 'bot-1' });
    expect(find(arena, 'bot-1').healing).toBeUndefined();
    const hurt = find(arena, 'bot-1').health;
    for (let t = 0; t < BOT_HEAL.quiet + BOT_HEAL.seconds + .6; t += .1) arena.step(.1);
    const healed = find(arena, 'bot-1');
    expect(healed.healing).toBeUndefined();
    expect(healed.health).toBeCloseTo(Math.min(100, hurt + 100 * BOT_HEAL.restore), 5);
    expect(healed.y).toBeCloseTo(1.75, 2);
  });
});
