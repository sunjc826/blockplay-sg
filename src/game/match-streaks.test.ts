import { describe, expect, it, vi } from 'vitest';
import { createMatchStreaks, defaultStreaks, validStreakLoadout, validStreakSnapshot, type StreakId, type StreakMode } from './match-streaks';
import type { ArenaActor } from './arena-rules';
import { streakReconMarkers, streakReconPulse } from './match-streak-visuals';

function setup(mode: StreakMode = 'team-deathmatch') {
  const actor = (id: string, team: 'alpha' | 'bravo', x: number, z: number): ArenaActor => ({ id, name: id, bot: false, x, y: 1.75, z, yaw: 0, pitch: 0, health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: 0, shots: 0, role: 'player', faction: team === 'alpha' ? 'armed-forces' : 'mercenaries', ...(mode === 'free-for-all' ? {} : { team }) });
  const a = actor('a', 'alpha', 0, 0), b = actor('b', 'bravo', 0, -10), ally = actor('ally', 'alpha', 3, 0), actors = [a, b, ally];
  let clear = true, shield = false, droneAlive = true;
  const damage = vi.fn(), strike = vi.fn(), removeDrone = vi.fn(), drone = vi.fn(() => 'event-1');
  const system = createMatchStreaks(mode, { actors: () => actors, protected: () => shield, clear: () => clear, damage, strike, drone, droneAlive: () => droneAlive, removeDrone, notice: vi.fn() });
  const earn = (id: StreakId, who = a) => { system.configure(who.id, [...new Set([id, 'recon', 'hunter', 'strike'])].slice(0, 3)); for (let i = 0; i < 7; i++) system.kill(who, who === b ? a : b, false, false); };
  return { a, b, ally, actors, system, earn, damage, strike, drone, removeDrone, setClear: (v: boolean) => clear = v, setShield: (v: boolean) => shield = v, endDrone: () => droneAlive = false };
}
it('requires three unique mode-legal rewards and chooses objective defaults', () => {
  expect(defaultStreaks('hardpoint')).toEqual(['recon', 'interceptor', 'strike']);
  expect(validStreakLoadout(['recon', 'recon', 'hunter'], 'team-deathmatch')).toBe(false);
  expect(validStreakLoadout(['recon', 'sentry', 'hunter'], 'free-for-all')).toBe(false);
  expect(validStreakLoadout(['__proto__', 'strike', 'hunter'], 'free-for-all')).toBe(false);
});
it('banks once per slot, does not loop, resets progress on death, and does not chain streak kills', () => {
  const { system: s, a, b } = setup();
  for (let i = 0; i < 3; i++) s.kill(a, b, false, false);
  expect(s.state(a.id)).toMatchObject({ charge: 300, ready: ['recon'], earned: ['recon'] });
  s.kill(a, b, false, true); expect(s.state(a.id).charge).toBe(300);
  s.death(a.id); expect(s.state(a.id)).toMatchObject({ charge: 0, ready: ['recon'], earned: [] });
  for (let i = 0; i < 20; i++) s.kill(a, b, false, false);
  expect(s.state(a.id).ready).toEqual(['recon', 'hunter', 'strike']);
  expect(s.activate(a, 'recon', a, 0)).toBe(true); s.step(16);
  s.kill(a, b, false, false); expect(s.state(a.id).ready).not.toContain('recon');
  s.death(a.id); for (let i = 0; i < 3; i++) s.kill(a, b, false, false);
  expect(s.state(a.id).ready).toContain('recon');
});
it('does not reward friendly kills, suicides, or pure objective holding beyond 200', () => {
  const { system: s, a, b, ally } = setup('hardpoint');
  s.kill(a, ally, true, false); s.kill(a, a, true, false); expect(s.state(a.id).charge).toBe(0);
  s.kill(a, b, true, false); s.hold(a.id, 17.5);
  expect(s.state(a.id)).toMatchObject({ charge: 300, heldCharge: 175, ready: ['recon'] });
  s.hold(a.id, 100); expect(s.state(a.id).charge).toBe(325);
  s.death(a.id); s.hold(a.id, 200); expect(s.state(a.id).charge).toBe(200);
});
it('blocks simultaneous team rewards without spending the second charge; FFA ownership is private', () => {
  for (const mode of ['team-deathmatch', 'free-for-all'] as const) {
    const { system: s, a, ally, earn } = setup(mode); earn('recon'); earn('recon', ally);
    expect(s.activate(a, 'recon', a, 0)).toBe(true);
    expect(s.activate(ally, 'recon', ally, 0)).toBe(mode === 'free-for-all');
    if (mode !== 'free-for-all') expect(s.state(ally.id).ready).toContain('recon');
  }
});
it('pulses last-known positions, respects shields, expires at 10s in FFA and shares only with teammates', () => {
  const { system: s, a, b, ally, actors, earn, setShield } = setup('free-for-all'); earn('recon'); s.activate(a, 'recon', a, 0); s.step(0);
  b.x = 20; s.step(1);
  expect(s.effects[0].contacts.find(c => c.id === 'b')?.x).toBe(0);
  expect(streakReconMarkers(s.snapshot(), actors, a)).toHaveLength(2);
  expect(streakReconMarkers(s.snapshot(), actors, ally)).toHaveLength(0);
  s.step(3); expect(s.effects[0].contacts.find(c => c.id === 'b')?.x).toBe(20);
  setShield(true); s.step(6); expect(s.effects[0].contacts).toEqual([]);
  s.step(10); expect(s.effects).toEqual([]);
});
it('jamming blocks recon without removing objective or visual contact data', () => {
  const { system: s, a, b, actors, earn } = setup(); earn('recon'); earn('jammer', b);
  s.activate(a, 'recon', a, 0); s.step(0); expect(streakReconMarkers(s.snapshot(), actors, a)).toHaveLength(1);
  s.activate(b, 'jammer', b, 0); expect(streakReconMarkers(s.snapshot(), actors, a)).toEqual([]);
  s.hurt(s.effects.find(e => e.kind === 'jammer')!, 100, a);
  expect(streakReconMarkers(s.snapshot(), actors, a)).toHaveLength(1);
});
it('intercepts only enemy grenades in range and line of sight, at most three', () => {
  const { system: s, a, b, ally, earn, setClear } = setup(); earn('interceptor'); s.activate(a, 'interceptor', a, 0);
  expect(s.intercept(ally.id, a)).toBe(false); expect(s.intercept(b.id, b)).toBe(false);
  setClear(false); expect(s.intercept(b.id, a)).toBe(false); setClear(true);
  for (let i = 0; i < 3; i++) expect(s.intercept(b.id, a)).toBe(true);
  expect(s.intercept(b.id, a)).toBe(false); expect(s.effects).toEqual([]);
});
it('sentries acquire for .75s, obey their arc and smoke, and never target protected allies', () => {
  const { system: s, a, b, damage, earn, setClear, setShield } = setup(); earn('sentry'); s.activate(a, 'sentry', a, 0);
  s.step(0); s.step(.74); expect(damage).not.toHaveBeenCalled(); s.step(.75); expect(damage).toHaveBeenCalledTimes(1);
  expect(damage.mock.calls[0][1]).toBe(b);
  setClear(false); s.step(1); s.step(2); expect(damage).toHaveBeenCalledTimes(1);
  setClear(true); b.z = 10; s.step(3); s.step(4); expect(damage).toHaveBeenCalledTimes(1);
  b.z = -10; setShield(true); s.step(5); s.step(6); expect(damage).toHaveBeenCalledTimes(1);
  setShield(false); s.step(7); s.step(7.75); expect(damage).toHaveBeenCalledTimes(2);
});
it('precision strike resolves once after its warning; disconnect removes pending attacks', () => {
  const { system: s, a, earn, strike } = setup(); earn('strike'); s.activate(a, 'strike', a, 0);
  s.step(2.99); expect(strike).not.toHaveBeenCalled(); s.step(3); s.step(4); expect(strike).toHaveBeenCalledTimes(1);
  s.death(a.id); earn('strike'); s.activate(a, 'strike', a, 5); s.removePlayer(a.id); s.step(10); expect(strike).toHaveBeenCalledTimes(1);
});
it('hands Hunter Drone to existing drone logic without a locked target; removes it on expiry', () => {
  const { system: s, a, earn, drone, removeDrone, endDrone } = setup(); earn('hunter');
  expect(s.activate(a, 'hunter', { x: 0, y: 2, z: -30 }, 0)).toBe(true);
  expect(drone).toHaveBeenCalledOnce(); expect(s.effects[0].event).toBe('event-1');
  endDrone(); s.step(1); expect(s.effects).toEqual([]); expect(removeDrone).toHaveBeenCalledWith('event-1');
});
it('clears match progress and pending attacks on reset while retaining selected loadout', () => {
  const { system: s, a, earn } = setup(); earn('jammer'); s.activate(a, 'jammer', a, 0); const loadout = [...s.state(a.id).loadout];
  s.reset(); expect(s.effects).toEqual([]); expect(s.state(a.id)).toEqual({ loadout, charge: 0, heldCharge: 0, ready: [], earned: [] });
});
describe('network snapshot validation', () => {
  it('accepts genuine snapshots and does not expose internal mutable state', () => {
    const { system: s, a, actors, earn } = setup(); earn('recon'); s.activate(a, 'recon', a, 0); s.step(0);
    const snapshot = s.snapshot(); expect(validStreakSnapshot(snapshot, actors, 'team-deathmatch', 0)).toBe(true);
    snapshot.players.a.ready.push('sentry'); snapshot.effects[0].contacts[0].x = 999;
    expect(s.snapshot().players.a.ready).not.toContain('sentry'); expect(s.snapshot().effects[0].contacts[0].x).not.toBe(999);
  });
  it.each([null, {}, { players: {}, effects: [null] }])('rejects malformed state %j', value => {
    expect(validStreakSnapshot(value, setup().actors, 'team-deathmatch', 0)).toBe(false);
  });
  it('rejects forged charges, duplicate rewards and foreign owners', () => {
    const { system: s, a, actors, earn } = setup(); earn('recon'); s.activate(a, 'recon', a, 0);
    for (const change of [(v: ReturnType<typeof s.snapshot>) => v.players.a.charge = Infinity, (v: ReturnType<typeof s.snapshot>) => v.players.a.loadout = ['recon','recon','strike'], (v: ReturnType<typeof s.snapshot>) => v.effects[0].owner = 'intruder']) {
      const snap = s.snapshot(); change(snap); expect(validStreakSnapshot(snap, actors, 'team-deathmatch', 0)).toBe(false);
    }
  });
});

it('synchronizes friendly Recon sweeps with scans, including empty scans and late viewers', () => {
  const { system: s, a, b, ally, actors, earn, setShield } = setup();
  expect(streakReconPulse(s.snapshot(), actors, a, 0)).toBeUndefined();
  earn('recon'); s.activate(a, 'recon', a, 0);
  expect(streakReconPulse(s.snapshot(), actors, a, 0)).toBeUndefined();
  setShield(true); s.step(0);
  expect(s.effects[0].contacts).toEqual([]);
  const first = streakReconPulse(s.snapshot(), actors, a, 0)!;
  expect(first).toMatchObject({ at: 0, age: 0 });
  expect(streakReconPulse(s.snapshot(), actors, ally, 1.2)).toEqual({ ...first, age: 1.2 });
  expect(streakReconPulse(s.snapshot(), actors, b, 1.2)).toBeUndefined();
  s.step(3); expect(streakReconPulse(s.snapshot(), actors, a, 3)).toEqual({ ...first, at: 3 });
  a.alive = false; expect(streakReconPulse(s.snapshot(), actors, a, 3)).toBeUndefined();
  a.alive = true; expect(streakReconPulse(s.snapshot(), actors, a, 15)).toBeUndefined();
  s.hurt(s.effects[0], 100, b); expect(streakReconPulse(s.snapshot(), actors, ally, 3)).toBeUndefined();
});
it('suppresses Recon sweeps in an enemy jammer and keeps FFA scans private', () => {
  const { system: s, a, b, actors, earn } = setup(); earn('recon'); earn('jammer', b);
  s.activate(a, 'recon', a, 0); s.step(0); s.activate(b, 'jammer', b, 0);
  expect(streakReconPulse(s.snapshot(), actors, a, 0)).toBeUndefined();
  a.x = 40; expect(streakReconPulse(s.snapshot(), actors, a, 0)).toBeDefined();
  a.x = 0; s.hurt(s.effects.find(e => e.kind === 'jammer')!, 100, a);
  expect(streakReconPulse(s.snapshot(), actors, a, 0)).toBeDefined();
  const ffa = setup('free-for-all'); ffa.earn('recon'); ffa.system.activate(ffa.a, 'recon', ffa.a, 0); ffa.system.step(0);
  expect(streakReconPulse(ffa.system.snapshot(), ffa.actors, ffa.ally, 0)).toBeUndefined();
  expect(streakReconPulse(ffa.system.snapshot(), ffa.actors, ffa.a, 10)).toBeUndefined();
});
