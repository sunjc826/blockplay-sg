import { MAX_CONFIRMED_IMPACTS, IMPACT_LIFETIME, type ConfirmedImpact } from './confirmed-impacts';
import { createGrenadeSystem, validThrowGrenade, type ThrowGrenade, type GrenadeBurst, type LiveGrenade, type GrenadeEvent } from './grenade-system';
import { applyGrenadeConditions, advanceGrenadeConditions, arenaConditionModifiers, type ActiveGrenadeConditions } from './grenade-effects';
import { heldSupplies } from './utility-belt';
import { WORLD_VEHICLES, clearVehicleSpawn } from './world-vehicles';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { createVerticalNavigator, type NavigationPoint } from './vertical-navigation';
import { createVerticalMovement, MAX_STEP_HEIGHT, type VerticalWorld } from './vertical-movement';
import { footprintRayInterval, overlapsObstacleRect } from './region-collision';
import { surfaceContains } from './vertical-routes';
import { validVehicleControls, createSharedVehicle, seatOf, seatPoint, gunnerId, vehicleGunRay, vehicleRayDistance, type SharedVehicle, type VehicleControls } from './vehicle-seats';
import { driveVehicle, flyVehicle, vehicleBounds, vehicleExit, type VehicleKind, type VehicleSpawn, type FlightObstacle } from './vehicle-rules';
import { damageVehicle, fireVehicleWeapon, vehicleCollisionDamage, VEHICLE_COMBAT } from './vehicle-combat';
import { applyArmorDamage } from './armory-state';
import { insertTraits, sightRangeAgainst, smokeHides, type InsertTraits } from './armor-inserts';
import { PRONE_EYE_HEIGHT, weaponBraced, unsupportedRecoilDamage } from './fps-stance';
import { MARINA_BOUNDS, moveInMarina, type Obstacle } from './marina-collision';
import { advanceWeapon, beginReload, createLoadout, FPS_WEAPONS, fireWeapon, hitDamage, interruptReload, reloadCommit, reloadProgress, roundReady, type WeaponSpec, type WeaponState } from './fps-rules';
import { armamentFamilies, chooseArmament, getArenaRole, type ArenaRolePlugin } from './arena-roles';
import { variantSpec } from './armory-state';
import { BOT_AIM, BOT_HEAL, botAimScale, botFireCadence, botShotSpread, botWantsHeal } from './arena-bot-combat';
import { DRONE, DRONE_BLAST, MORTAR, OVERWATCH, RAID, SUPPLY } from './combat-event-catalog';
import { combatPhase, combatTimeline, getCombatEvent, orbitPose, MAX_COMBAT_EVENTS, MAX_TROOPS, type CloudPayload, type CombatEventDescriptor, type CombatOutcome, type CombatPlane, type CratePayload, type MunitionPayload, type OrbitPayload } from './combat-events';
import { createCombatDirector, planTransport, type CombatRisk } from './combat-director';
import { OVERHEAD_SHELTER, resolveBlast, type BlastTarget } from './combat-blast';
import { DEFAULT_BOT_FACTION, getArenaFaction, hostile, PLAYER_FACTION, SQUAD_FACTIONS, type SquadFaction } from './arena-factions';
import { BARK_RANGE, BARK_TUNING, createBarkDirector, type BarkEvent } from './npc-barks';
import { CALLOUT_COOLDOWN, getPlayerCallout } from './player-callouts';
import { ORDER_ACKS, ORDER_TUNING, orderGoal, orderStep, standingOrder, type OrderKind, type StandingOrder } from './squad-orders';
import { RANK_IDS } from './npc-barks';
import { TRANSPORT_DROP_RANGE } from './combat-director';
import { ballisticPoint, isInstant, muzzleBallistics, type BallisticSpec } from './fps-ballistics';
import type { PublishedRound } from './fps-projectiles';
import { createHeatField, HEAT_TUNING, type HeatBand, type HeatSector } from './faction-heat';
import { drawRank, type BotRank } from './arena-ranks';
import { muzzleSignature, sanitizeMuzzle, type MuzzleDevice } from './weapon-accessories';
import { advanceFoodEffects, applyFoodEffects, arenaFoodModifiers, NO_FOOD, survivesWithAhMa, type ActiveFoodEffects } from './food-effects';
import { CONSUMABLE_LIMIT, itemById } from './armory-catalog';
import { supplyProfile } from './fps-healing';

/** All coordinates use metres; actor y is eye height, not the feet. */
export interface ArenaActor {
  id: string; name: string; bot: boolean; x: number; y: number; z: number; yaw: number; pitch: number;
  health: number; armor: number; kills: number; deaths: number; alive: boolean; respawnIn: number; weapon: number;
  shots: number; role: string; prone?: boolean; vehicle?: VehicleKind; seat?: number;
  /** Who they fight for (arena-factions): players and friendly squads the armed forces, enemy squads the mercenaries, event crews their event's side. */
  faction: string;
  /** Bots: the catalog variant in their hands, which is what they drop. */
  variant?: string;
  /** Share of a dressing applied while a bot patches up, or of a supply a player is using, so others see them busy. */
  healing?: number;
  /** Where the last thing that hurt this actor came from; `serial` changes with every hit. */
  hurtFrom?: { x: number; z: number; serial: number; blast?: boolean };
  /** Players: how many times Ah Ma's tingkat has kept them up (food-effects), so their engine can say so. */
  ahMaSaves?: number;
  /** Players: the meals still working on them, as the host runs them (food-effects). */
  food?: ActiveFoodEffects;
  conditions?: ActiveGrenadeConditions;
  /** The grenade still on this bot, also used for expedition drops. */
  grenade?: string;
  /** Which actors can see this actor through cover after a spotter reveal. */
  markedBy?: string[];
  /** A rooftop sniper with someone in their scope: renderers show the glint. */
  aiming?: boolean;
  /** Feet height of an actor held on a perch the walk surfaces do not describe, such as a roof. */
  ground?: number;
  /** Bots: grade 1 (recruit) to 3 (veteran), drawn at each spawn; see arena-ranks. */
  rank?: number;
  /** Players: seconds left on the spawn shield, present only while it holds. */
  shield?: number;
  /** What is on the muzzle of the gun they last fired, which is how loud it was. */
  muzzle?: MuzzleDevice;
  /** Their inserts smell (armor-inserts): opponents' minimaps show where they are. */
  scent?: true;
  /** Players: seconds until HQ will send them another transport (squad-orders), present while they wait. */
  reinforceIn?: number;
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
/**
 * Something said aloud: a bot's bark (npc-barks) or a player's callout from the
 * wheel (player-callouts). Screens decide who is near enough to hear it.
 */
export interface ArenaBark {
  id: string; actor: string; text: string;
  /** The bark's reason, or 'callout' for a player's. */
  kind: BarkEvent | 'callout';
  /** A player's callout id. */
  callout?: string;
  /** Where a pinging callout points. */
  at?: ArenaPoint;
  /** An order's outcome: how many allies took it, and what HQ said. */
  order?: { allies: number; note?: string };
}
/** Barks a snapshot carries; screens keep the ones they have not shown yet. */
export const MAX_ARENA_BARKS = 8;
export interface ArenaSnapshot {
  grenades?: LiveGrenade[]; grenadeEvents?: GrenadeEvent[];
  type: 'arena-snapshot'; tick: number; elapsed: number; actors: ArenaActor[];
  feed: ArenaFeed[]; finished: boolean; winner: string; vehicles?: SharedVehicle[];
  /** Combat events still running or lingering; each one's rounds follow from its descriptor. */
  events?: CombatEventDescriptor[];
  /** Raid helicopters and drones in the air, or coming down. */
  raiders?: ArenaRaider[];
  /** Each sector's heat per faction, with '' for the district; only where the environment has heat. */
  heat?: ArenaHeat[];
  /** Rounds in the air, for screens to draw; the host alone decides what they hit. */
  rounds?: ArenaRoundView[];
  /** Wounds produced only after the host applied health damage. */
  impacts?: ConfirmedImpact[];
  /** The latest things said, oldest first. */
  barks?: ArenaBark[];
}
export type ArenaHeat = { sector: string } & Record<SquadFaction, number>;
export interface ArenaInput {
  x: number; y: number; z: number; yaw: number; pitch: number; weapon: number; playing: boolean; reloading?: boolean; prone?: boolean; vehicleControls?: VehicleControls;
  /** How far through using a supply the player is (0..1), so everyone else sees them patching up or eating. */
  supply?: number;
}
export type ArenaWeapon = Pick<WeaponSpec, 'damage' | 'interval' | 'capacity' | 'reload' | 'requiresMount' | 'bolt'> & Partial<Pick<WeaponSpec, 'ballistics'>> & { accessories?: { muzzle?: MuzzleDevice } };
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
  /** Persistent district fleet and autonomous car crews; training keeps its match rules. */
  openWorld?: boolean;
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
/** Friendly soldiers' surnames, after their rank's title. */
const FORCES_NAMES = ['Tan', 'Rahman', 'Kumar', 'Lim', 'Hafiz', 'Ong', 'Raj', 'Goh', 'Iskandar', 'Chua'];
const CALLSIGNS = ['Merlion', 'Orchid', 'Sentosa', 'Katong', 'Jewel', 'Kallang', 'Bedok', 'Changi', 'Kranji', 'Seletar', 'Tekong', 'Ubin', 'Simei', 'Lentor', 'Dover', 'Pasir'];
/** How long a bot trusts its last mesh line-of-sight check before casting again. */
export const ARENA_SIGHT_RECHECK = .2;
export const ARENA_DURATION = 180;
export const ARENA_KILL_LIMIT = 15;
export const ARENA_RESPAWN_SECONDS = 3;
/** Seconds after spawning that bots' rounds do a player no harm; the player's own first shot ends it. */
export const SPAWN_SHIELD_SECONDS = 3;
const EMPTY_SHOT: ArenaShot = { hitId: null, killed: false, damage: 0 };
/** Most small-arms rounds the host keeps in the air at once; the oldest gives way. */
export const MAX_ARENA_ROUNDS = 96;
/**
 * A carried gun's round in flight on the host. Walls and rendered cover are
 * measured once along its line when it leaves (drop inside 125 m is under a
 * third of a metre); people, vehicles and raiders are tested along each tick's
 * stretch of its arc, so they can step into it or out of its way.
 */
interface ArenaRound {
  id: number; origin: ArenaPoint; direction: ArenaPoint; position: ArenaPoint; ballistics: BallisticSpec; damage: number; spec?: WeaponSpec; limit: number; time: number; travelled: number;
  /** What its strike looks like, published with it: the gun's bore in mm and the damage its look is sized by. */
  calibre: number; power: number;
  /** Who fired it and is credited, if anyone; a raider's round names its `cause` instead. */
  shooter?: InternalActor; cause?: string;
  /** A vehicle gun's own hull, which its rounds leave rather than strike. */
  vehicle?: VehicleKind;
  ignoreHull?: VehicleKind;
}
/** A round in flight as snapshots carry it, so every screen can fly a copy to draw. */
export type ArenaRoundView = PublishedRound;
/** Share of a reload by which a guest's own commit point may run ahead of the host's. */
const RELOAD_COMMIT_GRACE = .12;
const SPAWNS = [
  { x: -44, z: 68 }, { x: -65, z: 72 }, { x: -20, z: 73 }, { x: -52, z: 55 },
  { x: -8, z: 64 }, { x: -73, z: 60 }, { x: -34, z: 58 }, { x: 4, z: 74 },
];
interface InternalActor {
  vehicleBoardAfter?: number;
  velocityY?: number;
  navigation?: { path: NavigationPoint[]; target: NavigationPoint; retry: number; pending?: Generator<undefined, NavigationPoint[]> };
  actor: ArenaActor; healthMax: number; armorMax: number; absorption: number; insert: InsertTraits; weapons: ArenaWeapon[]; allowedWeapons: number[]; role?: ArenaRolePlugin;
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
  /** Arena time until which bots' rounds pass a freshly spawned player by. */
  shieldUntil?: number;
  /** Players: the meals working on them (food-effects). The host runs the timers and the healing. */
  meals?: ActiveFoodEffects;
  /**
   * Guests: the supplies they joined with, which the host spends, so a guest
   * uses only what they brought. Unset for a player whose own engine counts
   * them (the host's, a solo player's).
   */
  supplies?: Record<string, number>;
  /** When this player last used a supply, against a client that sends them faster than hands can. */
  lastSupplyAt?: number;
  grenadeSupplies?: Record<string, number>; initialGrenades?: Record<string, number>; lastGrenadeAt?: number; lastMissionAt?: number; lastContact?: ArenaPoint & { time: number };
  /** Ground velocity and speed in m/s, smoothed over a few ticks, and where they were last measured from. */
  velocity?: { x: number; z: number }; speed?: number; lastAt?: { x: number; z: number };
  /** When a bot first had its present target in sight, for its aim to settle from. */
  focusSince?: number;
  /** A bot's turn to fire on a player, held while it keeps a shot; see BOT_AIM.shooters. */
  turn?: { target: string; until: number };
  /** A bot's rank this life, and the name it goes by after its rank's title. */
  rank?: BotRank; callsign?: string;
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
  /** Bots: when they last saw an enemy or were hit, which decides whether a sighting is a fresh contact and whether they are calm enough to chat. */
  lastFight?: number;
  /** Bots: reloading, or running from a marked barrage, as of the last tick, so the bark goes with the start of it. */
  barkReload?: boolean; barkFleeing?: boolean;
  /** Players: when they last used the callout wheel. */
  lastCallout?: number;
  /** Bots: a player's standing order (squad-orders), when it was given, and the enemy a player told them to focus on. */
  order?: StandingOrder & { since: number }; focus?: { id: string; until: number; since: number };
  /** Bots off a player's transport: who to gather on once they land. */
  reportTo?: string;
  /** Players: when HQ last sent them a transport. */
  reinforcedAt?: number;
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

/** Distance to solid scene cover, or Infinity. Unspecified height means a tall wall. */
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
    if (obstacle.footprint && far >= near) [near,far]=footprintRayInterval(obstacle.footprint,origin,direction,near,far);
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
export function createArena(obstacles: readonly Obstacle[], botCount: number, composition = 'mixed', environment?: ArenaEnvironment, vehicleOptions?: ArenaVehicleOptions, traversalWorld?: VerticalWorld, coverDistance?: ArenaCoverDistance, grenadeCoverTrace?: import('./grenade-flight').GrenadeTrace) {
  // Rendered cover stops every round, with or without vehicles in the match.
  const cover = coverDistance ?? vehicleOptions?.coverDistance;
  const bounds = environment?.bounds ?? MARINA_BOUNDS;
  const traversal = traversalWorld ? createVerticalMovement(traversalWorld) : null;
  const vehicleGround = [...obstacles, ...(traversalWorld ? verticalVehicleObstacles(traversalWorld) : [])];
  const navigator = traversalWorld?.surfaces.length ? createVerticalNavigator(traversalWorld) : null;
  const floorAt = (point: ArenaPoint) => traversal?.supportHeight(point.x, point.z, point.y - .5, .35, .6) ?? 0;
  const move = environment?.move ?? moveInMarina;
  const coverObstacles = [...obstacles, ...(traversalWorld?.traversalObstacles ?? [])];
  const worldWallDistance = (origin: ArenaPoint, ray: ArenaPoint, range = 240) => {
    // Scene-backed games use rendered triangles as their sole shot/sight cover.
    // Footprints and full-height rail guards are movement approximations only.
    if (cover) return cover(origin, ray, range);
    let distance = arenaWallDistance(origin, ray, coverObstacles);
    for (const s of traversalWorld?.surfaces ?? []) {
      const low = s.axis === 'x' ? s.minX : s.minZ, high = s.axis === 'x' ? s.maxX : s.maxZ;
      const slope = (s.endHeight - s.startHeight) / (high - low);
      const denominator = ray.y - slope * ray[s.axis];
      if (s.solidBelow) {
        // Clip the sloped prism, including its authored terrain boundary.
        let near = 0, far = distance;
        const planes = [[origin.x - s.minX, ray.x], [s.maxX - origin.x, -ray.x],
          [origin.z - s.minZ, ray.z], [s.maxZ - origin.z, -ray.z], [origin.y, ray.y],
          [s.startHeight + slope * (origin[s.axis] - low) - origin.y, -denominator]];
        for (const [offset, direction] of planes) {
          if (Math.abs(direction) < 1e-8) { if (offset < 0) { far = -1; break; } }
          else if (direction > 0) near = Math.max(near, -offset / direction);
          else far = Math.min(far, -offset / direction);
        }
        if (s.footprint && far >= near) [near,far]=footprintRayInterval(s.footprint,origin,ray,near,far);
        if (far >= near) distance = Math.min(distance, near);
      }
      if (Math.abs(denominator) < 1e-8) continue;
      const t = (s.startHeight + slope * (origin[s.axis] - low) - origin.y) / denominator;
      const x = origin.x + ray.x * t, z = origin.z + ray.z * t;
      if (t >= 0 && surfaceContains(s,x,z)) distance = Math.min(distance, t);
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
  const vehicleLife = new Map<VehicleKind, { idle: number; wreck: number; stuck: number; wait: number; unload: boolean; think: number; lastThink: number; crew: string[]; assembleUntil: number; departed: boolean; goal?: VehicleSpawn }>();
  const lifeOf = (v: SharedVehicle) => {
    let life = vehicleLife.get(v.kind);
    if (!life) { life = { idle: 0, wreck: 0, stuck: 0, wait: 0, unload: false, think: 0, lastThink: elapsed, crew: [], assembleUntil: 0, departed: false }; vehicleLife.set(v.kind, life); }
    return life;
  };
  let tick = 0; let elapsed = 0; let finished = false; let winner = ''; let eventId = 0; let seed = 92371, hurtSerial = 0;
  const feed: ArenaFeed[] = [];
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // What a bot is issued has its own stream, so the draw cannot move anything else the seed decides.
  let armamentSeed = 51787;
  const armamentRandom = () => { armamentSeed = (Math.imul(armamentSeed, 1664525) + 1013904223) >>> 0; return armamentSeed / 4294967296; };
  // Barks draw on a stream of their own, so whether anyone spoke never changes how a fight goes.
  let barkSeed = 70411, barkId = 0, idleIn = BARK_TUNING.idleEvery[0];
  const barkRandom = () => { barkSeed = (Math.imul(barkSeed, 1664525) + 1013904223) >>> 0; return barkSeed / 4294967296; };
  const barker = createBarkDirector(barkRandom), barks: ArenaBark[] = [], replies: { id: string; event: BarkEvent; at: number }[] = [];
  const say = (actor: string, text: string, kind: ArenaBark['kind'], extra: Pick<ArenaBark, 'callout' | 'at'> = {}) => {
    const said: ArenaBark = { id: String(++barkId), actor, text, kind, ...extra }; barks.push(said);
    if (barks.length > MAX_ARENA_BARKS) barks.shift();
    return said;
  };
  /** A bot has a reason to speak; the director decides whether they do and in what words. */
  function bark(entry: InternalActor, event: BarkEvent) {
    const actor = entry.actor;
    if (!actor.bot || !actor.alive || entry.reserve) return;
    const text = barker.offer(actor.id, { faction: actor.faction, side: getArenaFaction(actor.faction)?.side, role: actor.role, rank: actor.rank }, event, elapsed);
    if (text) say(actor.id, text, event);
  }
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
    if (entry.role) {
      // A fresh soldier off the transport: rank first, since it decides the kit.
      const strength = factionHeat && isSquad(entry.actor.faction) ? factionHeat.strength(entry.actor.faction, entry.home ?? null) : undefined;
      entry.rank = drawRank(strength, armamentRandom); entry.actor.rank = entry.rank.grade;
      // Armour follows rank and heat: a hot sector's troops come back with heavier plates.
      entry.armorMax = clamp(entry.role.armor * entry.rank.armor * (strength === undefined ? 1 : .75 + .5 * strength), 0, 150);
      if (entry.callsign) entry.actor.name = `${entry.rank.title[getArenaFaction(entry.actor.faction)?.side ?? 'opposition']} ${entry.callsign}`;
    }
    Object.assign(entry.actor, { x: p.x, z: p.z }, { y: 1.75, health: entry.healthMax, armor: entry.armorMax, alive: true, prone: false, respawnIn: 0,
      yaw: Number.isFinite(preferred?.yaw) ? preferred!.yaw! : 0, pitch: Number.isFinite(preferred?.pitch) ? clamp(preferred!.pitch!, -1.5, 1.5) : 0 });
    if (entry.role && entry.actor.faction === PLAYER_FACTION) {
      // Friendly soldiers carry the issued rifle, or the Ultimax in support, which is what they drop.
      entry.actor.weapon = forcesFamily(entry.role); delete entry.actor.variant; entry.spec = undefined; entry.medkits = (entry.role.medkits ?? 1) + (entry.rank?.medkits ?? 0);
    } else if (entry.role) {
      const issued = chooseArmament(entry.role, armamentRandom, entry.rank?.kit); entry.actor.weapon = issued.family; entry.actor.variant = issued.id;
      // What they carry is what they fire: the variant's damage, falloff, cycle, magazine and reload.
      entry.spec = variantSpec(issued) ?? undefined;
      if (entry.spec) entry.weapons[issued.family] = sanitizeWeapons([entry.spec])[0];
      entry.medkits = (entry.role.medkits ?? 1) + (entry.rank?.medkits ?? 0);
    }
    entry.ammo = entry.weapons.map(hostAmmo);
    entry.burst = 0; entry.burstFired = 0; entry.heal = undefined; entry.lastHurt = -Infinity; delete entry.actor.healing; entry.shieldUntil = elapsed + SPAWN_SHIELD_SECONDS;
    // A respawn starts hungry.
    entry.meals = undefined; delete entry.actor.food; delete entry.actor.conditions; delete entry.actor.markedBy;
    entry.grenadeSupplies ??= {}; entry.lastContact = undefined;
    if (entry.actor.bot && entry.actor.faction === 'mercenaries' && ['assault', 'tank'].includes(entry.role?.id ?? '')) { entry.actor.grenade = entry.role?.id === 'tank' ? 'grenade-smoke' : 'grenade-frag'; entry.grenadeSupplies[entry.actor.grenade] = 1; } else delete entry.actor.grenade;
    entry.velocity = undefined; entry.speed = 0; entry.lastAt = undefined; entry.focusSince = undefined; entry.turn = undefined;
    entry.navigation = undefined; entry.vehicleBoardAfter = undefined; entry.velocityY = 0; entry.waiting = undefined; entry.ride = undefined; entry.reserve = false;
    entry.movementBudget = 2; entry.reaction = 1; entry.target = ''; entry.wasReloading = false;
  };
  function sanitizeWeapons(weapons: readonly ArenaWeapon[]) {
    return (weapons.length ? weapons : FPS_WEAPONS).slice(0, FPS_WEAPONS.length).map((w, index): ArenaWeapon => ({
      requiresMount: w.requiresMount === true, bolt: w.bolt === 'open' ? 'open' : 'closed',
      damage: Number.isFinite(w.damage) ? clamp(w.damage, 1, 200) : 36,
      interval: Number.isFinite(w.interval) ? clamp(w.interval, 0.06, 3) : 0.12,
      capacity: Number.isFinite(w.capacity) ? Math.floor(clamp(w.capacity, 1, 200)) : 30,
      reload: Number.isFinite(w.reload) ? clamp(w.reload, 0.4, 8) : 1.8,
      ballistics: w.ballistics && Number.isFinite(w.ballistics.velocity) && Number.isFinite(w.ballistics.drop)
        ? { velocity: clamp(w.ballistics.velocity, 100, 1500), drop: clamp(w.ballistics.drop, 0, 30) } : FPS_WEAPONS[index]?.ballistics ?? FPS_WEAPONS[0].ballistics,
      ...(sanitizeMuzzle(w.accessories?.muzzle) ? { accessories: { muzzle: sanitizeMuzzle(w.accessories?.muzzle) } } : {}),
    }));
  }
  const allowedIndexes = (weapons: readonly ArenaWeapon[], allowed?: readonly number[]) => {
    const indexes = [...new Set((allowed ?? weapons.map((_, index) => index)).filter(index => Number.isInteger(index) && index >= 0 && index < weapons.length))];
    return indexes.length ? indexes : [0];
  };
  function addPlayer(id: string, name: string, armor = 0, absorption = 0, weapons: readonly ArenaWeapon[] = FPS_WEAPONS, initialVitals?: Partial<ArenaVitals>, usePlayerSpawn = false, allowed?: readonly number[], insert?: Partial<InsertTraits>) {
    const entry = addMember(id, name, armor, absorption, weapons, usePlayerSpawn, allowed, insert); if (!entry) return;
    if (initialVitals) setPlayerVitals(id, initialVitals); announce(`${entry.actor.name} joined`);
  }
  /** A new member, spawned, with nothing said in the feed. */
  function addMember(id: string, name: string, armor: number, absorption: number, weapons: readonly ArenaWeapon[], usePlayerSpawn: boolean, allowed?: readonly number[], insert?: Partial<InsertTraits>) {
    if (!id || id.length > 100 || members.has(id) || members.size >= MAX_ARENA_ACTORS) return null;
    const safeWeapons = sanitizeWeapons(weapons), allowedWeapons = allowedIndexes(safeWeapons, allowed);
    const entry: InternalActor = {
      actor: { id, name: name.trim().slice(0, 24) || 'Player', bot: false, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0,
        health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: allowedWeapons[0], prone: false, shots: 0, role: 'player', faction: PLAYER_FACTION },
      healthMax: 100, armorMax: Number.isFinite(armor) ? clamp(armor, 0, 150) : 0, absorption: Number.isFinite(absorption) ? clamp(absorption, 0, 0.9) : 0,
      insert: insertTraits(insert), weapons: safeWeapons, allowedWeapons, ammo: [], playing: true, movementBudget: 2, wasReloading: false, usePlayerSpawn,
      reaction: 1, target: '', strafe: random() < 0.5 ? -1 : 1, patrol: validSpawns[0], patrolTime: 0,
      burst: 0, burstFired: 0, medkits: 0, lastHurt: -Infinity,
    };
    wearInsert(entry, entry.insert); members.set(id, entry); spawn(entry); return entry;
  }
  function wearInsert(entry: InternalActor, insert: InsertTraits) {
    entry.insert = insert;
    if (insert.scent) entry.actor.scent = true; else delete entry.actor.scent;
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
  /** The supplies a guest joined with, cleaned: consumables only, whole numbers, capped as a profile caps them. */
  function setPlayerSupplies(id: string, held: unknown) {
    const entry = members.get(id); if (!entry || entry.actor.bot) return;
    const supplies: Record<string, number> = {};
    if (held && typeof held === 'object') for (const [itemId, count] of Object.entries(held)) {
      if (itemById(itemId)?.category !== 'consumable' || typeof count !== 'number' || !Number.isFinite(count)) continue;
      const whole = Math.floor(clamp(count, 0, CONSUMABLE_LIMIT)); if (whole) supplies[itemId] = whole;
    }
    entry.supplies = supplies; setPlayerGrenades(id, supplies);
  }
  /** Register a host/solo player's brought grenades without changing supply accounting. */
  function setPlayerGrenades(id: string, held: Record<string, number>) {
    const entry = members.get(id); if (!entry) return;
    entry.initialGrenades = Object.fromEntries(Object.entries(heldSupplies(held)).filter(([key]) => itemById(key)?.grenade));
    entry.grenadeSupplies = { ...entry.initialGrenades };
  }
  function throwGrenade(id: string, input: ThrowGrenade) {
    const entry = members.get(id);
    if (!entry || finished || !entry.actor.alive || !entry.playing || seatOf(vehicles, id) || !validThrowGrenade(input) || distance(input.origin, entry.actor) > 1.5) return false;
    if (arenaConditionModifiers(entry.actor.conditions).frozen && input.cooked < itemById(input.id)!.grenade!.fuse) return false;
    if (elapsed - (entry.lastGrenadeAt ?? -Infinity) < .9 || (entry.grenadeSupplies?.[input.id] ?? 0) <= 0) return false;
    if (input.id === 'grenade-red-smoke' && elapsed - (entry.lastMissionAt ?? -Infinity) < 60) return false;
    if (!grenadeSystem.throwGrenade(id, input)) return false;
    entry.grenadeSupplies![input.id]--; entry.lastGrenadeAt = elapsed;
    if (entry.actor.bot) delete entry.actor.grenade;
    if (input.id === 'grenade-red-smoke') entry.lastMissionAt = elapsed;
    return true;
  }
  /**
   * A player uses a supply. The host heals, refills the inserts and starts the
   * meal from the catalogue's own figures, never the client's; a guest's is
   * spent from what they joined with. Refused for the dead, for something not
   * held, and for a use that comes faster than the hands could have done it.
   */
  function useSupply(id: string, itemId: string) {
    const entry = members.get(id), item = typeof itemId === 'string' ? itemById(itemId) : undefined;
    if (!entry || entry.actor.bot || finished || !entry.actor.alive || item?.category !== 'consumable' || !item.effect) return false;
    if (entry.supplies && !((entry.supplies[item.id] ?? 0) > 0)) return false;
    const hands = supplyProfile(item);
    if (entry.lastSupplyAt !== undefined && elapsed - entry.lastSupplyAt < hands.seconds * hands.commit * .5) return false;
    if (entry.supplies) { if (entry.supplies[item.id] > 1) entry.supplies[item.id]--; else delete entry.supplies[item.id]; }
    entry.lastSupplyAt = elapsed;
    const { health = 0, armor = 0 } = item.effect;
    if (health) entry.actor.health = Math.min(entry.healthMax, entry.actor.health + health);
    if (armor) entry.actor.armor = Math.min(entry.armorMax, entry.actor.armor + armor);
    if (item.foodEffects?.length) { applyFoodEffects(entry.meals ??= {}, item.foodEffects); publishMeals(entry); }
    return true;
  }
  /** What the snapshot shows of a player's meals: a fresh copy, so an older snapshot never changes under its reader. */
  function publishMeals(entry: InternalActor) {
    const meals = entry.meals && Object.entries(entry.meals);
    if (!meals?.length) { entry.meals = undefined; delete entry.actor.food; return; }
    entry.actor.food = Object.fromEntries(meals.map(([kind, effect]) => [kind, { ...effect! }]));
  }
  /** A player's meals over a step: healing while well fed lasts, and every timer running down. */
  function stepMeals(entry: InternalActor, dt: number) {
    if (!entry.meals) return;
    const fed = advanceFoodEffects(entry.meals, dt);
    if (fed.heal > 0) entry.actor.health = Math.min(entry.healthMax, entry.actor.health + fed.heal);
    publishMeals(entry);
  }
  function setPlayerHealthMultiplier(id: string, multiplier: 1 | 5 | 10) {
    const entry = members.get(id); if (!entry || entry.actor.bot || ![1, 5, 10].includes(multiplier)) return;
    const fraction = entry.actor.health / entry.healthMax;
    entry.healthMax = 100 * multiplier;
    entry.actor.health = entry.healthMax * fraction;
  }
  function setPlayerLoadout(id: string, armor: number, absorption: number, weapons: readonly ArenaWeapon[], allowed?: readonly number[], insert?: Partial<InsertTraits>) {
    const entry = members.get(id); if (!entry || entry.actor.bot) return;
    if (insert) wearInsert(entry, insertTraits(insert));
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
    grenadeSystem.removeCaller(id); releaseSeat(id); members.delete(id); announce(`${entry.actor.name} left`);
  }
  function setInput(id: string, input: ArenaInput) {
    const entry = members.get(id); if (!entry || entry.actor.bot || finished || !input || !finitePoint(input)) return;
    if (![input.yaw, input.pitch].every(Number.isFinite)) return;
    entry.playing = input.playing === true;
    const actor = entry.actor; if (!actor.alive) return;
    if (arenaConditionModifiers(actor.conditions).frozen) { controls.delete(id); return; }
    // Using a supply shows: the same pose a bot takes to dress a wound.
    if (Number.isFinite(input.supply)) actor.healing = clamp(input.supply!, 0, 1); else delete actor.healing;
    const mounted = seatOf(vehicles, id);
    if (!mounted || mounted.seat >= 2) {
      if (entry.allowedWeapons.includes(input.weapon) && Number.isInteger(input.weapon) && input.weapon >= 0 && input.weapon < entry.weapons.length && input.weapon !== actor.weapon) {
        stopReload(entry, actor.weapon); actor.weapon = input.weapon; entry.wasReloading = false;
      }
      if (input.reloading === true && !entry.wasReloading) reloadPlayer(id, actor.weapon);
      // The player's own reload stopped: it was interrupted, or it ended a moment before this one.
      else if (input.reloading === false && entry.wasReloading) stopReload(entry, actor.weapon);
      entry.wasReloading = input.reloading === true;
    }
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
  }
  function reloadPlayer(id: string, weapon: number) {
    const entry = members.get(id);
    if (!entry || (seatOf(vehicles, id)?.seat ?? 2) < 2 || !entry.actor.alive || finished || !Number.isInteger(weapon) || weapon !== entry.actor.weapon || !entry.weapons[weapon] || !entry.allowedWeapons.includes(weapon)) return;
    if (arenaConditionModifiers(entry.actor.conditions).frozen) return;
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
    if (!entry || (seatOf(vehicles, id)?.seat ?? 2) < 2 || finished || !entry.actor.alive || !entry.playing || !finitePoint(origin) || !finitePoint(direction)) return { ...EMPTY_SHOT };
    if (arenaConditionModifiers(entry.actor.conditions).frozen) return { ...EMPTY_SHOT };
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
    // A can draws the fighting far less than a bare muzzle, and every listener hears it quieter.
    const muzzle = entry.weapons[weapon].accessories?.muzzle;
    if (muzzle) entry.actor.muzzle = muzzle; else delete entry.actor.muzzle;
    ammo.cooldown = 0; fireWeapon(ammo, weapon, entry.weapons); entry.actor.shots++; warm(entry.actor, muzzleSignature(muzzle).heat); entry.shieldUntil = 0;
    if (!roundReady(ammo, entry.weapons[weapon])) startReload(entry, weapon);
    return launch(entry, origin, ray, entry.weapons[weapon], Math.min(125, Math.max(0, maxDistance)), weapon);
  }
  const flying: ArenaRound[] = [];
  /** Hits players' rounds have landed since the host last asked, by shooter. */
  const landed = new Map<string, ArenaShot[]>();
  let roundSerial = 0, impactSerial = 0;
  const impacts: ConfirmedImpact[] = [];
  /** Sends a carried gun's round on its way; an instant gun still resolves at once. */
  function launch(entry: InternalActor, origin: ArenaPoint, ray: ArenaPoint, weapon: ArenaWeapon, range: number, family: number): ArenaShot {
    const ballistics = entry.spec?.ballistics ?? weapon.ballistics;
    const calibre = entry.spec?.caliberMm ?? FPS_WEAPONS[family]?.caliberMm ?? 5.56;
    const ignoreHull = seatOf(vehicles, entry.actor.id)?.vehicle.kind;
    // A fired-up player (food-effects) lands every round harder.
    const damage = weapon.damage * (entry.meals ? arenaFoodModifiers(entry.meals).damage : 1);
    if (!ballistics || isInstant(ballistics)) return resolveShot(entry, origin, ray, damage, range, ignoreHull, entry.spec, undefined, calibre, false);
    send({ shooter: entry, origin, direction: ray, ballistics, damage, spec: entry.spec, calibre, power: weapon.damage, ignoreHull }, range);
    return { ...EMPTY_SHOT };
  }
  /** Queues a round; cover is tested along each actual flight segment. */
  function send(round: Pick<ArenaRound, 'origin' | 'direction' | 'ballistics' | 'damage' | 'spec' | 'shooter' | 'cause' | 'vehicle' | 'ignoreHull' | 'calibre' | 'power'>, range: number) {
    const limit = range;
    if (flying.length >= MAX_ARENA_ROUNDS) flying.shift();
    flying.push({ ...round, id: ++roundSerial, origin: { ...round.origin }, position: { ...round.origin }, limit, time: 0, travelled: 0 });
  }
  /** Moves every round along its arc and lets each strike the first thing in this tick's stretch of it. */
  function stepRounds(dt: number) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const round = flying[i];
      // A shooter who left the match takes their rounds with them.
      if (round.shooter && members.get(round.shooter.actor.id) !== round.shooter) { flying.splice(i, 1); continue; }
      const to = ballisticPoint(round.origin, round.direction, round.ballistics, round.time + dt), from = round.position;
      const step = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, length = Math.hypot(step.x, step.y, step.z);
      const reach = Math.min(length, round.limit - round.travelled);
      if (reach > 1e-6) {
        const ray = { x: step.x / length, y: step.y / length, z: step.z / length };
        const shot = round.shooter ? resolveShot(round.shooter, from, ray, round.damage, reach, round.vehicle ?? round.ignoreHull, round.spec, round.travelled, round.calibre, !!round.vehicle)
          : strayShot(from, ray, reach, round.damage, round.cause ?? 'Gunfire', round.calibre);
        if (shot.stopped) {
          flying.splice(i, 1);
          if (shot.hitId && round.shooter && !round.shooter.actor.bot) { const list = landed.get(round.shooter.actor.id) ?? []; list.push({ hitId: shot.hitId, killed: shot.killed, damage: shot.damage }); landed.set(round.shooter.actor.id, list); }
          continue;
        }
      }
      round.time += dt; round.position = to; round.travelled += length;
      if (round.travelled >= round.limit) flying.splice(i, 1);
    }
  }
  /** Rounds still in the air, all of them or one shooter's. */
  const inFlight = (id?: string) => id === undefined ? flying.length : flying.filter(round => round.shooter?.actor.id === id).length;
  const roundViews = (): ArenaRoundView[] => flying.map(r => ({ id: r.id, origin: { ...r.origin }, direction: { ...r.direction }, velocity: r.ballistics.velocity, drop: r.ballistics.drop,
    limit: r.limit, time: r.time, calibre: r.calibre, power: r.power, ...(r.shooter ? { shooter: r.shooter.actor.id } : {}), ...(r.vehicle || r.ignoreHull ? { vehicle: r.vehicle ?? r.ignoreHull } : {}) }));
  /** The hits a player's rounds have landed since last asked, oldest first. */
  function takeHits(id: string) { const list = landed.get(id) ?? []; landed.delete(id); return list; }
  /**
   * `cause` names what did it when no actor did, as in "Artillery killed …";
   * it credits nobody. `piercing` damage (gas) goes round armour, not through it.
   * A round's `calibre` is held to the victim's insert rating (armor-inserts).
   */
  function hurtActor(victim: InternalActor, damage: number, attacker?: InternalActor, cause?: string, from?: ArenaPoint, blasted = false, piercing = false, calibre?: number, shred = 0) {
    const source = from ?? attacker?.actor;
    if (source && attacker !== victim) victim.actor.hurtFrom = { x: source.x, z: source.z, serial: ++hurtSerial, ...(blasted ? { blast: true } : {}) };
    victim.lastHurt = elapsed;
    if (attacker && attacker !== victim) victim.grudge = { id: attacker.actor.id, until: elapsed + GRUDGE_SECONDS };
    // A numbing meal takes the edge off what lands (food-effects).
    if (victim.meals) damage *= arenaFoodModifiers(victim.meals).damageTaken;
    // Only an insert that can turn a round draws for it, so every other fight keeps its random sequence.
    const struck = piercing ? { health: Math.max(0, victim.actor.health - damage), armor: victim.actor.armor, blocked: 0, deflected: false }
      : applyArmorDamage(victim.actor.health, victim.actor.armor, damage * (1 - shred), victim.absorption, { insert: victim.insert, caliberMm: calibre, roll: victim.insert.deflect > 0 && calibre !== undefined ? random() : undefined });
    const blocked = struck.deflected ? damage : struck.blocked;
    victim.actor.armor = struck.armor; victim.actor.health = Math.max(0, struck.health - damage * shred);
    // Ah Ma steps in once per tingkat: a lethal hit leaves her figure instead.
    if (victim.actor.alive && victim.meals) {
      const ahMa = survivesWithAhMa(victim.meals, victim.actor.health);
      if (ahMa.saved) { victim.actor.health = Math.min(victim.healthMax, ahMa.health); victim.actor.ahMaSaves = (victim.actor.ahMaSaves ?? 0) + 1; publishMeals(victim); }
    }
    const killed = victim.actor.health <= 0;
    if (killed && victim.actor.alive) {
      victim.actor.alive = false; victim.actor.deaths++; victim.actor.respawnIn = ARENA_RESPAWN_SECONDS; releaseSeat(victim.actor.id);
      victim.heal = undefined; delete victim.actor.conditions; delete victim.actor.markedBy; delete victim.actor.healing; victim.meals = undefined; delete victim.actor.food;
      if (attacker && attacker !== victim) attacker.actor.kills++;
      if (factionHeat && isSquad(victim.actor.faction)) factionHeat.casualty(victim.actor.faction, factionHeat.sectorAt(victim.actor.x, victim.actor.z)?.id ?? null, heatShare(victim, attacker));
      announce(cause && !attacker ? `${cause} killed ${victim.actor.name}` : `${attacker?.actor.name ?? 'Vehicle'} eliminated ${victim.actor.name}`, attacker?.actor.id, victim.actor.id);
      if (attacker && attacker !== victim) bark(attacker, 'kill');
      // The nearest of their own side who saw it go down says so.
      const witness = [...members.values()].filter(m => m !== victim && m.actor.bot && m.actor.alive && !m.reserve && m.actor.faction === victim.actor.faction && distance(m.actor, victim.actor) <= 30)
        .sort((a, b) => distance(a.actor, victim.actor) - distance(b.actor, victim.actor))[0];
      if (witness) bark(witness, 'man-down');
      victim.order = undefined; victim.focus = undefined;
      warm(victim.actor, 4);
      if (attacker && !environment?.endless && attacker.actor.kills >= ARENA_KILL_LIMIT) { finished = true; winner = attacker.actor.name; }
    } else if (!killed && factionHeat && isSquad(victim.actor.faction) && attacker !== victim && damage > 0) {
      // Taking fire heats a side a little before anyone falls.
      factionHeat.casualty(victim.actor.faction, factionHeat.sectorAt(victim.actor.x, victim.actor.z)?.id ?? null, heatShare(victim, attacker) * HEAT_TUNING.contact * Math.min(1, damage / 100));
    }
    if (!killed && victim.actor.bot && attacker !== victim) { victim.lastFight = elapsed; if (damage - blocked > 0) bark(victim, blasted ? 'incoming' : 'hurt'); }
    return { hitId: victim.actor.id, killed, damage: damage - blocked };
  }
  function wound(victim: InternalActor, origin: ArenaPoint, ray: ArenaPoint, distance: number, damage: number, attacker?: InternalActor, cause?: string, from?: ArenaPoint, calibre = 5.56) {
    const before = victim.actor.health;
    const result = hurtActor(victim, damage, attacker, cause, from, false, false, calibre);
    if (victim.actor.health < before) {
      impacts.push({ id: ++impactSerial, time: elapsed, victim: victim.actor.id,
        point: { x: origin.x + ray.x * distance, y: origin.y + ray.y * distance, z: origin.z + ray.z * distance },
        direction: { ...ray }, calibre, power: damage });
      if (impacts.length > MAX_CONFIRMED_IMPACTS) impacts.shift();
    }
    return result;
  }
  /** A player in the fight, either end of it, escalates it in full; bots fighting bots by a share. */
  const heatShare = (victim: InternalActor, attacker?: InternalActor) => !victim.actor.bot || attacker && !attacker.actor.bot ? 1 : HEAT_TUNING.skirmish;
  /**
   * `spec`, when given, prices the hit by range and zone the way the player's
   * own rounds are. A round in flight passes `flown`, the distance it covered
   * before this stretch. Cover and bodies are tested along that segment,
   * and the hit is priced at the whole distance. `stopped` says something in range took the round.
   */
  function resolveShot(entry: InternalActor, origin: ArenaPoint, ray: ArenaPoint, damage: number, range: number, ignore?: VehicleKind, spec?: WeaponSpec, flown?: number, calibre?: number, mountedGun = true): ArenaShot & { stopped?: boolean } {
    const reach = Number.isFinite(range) ? Math.max(0, range) : 0;
    let nearest = Math.min(reach, worldWallDistance(origin, ray, reach));
    const wallStops = nearest < reach;
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
    if (ignore && mountedGun) {
      const v = vehicles.find(v => v.kind === ignore)!;
      v.shotEnd = { x: origin.x + ray.x * nearest, y: origin.y + ray.y * nearest, z: origin.z + ray.z * nearest };
    }
    if (flown !== undefined && !raider && !hull && !victim) return { ...EMPTY_SHOT, stopped: wallStops };
    if (spec) damage = hitDamage(spec, (flown ?? 0) + nearest, victim && headHit(origin, ray, victim.actor, nearest) ? 'head' : undefined);
    if (raider) return { ...hurtRaider(raider, damage, entry), stopped: true };
    if (hull) { const before = hull.health; damageHull(hull, damage, entry); return { hitId: `vehicle-${hull.kind}`, killed: before > 0 && hull.health === 0, damage: Math.min(before, damage), stopped: true }; }
    // A round that finds one of the shooter's own side stops there and does no harm.
    if (victim && !hostile(entry.actor, victim.actor)) return { ...EMPTY_SHOT, stopped: true };
    if (victim && entry.actor.bot && !victim.actor.bot && elapsed < (victim.shieldUntil ?? 0)) return { hitId: victim.actor.id, killed: false, damage: 0, stopped: true };
    return victim ? { ...wound(victim, origin, ray, nearest, damage, entry, undefined, ignore ? origin : undefined, calibre), stopped: true } : { ...EMPTY_SHOT, stopped: true };
  }
  function releaseSeat(id: string, switching = false) {
    const mounted = seatOf(vehicles, id);
    if (mounted) {
      mounted.vehicle.occupants[mounted.seat] = null;
      if (vehicleOptions?.openWorld && mounted.seat === 0 && !switching) lifeOf(mounted.vehicle).unload = true;
    }
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
    const entry = members.get(id); if (!entry?.actor.alive || !entry.playing || finished || entry.actor.bot && !vehicleOptions?.openWorld) return false;
    const mounted = seatOf(vehicles, id);
    if (action === 'exit' && mounted) {
      if (vehicleOptions?.openWorld && mounted.seat === 0) return unloadVehicle(mounted.vehicle);
      const others = vehicles.filter(v => v !== mounted.vehicle && v.y < 2).map(vehicleBounds);
      const exit = vehicleExit(mounted.vehicle, [...obstacles, ...others], bounds, exitFloor); if (!exit) return false;
      releaseSeat(id); Object.assign(entry.actor, exit, { y: exit.y + 1.75 }); entry.movementBudget = 0; entry.vehicleBoardAfter = elapsed + WORLD_VEHICLES.boardCooldown; return true;
    }
    if (action === 'switch' && mounted) {
      for (let n = 1; n < 4; n++) { const seat = (mounted.seat + n) % 4; if (mounted.vehicle.occupants[seat] === null && !(entry.actor.bot && mounted.vehicle.kind === 'helicopter' && seat === 0)) {
        releaseSeat(id, true); mounted.vehicle.occupants[seat] = id; syncOccupants(); return true;
      } }
      return false;
    }
    if (action !== 'enter' || mounted) return false;
    const v = vehicles.find(v => v.kind === kind);
    if (!v || v.health <= 0 || v.y > .4 || Math.abs(v.speed) > 2 || Math.hypot(entry.actor.x - v.x, entry.actor.z - v.z) > (v.kind === 'car' ? 4.5 : 6) || entry.actor.y > 3) return false;
    const center = { x: v.x, y: v.y + 1.3, z: v.z }, d = distance(entry.actor, center);
    const ray = { x: (center.x - entry.actor.x) / d, y: (center.y - entry.actor.y) / d, z: (center.z - entry.actor.z) / d };
    if (d > .1 && worldWallDistance(entry.actor, ray, d) < d - .2) return false;
    // Nobody boards the opposing side's hull, or one whose crew is unloading.
    if (vehicleOptions?.openWorld && (lifeOf(v).unload || v.occupants.some(occupant => occupant && getArenaFaction(entry.actor.faction)?.side !== getArenaFaction(members.get(occupant)!.actor.faction)?.side))) return false;
    const seat = v.occupants.indexOf(null); if (seat < 0 || entry.actor.bot && v.kind === 'helicopter' && seat === 0) return false;
    v.occupants[seat] = id; stopReload(entry, entry.actor.weapon);
    entry.heal = undefined; delete entry.actor.healing; entry.navigation = undefined;
    if (seat === 0) {
      const life = lifeOf(v); life.wait = elapsed + WORLD_VEHICLES.waitForCrew;
      life.assembleUntil = elapsed + WORLD_VEHICLES.assembleSeconds; life.departed = false;
      life.crew = entry.actor.bot ? crewCandidates(entry, v).slice(0, 3).map(m => m.actor.id) : [];
    }
    syncOccupants(); return true;
  }
  const exitFloor = (x: number, z: number) => traversal ? traversal.supportHeight(x, z, MAX_STEP_HEIGHT, .38, 1.8) : 0;
  /** Plan every exit before freeing a seat: never stack a squad or put it inside cover. */
  function unloadVehicle(v: SharedVehicle) {
    const solids = [...obstacles, ...vehicles.filter(other => other !== v && other.y < 2).map(vehicleBounds)];
    const crew = v.occupants.filter((id): id is string => !!id);
    for (const member of members.values()) if (member.actor.alive && !crew.includes(member.actor.id) && member.actor.y < 3) {
      solids.push({ minX: member.actor.x - .4, maxX: member.actor.x + .4, minZ: member.actor.z - .4, maxZ: member.actor.z + .4 });
    }
    const exits: { id: string; point: { x: number; y: number; z: number } }[] = [];
    for (const id of crew) {
      const point = vehicleExit(v, solids, bounds, exitFloor); if (!point) return false;
      exits.push({ id, point }); solids.push({ minX: point.x - .45, maxX: point.x + .45, minZ: point.z - .45, maxZ: point.z + .45 });
    }
    for (const { id, point } of exits) {
      releaseSeat(id); const entry = members.get(id)!;
      Object.assign(entry.actor, point, { y: point.y + 1.75, prone: false });
      entry.movementBudget = 0; entry.vehicleBoardAfter = elapsed + WORLD_VEHICLES.boardCooldown;
      entry.navigation = undefined; entry.velocityY = 0;
    }
    v.speed = v.climb = 0; lifeOf(v).unload = false; return true;
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
    return worldWallDistance(from, dir, length) >= length - .1;
  }
  type BlastItem = { hull: SharedVehicle } | { member: InternalActor };
  function blast(point: ArenaPoint, spec: Parameters<typeof resolveBlast>[1], attacker?: InternalActor, cause?: string, source?: SharedVehicle, grenade = false, shred = 0) {
    warm(point, 3);
    const targets: BlastTarget<BlastItem>[] = [];
    // Hulls first, so a chain of wrecks resolves before the crews and bystanders, as it always has.
    for (const other of vehicles) if (other !== source && other.health > 0 && (!grenade || !attacker || !other.occupants.some(id => id && id !== attacker.actor.id && members.has(id) && !hostile(attacker.actor, members.get(id)!.actor)))) targets.push({ item: { hull: other }, point: { x: other.x, y: other.y + 1.3, z: other.z }, vehicle: true });
    for (const member of members.values()) if (member.actor.alive && !seatOf(vehicles, member.actor.id)) {
      if (grenade && attacker && member !== attacker && !hostile(attacker.actor, member.actor)) continue;
      const { actor } = member, low = actor.y - floorAt(actor) < 1.4;
      // Wrecks have always measured to the eye; stance-aware blasts measure to the body.
      targets.push({ item: { member }, stance: actor.prone ? 'prone' : low ? 'crouch' : 'stand',
        point: !spec.stance ? { x: actor.x, y: actor.y, z: actor.z } : { x: actor.x, y: actor.prone ? actor.y - PRONE_EYE_HEIGHT + .35 : actor.y - (low ? .45 : .62), z: actor.z } });
    }
    for (const hit of resolveBlast(point, spec, targets, clearBlast)) {
      if ('hull' in hit.item) { if (hit.item.hull.health > 0) damageHull(hit.item.hull, hit.damage, attacker, cause); }
      else if (hit.item.member.actor.alive) {
        hurtActor(hit.item.member, spec.overhead && roofed(hit.item.member.actor) ? hit.damage * OVERHEAD_SHELTER : hit.damage, attacker, cause, point, true, false, undefined, shred);
      }
    }
  }
  /** Whether something solid is overhead: a roof, a deck, a viaduct. */
  function roofed(actor: ArenaPoint) {
    const origin = { x: actor.x, y: actor.y + .2, z: actor.z };
    return worldWallDistance(origin, UP, 40) < 40;
  }
  /**
   * Running combat events and the director that starts them. Rounds resolve
   * here, on the authority, at the time their descriptor says they land.
   */
  function grenadeTrace(from: ArenaPoint, to: ArenaPoint) {
    const meshHit = grenadeCoverTrace?.(from, to); if (meshHit) return meshHit;
    const d = distance(from, to); if (d < 1e-8) return null;
    const ray = { x: (to.x - from.x) / d, y: (to.y - from.y) / d, z: (to.z - from.z) / d };
    const ground = traversal?.supportHeight(to.x, to.z, from.y + .05, .05, .05) ?? 0;
    let hit = worldWallDistance(from, ray, d);
    let floor = false;
    if (ray.y < 0 && to.y <= ground + .08) { const t = Math.max(0, (ground + .08 - from.y) / ray.y); if (t <= hit) { hit = t; floor = true; } }
    if (hit >= d && !floor) return null;
    const normal = floor ? { x: 0, y: 1, z: 0 } : Math.abs(ray.y) > Math.max(Math.abs(ray.x), Math.abs(ray.z)) ? { x: 0, y: -Math.sign(ray.y), z: 0 } : Math.abs(ray.x) > Math.abs(ray.z) ? { x: -Math.sign(ray.x), y: 0, z: 0 } : { x: 0, y: 0, z: -Math.sign(ray.z) };
    return { point: { x: from.x + ray.x * hit, y: from.y + ray.y * hit, z: from.z + ray.z * hit }, normal };
  }
  function grenadeBurst(b: GrenadeBurst) {
    const attacker = members.get(b.cause.caller);
    if (b.blast && (b.id === 'grenade-red-smoke' || b.id === 'grenade-oranges')) b = { ...b, point: landing({ type: 'munition', id: 0, impact: b.point, time: 0, flight: 1, descent: { x: 0, y: -1, z: 0 }, blast: b.blast }) };
    if (b.blast) blast(b.point, b.blast, attacker, itemById(b.id)?.name, undefined, true, b.shred);
    for (const entry of members.values()) {
      const a = entry.actor;
      if (b.id === 'grenade-whistle' && entry === attacker) continue;
      if (!a.alive || !attacker || entry !== attacker && !hostile(attacker.actor, a)) continue;
      if (distance(b.point, a) > (b.radius ?? b.blast?.radius ?? 0) || !clearBlast(b.point, chestOf(a), distance(b.point, chestOf(a)))) continue;
      const away = b.facing && (-Math.sin(a.yaw) * (b.point.x - a.x) - Math.cos(a.yaw) * (b.point.z - a.z)) < 0;
      applyGrenadeConditions(a.conditions ??= {}, b.conditions.map(e => ({ ...e, seconds: e.seconds * (away ? .5 : 1) })), !a.bot);
    }
  }
  const grenadeSystem = createGrenadeSystem(grenadeTrace, grenadeBurst);
  function stepGrenades(dt: number) {
    for (const m of members.values()) { if (m.actor.conditions) advanceGrenadeConditions(m.actor.conditions, dt); delete m.actor.markedBy; }
    grenadeSystem.step(dt);
    for (const { event, effect, point } of grenadeSystem.areas()) {
      const attacker = members.get(event.caller); if (!attacker || !('radius' in effect)) continue;
      for (const m of members.values()) {
        const a = m.actor; if (!a.alive || Math.hypot(a.x - point.x, a.z - point.z) > effect.radius || Math.abs(a.y - point.y) > (effect.kind === 'cloud' && effect.overhead ? 100 : 6)) continue;
        const enemy = m === attacker || hostile(attacker.actor, a);
        if (effect.kind === 'cloud' && enemy && effect.dps > 0) hurtActor(m, effect.dps * dt * (effect.overhead && roofed(a) ? .2 : 1), attacker, itemById(event.id)?.name, point, false, true);
        if (effect.kind === 'condition' && enemy) applyGrenadeConditions(a.conditions ??= {}, [{ kind: effect.condition, strength: effect.strength, seconds: effect.seconds }], !a.bot);
        if (effect.kind === 'reveal' && m !== attacker && hostile(attacker.actor, a)) a.markedBy = [...new Set([...(a.markedBy ?? []), attacker.actor.id])].slice(0, 8);
        if (effect.kind === 'rally' && (m === attacker || !hostile(attacker.actor, a)) && (!effect.sky || !roofed(a))) { applyFoodEffects(m.meals ??= {}, effect.effects); publishMeals(m); }
      }
    }
  }
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
    return worldWallDistance(from, ray, length) >= length - .5 && !smokeBetween(from, to);
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
    const entry = addMember(`${d.id}-${roleId}-${index}`, name, role.armor, role.absorption, weapons, false, undefined, role); if (!entry) return;
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
    for (const area of grenadeSystem.areas()) {
      const e = area.effect; if (e.kind !== 'cloud' || e.blocksSight === false) continue;
      const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
      const t = length ? clamp(((area.point.x - a.x) * dx + (area.point.z - a.z) * dz) / length, 0, 1) : 0;
      const y = a.y + (b.y - a.y) * t;
      if (y >= area.point.y - .5 && y < area.point.y + 6 && Math.hypot(a.x + dx * t - area.point.x, a.z + dz * t - area.point.z) < e.radius) return true;
    }
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
  /** A raider's round: nobody's, so it hits whoever it meets, credited to `cause`. */
  function raiderShot(origin: ArenaPoint, ray: ArenaPoint, damage: number, cause: string) {
    // Its strikes look like a GPMG's: its damage is set low for balance, not because it is a small gun.
    send({ origin, direction: ray, ballistics: muzzleBallistics(RAID.muzzle), damage, cause, calibre: RAID.caliberMm, power: RAID.look }, 150);
  }
  /** One stretch of a shooterless round's flight, including rendered cover. */
  function strayShot(origin: ArenaPoint, ray: ArenaPoint, reach: number, damage: number, cause: string, calibre?: number): ArenaShot & { stopped: boolean } {
    let nearest = Math.min(reach, worldWallDistance(origin, ray, reach));
    const wallStops = nearest < reach;
    let hull: SharedVehicle | undefined, victim: InternalActor | undefined;
    for (const v of vehicles) { const d = vehicleRayDistance(v, origin, ray); if (d < nearest) { nearest = d; hull = v; } }
    for (const member of members.values()) {
      if (!member.actor.alive || seatOf(vehicles, member.actor.id)) continue;
      const d = bodyDistance(origin, ray, member.actor); if (d < nearest) { nearest = d; victim = member; hull = undefined; }
    }
    if ((hull || victim) && !(damage > 0)) return { ...EMPTY_SHOT, stopped: true };
    if (hull) { damageHull(hull, damage, undefined, cause); return { ...EMPTY_SHOT, stopped: true }; }
    if (victim) return { ...wound(victim, origin, ray, nearest, damage, undefined, cause, origin, calibre), stopped: true };
    return { ...EMPTY_SHOT, stopped: wallStops };
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
      // The walk-in rounds are real tracers but harmless: they warn, the burst after them kills.
      const line = { x: r.aim.x - gun.x, y: r.aim.y - gun.y, z: r.aim.z - gun.z }, length = Math.hypot(line.x, line.y, line.z) || 1, spread = RAID.spread;
      const ray = { x: line.x / length + (random() - .5) * spread, y: line.y / length + (random() - .5) * spread, z: line.z / length + (random() - .5) * spread }, norm = Math.hypot(ray.x, ray.y, ray.z);
      raiderShot(gun, { x: ray.x / norm, y: ray.y / norm, z: ray.z / norm }, t < RAID.walkIn ? 0 : RAID.round, event.name);
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
    const struck = worldWallDistance(r, ray, step + .5);
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
    reportIn(member, slot, event.troops ?? 1);
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
    return worldWallDistance(origin, up, 70) >= 69;
  }
  /** Which way out of the nearest live danger area, or null when standing clear of all of them. A supply drop's ring is no danger. */
  function dangerExit(actor: ArenaPoint) {
    for (const danger of grenadeSystem.dangers()) {
      const dx = actor.x - danger.point.x, dz = actor.z - danger.point.z, d = Math.hypot(dx, dz);
      if (d < danger.radius + 1 && Math.abs(actor.y - danger.point.y) < 8) return d > .01 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 };
    }
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
  function vehicleEnemy(entry: InternalActor, v: SharedVehicle) {
    const from = { x: v.x, y: v.y + 2.55, z: v.z };
    return [...members.values()].filter(m => m.actor.alive && hostile(entry.actor, m.actor) && distance(from, m.actor) < WORLD_VEHICLES.combatRange &&
      clearBlast(from, chestOf(m.actor), distance(from, chestOf(m.actor))) && !smokeBetween(from, m.actor))
      .sort((a, b) => distance(from, a.actor) - distance(from, b.actor))[0];
  }
  function crewCandidates(driver: InternalActor, v: SharedVehicle) {
    return [...members.values()].filter(m => m !== driver && m.actor.bot && m.actor.alive && m.actor.faction === driver.actor.faction &&
      !m.anchor && !m.temporary && !m.heal && !(m.order && m.order.until > elapsed) && !seatOf(vehicles, m.actor.id) &&
      m.actor.y < 2.1 && m.actor.health >= m.healthMax * .5 && elapsed >= (m.vehicleBoardAfter ?? 0) &&
      distance(m.actor, v) <= WORLD_VEHICLES.crewRange && !dangerExit(m.actor))
      .sort((a, b) => distance(a.actor, v) - distance(b.actor, v));
  }
  function tryBoardVehicle(entry: InternalActor, visible: boolean, dt: number) {
    if (!vehicleOptions?.openWorld || visible || (entry.order && entry.order.until > elapsed) || entry.anchor || entry.temporary || entry.heal || entry.actor.y > 2 ||
      elapsed < (entry.vehicleBoardAfter ?? 0) || dangerExit(entry.actor) || entry.actor.health < entry.healthMax * .5) return false;
    const v = vehicles.filter(v => v.health > VEHICLE_COMBAT[v.kind].health * .35 && v.ammo > 0 && v.y < .3 && Math.abs(v.speed) < 1 &&
      !lifeOf(v).unload && v.occupants.includes(null) && (v.kind === 'car' || !!v.occupants[0]) &&
      v.occupants.every(id => !id || members.get(id)?.actor.faction === entry.actor.faction) &&
      // Leave an unattended motor pool for a player who is already approaching it.
      (v.occupants[0] || ![...members.values()].some(m => !m.actor.bot && m.actor.alive && distance(m.actor, v) < 12)))
      .sort((a, b) => distance(entry.actor, a) - distance(entry.actor, b))
      .find(v => {
        const driver = v.occupants[0] ? members.get(v.occupants[0]) : undefined;
        const recruited = driver?.actor.bot && !lifeOf(v).departed && lifeOf(v).crew.includes(entry.actor.id);
        return distance(entry.actor, v) < (recruited ? WORLD_VEHICLES.crewRange : WORLD_VEHICLES.boardRange) && !vehicleEnemy(entry, v);
      });
    if (!v) return false;
    if (vehicleAction(entry.actor.id, 'enter', v.kind)) return true;
    // Walk to the hull's side using the same street collision as infantry.
    const d = Math.hypot(v.x - entry.actor.x, v.z - entry.actor.z), stride = Math.min(d, entry.role!.speed * dt);
    const dx = (v.x - entry.actor.x) / Math.max(.01, d) * stride, dz = (v.z - entry.actor.z) / Math.max(.01, d) * stride;
    const solids = vehicles.filter(other => other.y < 2).map(vehicleBounds);
    if (traversal) {
      const next = traversal.move({ x: entry.actor.x, y: Math.max(0, entry.actor.y - 1.75), z: entry.actor.z, velocityY: entry.velocityY ?? 0 }, dx, dz, dt, .4, 1.8, solids);
      Object.assign(entry.actor, { x: next.x, y: next.y + 1.75, z: next.z }); entry.velocityY = next.velocityY;
    } else Object.assign(entry.actor, move(entry.actor, dx, dz, .4, [...groundObstacles, ...solids]));
    entry.actor.yaw = Math.atan2(-dx, -dz); return true;
  }
  function stepVehicleBrains(dt: number) {
    for (const v of vehicles) {
      const life = lifeOf(v), occupied = v.occupants.some(Boolean);
      life.idle = occupied ? 0 : life.idle + dt;
      life.wreck = v.health <= 0 ? life.wreck + dt : 0;
      const spawn = vehicleOptions!.spawns[v.kind];
      const replace = v.health <= 0 ? life.wreck >= WORLD_VEHICLES.wreckSeconds : life.idle >= WORLD_VEHICLES.abandonedSeconds && Math.hypot(v.x - spawn.x, v.z - spawn.z) > 12;
      const near = [...members.values()].some(m => m.actor.alive && (distance(m.actor, { ...spawn, y: 1.75 }) < (m.actor.bot ? 8 : WORLD_VEHICLES.protectDistance) ||
        distance(m.actor, v) < (m.actor.bot ? 8 : v.health <= 0 ? WORLD_VEHICLES.protectDistance : WORLD_VEHICLES.reclaimDistance)));
      if (!occupied && replace && !near && clearVehicleSpawn(v.kind, spawn, vehicleGround, vehicleOptions!.flightObstacles ?? [], bounds,
        vehicles.filter(other => other !== v && other.y < 6).map(vehicleBounds))) {
        Object.assign(v, createSharedVehicle(v.kind, spawn)); vehicleLife.delete(v.kind); continue;
      }
      if (v.health <= 0) continue;
      // Route and visibility queries need a few decisions per second, not one per render frame.
      life.think -= dt; if (life.think > 0) continue;
      life.think = .15; const thinkDt = elapsed - life.lastThink; life.lastThink = elapsed;
      const driver = v.occupants[0] ? members.get(v.occupants[0]) : undefined;
      const enemy = driver?.actor.bot ? vehicleEnemy(driver, v) : undefined;
      if (driver?.actor.bot && (enemy || v.health < VEHICLE_COMBAT[v.kind].health * .3 || dangerExit(driver.actor) || life.stuck > WORLD_VEHICLES.stuckSeconds)) life.unload = true;
      const neutral: VehicleControls = { forward: 0, steer: 0, lift: 0, brake: true, boost: false, fire: false };
      const hold = (id: string, input: VehicleControls) => controls.set(id, { input, expires: elapsed + .35 });
      if (life.unload) {
        // A missing helicopter pilot brings the craft down before the remaining crew exits.
        if (driver) hold(driver.actor.id, neutral);
        if (Math.abs(v.speed) <= 2 && v.y < .3 && Math.abs(v.climb) <= .5) unloadVehicle(v);
        continue;
      }
      if (driver?.actor.bot) {
        // A patrol needs its gunner. Rally the existing squad instead of adding
        // bots to the district or driving away while they are still approaching.
        if (life.departed && !v.occupants[1]) {
          life.departed = false; life.assembleUntil = elapsed + WORLD_VEHICLES.assembleSeconds;
          life.crew = crewCandidates(driver, v).slice(0, 3).map(m => m.actor.id);
        }
        const outstanding = life.crew.some(id => {
          const ally = members.get(id);
          return ally?.actor.alive && !seatOf(vehicles, id) && elapsed >= (ally.vehicleBoardAfter ?? 0) &&
            !(ally.order && ally.order.until > elapsed) && distance(ally.actor, v) <= WORLD_VEHICLES.crewRange;
        });
        const assembling = !life.departed && elapsed < life.assembleUntil && (!v.occupants[1] || outstanding);
        if (!v.occupants[1] && elapsed >= life.assembleUntil) {
          life.unload = true; hold(driver.actor.id, neutral); unloadVehicle(v); continue;
        }
        if (assembling || elapsed < life.wait) { hold(driver.actor.id, neutral); continue; }
        life.departed = true;
        const ground = [...vehicleGround, ...vehicles.filter(other => other !== v && other.y < 2).map(vehicleBounds)];
        const clearRoute = (goal: VehicleSpawn) => {
          const d = Math.hypot(goal.x - v.x, goal.z - v.z), yaw = Math.atan2(v.x - goal.x, v.z - goal.z);
          for (let n = 0; n <= d; n += 2) {
            const hull = vehicleBounds({ ...v, x: v.x + (goal.x - v.x) * n / Math.max(d, 1), z: v.z + (goal.z - v.z) * n / Math.max(d, 1), yaw });
            if (hull.minX < bounds.minX || hull.maxX > bounds.maxX || hull.minZ < bounds.minZ || hull.maxZ > bounds.maxZ || ground.some(o => hull.maxX > o.minX && hull.minX < o.maxX && hull.maxZ > o.minZ && hull.minZ < o.maxZ && (!o.footprint || overlapsObstacleRect(o,(hull.minX+hull.maxX)/2,(hull.minZ+hull.maxZ)/2,(hull.maxX-hull.minX)/2,(hull.maxZ-hull.minZ)/2)))) return false;
          }
          return true;
        };
        if (!life.goal || Math.hypot(life.goal.x - v.x, life.goal.z - v.z) < 5 || !clearRoute(life.goal)) {
          life.goal = undefined;
          for (const turn of [0, -.4, .4, -.8, .8, -1.2, 1.2]) {
            const yaw = v.yaw + turn, goal = { x: v.x - Math.sin(yaw) * 24, z: v.z - Math.cos(yaw) * 24, yaw };
            if (clearRoute(goal)) { life.goal = goal; break; }
          }
        }
        const goal = life.goal;
        const heading = goal ? Math.atan2(v.x - goal.x, v.z - goal.z) : v.yaw;
        const error = Math.atan2(Math.sin(heading - v.yaw), Math.cos(heading - v.yaw));
        const waiting = !goal;
        hold(driver.actor.id, { ...neutral, forward: waiting ? 0 : Math.abs(v.speed) < 7 ? 1 : 0, steer: clamp(-error * 2, -1, 1), brake: waiting || Math.abs(v.speed) > 8 });
        if ((!waiting && Math.abs(v.speed) < .5) || !goal) life.stuck += thinkDt; else life.stuck = 0;
      }
      for (const id of v.occupants.slice(2)) {
        const passenger = id ? members.get(id) : undefined;
        if (!passenger?.actor.bot) continue;
        const target = vehicleEnemy(passenger, v);
        if (!target) continue;
        const from = passenger.actor, to = chestOf(target.actor), length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
        passenger.actor.yaw = Math.atan2(from.x - to.x, from.z - to.z);
        passenger.actor.pitch = Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z));
        shoot(from.id, from, { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length }, from.weapon);
      }
      const gunner = gunnerId(v), gunnerEntry = gunner ? members.get(gunner) : undefined;
      if (gunner && gunnerEntry?.actor.bot) {
        const target = vehicleEnemy(gunnerEntry, v);
        // AI gunfire uses the mounted gun and finite hull ammunition, never the infantry weapon.
        const previous = controls.get(gunner)?.input ?? neutral;
        hold(gunner, { ...previous, fire: !!target, ...(target ? { aim: chestOf(target.actor) } : {}) });
      }
    }
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
        : flyVehicle(v, drive?.forward ?? 0, drive?.steer ?? 0, drive?.lift ?? (vehicleOptions?.openWorld && lifeOf(v).unload && v.y > .13 ? -1 : 0), drive?.boost ?? false, dt, flight, bounds);
      Object.assign(v, result.state);
      if (result.blocked) damageHull(v, vehicleCollisionDamage(speed));
      const gunner = gunnerId(v), gun = held(gunner);
      const ray = vehicleGunRay(v, gun?.aim);
      if (gun?.fire && gunner && fireVehicleWeapon(v)) {
        const entry = members.get(gunner); if (!entry) continue;
        v.shots++; entry.actor.shots++;
        send({ shooter: entry, origin: ray.origin, direction: ray.direction, ballistics: VEHICLE_COMBAT[v.kind].ballistics, damage: VEHICLE_COMBAT[v.kind].damage, vehicle: v.kind,
          calibre: VEHICLE_COMBAT[v.kind].caliberMm, power: VEHICLE_COMBAT[v.kind].damage }, VEHICLE_COMBAT[v.kind].range);
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
    if (!cover) return worldWallDistance(entry.actor, ray) >= length - .5;
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
    const conditions = arenaConditionModifiers(actor.conditions);
    if (conditions.frozen) { entry.target = ''; entry.burst = 0; return; }
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
    const enemy = focusTarget(entry) ?? enemies.sort((a, b) => distance(actor, a.actor) * (a.actor.bot ? 1.1 : 1) - distance(actor, b.actor) * (b.actor.bot ? 1.1 : 1))[0];
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
    // A target whose inserts smell is seen from further off, and through smoke.
    const visible = !conditions.dazed && !!enemy && length < sightRangeAgainst(role.sightRange, enemy.insert) && clearSight(entry, enemy.actor.id, ray, length, dt) && !(smokeHides(enemy.insert) && smokeBetween(actor, target));
    if (visible) entry.lastContact = { x: target.x, y: target.y, z: target.z, time: elapsed };
    const contact = entry.lastContact;
    if (!visible && contact && elapsed - contact.time < 6 && horizontal <= 25 && actor.grenade && grenadeSystem.live.filter(g => members.get(g.caller)?.actor.bot).length < 3 && elapsed - (entry.lastGrenadeAt ?? -Infinity) >= 20) {
      const dx = contact.x - actor.x, dz = contact.z - actor.z, d = Math.hypot(dx, dz), speed = itemById(actor.grenade)!.grenade!.throwSpeed;
      if (d >= 5 && d <= 25) { const angle = Math.asin(Math.min(.95, 9.8 * d / (speed * speed))) / 2;
        throwGrenade(actor.id, { id: actor.grenade, origin: actor, direction: { x: dx / d * Math.cos(angle), y: Math.sin(angle), z: dz / d * Math.cos(angle) }, under: false, cooked: 0 }); }
    }
    if (tryBoardVehicle(entry, visible, dt)) return;
    if (role.id === 'overwatch') { if (visible) actor.aiming = true; else delete actor.aiming; }
    if (visible) { if (elapsed - (entry.lastFight ?? -Infinity) > 6) bark(entry, 'contact'); entry.lastFight = elapsed; }
    const intent = role.think({ distance: horizontal, visible, healthFraction: actor.health / entry.healthMax, strafeDirection: entry.strafe });
    let approach = Number.isFinite(intent.approach) ? clamp(intent.approach, -1, 1) : 0;
    const wounded = botWantsHeal({ health: actor.health, healthMax: entry.healthMax, medkits: entry.medkits, sinceHurt: elapsed - entry.lastHurt, visible, danger: !!dangerExit(actor) });
    if (wounded === 'heal') {
      const feet = Math.max(0, actor.y - 1.75);
      entry.heal = { time: 0, feet, started: elapsed }; actor.healing = 0; actor.y = feet + BOT_HEAL.kneelEye; entry.burst = 0; entry.target = '';
      bark(entry, 'healing');
      return;
    }
    // Wounded with someone in view: back away to break the line before patching up.
    if (wounded === 'retreat' && visible) { approach = -1; bark(entry, 'retreat'); }
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
    const crate = !visible && !entry.temporary && !entry.order ? lureFor(actor) : null;
    if (crate) {
      const cx = crate.x - actor.x, cz = crate.z - actor.z, d = Math.hypot(cx, cz), stride = Math.max(0, Math.min(d - 1, role.speed * dt));
      dxStep = d > .01 ? cx / d * stride : 0; dzStep = d > .01 ? cz / d * stride : 0;
    }
    // A player's order steers the feet and leaves the eyes and trigger alone.
    const ordered = orderedStep(entry, role.speed, dt);
    if (ordered) { dxStep = ordered.dx; dzStep = ordered.dz; }
    // Bots run from a marked barrage, still firing if they can see someone. An event's crew holds its post.
    const exit = entry.anchor ? null : dangerExit(actor);
    if (exit) { dxStep = exit.x * role.speed * 1.3 * dt; dzStep = exit.z * role.speed * 1.3 * dt; }
    if (exit && !entry.barkFleeing) bark(entry, 'incoming');
    entry.barkFleeing = !!exit;
    const vehicleSolids = vehicles.filter(v => v.y < 2).map(vehicleBounds);
    if (entry.anchor) Object.assign(actor, { x: entry.anchor.x, z: entry.anchor.z });
    else if (traversal) {
      const step = traversal.move({ x: actor.x, y: Math.max(0, actor.y - 1.75), z: actor.z, velocityY: entry.velocityY ?? 0 }, dxStep, dzStep, dt, .4, 1.8, vehicleSolids);
      Object.assign(actor, { x: step.x, z: step.z, y: step.y + 1.75 }); entry.velocityY = step.velocityY;
    } else Object.assign(actor, move(actor, dxStep, dzStep, .4, [...groundObstacles, ...vehicleSolids]));
    actor.yaw = Math.atan2(-dx, -dz); actor.pitch = Math.atan2(line.y, horizontal);
    const stride = entry.anchor ? 0 : Math.hypot(dxStep, dzStep) / Math.max(1e-6, role.speed * dt);
    // An event's crew may not open fire before the event has been announced; a bot waiting its turn on a player holds fire.
    const reaction = Math.max(.1, role.reaction + (entry.rank?.reaction ?? 0));
    if (!visible || !intent.fire || (entry.temporary && elapsed < entry.temporary.from) || !takeTurn(entry, enemy)) { entry.reaction = reaction; entry.target = ''; entry.burst = 0; return; }
    if (entry.target !== enemy.actor.id) { entry.target = enemy.actor.id; entry.reaction = reaction + random() * 0.3; entry.burst = 0; entry.focusSince = elapsed; }
    entry.reaction -= dt;
    if (entry.reaction <= 0) {
      // Bursts at the weapon's own cycle, then a pause the role decides.
      if (entry.burst <= 0) { const [low, high] = role.burst ?? [1, 1]; entry.burst = low + Math.floor(random() * (high - low + 1)); entry.burstFired = 0; }
      // The role's aim error, steadier with rank, wide on first sight and against a mover; recoil opens it through a burst.
      const base = (Number.isFinite(intent.spread) ? clamp(intent.spread, 0.005, 0.2) : 0.05) * (entry.rank?.aim ?? 1) * botAimScale(elapsed - (entry.focusSince ?? elapsed), enemy.speed ?? 0, stride);
      const spread = entry.spec ? botShotSpread(base, entry.spec, entry.burstFired) : base;
      const aim = leadRay(entry, actor, enemy, { x: line.x + actor.x, y: line.y + actor.y, z: line.z + actor.z });
      shoot(actor.id, actor, { x: aim.x + (random() - 0.5) * spread, y: aim.y + (random() - 0.5) * spread, z: aim.z + (random() - 0.5) * spread }, actor.weapon);
      entry.burst--; entry.burstFired++;
      const pause = (Number.isFinite(intent.shotDelay) ? clamp(intent.shotDelay, 0.1, 5) : 0.5) + random() * 0.15;
      entry.reaction = entry.burst > 0 && entry.spec ? botFireCadence(entry.spec) : Math.max(pause, entry.spec?.interval ?? 0);
    }
  }
  /**
   * Where a bot points to hit `enemy` at `chest` with a travelling round: ahead
   * by its rank's share of the target's travel during the flight, and up by the
   * round's drop over it.
   */
  function leadRay(entry: InternalActor, from: ArenaPoint, enemy: InternalActor, chest: ArenaPoint) {
    const ballistics = entry.spec?.ballistics ?? entry.weapons[entry.actor.weapon]?.ballistics;
    const range = Math.hypot(chest.x - from.x, chest.y - from.y, chest.z - from.z);
    const flight = ballistics && !isInstant(ballistics) ? range / ballistics.velocity : 0, lead = (entry.rank?.lead ?? .6) * flight, velocity = enemy.velocity ?? { x: 0, z: 0 };
    const point = { x: chest.x + velocity.x * lead - from.x, y: chest.y + .5 * (ballistics?.drop ?? 0) * flight * flight - from.y, z: chest.z + velocity.z * lead - from.z };
    const length = Math.hypot(point.x, point.y, point.z) || 1;
    return { x: point.x / length, y: point.y / length, z: point.z / length };
  }
  /** A player's spawn shield as the snapshot carries it: seconds left, while it holds. */
  /** A player's wait for HQ's next transport, as the snapshot carries it. */
  const reinforceOf = (m: InternalActor) => {
    const wait = m.reinforcedAt !== undefined && m.reinforcedAt <= elapsed ? ORDER_TUNING.reinforce.cooldown - (elapsed - m.reinforcedAt) : 0;
    return !m.actor.bot && wait > 0 ? { reinforceIn: Math.ceil(wait) } : {};
  };
  const shieldOf = (m: InternalActor) => !m.actor.bot && m.actor.alive && elapsed < (m.shieldUntil ?? 0) ? { shield: Math.round((m.shieldUntil! - elapsed) * 100) / 100 } : {};
  /**
   * Whether a bot may fire on `enemy`: always on a bot, and on a player only
   * once their spawn shield is down and while it holds one of BOT_AIM.shooters
   * turns. A bot without a turn starts its aim afresh when it gets one.
   */
  function takeTurn(entry: InternalActor, enemy: InternalActor) {
    if (enemy.actor.bot) return true;
    if (elapsed < (enemy.shieldUntil ?? 0)) return false;
    const id = enemy.actor.id, held = entry.turn?.target === id && entry.turn.until > elapsed;
    if (!held && [...members.values()].filter(m => m !== entry && m.actor.alive && m.turn?.target === id && m.turn.until > elapsed).length >= BOT_AIM.shooters) return false;
    entry.turn = { target: id, until: elapsed + BOT_AIM.shooterHold }; return true;
  }
  /** Answers owed to players' callouts, and now and then a quiet soldier near a player passing the time. */
  function stepBarks(dt: number) {
    for (let i = replies.length - 1; i >= 0; i--) {
      if (replies[i].at > elapsed) continue;
      const [reply] = replies.splice(i, 1), entry = members.get(reply.id);
      if (entry) bark(entry, reply.event);
    }
    if ((idleIn -= dt) > 0) return;
    const [low, high] = BARK_TUNING.idleEvery; idleIn = low + barkRandom() * (high - low);
    const humans = [...members.values()].filter(m => !m.actor.bot && m.actor.alive), near = (m: InternalActor) => Math.min(Infinity, ...humans.map(h => distance(h.actor, m.actor)));
    const calm = [...members.values()].filter(m => m.actor.bot && m.actor.alive && !m.reserve && !m.heal && !m.temporary && elapsed - (m.lastFight ?? -Infinity) > BARK_TUNING.calm && near(m) <= BARK_TUNING.idleRange)
      .sort((a, b) => near(a) - near(b))[0];
    if (calm) bark(calm, 'idle');
  }
  /**
   * A player's callout from the wheel, by id. Returns what was said, or null
   * when the id is unknown or the player is speaking too soon. The fallen may
   * speak (that is when most people say "Knn"), but point at nothing. A
   * callout that asks for a reply gets one from the nearest bot that would
   * give it: a friendly for an order, an enemy within earshot for a taunt.
   */
  function callout(id: string, calloutId: string, at?: ArenaPoint) {
    const entry = members.get(id), spoken = getPlayerCallout(calloutId);
    if (!entry || entry.actor.bot || !spoken || elapsed - (entry.lastCallout ?? -Infinity) < CALLOUT_COOLDOWN) return null;
    entry.lastCallout = elapsed;
    const text = spoken.lines[Math.min(spoken.lines.length - 1, Math.floor(barkRandom() * spoken.lines.length))];
    const mark = spoken.ping && entry.actor.alive && at && finitePoint(at) ? { x: clamp(at.x, bounds.minX, bounds.maxX), y: clamp(at.y, 0, 124), z: clamp(at.z, bounds.minZ, bounds.maxZ) } : undefined;
    const outcome = spoken.order ? giveOrder(entry, spoken.order, mark) : undefined;
    const said = say(id, text, 'callout', { callout: spoken.id, ...(mark ? { at: mark } : {}), ...(outcome ? { order: outcome } : {}) });
    if (spoken.reply) {
      const listener = [...members.values()].filter(m => m.actor.bot && m.actor.alive && !m.reserve && hostile(entry.actor, m.actor) && distance(m.actor, entry.actor) <= BARK_RANGE.overheard)
        .sort((a, b) => distance(a.actor, entry.actor) - distance(b.actor, entry.actor))[0];
      if (listener && !replies.some(r => r.id === listener.actor.id)) replies.push({ id: listener.actor.id, event: 'taunted', at: elapsed + .7 + barkRandom() * .6 });
    }
    return said;
  }
  /** Friendly soldiers within order range of a player, nearest first, as many as take one. */
  function alliesOf(caller: InternalActor) {
    return [...members.values()].filter(m => m.actor.bot && m.actor.alive && !m.reserve && !m.temporary && !hostile(caller.actor, m.actor) && distance(m.actor, caller.actor) <= ORDER_TUNING.range)
      .sort((a, b) => distance(a.actor, caller.actor) - distance(b.actor, caller.actor)).slice(0, ORDER_TUNING.most);
  }
  /** The nearest ally who took an order says so, in the words for that order and their rank. */
  function acknowledge(ally: InternalActor | undefined, kind: OrderKind) {
    if (!ally) return;
    const lines = ORDER_ACKS[kind][RANK_IDS[clamp((ally.actor.rank ?? 2) - 1, 0, 2)]];
    say(ally.actor.id, lines[Math.min(lines.length - 1, Math.floor(barkRandom() * lines.length))], 'ack');
  }
  /**
   * Carries out an order from the wheel (squad-orders) and says how it went:
   * how many allies took it and, where something stopped it, why. The fallen
   * give no orders.
   */
  function giveOrder(caller: InternalActor, kind: OrderKind, at?: ArenaPoint): { allies: number; note?: string } {
    if (!caller.actor.alive) return { allies: 0, note: 'You are down. Nobody takes orders from the fallen.' };
    if (kind === 'reinforce') return callReinforcements(caller);
    const allies = alliesOf(caller);
    if (!allies.length) return { allies: 0, note: `No allies within ${ORDER_TUNING.range} m.` };
    if (kind === 'focus') {
      const mark = at ?? caller.actor;
      const target = [...members.values()].filter(m => m.actor.alive && !m.reserve && hostile(caller.actor, m.actor) && Math.hypot(m.actor.x - mark.x, m.actor.z - mark.z) <= ORDER_TUNING.focus.reach)
        .sort((a, b) => Math.hypot(a.actor.x - mark.x, a.actor.z - mark.z) - Math.hypot(b.actor.x - mark.x, b.actor.z - mark.z))[0];
      if (!target) return { allies: 0, note: 'No enemy near where you pointed.' };
      for (const ally of allies) ally.focus = { id: target.actor.id, until: elapsed + ORDER_TUNING.focus.seconds, since: elapsed };
      acknowledge(allies[0], kind);
      return { allies: allies.length, note: `Target: ${target.actor.name}.` };
    }
    allies.forEach((ally, slot) => {
      ally.order = { ...standingOrder(kind, caller.actor.id, elapsed, slot, allies.length, caller.actor, ally.actor, at), since: elapsed };
      // A new order replaces the old, and a hold or a scatter drops a focus target too.
      if (kind === 'hold' || kind === 'scatter') ally.focus = undefined;
    });
    acknowledge(allies[0], kind);
    return { allies: allies.length };
  }
  /**
   * HQ sends a transport with a fresh fireteam to land near the caller, who
   * then gather on them. Only where the district has transports, and at most
   * one per player per cooldown.
   */
  function callReinforcements(caller: InternalActor): { allies: number; note?: string } {
    if (!environment?.reinforcements) return { allies: 0, note: 'HQ: No transports out here. Nobody is coming.' };
    const { cooldown, squad, drop } = ORDER_TUNING.reinforce, last = caller.reinforcedAt;
    // A rematch rewinds the clock; a transport "sent" after now is from the last match.
    if (last !== undefined && last <= elapsed && elapsed - last < cooldown) return { allies: 0, note: `HQ: Negative. Next transport in ${Math.ceil(cooldown - (elapsed - last))} s.` };
    const room = Math.min(squad, MAX_ARENA_BOTS - [...members.values()].filter(m => m.actor.bot).length);
    if (room <= 0) return { allies: 0, note: 'HQ: Negative. Every seat is out already.' };
    const from = { x: caller.actor.x, z: caller.actor.z }, [near] = TRANSPORT_DROP_RANGE;
    const close = validSpawns.filter(p => { const d = Math.hypot(p.x - from.x, p.z - from.z); return d >= near && d <= drop; });
    const view = { humans: [from], bounds, clearRun, openSky };
    const plan = (close.length ? planTransport({ ...view, drops: close }, random) : null) ?? planTransport({ ...view, drops: validSpawns }, random);
    const descriptor = plan && startEvent({ ...plan, seed: Math.floor(random() * 0xffffffff) >>> 0, intensity: 1, troops: room, faction: PLAYER_FACTION });
    if (!descriptor) return { allies: 0, note: 'HQ: Negative. No way in to your position.' };
    const home = factionHeat?.sectorAt(descriptor.target.x, descriptor.target.z)?.id;
    for (let slot = 0; slot < room; slot++) {
      const member = enlist(true, PLAYER_FACTION);
      member.ride = { event: descriptor.id, slot }; member.reportTo = caller.actor.id; if (home) member.home = home;
    }
    caller.reinforcedAt = elapsed;
    const meters = Math.round(Math.hypot(descriptor.target.x - from.x, descriptor.target.z - from.z) / 5) * 5;
    return { allies: room, note: `HQ: ${plan!.kind === 'transport-land' ? 'Truck' : 'Helicopter'} inbound with ${room}, landing ${meters} m out. They will find you.` };
  }
  /** Off the transport: a player's fireteam goes looking for them. */
  function reportIn(member: InternalActor, slot: number, count: number) {
    const caller = member.reportTo ? members.get(member.reportTo) : undefined; member.reportTo = undefined;
    if (!caller?.actor.alive) return;
    member.order = { ...standingOrder('gather', caller.actor.id, elapsed, slot, count, caller.actor, member.actor), until: elapsed + ORDER_TUNING.reinforce.follow, since: elapsed };
    if (slot === 0) acknowledge(member, 'reinforce');
  }
  /** The enemy a player told this bot to go after, while it lives and the order holds. */
  function focusTarget(entry: InternalActor) {
    const focus = entry.focus;
    if (!focus) return undefined;
    const target = members.get(focus.id);
    if (focus.until <= elapsed || focus.since > elapsed || !target?.actor.alive || target.reserve || !hostile(entry.actor, target.actor)) { entry.focus = undefined; return undefined; }
    return target;
  }
  /** This tick's step on a standing order, or null when it has none or is where it should be; a hold stands still. */
  function orderedStep(entry: InternalActor, speed: number, dt: number) {
    const order = entry.order;
    if (!order) return null;
    const caller = members.get(order.by);
    if (order.until <= elapsed || order.since > elapsed || order.kind === 'gather' && !caller?.actor.alive) { entry.order = undefined; return null; }
    const step = orderStep(entry.actor, orderGoal(order, caller?.actor), order.slack, speed * (order.kind === 'scatter' ? ORDER_TUNING.scatter.pace : 1), dt);
    if (step) return step;
    // There: a scatter is done; a hold or a move stands its ground; a gather keeps its own feet near the caller.
    if (order.kind === 'scatter') { entry.order = undefined; return null; }
    return order.kind === 'gather' ? null : { dx: 0, dz: 0 };
  }
  let navigationDeadline = 0;
  function step(dt: number) {
    if (finished || !Number.isFinite(dt) || dt <= 0) return;
    navigationDeadline = performance.now() + NAVIGATION_BUDGET;
    dt = Math.min(dt, 0.25); elapsed = environment?.endless ? elapsed + dt : Math.min(ARENA_DURATION, elapsed + dt); tick++;
    if (vehicleOptions?.openWorld) stepVehicleBrains(dt);
    for (let remaining = dt; remaining > 1e-6; remaining -= Math.min(.05, remaining)) stepVehicles(Math.min(.05, remaining));
    stepRounds(dt);
    factionHeat?.step(dt);
    stepEvents(dt);
    stepGrenades(dt);
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
      const from = entry.lastAt ?? entry.actor, was = entry.velocity ?? { x: 0, z: 0 }, smooth = Math.min(1, dt * 6);
      const vx = clamp((entry.actor.x - from.x) / dt, -12, 12), vz = clamp((entry.actor.z - from.z) / dt, -12, 12);
      entry.velocity = { x: was.x + (vx - was.x) * smooth, z: was.z + (vz - was.z) * smooth }; entry.speed = Math.hypot(entry.velocity.x, entry.velocity.z);
      entry.lastAt = { x: entry.actor.x, z: entry.actor.z };
      if (!entry.actor.bot) stepMeals(entry, dt);
      const food = entry.meals ? arenaFoodModifiers(entry.meals) : NO_FOOD;
      entry.ammo.forEach((state, index) => advanceWeapon(state, index, dt, entry.weapons, { reload: food.reloadRate * arenaConditionModifiers(entry.actor.conditions).reload, cycle: food.cycleRate }));
      if (entry.actor.bot && !seatOf(vehicles, entry.actor.id)) {
        stepBot(entry, dt);
        const reloading = (entry.ammo[entry.actor.weapon]?.reloadRemaining ?? 0) > 0;
        if (reloading && !entry.barkReload) bark(entry, 'reloading');
        entry.barkReload = reloading;
      }
      if (finished) break;
    }
    stepBarks(dt);
    if (!environment?.endless && elapsed >= ARENA_DURATION && !finished) {
      finished = true;
      const leaders = [...members.values()].map(m => m.actor).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      winner = leaders.length > 1 && leaders[0].kills === leaders[1].kills && leaders[0].deaths === leaders[1].deaths ? 'Draw' : leaders[0]?.name ?? 'Draw';
      announce(`${winner === 'Draw' ? 'Draw' : `${winner} wins`} · time limit`);
    }
  }
  function snapshot(): ArenaSnapshot {
    return { type: 'arena-snapshot', tick, elapsed, grenades: grenadeSystem.live.map(g => ({ ...g, position: { ...g.position }, velocity: { ...g.velocity }, landing: { ...g.landing } })), grenadeEvents: grenadeSystem.events.map(e => ({ ...e, point: { ...e.point } })), actors: [...members.values()].filter(m => !m.reserve).map(m => ({ ...m.actor, ...(m.actor.conditions ? { conditions: structuredClone(m.actor.conditions) } : {}), ...shieldOf(m), ...reinforceOf(m) })), feed: feed.map(event => ({ ...event })), finished, winner, ...(vehicleOptions ? { vehicles: vehicles.map(v => ({ ...v, occupants: [...v.occupants], shotEnd: v.shotEnd ? { ...v.shotEnd } : null })) } : {}),
      ...(events.length ? { events: events.map(e => ({ ...e.descriptor, target: { ...e.descriptor.target }, ...(e.descriptor.origin ? { origin: { ...e.descriptor.origin } } : {}) })) } : {}),
      ...(raiders.size ? { raiders: [...raiders.values()].map(({ event, kind, x, y, z, yaw, health, maxHealth, state, aim, shots }) => ({ event, kind, x, y, z, yaw, health, maxHealth, state, aim: aim ? { ...aim } : null, shots })) } : {}),
      impacts: impacts.filter(e => elapsed - e.time <= IMPACT_LIFETIME).map(e => ({ ...e, point: { ...e.point }, direction: { ...e.direction } })),
      ...(factionHeat ? { heat: factionHeat.snapshot() } : {}), ...(flying.length ? { rounds: roundViews() } : {}),
      ...(barks.length ? { barks: barks.map(b => ({ ...b, ...(b.at ? { at: { ...b.at } } : {}) })) } : {}) };
  }
  function reset() {
    grenadeSystem.reset();
    tick = 0; elapsed = 0; finished = false; winner = ''; feed.length = 0; barks.length = 0; replies.length = 0; barker.reset(); idleIn = BARK_TUNING.idleEvery[0]; controls.clear(); vehicleLife.clear(); events.length = 0; raiders.clear(); liveClouds = []; heat.clear(); interests.length = 0; director?.reset();
    flying.length = 0; landed.clear(); impacts.length = 0;
    for (const [id, entry] of members) if (entry.temporary) dismiss(id);
    // Back to the starting garrison: recruits were the reinforcements' doing.
    for (const [id, entry] of members) if (entry.recruit) members.delete(id);
    enlisted = count; factionHeat?.reset(); clock = dispatchClock();
    vehicles = vehicleOptions ? (['car', 'helicopter'] as const).map(kind => createSharedVehicle(kind, vehicleOptions.spawns[kind])) : [];
    for (const entry of members.values()) { entry.actor.kills = 0; entry.actor.deaths = 0; entry.actor.shots = 0; entry.grenadeSupplies = { ...entry.initialGrenades }; entry.lastGrenadeAt = entry.lastMissionAt = undefined; spawn(entry); }
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
    // Each spawn puts their rank's title before this.
    const name = faction === PLAYER_FACTION ? FORCES_NAMES[friendly++ % FORCES_NAMES.length] : CALLSIGNS[i % CALLSIGNS.length];
    // Recruits arrive unannounced: the transport's banner is their entrance.
    if (recruit) addMember(id, name, role.armor, role.absorption, weapons, false, undefined, role); else addPlayer(id, name, role.armor, role.absorption, weapons, undefined, false, undefined, role);
    const entry = members.get(id)!; entry.role = role; entry.healthMax = role.health; entry.callsign = name;
    Object.assign(entry.actor, { bot: true, role: role.id, faction }); spawn(entry);
    if (recruit) { entry.recruit = true; entry.reserve = true; Object.assign(entry.actor, { alive: false, respawnIn: 0 }); entry.waiting = elapsed; }
    return entry;
  }
  for (let i = 0; i < count; i++) enlist();
  return { vehicleAction, addPlayer, removePlayer, setInput, reloadPlayer, shoot, callout, takeHits, inFlight, step, snapshot, reset, setPlayerLoadout, setPlayerVitals, setPlayerSupplies, setPlayerGrenades, throwGrenade, useSupply, setPlayerHealthMultiplier, triggerEvent, setCombatEvents };
}

export type ArenaSimulation = ReturnType<typeof createArena>;
