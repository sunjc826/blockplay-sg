import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { shootAndLand } from './arena-test-shots';
import { createRegionMovement } from './region-collision';
import { assistPoints } from './match-score';

const tick = (a: ArenaSimulation, n: number) => { for (let t = 0; t < n - 1e-6; t += .05) a.step(Math.min(.05, n - t)); };
const actor = (a: ArenaSimulation, id: string) => a.snapshot().actors.find(a => a.id === id)!;
function setup() {
  const bounds = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  const environment: ArenaEnvironment = { bounds, move: createRegionMovement(bounds).move, spawns: [{ x: 0, z: 0 }, { x: 0, z: -20 }, { x: 30, z: -20 }] };
  const a = createArena([], 0, 'mixed', environment);
  a.addPlayer('one', 'one', 0, 0, [{ damage: 200, interval: .06, capacity: 100, reload: .4 }]);
  a.addPlayer('two', 'two', 0, 0, [{ damage: 200, interval: .06, capacity: 100, reload: .4 }]);
  a.addPlayer('three', 'three', 0, 0, [{ damage: 30, interval: .06, capacity: 100, reload: .4 }]);
  tick(a, 3.1);
  const shoot = (from: string, at: string, drop: number) => {
    const shooter = actor(a, from), target = actor(a, at), dx = target.x - shooter.x, dy = target.y - drop - shooter.y, dz = target.z - shooter.z, d = Math.hypot(dx, dy, dz);
    return shootAndLand(a, from, shooter, { x: dx / d, y: dy / d, z: dz / d }, 0);
  };
  return { a, environment, shoot };
}

it('scores a real headshot kill and the assist behind it, and the snapshot survives validation', () => {
  const { a, environment, shoot } = setup();
  const hurt = shoot('three', 'two', .6); expect(hurt.killed).toBe(false); expect(hurt.damage).toBeGreaterThan(0);
  const shot = shoot('one', 'two', 0); expect(shot).toMatchObject({ killed: true, headshot: true });
  const s = a.snapshot(), award = s.score!.events.find(e => e.actor === 'one')!;
  expect(award.parts.map(p => p[0])).toEqual(['kill', 'headshot', 'first-blood']);
  expect(s.score!.players).toMatchObject({ one: { score: 175, assists: 0 }, two: { score: 0, assists: 0 }, three: { score: assistPoints(hurt.damage), assists: 1 } });
  // The kill charges 100 and the extras charge on top; the helper's assist charges too.
  expect(s.streaks!.players.one.charge).toBe(175);
  expect(s.streaks!.players.three.charge).toBe(assistPoints(hurt.damage));
  expect(validArenaSnapshot(s, environment)).toBe(true);
  expect(validArenaSnapshot({ ...s, score: { ...s.score!, players: { ...s.score!.players, one: { score: -5, assists: 0 } } } }, environment)).toBe(false);
  tick(a, 4.2); expect(a.snapshot().score!.events).toEqual([]);
  expect(a.snapshot().score!.players.one.score).toBe(175);
});
it('starts a new match from nothing', () => {
  const { a, shoot } = setup();
  expect(shoot('one', 'two', .6).killed).toBe(true);
  a.reset();
  expect(Object.values(a.snapshot().score!.players).every(p => p.score === 0 && p.assists === 0)).toBe(true);
  expect(a.snapshot().score!.events).toEqual([]);
});
