import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { createVerticalNavigator, type NavigationPoint } from './vertical-navigation';
import { createVerticalMovement, type VerticalWorld } from './vertical-movement';
import { validVehicleControls, createSharedVehicle, seatOf, seatPoint, gunnerId, vehicleGunRay, vehicleRayDistance, type SharedVehicle, type VehicleControls } from './vehicle-seats';
import { driveVehicle, flyVehicle, vehicleBounds, vehicleExit, type VehicleKind, type VehicleSpawn, type FlightObstacle } from './vehicle-rules';
import { damageVehicle, fireVehicleWeapon, vehicleCollisionDamage, VEHICLE_COMBAT } from './vehicle-combat';
import { applyArmorDamage } from './armory-state';
import { PRONE_EYE_HEIGHT, weaponBraced, unsupportedRecoilDamage } from './fps-stance';
import { MARINA_BOUNDS, moveInMarina, type Obstacle } from './marina-collision';
import { FPS_WEAPONS, reloadCommit, type WeaponSpec } from './fps-rules';
import { armamentFamilies, chooseArmament, getArenaRole, type ArenaRolePlugin } from './arena-roles';
import './combat-event-catalog';
import { combatPhase, combatTimeline, getCombatEvent, MAX_COMBAT_EVENTS, type CombatEventDescriptor, type CombatPlane, type MunitionPayload } from './combat-events';
import { createCombatDirector, planTransport, type CombatRisk } from './combat-director';
import { resolveBlast, type BlastTarget } from './combat-blast';

/** All coordinates use metres; actor y is eye height, not the feet. */
export interface ArenaActor {
  id: string; name: string; bot: boolean; x: number; y: number; z: number; yaw: number; pitch: number;
  health: number; armor: number; kills: number; deaths: number; alive: boolean; respawnIn: number; weapon: number;
  shots: number; role: string; prone?: boolean; vehicle?: VehicleKind; seat?: number;
  /** Bots: the catalog variant in their hands, which is what they drop. */
  variant?: string;
}
export interface ArenaFeed { id: string; text: string; killerId?: string; victimId?: string }
export interface ArenaSnapshot {
  type: 'arena-snapshot'; tick: number; elapsed: number; actors: ArenaActor[];
  feed: ArenaFeed[]; finished: boolean; winner: string; vehicles?: SharedVehicle[];
  /** Combat events still running or lingering; each one's rounds follow from its descriptor. */
  events?: CombatEventDescriptor[];
}
export interface ArenaInput { x: number; y: number; z: number; yaw: number; pitch: number; weapon: number; playing: boolean; reloading?: boolean; prone?: boolean; vehicleControls?: VehicleControls }
export type ArenaWeapon = Pick<WeaponSpec, 'damage' | 'interval' | 'capacity' | 'reload' | 'requiresMount'>;
export interface ArenaPoint { x: number; y: number; z: number }
export interface ArenaShot { hitId: string | null; killed: boolean; damage: number }
export interface ArenaVitals { health: number; armor: number }
export interface ArenaEnvironment {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  move: (position: { x: number; z: number }, dx: number, dz: number, radius: number, obstacles: readonly Obstacle[]) => { x: number; z: number };
  spawns: readonly { x: number; z: number }[];
  endless?: boolean;
  playerSpawn?: { x: number; z: number; yaw?: number; pitch?: number };
  /** Random combat events scheduled by a director, paced by district risk. */
  combatEvents?: { risk: CombatRisk };
  /** Fallen bots wait for a troop transport instead of reappearing at a spawn point. */
  reinforcements?: boolean;
}
/**
 * Distance along a unit ray to the first piece of rendered cover, or anything
 * at least `distance` when nothing is in the way. Box obstacles only describe
 * footprints; this is what knows about shop walls, railings and terrain meshes.
 */
export type ArenaCoverDistance = (origin: ArenaPoint, direction: ArenaPoint, distance: number) => number;
export interface ArenaVehicleOptions {
  spawns: Record<VehicleKind, VehicleSpawn>; flightObstacles?: readonly FlightObstacle[];
  /** Kept for callers that predate `createArena`'s own `coverDistance` argument. */
  coverDistance?: ArenaCoverDistance;
}
/** A lone fallen bot waits this long for company before a transport is sent for it. */
export const REINFORCEMENT_WAIT = 6;
/** A bot no transport has come for by now reappears at a spawn point, as before. */
export const REINFORCEMENT_FALLBACK = 45;
/** Troops per transport. */
export const REINFORCEMENT_SEATS = 4;
/** How long a bot trusts its last mesh line-of-sight check before casting again. */
export const ARENA_SIGHT_RECHECK = .2;
export const ARENA_DURATION = 180;
export const ARENA_KILL_LIMIT = 15;
export const ARENA_RESPAWN_SECONDS = 3;
const EMPTY_SHOT: ArenaShot = { hitId: null, killed: false, damage: 0 };
/** Share of a reload by which a guest's own commit point may run ahead of the host's. */
const RELOAD_COMMIT_GRACE = .12;
const SPAWNS = [
  { x: -44, z: 68 }, { x: -65, z: 72 }, { x: -20, z: 73 }, { x: -52, z: 55 },
  { x: -8, z: 64 }, { x: -73, z: 60 }, { x: -34, z: 58 }, { x: 4, z: 74 },
];
interface InternalActor {
  velocityY?: number;
  navigation?: { path: NavigationPoint[]; target: NavigationPoint; retry: number; pending?: Generator<undefined, NavigationPoint[]> };
  actor: ArenaActor; healthMax: number; armorMax: number; absorption: number; weapons: ArenaWeapon[]; allowedWeapons: number[]; role?: ArenaRolePlugin;
  cooldown: number[]; rounds: number[]; reload: number[]; playing: boolean; movementBudget: number; wasReloading: boolean;
  /** Per weapon: how far an interrupted reload got, and whether the one under way began empty. */
  reloadSaved: number[]; reloadEmpty: boolean[];
  usePlayerSpawn: boolean;
  reaction: number; target: string; strafe: number; patrol: { x: number; z: number }; patrolTime: number;
  sight?: { target: string; clear: boolean; wait: number };
  /** Reinforcements: when this fallen bot started waiting for a ride, and the seat it was given. */
  waiting?: number; ride?: { event: string; slot: number };
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const finitePoint = (p: ArenaPoint) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const distance = (a: ArenaPoint, b: ArenaPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Distance to a solid scene box, or Infinity. Unspecified height means a tall wall. */
export function arenaWallDistance(origin: ArenaPoint, direction: ArenaPoint, obstacles: readonly (Obstacle & { minY?: number })[]) {
  let closest = Infinity;
  for (const obstacle of obstacles) {
    let near = 0; let far = Infinity;
    const limits = [[obstacle.minX, obstacle.maxX], [obstacle.minY ?? 0, obstacle.maxY ?? 200], [obstacle.minZ, obstacle.maxZ]];
    const starts = [origin.x, origin.y, origin.z]; const rays = [direction.x, direction.y, direction.z];
    for (let axis = 0; axis < 3; axis++) {
      const [min, max] = limits[axis]; const d = rays[axis]; const o = starts[axis];
      if (Math.abs(d) < 1e-8) { if (o < min || o > max) { far = -1; break; } }
      else { const t1 = (min - o) / d; const t2 = (max - o) / d; near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2)); }
    }
    if (far >= near) closest = Math.min(closest, near);
  }
  return closest;
}
function sphereDistance(origin: ArenaPoint, direction: ArenaPoint, center: ArenaPoint, radius: number) {
  const x = origin.x - center.x; const y = origin.y - center.y; const z = origin.z - center.z;
  const b = x * direction.x + y * direction.y + z * direction.z;
  const determinant = b * b - (x * x + y * y + z * z - radius * radius);
  if (determinant < 0) return Infinity;
  const t = -b - Math.sqrt(determinant); return t >= 0 ? t : Infinity;
}
function bodyDistance(origin: ArenaPoint, direction: ArenaPoint, actor: ArenaActor) {
  if (actor.prone) return Math.min(...[0, .55, 1.1].map(back =>
    sphereDistance(origin, direction, { x: actor.x + Math.sin(actor.yaw) * back, y: actor.y - PRONE_EYE_HEIGHT + .35, z: actor.z + Math.cos(actor.yaw) * back }, .3)));

  return Math.min(...[[0.13, 0.29], [0.62, 0.43], [1.12, 0.4]].map(([offset, radius]) =>
    sphereDistance(origin, direction, { x: actor.x, y: actor.y - offset, z: actor.z }, radius)));
}

/** Host-owned match. Clients may submit movement and aim, never damage or scores. */
export function createArena(obstacles: readonly Obstacle[], botCount: number, composition = 'mixed', environment?: ArenaEnvironment, vehicleOptions?: ArenaVehicleOptions, traversalWorld?: VerticalWorld, coverDistance?: ArenaCoverDistance) {
  // Rendered cover stops every round, with or without vehicles in the match.
  const cover = coverDistance ?? vehicleOptions?.coverDistance;
  const bounds = environment?.bounds ?? MARINA_BOUNDS;
  const traversal = traversalWorld ? createVerticalMovement(traversalWorld) : null;
  const vehicleGround = [...obstacles, ...(traversalWorld ? verticalVehicleObstacles(traversalWorld) : [])];
  const navigator = traversalWorld?.surfaces.length ? createVerticalNavigator(traversalWorld) : null;
  const floorAt = (point: ArenaPoint) => traversal?.supportHeight(point.x, point.z, point.y - .5, .35, .6) ?? 0;
  const move = environment?.move ?? moveInMarina;
  const coverObstacles = [...obstacles, ...(traversalWorld?.traversalObstacles ?? [])];
  const worldWallDistance = (origin: ArenaPoint, ray: ArenaPoint) => {
    let distance = arenaWallDistance(origin, ray, coverObstacles);
    for (const s of traversalWorld?.surfaces ?? []) {
      const low = s.axis === 'x' ? s.minX : s.minZ, high = s.axis === 'x' ? s.maxX : s.maxZ;
      const slope = (s.endHeight - s.startHeight) / (high - low);
      const denominator = ray.y - slope * ray[s.axis];
      if (s.solidBelow) {
        // Clip against the six half-spaces of the solid sloped foundation.
        let near = 0, far = distance;
        const planes = [[origin.x - s.minX, ray.x], [s.maxX - origin.x, -ray.x],
          [origin.z - s.minZ, ray.z], [s.maxZ - origin.z, -ray.z], [origin.y, ray.y],
          [s.startHeight + slope * (origin[s.axis] - low) - origin.y, -denominator]];
        for (const [offset, direction] of planes) {
          if (Math.abs(direction) < 1e-8) { if (offset < 0) { far = -1; break; } }
          else if (direction > 0) near = Math.max(near, -offset / direction);
          else far = Math.min(far, -offset / direction);
        }
        if (far >= near) distance = Math.min(distance, near);
      }
      if (Math.abs(denominator) < 1e-8) continue;
      const t = (s.startHeight + slope * (origin[s.axis] - low) - origin.y) / denominator;
      const x = origin.x + ray.x * t, z = origin.z + ray.z * t;
      if (t >= 0 && x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) distance = Math.min(distance, t);
    }
    return distance;
  };
  const members = new Map<string, InternalActor>();
  let vehicles: SharedVehicle[] = vehicleOptions ? (['car', 'helicopter'] as const).map(kind => createSharedVehicle(kind, vehicleOptions.spawns[kind])) : [];
  const controls = new Map<string, { input: VehicleControls; expires: number }>();
  let tick = 0; let elapsed = 0; let finished = false; let winner = ''; let eventId = 0; let seed = 92371;
  const feed: ArenaFeed[] = [];
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // What a bot is issued has its own stream, so the draw cannot move anything else the seed decides.
  let armamentSeed = 51787;
  const armamentRandom = () => { armamentSeed = (Math.imul(armamentSeed, 1664525) + 1013904223) >>> 0; return armamentSeed / 4294967296; };
  const announce = (text: string, killerId?: string, victimId?: string) => {
    feed.push({ id: String(++eventId), text, ...(killerId ? { killerId } : {}), ...(victimId ? { victimId } : {}) });
    if (feed.length > 8) feed.shift();
  };
  const groundObstacles = obstacles.filter(o => (o.maxY ?? 200) > 0.15);
  const clearSpawn = (p: { x: number; z: number }) => Number.isFinite(p.x) && Number.isFinite(p.z) &&
    p.x - 0.5 >= bounds.minX && p.x + 0.5 <= bounds.maxX && p.z - 0.5 >= bounds.minZ && p.z + 0.5 <= bounds.maxZ &&
    !vehicles.some(v => { const b = vehicleBounds(v); return v.y < 2 && p.x + .5 > b.minX && p.x - .5 < b.maxX && p.z + .5 > b.minZ && p.z - .5 < b.maxZ; }) &&
    !groundObstacles.some(o => p.x + 0.5 > o.minX && p.x - 0.5 < o.maxX && p.z + 0.5 > o.minZ && p.z - 0.5 < o.maxZ);
  const validSpawns = (environment?.spawns ?? SPAWNS).filter(clearSpawn);
  if (!validSpawns.length) {
    const area = environment ? { minX: bounds.minX + 0.75, maxX: bounds.maxX - 0.75, minZ: bounds.minZ + 0.75, maxZ: bounds.maxZ - 0.75 } : { minX: -78, maxX: 20, minZ: 54, maxZ: 80 };
    const incrementX = environment ? Math.max(3, (area.maxX - area.minX) / 24) : 3;
    const incrementZ = environment ? Math.max(3, (area.maxZ - area.minZ) / 24) : 3;
    for (let z = area.minZ; z <= area.maxZ && validSpawns.length < 8; z += incrementZ) {
      for (let x = area.minX; x <= area.maxX && validSpawns.length < 8; x += incrementX) if (clearSpawn({ x, z })) validSpawns.push({ x, z });
    }
  }
  // Real Marina has many valid spawn points; explicit failure avoids spawning inside walls.
  if (!validSpawns.length) throw new Error('No clear arena spawn point is available.');
  const spawn = (entry: InternalActor) => {
    releaseSeat(entry.actor.id);
    const others = [...members.values()].filter(m => m !== entry && m.actor.alive);
    const positions = [...validSpawns].sort((a, b) => {
      const safety = (p: { x: number; z: number }) => Math.min(1000, ...others.map(m => Math.hypot(m.actor.x - p.x, m.actor.z - p.z)));
      return safety(b) - safety(a);
    });
    const preferred = entry.usePlayerSpawn && environment?.playerSpawn && clearSpawn(environment.playerSpawn) ? environment.playerSpawn : undefined;
    const p = preferred ?? positions[0];
    Object.assign(entry.actor, { x: p.x, z: p.z }, { y: 1.75, health: entry.healthMax, armor: entry.armorMax, alive: true, prone: false, respawnIn: 0,
      yaw: Number.isFinite(preferred?.yaw) ? preferred!.yaw! : 0, pitch: Number.isFinite(preferred?.pitch) ? clamp(preferred!.pitch!, -1.5, 1.5) : 0 });
    entry.cooldown = entry.weapons.map(() => 0); entry.reload = entry.weapons.map(() => 0); entry.rounds = entry.weapons.map(w => w.capacity);
    entry.reloadSaved = entry.weapons.map(() => 0); entry.reloadEmpty = entry.weapons.map(() => false);
    if (entry.role) { const issued = chooseArmament(entry.role, armamentRandom); entry.actor.weapon = issued.family; entry.actor.variant = issued.id; }
    entry.navigation = undefined; entry.velocityY = 0; entry.waiting = undefined; entry.ride = undefined;
    entry.movementBudget = 2; entry.reaction = 1; entry.target = ''; entry.wasReloading = false;
  };
  function sanitizeWeapons(weapons: readonly ArenaWeapon[]) {
    return (weapons.length ? weapons : FPS_WEAPONS).slice(0, FPS_WEAPONS.length).map(w => ({
      requiresMount: w.requiresMount === true,
      damage: Number.isFinite(w.damage) ? clamp(w.damage, 1, 200) : 36,
      interval: Number.isFinite(w.interval) ? clamp(w.interval, 0.06, 3) : 0.12,
      capacity: Number.isFinite(w.capacity) ? Math.floor(clamp(w.capacity, 1, 200)) : 30,
      reload: Number.isFinite(w.reload) ? clamp(w.reload, 0.4, 8) : 1.8,
    }));
  }
  const allowedIndexes = (weapons: readonly ArenaWeapon[], allowed?: readonly number[]) => {
    const indexes = [...new Set((allowed ?? weapons.map((_, index) => index)).filter(index => Number.isInteger(index) && index >= 0 && index < weapons.length))];
    return indexes.length ? indexes : [0];
  };
  function addPlayer(id: string, name: string, armor = 0, absorption = 0, weapons: readonly ArenaWeapon[] = FPS_WEAPONS, initialVitals?: Partial<ArenaVitals>, usePlayerSpawn = false, allowed?: readonly number[]) {
    if (!id || id.length > 100 || members.has(id) || members.size >= 14) return;
    const safeWeapons = sanitizeWeapons(weapons), allowedWeapons = allowedIndexes(safeWeapons, allowed);
    const entry: InternalActor = {
      actor: { id, name: name.trim().slice(0, 24) || 'Player', bot: false, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0,
        health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: allowedWeapons[0], prone: false, shots: 0, role: 'player' },
      healthMax: 100, armorMax: Number.isFinite(armor) ? clamp(armor, 0, 150) : 0, absorption: Number.isFinite(absorption) ? clamp(absorption, 0, 0.9) : 0,
      weapons: safeWeapons, allowedWeapons, cooldown: [], rounds: [], reload: [], reloadSaved: [], reloadEmpty: [], playing: true, movementBudget: 2, wasReloading: false, usePlayerSpawn,
      reaction: 1, target: '', strafe: random() < 0.5 ? -1 : 1, patrol: validSpawns[0], patrolTime: 0,
    };
    members.set(id, entry); spawn(entry); if (initialVitals) setPlayerVitals(id, initialVitals); announce(`${entry.actor.name} joined`);
  }
  function setPlayerVitals(id: string, vitals: Partial<ArenaVitals>) {
    const entry = members.get(id); if (!entry || entry.actor.bot) return;
    if (Number.isFinite(vitals.health)) {
      entry.actor.health = clamp(vitals.health!, 0, entry.healthMax);
      entry.actor.alive = entry.actor.health > 0; if (!entry.actor.alive) releaseSeat(id);
      entry.actor.respawnIn = entry.actor.alive ? 0 : ARENA_RESPAWN_SECONDS;
    }
    if (Number.isFinite(vitals.armor)) entry.actor.armor = clamp(vitals.armor!, 0, entry.armorMax);
  }
  function setPlayerHealthMultiplier(id: string, multiplier: 1 | 5 | 10) {
    const entry = members.get(id); if (!entry || entry.actor.bot || ![1, 5, 10].includes(multiplier)) return;
    const fraction = entry.actor.health / entry.healthMax;
    entry.healthMax = 100 * multiplier;
    entry.actor.health = entry.healthMax * fraction;
  }
  function setPlayerLoadout(id: string, armor: number, absorption: number, weapons: readonly ArenaWeapon[], allowed?: readonly number[]) {
    const entry = members.get(id); if (!entry || entry.actor.bot) return;
    entry.armorMax = Number.isFinite(armor) ? clamp(armor, 0, 150) : entry.armorMax;
    entry.absorption = Number.isFinite(absorption) ? clamp(absorption, 0, 0.9) : entry.absorption;
    entry.actor.armor = Math.min(entry.actor.armor, entry.armorMax);
    const next = sanitizeWeapons(weapons);
    next.forEach((weapon, index) => {
      const previous = entry.weapons[index];
      const changed = !previous || Object.keys(weapon).some(key => weapon[key as keyof ArenaWeapon] !== previous[key as keyof ArenaWeapon]);
      if (changed) { entry.rounds[index] = weapon.capacity; entry.cooldown[index] = 0; entry.reload[index] = 0; entry.reloadSaved[index] = 0; }
    });
    entry.weapons = next; entry.rounds.length = next.length; entry.cooldown.length = next.length; entry.reload.length = next.length;
    entry.reloadSaved.length = next.length; entry.reloadEmpty.length = next.length;
    entry.allowedWeapons = allowedIndexes(next, allowed ?? entry.allowedWeapons);
    if (!entry.allowedWeapons.includes(entry.actor.weapon)) entry.actor.weapon = entry.allowedWeapons[0]; entry.wasReloading = false;
  }
  function removePlayer(id: string) {
    const entry = members.get(id); if (!entry || entry.actor.bot) return;
    releaseSeat(id); members.delete(id); announce(`${entry.actor.name} left`);
  }
  function setInput(id: string, input: ArenaInput) {
    const entry = members.get(id); if (!entry || entry.actor.bot || finished || !input || !finitePoint(input)) return;
    if (![input.yaw, input.pitch].every(Number.isFinite)) return;
    entry.playing = input.playing === true;
    const actor = entry.actor; if (!actor.alive) return;
    const mounted = seatOf(vehicles, id);
    if (mounted) {
      actor.yaw = input.yaw % (Math.PI * 2); actor.pitch = clamp(input.pitch, -1.5, 1.5); actor.prone = false;
      if (validVehicleControls(input.vehicleControls) && input.playing) controls.set(id, { input: input.vehicleControls, expires: elapsed + .35 }); else controls.delete(id);
      return;
    }
    const target = { x: clamp(input.x, bounds.minX + 0.5, bounds.maxX - 0.5), y: clamp(input.y, input.prone === true ? PRONE_EYE_HEIGHT : 1, 90), z: clamp(input.z, bounds.minZ + 0.5, bounds.maxZ - 0.5) };
    const wasProne = actor.prone;
    const floor = floorAt(target);
    actor.prone = input.prone === true && target.y <= floor + PRONE_EYE_HEIGHT + .02;
    if (weaponBraced(entry.weapons[actor.weapon], actor.prone, target.y <= floor + PRONE_EYE_HEIGHT + .02)) { target.x = actor.x; target.z = actor.z; }
    // Eye-height changes are stance changes, not travel that consumes the movement budget.
    if (actor.prone || wasProne && target.y <= floor + 1.75) actor.y = target.y;
    const travel = distance(actor, target); const scale = travel > 0 ? Math.min(1, entry.movementBudget / travel) : 0;
    const y = actor.y + (target.y - actor.y) * scale;
    const bodyHeight = actor.prone ? .6 : target.y - floor < 1.4 ? 1.2 : 1.8;
    const feet = y - (bodyHeight - .05);
    const solids = [...obstacles, ...vehicles.filter(v => v.y < 2).map(vehicleBounds)].filter(o => (o.maxY ?? 200) > feet + 1e-5);
    if (traversalWorld) solids.push(...traversalWorld.traversalObstacles.filter(o => o.maxY > feet + 1e-5 && o.minY < y + .05));
    let position = move(actor, (target.x - actor.x) * scale, (target.z - actor.z) * scale, 0.35, solids);
    if (traversal && !traversal.canOccupy(position.x, Math.max(0, feet), position.z, .35, bodyHeight)) position = { x: actor.x, z: actor.z };
    entry.movementBudget = Math.max(0, entry.movementBudget - Math.hypot(position.x - actor.x, y - actor.y, position.z - actor.z));
    Object.assign(actor, position, { y, yaw: input.yaw % (Math.PI * 2), pitch: clamp(input.pitch, -1.5, 1.5) });
    if (entry.allowedWeapons.includes(input.weapon) && Number.isInteger(input.weapon) && input.weapon >= 0 && input.weapon < entry.weapons.length && input.weapon !== actor.weapon) {
      stopReload(entry, actor.weapon); actor.weapon = input.weapon; entry.wasReloading = false;
    }
    if (input.reloading === true && !entry.wasReloading) reloadPlayer(id, actor.weapon);
    // The player's own reload stopped: it was interrupted, or it ended a moment before this one.
    else if (input.reloading === false && entry.wasReloading) stopReload(entry, actor.weapon);
    entry.wasReloading = input.reloading === true;
  }
  function reloadPlayer(id: string, weapon: number) {
    const entry = members.get(id);
    if (!entry || seatOf(vehicles, id) || !entry.actor.alive || finished || !Number.isInteger(weapon) || weapon !== entry.actor.weapon || !entry.weapons[weapon] || !entry.allowedWeapons.includes(weapon)) return;
    startReload(entry, weapon);
  }
  /**
   * The same reload as fps-rules, on the host's count: a reload resumes an
   * interrupted one, fills the magazine at its commit point, and stopping it
   * short of that keeps its progress. Bots never interrupt theirs.
   */
  function startReload(entry: InternalActor, index: number) {
    const weapon = entry.weapons[index];
    if (!weapon || entry.reload[index] > 0 || entry.rounds[index] >= weapon.capacity) return;
    const empty = entry.reloadEmpty[index] = entry.rounds[index] <= 0;
    const saved = clamp(Number.isFinite(entry.reloadSaved[index]) ? entry.reloadSaved[index] : 0, 0, reloadCommit(empty) - .01);
    entry.reload[index] = weapon.reload * (1 - saved); entry.reloadSaved[index] = 0;
  }
  function stopReload(entry: InternalActor, index: number) {
    const weapon = entry.weapons[index];
    if (!weapon || !(entry.reload[index] > 0)) return;
    const progress = 1 - entry.reload[index] / weapon.reload;
    entry.reload[index] = 0;
    // A guest's reload began, and so ends, a network trip before ours: just
    // short of the commit point, its magazine has already seated over there.
    if (progress >= reloadCommit(entry.reloadEmpty[index] === true) - RELOAD_COMMIT_GRACE) entry.rounds[index] = weapon.capacity;
    else entry.reloadSaved[index] = progress;
  }
  function shoot(id: string, origin: ArenaPoint, direction: ArenaPoint, weapon: number, maxDistance = 125): ArenaShot {
    const entry = members.get(id);
    if (!entry || seatOf(vehicles, id) || finished || !entry.actor.alive || !entry.playing || !finitePoint(origin) || !finitePoint(direction)) return { ...EMPTY_SHOT };
    if (!Number.isInteger(weapon) || weapon !== entry.actor.weapon || !entry.weapons[weapon] || !entry.allowedWeapons.includes(weapon)) return { ...EMPTY_SHOT };
    if (distance(origin, entry.actor) > 1.5 || entry.cooldown[weapon] > 1e-7 || entry.reload[weapon] > 0) return { ...EMPTY_SHOT };
    const length = Math.hypot(direction.x, direction.y, direction.z); if (length < 0.5 || length > 1.5) return { ...EMPTY_SHOT };
    const ray = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    if (entry.rounds[weapon] <= 0) { startReload(entry, weapon); return { ...EMPTY_SHOT }; }
    const recoilDamage = unsupportedRecoilDamage(entry.weapons[weapon], entry.actor.prone === true, entry.actor.y <= floorAt(entry.actor) + 1.17, !entry.actor.prone && entry.actor.y <= floorAt(entry.actor) + 1.17);
    if (recoilDamage) {
      const damage = applyArmorDamage(entry.actor.health, entry.actor.armor, recoilDamage, entry.absorption);
      entry.actor.health = damage.health; entry.actor.armor = damage.armor;
      if (!entry.actor.health) {
        entry.actor.alive = false; entry.actor.deaths++; entry.actor.respawnIn = ARENA_RESPAWN_SECONDS;
        announce(`${entry.actor.name} was defeated by unsupported .50 recoil`, undefined, id);
      }
    }
    entry.rounds[weapon]--; entry.cooldown[weapon] = entry.weapons[weapon].interval; entry.actor.shots++;
    if (entry.rounds[weapon] === 0) startReload(entry, weapon);
    return resolveShot(entry, origin, ray, entry.weapons[weapon].damage, Math.min(125, Math.max(0, maxDistance)));
  }
  /** `cause` names what did it when no actor did, as in "Artillery killed …"; it credits nobody. */
  function hurtActor(victim: InternalActor, damage: number, attacker?: InternalActor, cause?: string) {
    const blocked = Math.min(victim.actor.armor, damage * victim.absorption);
    victim.actor.armor -= blocked; victim.actor.health = Math.max(0, victim.actor.health - damage + blocked);
    const killed = victim.actor.health <= 0;
    if (killed && victim.actor.alive) {
      victim.actor.alive = false; victim.actor.deaths++; victim.actor.respawnIn = ARENA_RESPAWN_SECONDS; releaseSeat(victim.actor.id);
      if (attacker && attacker !== victim) attacker.actor.kills++;
      announce(cause && !attacker ? `${cause} killed ${victim.actor.name}` : `${attacker?.actor.name ?? 'Vehicle'} eliminated ${victim.actor.name}`, attacker?.actor.id, victim.actor.id);
      if (attacker && !environment?.endless && attacker.actor.kills >= ARENA_KILL_LIMIT) { finished = true; winner = attacker.actor.name; }
    }
    return { hitId: victim.actor.id, killed, damage: damage - blocked };
  }
  function resolveShot(entry: InternalActor, origin: ArenaPoint, ray: ArenaPoint, damage: number, range: number, ignore?: VehicleKind): ArenaShot {
    let nearest = Math.min(Number.isFinite(range) ? range : 0, worldWallDistance(origin, ray), cover?.(origin, ray, range) ?? Infinity);
    let hull: SharedVehicle | undefined, victim: InternalActor | undefined;
    for (const v of vehicles) {
      if (v.kind === ignore) continue;
      const distance = vehicleRayDistance(v, origin, ray);
      if (distance < nearest) { nearest = distance; hull = v; }
    }
    for (const other of members.values()) {
      if (other === entry || !other.actor.alive || seatOf(vehicles, other.actor.id)) continue;
      const intersection = bodyDistance(origin, ray, other.actor);
      if (intersection < nearest) { victim = other; hull = undefined; nearest = intersection; }
    }
    if (ignore) {
      const v = vehicles.find(v => v.kind === ignore)!;
      v.shotEnd = { x: origin.x + ray.x * nearest, y: origin.y + ray.y * nearest, z: origin.z + ray.z * nearest };
    }
    if (hull) { const before = hull.health; damageHull(hull, damage, entry); return { hitId: `vehicle-${hull.kind}`, killed: before > 0 && hull.health === 0, damage: Math.min(before, damage) }; }
    return victim ? hurtActor(victim, damage, entry) : { ...EMPTY_SHOT };
  }
  function releaseSeat(id: string) {
    const mounted = seatOf(vehicles, id); if (mounted) mounted.vehicle.occupants[mounted.seat] = null;
    const actor = members.get(id)?.actor; if (actor) { delete actor.vehicle; delete actor.seat; }
    controls.delete(id);
  }
  function syncOccupants() {
    for (const v of vehicles) v.occupants.forEach((id, seat) => {
      if (!id) return;
      const entry = members.get(id);
      if (!entry?.actor.alive) { releaseSeat(id); return; }
      Object.assign(entry.actor, seatPoint(v, seat), { vehicle: v.kind, seat, prone: false });
    });
  }
  function vehicleAction(id: string, action: 'enter' | 'exit' | 'switch', kind?: VehicleKind) {
    const entry = members.get(id); if (!entry?.actor.alive || !entry.playing || finished || entry.actor.bot) return false;
    const mounted = seatOf(vehicles, id);
    if (action === 'exit' && mounted) {
      const others = vehicles.filter(v => v !== mounted.vehicle && v.y < 2).map(vehicleBounds);
      const exit = vehicleExit(mounted.vehicle, [...vehicleGround, ...others], bounds); if (!exit) return false;
      releaseSeat(id); Object.assign(entry.actor, exit, { y: 1.75 }); entry.movementBudget = 0; return true;
    }
    if (action === 'switch' && mounted) {
      for (let n = 1; n < 4; n++) { const seat = (mounted.seat + n) % 4; if (mounted.vehicle.occupants[seat] === null) {
        releaseSeat(id); mounted.vehicle.occupants[seat] = id; syncOccupants(); return true;
      } }
      return false;
    }
    if (action !== 'enter' || mounted) return false;
    const v = vehicles.find(v => v.kind === kind);
    if (!v || v.health <= 0 || v.y > .4 || Math.abs(v.speed) > 2 || Math.hypot(entry.actor.x - v.x, entry.actor.z - v.z) > (v.kind === 'car' ? 4.5 : 6) || entry.actor.y > 3) return false;
    const center = { x: v.x, y: v.y + 1.3, z: v.z }, d = distance(entry.actor, center);
    const ray = { x: (center.x - entry.actor.x) / d, y: (center.y - entry.actor.y) / d, z: (center.z - entry.actor.z) / d };
    if (d > .1 && Math.min(worldWallDistance(entry.actor, ray), cover?.(entry.actor, ray, d) ?? Infinity) < d - .2) return false;
    const seat = v.occupants.indexOf(null); if (seat < 0) return false;
    v.occupants[seat] = id; stopReload(entry, entry.actor.weapon); syncOccupants(); return true;
  }
  function damageHull(v: SharedVehicle, damage: number, attacker?: InternalActor, cause?: string) {
    if (!damageVehicle(v, damage)) return;
    const point = { x: v.x, y: v.y + 1.3, z: v.z };
    const crew = [...v.occupants].filter((id): id is string => id !== null);
    for (const id of crew) { const member = members.get(id); if (member) hurtActor(member, member.actor.health + member.actor.armor + 1, attacker, cause); }
    // A wreck is a blast like any other, with the hull's own linear falloff and no stance relief.
    const spec = VEHICLE_COMBAT[v.kind];
    blast(point, { radius: spec.blastRadius, damage: spec.blastDamage, minScale: 0, vehicleScale: 1, stance: false }, attacker, cause, v);
    announce(`${v.kind === 'car' ? 'Utility 01' : 'Falcon 01'} destroyed`, attacker?.actor.id);
  }
  /** Whether nothing solid stands between a blast and what it reaches. */
  function clearBlast(from: ArenaPoint, to: ArenaPoint, length: number) {
    if (length < .1) return true;
    const dir = { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length };
    return Math.min(worldWallDistance(from, dir), cover?.(from, dir, length) ?? Infinity) >= length - .1;
  }
  type BlastItem = { hull: SharedVehicle } | { member: InternalActor };
  function blast(point: ArenaPoint, spec: Parameters<typeof resolveBlast>[1], attacker?: InternalActor, cause?: string, source?: SharedVehicle) {
    const targets: BlastTarget<BlastItem>[] = [];
    // Hulls first, so a chain of wrecks resolves before the crews and bystanders, as it always has.
    for (const other of vehicles) if (other !== source && other.health > 0) targets.push({ item: { hull: other }, point: { x: other.x, y: other.y + 1.3, z: other.z }, vehicle: true });
    for (const member of members.values()) if (member.actor.alive && !seatOf(vehicles, member.actor.id)) {
      const { actor } = member, low = actor.y - floorAt(actor) < 1.4;
      // Wrecks have always measured to the eye; stance-aware blasts measure to the body.
      targets.push({ item: { member }, stance: actor.prone ? 'prone' : low ? 'crouch' : 'stand',
        point: !spec.stance ? { x: actor.x, y: actor.y, z: actor.z } : { x: actor.x, y: actor.prone ? actor.y - PRONE_EYE_HEIGHT + .35 : actor.y - (low ? .45 : .62), z: actor.z } });
    }
    for (const hit of resolveBlast(point, spec, targets, clearBlast)) {
      if ('hull' in hit.item) { if (hit.item.hull.health > 0) damageHull(hit.item.hull, hit.damage, attacker, cause); }
      else if (hit.item.member.actor.alive) hurtActor(hit.item.member, hit.damage, attacker, cause);
    }
  }
  /**
   * Running combat events and the director that starts them. Rounds resolve
   * here, on the authority, at the time their descriptor says they land.
   */
  const director = environment?.combatEvents ? createCombatDirector({ risk: environment.combatEvents.risk, seed: (seed ^ 0x5bd1e995) >>> 0 }) : null;
  let directorEnabled = !!director, eventSerial = 0;
  const events: { descriptor: CombatEventDescriptor; resolved: Set<number>; name: string }[] = [];
  /** Where a round falling along `descent` onto `impact` first meets something solid. */
  function landing(payload: MunitionPayload): ArenaPoint {
    const { descent, impact } = payload, height = 150, length = height / -descent.y;
    const origin = { x: impact.x - descent.x * length, y: height, z: impact.z - descent.z * length };
    const struck = cover ? Math.min(length, cover(origin, descent, length + 2)) : length;
    // Without rendered cover (tests, headless), the walkable deck under the impact is the ground.
    const ground = cover ? 0 : traversal?.supportHeight(impact.x, impact.z, height, .1, .1) ?? 0;
    const at = cover ? struck : (height - ground) / -descent.y;
    // Lifted back up its own path, so the blast does not start inside the surface it struck.
    const back = Math.max(0, at - .4);
    return { x: origin.x + descent.x * back, y: origin.y + descent.y * back, z: origin.z + descent.z * back };
  }
  function startEvent(directive: Pick<CombatEventDescriptor, 'kind' | 'seed' | 'target' | 'heading' | 'intensity' | 'reach' | 'troops'>) {
    const plugin = getCombatEvent(directive.kind);
    if (!plugin || finished || events.length >= MAX_COMBAT_EVENTS || events.filter(e => combatPhase(e.descriptor, elapsed) !== 'aftermath').length >= 3) return null;
    const target = { x: clamp(directive.target.x, bounds.minX, bounds.maxX), z: clamp(directive.target.z, bounds.minZ, bounds.maxZ) };
    const descriptor: CombatEventDescriptor = { id: `event-${++eventSerial}`, kind: plugin.id, seed: directive.seed >>> 0, start: elapsed, target,
      heading: Number.isFinite(directive.heading) ? directive.heading : 0, intensity: clamp(Number.isFinite(directive.intensity) ? directive.intensity : 1, .5, 2),
      ...(Number.isFinite(directive.reach) ? { reach: clamp(directive.reach!, 0, 400) } : {}),
      ...(Number.isInteger(directive.troops) ? { troops: clamp(directive.troops!, 1, 6) } : {}) };
    events.push({ descriptor, resolved: new Set(), name: plugin.name.split(' ')[0] });
    return descriptor;
  }
  /**
   * Debug and scripted starts; `target` defaults to the first human. A
   * transport ignores `target` and plans its own drop, carrying whichever bots
   * are waiting (or nobody, when none are).
   */
  function triggerEvent(kind: string, target?: CombatPlane, heading = random() * Math.PI * 2) {
    if (kind === 'transport-land' || kind === 'transport-air') return dispatchReinforcements(kind === 'transport-land' ? 'land' : 'air');
    const human = [...members.values()].find(m => !m.actor.bot && m.actor.alive)?.actor;
    const aim = target ?? (human ? { x: human.x, z: human.z } : null);
    if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.z)) return null;
    return startEvent({ kind, seed: Math.floor(random() * 0xffffffff) >>> 0, target: aim, heading, intensity: 1 });
  }
  function setCombatEvents(enabled: boolean) { directorEnabled = !!director && enabled; }
  /** At most this many rounds resolve in one tick; the rest land on the next. */
  const BLASTS_PER_TICK = 8;
  function stepEvents() {
    if (director && directorEnabled) {
      const humans = [...members.values()].filter(m => !m.actor.bot && m.actor.alive && m.playing).map(m => ({ x: m.actor.x, z: m.actor.z }));
      const directive = director.step({ now: elapsed, active: events.map(e => e.descriptor), humans, bounds, avoid: environment?.playerSpawn ? [environment.playerSpawn] : [] });
      if (directive) startEvent(directive);
    }
    if (environment?.reinforcements) dispatchReinforcements();
    let budget = BLASTS_PER_TICK;
    for (const event of events) for (const payload of combatTimeline(event.descriptor)) {
      if (budget <= 0) break;
      if ((payload.type !== 'munition' && payload.type !== 'insert') || event.resolved.has(payload.id) || event.descriptor.start + payload.time > elapsed) continue;
      event.resolved.add(payload.id);
      if (payload.type === 'insert') disembark(event.descriptor, payload.slot, payload.at);
      else if (payload.blast) { budget--; blast(landing(payload), payload.blast, undefined, event.name); }
    }
    for (let i = events.length - 1; i >= 0; i--) if (combatPhase(events[i].descriptor, elapsed) === 'done') events.splice(i, 1);
    // A ride whose event is gone (a reset, a cap) will never arrive: wait for the next one.
    for (const member of members.values()) if (member.ride && !events.some(e => e.descriptor.id === member.ride!.event)) member.ride = undefined;
  }
  let nextDispatch = 0;
  /**
   * Books a transport for the bots waiting on one, at most one ride on the
   * road at a time. `force` sends one now, by road or air, waiting or not.
   */
  function dispatchReinforcements(force?: 'land' | 'air') {
    const waiting = [...members.values()].filter(m => m.actor.bot && !m.actor.alive && m.waiting !== undefined && !m.ride).sort((a, b) => a.waiting! - b.waiting!);
    if (!force) {
      if (elapsed < nextDispatch || [...members.values()].some(m => m.ride)) return null;
      if (!waiting.length || (waiting.length < 2 && elapsed - waiting[0].waiting! < REINFORCEMENT_WAIT)) return null;
    }
    const humans = [...members.values()].filter(m => !m.actor.bot && m.actor.alive).map(m => ({ x: m.actor.x, z: m.actor.z }));
    const plan = planTransport({ drops: validSpawns, humans, bounds, clearRun, openSky }, random, force);
    const troops = waiting.slice(0, REINFORCEMENT_SEATS);
    const descriptor = plan && startEvent({ ...plan, seed: Math.floor(random() * 0xffffffff) >>> 0, intensity: 1, troops: Math.max(1, troops.length) });
    if (!descriptor) { nextDispatch = elapsed + 5; return null; }
    troops.forEach((member, slot) => { member.ride = { event: descriptor.id, slot }; });
    return descriptor;
  }
  /** A waiting bot steps off its transport at `at`, or at the drop if that spot is blocked. */
  function disembark(event: CombatEventDescriptor, slot: number, at: CombatPlane) {
    const member = [...members.values()].find(m => m.ride?.event === event.id && m.ride.slot === slot);
    if (!member || member.actor.alive) return;
    spawn(member);
    const point = clearSpawn(at) ? at : event.target;
    const human = [...members.values()].filter(m => !m.actor.bot && m.actor.alive).sort((a, b) => distance(a.actor, member.actor) - distance(b.actor, member.actor))[0]?.actor;
    Object.assign(member.actor, { x: point.x, z: point.z, yaw: human ? Math.atan2(-(human.x - point.x), -(human.z - point.z)) : event.heading });
  }
  /** Solids a truck would hit: what vehicles already drive against, curbs aside. */
  const truckSolids = vehicleGround.filter(o => (o.maxY ?? 200) > .15);
  /** How far a truck can drive from `from` along `direction` before it is stopped, sampled in short steps. */
  function clearRun(from: CombatPlane, direction: CombatPlane, limit: number) {
    const end = { x: from.x + direction.x * limit, z: from.z + direction.z * limit }, pad = 2;
    const near = truckSolids.filter(o => o.maxX >= Math.min(from.x, end.x) - pad && o.minX <= Math.max(from.x, end.x) + pad &&
      o.maxZ >= Math.min(from.z, end.z) - pad && o.minZ <= Math.max(from.z, end.z) + pad);
    let at = { x: from.x, z: from.z };
    for (let travelled = 0; travelled < limit; travelled += 2.5) {
      const step = Math.min(2.5, limit - travelled), next = move(at, direction.x * step, direction.z * step, 1.3, near);
      if (Math.hypot(next.x - at.x - direction.x * step, next.z - at.z - direction.z * step) > .2) return travelled;
      at = next;
    }
    return limit;
  }
  /** Nothing overhead for a helicopter to hover under. */
  function openSky(at: CombatPlane) {
    const origin = { x: at.x, y: 2, z: at.z }, up = { x: 0, y: 1, z: 0 };
    return Math.min(worldWallDistance(origin, up), cover?.(origin, up, 70) ?? Infinity) >= 69;
  }
  /** Which way out of the nearest live danger area, or null when standing clear of all of them. */
  function dangerExit(actor: ArenaPoint) {
    for (const event of events) {
      if (!['warning', 'active'].includes(combatPhase(event.descriptor, elapsed))) continue;
      for (const payload of combatTimeline(event.descriptor)) {
        if (payload.type !== 'marker') continue;
        const dx = actor.x - payload.center.x, dz = actor.z - payload.center.z, d = Math.hypot(dx, dz);
        if (d < payload.radius + 2) return d > .01 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 };
      }
    }
    return null;
  }
  function stepVehicles(dt: number) {
    for (const v of vehicles) {
      v.weaponCooldown = Math.max(0, v.weaponCooldown - dt);
      const held = (id: string | null) => id && (controls.get(id)?.expires ?? 0) > elapsed ? controls.get(id)!.input : undefined;
      const drive = held(v.occupants[0]);
      const ground = [...vehicleGround, ...vehicles.filter(other => other !== v && other.y < 2).map(vehicleBounds)];
      const flight = [...(vehicleOptions?.flightObstacles ?? obstacles.map(o => ({ ...o, minY: 0, maxY: o.maxY ?? 2.5 }))), ...vehicles.filter(other => other !== v).map(other => ({ ...vehicleBounds(other), minY: other.y, maxY: other.y + 2.7 }))];
      if (v.health <= 0) {
        const support = flight.filter(o => o.maxY <= v.y && v.x >= o.minX && v.x <= o.maxX && v.z >= o.minZ && v.z <= o.maxZ).reduce((y, o) => Math.max(y, o.maxY), .13);
        v.climb -= 9.8 * dt; v.y = Math.max(support, v.y + v.climb * dt); if (v.y === support) v.climb = 0; continue;
      }
      // Substeps keep vehicle physics advancing at wall-clock speed with slow hosts.
      const speed = Math.hypot(v.speed, v.climb);
      const result = v.kind === 'car' ? driveVehicle(v, drive?.forward ?? 0, drive?.steer ?? 0, drive?.brake ?? !drive, dt, ground, bounds)
        : flyVehicle(v, drive?.forward ?? 0, drive?.steer ?? 0, drive?.lift ?? 0, drive?.boost ?? false, dt, flight, bounds);
      Object.assign(v, result.state);
      if (result.blocked) damageHull(v, vehicleCollisionDamage(speed));
      const gunner = gunnerId(v), gun = held(gunner);
      const ray = vehicleGunRay(v, gun?.aim);
      if (gun?.fire && gunner && fireVehicleWeapon(v)) {
        const entry = members.get(gunner); if (!entry) continue;
        v.shots++; entry.actor.shots++;
        resolveShot(entry, ray.origin, ray.direction, VEHICLE_COMBAT[v.kind].damage, VEHICLE_COMBAT[v.kind].range, v.kind);
      }
    }
    syncOccupants();
  }
  /**
   * Whether rendered cover leaves a bot a line to its target. Boxes alone let
   * bots see, and so shoot, through every wall that is only a mesh. The cast
   * is cached briefly per bot so a full arena does not raycast every tick.
   */
  function clearSight(entry: InternalActor, target: string, ray: ArenaPoint, length: number, dt: number) {
    if (!cover) return true;
    const sight = entry.sight;
    if (sight && sight.target === target && (sight.wait -= dt) > 0) return sight.clear;
    const clear = cover(entry.actor, ray, length) >= length - .5;
    entry.sight = { target, clear, wait: ARENA_SIGHT_RECHECK };
    return clear;
  }
  function stepBot(entry: InternalActor, dt: number) {
    const actor = entry.actor;
    const role = entry.role!;
    const enemies = [...members.values()].filter(m => m !== entry && m.actor.alive);
    const enemy = enemies.sort((a, b) => distance(actor, a.actor) * (a.actor.bot ? 1.1 : 1) - distance(actor, b.actor) * (b.actor.bot ? 1.1 : 1))[0];
    entry.patrolTime -= dt;
    if (entry.patrolTime <= 0) { entry.patrol = validSpawns[Math.floor(random() * validSpawns.length)]; entry.patrolTime = 3 + random() * 3; entry.strafe *= -1; }
    const target = enemy?.actor ?? { ...entry.patrol, y: 1.75 };
    const dx = target.x - actor.x; const dz = target.z - actor.z; const horizontal = Math.hypot(dx, dz);
    const direction = { x: dx / Math.max(horizontal, 0.01), y: 0, z: dz / Math.max(horizontal, 0.01) };
    const line = { x: target.x - actor.x, y: (enemy?.actor.prone ? target.y - PRONE_EYE_HEIGHT + .35 : target.y - .65) - actor.y, z: target.z - actor.z };
    const length = Math.hypot(line.x, line.y, line.z);
    const ray = { x: line.x / Math.max(length, 0.01), y: line.y / Math.max(length, 0.01), z: line.z / Math.max(length, 0.01) };
    const visible = !!enemy && length < role.sightRange && worldWallDistance(actor, ray) >= length - 0.5 && clearSight(entry, enemy.actor.id, ray, length, dt);
    const intent = role.think({ distance: horizontal, visible, healthFraction: actor.health / entry.healthMax, strafeDirection: entry.strafe });
    const approach = Number.isFinite(intent.approach) ? clamp(intent.approach, -1, 1) : 0;
    const strafe = Number.isFinite(intent.strafe) ? clamp(intent.strafe, -1, 1) : 0;
    const normal = Math.max(1, Math.hypot(approach, strafe));
    let dxStep = (direction.x * approach - direction.z * strafe) / normal * role.speed * dt;
    let dzStep = (direction.z * approach + direction.x * strafe) / normal * role.speed * dt;
    if((navigator && Math.abs(target.y-actor.y)>.6) || entry.navigation?.path.length) {
      const feet={x:actor.x,y:Math.max(0,actor.y-1.75),z:actor.z};
      const goal={x:target.x,y:floorAt(target),z:target.z};
      if(entry.navigation) entry.navigation.retry-=dt;
      if(navigator && (!entry.navigation || !entry.navigation.pending && entry.navigation.retry<=0 && (!entry.navigation.path.length || distance(entry.navigation.target,goal)>4)))
        entry.navigation={path:[],target:goal,retry:1.5,pending:navigator.plan(feet,goal)};
      if(entry.navigation?.pending){
        // Cold graph edges are checked over several frames, never in one long
        // synchronous search. Six bots share at most roughly 6 ms per tick.
        const deadline=performance.now()+1;
        do{const result=entry.navigation.pending.next();if(result.done){entry.navigation.path=result.value;entry.navigation.pending=undefined;break;}}while(performance.now()<deadline);
        // Hold position while a fresh path is planned so its start remains valid.
        dxStep=0;dzStep=0;
      }
      const path=entry.navigation?.path;
      while(path?.length && distance(feet,path[0])<.12)path.shift();
      if(path?.length){const p=path[0],d=Math.hypot(p.x-actor.x,p.z-actor.z),step=Math.min(d,role.speed*dt);dxStep=(p.x-actor.x)/Math.max(d,.001)*step;dzStep=(p.z-actor.z)/Math.max(d,.001)*step;}
    }
    // Bots run from a marked barrage, still firing if they can see someone.
    const exit = dangerExit(actor);
    if (exit) { dxStep = exit.x * role.speed * 1.3 * dt; dzStep = exit.z * role.speed * 1.3 * dt; }
    const vehicleSolids = vehicles.filter(v => v.y < 2).map(vehicleBounds);
    if (traversal) {
      const step = traversal.move({ x: actor.x, y: Math.max(0, actor.y - 1.75), z: actor.z, velocityY: entry.velocityY ?? 0 }, dxStep, dzStep, dt, .4, 1.8, vehicleSolids);
      Object.assign(actor, { x: step.x, z: step.z, y: step.y + 1.75 }); entry.velocityY = step.velocityY;
    } else Object.assign(actor, move(actor, dxStep, dzStep, .4, [...groundObstacles, ...vehicleSolids]));
    actor.yaw = Math.atan2(-dx, -dz); actor.pitch = Math.atan2(line.y, horizontal);
    if (!visible || !intent.fire) { entry.reaction = role.reaction; entry.target = ''; return; }
    if (entry.target !== enemy.actor.id) { entry.target = enemy.actor.id; entry.reaction = role.reaction + random() * 0.3; }
    entry.reaction -= dt;
    if (entry.reaction <= 0) {
      // Deliberate arcade inaccuracy gives moving players time to react.
      const spread = Number.isFinite(intent.spread) ? clamp(intent.spread, 0.005, 0.2) : 0.05;
      shoot(actor.id, actor, { x: ray.x + (random() - 0.5) * spread, y: ray.y + (random() - 0.5) * spread, z: ray.z + (random() - 0.5) * spread }, actor.weapon);
      entry.reaction = (Number.isFinite(intent.shotDelay) ? clamp(intent.shotDelay, 0.1, 5) : 0.5) + random() * 0.15;
    }
  }
  function step(dt: number) {
    if (finished || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.25); elapsed = environment?.endless ? elapsed + dt : Math.min(ARENA_DURATION, elapsed + dt); tick++;
    for (let remaining = dt; remaining > 1e-6; remaining -= Math.min(.05, remaining)) stepVehicles(Math.min(.05, remaining));
    stepEvents();
    for (const entry of members.values()) {
      entry.movementBudget = Math.min(8, entry.movementBudget + 40 * dt);
      if (!entry.actor.alive) {
        entry.actor.respawnIn = Math.max(0, entry.actor.respawnIn - dt);
        if (entry.actor.respawnIn === 0) {
          // With reinforcements, a fallen bot comes back on a transport; only one left waiting too long walks back in.
          if (!environment?.reinforcements || !entry.actor.bot) spawn(entry);
          else { entry.waiting ??= elapsed; if (!entry.ride && elapsed - entry.waiting > REINFORCEMENT_FALLBACK) spawn(entry); }
        }
        continue;
      }
      entry.weapons.forEach((weapon, index) => {
        entry.cooldown[index] = Math.max(0, entry.cooldown[index] - dt);
        if (entry.reload[index] > 0) {
          const commit = reloadCommit(entry.reloadEmpty[index] === true), before = 1 - entry.reload[index] / weapon.reload;
          entry.reload[index] = Math.max(0, entry.reload[index] - dt);
          if (before < commit && (entry.reload[index] === 0 || 1 - entry.reload[index] / weapon.reload >= commit)) entry.rounds[index] = weapon.capacity;
        }
      });
      if (entry.actor.bot) stepBot(entry, dt);
      if (finished) break;
    }
    if (!environment?.endless && elapsed >= ARENA_DURATION && !finished) {
      finished = true;
      const leaders = [...members.values()].map(m => m.actor).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      winner = leaders.length > 1 && leaders[0].kills === leaders[1].kills && leaders[0].deaths === leaders[1].deaths ? 'Draw' : leaders[0]?.name ?? 'Draw';
      announce(`${winner === 'Draw' ? 'Draw' : `${winner} wins`} · time limit`);
    }
  }
  function snapshot(): ArenaSnapshot {
    return { type: 'arena-snapshot', tick, elapsed, actors: [...members.values()].map(m => ({ ...m.actor })), feed: feed.map(event => ({ ...event })), finished, winner, ...(vehicleOptions ? { vehicles: vehicles.map(v => ({ ...v, occupants: [...v.occupants], shotEnd: v.shotEnd ? { ...v.shotEnd } : null })) } : {}),
      ...(events.length ? { events: events.map(e => ({ ...e.descriptor, target: { ...e.descriptor.target } })) } : {}) };
  }
  function reset() {
    tick = 0; elapsed = 0; finished = false; winner = ''; feed.length = 0; controls.clear(); events.length = 0; director?.reset();
    vehicles = vehicleOptions ? (['car', 'helicopter'] as const).map(kind => createSharedVehicle(kind, vehicleOptions.spawns[kind])) : [];
    for (const entry of members.values()) { entry.actor.kills = 0; entry.actor.deaths = 0; entry.actor.shots = 0; spawn(entry); }
    announce('New arena match');
  }
  const count = Number.isFinite(botCount) ? Math.floor(clamp(botCount, 0, 6)) : 0;
  for (let i = 0; i < count; i++) {
    const id = `bot-${i + 1}`;
    const role = getArenaRole(composition === 'mixed' ? ['assault', 'tank', 'sniper'][i % 3] : composition) ?? getArenaRole('assault')!;
    const armed = armamentFamilies(role), weapons = FPS_WEAPONS.map((w, index) => armed.includes(index) ? role.weapon : w);
    addPlayer(id, `${role.name.split(' ')[0]} ${['Merlion', 'Orchid', 'Sentosa', 'Katong', 'Jewel', 'Kallang'][i]}`, role.armor, role.absorption, weapons);
    const entry = members.get(id)!; entry.role = role; entry.healthMax = role.health;
    Object.assign(entry.actor, { bot: true, role: role.id }); spawn(entry);
  }
  return { vehicleAction, addPlayer, removePlayer, setInput, reloadPlayer, shoot, step, snapshot, reset, setPlayerLoadout, setPlayerVitals, setPlayerHealthMultiplier, triggerEvent, setCombatEvents };
}

export type ArenaSimulation = ReturnType<typeof createArena>;
