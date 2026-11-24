import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import { createSoloSession } from './lan-peer';
import { createArena, type ArenaEnvironment, type ArenaShot } from './arena-rules';
import { createSimClient } from './sim-client';
import { createSimHost, seatArrivingCrew, type SimHostClock } from './sim-host';
import { createSharedVehicle } from './vehicle-seats';
import { createRegionMovement } from './region-collision';
import { createProxyCampaign, type ProxyCampaign } from './proxy-operations';
import { createSceneCover } from './scene-cover';
import { buildExpeditionDistrict } from './expedition-district';
import { SIM_MAX_CATCH_UP, SIM_METHODS, SIM_TICK, type Arena, type SimFromHost, type SimToHost } from './sim-protocol';

const weapon = { damage: 36, interval: 0.12, capacity: 30, reload: 1.8 };
const environment = (): ArenaEnvironment => ({
  bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  spawns: [{ x: -40, z: -40 }, { x: 40, z: 40 }, { x: -40, z: 40 }, { x: 40, z: -40 }],
  move: (p, dx, dz, radius) => ({ x: Math.max(-60 + radius, Math.min(60 - radius, p.x + dx)), z: Math.max(-60 + radius, Math.min(60 - radius, p.z + dz)) }),
  playerSpawn: { x: 0, z: 0, yaw: 0, pitch: 0 },
});
/** Same dice for every run, and a still wall clock so path planning never runs out of budget part-way. */
function seeded() {
  let state = 12345;
  vi.spyOn(Math, 'random').mockImplementation(() => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296));
  vi.spyOn(performance, 'now').mockReturnValue(1000);
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** Host and client joined as a worker would join them: every message is copied, none shared. */
/** `late` holds what the host posts until the next `tick`, as a worker's messages arrive after the call that caused them returns. */
function hosted(arena: Arena, self = 'me', campaigns?: { host: ProxyCampaign; client: ProxyCampaign }, late = false) {
  let time = 0, wake = () => {};
  const clock: SimHostClock = { now: () => time, every: (_ms, next) => { wake = next; return () => {}; } };
  let toHost: (message: SimToHost) => void = () => {}, toClient: (message: SimFromHost) => void = () => {};
  const sent: SimFromHost[] = [], held: SimFromHost[] = [];
  const host = createSimHost(arena, self, { post: message => { sent.push(message); if (late) held.push(structuredClone(message)); else toClient(structuredClone(message)); }, listen: handler => { toHost = handler; } }, clock, campaigns?.host);
  const raw = (message: unknown) => toHost(structuredClone(message) as SimToHost);
  const client = createSimClient({ post: raw, listen: handler => { toClient = handler; } }, self, structuredClone(host.first()) as Extract<SimFromHost, { type: 'state' }>, arena.navigationGraphStatus(), campaigns?.client);
  return { client, sent, raw, tick(ms = SIM_TICK * 1000) { time += ms; wake(); for (const message of held.splice(0)) toClient(message); } };
}
/** A short fight's worth of calls, written once and played against either kind of simulation. */
function play(arena: Arena, step: () => void) {
  arena.addPlayer('me', 'Player', 0, 0, [weapon], undefined, true);
  arena.preparePlayer('me');
  const frames = [];
  for (let i = 0; i < 80; i++) {
    arena.setInput('me', { x: i * .05, y: 1.75, z: 0, yaw: i * .01, pitch: 0, weapon: 0, playing: true });
    if (i % 10 === 5) arena.shoot('me', { x: i * .05, y: 1.75, z: 0 }, { x: 0, y: 0, z: -1 }, 0, 100);
    step();
    if (i % 20 === 19) frames.push(structuredClone(arena.snapshot()));
  }
  return frames;
}

describe('a hosted simulation', () => {
  it('plays the same match as one on the calling thread', () => {
    seeded();
    const direct = createArena([], 6, 'mixed', environment());
    const expected = play(direct, () => direct.step(SIM_TICK));
    vi.restoreAllMocks(); seeded();
    const link = hosted(createArena([], 6, 'mixed', environment()));
    link.client.setRunning(true);
    const actual = play(link.client.arena, () => link.tick());
    expect(actual.at(-1)!.tick).toBeGreaterThan(0);
    expect(actual.at(-1)!.actors.some(actor => actor.bot)).toBe(true);
    expect(actual).toEqual(expected);
    expect(link.client.stats.errors).toEqual([]);
  });

  it('steps only while running, and in its own time', () => {
    seeded();
    const link = hosted(createArena([], 0, 'mixed', environment()));
    const before = link.client.arena.snapshot().tick;
    link.tick(); link.tick();
    expect(link.client.arena.snapshot().tick).toBe(before);
    link.client.setRunning(true);
    // The caller's own steps do nothing: the host's clock is the only one.
    link.client.arena.step(10);
    expect(link.client.arena.snapshot().elapsed).toBe(0);
    link.tick(); link.tick(); link.tick();
    expect(link.client.arena.snapshot().elapsed).toBeCloseTo(3 * SIM_TICK, 6);
    link.client.setRunning(false); link.tick(500);
    expect(link.client.arena.snapshot().elapsed).toBeCloseTo(3 * SIM_TICK, 6);
    // Time spent stopped is not owed on starting again.
    link.client.setRunning(true); link.tick();
    expect(link.client.arena.snapshot().elapsed).toBeCloseTo(4 * SIM_TICK, 6);
  });

  it('gives up the time it cannot catch up on, and says how much', () => {
    seeded();
    const link = hosted(createArena([], 0, 'mixed', environment()));
    link.client.setRunning(true);
    link.tick(1000);
    expect(link.client.arena.snapshot().elapsed).toBeCloseTo(SIM_MAX_CATCH_UP * SIM_TICK, 6);
    expect(link.client.stats.steps).toBe(SIM_MAX_CATCH_UP);
    expect(link.client.stats.droppedMs).toBeCloseTo(1000 - SIM_MAX_CATCH_UP * SIM_TICK * 1000, 3);
    link.tick();
    expect(link.client.stats.steps).toBe(SIM_MAX_CATCH_UP + 1);
  });

  it('answers at once with a provisional result and follows with the real one', async () => {
    seeded();
    const arena = createArena([], 0, 'mixed', environment());
    arena.addPlayer('me', 'Player', 0, 0, [weapon], undefined, true); arena.addPlayer('them', 'Target', 0, 0, [weapon]);
    const link = hosted(arena);
    const [me, them] = ['me', 'them'].map(id => link.client.arena.snapshot().actors.find(actor => actor.id === id)!);
    const x = them.x - me.x, y = them.y - .6 - me.y, z = them.z - me.z, length = Math.hypot(x, y, z);
    expect(link.client.arena.shoot('me', me, { x: x / length, y: y / length, z: z / length }, 0, 500)).toEqual({ hitId: null, killed: false, damage: 0 });
    // A round in flight answers with no hit; where it lands arrives with a later state.
    const fired = await link.client.lastAnswer() as ArenaShot, landed = fired.hitId ? [fired] : [];
    link.client.setRunning(true);
    for (let i = 0; i < 40 && !landed.length; i++) { link.tick(); landed.push(...link.client.arena.takeHits('me')); }
    expect(landed).toMatchObject([{ hitId: 'them', damage: 36 }]);
    expect(link.client.arena.takeHits('me')).toEqual([]);
    // A call the host refuses is told so afterwards.
    expect(link.client.arena.vehicleAction('me', 'enter')).toBe(true);
    expect(await link.client.lastAnswer()).toBe(false);
    // Deployment and respawn choices are judged from the views the host last pushed.
    expect(link.client.arena.setPlayerDeployment('me', 'nowhere')).toBe(false);
    expect(link.client.arena.choosePlayerRespawn('me', 'nowhere')).toBe(false);
  });

  it('pushes fresh state after a call, except the ones made every frame', () => {
    seeded();
    const link = hosted(createArena([], 0, 'mixed', environment()));
    const states = () => link.sent.filter(message => message.type === 'state').length;
    link.client.arena.addPlayer('me', 'Player', 0, 0, [weapon], undefined, true);
    expect(states()).toBe(1);
    expect(link.client.arena.snapshot().actors.map(actor => actor.id)).toEqual(['me']);
    link.client.arena.setInput('me', { x: 1, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: true });
    expect(states()).toBe(1);
  });

  it('refuses anything that is not a posted simulation method', () => {
    seeded();
    const link = hosted(createArena([], 0, 'mixed', environment()));
    for (const method of ['snapshot', 'step', 'navigationStatus', 'constructor', 'nothing']) link.raw({ type: 'call', method, args: [] });
    expect(link.sent.filter(message => message.type === 'error')).toHaveLength(5);
    expect(link.client.stats.errors).toHaveLength(5);
    expect(() => link.client.arena.navigationStatus()).toThrow(/only available/);
  });

  it('drops functions from arguments that cannot be posted', () => {
    seeded();
    const link = hosted(createArena([], 0, 'mixed', environment()));
    link.client.arena.addPlayer('me', 'Player', 0, 0, [{ ...weapon, describe: () => 'rifle' } as typeof weapon], undefined, true);
    expect(link.client.arena.snapshot().actors.map(actor => actor.id)).toEqual(['me']);
    expect(link.client.stats.errors).toEqual([]);
  });

  it('keeps the caller\'s proxy campaign equal to the one the host simulates with', () => {
    seeded();
    const campaigns = { host: createProxyCampaign(), client: createProxyCampaign() };
    const link = hosted(createArena([], 0, 'mixed', { ...environment(), proxies: campaigns.host }), 'me', campaigns);
    link.client.setRunning(true);
    campaigns.host.favor['freedom-force'] = 3; campaigns.host.serial = 2;
    link.tick();
    expect(campaigns.client).toEqual(campaigns.host);
    expect(campaigns.client).not.toBe(campaigns.host);
    expect(campaigns.client.nextIn).toBeLessThan(createProxyCampaign().nextIn);
  });

  it('places every simulation method', () => {
    const arena = createArena([], 0, 'mixed', environment());
    expect(Object.keys(SIM_METHODS).sort()).toEqual(Object.keys(arena).sort());
  });
});

describe('a runtime around a hosted simulation', () => {
  it('starts and stops the host, and moves its figures between the states it is sent', () => {
    vi.useFakeTimers();
    const session = createSoloSession('Explorer');
    const link = hosted(createArena([], 3, 'assault', environment()), session.id);
    const scene = new THREE.Scene();
    const runtime = createArenaRuntime({ scene, session, obstacles: [], botCount: 3, environment: environment(), remote: link.client });
    try {
      const playing = { x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: true };
      // Not started: the host's clock may wake, but nothing steps.
      link.tick(); expect(runtime.update(1 / 60, { ...playing, playing: false }).snapshot?.elapsed).toBe(0);
      const figure = () => scene.children.find(node => typeof node.userData.arenaActorId === 'string' && node.userData.arenaActorId !== session.id)!;
      const seen = new Set<string>(); let states = 0, frame = runtime.update(1 / 60, playing);
      const start = figure().position.clone();
      for (let i = 0; i < 180; i++) {
        vi.advanceTimersByTime(1000 / 60);
        if (i % 3 === 2) { link.tick(); states++; }
        frame = runtime.update(1 / 60, playing);
        seen.add(figure().position.toArray().map(n => n.toFixed(4)).join());
      }
      expect(frame.started).toBe(true); expect(frame.self?.id).toBe(session.id);
      expect(frame.snapshot!.elapsed).toBeCloseTo(states * SIM_TICK, 6);
      // A figure that walked was somewhere new on most frames, not only on the frames a state arrived.
      expect(figure().position.distanceTo(start)).toBeGreaterThan(1);
      expect(seen.size).toBeGreaterThan(states * 1.5);
      runtime.reset(); link.tick(); link.tick();
      expect(runtime.update(1 / 60, { ...playing, playing: false }).snapshot?.elapsed).toBe(0);
    } finally { runtime.dispose(); }
    expect(link.client.stats.errors).toEqual([]);
  });
});

describe('a runtime asking a hosted simulation something it may refuse', () => {
  it('reports a proxy transfer the host refused, after the provisional yes', async () => {
    const session = createSoloSession('Explorer');
    const link = hosted(createArena([], 0, 'assault', environment()), session.id);
    const runtime = createArenaRuntime({ scene: new THREE.Scene(), session, obstacles: [], botCount: 0, environment: environment(), remote: link.client });
    try {
      const playing = { x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: true };
      for (let i = 0; i < 10; i++) { runtime.update(1 / 60, playing); link.tick(); }
      const heard: boolean[] = [];
      // No proxy operation is running, so the simulation will say no; the caller hears that, not the provisional yes.
      expect(runtime.proxyAction('keep', accepted => heard.push(accepted))).toBe(true);
      expect(heard).toEqual([]);
      await link.client.lastAnswer(); await Promise.resolve();
      expect(heard).toEqual([false]);
    } finally { runtime.dispose(); }
  });
});

describe('a vehicle crossing between districts with a hosted simulation', () => {
  const bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 }, spawns = { car: { x: 0, z: 0, yaw: 0 }, helicopter: { x: 40, z: 0, yaw: 0 } };
  const district = (): ArenaEnvironment => ({ bounds, move: createRegionMovement(bounds).move, spawns: [{ x: 10, z: 0 }], playerSpawn: { x: 3.5, z: 0 }, endless: true,
    facilities: { sites: [{ id: 'command', name: 'Command', kind: 'command', x: 10, y: 0, z: 0, initialOwner: 'armed-forces', deployment: { x: 7, z: 0, yaw: 0 } }],
      savedVehicles: (['car', 'helicopter'] as const).map(kind => ({ ...createSharedVehicle(kind, spawns[kind]), faction: 'armed-forces' })) } });
  const vehicles = { spawns, openWorld: true };
  const playing = { x: 3.5, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: true };

  it('waits for the host to say who crosses, then hands over the same crew a local simulation would', async () => {
    const session = createSoloSession('Explorer'), arena = createArena([], 0, 'assault', district(), vehicles);
    const link = hosted(arena, session.id);
    const runtime = createArenaRuntime({ scene: new THREE.Scene(), session, obstacles: [], botCount: 0, composition: 'assault', environment: district(), vehicles, remote: link.client });
    try {
      runtime.update(1 / 60, playing);
      link.client.arena.callout(session.id, 'gather'); link.client.arena.vehicleAction(session.id, 'enter', 'car');
      for (let i = 0; i < 120; i++) { link.tick(); runtime.update(1 / 60, playing); }
      expect(runtime.update(1 / 60, playing).self?.vehicle).toBe('car');
      // Asked, not yet answered: the engine holds the crossing and asks again next frame, without asking the host twice.
      const calls = link.client.stats.calls;
      expect(runtime.vehicleTravel('harbourfront')).toBeUndefined();
      expect(runtime.vehicleTravel('harbourfront')).toBeUndefined();
      expect(link.client.stats.calls).toBe(calls + 1);
      await link.client.lastAnswer(); await Promise.resolve();
      const crew = runtime.vehicleTravel('harbourfront');
      expect(crew).toEqual(arena.vehicleTravel(session.id, 'harbourfront'));
      expect(crew?.playerId).toBe(session.id);
      // The answer is spent: another crossing asks again.
      expect(runtime.vehicleTravel('harbourfront')).toBeUndefined();
    } finally { runtime.dispose(); }
    expect(link.client.stats.errors).toEqual([]);
  });

  it('says no when the host does, and when the host fails', async () => {
    const session = createSoloSession('Explorer'), arena = createArena([], 0, 'assault', district(), vehicles);
    const link = hosted(arena, session.id);
    const runtime = createArenaRuntime({ scene: new THREE.Scene(), session, obstacles: [], botCount: 0, composition: 'assault', environment: district(), vehicles, remote: link.client });
    const silenced = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      runtime.update(1 / 60, playing); link.tick();
      // On foot: nothing to cross with.
      expect(runtime.vehicleTravel('harbourfront')).toBeUndefined();
      await link.client.lastAnswer(); await Promise.resolve();
      expect(runtime.vehicleTravel('harbourfront')).toBeNull();
      // A call the host could not carry out still answers, so nobody is left waiting on it.
      vi.spyOn(arena, 'vehicleTravel').mockImplementation(() => { throw new Error('broken'); });
      const failing = hosted(arena, session.id);
      failing.client.arena.vehicleTravel(session.id, 'harbourfront');
      await expect(failing.client.lastAnswer()).resolves.toBeNull();
      expect(failing.client.stats.errors).toHaveLength(1);
    } finally { runtime.dispose(); silenced.mockRestore(); }
  });

  it('seats an arriving crew in the call that adds the player', () => {
    const source = createArena([], 0, 'assault', district(), vehicles);
    source.addPlayer('old', 'Explorer', 0, 0, [], undefined, true);
    source.callout('old', 'gather'); source.vehicleAction('old', 'enter', 'car');
    for (let t = 0; t < 6; t += SIM_TICK) source.step(SIM_TICK);
    const transfer = source.vehicleTravel('old', 'harbourfront')!;
    expect(transfer.crew.length).toBeGreaterThan(0);
    const link = hosted(seatArrivingCrew(createArena([], 0, 'assault', district(), vehicles), 'new', structuredClone(transfer)), 'new');
    link.client.arena.addPlayer('new', 'Explorer', 0, 0, [], undefined, true);
    // The first state that shows the player shows them in their seat, with the crew beside them.
    const state = link.sent.filter((message): message is Extract<SimFromHost, { type: 'state' }> => message.type === 'state').find(message => message.snapshot.actors.some(actor => actor.id === 'new'))!;
    expect(state.snapshot.actors.find(actor => actor.id === 'new')).toMatchObject({ vehicle: 'car' });
    expect(state.snapshot.actors.filter(actor => transfer.crew.some(member => member.actor.id === actor.id))).toHaveLength(transfer.crew.length);
    expect(link.client.stats.errors).toEqual([]);
  });
});

describe('the district an expedition simulates in', () => {
  it('has any stamps hidden and its camps standing as cover, wherever it is built', () => {
    const { world, infrastructure, structureVisuals } = buildExpeditionDistrict('toa-payoh');
    try {
      expect(world.stamps.every(stamp => !stamp.visible)).toBe(true);
      const camps: THREE.Object3D[] = [];
      world.scene.traverse(node => { if (node.userData.commandCamp) camps.push(node); });
      expect(camps.length).toBeGreaterThan(0);
      expect(infrastructure.facilitySites.length).toBeGreaterThan(0);
      // A level ray across a camp stops at its wall: the simulation's sight and the drawn district agree on that.
      world.scene.updateMatrixWorld(true);
      const cover = createSceneCover(world.scene), box = new THREE.Box3().setFromObject(camps[0]), centre = box.getCenter(new THREE.Vector3());
      const reach = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + 3, y = box.min.y + 1;
      const blocked = [0, 1, 2, 3, 4, 5, 6, 7].some(i => {
        const angle = i * Math.PI / 4, origin = { x: centre.x - Math.cos(angle) * reach, y, z: centre.z - Math.sin(angle) * reach };
        const hit = cover.probe([{ origin, direction: { x: Math.cos(angle), y: 0, z: Math.sin(angle) }, range: reach * 2 }]);
        return hit.bullet[0] < reach * 2 - .01 && hit.struck[0].includes('commandCamp');
      });
      expect(blocked).toBe(true);
    } finally { structureVisuals.dispose(); world.dispose(); }
  });
});

describe('a match host whose simulation is hosted on another thread', () => {
  /** Host and guest sessions joined directly; packets are copied and delivered on the next timer turn. */
  function match() {
    const handlers = [new Set<(from: string, payload: unknown) => void>(), new Set<(from: string, payload: unknown) => void>()];
    const received: Record<string, unknown>[][] = [[], []];
    const sessions = [0, 1].map(index => ({
      id: index ? 'guest' : 'host', role: index ? 'guest' : 'host', name: index ? 'Guest' : 'Host',
      send(payload: unknown) { const copy = structuredClone(payload) as Record<string, unknown>; setTimeout(() => { received[1 - index].push(copy); for (const cb of handlers[1 - index]) cb(index ? 'guest' : 'host', copy); }, 0); },
      subscribe(cb: (from: string, payload: unknown) => void) { handlers[index].add(cb); return () => { handlers[index].delete(cb); }; },
      getPeers: () => [{ id: index ? 'host' : 'guest', name: index ? 'Host' : 'Guest' }], onPeers: () => () => {}, close() {},
    })) as unknown as import('./lan-peer').LanSession[];
    const rules = { bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 }, move: createRegionMovement({ minX: -400, maxX: 400, minZ: -400, maxZ: 400 }).move, spawns: [{ x: 0, z: 0 }, { x: 0, z: 30 }], endless: true } as ArenaEnvironment;
    const link = hosted(createArena([], 0, 'mixed', rules), 'host', undefined, true);
    const host = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: sessions[0], environment: rules, remote: link.client });
    const guest = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: sessions[1], environment: rules });
    const at = { host: { x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: true }, guest: { x: 0, y: 1.75, z: 30, yaw: 0, pitch: 0, weapon: 0, playing: true } };
    /** One 50 ms turn of both machines and the worker between them. */
    async function turn(count = 1) {
      for (let n = 0; n < count; n++) {
        link.tick(); await vi.advanceTimersByTimeAsync(50);
        const mine = host.update(.05, at.host); if (mine.spawn && mine.self) Object.assign(at.host, { x: mine.self.x, z: mine.self.z });
        const theirs = guest.update(.05, at.guest); if (theirs.spawn && theirs.self) Object.assign(at.guest, { x: theirs.self.x, z: theirs.self.z });
      }
    }
    return { link, host, guest, received, at, turn, dispose() { host.dispose(); guest.dispose(); } };
  }

  it('admits a guest, lands the guest\'s rounds and tells them so, and answers their requests with the simulation\'s own word', async () => {
    vi.useFakeTimers();
    const m = match();
    try {
      // The guest's hello needs a second to go out; then both stand in the hosted simulation.
      await m.turn(60);
      const actors = () => m.host.update(0, m.at.host).snapshot!.actors;
      expect(actors().map(a => a.id).sort()).toEqual(['guest', 'host']);
      expect(m.guest.update(0, m.at.guest).snapshot?.actors.map(a => a.id).sort()).toEqual(['guest', 'host']);
      const before = actors().find(a => a.id === 'host')!.health;
      // Straight at the host, chest high, until something lands.
      const dx = m.at.host.x - m.at.guest.x, dz = m.at.host.z - m.at.guest.z, reach = Math.hypot(dx, dz);
      expect(reach).toBeGreaterThan(5);
      for (let n = 0; n < 40 && !m.received[1].some(p => p.type === 'arena-hit'); n++) { m.guest.shoot({ ...m.at.guest, y: 1.2 }, { x: dx / reach, y: 0, z: dz / reach }, 0); await m.turn(2); }
      const told = m.received[1].find(p => p.type === 'arena-hit') as { hit: ArenaShot } | undefined;
      expect(told?.hit.hitId).toBe('host');
      expect(actors().find(a => a.id === 'host')!.health).toBeLessThan(before);
      // No vehicle stands here: the refusal is the simulation's, not the provisional yes a hosted call returns at once.
      m.received[0].length = 0; m.received[1].length = 0;
      (m.guest as unknown as { vehicleAction(action: string, kind?: string): unknown }).vehicleAction('enter', 'car');
      await m.turn(4);
      expect(m.received[0].some(p => p.type === 'arena-vehicle')).toBe(true);
      expect(m.received[1].filter(p => p.type === 'arena-vehicle-result')).toEqual([{ type: 'arena-vehicle-result', accepted: false }]);
      // A restart: the simulation's fresh state reaches the guest though nothing is broadcasting until the host starts again.
      const played = m.guest.update(0, m.at.guest).snapshot!.elapsed; expect(played).toBeGreaterThan(2);
      m.at.host.playing = false; m.host.reset(); await m.turn(4);
      expect(m.guest.update(0, m.at.guest).snapshot!.elapsed).toBeLessThan(.5);
      expect(m.link.client.stats.errors).toEqual([]);
    } finally { m.dispose(); }
  }, 30000);
});
