import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import { createProfile, resolveLoadout } from './armory-state';
import { equipmentMovement } from './fps-encumbrance';
import { advanceGroundMotion, createMovementMotion, resetMovementMotion } from './fps-movement';
import type { ArenaInput } from './arena-rules';
import type { LanSession } from './lan-peer';
import { moveInMarina } from './marina-collision';

afterEach(() => vi.useRealTimers());
const input = (x = 0, z = 50): ArenaInput => ({ x, y: 1.75, z, yaw: 0, pitch: 0, weapon: 0, playing: true });
type Packet = Record<string, unknown>;

function pair(rtt = 0, stall = false, jitter = false, profile = createProfile()) {
  const handlers = [new Set<(from: string, payload: unknown) => void>(), new Set<(from: string, payload: unknown) => void>()];
  const outbound: { index: number; packet: Packet }[] = [];
  const releases = [0, 0];
  let movingAt = Infinity, messages = 0;
  const sessions = [0, 1].map(index => ({
    id: index ? 'guest' : 'host', role: index ? 'guest' : 'host', name: index ? 'Guest' : 'Host',
    send(payload: unknown) {
      const copy = structuredClone(payload) as Packet; outbound.push({ index, packet: copy });
      const now = performance.now(), release = movingAt + 2400;
      const held = stall && index === 0 && now >= movingAt + 1500 && now < release ? release - now : 0;
      releases[index] = Math.max(releases[index], now + rtt / 2 + held + (jitter ? [0, 90, 15, 170, 0][messages++ % 5] : 0));
      setTimeout(() => { for (const cb of handlers[1-index]) cb(index ? 'guest' : 'host', copy); }, releases[index] - now);
    },
    subscribe(cb: (from: string, payload: unknown) => void) { handlers[index].add(cb); return () => { handlers[index].delete(cb); }; },
    getPeers: () => [{ id: index ? 'host' : 'guest', name: index ? 'Host' : 'Guest' }], onPeers: () => () => {}, close() {},
  })) as LanSession[];
  const environment = { bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 }, move: moveInMarina, spawns: [{ x: 0, z: 0 }, { x: 0, z: 50 }], endless: true };
  const host = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: sessions[0], environment });
  const guest = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: sessions[1], environment, profile });
  return { host, guest, sessions, outbound,
    startMoving() { movingAt = performance.now(); },
    deliver(index: number, packet: Packet) { for (const cb of handlers[index]) cb(index ? 'host' : 'guest', packet); },
    dispose() { host.dispose(); guest.dispose(); },
  };
}

it.each([0, 100, 200, 300, 400, 500, 600])('preserves a ten-second sprint at %i ms gameplay RTT', rtt => {
  vi.useFakeTimers();
  const network = pair(rtt, rtt === 100, rtt === 300);
  const body = createMovementMotion(), mobility = equipmentMovement(resolveLoadout(createProfile()), 0).movement;
  let x = 0, z = 50, corrections = 0;
  try {
    network.host.update(.01, input(0, 0));
    for (let n = 0; n < 200; n++) {
      vi.advanceTimersByTime(10); network.host.update(.01, input(0, 0));
      const frame = network.guest.update(.01, input(x, z));
      if (frame.spawn && frame.self) { x = frame.self.x; z = frame.self.z; }
    }
    const initialZ = z; network.startMoving();
    for (let n = 0; n < 1000; n++) {
      vi.advanceTimersByTime(10); network.host.update(.01, input(0, 0));
      const frame = network.guest.update(.01, input(x, z));
      if (frame.correction) {
        corrections++; x = frame.correction.x; z = frame.correction.z;
        if (frame.hardCorrection) resetMovementMotion(body);
      }
      // Fire while sprinting, exercising fresh input/ack ordering as well.
      if (n % 15 === 0) network.guest.shoot(input(x, z), { x: 0, y: 1, z: 0 }, 0);
      z += advanceGroundMotion(body, 0, -7 * mobility, true, mobility, 'stand', false, .01).z;
    }
    expect(corrections).toBe(0);
    expect(initialZ - z).toBeCloseTo(65.86, 1);
    expect(network.outbound.some(({ packet }) => packet.type === 'arena-state' && Object.keys(packet.acknowledgedInputs as object).includes('guest'))).toBe(true);
  } finally { network.dispose(); }
}, 30000);

it('still corrects rejected movement and ignores stale inputs and snapshots after a rematch', () => {
  vi.useFakeTimers(); const network = pair();
  try {
    network.host.update(.01, input(0, 0));
    network.guest.update(.01, input()); vi.advanceTimersByTime(10);
    const joined = network.guest.update(.01, input());
    const self = joined.self!;
    const teleported = input(self.x + 50, self.z);
    network.guest.update(.1, teleported); vi.advanceTimersByTime(100);
    const correction = network.guest.update(.01, teleported);
    expect(correction.hardCorrection).toBe(true);
    expect(correction.correction!.x).toBeLessThan(self.x + 15);
    const oldInput = network.outbound.filter(({ packet }) => packet.type === 'arena-input').at(-1)!.packet;
    const oldState = network.outbound.filter(({ packet }) => packet.type === 'arena-state').at(-1)!.packet;
    network.host.reset(); vi.advanceTimersByTime(0);
    const reset = network.guest.update(.01, input());
    expect(reset.spawn).toBe(true); expect(reset.started).toBe(false);
    network.deliver(0, oldInput); network.deliver(1, oldState);
    expect(network.guest.update(.01, input()).self).toEqual(reset.self);
    expect(network.guest.update(.01, input()).correction).toBeUndefined();
    expect(network.host.update(.01, input(0, 0)).snapshot!.actors.find(a => a.id === 'guest')!.x).toBe(self.x);
  } finally { network.dispose(); }
});

it('keeps full-state broadcasts at ten per second while all four humans fire', () => {
  vi.useFakeTimers();
  let listener: (from: string, payload: unknown) => void = () => {};
  let snapshots = 0;
  const peers = ['guest1', 'guest2', 'guest3'].map(id => ({ id, name: id }));
  const session: LanSession = {
    id: 'host', role: 'host', name: 'Host',
    send(payload) { if ((payload as Packet).type === 'arena-state') snapshots++; },
    subscribe(cb) { listener = cb; return () => {}; }, getPeers: () => peers, onPeers: () => () => {}, close() {},
  };
  const host = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session });
  try {
    host.update(.01, input(-44, 68)); host.update(.01, input(-44, 68));
    for (const peer of peers) listener(peer.id, { type: 'arena-hello', profile: createProfile() });
    snapshots = 0;
    for (let n = 1; n <= 20; n++) {
      vi.advanceTimersByTime(50);
      if (n % 3 === 0) for (const actor of host.update(.01, input(-44, 68)).snapshot!.actors) {
        if (actor.id === 'host') host.shoot(actor, { x: 0, y: 1, z: 0 }, 0);
        else listener(actor.id, { type: 'arena-shot', origin: actor, direction: { x: 0, y: 1, z: 0 }, weapon: 0 });
      }
    }
    expect(snapshots).toBe(10);
  } finally { host.dispose(); }
});

it('discards input from a previous life rather than overwriting the respawn', () => {
  vi.useFakeTimers();
  const profile = { ...createProfile(), carry: { main: 4, extra: null } };
  const network = pair(0, false, false, profile);
  try {
    network.host.update(.01, input(0, 0)); network.guest.update(.01, input()); vi.advanceTimersByTime(10);
    const joined = network.guest.update(.01, input());
    const self = joined.self!;
    for (let n = 0; n < 5; n++) {
      network.guest.update(.2, { ...input(self.x, self.z), weapon: 4 });
      network.guest.shoot(self, { x: 0, y: 1, z: 0 }, 4);
      vi.advanceTimersByTime(200);
    }
    expect(network.guest.update(.01, input()).self!.alive).toBe(false);
    const old = network.outbound.find(({ packet }) => packet.type === 'arena-input')!.packet;
    vi.advanceTimersByTime(3200);
    const respawn = network.guest.update(.01, input());
    expect(respawn.spawn).toBe(true); expect(respawn.self!.deaths).toBe(1);
    network.deliver(0, { ...old, sequence: 10000, input: input(200, 50) });
    vi.advanceTimersByTime(100);
    const after = network.guest.update(.01, input(respawn.self!.x, respawn.self!.z));
    expect(after.self!.x).toBe(respawn.self!.x); expect(after.correction).toBeUndefined();
  } finally { network.dispose(); }
});
