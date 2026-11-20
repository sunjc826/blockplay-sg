import { describe, expect, it, vi } from 'vitest';
import { BARRAGE, GUNSHIP, STREAKS, barrageDamage, barragePoints, createMatchStreaks, defaultStreaks, orderStreaks, randomStreaks, validStreakLoadout, validStreakSnapshot, type StreakId, type StreakMode } from './match-streaks';
import type { ArenaActor, ArenaRaider } from './arena-rules';
import { streakReconMarkers, streakReconPulse, streakHunterMarkers } from './match-streak-visuals';

function setup(mode: StreakMode = 'team-deathmatch') {
  const actor = (id: string, team: 'alpha' | 'bravo', x: number, z: number): ArenaActor => ({ id, name: id, bot: false, x, y: 1.75, z, yaw: 0, pitch: 0, health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: 0, shots: 0, role: 'player', faction: team === 'alpha' ? 'armed-forces' : 'mercenaries', ...(mode === 'free-for-all' ? {} : { team }) });
  const a = actor('a', 'alpha', 0, 0), b = actor('b', 'bravo', 0, -10), ally = actor('ally', 'alpha', 3, 0), actors = [a, b, ally];
  let clear = true, shield = false, droneAlive = true;
  const damage = vi.fn(), shell = vi.fn(), destroyed = vi.fn(), strike = vi.fn(), removeDrone = vi.fn(), drone = vi.fn(() => 'event-1');
  const system = createMatchStreaks(mode, { actors: () => actors, protected: () => shield, clear: () => clear, damage, strike, shell, destroyed, drone, droneAlive: () => droneAlive, removeDrone, notice: vi.fn() });
  const earn = (id: StreakId, who = a) => { system.configure(who.id, [...new Set([id, 'recon', 'hunter', 'strike'])].slice(0, 3)); for (let i = 0; i < 9; i++) system.kill(who, who === b ? a : b, false, false); };
  return { a, b, ally, actors, system, earn, damage, shell, destroyed, strike, drone, removeDrone, setClear: (v: boolean) => clear = v, setShield: (v: boolean) => shield = v, endDrone: () => droneAlive = false };
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
it.each(['team-deathmatch', 'hardpoint', 'free-for-all'] as const)('serves bots only eligible sampled recon intel in %s', mode => {
  const { system: s, a, b, ally, earn } = setup(mode);
  ally.bot = true; a.bot = true;
  earn('recon'); s.activate(a, 'recon', a, 0);
  expect(s.reconContacts(a, 0)).toEqual([]);
  s.step(0);
  expect(s.reconContacts(b, 0)).toEqual([]);
  expect(s.reconContacts(ally, 0).some(c => c.id === b.id)).toBe(mode !== 'free-for-all');
  b.x = 50;
  const ping = s.reconContacts(a, 1).find(c => c.id === b.id)!;
  expect(ping.x).toBe(0); ping.x = 999;
  expect(s.reconContacts(a, 1).find(c => c.id === b.id)?.x).toBe(0);
  s.step(3); expect(s.reconContacts(a, 3).find(c => c.id === b.id)?.x).toBe(50);
  b.alive = false; expect(s.reconContacts(a, 3).some(c => c.id === b.id)).toBe(false);
  b.alive = true; b.deaths++;
  expect(s.reconContacts(a, 4).some(c => c.id === b.id)).toBe(false);
  s.step(6); expect(s.reconContacts(a, 6).some(c => c.id === b.id)).toBe(true);
  expect(s.reconContacts(a, mode === 'free-for-all' ? 10 : 15)).toEqual([]);
  s.hurt(s.effects[0], 100, b); expect(s.reconContacts(a, 6)).toEqual([]);
});
it('blocks bot recon reception in a jammer, omits jammed targets at the next scan and clears on departure/reset', () => {
  const { system: s, a, b, ally, earn, setShield } = setup();
  earn('recon'); earn('jammer', b); s.activate(a, 'recon', a, 0); s.step(0);
  expect(s.reconContacts(ally, 0)).toHaveLength(1);
  s.activate(b, 'jammer', b, 0); expect(s.reconContacts(ally, 0)).toEqual([]);
  ally.x = 50; expect(s.reconContacts(ally, 1)).toHaveLength(1);
  s.step(3); expect(s.reconContacts(ally, 3)).toEqual([]);
  s.hurt(s.effects.find(e => e.kind === 'jammer')!, 100, a);
  setShield(true); s.step(6); expect(s.reconContacts(ally, 6)).toEqual([]);
  setShield(false); s.step(9); expect(s.reconContacts(ally, 9)).toHaveLength(1);
  s.removePlayer(b.id); expect(s.reconContacts(ally, 9)).toEqual([]);
  s.reset(); expect(s.reconContacts(ally, 9)).toEqual([]);
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

it.each(['team-deathmatch', 'hardpoint', 'free-for-all'] as const)('tracks own and team Hunters at their live position in %s', mode => {
  const {system:s,a,b,ally,actors,earn}=setup(mode); earn('hunter');s.activate(a,'hunter',a,0);
  const drone: ArenaRaider = {event:'event-1',kind:'drone',x:40,y:12,z:50,yaw:0,health:30,maxHealth:30,state:'cruise',aim:null,shots:0};
  const own=streakHunterMarkers(s.snapshot(),[drone],actors,a,1);
  expect(own).toEqual([{id:'hunter-event-1',kind:'hunter',side:'ally',x:40,z:50,label:'Your Hunter Drone'}]);
  expect(streakHunterMarkers(s.snapshot(),[drone],actors,b,1)).toEqual([]);
  const team=streakHunterMarkers(s.snapshot(),[drone],actors,ally,1);
  if(mode==='free-for-all')expect(team).toEqual([]);
  else expect(team[0]).toMatchObject({side:'ally',label:'Friendly Hunter Drone · a'});
  drone.x=65;drone.state='dive';expect(streakHunterMarkers(s.snapshot(),[drone],actors,a,2)[0].x).toBe(65);
});
it('removes Hunter telemetry when the aircraft is destroyed, gone, expired or the viewer is dead',()=>{
  const {system:s,a,b,actors,earn}=setup();earn('hunter');s.activate(a,'hunter',a,0);
  const drone: ArenaRaider={event:'event-1',kind:'drone',x:40,y:12,z:50,yaw:0,health:30,maxHealth:30,state:'cruise',aim:null,shots:0};
  for(const state of ['down','wreck','exploded','landing','landed'] as const)expect(streakHunterMarkers(s.snapshot(),[{...drone,state}],actors,a,1)).toEqual([]);
  expect(streakHunterMarkers(s.snapshot(),[{...drone,health:0}],actors,a,1)).toEqual([]);
  expect(streakHunterMarkers(s.snapshot(),[],actors,a,1)).toEqual([]);
  expect(streakHunterMarkers(s.snapshot(),[drone],actors,a,30)).toEqual([]);
  expect(streakHunterMarkers(undefined,[drone],actors,a,1)).toEqual([]);
  expect(streakHunterMarkers(s.snapshot(),[drone],[b],a,1)).toEqual([]);
  expect(streakHunterMarkers(s.snapshot(),[drone],actors,null,1)).toEqual([]);
  a.alive=false;expect(streakHunterMarkers(s.snapshot(),[drone],actors,a,1)).toEqual([]);
});

describe('bot streak loadouts', () => {
  const stream = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  it('draws three legal rewards, cheapest first, and reaches every combination', () => {
    for (const mode of ['team-deathmatch', 'free-for-all', 'hardpoint'] as StreakMode[]) {
      const random = stream(7), seen = new Set<string>();
      for (let i = 0; i < 4000; i++) { const drawn = randomStreaks(mode, random); expect(validStreakLoadout(drawn, mode)).toBe(true); expect(orderStreaks(drawn)).toEqual(drawn); seen.add(drawn.join()); }
      expect(seen.size).toBe(mode === 'free-for-all' ? 35 : 120);
    }
    expect(randomStreaks('free-for-all', () => .999999)).toHaveLength(3);
  });
  it('gives each bot its own draw and leaves players on the default', () => {
    const actor = (id: string, bot: boolean) => ({ id, name: id, bot, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: 0, shots: 0, role: 'player', faction: 'mercenaries' }) as ArenaActor;
    const actors = [actor('me', false), ...Array.from({ length: 8 }, (_, i) => actor(`bot-${i + 1}`, true))];
    const streaks = createMatchStreaks('team-deathmatch', { actors: () => actors, protected: () => false, clear: () => true, damage: () => {}, strike: () => {}, drone: () => null, droneAlive: () => false, removeDrone: () => {}, notice: () => {}, random: stream(36497) });
    const snapshot = streaks.snapshot();
    expect(snapshot.players.me.loadout).toEqual(defaultStreaks('team-deathmatch'));
    const drawn = actors.slice(1).map(a => snapshot.players[a.id].loadout);
    for (const loadout of drawn) expect(validStreakLoadout(loadout, 'team-deathmatch')).toBe(true);
    expect(new Set(drawn.map(l => l.join())).size).toBeGreaterThan(3);
    expect(streaks.snapshot().players['bot-1'].loadout).toEqual(drawn[0]);
  });
});

describe('added scorestreaks', () => {
  it('keeps the gunship out of free-for-all and prices nothing above the charge cap', () => {
    expect(validStreakLoadout(['recon', 'supply', 'gunship'], 'free-for-all')).toBe(false);
    expect(validStreakLoadout(['supply', 'blackout', 'barrage'], 'free-for-all')).toBe(true);
    expect(validStreakLoadout(['supply', 'barrage', 'gunship'], 'hardpoint')).toBe(true);
    const { system: s, a, b } = setup();
    for (let i = 0; i < 20; i++) s.kill(a, b, false, false);
    expect(s.state(a.id).charge).toBe(Math.max(...Object.values(STREAKS).map(r => r.cost)));
  });
  it('lands a supply crate after three seconds and gives the first to reach it one of their other rewards', () => {
    const { system: s, a, b, earn, actors } = setup();
    earn('supply'); expect(s.state(a.id).ready).toEqual(['recon', 'supply', 'hunter']);
    expect(s.activate(a, 'recon', a, 0)).toBe(true); expect(s.activate(a, 'supply', { x: 0, y: 1.75, z: -10 }, 0)).toBe(true);
    // The enemy is standing on it, but it has not landed.
    s.step(2.9); expect(s.effects.some(e => e.kind === 'supply')).toBe(true);
    s.step(3); expect(s.effects.some(e => e.kind === 'supply')).toBe(false);
    expect(s.state(b.id).ready).toHaveLength(1); expect(s.state(b.id).ready[0]).not.toBe('supply');
    expect(validStreakSnapshot(s.snapshot(), actors, 'team-deathmatch', 3)).toBe(true);
    // The caller collects their own: recon is spent, so it is the only reward open to them.
    s.state(a.id).ready.push('supply'); expect(s.activate(a, 'supply', { x: 0, y: 1.75, z: 0 }, 10)).toBe(true); s.step(13);
    expect(s.state(a.id).ready.sort()).toEqual(['hunter', 'recon']);
    // Nothing left to give: the crate waits out its time and goes.
    s.state(a.id).ready.push('supply'); expect(s.activate(a, 'supply', { x: 0, y: 1.75, z: 0 }, 20)).toBe(true); s.step(24);
    expect(s.effects.some(e => e.kind === 'supply')).toBe(true); s.step(50.1); expect(s.effects).toHaveLength(0);
  });
  it('blackout removes enemy equipment, blinds their recon and stops them deploying until it ends', () => {
    const { system: s, a, b, ally, earn, removeDrone, destroyed } = setup();
    earn('blackout'); earn('strike', b);
    expect(s.activate(b, 'recon', { ...b, y: 6 }, 0)).toBe(true); expect(s.activate(b, 'hunter', b, 0)).toBe(true); expect(s.activate(b, 'strike', { x: 40, y: 1, z: 40 }, 0)).toBe(true);
    s.step(0); expect(s.reconContacts(b, 0).length).toBeGreaterThan(0);
    expect(s.activate(a, 'blackout', a, 1)).toBe(true);
    expect(s.effects.map(e => e.kind).sort()).toEqual(['blackout', 'strike']);
    expect(removeDrone).toHaveBeenCalledWith('event-1'); expect(destroyed).toHaveBeenCalledTimes(2);
    expect(s.jammed(b)).toBe(true); expect(s.jammed(a)).toBe(false); expect(s.jammed(ally)).toBe(false);
    s.state(b.id).ready.push('recon');
    expect(s.activate(b, 'recon', { ...b, y: 6 }, 2)).toBe(false); expect(s.state(b.id).ready).toContain('recon');
    s.step(13.1); expect(s.jammed(b)).toBe(false); expect(s.activate(b, 'recon', { ...b, y: 6 }, 14)).toBe(true);
  });
  it('walks five shells along the caller\'s aim after the warning, each once', () => {
    const { system: s, a, earn, shell, actors } = setup();
    earn('barrage'); a.yaw = Math.PI / 2;
    expect(s.activate(a, 'barrage', { x: -20, y: .4, z: 0 }, 0)).toBe(true);
    s.step(2.9); expect(shell).not.toHaveBeenCalled();
    s.step(3); expect(shell).toHaveBeenCalledTimes(1); s.step(3.1); expect(shell).toHaveBeenCalledTimes(1);
    expect(validStreakSnapshot(s.snapshot(), actors, 'team-deathmatch', 3.1)).toBe(true);
    s.step(5.5); expect(shell).toHaveBeenCalledTimes(BARRAGE.shells);
    expect(shell.mock.calls.map(c => Math.round(c[1].x))).toEqual([-20, -27, -34, -41, -48]);
    expect(barragePoints({ x: 0, y: 0, z: 0, yaw: 0 })[4].z).toBeCloseTo(-28);
    s.step(6); expect(s.effects).toHaveLength(0); expect(shell).toHaveBeenCalledTimes(BARRAGE.shells);
    expect(barrageDamage(0)).toBe(200); expect(barrageDamage(BARRAGE.radius)).toBe(50); expect(barrageDamage(BARRAGE.radius + .1)).toBe(0);
  });
  it('the gunship fires all round on enemies in view, turns to face them, and can be shot down', () => {
    const { system: s, a, b, earn, damage, setClear, destroyed, actors } = setup();
    earn('gunship'); b.x = 0; b.z = 30;
    expect(s.activate(a, 'gunship', { x: 0, y: 17, z: 0 }, 0)).toBe(true);
    // Behind where a turret would look, and still a target.
    s.step(0); s.step(.8); expect(damage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'gunship' }), b, GUNSHIP.damage);
    expect(Math.cos(s.effects[0].yaw)).toBeCloseTo(-1);
    expect(validStreakSnapshot(s.snapshot(), actors, 'team-deathmatch', .8)).toBe(true);
    damage.mockClear(); setClear(false); s.step(3); expect(damage).not.toHaveBeenCalled();
    setClear(true); b.z = 41; s.step(5); expect(damage).not.toHaveBeenCalled();
    expect(s.hurt(s.effects[0], 150, a)).toBe(0); expect(s.hurt(s.effects[0], 150, b)).toBe(150);
    expect(s.effects).toHaveLength(0); expect(destroyed).toHaveBeenCalledTimes(1);
  });
});
