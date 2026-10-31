import { describe, expect, it } from 'vitest';
import { BOT_AIM, BOT_HEAL, advanceBotAimFocus, botAimScale, botBurstLimit, botTransverseSpeed, botFireCadence, botShotSpread, botWantsHeal } from './arena-bot-combat';
import { createArena, SPAWN_SHIELD_SECONDS, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { itemById } from './armory-catalog';
import { variantSpec } from './armory-state';
import { FPS_WEAPONS, hitDamage } from './fps-rules';
import { BOT_DIFFICULTIES, type BotDifficulty } from './bot-difficulty';
import { shootAndLand } from './arena-test-shots';

const environment = (bot: { x: number; z: number }, player: { x: number; z: number }): ArenaEnvironment => ({
  bounds: { minX: 900, maxX: 1100, minZ: 900, maxZ: 1100 }, spawns: [bot],
  move: (p, dx, dz, radius) => ({ x: Math.max(900 + radius, Math.min(1100 - radius, p.x + dx)), z: Math.max(900 + radius, Math.min(1100 - radius, p.z + dz)) }),
  endless: true, playerSpawn: { ...player, yaw: 0, pitch: 0 },
});
const find = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
function shootBot(arena: ArenaSimulation) {
  const you = find(arena, 'you'), bot = find(arena, 'bot-1');
  const x = bot.x - you.x, y = bot.y - .6 - you.y, z = bot.z - you.z, length = Math.hypot(x, y, z);
  const hit = shootAndLand(arena, 'you', you, { x: x / length, y: y / length, z: z / length }, you.weapon);
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
  it('keeps rough opening aim, tightens quickly, then refines until four seconds on Normal', () => {
    const errors = [0, .5, 1, 2, 3, 4, 8].map(t => botAimScale(t, 0, 0));
    expect(errors[0]).toBe(6); expect(errors[1]).toBe(6);
    expect(errors[2]).toBeLessThan(3.1);
    expect(errors[3]).toBeCloseTo(.6);
    expect(errors[4]).toBeCloseTo(.36);
    expect(errors[5]).toBeCloseTo(.12);
    expect(errors[6]).toBeCloseTo(errors[5]);
    // Normal regular assault: under 0.6 m across at 100 m before optic/recoil.
    expect(.045 * errors[5] * 100).toBeLessThan(.6);
  });
  it('orders the difficulty presets throughout acquisition and settled tracking', () => {
    for (const time of [0, .5, 1, 1.5, 2, 3, 4, 5, 10]) {
      expect(botAimScale(time, 4, 1, 100, 'easy')).toBeGreaterThan(botAimScale(time, 4, 1, 100, 'normal'));
      expect(botAimScale(time, 4, 1, 100, 'normal')).toBeGreaterThan(botAimScale(time, 4, 1, 100, 'hard'));
    }
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      expect(botAimScale(10, 0, 0, 100, difficulty)).toBeCloseTo(BOT_DIFFICULTIES[difficulty].settled);
    }
  });
  it('penalizes sideways tracking most at close range, and retains a bounded own-motion penalty', () => {
    expect(botTransverseSpeed({ x: 0, z: 1 }, { x: 7, z: 0 })).toBe(7);
    expect(botTransverseSpeed({ x: 0, z: 1 }, { x: 0, z: 7 })).toBe(0);
    expect(botAimScale(10, 7, 0, 100)).toBeLessThan(botAimScale(10, 7, 0, 20));
    expect(botAimScale(10, 7, 0, 20)).toBeCloseTo(.12 * 1.49);
    expect(botAimScale(10, 0, 1)).toBeCloseTo(.12 * (1 + BOT_AIM.ownMotion));
    expect(botAimScale(-10, -7, -1)).toBe(6);
  });
  it('retains aim through a brief interruption, loses it behind sustained cover, and resets on target/life changes', () => {
    const focused = { target: 'player:0', exposure: 4, unseen: 0 };
    const glimpse = advanceBotAimFocus(focused, undefined, .2)!;
    expect(glimpse.exposure).toBe(4);
    expect(advanceBotAimFocus(glimpse, 'player:0', .05)?.exposure).toBeGreaterThanOrEqual(4);
    const covered = advanceBotAimFocus(glimpse, undefined, .8)!;
    expect(covered.exposure).toBeLessThan(1.1);
    expect(advanceBotAimFocus(covered, undefined, .6)).toBeUndefined();
    expect(advanceBotAimFocus(focused, 'player:1', .05)?.exposure).toBe(0);
    expect(advanceBotAimFocus(focused, 'other:0', .05)?.exposure).toBe(0);
    let stepped = focused;
    for (let i = 0; i < 10; i++) stepped = advanceBotAimFocus(stepped, undefined, .1)!;
    expect(stepped.exposure).toBeCloseTo(covered.exposure);
  });
  it('uses controlled distant bursts while preserving close-range and support fire', () => {
    expect(botBurstLimit('assault', 100)).toBe(2);
    expect(botBurstLimit('tank', 100)).toBe(4);
    expect(botBurstLimit('assault', 10)).toBeGreaterThanOrEqual(4);
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
    // Actual lost sight is required now: a distant attacker is still a threat.
    let hidden = false;
    const arena = createArena([], 1, 'assault', { ...environment({ x: 1000, z: 1050 }, { x: 1000, z: 950 }), move: p => p }, undefined, undefined,
      (_p, _ray, range) => hidden ? Math.min(.1, range) : range);
    arena.addPlayer('you', 'You', 0, 0, [{ ...FPS_WEAPONS[0], damage: 24 }], undefined, true);
    for (let i = 0; i < 4; i++) expect(shootBot(arena).hitId).toBe('bot-1');
    const wounded = find(arena, 'bot-1');
    expect(wounded.health).toBeLessThan(50);
    expect(wounded.hurtFrom).toMatchObject({ x: 1000, z: 950 });
    hidden = true;
    for (let t = 0; t < BOT_HEAL.quiet + .3; t += .1) arena.step(.1);
    expect(find(arena, 'bot-1').healing).toBeGreaterThanOrEqual(0);
    expect(find(arena, 'bot-1').y).toBeCloseTo(BOT_HEAL.kneelEye, 2);
    hidden = false;
    const interrupted = shootBot(arena); hidden = true;
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

function accuracyTrial(difficulty: BotDifficulty, range = 100) {
  const arena = createArena([], 1, 'assault', {
    ...environment({ x: 1000, z: 1000 + range }, { x: 1000, z: 1000 }),
    bounds: { minX: 800, maxX: 1300, minZ: 800, maxZ: 1300 },
    move: p => p, botDifficulty: () => difficulty,
  });
  arena.addPlayer('you', 'You', 0, 0, undefined, undefined, true);
  arena.setPlayerHealthMultiplier('you', 10);
  const seen = new Set<number>(), samples: { time: number; error: number }[] = [];
  let first = 0;
  for (let t = 0; t < 18; t += .025) {
    arena.step(.025);
    const snapshot = arena.snapshot();
    for (const round of snapshot.rounds ?? []) {
      if (round.shooter !== 'bot-1' || seen.has(round.id)) continue;
      seen.add(round.id);
      if (!first) first = snapshot.elapsed;
      samples.push({ time: snapshot.elapsed - first, error: Math.abs(round.direction.x / round.direction.z) * range });
    }
  }
  return { samples, health: find(arena, 'you').health, bot: find(arena, 'bot-1') };
}

describe('actual distant bot fire', () => {
  it('narrows real shot directions and hits exposed targets at 100 and 180 metres', () => {
    for (const range of [100, 180]) {
      const trial = accuracyTrial('normal', range);
      const opening = trial.samples.filter(s => s.time < 1.2), settled = trial.samples.filter(s => s.time > 4);
      expect(opening.length).toBeGreaterThan(0); expect(settled.length).toBeGreaterThan(5);
      const mean = (shots: typeof opening) => shots.reduce((n, s) => n + s.error, 0) / shots.length;
      expect(mean(settled)).toBeLessThan(mean(opening) * .2);
      expect(mean(settled)).toBeLessThan(range * .003);
      expect(trial.health).toBeLessThan(1000);
    }
  });
  it('applies the selected difficulty to actual shots', () => {
    const mean = (difficulty: BotDifficulty) => {
      const samples = accuracyTrial(difficulty).samples.filter(s => s.time > 5);
      return samples.reduce((n, s) => n + s.error, 0) / samples.length;
    };
    expect(mean('easy')).toBeGreaterThan(mean('normal'));
    expect(mean('normal')).toBeGreaterThan(mean('hard'));
  });
});
