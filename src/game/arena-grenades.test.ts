import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createArena, type ArenaSimulation, type ArenaEnvironment, type ArenaInput } from './arena-rules';
import { validArenaSnapshot, createArenaRuntime } from './arena-runtime';
import { createProfile } from './armory-state';
import type { LanSession } from './lan-peer';
import { itemById } from './armory-catalog';
const environment: ArenaEnvironment = { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), spawns: [{ x: 0, z: 0 }, { x: 0, z: 3 }], endless: true };
const actor = (a: ArenaSimulation, id: string) => a.snapshot().actors.find(m => m.id === id)!;
const advance = (a: ArenaSimulation, seconds: number) => { for (let left = seconds; left > 1e-8; left -= .05) a.step(Math.min(.05, left)); };
function pair() { const a = createArena([], 0, 'mixed', environment); a.addPlayer('a', 'Alpha'); a.addPlayer('b', 'Bravo', 100, .8); return a; }
function input(a: ArenaSimulation, id: string, grenade: string, cooked = itemById(grenade)!.grenade!.fuse) { const m = actor(a, id); return { id: grenade, origin: { x: m.x, y: m.y - .15, z: m.z }, direction: { x: 0, y: 0, z: -1 }, under: false, cooked }; }
describe('host-owned grenades', () => {
  it('requires brought stock, a living thrower, a real hand origin and the host cadence', () => {
    const a = pair(), frag = input(a, 'a', 'grenade-frag');
    expect(a.throwGrenade('a', frag)).toBe(false);
    a.setPlayerGrenades('a', { 'grenade-frag': 4, 'grenade-smoke': 1 });
    expect(a.throwGrenade('a', { ...frag, origin: { ...frag.origin, x: 99 } })).toBe(false);
    expect(a.throwGrenade('a', { ...frag, cooked: Infinity })).toBe(false);
    expect(a.throwGrenade('a', { ...frag, direction: { x: 0, y: 0, z: -100 } })).toBe(false);
    expect(a.throwGrenade('a', { ...frag, cooked: 0 })).toBe(true);
    expect(a.throwGrenade('a', input(a, 'a', 'grenade-smoke', 0))).toBe(false);
    a.setPlayerVitals('a', { health: 0 }); expect(a.throwGrenade('a', frag)).toBe(false);
  });
  it('hurts the thrower, pierces plates only for the shred share, and credits kills', () => {
    const a = pair(); a.setPlayerGrenades('a', { 'grenade-durian': 1 });
    a.setPlayerVitals('b', { health: 20 });
    expect(a.throwGrenade('a', input(a, 'a', 'grenade-durian'))).toBe(true); advance(a, .02);
    expect(actor(a, 'a').health).toBeLessThan(100); expect(actor(a, 'b').alive).toBe(false);
    expect(actor(a, 'a').kills).toBe(1); expect(a.snapshot().feed.at(-1)?.killerId).toBe('a');
  });
  it('protects the thrower\'s other mercenaries while still hurting the thrower', () => {
    const a = createArena([], 2, 'assault', environment), first = actor(a, 'bot-1'), second = actor(a, 'bot-2');
    expect(first.grenade).toBe('grenade-frag');
    expect(a.throwGrenade('bot-1', input(a, 'bot-1', 'grenade-frag'))).toBe(true); advance(a, .02);
    expect(actor(a, 'bot-1').health).toBeLessThan(first.health); expect(actor(a, 'bot-2').health).toBe(second.health);
    expect(actor(a, 'bot-1').grenade).toBeUndefined();
  });
  it('does not refill a player\'s grenades or reset the mission cooldown on respawn', () => {
    const a = pair(); a.setPlayerGrenades('a', { 'grenade-smoke': 1 });
    expect(a.throwGrenade('a', input(a, 'a', 'grenade-smoke'))).toBe(true);
    a.setPlayerVitals('a', { health: 0 }); advance(a, 3.1);
    expect(actor(a, 'a').alive).toBe(true); expect(a.throwGrenade('a', input(a, 'a', 'grenade-smoke'))).toBe(false);
    a.reset(); expect(a.throwGrenade('a', input(a, 'a', 'grenade-smoke'))).toBe(true);
  });
  it('runs the half-duration human stun and freezes authoritative movement/fire at attention', () => {
    const a = pair(); a.setPlayerGrenades('a', { 'grenade-whistle': 1 });
    expect(a.throwGrenade('a', input(a, 'a', 'grenade-whistle'))).toBe(true); advance(a, .02);
    const b = actor(a, 'b'); expect(b.conditions?.['at-attention']?.remaining).toBe(1.75); expect(b.conditions?.deafened?.remaining).toBe(6);
    a.setInput('b', { ...b, x: b.x + 1, playing: true }); expect(actor(a, 'b').x).toBe(b.x);
    expect(a.shoot('b', b, { x: 0, y: 0, z: -1 }, 0).hitId).toBeNull();
    expect(actor(a, 'a').food?.steady).toMatchObject({ strength: .2 }); expect(actor(a, 'a').conditions).toBeUndefined();
    advance(a, 1.8); expect(actor(a, 'b').conditions?.['at-attention']).toBeUndefined();
  });
  it('keeps lingering smell conditions after leaving, and gas goes through armor', () => {
    const a = pair(); a.setPlayerGrenades('a', { 'grenade-sambal': 1 });
    a.throwGrenade('a', input(a, 'a', 'grenade-sambal')); advance(a, 1);
    expect(actor(a, 'b').health).toBeCloseTo(95); expect(actor(a, 'b').armor).toBe(100);
    expect(actor(a, 'b').conditions?.['streaming-eyes']?.remaining).toBe(6);
    const b = actor(a, 'b'); a.setInput('b', { ...b, x: 8, z: b.z, playing: true }); a.step(.2);
    a.setInput('b', { ...actor(a, 'b'), x: 15, playing: true }); a.step(.2);
    a.setInput('b', { ...actor(a, 'b'), x: 22, playing: true }); a.step(.2);
    const health = actor(a, 'b').health; advance(a, 1);
    expect(actor(a, 'b').health).toBe(health); expect(actor(a, 'b').conditions?.['streaming-eyes']?.remaining).toBeLessThan(6);
  });
  it('publishes team reveals and enforces a 60 second fire-mission cooldown', () => {
    const a = pair(); a.setPlayerHealthMultiplier('a', 10); a.setPlayerHealthMultiplier('b', 10);
    a.setPlayerGrenades('a', { 'grenade-red-smoke': 4 });
    expect(a.throwGrenade('a', input(a, 'a', 'grenade-red-smoke'))).toBe(true); advance(a, .02);
    expect(actor(a, 'b').markedBy).toEqual(['a']);
    advance(a, 1); expect(a.throwGrenade('a', input(a, 'a', 'grenade-red-smoke'))).toBe(false);
    const before = actor(a, 'b').health; advance(a, 6); expect(actor(a, 'b').health).toBe(before);
    advance(a, 54); expect(a.throwGrenade('a', input(a, 'a', 'grenade-red-smoke'))).toBe(true);
  });
  it('rejects malformed grenade snapshots and detaches past condition snapshots', () => {
    const a = pair(); a.setPlayerGrenades('a', { 'grenade-stun': 1 }); a.throwGrenade('a', input(a, 'a', 'grenade-stun', 0));
    const live = a.snapshot(); expect(validArenaSnapshot(live, environment)).toBe(true);
    expect(validArenaSnapshot({ ...live, grenades: Array(25).fill(live.grenades![0]) }, environment)).toBe(false);
    expect(validArenaSnapshot({ ...live, grenades: [{ ...live.grenades![0], remaining: NaN }] }, environment)).toBe(false);
    advance(a, 1.6); const snapshot = a.snapshot(); expect(validArenaSnapshot(snapshot, environment)).toBe(true);
    expect(validArenaSnapshot({ ...snapshot, grenadeEvents: [{ ...snapshot.grenadeEvents![0], id: 'fake' }] }, environment)).toBe(false);
    a.setPlayerGrenades('a', { 'grenade-stun': 1 }); a.throwGrenade('a', input(a, 'a', 'grenade-stun')); advance(a, .02);
    const old = a.snapshot(), remaining = old.actors[1].conditions?.deafened?.remaining; advance(a, .1);
    expect(old.actors[1].conditions?.deafened?.remaining).toBe(remaining);
  });
});
function sessions() {
  const listeners = [new Set<(id: string, p: unknown) => void>(), new Set<(id: string, p: unknown) => void>()];
  return [0, 1].map((n): LanSession => ({ id: n ? 'guest' : 'host', name: n ? 'Guest' : 'Host', role: n ? 'guest' : 'host', getPeers: () => [{ id: n ? 'host' : 'guest', name: 'Other' }], onPeers: () => () => {}, subscribe(cb) { listeners[n].add(cb); return () => { listeners[n].delete(cb); }; }, send(p) { for (const cb of listeners[1 - n]) cb(n ? 'guest' : 'host', JSON.parse(JSON.stringify(p))); }, close() {} }));
}
afterEach(() => vi.useRealTimers());
it('replicates a guest throw and refuses a second unbrought grenade through the real runtime', () => {
  vi.useFakeTimers(); const [hostSession, guestSession] = sessions(), profile = createProfile(); profile.consumables = { 'grenade-smoke': 1 };
  const host = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: hostSession });
  const guest = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: guestSession, profile });
  const pos: ArenaInput = { x: -44, y: 1.75, z: 68, yaw: 0, pitch: 0, weapon: 0, playing: true };
  try {
    host.update(.1, { ...pos, playing: false }); host.update(.1, pos);
    const joined = guest.update(.1, { ...pos, playing: false }).self!; expect(joined).toBeTruthy();
    guest.update(.1, { ...joined, playing: true });
    const grenade = { id: 'grenade-smoke', origin: { x: joined.x, y: joined.y, z: joined.z }, direction: { x: 0, y: 0, z: -1 }, cooked: 0, under: false };
    const accepted = vi.fn(); expect(guest.throwGrenade(grenade, accepted)).toBe(true); expect(accepted).toHaveBeenCalledWith(true); vi.advanceTimersByTime(100);
    expect(guest.update(.1, { ...joined, playing: true }).snapshot?.grenades).toHaveLength(1);
    vi.advanceTimersByTime(1000); const refused = vi.fn(); guest.throwGrenade(grenade, refused); expect(refused).toHaveBeenCalledWith(false); vi.advanceTimersByTime(100);
    const snapshot = guest.update(.1, { ...joined, playing: true }).snapshot!; expect(snapshot.grenades).toHaveLength(1); expect(validArenaSnapshot(snapshot)).toBe(true);
    vi.advanceTimersByTime(1000); expect(guest.update(.1, { ...joined, playing: true }).snapshot?.grenadeEvents).toHaveLength(1);
  } finally { host.dispose(); guest.dispose(); }
});

it('treats a shredding blast as one hit for Ah Ma, and clears disconnected ordnance', () => {
 const a = pair(); a.setPlayerGrenades('a', { 'grenade-durian': 1 }); a.useSupply('b', 'food-ah-ma-tingkat'); a.setPlayerVitals('b', { health: 5 });
 a.throwGrenade('a', input(a, 'a', 'grenade-durian')); advance(a, .02);
 expect(actor(a, 'b').alive).toBe(true); expect(actor(a, 'b').ahMaSaves).toBe(1); expect(actor(a, 'b').health).toBeGreaterThanOrEqual(35);
 a.removePlayer('a'); expect(a.snapshot().grenadeEvents).toHaveLength(0);
});
it('shelters from 80% of finale embers and withholds a sky-only rally under a roof', () => {
 const roof = createArena([], 0, 'mixed', environment, undefined, undefined, (_p, d, length) => d.y > .9 ? 2 : length);
 roof.addPlayer('a', 'Alpha'); roof.setPlayerGrenades('a', { 'grenade-finale': 1 });
 roof.throwGrenade('a', input(roof, 'a', 'grenade-finale')); advance(roof, 1);
 expect(actor(roof, 'a').health).toBeCloseTo(98.8); expect(actor(roof, 'a').food?.['fired-up']).toBeUndefined();
});

it('lets a live fuse expire in the hands of a frozen player', () => {
 const a = pair(); a.setPlayerGrenades('a', { 'grenade-whistle': 1 }); a.setPlayerGrenades('b', { 'grenade-frag': 1 });
 a.throwGrenade('a', input(a, 'a', 'grenade-whistle')); advance(a, .02);
 expect(a.throwGrenade('b', input(a, 'b', 'grenade-frag', 0))).toBe(false);
 expect(a.throwGrenade('b', input(a, 'b', 'grenade-frag'))).toBe(true); advance(a, .02);
 expect(actor(a, 'b').health).toBeLessThan(100);
});
it('has an assault bot throw its carried frag at a recently covered contact', () => {
 let blocked = false;
 const arena = createArena([], 1, 'assault', { ...environment, spawns: [{ x: 0, z: 0 }, { x: 0, z: 10 }] }, undefined, undefined,
   (_from, direction, distance) => blocked && Math.abs(direction.y) < .3 ? Math.min(1, distance) : distance);
 arena.addPlayer('player', 'Contact'); advance(arena, .5);
 expect(actor(arena, 'bot-1').grenade).toBe('grenade-frag');
 blocked = true; advance(arena, .3);
 expect(arena.snapshot().grenades?.some(g => g.id === 'grenade-frag' && g.caller === 'bot-1')).toBe(true);
 expect(actor(arena, 'bot-1').grenade).toBeUndefined();
});
