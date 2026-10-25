import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { createVerticalNavigator, type NavigationPoint } from './vertical-navigation';
import { createVerticalMovement, type VerticalWorld } from './vertical-movement';
import { validVehicleControls, createSharedVehicle, seatOf, seatPoint, gunnerId, vehicleGunRay, vehicleRayDistance, type SharedVehicle, type VehicleControls } from './vehicle-seats';
import { driveVehicle, flyVehicle, vehicleBounds, vehicleExit, type VehicleKind, type VehicleSpawn, type FlightObstacle } from './vehicle-rules';
import { damageVehicle, fireVehicleWeapon, vehicleCollisionDamage, VEHICLE_COMBAT } from './vehicle-combat';
import { applyArmorDamage } from './armory-state';
import { PRONE_EYE_HEIGHT, weaponBraced, unsupportedRecoilDamage } from './fps-stance';
import { MARINA_BOUNDS, moveInMarina, type Obstacle } from './marina-collision';
import { advanceWeapon, beginReload, createLoadout, FPS_WEAPONS, fireWeapon, hitDamage, interruptReload, reloadCommit, reloadProgress, roundReady, type WeaponSpec, type WeaponState } from './fps-rules';
import { armamentFamilies, chooseArmament, getArenaRole, type ArenaRolePlugin } from './arena-roles';
import { variantSpec } from './armory-state';
import { BOT_HEAL, botFireCadence, botShotSpread, botWantsHeal } from './arena-bot-combat';
import { DRONE, DRONE_BLAST, MORTAR, OVERWATCH, RAID, SUPPLY } from './combat-event-catalog';
import { combatPhase, combatTimeline, getCombatEvent, orbitPose, MAX_COMBAT_EVENTS, MAX_TROOPS, type CloudPayload, type CombatEventDescriptor, type CombatOutcome, type CombatPlane, type CratePayload, type MunitionPayload, type OrbitPayload } from './combat-events';
import { createCombatDirector, planTransport, type CombatRisk } from './combat-director';
import { OVERHEAD_SHELTER, resolveBlast, type BlastTarget } from './combat-blast';
import { DEFAULT_BOT_FACTION, getArenaFaction, hostile, PLAYER_FACTION, SQUAD_FACTIONS, type SquadFaction } from './arena-factions';
import { createHeatField, HEAT_TUNING, type HeatBand, type HeatSector } from './faction-heat';

/** All coordinates use metres; actor y is eye height, not the feet. */
export interface ArenaActor {
  id: string; name: string; bot: boolean; x: number; y: number; z: number; yaw: number; pitch: number;
  health: number; armor: number; kills: number; deaths: number; alive: boolean; respawnIn: number; weapon: number;
  shots: number; role: string; prone?: boolean; vehicle?: VehicleKind; seat?: number;
  /** Who they fight for (arena-factions): players and friendly squads the armed forces, enemy squads the mercenaries, event crews their event's side. */
  faction: string;
  /** Bots: the catalog variant in their hands, which is what they drop. */
  variant?: string;
  /** Bots: share of a field dressing already applied, while they are patching up. */
  healing?: number;
  /** Where the last thing that hurt this actor came from; `serial` changes with every hit. */
  hurtFrom?: { x: number; z: number; serial: number; blast?: boolean };
  /** A rooftop sniper with someone in their scope: renderers show the glint. */
  aiming?: boolean;
  /** Feet height of an actor held on a perch the walk surfaces do not describe, such as a roof. */
  ground?: number;
}
export type ArenaRaiderState = 'inbound' | 'orbit' | 'leaving' | 'cruise' | 'lock' | 'dive' | 'down' | 'wreck' | 'exploded';
/**
 * A combat event's machine that can be shot: a raid helicopter or a drone.
 * Its event says where it was meant to go; this is where it is and what it
 * is doing, because the host flies, aims and damages it.
 */
export interface ArenaRaider {
  event: string; kind: 'gunship' | 'drone';
  x: number; y: number; z: number; yaw: number; health: number; maxHealth: number;
  state: ArenaRaiderState;
  /** Where its gun or its dive is pointed, if anywhere. */
  aim: ArenaPoint | null;
  /** Rounds fired so far; a change is a shot for the renderer to draw. */
  shots: number;
}
export interface ArenaFeed { id: string; text: string; killerId?: string; victimId?: string }
export interface ArenaSnapshot {
  type: 'arena-snapshot'; tick: number; elapsed: number; actors: ArenaActor[];
  feed: ArenaFeed[]; finished: boolean; winner: string; vehicles?: SharedVehicle[];
  /** Combat events still running or lingering; each one's rounds follow from its descriptor. */
  events?: CombatEventDescriptor[];
  /** Raid helicopters and drones in the air, or coming down. */
  raiders?: ArenaRaider[];
  /** Each sector's heat per faction, with '' for the district; only where the environment has heat. */
  heat?: ArenaHeat[];
}
export type ArenaHeat = { sector: string } & Record<SquadFaction, number>;
export interface ArenaInput { x: number; y: number; z: number; yaw: number; pitch: number; weapon: number; playing: boolean; reloading?: boolean; prone?: boolean; vehicleControls?: VehicleControls }
export type ArenaWeapon = Pick<WeaponSpec, 'damage' | 'interval' | 'capacity' | 'reload' | 'requiresMount' | 'bolt'>;
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
  /**
   * With reinforcements, transports fill their empty seats with fresh
   * contractors until this many bots are in the district; defaults to the
   * starting garrison, so only the fallen come back.
   */
  population?: number;
  /**
   * Faction heat by sector (faction-heat.ts). With it, heat replaces
   * `population`: each side's headcount, top-up pace, drop sectors and kit
   * follow its heat, and the forces field small friendly squads of their own.
   */
  heat?: { sectors: readonly HeatSector[]; defaults: Record<SquadFaction, HeatBand> };
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
/** How long a bot keeps after whoever last hurt it, even someone it would not otherwise look for (a sniper on a roof). */
export const GRUDGE_SECONDS = 8;
/** Recent fighting decays with this time constant, in seconds; the director aims world events at what is left. */
export const HEAT_DECAY = 45;
/** How long a patrol with nobody in sight keeps going to look at a wreck. */
export const WRECK_INTEREST = 45;
/** A lone fallen bot waits this long for company before a transport is sent for it. */
export const REINFORCEMENT_WAIT = 6;
/** A bot no transport has come for by now reappears at a spawn point, as before. */
export const REINFORCEMENT_FALLBACK = 45;
/** Troops per transport: a truck's two benches, a helicopter's two ropes. */
export const REINFORCEMENT_SEATS = { land: MAX_TROOPS, air: 6 } as const;
/** A garrison below strength, with nobody waiting, is topped up no sooner than this after the start or the last ride. */
export const REINFORCEMENT_TOP_UP = 20;
/** How much each side's surge (0–1) speeds the combat director: at both sides' ceilings, strikes come 2.4 times as often. */
export const HEAT_PACE: Readonly<Record<SquadFaction, number>> = { mercenaries: 1, 'armed-forces': .4 };
/** Most bots one match fields, recruits and friendly squads included. */
export const MAX_ARENA_BOTS = 20;
/** A bot with a home sector only answers contacts this close and otherwise patrols home; a surging side ranges up to twice as far. */
export const HOME_LEASH = 90;
/** Most actors one match holds: every bot and room for players. */
export const MAX_ARENA_ACTORS = MAX_ARENA_BOTS + 8;
/** Every bot's planned route shares this many milliseconds of search per tick. */
const NAVIGATION_BUDGET = 6;
/** Friendly soldiers: rank by role, then surname. */
const FORCES_RANKS: Record<string, string> = { assault: 'Pte', tank: 'Cpl', sniper: 'Sgt' };
const FORCES_NAMES = ['Tan', 'Rahman', 'Kumar', 'Lim', 'Hafiz', 'Ong', 'Raj', 'Goh', 'Iskandar', 'Chua'];
const CALLSIGNS = ['Merlion', 'Orchid', 'Sentosa', 'Katong', 'Jewel', 'Kallang', 'Bedok', 'Changi', 'Kranji', 'Seletar', 'Tekong', 'Ubin', 'Simei', 'Lentor', 'Dover', 'Pasir'];
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
  /**
   * Per weapon, the same ammunition state and rules as the player's own gun
   * (fps-rules), with an unlimited reserve: magazine, chamber, cooldown and an
   * interruptible, resumable reload.
   */
  ammo: WeaponState[]; playing: boolean; movementBudget: number; wasReloading: boolean;
  usePlayerSpawn: boolean;
  reaction: number; target: string; strafe: number; patrol: { x: number; z: number }; patrolTime: number;
  sight?: { target: string; clear: boolean; wait: number };
  /** Reinforcements: when this fallen bot started waiting for a ride, and the seat it was given. */
  waiting?: number; ride?: { event: string; slot: number };
  /**
   * Bots: the drawn variant's own figures, so a G36 hits, cycles, falls off and
   * reloads like a G36 rather than like whatever the role was balanced on.
   */
  spec?: WeaponSpec;
  /** Bots: rounds left in the burst under way, and how many it has fired. */
  burst: number; burstFired: number;
  /** Bots: dressings carried, the dressing being applied, and when they were last hit. */
  medkits: number; heal?: { time: number; feet: number; started: number }; lastHurt: number;
  /** Fielded by a combat event: never respawns, holds fire until `from` (the event's warning), and leaves when the event does. */
  temporary?: { event: string; from: number };
  /** Holds this spot. With `y`, at that feet height whatever the walk surfaces say (a roof). */
  anchor?: { x: number; z: number; y?: number };
  /** Who last hurt this actor, and until when that is worth turning round for. */
  grudge?: { id: string; until: number };
  /** Enlisted by a transport beyond the starting garrison; `reserve` until it first steps off one, and left out of snapshots. */
  recruit?: boolean; reserve?: boolean;
  /** With heat: the sector this bot was dropped into, which it patrols and defends. */
  home?: string;
}
interface Raider extends ArenaRaider {
  vx: number; vy: number; vz: number;
  /** Gunship: the burst under way. Drone: who it is locked on to. */
  victim?: string; since: number; fired: number; walk?: ArenaPoint;
  /** Next time it may look for someone; seconds without a line to its victim; when it is cleared away. */
  next: number; lost: number; until: number; angle: number;
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
/** A full gun; the host keeps no reserve, so every reload refills it. */
const hostAmmo = (weapon: ArenaWeapon): WeaponState => createLoadout([{ ...weapon, reserve: Infinity }])[0];
const finitePoint = (p: ArenaPoint) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const distance = (a: ArenaPoint, b: ArenaPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const UP = { x: 0, y: 1, z: 0 }, DOWN = { x: 0, y: -1, z: 0 };
/** Where a round aimed at someone's middle goes: the chest standing, the back lying down. */
const chestOf = (actor: ArenaActor): ArenaPoint => ({ x: actor.x, y: actor.prone ? actor.y - PRONE_EYE_HEIGHT + .35 : actor.y - .62, z: actor.z });

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
/** Whether a ray that reaches `actor` passes through the head rather than the torso. */
function headHit(origin: ArenaPoint, direction: ArenaPoint, actor: ArenaActor, distance: number) {
  const head = actor.prone ? { x: actor.x, y: actor.y - PRONE_EYE_HEIGHT + .45, z: actor.z } : { x: actor.x, y: actor.y - .06, z: actor.z };
  return Math.abs(sphereDistance(origin, direction, head, .15) - distance) < .35;
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
  // Faction heat (who pushes how hard where), not the activity grid `heat` further down that aims world events.
  const factionHeat = environment?.reinforcements && environment.heat ? createHeatField(environment.heat) : null;
  const isSquad = (faction: string): faction is SquadFaction => (SQUAD_FACTIONS as readonly string[]).includes(faction);
  const inside = (p: { x: number; z: number }, b: HeatSector['bounds']) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
  let vehicles: SharedVehicle[] = vehicleOptions ? (['car', 'helicopter'] as const).map(kind => createSharedVehicle(kind, vehicleOptions.spawns[kind])) : [];
  const controls = new Map<string, { input: VehicleControls; expires: number }>();
  let tick = 0; let elapsed = 0; let finished = false; let winner = ''; let eventId = 0; let seed = 92371, hurtSerial = 0;
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
    if (entry.role && entry.actor.faction === PLAYER_FACTION) {
      // Friendly soldiers carry the issued rifle, or the Ultimax in support, and drop nothing.
      entry.actor.weapon = forcesFamily(entry.role); delete entry.actor.variant; entry.spec = undefined; entry.medkits = entry.role.medkits ?? 1;
    } else if (entry.role) {
      const issued = chooseArmament(entry.role, armamentRandom); entry.actor.weapon = issued.family; entry.actor.variant = issued.id;
      // What they carry is what they fire: the variant's damage, falloff, cycle, magazine and reload.
      entry.spec = variantSpec(issued) ?? undefined;
      if (entry.spec) entry.weapons[issued.family] = sanitizeWeapons([entry.spec])[0];
      entry.medkits = entry.role.medkits ?? 1;
    }
    if (entry.role && factionHeat && isSquad(entry.actor.faction)) {
      // Kit follows heat: a hot sector's troops come back with heavier armour.
      entry.armorMax = clamp(entry.role.armor * (.75 + .5 * factionHeat.strength(entry.actor.faction, entry.home ?? null)), 0, 150); entry.actor.armor = entry.armorMax;
    }
    entry.ammo = entry.weapons.map(hostAmmo);
    entry.burst = 0; entry.burstFired = 0; entry.heal = undefined; entry.lastHurt = -Infinity; delete entry.actor.healing;
    entry.navigation = undefined; entry.velocityY = 0; entry.waiting = undefined; entry.ride = undefined; entry.reserve = false;
    entry.movementBudget = 2; entry.reaction = 1; entry.target = ''; entry.wasReloading = false;
  };
  function sanitizeWeapons(weapons: readonly ArenaWeapon[]) {
    return (weapons.length ? weapons : FPS_WEAPONS).slice(0, FPS_WEAPONS.length).map((w): ArenaWeapon => ({
      requiresMount: w.requiresMount === true, bolt: w.bolt === 'open' ? 'open' : 'closed',
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
    const entry = addMember(id, name, armor, absorption, weapons, usePlayerSpawn, allowed); if (!entry) return;
    if (initialVitals) setPlayerVitals(id, initialVitals); announce(`${entry.actor.name} joined`);
  }
  /** A new member, spawned, with nothing said in the feed. */
  function addMember(id: string, name: string, armor: number, absorption: number, weapons: readonly ArenaWeapon[], usePlayerSpawn: boolean, allowed?: readonly number[]) {
    if (!id || id.length > 100 || members.has(id) || members.size >= MAX_ARENA_ACTORS) return null;
    const safeWeapons = sanitizeWeapons(weapons), allowedWeapons = allowedIndexes(safeWeapons, allowed);
    const entry: InternalActor = {
      actor: { id, name: name.trim().slice(0, 24) || 'Player', bot: false, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0,
        health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: allowedWeapons[0], prone: false, shots: 0, role: 'player', faction: PLAYER_FACTION },
      healthMax: 100, armorMax: Number.isFinite(armor) ? clamp(armor, 0, 150) : 0, absorption: Number.isFinite(absorption) ? clamp(absorption, 0, 0.9) : 0,
      weapons: safeWeapons, allowedWeapons, ammo: [], playing: true, movementBudget: 2, wasReloading: false, usePlayerSpawn,
      reaction: 1, target: '', strafe: random() < 0.5 ? -1 : 1, patrol: validSpawns[0], patrolTime: 0,
      burst: 0, burstFired: 0, medkits: 0, lastHurt: -Infinity,
    };
    members.set(id, entry); spawn(entry); return entry;
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
      if (changed || !entry.ammo[index]) entry.ammo[index] = hostAmmo(weapon);
    });
    entry.weapons = next; entry.ammo.length = next.length;
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
  /** The host's ammunition rules are the player's, so a reload starts, resumes and commits the same way. */
  function startReload(entry: InternalActor, index: number) {
    if (entry.weapons[index] && entry.ammo[index]) beginReload(entry.ammo[index], index, entry.weapons);
  }
  function stopReload(entry: InternalActor, index: number) {
    const state = entry.ammo[index];
    if (!state || !entry.weapons[index] || !(state.reloadRemaining > 0)) return;
    // A guest's reload began, and so ends, a network trip before ours: just
    // short of the commit point, its gun is already ready over there.
    if (reloadProgress(state, index, entry.weapons) >= reloadCommit(state.reloadEmpty === true) - RELOAD_COMMIT_GRACE) advanceWeapon(state, index, state.reloadRemaining, entry.weapons);
    else interruptReload(state, index, entry.weapons);
  }
  function shoot(id: string, origin: ArenaPoint, direction: ArenaPoint, weapon: number, maxDistance = 125): ArenaShot {
    const entry = members.get(id);
    if (!entry || seatOf(vehicles, id) || finished || !entry.actor.alive || !entry.playing || !finitePoint(origin) || !finitePoint(direction)) return { ...EMPTY_SHOT };
    if (!Number.isInteger(weapon) || weapon !== entry.actor.weapon || !entry.weapons[weapon] || !entry.allowedWeapons.includes(weapon)) return { ...EMPTY_SHOT };
    const ammo = entry.ammo[weapon];
    if (distance(origin, entry.actor) > 1.5 || ammo.cooldown > 1e-7 || ammo.reloadRemaining > 0) return { ...EMPTY_SHOT };
    const length = Math.hypot(direction.x, direction.y, direction.z); if (length < 0.5 || length > 1.5) return { ...EMPTY_SHOT };
    const ray = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    if (!roundReady(ammo, entry.weapons[weapon])) { startReload(entry, weapon); return { ...EMPTY_SHOT }; }
    const recoilDamage = unsupportedRecoilDamage(entry.weapons[weapon], entry.actor.prone === true, entry.actor.y <= floorAt(entry.actor) + 1.17, !entry.actor.prone && entry.actor.y <= floorAt(entry.actor) + 1.17);
    if (recoilDamage) {
      const damage = applyArmorDamage(entry.actor.health, entry.actor.armor, recoilDamage, entry.absorption);
      entry.actor.health = damage.health; entry.actor.armor = damage.armor;
      if (!entry.actor.health) {
        entry.actor.alive = false; entry.actor.deaths++; entry.actor.respawnIn = ARENA_RESPAWN_SECONDS;
        announce(`${entry.actor.name} was defeated by unsupported .50 recoil`, undefined, id);
      }
    }
    ammo.cooldown = 0; fireWeapon(ammo, weapon, entry.weapons); entry.actor.shots++; warm(entry.actor, 1);
    if (!roundReady(ammo, entry.weapons[weapon])) startReload(entry, weapon);
    return resolveShot(entry, origin, ray, entry.weapons[weapon].damage, Math.min(125, Math.max(0, maxDistance)), undefined, entry.spec);
  }
  /**
   * `cause` names what did it when no actor did, as in "Artillery killed …";
   * it credits nobody. `piercing` damage (gas) goes round armour, not through it.
   */
  function hurtActor(victim: InternalActor, damage: number, attacker?: InternalActor, cause?: string, from?: ArenaPoint, blasted = false, piercing = false) {
    const source = from ?? attacker?.actor;
    if (source && attacker !== victim) victim.actor.hurtFrom = { x: source.x, z: source.z, serial: ++hurtSerial, ...(blasted ? { blast: true } : {}) };
    victim.lastHurt = elapsed;
    if (attacker && attacker !== victim) victim.grudge = { id: attacker.actor.id, until: elapsed + GRUDGE_SECONDS };
    const blocked = piercing ? 0 : Math.min(victim.actor.armor, damage * victim.absorption);
    victim.actor.armor -= blocked; victim.actor.health = Math.max(0, victim.actor.health - damage + blocked);
    const killed = victim.actor.health <= 0;
    if (killed && victim.actor.alive) {
      victim.actor.alive = false; victim.actor.deaths++; victim.actor.respawnIn = ARENA_RESPAWN_SECONDS; releaseSeat(victim.actor.id);
      victim.heal = undefined; delete victim.actor.healing;
      if (attacker && attacker !== victim) attacker.actor.kills++;
      if (factionHeat && isSquad(victim.actor.faction)) factionHeat.casualty(victim.actor.faction, factionHeat.sectorAt(victim.actor.x, victim.actor.z)?.id ?? null, heatShare(victim, attacker));
      announce(cause && !attacker ? `${cause} killed ${victim.actor.name}` : `${attacker?.actor.name ?? 'Vehicle'} eliminated ${victim.actor.name}`, attacker?.actor.id, victim.actor.id);
      warm(victim.actor, 4);
      if (attacker && !environment?.endless && attacker.actor.kills >= ARENA_KILL_LIMIT) { finished = true; winner = attacker.actor.name; }
    } else if (!killed && factionHeat && isSquad(victim.actor.faction) && attacker !== victim && damage > 0) {
      // Taking fire heats a side a little before anyone falls.
      factionHeat.casualty(victim.actor.faction, factionHeat.sectorAt(victim.actor.x, victim.actor.z)?.id ?? null, heatShare(victim, attacker) * HEAT_TUNING.contact * Math.min(1, damage / 100));
    }
    return { hitId: victim.actor.id, killed, damage: damage - blocked };
  }
  /** A player in the fight, either end of it, escalates it in full; bots fighting bots by a share. */
  const heatShare = (victim: InternalActor, attacker?: InternalActor) => !victim.actor.bot || attacker && !attacker.actor.bot ? 1 : HEAT_TUNING.skirmish;
  /** `spec`, when given, prices the hit by range and zone the way the player's own rounds are. */
  function resolveShot(entry: InternalActor, origin: ArenaPoint, ray: ArenaPoint, damage: number, range: number, ignore?: VehicleKind, spec?: WeaponSpec): ArenaShot {
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
    let raider: Raider | undefined;
    for (const candidate of raiders.values()) {
      const intersection = raiderDistance(candidate, origin, ray);
      if (intersection < nearest) { raider = candidate; victim = undefined; hull = undefined; nearest = intersection; }
    }
    if (ignore) {
      const v = vehicles.find(v => v.kind === ignore)!;
      v.shotEnd = { x: origin.x + ray.x * nearest, y: origin.y + ray.y * nearest, z: origin.z + ray.z * nearest };
    }
    if (spec) damage = hitDamage(spec, nearest, victim && headHit(origin, ray, victim.actor, nearest) ? 'head' : undefined);
    if (raider) return hurtRaider(raider, damage, entry);
    if (hull) { const before = hull.health; damageHull(hull, damage, entry); return { hitId: `vehicle-${hull.kind}`, killed: before > 0 && hull.health === 0, damage: Math.min(before, damage) }; }
    // A round that finds one of the shooter's own side stops there and does no harm.
    if (victim && !hostile(entry.actor, victim.actor)) return { ...EMPTY_SHOT };
    return victim ? hurtActor(victim, damage, entry, undefined, ignore ? origin : undefined) : { ...EMPTY_SHOT };
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
    warm(point, 3);
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
      else if (hit.item.member.actor.alive)
        hurtActor(hit.item.member, spec.overhead && roofed(hit.item.member.actor) ? hit.damage * OVERHEAD_SHELTER : hit.damage, attacker, cause, point, true);
    }
  }
  /** Whether something solid is overhead: a roof, a deck, a viaduct. */
  function roofed(actor: ArenaPoint) {
    const origin = { x: actor.x, y: actor.y + .2, z: actor.z };
    return Math.min(worldWallDistance(origin, UP), cover?.(origin, UP, 40) ?? Infinity) < 40;
  }
  /**
   * Running combat events and the director that starts them. Rounds resolve
   * here, on the authority, at the time their descriptor says they land.
   */
  const director = environment?.combatEvents ? createCombatDirector({ risk: environment.combatEvents.risk, seed: (seed ^ 0x5bd1e995) >>> 0 }) : null;
  let directorEnabled = !!director, eventSerial = 0;
  interface RunningEvent { descriptor: CombatEventDescriptor; resolved: Set<number>; name: string;
    /** What the feed calls its crew, when it fielded one. */
    crew?: string;
    /** Supply drops: seconds patrols have stood over the crate. */
    securing?: number }
  const events: RunningEvent[] = [];
  const raiders = new Map<string, Raider>();
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
  /** Height of whatever is under (x, z): rendered roofs and terrain when the scene is there, walkable decks otherwise. */
  function groundHeight(x: number, z: number) {
    if (cover) { const d = cover({ x, y: 160, z }, DOWN, 170); return d < 170 ? 160 - d : 0; }
    return traversal?.supportHeight(x, z, 160, .1, .1) ?? 0;
  }
  /** A clear, smoke-free line between two points: what a gunner, a drone or a sniper needs to fire. */
  function lineClear(from: ArenaPoint, to: ArenaPoint) {
    const length = distance(from, to); if (length < .1) return true;
    const ray = { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length };
    return worldWallDistance(from, ray) >= length - .5 && (cover?.(from, ray, length) ?? Infinity) >= length - .5 && !smokeBetween(from, to);
  }
  /**
   * Where the fighting has been: shots, kills and blasts warm a coarse grid
   * that cools over `HEAT_DECAY` seconds. The director aims world events at
   * it, so a firefight between patrols draws fire whether or not a player is
   * anywhere near.
   */
  const heat = new Map<string, { x: number; z: number; weight: number }>();
  const HEAT_CELL = 16;
  function warm(at: { x: number; z: number }, weight: number) {
    const key = `${Math.floor(at.x / HEAT_CELL)},${Math.floor(at.z / HEAT_CELL)}`, cell = heat.get(key);
    if (!cell) { heat.set(key, { x: at.x, z: at.z, weight }); return; }
    // The cell's point drifts toward where the weight lands.
    const total = cell.weight + weight; cell.x += (at.x - cell.x) * weight / total; cell.z += (at.z - cell.z) * weight / total; cell.weight = total;
  }
  function cool(dt: number) {
    const keep = Math.exp(-dt / HEAT_DECAY);
    for (const [key, cell] of heat) if ((cell.weight *= keep) < .05) heat.delete(key);
  }
  /** Places a patrol with nobody in sight goes to look at: a fresh wreck, a downed drone. */
  const interests: { x: number; z: number; until: number }[] = [];
  /** The side an event at `at` fights for: against the nearest living soldier there, mercenaries when nobody is. */
  function ownerAt(at: CombatPlane): SquadFaction {
    let nearest: ArenaActor | undefined, best = Infinity;
    for (const m of members.values()) if (m.actor.alive && !m.temporary) { const d = Math.hypot(m.actor.x - at.x, m.actor.z - at.z); if (d < best) { best = d; nearest = m.actor; } }
    return nearest && getArenaFaction(nearest.faction)?.side === 'opposition' ? PLAYER_FACTION : DEFAULT_BOT_FACTION;
  }
  function startEvent(directive: Pick<CombatEventDescriptor, 'kind' | 'seed' | 'target' | 'heading' | 'intensity' | 'reach' | 'troops' | 'faction'>) {
    const plugin = getCombatEvent(directive.kind);
    // At most three of a kind at once: transports are news and hazards are not, so a busy road never holds back a barrage.
    const alike = events.filter(e => combatPhase(e.descriptor, elapsed) !== 'aftermath' && !!getCombatEvent(e.descriptor.kind)?.hazard === !!plugin?.hazard);
    if (!plugin || finished || events.length >= MAX_COMBAT_EVENTS || alike.length >= 3) return null;
    const target = { x: clamp(directive.target.x, bounds.minX, bounds.maxX), z: clamp(directive.target.z, bounds.minZ, bounds.maxZ) };
    // Whose event it is: a transport says; anything else belongs to the side opposing whoever is nearest its
    // target, so shelling a player is the mercenaries' doing and shelling a mercenary patrol is fire support.
    const owner = directive.faction ?? (plugin.id.startsWith('transport') ? DEFAULT_BOT_FACTION : ownerAt(target));
    const descriptor: CombatEventDescriptor = { id: `event-${++eventSerial}`, kind: plugin.id, seed: directive.seed >>> 0, start: elapsed, target,
      heading: Number.isFinite(directive.heading) ? directive.heading : 0, intensity: clamp(Number.isFinite(directive.intensity) ? directive.intensity : 1, .5, 2),
      ...(Number.isFinite(directive.reach) ? { reach: clamp(directive.reach!, 0, 400) } : {}),
      ...(Number.isInteger(directive.troops) ? { troops: clamp(directive.troops!, 1, MAX_TROOPS) } : {}), ...(owner === PLAYER_FACTION ? { faction: owner } : {}) };
    if (!place(descriptor)) return null;
    const event: RunningEvent = { descriptor, resolved: new Set(), name: plugin.cause ?? plugin.name.split(' ')[0] };
    events.push(event);
    if (!field(event)) { events.pop(); return null; }
    return descriptor;
  }
  /**
   * Where an event's own people or machine go, chosen once by the host and
   * written into the descriptor: a mortar pit, a sniper's perch, a flying
   * height clear of the roofs. False when the district offers nowhere.
   */
  function place(d: CombatEventDescriptor) {
    if (d.kind === 'mortar') {
      const pit = mortarSite(d.target); if (!pit) return false;
      d.origin = pit; d.heading = Math.atan2(-(d.target.x - pit.x), -(d.target.z - pit.z));
    } else if (d.kind === 'sniper') {
      const perch = sniperPerch(d.target); if (!perch) return false;
      d.origin = { x: perch.x, z: perch.z }; if (perch.roof) d.altitude = perch.y;
    } else if (d.kind === 'helicopter-raid') d.altitude = flyingHeight(d.target, RAID.radius, 18, 30);
    else if (d.kind === 'drone') {
      const back = { x: Math.sin(d.heading), z: Math.cos(d.heading) }, reach = 140;
      d.origin = { x: clamp(d.target.x + back.x * reach, bounds.minX - 30, bounds.maxX + 30), z: clamp(d.target.z + back.z * reach, bounds.minZ - 30, bounds.maxZ + 30) };
      d.altitude = flyingHeight(d.target, DRONE.loiter, 10, DRONE.height);
    }
    return true;
  }
  /** A height `clear` metres over every roof round `center` out to `radius`, and at least `least` over the ground there. */
  function flyingHeight(center: CombatPlane, radius: number, clear: number, least: number) {
    let top = groundHeight(center.x, center.z);
    const floor = top + least;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; top = Math.max(top, groundHeight(center.x + Math.cos(a) * radius, center.z + Math.sin(a) * radius)); }
    return clamp(Math.max(floor, top + clear), 12, 160);
  }
  const humansAlive = () => [...members.values()].filter(m => !m.actor.bot && m.actor.alive);
  /** A clear patch 55–125 m from the target and 40 m from everyone, preferably out of sight of it: they have to go looking. */
  function mortarSite(target: CombatPlane): CombatPlane | null {
    const humans = humansAlive(), candidates: CombatPlane[] = [...validSpawns];
    for (let i = 0; i < 16; i++) for (const r of [70, 95, 115]) candidates.push({ x: target.x + Math.cos(i / 16 * Math.PI * 2) * r, z: target.z + Math.sin(i / 16 * Math.PI * 2) * r });
    const eye = { x: target.x, y: groundHeight(target.x, target.z) + 1.7, z: target.z };
    const usable = candidates.filter(p => clearSpawn(p) && Math.hypot(p.x - target.x, p.z - target.z) >= 55 && Math.hypot(p.x - target.x, p.z - target.z) <= 125 &&
      humans.every(h => Math.hypot(h.actor.x - p.x, h.actor.z - p.z) >= 40));
    if (!usable.length) return null;
    const score = (p: CombatPlane) => (lineClear(eye, { x: p.x, y: groundHeight(p.x, p.z) + 1.2, z: p.z }) ? 100 : 0) + Math.abs(Math.hypot(p.x - target.x, p.z - target.z) - 90) + random() * 10;
    return { ...usable.map(p => ({ p, s: score(p) })).sort((a, b) => a.s - b.s)[0].p };
  }
  /**
   * The highest flat roof 45–95 m from the target with a clear line to the
   * player there. With no rendered scene, or no such roof, a clear patch of
   * ground at range instead.
   */
  function sniperPerch(target: CombatPlane): (ArenaPoint & { roof: boolean }) | null {
    const humans = humansAlive(), alive = [...members.values()].filter(m => m.actor.alive);
    const watched = alive.sort((a, b) => Math.hypot(a.actor.x - target.x, a.actor.z - target.z) - Math.hypot(b.actor.x - target.x, b.actor.z - target.z))[0];
    const aim = watched ? chestOf(watched.actor) : { x: target.x, y: groundHeight(target.x, target.z) + 1.1, z: target.z };
    if (cover) {
      const street = groundHeight(target.x, target.z), turn = random() * Math.PI * 2;
      let best: ArenaPoint | null = null;
      for (let i = 0; i < 16; i++) for (const r of [OVERWATCH.range[0] + 5, 70, OVERWATCH.range[1] - 5]) {
        const a = turn + i / 16 * Math.PI * 2;
        let x = target.x + Math.cos(a) * r, z = target.z + Math.sin(a) * r;
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
        const roof = groundHeight(x, z);
        if (roof < street + OVERWATCH.rise || roof > 118 || (best && roof <= best.y)) continue;
        // To the parapet: walk toward the target while the roof holds, since its own edge hides the street from the middle.
        for (let step = 0; step < 30; step++) {
          const nx = x - Math.cos(a), nz = z - Math.sin(a);
          if (Math.abs(groundHeight(nx, nz) - roof) > .5) break;
          x = nx; z = nz;
        }
        // A pace back from the drop, so the rig kneels on the roof rather than its lip.
        x += Math.cos(a) * .6; z += Math.sin(a) * .6;
        // Flat enough to kneel on: a metre behind and to either side is at the same height (in front is the drop).
        if ([[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)], [Math.sin(a), -Math.cos(a)]].some(([dx, dz]) => Math.abs(groundHeight(x + dx, z + dz) - roof) > .5)) continue;
        // Within reach of a rifle fired back: whoever it watches can always answer it.
        const eye = { x, y: roof + 1.15, z };
        if (distance(eye, aim) <= OVERWATCH.reach && lineClear(eye, aim)) best = { x, y: roof, z };
      }
      if (best) return { ...best, roof: true };
    }
    const ground = validSpawns.filter(p => { const d = Math.hypot(p.x - target.x, p.z - target.z); return d >= 35 && d <= 110 && humans.every(h => Math.hypot(h.actor.x - p.x, h.actor.z - p.z) >= 30); })
      .sort((a, b) => Math.hypot(b.x - target.x, b.z - target.z) - Math.hypot(a.x - target.x, a.z - target.z))[0];
    return ground ? { x: ground.x, y: 0, z: ground.z, roof: false } : null;
  }
  /** The crew or the machine an event brings. False when it brings people and none fit in the match. */
  function field(event: RunningEvent) {
    const d = event.descriptor;
    if (d.kind === 'mortar' && d.origin) {
      const across = { x: Math.cos(d.heading), z: -Math.sin(d.heading) };
      for (let i = 0; i < MORTAR.crew; i++) support(d, 'mortar-crew', { x: d.origin.x + across.x * (i ? 1.3 : -1.3), z: d.origin.z + across.z * (i ? 1.3 : -1.3) }, i, `Mortar crew ${i + 1}`);
      event.crew = 'Mortar team';
    } else if (d.kind === 'sniper' && d.origin) {
      support(d, 'overwatch', d.origin, 0, 'Overwatch', d.altitude);
      event.crew = 'Sniper';
    } else if (d.kind === 'helicopter-raid' || d.kind === 'drone') {
      const gunship = d.kind === 'helicopter-raid', from = gunship ? d.target : d.origin!;
      raiders.set(d.id, { event: d.id, kind: gunship ? 'gunship' : 'drone', x: from.x, y: d.altitude ?? 40, z: from.z, yaw: d.heading,
        health: gunship ? RAID.health : DRONE.health, maxHealth: gunship ? RAID.health : DRONE.health, state: gunship ? 'inbound' : 'cruise',
        aim: null, shots: 0, vx: 0, vy: 0, vz: 0, since: 0, fired: 0, next: 0, lost: 0, until: Infinity, angle: 0 });
    }
    return !event.crew || [...members.values()].some(m => m.temporary?.event === d.id);
  }
  /** A temporary bot of `roleId` for event `d`, kneeling at `at`, on a roof at `roof` when given. */
  function support(d: CombatEventDescriptor, roleId: string, at: CombatPlane, index: number, name: string, roof?: number) {
    const role = getArenaRole(roleId); if (!role) return;
    const armed = armamentFamilies(role), weapons = FPS_WEAPONS.map((w, i) => armed.includes(i) ? role.weapon : w);
    const entry = addMember(`${d.id}-${roleId}-${index}`, name, role.armor, role.absorption, weapons, false); if (!entry) return;
    entry.role = role; entry.healthMax = role.health; Object.assign(entry.actor, { bot: true, role: role.id, faction: d.faction ?? DEFAULT_BOT_FACTION }); spawn(entry);
    entry.temporary = { event: d.id, from: d.start + (getCombatEvent(d.kind)?.warning ?? 0) }; entry.anchor = { x: at.x, z: at.z, ...(roof !== undefined ? { y: roof } : {}) };
    const feet = roof ?? floorAt({ x: at.x, y: 3.5, z: at.z });
    Object.assign(entry.actor, { x: at.x, z: at.z, y: feet + BOT_HEAL.kneelEye, yaw: Math.atan2(-(d.target.x - at.x), -(d.target.z - at.z)), ...(roof !== undefined ? { ground: roof } : {}) });
  }
  /** Leaves the match without a word: a crew pulling out, a body cleared away. */
  function dismiss(id: string) { releaseSeat(id); members.delete(id); }
  /** The live part of an event is over: a crew silenced, a raider downed, a crate taken. */
  function endEvent(event: RunningEvent, outcome: CombatOutcome) {
    if (event.descriptor.ended !== undefined) return;
    event.descriptor.ended = elapsed; event.descriptor.outcome = outcome;
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
  /** Clouds on the ground this tick, and the height of the ground under each. */
  let liveClouds: { cloud: CloudPayload; ground: number; cause: string }[] = [];
  const cloudGround = new Map<string, number>();
  function stepEvents(dt: number) {
    if (director && directorEnabled) {
      const humans = [...members.values()].filter(m => !m.actor.bot && m.actor.alive && m.playing).map(m => ({ x: m.actor.x, z: m.actor.z }));
      // The hotter the fight, the sooner the next strike: contractors calling fire most, the forces' own support some.
      const tempo = factionHeat ? 1 + HEAT_PACE.mercenaries * factionHeat.surge('mercenaries') + HEAT_PACE['armed-forces'] * factionHeat.surge(PLAYER_FACTION) : 1;
      const directive = director.step({ now: elapsed, active: events.map(e => e.descriptor), humans, bounds, avoid: environment?.playerSpawn ? [environment.playerSpawn] : [],
        heat: [...heat.values()], places: validSpawns, tempo });
      if (directive && !startEvent(directive)) director.refused(directive, elapsed);
    }
    if (environment?.reinforcements) { dispatchReinforcements(); if (factionHeat) dispatchReinforcements(undefined, PLAYER_FACTION); }
    let budget = BLASTS_PER_TICK;
    liveClouds = [];
    for (const event of events) {
      const age = elapsed - event.descriptor.start;
      for (const payload of combatTimeline(event.descriptor)) {
        if (payload.type === 'cloud') {
          if (age < payload.from || age > payload.until) continue;
          const key = `${event.descriptor.id}/${payload.id}`;
          let ground = cloudGround.get(key);
          if (ground === undefined) { ground = groundHeight(payload.center.x, payload.center.z); cloudGround.set(key, ground); if (cloudGround.size > 64) cloudGround.delete(cloudGround.keys().next().value!); }
          liveClouds.push({ cloud: payload, ground, cause: event.name });
          continue;
        }
        if (budget <= 0) continue;
        if ((payload.type !== 'munition' && payload.type !== 'insert') || event.resolved.has(payload.id) || event.descriptor.start + payload.time > elapsed) continue;
        event.resolved.add(payload.id);
        if (payload.type === 'insert') disembark(event.descriptor, payload.slot, payload.at);
        else if (payload.blast) { budget--; blast(landing(payload), payload.blast, undefined, event.name); }
      }
    }
    cool(dt); stepGas(dt); stepCrates(dt); stepRaiders(dt);
    for (let i = interests.length - 1; i >= 0; i--) if (interests[i].until < elapsed) interests.splice(i, 1);
    // A crew all down silences its event; a crew whose event has run its course pulls out.
    for (const event of events) {
      if (!event.crew) continue;
      const d = event.descriptor, crew = [...members.values()].filter(m => m.temporary?.event === d.id);
      if (d.ended === undefined && !crew.some(m => m.actor.alive)) { endEvent(event, 'silenced'); announce(`${event.crew} silenced`); }
      const presence = combatTimeline(d).find(p => p.type === 'presence');
      if (presence && elapsed - d.start > presence.until) for (const m of crew) if (m.actor.alive) dismiss(m.actor.id);
    }
    for (let i = events.length - 1; i >= 0; i--) if (combatPhase(events[i].descriptor, elapsed) === 'done') { raiders.delete(events[i].descriptor.id); events.splice(i, 1); }
    for (const member of members.values()) {
      // A ride whose event is gone (a reset, a cap) will never arrive: wait for the next one.
      if (member.ride && !events.some(e => e.descriptor.id === member.ride!.event)) member.ride = undefined;
      if (member.temporary && !events.some(e => e.descriptor.id === member.temporary!.event)) dismiss(member.actor.id);
    }
  }
  /** Gas wears through whoever stands in it, once however many clouds overlap there, and plates do not stop it. */
  function stepGas(dt: number) {
    if (!liveClouds.some(c => c.cloud.dps > 0)) return;
    for (const member of members.values()) {
      const { actor } = member; if (!actor.alive || seatOf(vehicles, actor.id)) continue;
      let worst: { dps: number; cause: string } | null = null;
      for (const { cloud, ground, cause } of liveClouds)
        if (cloud.dps > (worst?.dps ?? 0) && actor.y - ground < 6 && Math.hypot(actor.x - cloud.center.x, actor.z - cloud.center.z) < cloud.radius) worst = { dps: cloud.dps, cause };
      if (worst) hurtActor(member, worst.dps * dt, undefined, worst.cause, undefined, false, true);
    }
  }
  /** Whether smoke on the ground lies across the line from `a` to `b`. A cloud is a squat cylinder; a line over its top is clear. */
  function smokeBetween(a: ArenaPoint, b: ArenaPoint) {
    for (const { cloud, ground } of liveClouds) {
      const top = ground + 6; if (a.y > top && b.y > top) continue;
      const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
      const t = length > 0 ? clamp(((cloud.center.x - a.x) * dx + (cloud.center.z - a.z) * dz) / length, 0, 1) : 0;
      if (Math.hypot(a.x + dx * t - cloud.center.x, a.z + dz * t - cloud.center.z) < cloud.radius * .85 && a.y + (b.y - a.y) * t < top) return true;
    }
    return false;
  }
  /** Landed supply crates nobody has taken yet. */
  function openCrates() {
    const open: { event: RunningEvent; crate: CratePayload }[] = [];
    for (const event of events) {
      if (event.descriptor.kind !== 'supply-drop' || event.descriptor.ended !== undefined) continue;
      const crate = combatTimeline(event.descriptor).find((p): p is CratePayload => p.type === 'crate'), age = elapsed - event.descriptor.start;
      if (crate && age >= crate.land && age <= crate.until) open.push({ event, crate });
    }
    return open;
  }
  /** A player who reaches a crate opens it; patrols who stand over it long enough carry it off. */
  function stepCrates(dt: number) {
    for (const { event, crate } of openCrates()) {
      const near = (m: InternalActor) => m.actor.alive && !seatOf(vehicles, m.actor.id) && Math.hypot(m.actor.x - crate.at.x, m.actor.z - crate.at.z) < SUPPLY.claim;
      const opener = [...members.values()].find(m => !m.actor.bot && near(m));
      if (opener) { endEvent(event, 'claimed'); event.descriptor.claimedBy = opener.actor.id; announce(`${opener.actor.name} opened the supply drop`); continue; }
      const held = [...members.values()].some(m => m.actor.bot && !m.temporary && near(m));
      event.securing = held ? (event.securing ?? 0) + dt : Math.max(0, (event.securing ?? 0) - dt * .5);
      if (event.securing >= SUPPLY.hold) { endEvent(event, 'secured'); announce('Enemy patrol secured the supply drop'); }
    }
  }
  /** The nearest thing a patrol with nobody in sight would make for, within reach: a crate on the ground, then a fresh wreck. */
  function lureFor(actor: ArenaPoint) {
    const near = (at: CombatPlane) => Math.hypot(at.x - actor.x, at.z - actor.z);
    const crate = openCrates().map(({ crate }) => crate.at).filter(at => near(at) < 150).sort((a, b) => near(a) - near(b))[0];
    return crate ?? interests.filter(at => near(at) < 150).sort((a, b) => near(a) - near(b))[0] ?? null;
  }
  /** Distance along a ray to a raider's hull, or Infinity. A helicopter is a body and a tail; a drone a small ball. */
  function raiderDistance(r: Raider, origin: ArenaPoint, ray: ArenaPoint) {
    if (r.health <= 0) return Infinity;
    if (r.kind === 'drone') return sphereDistance(origin, ray, { x: r.x, y: r.y, z: r.z }, .75);
    return Math.min(sphereDistance(origin, ray, { x: r.x, y: r.y + 1.3, z: r.z }, 2.2),
      sphereDistance(origin, ray, { x: r.x + Math.sin(r.yaw) * 4.4, y: r.y + 1.6, z: r.z + Math.cos(r.yaw) * 4.4 }, .9));
  }
  function hurtRaider(r: Raider, damage: number, attacker: InternalActor): ArenaShot {
    const event = events.find(e => e.descriptor.id === r.event), before = r.health;
    r.health = Math.max(0, r.health - damage);
    const killed = before > 0 && r.health === 0;
    if (killed) {
      r.state = 'down'; r.aim = null; r.victim = undefined;
      // Shot down outranks breaking off: a raid already heading home that is brought down was downed.
      if (event) { endEvent(event, 'downed'); event.descriptor.outcome = 'downed'; }
      announce(`${attacker.actor.name} downed the ${r.kind === 'drone' ? 'drone' : 'raid helicopter'}`, attacker.actor.id);
    } else if (r.kind === 'gunship' && r.health < r.maxHealth * .25 && event && event.descriptor.ended === undefined) {
      // Badly hit, it breaks off: its path turns for home from wherever it is.
      endEvent(event, 'withdrawn'); announce('Raid helicopter breaking off');
    }
    return { hitId: `raider-${r.event}`, killed, damage: Math.min(before, damage) };
  }
  /** A raider's round: whatever it meets first, a wall, a hull or a body. */
  function raiderShot(origin: ArenaPoint, ray: ArenaPoint, damage: number, cause: string) {
    let nearest = Math.min(150, worldWallDistance(origin, ray), cover?.(origin, ray, 150) ?? Infinity), hull: SharedVehicle | undefined, victim: InternalActor | undefined;
    for (const v of vehicles) { const d = vehicleRayDistance(v, origin, ray); if (d < nearest) { nearest = d; hull = v; } }
    for (const member of members.values()) {
      if (!member.actor.alive || seatOf(vehicles, member.actor.id)) continue;
      const d = bodyDistance(origin, ray, member.actor); if (d < nearest) { nearest = d; victim = member; hull = undefined; }
    }
    if (hull) damageHull(hull, damage, undefined, cause);
    else if (victim) hurtActor(victim, damage, undefined, cause, origin);
  }
  /** The nearest actor, player or patrol, a raider at `from` can see within `range`. Raiders belong to nobody. */
  function spot(from: ArenaPoint, range: number) {
    return [...members.values()].filter(m => m.actor.alive).filter(m => !seatOf(vehicles, m.actor.id) && distance(from, m.actor) <= range && lineClear(from, chestOf(m.actor)))
      .sort((a, b) => distance(from, a.actor) - distance(from, b.actor))[0] ?? null;
  }
  function stepRaiders(dt: number) {
    for (const [id, r] of raiders) {
      const event = events.find(e => e.descriptor.id === id); if (!event) { raiders.delete(id); continue; }
      if (r.state === 'exploded' || r.state === 'wreck') { if (elapsed > r.until) raiders.delete(id); continue; }
      if (r.state === 'down') {
        // Out of the sky: what it was doing carries it on while it falls.
        r.vy -= 9.8 * dt; r.x += r.vx * dt; r.z += r.vz * dt; r.y += r.vy * dt; r.yaw += dt * (r.kind === 'gunship' ? 2.4 : 6);
        const ground = groundHeight(r.x, r.z);
        if (r.y <= ground + (r.kind === 'gunship' ? .5 : .2)) {
          r.y = ground + (r.kind === 'gunship' ? .5 : .2); r.state = 'wreck'; r.until = elapsed + (r.kind === 'gunship' ? 6 : 2);
          // Something came down: patrols with nothing better to do go and look.
          interests.push({ x: r.x, z: r.z, until: elapsed + WRECK_INTEREST }); warm(r, 3);
        }
        continue;
      }
      if (r.kind === 'gunship') stepGunship(r, event, dt); else stepDrone(r, event, dt);
    }
  }
  function stepGunship(r: Raider, event: RunningEvent, dt: number) {
    const d = event.descriptor, age = elapsed - d.start, orbit = combatTimeline(d).find((p): p is OrbitPayload => p.type === 'orbit');
    if (!orbit) { raiders.delete(d.id); return; }
    const pose = orbitPose(orbit, age, d.altitude ?? 40);
    if (dt > 0) { r.vx = (pose.x - r.x) / dt; r.vz = (pose.z - r.z) / dt; r.vy = 0; }
    Object.assign(r, { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw });
    if (age > orbit.gone) { raiders.delete(d.id); return; }
    r.state = age < orbit.arrive ? 'inbound' : age <= orbit.leave ? 'orbit' : 'leaving';
    if (r.state !== 'orbit' || age < RAID.warning) { r.aim = null; r.victim = undefined; return; }
    // The left door faces the middle of the orbit; the gun hangs just below the sill.
    const inward = { x: orbit.center.x - r.x, z: orbit.center.z - r.z }, l = Math.hypot(inward.x, inward.z) || 1;
    const gun = { x: r.x + inward.x / l * 1.3, y: r.y + .7, z: r.z + inward.z / l * 1.3 };
    if (!r.victim) {
      if (elapsed < r.next) { r.aim = null; return; }
      const sighted = spot(gun, RAID.sight);
      if (!sighted) { r.next = elapsed + .5; r.aim = null; return; }
      const chest = chestOf(sighted.actor), side = random() * Math.PI * 2;
      // The walk-in starts a few metres off and its tracers creep onto them: that second is the warning.
      r.victim = sighted.actor.id; r.since = elapsed; r.fired = 0;
      r.walk = { x: chest.x + Math.cos(side) * 7, y: groundHeight(chest.x + Math.cos(side) * 7, chest.z + Math.sin(side) * 7), z: chest.z + Math.sin(side) * 7 };
    }
    const victim = members.get(r.victim), t = elapsed - r.since;
    if (!victim?.actor.alive || t > RAID.walkIn + RAID.burst) { r.victim = undefined; r.aim = null; r.next = elapsed + RAID.pause[0] + random() * (RAID.pause[1] - RAID.pause[0]); return; }
    const chest = chestOf(victim.actor), walk = r.walk ?? chest, k = Math.min(1, t / RAID.walkIn) * .85;
    r.aim = t < RAID.walkIn ? { x: walk.x + (chest.x - walk.x) * k, y: walk.y + (chest.y - walk.y) * k, z: walk.z + (chest.z - walk.z) * k } : chest;
    for (const due = Math.floor(t / RAID.rate) + 1; r.fired < due; r.fired++) {
      r.shots++;
      if (t < RAID.walkIn) continue;
      const line = { x: r.aim.x - gun.x, y: r.aim.y - gun.y, z: r.aim.z - gun.z }, length = Math.hypot(line.x, line.y, line.z) || 1, spread = RAID.spread;
      const ray = { x: line.x / length + (random() - .5) * spread, y: line.y / length + (random() - .5) * spread, z: line.z / length + (random() - .5) * spread }, norm = Math.hypot(ray.x, ray.y, ray.z);
      raiderShot(gun, { x: ray.x / norm, y: ray.y / norm, z: ray.z / norm }, RAID.round, event.name);
    }
  }
  function stepDrone(r: Raider, event: RunningEvent, dt: number) {
    const d = event.descriptor, age = elapsed - d.start, cruise = d.altitude ?? 40;
    const fly = (to: ArenaPoint, speed: number) => {
      const dx = to.x - r.x, dy = to.y - r.y, dz = to.z - r.z, l = Math.hypot(dx, dy, dz), step = Math.min(l, speed * dt);
      if (l > 1e-6) { r.vx = dx / l * speed; r.vy = dy / l * speed; r.vz = dz / l * speed; r.x += dx / l * step; r.y += dy / l * step; r.z += dz / l * step; if (Math.hypot(dx, dz) > .05) r.yaw = Math.atan2(-dx, -dz); }
    };
    const circle = (speed: number) => {
      const out = Math.hypot(r.x - d.target.x, r.z - d.target.z);
      if (out > DRONE.loiter + 3) { fly({ x: d.target.x, y: cruise, z: d.target.z }, DRONE.cruise); r.angle = Math.atan2(r.z - d.target.z, r.x - d.target.x); return; }
      r.angle += speed / DRONE.loiter * dt;
      fly({ x: d.target.x + Math.cos(r.angle) * DRONE.loiter, y: cruise, z: d.target.z + Math.sin(r.angle) * DRONE.loiter }, DRONE.cruise);
    };
    if (r.state === 'leaving') {
      const home = d.origin ?? d.target; fly({ x: home.x, y: cruise + 20, z: home.z }, DRONE.cruise);
      if (Math.hypot(r.x - home.x, r.z - home.z) < 3) raiders.delete(d.id);
      return;
    }
    if (r.state === 'cruise') {
      circle(DRONE.cruise); r.aim = null;
      if (age > DRONE.stay) { r.state = 'leaving'; endEvent(event, 'withdrawn'); return; }
      if (age >= DRONE.warning + 1.5 && elapsed >= r.next) {
        const sighted = spot(r, DRONE.sight);
        if (sighted) { r.state = 'lock'; r.victim = sighted.actor.id; r.since = elapsed; r.lost = 0; } else r.next = elapsed + .5;
      }
      return;
    }
    const victim = r.victim ? members.get(r.victim) : undefined;
    if (r.state === 'lock') {
      circle(DRONE.cruise * .35);
      if (!victim?.actor.alive) { r.state = 'cruise'; r.victim = undefined; r.next = elapsed + 1; return; }
      const chest = chestOf(victim.actor); r.aim = chest;
      r.lost = lineClear(r, chest) ? 0 : r.lost + dt;
      // Lose them for a second and it goes back to circling: breaking line of sight is the counter.
      if (r.lost > 1) { r.state = 'cruise'; r.victim = undefined; r.next = elapsed + 1.5; return; }
      if (elapsed - r.since >= DRONE.lock) { r.state = 'dive'; r.walk = { x: chest.x, y: chest.y - .4, z: chest.z }; }
      return;
    }
    if (r.state !== 'dive') return;
    // It steers at its victim until it is close, then commits to where they were: a late sidestep can beat it.
    if (victim?.actor.alive && distance(r, chestOf(victim.actor)) > DRONE.commit) r.walk = { ...chestOf(victim.actor), y: chestOf(victim.actor).y - .4 };
    const dest = r.walk!, dx = dest.x - r.x, dy = dest.y - r.y, dz = dest.z - r.z, l = Math.hypot(dx, dy, dz) || 1;
    const ray = { x: dx / l, y: dy / l, z: dz / l }, step = DRONE.dive * dt;
    const struck = Math.min(worldWallDistance(r, ray), cover?.(r, ray, step + .5) ?? Infinity);
    const near = [...members.values()].some(m => m.actor.alive && distance(r, chestOf(m.actor)) < 1.6);
    if (near || struck < step + .3 || l < step + .8) {
      const reach = Math.max(0, Math.min(l, struck - .3, step));
      const point = { x: r.x + ray.x * reach, y: r.y + ray.y * reach, z: r.z + ray.z * reach };
      Object.assign(r, point, { state: 'exploded', aim: null, until: elapsed + 1.5 });
      endEvent(event, 'detonated');
      blast(point, DRONE_BLAST, undefined, event.name);
      return;
    }
    fly(dest, DRONE.dive); r.aim = dest;
  }
  /**
   * When each side may next send a ride, and when it last topped up. The gap
   * to the next top-up is read from heat each time it is checked, so a side
   * that heats up mid-wait sends its next ride sooner.
   */
  const topUpEvery = (faction: SquadFaction) => factionHeat ? factionHeat.topUpInterval(faction) : faction === PLAYER_FACTION ? Infinity : REINFORCEMENT_TOP_UP;
  const topUpDue = (faction: SquadFaction, last: number | null) => last === null && faction !== PLAYER_FACTION ? REINFORCEMENT_TOP_UP : (last ?? 0) + topUpEvery(faction);
  const dispatchClock = (): Record<SquadFaction, { next: number; last: number | null }> => ({ mercenaries: { next: 0, last: null }, 'armed-forces': { next: 0, last: null } });
  let clock = dispatchClock();
  /** Bots a side wants in the district: heat's call when there is heat, else the fixed population. */
  const population = (faction: SquadFaction) => factionHeat ? clamp(factionHeat.troops(faction), faction === 'mercenaries' ? count : 0, MAX_ARENA_BOTS)
    : faction === 'mercenaries' ? fixedPopulation : 0;
  /**
   * Books a transport for one side's bots waiting on one, at most one ride per
   * side on the road at a time, and fills its empty seats with recruits while
   * that side is below its headcount. With heat, the ride heads for the sector
   * that most needs troops. `force` sends one now, by road or air, waiting or not.
   */
  function dispatchReinforcements(force?: 'land' | 'air', faction: SquadFaction = 'mercenaries') {
    const mine = (m: InternalActor) => m.actor.bot && m.actor.faction === faction, all = [...members.values()];
    const waiting = all.filter(m => mine(m) && !m.actor.alive && m.waiting !== undefined && !m.ride).sort((a, b) => a.waiting! - b.waiting!);
    const room = Math.max(0, Math.min(population(faction) - all.filter(mine).length, MAX_ARENA_BOTS - all.filter(m => m.actor.bot).length));
    const state = clock[faction];
    if (!force) {
      // One transport per side on the road at a time, booked seats or not: a debug ride counts too.
      const onRoad = events.some(e => e.descriptor.kind.startsWith('transport') && (e.descriptor.faction ?? 'mercenaries') === faction && combatPhase(e.descriptor, elapsed) !== 'aftermath');
      if (elapsed < state.next || onRoad || all.some(m => mine(m) && m.ride)) return null;
      // A lone casualty waits a little for company; a garrison under strength is topped up on a slower clock.
      const due = waiting.length >= 2 || waiting.length === 1 && elapsed - waiting[0].waiting! >= REINFORCEMENT_WAIT || room > 0 && elapsed >= topUpDue(faction, state.last);
      if (!due) return null;
    }
    const humans = all.filter(m => !m.actor.bot && m.actor.alive).map(m => ({ x: m.actor.x, z: m.actor.z }));
    const view = { humans, bounds, clearRun, openSky };
    const needy = factionHeat?.neediest(faction, sector => all.filter(m => mine(m) && m.actor.alive && inside(m.actor, sector.bounds)).length);
    const local = needy ? validSpawns.filter(p => inside(p, needy.bounds)) : [];
    const plan = (local.length ? planTransport({ ...view, drops: local }, random, force) : null) ?? planTransport({ ...view, drops: validSpawns }, random, force);
    const seats = plan ? REINFORCEMENT_SEATS[plan.kind === 'transport-land' ? 'land' : 'air'] : 0;
    const troops = waiting.slice(0, seats), recruits = Math.min(room, seats - troops.length);
    const descriptor = plan && startEvent({ ...plan, seed: Math.floor(random() * 0xffffffff) >>> 0, intensity: 1, troops: Math.max(1, troops.length + recruits), ...(faction === PLAYER_FACTION ? { faction } : {}) });
    if (!descriptor) { state.next = elapsed + 5; return null; }
    for (let i = 0; i < recruits; i++) troops.push(enlist(true, faction));
    const home = factionHeat?.sectorAt(descriptor.target.x, descriptor.target.z)?.id;
    troops.forEach((member, slot) => { member.ride = { event: descriptor.id, slot }; if (home) member.home = home; });
    state.last = elapsed;
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
  /** Which way out of the nearest live danger area, or null when standing clear of all of them. A supply drop's ring is no danger. */
  function dangerExit(actor: ArenaPoint) {
    for (const event of events) {
      if (!getCombatEvent(event.descriptor.kind)?.hazard || !['warning', 'active'].includes(combatPhase(event.descriptor, elapsed))) continue;
      const age = elapsed - event.descriptor.start;
      for (const payload of combatTimeline(event.descriptor)) {
        if (payload.type !== 'marker' || age < payload.from || age > payload.until) continue;
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
  const homes = new Map<string, { x: number; z: number }[]>();
  function homeSpawns(id: string) {
    let list = homes.get(id);
    if (!list) { const sector = environment?.heat?.sectors.find(s => s.id === id); list = sector ? validSpawns.filter(p => inside(p, sector.bounds)) : []; homes.set(id, list); }
    return list;
  }
  function stepBot(entry: InternalActor, dt: number) {
    const actor = entry.actor;
    const role = entry.role!;
    // Patching up: kneeling still, weapon down, until it is done or a hit interrupts it.
    if (entry.heal) {
      const heal = entry.heal;
      if (entry.lastHurt >= heal.started) { entry.heal = undefined; delete actor.healing; actor.y = heal.feet + 1.75; }
      else {
        heal.time += dt; actor.healing = clamp(heal.time / BOT_HEAL.seconds, 0, 1);
        if (heal.time < BOT_HEAL.seconds) return;
        actor.health = Math.min(entry.healthMax, actor.health + entry.healthMax * BOT_HEAL.restore);
        entry.medkits--; entry.heal = undefined; delete actor.healing; actor.y = heal.feet + 1.75;
        entry.reaction = role.reaction;
      }
    }
    // Only the other side, never crew-mates. A sniper perched on a roof is only
    // worth looking up at for someone it has hit: nobody stares at the skyline. A
    // bot with a home sector holds it: contacts beyond the leash are someone else's.
    const grudge = entry.grudge && entry.grudge.until > elapsed ? entry.grudge.id : '';
    // A side that is surging hunts beyond its own ground.
    const leash = HOME_LEASH * (1 + (factionHeat && entry.home && isSquad(actor.faction) ? factionHeat.surgeAt(actor.faction, entry.home) : 0));
    const enemies = [...members.values()].filter(m => m !== entry && m.actor.alive && hostile(actor, m.actor) && !(entry.temporary && m.temporary?.event === entry.temporary.event) &&
      (m.anchor?.y === undefined || m.actor.id === grudge) && (!entry.home || distance(actor, m.actor) < leash));
    const enemy = enemies.sort((a, b) => distance(actor, a.actor) * (a.actor.bot ? 1.1 : 1) - distance(actor, b.actor) * (b.actor.bot ? 1.1 : 1))[0];
    entry.patrolTime -= dt;
    if (entry.patrolTime <= 0) {
      const home = entry.home ? homeSpawns(entry.home) : validSpawns, pool = home.length ? home : validSpawns;
      entry.patrol = pool[Math.floor(random() * pool.length)]; entry.patrolTime = 3 + random() * 3; entry.strafe *= -1;
    }
    const target = enemy?.actor ?? { ...entry.patrol, y: 1.75 };
    const dx = target.x - actor.x; const dz = target.z - actor.z; const horizontal = Math.hypot(dx, dz);
    const direction = { x: dx / Math.max(horizontal, 0.01), y: 0, z: dz / Math.max(horizontal, 0.01) };
    const line = { x: target.x - actor.x, y: (enemy?.actor.prone ? target.y - PRONE_EYE_HEIGHT + .35 : target.y - .65) - actor.y, z: target.z - actor.z };
    const length = Math.hypot(line.x, line.y, line.z);
    const ray = { x: line.x / Math.max(length, 0.01), y: line.y / Math.max(length, 0.01), z: line.z / Math.max(length, 0.01) };
    const visible = !!enemy && length < role.sightRange && worldWallDistance(actor, ray) >= length - 0.5 && clearSight(entry, enemy.actor.id, ray, length, dt) && !smokeBetween(actor, target);
    if (role.id === 'overwatch') { if (visible) actor.aiming = true; else delete actor.aiming; }
    const intent = role.think({ distance: horizontal, visible, healthFraction: actor.health / entry.healthMax, strafeDirection: entry.strafe });
    let approach = Number.isFinite(intent.approach) ? clamp(intent.approach, -1, 1) : 0;
    const wounded = botWantsHeal({ health: actor.health, healthMax: entry.healthMax, medkits: entry.medkits, sinceHurt: elapsed - entry.lastHurt, visible, danger: !!dangerExit(actor) });
    if (wounded === 'heal') {
      const feet = Math.max(0, actor.y - 1.75);
      entry.heal = { time: 0, feet, started: elapsed }; actor.healing = 0; actor.y = feet + BOT_HEAL.kneelEye; entry.burst = 0; entry.target = '';
      return;
    }
    // Wounded with someone in view: back away to break the line before patching up.
    if (wounded === 'retreat' && visible) approach = -1;
    const strafe = Number.isFinite(intent.strafe) ? clamp(intent.strafe, -1, 1) : 0;
    const normal = Math.max(1, Math.hypot(approach, strafe));
    let dxStep = (direction.x * approach - direction.z * strafe) / normal * role.speed * dt;
    let dzStep = (direction.z * approach + direction.x * strafe) / normal * role.speed * dt;
    if(!entry.anchor && ((navigator && Math.abs(target.y-actor.y)>.6) || entry.navigation?.path.length)) {
      const feet={x:actor.x,y:Math.max(0,actor.y-1.75),z:actor.z};
      const goal={x:target.x,y:floorAt(target),z:target.z};
      if(entry.navigation) entry.navigation.retry-=dt;
      if(navigator && (!entry.navigation || !entry.navigation.pending && entry.navigation.retry<=0 && (!entry.navigation.path.length || distance(entry.navigation.target,goal)>4)))
        entry.navigation={path:[],target:goal,retry:1.5,pending:navigator.plan(feet,goal)};
      if(entry.navigation?.pending){
        // Cold graph edges are checked over several frames, never in one long
        // synchronous search. Six bots share at most roughly 6 ms per tick.
        const deadline=Math.min(performance.now()+1,navigationDeadline);
        do{const result=entry.navigation.pending.next();if(result.done){entry.navigation.path=result.value;entry.navigation.pending=undefined;break;}}while(performance.now()<deadline);
        // Hold position while a fresh path is planned so its start remains valid.
        dxStep=0;dzStep=0;
      }
      const path=entry.navigation?.path;
      while(path?.length && distance(feet,path[0])<.12)path.shift();
      if(path?.length){const p=path[0],d=Math.hypot(p.x-actor.x,p.z-actor.z),step=Math.min(d,role.speed*dt);dxStep=(p.x-actor.x)/Math.max(d,.001)*step;dzStep=(p.z-actor.z)/Math.max(d,.001)*step;}
    }
    // With nobody in sight, a patrol makes for a supply crate on the ground.
    const crate = !visible && !entry.temporary ? lureFor(actor) : null;
    if (crate) {
      const cx = crate.x - actor.x, cz = crate.z - actor.z, d = Math.hypot(cx, cz), stride = Math.max(0, Math.min(d - 1, role.speed * dt));
      dxStep = d > .01 ? cx / d * stride : 0; dzStep = d > .01 ? cz / d * stride : 0;
    }
    // Bots run from a marked barrage, still firing if they can see someone. An event's crew holds its post.
    const exit = entry.anchor ? null : dangerExit(actor);
    if (exit) { dxStep = exit.x * role.speed * 1.3 * dt; dzStep = exit.z * role.speed * 1.3 * dt; }
    const vehicleSolids = vehicles.filter(v => v.y < 2).map(vehicleBounds);
    if (entry.anchor) Object.assign(actor, { x: entry.anchor.x, z: entry.anchor.z });
    else if (traversal) {
      const step = traversal.move({ x: actor.x, y: Math.max(0, actor.y - 1.75), z: actor.z, velocityY: entry.velocityY ?? 0 }, dxStep, dzStep, dt, .4, 1.8, vehicleSolids);
      Object.assign(actor, { x: step.x, z: step.z, y: step.y + 1.75 }); entry.velocityY = step.velocityY;
    } else Object.assign(actor, move(actor, dxStep, dzStep, .4, [...groundObstacles, ...vehicleSolids]));
    actor.yaw = Math.atan2(-dx, -dz); actor.pitch = Math.atan2(line.y, horizontal);
    // An event's crew may not open fire before the event has been announced.
    if (!visible || !intent.fire || (entry.temporary && elapsed < entry.temporary.from)) { entry.reaction = role.reaction; entry.target = ''; entry.burst = 0; return; }
    if (entry.target !== enemy.actor.id) { entry.target = enemy.actor.id; entry.reaction = role.reaction + random() * 0.3; entry.burst = 0; }
    entry.reaction -= dt;
    if (entry.reaction <= 0) {
      // Bursts at the weapon's own cycle, then a pause the role decides.
      if (entry.burst <= 0) { const [low, high] = role.burst ?? [1, 1]; entry.burst = low + Math.floor(random() * (high - low + 1)); entry.burstFired = 0; }
      // Deliberate arcade inaccuracy gives moving players time to react; recoil opens it through a burst.
      const base = Number.isFinite(intent.spread) ? clamp(intent.spread, 0.005, 0.2) : 0.05;
      const spread = entry.spec ? botShotSpread(base, entry.spec, entry.burstFired) : base;
      shoot(actor.id, actor, { x: ray.x + (random() - 0.5) * spread, y: ray.y + (random() - 0.5) * spread, z: ray.z + (random() - 0.5) * spread }, actor.weapon);
      entry.burst--; entry.burstFired++;
      const pause = (Number.isFinite(intent.shotDelay) ? clamp(intent.shotDelay, 0.1, 5) : 0.5) + random() * 0.15;
      entry.reaction = entry.burst > 0 && entry.spec ? botFireCadence(entry.spec) : Math.max(pause, entry.spec?.interval ?? 0);
    }
  }
  let navigationDeadline = 0;
  function step(dt: number) {
    if (finished || !Number.isFinite(dt) || dt <= 0) return;
    navigationDeadline = performance.now() + NAVIGATION_BUDGET;
    dt = Math.min(dt, 0.25); elapsed = environment?.endless ? elapsed + dt : Math.min(ARENA_DURATION, elapsed + dt); tick++;
    for (let remaining = dt; remaining > 1e-6; remaining -= Math.min(.05, remaining)) stepVehicles(Math.min(.05, remaining));
    factionHeat?.step(dt);
    stepEvents(dt);
    for (const entry of members.values()) {
      entry.movementBudget = Math.min(8, entry.movementBudget + 40 * dt);
      if (!entry.actor.alive) {
        entry.actor.respawnIn = Math.max(0, entry.actor.respawnIn - dt);
        // An event's crew does not come back: the body is cleared away once it has been seen to fall.
        if (entry.temporary) { if (entry.actor.respawnIn === 0) dismiss(entry.actor.id); continue; }
        if (entry.actor.respawnIn === 0) {
          // With reinforcements, a fallen bot comes back on a transport; only one left waiting too long walks back in.
          if (!environment?.reinforcements || !entry.actor.bot) spawn(entry);
          else { entry.waiting ??= elapsed; if (!entry.ride && elapsed - entry.waiting > REINFORCEMENT_FALLBACK) spawn(entry); }
        }
        continue;
      }
      entry.ammo.forEach((state, index) => advanceWeapon(state, index, dt, entry.weapons));
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
    return { type: 'arena-snapshot', tick, elapsed, actors: [...members.values()].filter(m => !m.reserve).map(m => ({ ...m.actor })), feed: feed.map(event => ({ ...event })), finished, winner, ...(vehicleOptions ? { vehicles: vehicles.map(v => ({ ...v, occupants: [...v.occupants], shotEnd: v.shotEnd ? { ...v.shotEnd } : null })) } : {}),
      ...(events.length ? { events: events.map(e => ({ ...e.descriptor, target: { ...e.descriptor.target }, ...(e.descriptor.origin ? { origin: { ...e.descriptor.origin } } : {}) })) } : {}),
      ...(raiders.size ? { raiders: [...raiders.values()].map(({ event, kind, x, y, z, yaw, health, maxHealth, state, aim, shots }) => ({ event, kind, x, y, z, yaw, health, maxHealth, state, aim: aim ? { ...aim } : null, shots })) } : {}),
      ...(factionHeat ? { heat: factionHeat.snapshot() } : {}) };
  }
  function reset() {
    tick = 0; elapsed = 0; finished = false; winner = ''; feed.length = 0; controls.clear(); events.length = 0; raiders.clear(); liveClouds = []; heat.clear(); interests.length = 0; director?.reset();
    for (const [id, entry] of members) if (entry.temporary) dismiss(id);
    // Back to the starting garrison: recruits were the reinforcements' doing.
    for (const [id, entry] of members) if (entry.recruit) members.delete(id);
    enlisted = count; factionHeat?.reset(); clock = dispatchClock();
    vehicles = vehicleOptions ? (['car', 'helicopter'] as const).map(kind => createSharedVehicle(kind, vehicleOptions.spawns[kind])) : [];
    for (const entry of members.values()) { entry.actor.kills = 0; entry.actor.deaths = 0; entry.actor.shots = 0; spawn(entry); }
    announce('New arena match');
  }
  const count = Number.isFinite(botCount) ? Math.floor(clamp(botCount, 0, 6)) : 0;
  const fixedPopulation = environment?.reinforcements && Number.isFinite(environment.population) ? Math.floor(clamp(environment.population!, count, MAX_ARENA_BOTS)) : count;
  let enlisted = 0, friendly = 0;
  /** Friendly soldiers carry the issued rifle, or the Ultimax in a support role, and drop nothing. */
  const forcesFamily = (role: ArenaRolePlugin) => role.id === 'tank' ? 1 : 0;
  /** A recruit's role under heat: the hotter the side, the more support gunners and marksmen in the mix. */
  function heatedRole(faction: SquadFaction) {
    const s = factionHeat!.districtStrength(faction), weights = faction === PLAYER_FACTION ? [1, .3 * s, .3 * s] : [1, .2 + .8 * s, .2 + .5 * s];
    let roll = armamentRandom() * weights.reduce((a, b) => a + b, 0);
    return (['assault', 'tank', 'sniper'] as const).find((_, i) => (roll -= weights[i]) <= 0) ?? 'assault';
  }
  /**
   * Signs up the next soldier for a squad faction. The garrison spawns at once; a recruit is
   * held in reserve, dead and waiting, until the transport that booked it
   * sets it down.
   */
  function enlist(recruit = false, faction: SquadFaction = 'mercenaries') {
    const i = enlisted++, id = `bot-${i + 1}`;
    const roleId = recruit && factionHeat && (composition === 'mixed' || faction === PLAYER_FACTION) ? heatedRole(faction)
      : faction === PLAYER_FACTION ? 'assault' : composition === 'mixed' ? ['assault', 'tank', 'sniper'][i % 3] : composition;
    const role = getArenaRole(roleId) ?? getArenaRole('assault')!;
    const armed = faction === PLAYER_FACTION ? [forcesFamily(role)] : armamentFamilies(role), weapons = FPS_WEAPONS.map((w, index) => armed.includes(index) ? role.weapon : w);
    const name = faction === PLAYER_FACTION ? `${FORCES_RANKS[role.id] ?? 'Pte'} ${FORCES_NAMES[friendly++ % FORCES_NAMES.length]}` : `${role.name.split(' ')[0]} ${CALLSIGNS[i % CALLSIGNS.length]}`;
    // Recruits arrive unannounced: the transport's banner is their entrance.
    if (recruit) addMember(id, name, role.armor, role.absorption, weapons, false); else addPlayer(id, name, role.armor, role.absorption, weapons);
    const entry = members.get(id)!; entry.role = role; entry.healthMax = role.health;
    Object.assign(entry.actor, { bot: true, role: role.id, faction }); spawn(entry);
    if (recruit) { entry.recruit = true; entry.reserve = true; Object.assign(entry.actor, { alive: false, respawnIn: 0 }); entry.waiting = elapsed; }
    return entry;
  }
  for (let i = 0; i < count; i++) enlist();
  return { vehicleAction, addPlayer, removePlayer, setInput, reloadPlayer, shoot, step, snapshot, reset, setPlayerLoadout, setPlayerVitals, setPlayerHealthMultiplier, triggerEvent, setCombatEvents };
}

export type ArenaSimulation = ReturnType<typeof createArena>;
