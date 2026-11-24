import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import { createSoloSession } from './lan-peer';
import { createArena, type ArenaEnvironment, type ArenaShot } from './arena-rules';
import { createSimClient } from './sim-client';
import { createSimHost, type SimHostClock } from './sim-host';
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
function hosted(arena: Arena, self = 'me', campaigns?: { host: ProxyCampaign; client: ProxyCampaign }) {
  let time = 0, wake = () => {};
  const clock: SimHostClock = { now: () => time, every: (_ms, next) => { wake = next; return () => {}; } };
  let toHost: (message: SimToHost) => void = () => {}, toClient: (message: SimFromHost) => void = () => {};
  const sent: SimFromHost[] = [];
  const host = createSimHost(arena, self, { post: message => { sent.push(message); toClient(structuredClone(message)); }, listen: handler => { toHost = handler; } }, clock, campaigns?.host);
  const raw = (message: unknown) => toHost(structuredClone(message) as SimToHost);
  const client = createSimClient({ post: raw, listen: handler => { toClient = handler; } }, self, structuredClone(host.first()) as Extract<SimFromHost, { type: 'state' }>, arena.navigationGraphStatus(), campaigns?.client);
  return { client, sent, raw, tick(ms = SIM_TICK * 1000) { time += ms; wake(); } };
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
