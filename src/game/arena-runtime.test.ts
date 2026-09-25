import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArenaRuntime, validArenaInput, validArenaSnapshot } from './arena-runtime';
import { createArena, type ArenaInput } from './arena-rules';
import { createProfile } from './armory-state';
import type { LanSession } from './lan-peer';
import { createSoloSession } from './lan-peer';
import { MARINA_BOUNDS, moveInMarina } from './marina-collision';

function localPair() {
  const handlers = [new Set<(from: string, packet: unknown) => void>(), new Set<(from: string, packet: unknown) => void>()];
  const sessions: LanSession[] = [0, 1].map(index => ({
    id: index ? 'guest' : 'host', role: index ? 'guest' : 'host', name: index ? 'Guest' : 'Host',
    send(payload: unknown) { for (const callback of handlers[1 - index]) callback(index ? 'guest' : 'host', payload); },
    subscribe(callback) { handlers[index].add(callback); return () => { handlers[index].delete(callback); }; },
    getPeers: () => [{ id: index ? 'host' : 'guest', name: index ? 'Host' : 'Guest' }], onPeers: () => () => {}, close() {},
  }));
  return sessions;
}
const input = (x = -44, z = 68, playing = false): ArenaInput => ({ x, y: 1.75, z, yaw: 0, pitch: 0, weapon: 0, playing });
afterEach(() => vi.useRealTimers());

describe('arena runtime authority and renderer bridge', () => {
  it('carries solo vitals to a zone arrival and applies loot without recreating bots or restoring health', () => {
    vi.useFakeTimers();
    const session = createSoloSession('Explorer');
    const profile = createProfile(); profile.owned.push('plate-ceramic'); profile.plate = 'plate-ceramic';
    const runtime = createArenaRuntime({ scene: new THREE.Scene(), session, obstacles: [], profile, botCount: 1,
      initialVitals: { health: 44, armor: 21 }, environment: { bounds: MARINA_BOUNDS, move: moveInMarina, spawns: [{ x: -44, z: 68 }, { x: 4, z: 74 }], endless: true, playerSpawn: { x: -20, z: 70, yaw: 1.2, pitch: 0.1 } } });
    try {
      const before = runtime.update(0.02, input());
      expect(before.self).toMatchObject({ x: -20, z: 70, yaw: 1.2, pitch: 0.1, health: 44, armor: 21 });
      const next = { ...profile, owned: [...profile.owned, 'sar-vanguard'], guns: [{ ...profile.guns[0], variant: 'sar-vanguard' }, profile.guns[1]] as typeof profile.guns };
      expect(runtime.updateLoadout(next)).toBe(true);
      const after = runtime.update(0.02, input(-20, 70));
      expect(after.self).toEqual(before.self); expect(after.snapshot?.actors.find(a => a.bot)).toEqual(before.snapshot?.actors.find(a => a.bot));
      expect(runtime.setVitals({ health: 200, armor: 200 })).toBe(true);
      expect(runtime.update(0.02, input(-20, 70)).self).toMatchObject({ health: 100, armor: 75 });
    } finally { runtime.dispose(); }
  });
  it('rejects malformed input and snapshots before they reach scene geometry', () => {
    expect(validArenaInput(input())).toBe(true);
    expect(validArenaInput({ ...input(), x: NaN })).toBe(false);
    expect(validArenaInput({ ...input(), weapon: 30 })).toBe(false);
    const snapshot = createArena([], 1).snapshot();
    expect(validArenaSnapshot(snapshot)).toBe(true);
    expect(validArenaSnapshot({ ...snapshot, actors: [...snapshot.actors, snapshot.actors[0]] })).toBe(false);
    expect(validArenaSnapshot({ ...snapshot, actors: [{ ...snapshot.actors[0], health: Infinity }] })).toBe(false);
  });
  it('adopts authoritative spawns, waits for host start, and keeps ticking while the host pauses', () => {
    vi.useFakeTimers();
    const [hostSession, guestSession] = localPair();
    const hostScene = new THREE.Scene(); const guestScene = new THREE.Scene();
    const host = createArenaRuntime({ scene: hostScene, session: hostSession, obstacles: [], botCount: 0 });
    const guest = createArenaRuntime({ scene: guestScene, session: guestSession, obstacles: [], botCount: 0 });
    try {
      const first = host.update(0.02, input(200, 200)); expect(first.spawn).toBe(true); expect(first.self?.x).toBe(-44);
      expect(host.setHealthMultiplier(10)).toBe(false);
      expect(guest.setHealthMultiplier(10)).toBe(false);
      const joining = guest.update(0.02, input(200, 200, true));
      expect(joining.spawn).toBe(true); expect(joining.self?.x).not.toBe(200); expect(joining.started).toBe(false);
      vi.advanceTimersByTime(500); expect(host.update(0.02, input()).snapshot?.elapsed).toBe(0);
      host.update(0.02, input(-44, 68, true)); vi.advanceTimersByTime(1000);
      const active = host.update(0.02, input()); expect(active.snapshot!.elapsed).toBeGreaterThan(0.9);
      vi.advanceTimersByTime(1000); const paused = host.update(0.02, input());
      expect(paused.snapshot!.elapsed).toBeGreaterThan(1.9);
      expect(guest.update(0.02, input(joining.self!.x, joining.self!.z)).snapshot?.actors).toHaveLength(2);
      expect(hostScene.children.some(child => child.userData.arenaActorId === 'guest')).toBe(true);
    } finally { host.dispose(); guest.dispose(); }
    expect(hostScene.children).toHaveLength(0); expect(guestScene.children).toHaveLength(0);
  });
  it('ignores custom client damage and checks actual host scene cover for guest shots', () => {
    vi.useFakeTimers();
    const [hostSession, guestSession] = localPair();
    const scene = new THREE.Scene();
    const host = createArenaRuntime({ scene, session: hostSession, obstacles: [], botCount: 0 });
    try {
      host.update(0.02, input()); host.update(0.02, input(-44, 68, true));
      guestSession.send({ type: 'arena-hello', profile: { ...createProfile(), weapons: [{ damage: 99999 }] } });
      let state = host.update(0.02, input(-44, 68, true));
      const target = state.self!; const attacker = state.snapshot!.actors.find(actor => actor.id === 'guest')!;
      guestSession.send({ type: 'arena-input', input: { ...input(attacker.x, attacker.z, true) } });
      const vector = new THREE.Vector3(target.x - attacker.x, target.y - 0.65 - attacker.y, target.z - attacker.z).normalize();
      const cover = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), new THREE.MeshBasicMaterial());
      cover.position.set((target.x + attacker.x) / 2, 2, (target.z + attacker.z) / 2); scene.add(cover);
      guestSession.send({ type: 'arena-shot', origin: attacker, direction: vector, weapon: 0, maxDistance: 125 });
      expect(host.update(0.02, input(-44, 68, true)).self?.health).toBe(100);
      scene.remove(cover); cover.geometry.dispose(); (cover.material as THREE.Material).dispose();
      vi.advanceTimersByTime(200);
      guestSession.send({ type: 'arena-shot', origin: attacker, direction: vector, weapon: 0, maxDistance: 125 });
      state = host.update(0.02, input(-44, 68, true));
      expect(state.self?.health).toBe(64);
    } finally { host.dispose(); }
  });
  it.each([[1, 30], [2, 28], [3, 60], [4, 160]])('flushes a guest switch to family %i before firing its %i damage round', (family, damage) => {
    vi.useFakeTimers();
    const [hostSession, guestSession] = localPair();
    const host = createArenaRuntime({ scene: new THREE.Scene(), session: hostSession, obstacles: [], botCount: 0 });
    const guest = createArenaRuntime({ scene: new THREE.Scene(), session: guestSession, obstacles: [], botCount: 0, profile: { ...createProfile(), carry: { main: family === 2 ? 0 : family, extra: null } } });
    try {
      host.update(0.02, input()); host.update(0.02, input(-44, 68, true));
      const joined = guest.update(0.02, input());
      const shooter = joined.self!;
      guest.update(0.02, input(shooter.x, shooter.z, true));
      const target = host.update(0.02, input(-44, 68, true)).self!;
      const direction = new THREE.Vector3(target.x - shooter.x, target.y - 0.65 - shooter.y, target.z - shooter.z).normalize();
      guest.shoot(shooter, direction, family);
      expect(host.update(0.02, input(-44, 68, true)).self?.health).toBe(Math.max(0, 100 - damage));
      const response = guest.update(0.02, input(shooter.x, shooter.z, true));
      expect(response.hit?.damage).toBe(damage);
      expect(response.self?.health).toBe(family === 4 ? 80 : 100);
    } finally { host.dispose(); guest.dispose(); }
  });
  it('ignores hidden vehicle geometry and label sprites when firing an authority world-space ray', () => {
    vi.useFakeTimers();
    const [hostSession, guestSession] = localPair();
    const scene = new THREE.Scene();
    const hiddenVehicle = new THREE.Group(); hiddenVehicle.visible = false;
    const hiddenLabel = new THREE.Sprite(new THREE.SpriteMaterial()); hiddenVehicle.add(hiddenLabel);
    const hiddenBody = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), new THREE.MeshBasicMaterial()); hiddenVehicle.add(hiddenBody);
    const visibleLabel = new THREE.Sprite(new THREE.SpriteMaterial());
    const hiddenRay = vi.spyOn(hiddenLabel, 'raycast'); const visibleRay = vi.spyOn(visibleLabel, 'raycast');
    scene.add(hiddenVehicle, visibleLabel);
    const host = createArenaRuntime({ scene, session: hostSession, obstacles: [], botCount: 0 });
    try {
      host.update(0.02, input()); host.update(0.02, input(-44, 68, true));
      guestSession.send({ type: 'arena-hello', profile: createProfile() });
      const state = host.update(0.02, input(-44, 68, true));
      const shooter = state.self!; const target = state.snapshot!.actors.find(actor => actor.id === 'guest')!;
      hiddenVehicle.position.set((shooter.x + target.x) / 2, 1.5, (shooter.z + target.z) / 2);
      visibleLabel.position.copy(hiddenVehicle.position);
      const direction = new THREE.Vector3(target.x - shooter.x, target.y - 0.65 - shooter.y, target.z - shooter.z).normalize();
      expect(() => host.shoot(shooter, direction, 0)).not.toThrow();
      const after = host.update(0.02, input(-44, 68, true));
      expect(after.snapshot!.actors.find(actor => actor.id === 'guest')?.health).toBe(64);
      expect(after.hit?.damage).toBe(36);
      expect(hiddenRay).not.toHaveBeenCalled(); expect(visibleRay).not.toHaveBeenCalled();
    } finally {
      host.dispose(); hiddenRay.mockRestore(); visibleRay.mockRestore();
      hiddenLabel.material.dispose(); visibleLabel.material.dispose(); hiddenBody.geometry.dispose(); hiddenBody.material.dispose();
    }
  });
});

it('synchronizes driver/gunner seats, shared ammo, movement, late snapshots and reset between host and guest', () => {
  vi.useFakeTimers();
  const [hostSession, guestSession] = localPair();
  const environment = { bounds: MARINA_BOUNDS, move: moveInMarina, spawns: [{ x: 3.5, z: 0 }], endless: true };
  const vehicles = { spawns: { car: { x: 0, z: 0, yaw: 0 }, helicopter: { x: 30, z: 0, yaw: 0 } } };
  const host = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], session: hostSession, botCount: 0, environment, vehicles });
  const guest = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], session: guestSession, botCount: 0, environment, vehicles });
  const drive = { forward: 1, steer: 0, lift: 0, brake: false, boost: false, fire: false };
  const gun = { ...drive, forward: 0, fire: true, aim: { x: 0, y: 3, z: -80 } };
  try {
    host.update(.1, input(3.5, 0, true)); guest.update(.1, input(3.5, 0, true));
    host.update(.1, input(3.5, 0, true)); guest.update(.1, input(3.5, 0, true));
    host.vehicleAction('enter', 'car'); guest.vehicleAction('enter', 'car');
    let h = host.update(.1, { ...input(3.5, 0, true), vehicleControls: drive });
    let g = guest.update(.1, { ...input(3.5, 0, true), vehicleControls: gun });
    expect(h.self?.seat).toBe(0); expect(g.self?.seat).toBe(1);
    vi.advanceTimersByTime(200);
    h = host.update(.1, { ...input(3.5, 0, true), vehicleControls: drive });
    g = guest.update(.1, { ...input(3.5, 0, true), vehicleControls: gun });
    expect(h.snapshot?.vehicles?.[0].z).toBeLessThan(0);
    expect(g.snapshot?.vehicles?.[0].ammo).toBeLessThan(240);
    expect(g.snapshot?.vehicles).toEqual(h.snapshot?.vehicles);
    expect(g.self?.vehicle).toBe('car');
    // A client cannot claim another actor's seat or invent a hull snapshot.
    guestSession.send({ type: 'arena-vehicle', action: 'enter', kind: 'helicopter', id: 'host' });
    guestSession.send({ type: 'arena-state', started: true, snapshot: { ...g.snapshot, vehicles: [] } });
    expect(host.update(.1, input(3.5, 0, true)).self?.seat).toBe(0);
    host.reset();
    g = guest.update(.1, input(3.5, 0));
    expect(g.self?.vehicle).toBeUndefined();
    expect(g.snapshot?.vehicles?.[0].occupants).toEqual([null, null, null, null]);
    expect(g.snapshot?.vehicles?.[0].ammo).toBe(240);
  } finally { host.dispose(); guest.dispose(); }
});
