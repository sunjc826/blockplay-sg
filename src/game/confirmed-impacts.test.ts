import { expect, it } from 'vitest';
import { createArena, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot, mergeHits } from './arena-runtime';
import { takeConfirmedImpacts, type ConfirmedImpact } from './confirmed-impacts';
import { shootAndLand } from './arena-test-shots';
import { FPS_WEAPONS } from './fps-rules';

const actor = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
function fire(arena: ArenaSimulation) {
  const one = actor(arena, 'one'), two = actor(arena, 'two');
  const direction = { x: two.x - one.x, y: two.y - .6 - one.y, z: two.z - one.z };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  return shootAndLand(arena, 'one', one, { x: direction.x / length, y: direction.y / length, z: direction.z / length }, 0);
}
function duel(lucky = false, cover?: () => number) {
  const arena = createArena([], 0, 'mixed', undefined, undefined, undefined, cover);
  arena.addPlayer('one', 'One');
  arena.addPlayer('two', 'Two', lucky ? 40 : 0, .35, FPS_WEAPONS, undefined, false, undefined, lucky ? { deflect: .2 } : undefined);
  return arena;
}

it('publishes a wound at the authoritative intersection only after health is lost, including lethal hits', () => {
  const arena = duel();
  expect(arena.snapshot().impacts).toEqual([]);
  expect(fire(arena).damage).toBeGreaterThan(0);
  const events = arena.snapshot().impacts!;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ victim: 'two', calibre: 5.56, power: 36 });
  const two = actor(arena, 'two');
  expect(Math.hypot(events[0].point.x - two.x, events[0].point.z - two.z)).toBeLessThan(.5);
  expect(validArenaSnapshot(arena.snapshot())).toBe(true);
  events[0].point.x = 9999;
  expect(arena.snapshot().impacts![0].point.x).not.toBe(9999);
  arena.step(.2); fire(arena); arena.step(.2);
  expect(fire(arena).killed).toBe(true);
  expect(arena.snapshot().impacts).toHaveLength(3);
  const ids = arena.snapshot().impacts!.map(e => e.id);
  expect(new Set(ids).size).toBe(3);
  arena.reset(); expect(arena.snapshot().impacts).toEqual([]);
});

it('does not publish blood for blocked or missed shots', () => {
  const blocked = duel(false, () => .1);
  expect(fire(blocked).hitId).toBeNull();
  expect(blocked.snapshot().impacts).toEqual([]);
  const missed = duel(), one = actor(missed, 'one');
  missed.shoot('one', one, { x: 0, y: 1, z: 0 }, 0);
  for (let t = 0; t < .4; t += .02) missed.step(.02);
  expect(missed.snapshot().impacts).toEqual([]);
});

it('does not publish blood or a damage marker for a deflection, and keeps normal wounds', () => {
  const arena = duel(true);
  let deflections = 0, wounds = 0;
  for (let i = 0; i < 30; i++) {
    arena.setPlayerVitals('two', { health: 100, armor: 40 });
    const previous = new Set(arena.snapshot().impacts!.map(e => e.id));
    const hit = fire(arena);
    const fresh = arena.snapshot().impacts!.filter(e => !previous.has(e.id));
    if (hit.damage === 0) {
      deflections++; expect(fresh).toEqual([]); expect(mergeHits([hit])).toBeNull();
    } else { wounds++; expect(fresh).toHaveLength(1); }
    for (let t = 0; t < .3; t += .1) arena.step(.1);
  }
  expect(deflections).toBeGreaterThan(0); expect(wounds).toBeGreaterThan(0);
});

const event: ConfirmedImpact = { id: 1, time: .1, victim: 'two', point: { x: 0, y: 1, z: 0 }, direction: { x: 1, y: 0, z: 0 }, calibre: 5.56, power: 36 };
it('plays confirmed wounds once across repeated snapshots and discards stale history', () => {
  const seen = new Set<number>();
  expect(takeConfirmedImpacts([event], seen, .2)).toEqual([event]);
  expect(takeConfirmedImpacts([event], seen, .3)).toEqual([]);
  expect(takeConfirmedImpacts([{ ...event, id: 2 }], seen, 5)).toEqual([]);
  takeConfirmedImpacts([], seen, 5); expect(seen.size).toBe(0);
});

it('rejects malformed, repeated and stale network wound events', () => {
  const snapshot = duel().snapshot(); snapshot.elapsed = .2;
  expect(validArenaSnapshot({ ...snapshot, impacts: [event] })).toBe(true);
  for (const bad of [{ ...event, point: { ...event.point, x: NaN } }, { ...event, direction: { x: 0, y: 0, z: 0 } }, { ...event, power: 0 }, { ...event, time: .3 }, { ...event, id: -1 }])
    expect(validArenaSnapshot({ ...snapshot, impacts: [bad] })).toBe(false);
  expect(validArenaSnapshot({ ...snapshot, impacts: [event, event] })).toBe(false);
  expect(validArenaSnapshot({ ...snapshot, elapsed: 5, impacts: [event] })).toBe(false);
});
