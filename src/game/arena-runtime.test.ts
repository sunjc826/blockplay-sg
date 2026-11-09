import { MAX_WEAPON_RANGE } from './weapon-range';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArenaRuntime, FIGURE_POSE, validArenaInput, validArenaSnapshot, type FigurePose } from './arena-runtime';
import { createArena, type ArenaInput } from './arena-rules';
import { createProfile, purchase } from './armory-state';
import { selectedRespawnLoadout } from './respawn-loadout';
import type { LanSession } from './lan-peer';
import { createSoloSession } from './lan-peer';
import { MARINA_BOUNDS, moveInMarina } from './marina-collision';
import { FPS_WEAPONS } from './fps-rules';

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

it.each([
  ['host', 0, 250, false], ['guest', 0, 250, false],
  ['host', 4, 350, false], ['guest', 4, 350, false],
  ['guest', 0, 250, true],
] as const)('resolves %s family %i at %i m with cover=%s across the host/guest bridge', (side, family, distance, blocked) => {
  vi.useFakeTimers();
  const [hostSession, guestSession] = localPair();
  const scene = new THREE.Scene();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 2), new THREE.MeshBasicMaterial());
  wall.position.set(0, 5, -200); if (blocked) scene.add(wall);
  const environment = { bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
    spawns: [{ x: 0, z: 0 }, { x: 0, z: -distance }], endless: true,
    move: (p: { x: number; z: number }, dx: number, dz: number) => ({ x: p.x + dx, z: p.z + dz }) };
  const profile = { ...createProfile(), carry: { main: family, extra: null } };
  const host = createArenaRuntime({ scene, session: hostSession, obstacles: [], botCount: 0, environment, profile });
  const guest = createArenaRuntime({ scene: new THREE.Scene(), session: guestSession, obstacles: [], botCount: 0, environment, profile });
  try {
    const h = host.update(.02, input()).self!, g = guest.update(.02, input()).self!;
    host.update(.02, input(h.x, h.z, true)); guest.update(.02, input(g.x, g.z, true));
    const shooter = side === 'host' ? h : g, target = side === 'host' ? g : h;
    expect(Math.hypot(shooter.x - target.x, shooter.z - target.z)).toBe(distance);
    const spec = FPS_WEAPONS[family], flight = distance / spec.ballistics.velocity;
    const aim = new THREE.Vector3(target.x - shooter.x, target.y - .65 - shooter.y + .5 * spec.ballistics.drop * flight * flight, target.z - shooter.z).normalize();
    const firing = side === 'host' ? host : guest;
    firing.shoot(shooter, aim, family);
    vi.advanceTimersByTime(100);
    const airborne = guest.update(.02, input(g.x, g.z, true)).snapshot!;
    expect(validArenaSnapshot(airborne, environment)).toBe(true);
    if (!blocked) {
      expect(airborne.rounds?.some(r => r.limit === (family === 4 ? 400 : 300))).toBe(true);
      expect(validArenaSnapshot({ ...airborne, rounds: airborne.rounds!.map(r => ({ ...r, limit: MAX_WEAPON_RANGE + 1 })) }, environment)).toBe(false);
    }
    vi.advanceTimersByTime(1100);
    const hAfter = host.update(.02, input(h.x, h.z, true)), gAfter = guest.update(.02, input(g.x, g.z, true));
    expect(gAfter.snapshot?.actors).toEqual(hAfter.snapshot?.actors);
    const victim = gAfter.snapshot!.actors.find(a => a.id === target.id)!;
    if (blocked) expect(victim.health).toBe(100);
    else {
      expect(victim.health).toBeLessThan(100);
      expect((side === 'host' ? hAfter : gAfter).hit?.damage).toBeGreaterThan(0);
    }
  } finally { host.dispose(); guest.dispose(); wall.geometry.dispose(); wall.material.dispose(); }
});

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
      // Let the first round reach the wall before removing it.
      vi.advanceTimersByTime(200);
      scene.remove(cover); cover.geometry.dispose(); (cover.material as THREE.Material).dispose();
      vi.advanceTimersByTime(200);
      guestSession.send({ type: 'arena-shot', origin: attacker, direction: vector, weapon: 0, maxDistance: 125 });
      // Let the round fly on the host's own clock.
      vi.advanceTimersByTime(600);
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
      vi.advanceTimersByTime(600);
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
      guestSession.send({ type: 'arena-input', input: { ...target, playing: true } });
      hiddenVehicle.position.set((shooter.x + target.x) / 2, 1.5, (shooter.z + target.z) / 2);
      visibleLabel.position.copy(hiddenVehicle.position);
      const direction = new THREE.Vector3(target.x - shooter.x, target.y - 0.65 - shooter.y, target.z - shooter.z).normalize();
      expect(() => host.shoot(shooter, direction, 0)).not.toThrow();
      vi.advanceTimersByTime(600);
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

describe('bot fire against rendered cover', () => {
  // An expedition arena: no vehicles, and the only wall is a scene mesh that
  // the box obstacle list knows nothing about.
  const run = (walled: boolean) => {
    vi.useFakeTimers();
    const scene = new THREE.Scene(), session = createSoloSession('Explorer');
    const shell = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 5), new THREE.MeshBasicMaterial());
    shell.position.set(-20, 1, 70); if (walled) scene.add(shell);
    // Keep observers outside the shell in both trials. Movement guards are not
    // rendered shot cover: the open trial must still take damage through them.
    // Without these guards a patrol can enter the hollow test mesh and fire inside.
    scene.userData.traversalObstacles = [
      { minX: -22.6, maxX: -22.4, minZ: 67.4, maxZ: 72.6, minY: 0, maxY: 4 },
      { minX: -17.6, maxX: -17.4, minZ: 67.4, maxZ: 72.6, minY: 0, maxY: 4 },
      { minX: -22.6, maxX: -17.4, minZ: 67.4, maxZ: 67.6, minY: 0, maxY: 4 },
      { minX: -22.6, maxX: -17.4, minZ: 72.4, maxZ: 72.6, minY: 0, maxY: 4 },
    ];
    const runtime = createArenaRuntime({ scene, session, obstacles: [], botCount: 2, composition: 'assault',
      environment: { bounds: MARINA_BOUNDS, move: moveInMarina, spawns: [{ x: -44, z: 68 }, { x: 4, z: 74 }], endless: true, playerSpawn: { x: -20, z: 70 } } });
    try {
      runtime.update(0.02, input(-20, 70)); runtime.update(0.02, input(-20, 70, true));
      for (let t = 0; t < 15; t += .1) { vi.advanceTimersByTime(100); runtime.update(.1, input(-20, 70, true)); }
      return runtime.update(.02, input(-20, 70, true));
    } finally { runtime.dispose(); shell.geometry.dispose(); shell.material.dispose(); }
  };
  it('lands bot rounds in the open', () => {
    const open = run(false).self!;
    expect(open.deaths + (100 - open.health)).toBeGreaterThan(0);
  });
  it('never lets a bot round through a wall that exists only as a mesh', () => {
    const frame = run(true);
    expect(frame.self).toMatchObject({ health: 100, deaths: 0 });
  });
});

it('poses figures only as often as figureDetail asks, while they still move every frame', () => {
  vi.useFakeTimers();
  let detail: FigurePose = FIGURE_POSE.none;
  const asked: THREE.Vector3[] = [], scene = new THREE.Scene(), session = createSoloSession('Explorer');
  const runtime = createArenaRuntime({ scene, session, obstacles: [], botCount: 2, composition: 'assault', figureDetail: at => { asked.push(at); return detail; },
    environment: { bounds: MARINA_BOUNDS, move: moveInMarina, spawns: [{ x: -44, z: 68 }, { x: 4, z: 74 }], endless: true, playerSpawn: { x: -20, z: 70 } } });
  try {
    runtime.update(.02, input(-20, 70)); runtime.update(.02, input(-20, 70, true));
    const figures = () => scene.children.filter(o => typeof o.userData.arenaActorId === 'string' && o.visible);
    const pose = () => figures().map(f => ['rig-thighL', 'rig-upperArmR', 'rig-chest'].map(n => f.getObjectByName(n)!.quaternion.toArray().map(v => v.toFixed(6)).join()).join('|'));
    const places = () => figures().map(f => f.position.toArray().map(v => v.toFixed(4)).join());
    const step = () => { vi.advanceTimersByTime(50); runtime.update(.05, input(-20, 70, true)); };
    for (let i = 0; i < 20; i++) step();
    expect(figures().length).toBeGreaterThan(0);
    expect(asked.length).toBeGreaterThan(0); expect(asked.every(at => scene.children.some(f => f.position === at))).toBe(true);
    let frozen = pose(), moved = places();
    for (let i = 0; i < 20; i++) step();
    expect(pose()).toEqual(frozen); expect(places()).not.toEqual(moved);
    detail = FIGURE_POSE.half; frozen = pose();
    const changes: boolean[] = [];
    for (let i = 0; i < 8; i++) { const before = pose(); step(); changes.push(pose() !== before); }
    // Every figure is posed on its first frame back, then every other frame.
    expect(changes.filter(Boolean).length).toBeGreaterThanOrEqual(4);
    detail = FIGURE_POSE.full;
    for (let i = 0; i < 4; i++) { const before = pose(); step(); expect(pose()).not.toEqual(before); }
  } finally { runtime.dispose(); }
});

it('reports a lost public relay even for the authoritative host', () => {
  vi.useFakeTimers();
  let connected = true;
  const session = { ...createSoloSession('Host'), role: 'host' as const, transport: 'public' as const, isConnected: () => connected };
  const runtime = createArenaRuntime({ scene: new THREE.Scene(), session, obstacles: [], botCount: 0 });
  try {
    expect(runtime.update(.02, input()).connected).toBe(true);
    connected = false;
    expect(runtime.update(.02, input()).connected).toBe(false);
  } finally { runtime.dispose(); }
});

it('acknowledges guest respawn loadouts and rejects weapons outside the admitted locker', async () => {
  vi.useFakeTimers();
  const [hostSession, guestSession] = localPair();
  const profile = purchase({ ...createProfile(), xp: 100000, tokens: 10000 }, 'sar-vanguard', '1h').profile;
  const host = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: hostSession });
  const guest = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: guestSession, profile });
  try {
    guest.update(.1, input()); host.update(.1, input());
    const selection = selectedRespawnLoadout(profile); selection.variants[0] = 'sar-vanguard'; selection.carry.main = 1;
    expect(await guest.queueRespawnLoadout(selection)).toBe(true);
    expect(guest.update(.1, input()).self?.weapon).toBe(0);
    let reply: unknown;
    const unsubscribe = guestSession.subscribe((_from, payload) => { if ((payload as { type: string }).type === 'arena-loadout-result') reply = payload; });
    const invalid = selectedRespawnLoadout(profile); invalid.variants[0] = 'sar-marksman';
    guestSession.send({ type: 'arena-loadout', request: 999, selection: invalid });
    expect(reply).toEqual({ type: 'arena-loadout-result', request: 999, accepted: false });
    unsubscribe();
  } finally { guest.dispose(); host.dispose(); }
});

it('does not let a guest reset an exhausted play-time rental by selecting it again', async () => {
  vi.useFakeTimers();
  const [hostSession, guestSession] = localPair();
  const profile = { ...createProfile(), rentals: { 'sar-vanguard': 500 } };
  const host = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: hostSession });
  const guest = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: guestSession, profile });
  try {
    for (let step = 0; step < 40; step++) {
      host.update(.05, input(-44, 68, true)); const frame = guest.update(.05, input(-44, 68, true));
      if (frame.self) guest.update(.05, { ...frame.self, playing: true });
      vi.advanceTimersByTime(50);
    }
    const selection = selectedRespawnLoadout(profile); selection.variants[0] = 'sar-vanguard';
    expect(guest.update(.01, input()).self!.rentalTimeMs).toBeGreaterThan(500);
    expect(await guest.queueRespawnLoadout(selection)).toBe(false);
    let reply: unknown; const unsubscribe = guestSession.subscribe((_from, payload) => { if ((payload as { type: string }).type === 'arena-loadout-result') reply = payload; });
    guestSession.send({ type: 'arena-loadout', request: 998, selection });
    expect(reply).toEqual({ type: 'arena-loadout-result', request: 998, accepted: false }); unsubscribe();
  } finally { guest.dispose(); host.dispose(); }
});


it('applies post-load starting choices for host and late guest, then locks them until rematch', async () => {
  vi.useFakeTimers();
  const [hostSession, guestSession] = localPair();
  const host = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: hostSession });
  let guest: ReturnType<typeof createArenaRuntime> | undefined;
  try {
    const selection = selectedRespawnLoadout(createProfile()); selection.carry.main = 1;
    expect(await host.queueRespawnLoadout(selection, true)).toBe(true);
    expect(host.update(.01, input()).self?.weapon).toBe(1);
    host.update(.01, { ...input(), weapon: 1, playing: true });
    vi.advanceTimersByTime(100);
    guest = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 0, session: guestSession });
    guest.update(.01, input());
    expect(await guest.queueRespawnLoadout(selection, true)).toBe(true);
    expect(guest.update(.01, input()).self?.weapon).toBe(1);
    guest.update(.1, { ...input(), weapon: 1, playing: true });
    guest.update(.1, { ...input(), weapon: 1, playing: false });
    expect(await guest.queueRespawnLoadout(selectedRespawnLoadout(createProfile()), true)).toBe(false);
    expect(await host.queueRespawnLoadout(selectedRespawnLoadout(createProfile()), true)).toBe(false);
    expect(await guest.queueRespawnLoadout(selectedRespawnLoadout(createProfile()))).toBe(true);
    host.reset();
    expect(await guest.queueRespawnLoadout(selection, true)).toBe(true);
  } finally { guest?.dispose(); host.dispose(); }
});

it('changes free-for-all bots after loading without replacing players, and locks settings at start', () => {
  vi.useFakeTimers();
  const runtime = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], botCount: 3, session: createSoloSession('Operator') });
  try {
    const before = runtime.update(.01, input()).self!;
    expect(runtime.configureBots(6, 'sniper')).toBe(true);
    let frame = runtime.update(.01, input());
    expect(frame.snapshot!.actors.filter(a => a.bot)).toHaveLength(6);
    expect(frame.snapshot!.actors.filter(a => a.bot).every(a => a.role === 'sniper')).toBe(true);
    expect(frame.self!.id).toBe(before.id);
    expect(runtime.configureBots(0, 'mixed')).toBe(true);
    frame = runtime.update(.01, input());
    expect(frame.snapshot!.actors.filter(a => a.bot)).toHaveLength(0);
    runtime.update(.01, input(before.x, before.z, true));
    expect(runtime.configureBots(3, 'assault')).toBe(false);
  } finally { runtime.dispose(); }
});
