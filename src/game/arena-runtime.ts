import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createVerticalMovement } from './vertical-movement';
import { createCharacterRig, type CharacterRig } from './character-rig';
import { arenaCharacterLook, arenaRoleColor } from './character-looks';
import { MARINA_BOUNDS } from './marina-collision';
import { PRONE_EYE_HEIGHT } from './fps-stance';
import { validVehicleControls } from './vehicle-seats';
import { VEHICLE_COMBAT } from './vehicle-combat';
import type { VehicleKind } from './vehicle-rules';
import { validWeaponIndex } from './fps-rules';
import * as THREE from 'three';
import { createArena, type ArenaActor, type ArenaEnvironment, type ArenaFeed, type ArenaInput, type ArenaPoint, type ArenaShot, type ArenaSnapshot, type ArenaVitals, type ArenaVehicleOptions } from './arena-rules';
import { createProfile, resolveLoadout, restoreProfile, type ArmoryProfile } from './armory-state';
import type { LanSession } from './lan-peer';
import { getArenaRole } from './arena-roles';
import { MAX_COMBAT_EVENTS, validCombatEvent, type CombatPlane } from './combat-events';
import type { Obstacle } from './marina-collision';

export interface ArenaRuntimeFrame {
  snapshot: ArenaSnapshot | null; self: ArenaActor | null; connected: boolean; started: boolean;
  hit: ArenaShot | null; feed: ArenaFeed[]; spawn: boolean; vehicleNotice?: string; correction?: boolean;
}
export interface ArenaRuntimeOptions {
  scene: THREE.Scene; obstacles: readonly Obstacle[]; session: LanSession;
  profile?: ArmoryProfile; botCount: number; composition?: string;
  environment?: ArenaEnvironment; vehicles?: ArenaVehicleOptions; initialVitals?: Partial<ArenaVitals>;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validArenaInput(value: unknown): value is ArenaInput {
  return object(value) && ['x', 'y', 'z', 'yaw', 'pitch'].every(key => finite(value[key])) &&
    validWeaponIndex(value.weapon) && typeof value.playing === 'boolean' &&
    (value.reloading === undefined || typeof value.reloading === 'boolean') &&
    (value.prone === undefined || typeof value.prone === 'boolean') &&
    (value.vehicleControls === undefined || validVehicleControls(value.vehicleControls));
}
export function validArenaSnapshot(value: unknown, environment?: ArenaEnvironment): value is ArenaSnapshot {
  if (!object(value) || value.type !== 'arena-snapshot' || !finite(value.tick) || value.tick < 0 || !finite(value.elapsed) || value.elapsed < 0 || value.elapsed > (environment?.endless ? 1e9 : 181) ||
    typeof value.finished !== 'boolean' || typeof value.winner !== 'string' || value.winner.length > 80 || !Array.isArray(value.actors) || value.actors.length > 14 || !Array.isArray(value.feed) || value.feed.length > 8) return false;
  const ids = new Set<string>();
  for (const actor of value.actors) {
    if (!object(actor) || typeof actor.id !== 'string' || actor.id.length > 100 || ids.has(actor.id) || typeof actor.name !== 'string' || actor.name.length > 24 ||
      !['x', 'y', 'z', 'yaw', 'pitch', 'health', 'armor', 'kills', 'deaths', 'respawnIn', 'shots', 'weapon'].every(key => finite(actor[key])) ||
      (actor.prone !== undefined && typeof actor.prone !== 'boolean') || (actor.variant !== undefined && (typeof actor.variant !== 'string' || actor.variant.length > 40)) || !validWeaponIndex(actor.weapon) || typeof actor.alive !== 'boolean' || typeof actor.bot !== 'boolean' || typeof actor.role !== 'string' || actor.role.length > 32 ||
      (actor.x as number) < (environment?.bounds.minX ?? -500) || (actor.x as number) > (environment?.bounds.maxX ?? 500) ||
      (actor.z as number) < (environment?.bounds.minZ ?? -500) || (actor.z as number) > (environment?.bounds.maxZ ?? 500) || (actor.y as number) < 0 || (actor.y as number) > 124 ||
      (actor.health as number) < 0 || (actor.health as number) > 300 || (actor.armor as number) < 0 || (actor.armor as number) > 150) return false;
    ids.add(actor.id);
  }
  if (value.vehicles !== undefined) {
    if (!Array.isArray(value.vehicles) || value.vehicles.length !== 2) return false;
    const kinds = new Set<string>(), seated = new Set<string>();
    for (const v of value.vehicles) {
      if (!object(v) || (v.kind !== 'car' && v.kind !== 'helicopter') || kinds.has(v.kind) ||
        !['x', 'y', 'z', 'yaw', 'speed', 'climb', 'health', 'ammo', 'weaponCooldown', 'gunYaw', 'gunPitch', 'shots'].every(k => finite(v[k])) ||
        !Array.isArray(v.occupants) || v.occupants.length !== 4 || !Number.isInteger(v.ammo) || !Number.isInteger(v.shots) ||
        (v.shots as number) < 0 || (v.shots as number) > VEHICLE_COMBAT[v.kind].ammo ||
        (v.ammo as number) < 0 || (v.ammo as number) > VEHICLE_COMBAT[v.kind].ammo ||
        (v.health as number) < 0 || (v.health as number) > VEHICLE_COMBAT[v.kind].health ||
        (v.y as number) < .13 || (v.y as number) > 120 || Math.abs(v.speed as number) > 31 || Math.abs(v.climb as number) > 100 ||
        (v.weaponCooldown as number) < 0 || (v.weaponCooldown as number) > 3 ||
        (v.x as number) < (environment?.bounds.minX ?? -500) || (v.x as number) > (environment?.bounds.maxX ?? 500) ||
        (v.z as number) < (environment?.bounds.minZ ?? -500) || (v.z as number) > (environment?.bounds.maxZ ?? 500) ||
        !(v.shotEnd === null || point(v.shotEnd))) return false;
      kinds.add(v.kind);
      for (let seat = 0; seat < 4; seat++) {
        const id = v.occupants[seat]; if (id === null) continue;
        if (typeof id !== 'string' || seated.has(id) || v.health === 0) return false;
        const actor = value.actors.find(a => a.id === id);
        if (!actor?.alive || actor.vehicle !== v.kind || actor.seat !== seat) return false;
        seated.add(id);
      }
    }
    if (value.actors.some(a => (a.vehicle !== undefined || a.seat !== undefined) && !seated.has(a.id))) return false;
  } else if (value.actors.some(a => a.vehicle !== undefined || a.seat !== undefined)) return false;
  if (value.events !== undefined) {
    if (!Array.isArray(value.events) || value.events.length > MAX_COMBAT_EVENTS) return false;
    const eventIds = new Set<string>();
    for (const event of value.events) {
      if (!validCombatEvent(event, value.elapsed as number, environment?.bounds) || eventIds.has(event.id)) return false;
      eventIds.add(event.id);
    }
  }
  return value.feed.every(entry => object(entry) && typeof entry.id === 'string' && entry.id.length <= 100 && typeof entry.text === 'string' && entry.text.length <= 160 &&
    (entry.killerId === undefined || typeof entry.killerId === 'string') && (entry.victimId === undefined || typeof entry.victimId === 'string'));
}
function point(value: unknown): value is ArenaPoint { return object(value) && finite(value.x) && finite(value.y) && finite(value.z); }

interface Avatar {
  rig: CharacterRig; root: THREE.Group; health: THREE.Sprite; label: THREE.Sprite | null; muzzle: THREE.Mesh | null;
  shots: number; flash: number; maxHealth: number; resources: { dispose(): void }[];
  alive: boolean; lastHealth: number; yaw: number; fireTimer: number; ground: number; groundTimer: number;
  previous: THREE.Vector3; velocity: THREE.Vector3;
}
const noRaycast = () => {};
function createAvatar(actor: ArenaActor): Avatar {
  const rig = createCharacterRig(arenaCharacterLook(actor), `arena-${actor.id}`);
  const root = rig.root; root.userData.arenaActorId = actor.id;
  const color = arenaRoleColor(actor);
  const resources: { dispose(): void }[] = [...rig.resources];
  let muzzle: THREE.Mesh | null = null;
  if (rig.muzzle) {
    const glow = new THREE.MeshBasicMaterial({ color: '#ffce72', transparent: true, opacity: 0.9 }), geometry = new THREE.BoxGeometry(0.11, 0.1, 0.18);
    resources.push(glow, geometry);
    muzzle = new THREE.Mesh(geometry, glow); muzzle.position.z = -.08; muzzle.visible = false; muzzle.raycast = noRaycast; rig.muzzle.add(muzzle);
  }
  const barMaterial = new THREE.SpriteMaterial({ color, depthTest: true }); resources.push(barMaterial);
  const health = new THREE.Sprite(barMaterial); health.position.set(0, 2.02, 0); health.scale.set(0.75, 0.055, 1); health.raycast = noRaycast; root.add(health);
  let label: THREE.Sprite | null = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 48;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = 'rgba(10,19,25,.8)'; context.fillRect(0, 0, 256, 48); context.font = '600 22px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color; context.fillText(actor.name.slice(0, 20), 128, 25);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }); resources.push(texture, material);
      label = new THREE.Sprite(material); label.position.set(0, 2.23, 0); label.scale.set(1.6, 0.3, 1); label.raycast = noRaycast; root.add(label);
    }
  }
  return { rig, root, health, label, muzzle, shots: actor.shots, flash: 0, maxHealth: actor.bot ? getArenaRole(actor.role)?.health ?? Math.max(100, actor.health) : 100, resources,
    alive: actor.alive, lastHealth: actor.health, yaw: actor.yaw, fireTimer: 0, ground: 0, groundTimer: 0, previous: new THREE.Vector3(), velocity: new THREE.Vector3() };
}
/** Falling bodies stay visible briefly but never stop a shot or read as a target. */
function setAvatarDown(avatar: Avatar, down: boolean) {
  avatar.rig.setDown(down); avatar.root.userData.arenaDown = down;
  avatar.root.traverse(node => { if (node instanceof THREE.Mesh && node !== avatar.muzzle) node.raycast = down ? noRaycast : THREE.Mesh.prototype.raycast; });
}
const ARENA_CORPSE_SECONDS = 1.6;
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Host owns bots, damage, spawns and score. The renderer submits only local input. */
export function createArenaRuntime(options: ArenaRuntimeOptions) {
  const { scene, session } = options;
  let profile = restoreProfile(JSON.stringify(options.profile ?? createProfile()));
  const authority = session.role !== 'guest';
  // Every shot and every bot's line of sight is checked against the rendered
  // scene, not only the box footprints: expedition districts have no vehicles,
  // and without this their mesh-only walls stopped nothing a bot fired.
  const simulation = authority ? createArena(options.obstacles, options.botCount, options.composition, options.environment, options.vehicles, { bounds: options.environment?.bounds ?? MARINA_BOUNDS, obstacles: options.obstacles, surfaces: getWalkSurfaces(scene), traversalObstacles: getTraversalObstacles(scene) },
    (origin, direction, distance) => coverLimit(origin, direction, distance)) : null;
  const hostId = authority ? session.id : session.getPeers()[0]?.id;
  const avatars = new Map<string, Avatar>();
  const registered = new Set<string>();
  let snapshot: ArenaSnapshot | null = null, started = false, disposed = false, inputTime = 0, helloTime = 3;
  let pendingHit: ArenaShot | null = null, pendingFeed: ArenaFeed[] = [], spawnPending = false, localAdopted = false;
  let lastInput: ArenaInput | null = null, vehicleNotice = '';
  let previousSelf: ArenaActor | null = null, lastTick = -1;
  const seenFeed = new Set<string>();
  const initial = resolveLoadout(profile);
  const coverRay = new THREE.Raycaster(), coverOrigin = new THREE.Vector3(), coverDirection = new THREE.Vector3();
  // Bots ask several times a second, so the cover list is gathered at most a
  // few times a second rather than by walking the whole scene on every cast.
  const surfaces: THREE.Mesh[] = [];
  let surfacesAt = -Infinity;
  function coverLimit(origin: ArenaPoint, direction: ArenaPoint, supplied: number) {
    if (!point(origin) || !point(direction)) return 0;
    coverDirection.set(direction.x, direction.y, direction.z);
    if (coverDirection.lengthSq() < 0.01) return 0;
    coverRay.set(coverOrigin.set(origin.x, origin.y, origin.z), coverDirection.normalize()); coverRay.far = Math.max(0, Math.min(240, supplied));
    const now = performance.now();
    if (now - surfacesAt > 250) {
      surfacesAt = now; surfaces.length = 0;
      scene.updateMatrixWorld(true);
      // Only solid, visible meshes are cover. Sprite raycasts require a render camera;
      // hidden vehicle labels must never enter this world-space authority ray.
      const collect = (node: THREE.Object3D) => {
        if (!node.visible || node.userData.arenaActorId || node.userData.fpsEffect || node.userData.vehicleKind) return;
        if (node instanceof THREE.Mesh) surfaces.push(node);
        node.children.forEach(collect);
      };
      scene.children.forEach(collect);
    }
    // A cached mesh may have been hidden or removed since; only one still shown counts.
    const shown = (node: THREE.Object3D) => { for (let n: THREE.Object3D | null = node; n; n = n.parent) { if (n === scene) return true; if (!n.visible) return false; } return false; };
    const cover = coverRay.intersectObjects(surfaces, false).find(hit => shown(hit.object));
    return Math.min(finite(supplied) ? Math.max(0, Math.min(240, supplied)) : 125, cover?.distance ?? 240);
  }
  if (simulation) { simulation.addPlayer(session.id, session.name, initial.armor, initial.absorption, initial.weapons, options.initialVitals, session.role === 'solo', initial.carriedFamilies); registered.add(session.id); }
  function accept(next: ArenaSnapshot) {
    if (next.tick < lastTick) { seenFeed.clear(); localAdopted = false; }
    lastTick = next.tick; snapshot = next;
    const self = next.actors.find(actor => actor.id === session.id) ?? null;
    if (self && (!previousSelf || (!previousSelf.alive && self.alive) || (previousSelf.deaths !== self.deaths && self.alive) || !localAdopted)) spawnPending = true;
    previousSelf = self ? { ...self } : null;
    for (const event of next.feed) if (!seenFeed.has(event.id)) { seenFeed.add(event.id); pendingFeed.push(event); }
    if (seenFeed.size > 300) { seenFeed.clear(); for (const event of next.feed) seenFeed.add(event.id); }
  }
  const publish = () => { if (simulation) { accept(simulation.snapshot()); if (session.role === 'host') session.send({ type: 'arena-state', snapshot, started }); } };
  if (simulation) accept(simulation.snapshot());
  const peersChanged = () => {
    if (!simulation) return;
    const present = new Set(session.getPeers().map(peer => peer.id));
    for (const id of registered) if (id !== session.id && !present.has(id)) { simulation.removePlayer(id); registered.delete(id); }
    publish();
  };
  const unsubscribePeers = session.onPeers(peersChanged);
  const unsubscribe = session.subscribe((from, payload) => {
    if (disposed || !object(payload)) return;
    if (simulation) {
      const peer = session.getPeers().find(candidate => candidate.id === from); if (!peer) return;
      if (payload.type === 'arena-hello' && !registered.has(from)) {
        let raw: string;
        try { raw = JSON.stringify(payload.profile); } catch { return; }
        if (typeof raw !== 'string' || raw.length > 16_000) return;
        const loadout = resolveLoadout(restoreProfile(raw));
        simulation.addPlayer(from, peer.name, loadout.armor, loadout.absorption, loadout.weapons, undefined, false, loadout.carriedFamilies); registered.add(from); publish();
      } else if (registered.has(from) && started && payload.type === 'arena-vehicle' && ['enter', 'exit', 'switch'].includes(String(payload.action)) && (payload.kind === undefined || payload.kind === 'car' || payload.kind === 'helicopter')) {
        const accepted = simulation.vehicleAction(from, payload.action as 'enter' | 'exit' | 'switch', payload.kind as VehicleKind | undefined);
        session.send({ type: 'arena-vehicle-result', accepted }, from); publish();
      } else if (registered.has(from) && payload.type === 'arena-input' && validArenaInput(payload.input)) simulation.setInput(from, payload.input);
      else if (registered.has(from) && payload.type === 'arena-reload' && validWeaponIndex(payload.weapon)) simulation.reloadPlayer(from, payload.weapon);
      else if (registered.has(from) && started && payload.type === 'arena-shot' && point(payload.origin) && point(payload.direction) && validWeaponIndex(payload.weapon)) {
        const hit = simulation.shoot(from, payload.origin, payload.direction, payload.weapon, coverLimit(payload.origin, payload.direction, finite(payload.maxDistance) ? payload.maxDistance : 125));
        session.send({ type: 'arena-hit', hit }, from); publish();
      }
    } else if (from === hostId) {
      if (payload.type === 'arena-vehicle-result' && payload.accepted === false) vehicleNotice = 'Seat unavailable. Approach a stopped vehicle; land and slow down to exit.';
      if (payload.type === 'arena-state' && validArenaSnapshot(payload.snapshot, options.environment) && typeof payload.started === 'boolean') { started = payload.started; accept(payload.snapshot); }
      if (payload.type === 'arena-hit' && object(payload.hit) && (payload.hit.hitId === null || typeof payload.hit.hitId === 'string') && typeof payload.hit.killed === 'boolean' && finite(payload.hit.damage) && payload.hit.damage >= 0 && payload.hit.damage <= 200) pendingHit = payload.hit as unknown as ArenaShot;
    }
  });
  let lastTime = performance.now(), broadcastTime = 0;
  const timer = simulation ? setInterval(() => {
    const now = performance.now(); const dt = Math.min(3, (now - lastTime) / 1000); lastTime = now;
    if (disposed || !started) return;
    for (let remaining = dt; remaining > 0.000001; remaining -= Math.min(0.25, remaining)) simulation.step(Math.min(0.25, remaining));
    accept(simulation.snapshot()); broadcastTime += dt;
    if (broadcastTime >= 0.1) { broadcastTime = 0; publish(); }
  }, 50) : undefined;

  /** Ground under an actor, probed as the simulation stands bots, so crouching and jumping read on any deck. */
  let footing: ReturnType<typeof createVerticalMovement> | null = null;
  function groundBelow(x: number, z: number, eye: number) {
    footing ??= createVerticalMovement({ bounds: options.environment?.bounds ?? MARINA_BOUNDS, obstacles: options.obstacles, surfaces: getWalkSurfaces(scene), traversalObstacles: getTraversalObstacles(scene) });
    return footing.supportHeight(x, z, eye - .5, .35, .6) ?? 0;
  }
  const destination = new THREE.Vector3(), local = { x: 0, z: 0 };
  function animateAvatar(avatar: Avatar, actor: ArenaActor, dt: number) {
    const { rig, root } = avatar;
    if (!actor.alive && avatar.alive) setAvatarDown(avatar, true);
    else if (actor.alive && !avatar.alive) { setAvatarDown(avatar, false); avatar.groundTimer = 0; }
    const respawned = actor.alive && !avatar.alive;
    avatar.alive = actor.alive;
    root.visible = actor.alive || (rig.down && rig.downTime < ARENA_CORPSE_SECONDS && !actor.vehicle);
    avatar.health.visible = actor.alive; if (avatar.label) avatar.label.visible = actor.alive;
    if (!root.visible) { avatar.shots = actor.shots; avatar.lastHealth = actor.health; return; }
    avatar.groundTimer -= dt;
    if (avatar.groundTimer <= 0) { avatar.groundTimer = .12; avatar.ground = groundBelow(actor.x, actor.z, actor.y); }
    const gunner = actor.vehicle === 'car' && actor.seat === 1, seated = !!actor.vehicle && !gunner;
    const eyeAbove = actor.y - avatar.ground;
    const crouch = actor.vehicle || actor.prone ? 0 : Math.max(0, Math.min(1, (1.75 - eyeAbove) / (1.75 - 1.15)));
    const airborne = !actor.vehicle && !actor.prone && eyeAbove > 1.95;
    const feet = seated ? actor.y - 1.2 : actor.vehicle ? actor.y - 1.75 : actor.prone ? actor.y - PRONE_EYE_HEIGHT : crouch > .02 ? avatar.ground : Math.max(0, actor.y - 1.75);
    destination.set(actor.x, feet, actor.z);
    avatar.previous.copy(root.position);
    if (actor.alive) root.position.lerp(destination, respawned || root.position.distanceTo(destination) > 7 ? 1 : 1 - Math.exp(-15 * dt));
    // Velocity from what is rendered, so the stride matches the glide.
    const moved = avatar.previous.distanceTo(root.position);
    if (dt > 0) avatar.velocity.lerp(moved > 3 ? destination.set(0, 0, 0) : destination.subVectors(root.position, avatar.previous).divideScalar(dt), 1 - Math.exp(-10 * dt));
    const turnStep = wrapAngle(actor.yaw - avatar.yaw) * (respawned ? 1 : 1 - Math.exp(-14 * dt));
    avatar.yaw = wrapAngle(avatar.yaw + turnStep);
    root.rotation.set(0, avatar.yaw, 0);
    const cos = Math.cos(avatar.yaw), sin = Math.sin(avatar.yaw);
    local.x = avatar.velocity.x * cos - avatar.velocity.z * sin; local.z = avatar.velocity.x * sin + avatar.velocity.z * cos;
    if (actor.shots > avatar.shots) { avatar.flash = 0.085; avatar.fireTimer = 1.6; rig.fire(); }
    if (actor.alive && actor.health < avatar.lastHealth - .5) rig.flinch();
    avatar.shots = actor.shots; avatar.lastHealth = actor.health;
    avatar.fireTimer = Math.max(0, avatar.fireTimer - dt); avatar.flash = Math.max(0, avatar.flash - dt);
    const speed = Math.hypot(local.x, local.z);
    rig.update(dt, {
      velocity: actor.vehicle ? { x: 0, z: 0 } : local, turn: actor.vehicle ? 0 : turnStep / Math.max(dt, 1e-3), pitch: actor.pitch,
      crouch, prone: !!actor.prone, seated, driving: seated && actor.seat === 0, airborne,
      aim: avatar.fireTimer > 0 || speed < 1.2 || actor.prone ? 1 : .15,
    });
    avatar.health.scale.x = Math.max(0.01, 0.75 * actor.health / avatar.maxHealth);
    if (avatar.muzzle) avatar.muzzle.visible = avatar.flash > 0 && actor.alive && !!rig.weapon?.visible;
  }
  function update(dt: number, input: ArenaInput): ArenaRuntimeFrame {
    if (disposed) return { snapshot: null, self: null, connected: false, started: false, hit: null, feed: [], spawn: false };
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.25)) : 0;
    const connected = authority || !!hostId && session.getPeers().some(peer => peer.id === hostId);
    inputTime += dt; helloTime += dt;
    let self = snapshot?.actors.find(actor => actor.id === session.id) ?? null;
    if (!authority && !self && connected && helloTime >= 1) { helloTime = 0; session.send({ type: 'arena-hello', profile }); }
    self = snapshot?.actors.find(actor => actor.id === session.id) ?? null;
    if (validArenaInput(input)) lastInput = { ...input };
    if (simulation && input.playing && !started) { started = true; lastTime = performance.now(); publish(); }
    // Never overwrite an authoritative spawn with the renderer's previous position.
    if (localAdopted && !spawnPending && validArenaInput(input)) {
      if (simulation) simulation.setInput(session.id, input);
      else if (self && connected && inputTime >= 1 / 20) { inputTime = 0; session.send({ type: 'arena-input', input }); }
    }
    const activeIds = new Set<string>();
    for (const actor of snapshot?.actors ?? []) {
      if (actor.id === session.id) continue;
      activeIds.add(actor.id);
      let avatar = avatars.get(actor.id);
      if (!avatar) { avatar = createAvatar(actor); avatars.set(actor.id, avatar); scene.add(avatar.root); avatar.root.position.set(actor.x, actor.y - 1.75, actor.z); avatar.previous.copy(avatar.root.position); }
      animateAvatar(avatar, actor, dt);
    }
    for (const [id, avatar] of avatars) if (!activeIds.has(id)) { scene.remove(avatar.root); avatar.resources.forEach(resource => resource.dispose()); avatars.delete(id); }
    const correction = !!self?.alive && localAdopted && !spawnPending && Math.hypot(self.x - input.x, self.y - input.y, self.z - input.z) > 2.5;
    const frame = { snapshot, self, connected, started, hit: pendingHit, feed: pendingFeed, spawn: spawnPending, correction, vehicleNotice };
    vehicleNotice = '';
    pendingHit = null; pendingFeed = []; if (spawnPending) localAdopted = true; spawnPending = false;
    return frame;
  }
  function vehicleAction(action: 'enter' | 'exit' | 'switch', kind?: VehicleKind) {
    if (disposed || !started || !localAdopted) return;
    if (simulation) {
      if (!simulation.vehicleAction(session.id, action, kind)) vehicleNotice = 'Seat unavailable. Approach a stopped vehicle; land and slow down to exit.';
      publish();
    } else session.send({ type: 'arena-vehicle', action, kind });
  }
  function shoot(origin: ArenaPoint, direction: ArenaPoint, weapon: number, maxDistance = 125, prone = lastInput?.prone ?? false) {
    if (disposed || !started || !localAdopted) return;
    // A shot means the reload is over: say so first, or the host would still be
    // reloading this frame (an interrupted reload) and refuse the round.
    const freshInput = lastInput ? { ...lastInput, prone, weapon, reloading: false, x: origin.x, y: origin.y, z: origin.z } : null;
    if (simulation) {
      if (freshInput && validArenaInput(freshInput)) simulation.setInput(session.id, freshInput);
      pendingHit = simulation.shoot(session.id, origin, direction, weapon, coverLimit(origin, direction, maxDistance)); publish();
    } else {
      if (freshInput && validArenaInput(freshInput)) session.send({ type: 'arena-input', input: freshInput });
      session.send({ type: 'arena-shot', origin, direction, weapon, maxDistance });
    }
  }
  function reload(weapon: number) {
    if (disposed || !localAdopted) return;
    const freshInput = lastInput ? { ...lastInput, weapon, reloading: true } : null;
    if (simulation) {
      if (freshInput && validArenaInput(freshInput)) simulation.setInput(session.id, freshInput);
      simulation.reloadPlayer(session.id, weapon);
    } else {
      if (freshInput && validArenaInput(freshInput)) session.send({ type: 'arena-input', input: freshInput });
      session.send({ type: 'arena-reload', weapon });
    }
  }
  function reset() { if (!simulation || disposed) return; simulation.reset(); started = false; localAdopted = false; previousSelf = null; seenFeed.clear(); publish(); }
  function updateLoadout(nextProfile: ArmoryProfile) {
    if (disposed || session.role !== 'solo' || !simulation) return false;
    profile = restoreProfile(JSON.stringify(nextProfile));
    const loadout = resolveLoadout(profile);
    simulation.setPlayerLoadout(session.id, loadout.armor, loadout.absorption, loadout.weapons, loadout.carriedFamilies); publish(); return true;
  }
  function setVitals(vitals: Partial<ArenaVitals>) {
    if (disposed || session.role !== 'solo' || !simulation) return false;
    simulation.setPlayerVitals(session.id, vitals); publish(); return true;
  }
  function setHealthMultiplier(multiplier: 1 | 5 | 10) {
    if (disposed || session.role !== 'solo' || !simulation) return false;
    simulation.setPlayerHealthMultiplier(session.id, multiplier); publish(); return true;
  }
  /** Solo only: guests could not see an event a private host started for itself. */
  function triggerEvent(kind: string, target?: CombatPlane) {
    if (disposed || session.role !== 'solo' || !simulation) return null;
    const event = simulation.triggerEvent(kind, target); publish(); return event;
  }
  function setCombatEvents(enabled: boolean) {
    if (disposed || session.role !== 'solo' || !simulation) return false;
    simulation.setCombatEvents(enabled); return true;
  }
  function dispose() {
    if (disposed) return; disposed = true; clearInterval(timer); unsubscribe(); unsubscribePeers();
    for (const avatar of avatars.values()) { scene.remove(avatar.root); avatar.resources.forEach(resource => resource.dispose()); }
    avatars.clear();
  }
  return { vehicleAction, update, shoot, reload, reset, dispose, updateLoadout, setVitals, setHealthMultiplier, triggerEvent, setCombatEvents };
}
export type ArenaRuntime = ReturnType<typeof createArenaRuntime>;
