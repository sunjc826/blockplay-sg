import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArena, type ArenaActor, type ArenaInput, type ArenaSimulation } from './arena-rules';
import { createArenaRuntime, validArenaSnapshot } from './arena-runtime';
import { createProfile } from './armory-state';
import type { LanSession } from './lan-peer';
import { shootAndLand } from './arena-test-shots';

// In an arena the host, not the eater's engine, heals, runs the meal and lands
// the rounds, so food works the same for a solo player, the host and a guest.
const weapon = { damage: 36, interval: 0.12, capacity: 30, reload: 1.8 };
const actor = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
function aim(shooter: ArenaActor, victim: ArenaActor) {
  const x = victim.x - shooter.x, y = victim.y - 0.6 - shooter.y, z = victim.z - shooter.z, length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}
const fireAt = (arena: ArenaSimulation, from = 'one', to = 'two') => {
  const shooter = actor(arena, from);
  return shootAndLand(arena, from, shooter, aim(shooter, actor(arena, to)), shooter.weapon);
};
/** `step` takes at most a quarter second at a time. */
function advance(arena: ArenaSimulation, seconds: number) { for (let left = seconds; left > 1e-8; left -= .1) arena.step(Math.min(.1, left)); }
function pair(damage = 36) {
  const arena = createArena([], 0);
  arena.addPlayer('one', 'Alpha', 0, 0, [{ ...weapon, damage }]);
  arena.addPlayer('two', 'Bravo', 0, 0, [weapon]);
  return arena;
}
afterEach(() => vi.useRealTimers());

describe('meals in the arena simulation', () => {
  it('hits harder for a fired-up shooter and softer on a numb target', () => {
    const arena = pair();
    expect(arena.useSupply('one', 'food-mala-da-la')).toBe(true);
    expect(fireAt(arena).damage).toBeCloseTo(40.32);
    arena.step(1);
    expect(arena.useSupply('two', 'food-mala-da-la')).toBe(true);
    expect(fireAt(arena).damage).toBeCloseTo(40.32 * .8);
  });
  it('heals, runs the timers and publishes them, then ends them on a kill', () => {
    const arena = pair(100);
    arena.setPlayerVitals('two', { health: 10 });
    arena.useSupply('two', 'food-chicken-rice');
    expect(actor(arena, 'two').health).toBe(70);
    expect(actor(arena, 'two').food).toMatchObject({ 'well-fed': { strength: 1, remaining: 40 }, energised: { remaining: 90 } });
    for (let i = 0; i < 10; i++) arena.step(.1);
    expect(actor(arena, 'two').health).toBeCloseTo(71);
    expect(actor(arena, 'two').food!['well-fed']!.remaining).toBeCloseTo(39);
    expect(fireAt(arena).killed).toBe(true);
    expect(actor(arena, 'two').food).toBeUndefined();
  });
  it('keeps a player up once on Ah Ma\'s figure, and counts the save', () => {
    const arena = pair(100);
    arena.useSupply('two', 'food-ah-ma-tingkat');
    expect(fireAt(arena).killed).toBe(false);
    // A shade over 35: the tingkat's healing carries on while the round is in the air.
    expect(actor(arena, 'two')).toMatchObject({ alive: true, ahMaSaves: 1 });
    expect(actor(arena, 'two').health).toBeCloseTo(35, 0);
    expect(actor(arena, 'two').food!['ah-ma']).toBeUndefined();
    arena.step(1);
    expect(fireAt(arena).killed).toBe(true);
  });
  it('spends a guest\'s own supplies, refuses what they lack, and refuses hands faster than real ones', () => {
    const arena = pair();
    arena.setPlayerSupplies('two', { 'kit-bandage': 2, 'food-kaya-toast': 99, 'not-an-item': 3, 'rig-lbs': 1 });
    arena.setPlayerVitals('two', { health: 20 });
    expect(arena.useSupply('two', 'kit-first-aid')).toBe(false);
    expect(arena.useSupply('two', 'kit-bandage')).toBe(true);
    expect(arena.useSupply('two', 'kit-bandage')).toBe(false);
    advance(arena, 2.5);
    expect(arena.useSupply('two', 'kit-bandage')).toBe(true);
    advance(arena, 2.5);
    expect(arena.useSupply('two', 'kit-bandage')).toBe(false);
    expect(actor(arena, 'two').health).toBe(70);
    for (let i = 0; i < 9; i++) { expect(arena.useSupply('two', 'food-kaya-toast')).toBe(true); advance(arena, 2); }
    expect(arena.useSupply('two', 'food-kaya-toast')).toBe(false);
    expect(arena.useSupply('two', 'rig-lbs')).toBe(false);
  });
  it('refills armor only up to the inserts worn', () => {
    const arena = createArena([], 0);
    arena.addPlayer('one', 'Alpha', 45, .5, [weapon]);
    arena.setPlayerVitals('one', { armor: 10 });
    arena.useSupply('one', 'kit-trauma');
    expect(actor(arena, 'one')).toMatchObject({ health: 100, armor: 45 });
  });
  it('shows a player using a supply to everyone else', () => {
    const arena = pair();
    const two = actor(arena, 'two');
    arena.setInput('two', { ...two, weapon: two.weapon, playing: true, supply: .4 });
    expect(actor(arena, 'two').healing).toBe(.4);
    arena.setInput('two', { ...two, weapon: two.weapon, playing: true });
    expect(actor(arena, 'two').healing).toBeUndefined();
  });
});

function localPair() {
  const handlers = [new Set<(from: string, packet: unknown) => void>(), new Set<(from: string, packet: unknown) => void>()];
  return [0, 1].map((index): LanSession => ({
    id: index ? 'guest' : 'host', role: index ? 'guest' : 'host', name: index ? 'Guest' : 'Host',
    send(payload: unknown) { for (const callback of handlers[1 - index]) callback(index ? 'guest' : 'host', JSON.parse(JSON.stringify(payload))); },
    subscribe(callback) { handlers[index].add(callback); return () => { handlers[index].delete(callback); }; },
    getPeers: () => [{ id: index ? 'host' : 'guest', name: index ? 'Host' : 'Guest' }], onPeers: () => () => {}, close() {},
  }));
}
const input = (x = -44, z = 68, playing = false): ArenaInput => ({ x, y: 1.75, z, yaw: 0, pitch: 0, weapon: 0, playing });

describe('meals across a shared arena', () => {
  it('lets a guest eat on the host\'s rules and shows the meal back to the guest', () => {
    vi.useFakeTimers();
    const [hostSession, guestSession] = localPair();
    const host = createArenaRuntime({ scene: new THREE.Scene(), session: hostSession, obstacles: [], botCount: 0 });
    const guest = createArenaRuntime({ scene: new THREE.Scene(), session: guestSession, obstacles: [], botCount: 0,
      profile: { ...createProfile(), consumables: { 'food-smoking-corner': 1 } } });
    try {
      host.update(0.02, input()); host.update(0.02, input(-44, 68, true));
      const joined = guest.update(0.02, input()).self!;
      guest.update(0.02, input(joined.x, joined.z, true));
      guest.useSupply('food-smoking-corner');
      vi.advanceTimersByTime(200);
      const fed = guest.update(0.02, input(joined.x, joined.z, true)).self!;
      expect(Object.keys(fed.food ?? {}).sort()).toEqual(['energised', 'steady', 'well-fed', 'wired']);
      // The second one was never brought, so the host does not serve it.
      vi.advanceTimersByTime(8000);
      guest.useSupply('food-smoking-corner');
      vi.advanceTimersByTime(200);
      const after = guest.update(0.02, input(joined.x, joined.z, true)).self!;
      expect(after.food?.wired?.remaining).toBeLessThan(175);
      // The host's own player eats through the same path, uncounted: its engine counts its belt.
      host.useSupply('food-curry-puff');
      expect(host.update(0.02, input(-44, 68, true)).self?.food?.energised).toMatchObject({ strength: .05 });
    } finally { host.dispose(); guest.dispose(); }
  });
  it('accepts a published meal and rejects an invented one', () => {
    const arena = pair(); arena.useSupply('two', 'food-bak-kut-teh');
    const snapshot = arena.snapshot();
    expect(validArenaSnapshot(snapshot)).toBe(true);
    const two = snapshot.actors.find(a => a.id === 'two')!;
    expect(validArenaSnapshot({ ...snapshot, actors: [{ ...two, food: { invincible: { strength: 1, remaining: 9, seconds: 9 } } }] })).toBe(false);
    expect(validArenaSnapshot({ ...snapshot, actors: [{ ...two, food: { numb: { strength: 1, remaining: 1e6, seconds: 9 } } }] })).toBe(false);
  });
});
