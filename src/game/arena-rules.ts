import { createVehicleCollisionBuffers } from './vehicle-collision-buffers';
import { refillAmmo } from './ammo-refill';
import { insideLift, liftBodies, liftDeparture, liftSample } from './building-lifts';
import { BOAT_AI, BOAT_BERTHS, BOAT_FOOT_ANCHORS, boatAutopilot, planBoatRoute, type BoatRoute, type BoatPoint } from './dragon-boat-autopilot';
import { createMerlionController, mistBetween, nearMerlion, merlionMouth, MERLION, type MerlionState, type MerlionAction } from './merlion-gameplay';
import { createSwimmingMovement, SWIMMING, swimmingCanFire, swimmingShotDirection } from './swimming';
import { isDragonBoat, canPaddle } from './marina-water';
import { HELICOPTER_AI, chooseAirMission, createHelicopterMission, helicopterMissionControls, planAirRoute, returnHelicopter, updateBoardingReservations, type HelicopterMission } from './helicopter-autopilot';
import { OICW_RIFLE, OICW_LAUNCHER, OICW_GRENADE, withWeaponModes } from './weapon-modes';
import { createProxyOperations, PROXY_IDS, PROXY_RULES, proxyName, type ProxyAction, type ProxyCampaign, type ProxyId, type ProxyOperation, type ProxyParticipant, type ProxyPoint, type ProxySnapshot } from './proxy-operations';
import { PARATROOPERS, dropPoints, planParatroopers } from './paratroopers';
import { NAVAL, navalRampPoint, planNavalLanding, validReinforcementClocks, type ReinforcementClocks } from './naval-landings';
import type { NavalLandingSite } from './naval-landing-sites';
import { AIRCREW, aircrewFacing, aircrewPoint, helicopterCrew, helicopterGunPoint, helicopterGunRay, rifleSeat, type AircrewRole } from './helicopter-crew';
import { TRANSPORT_HULL, TRANSPORT_CRITICAL, TRANSPORT_EXIT_SECONDS, transportDriverPoint, transportPoint, transportRayDistance, type ArenaTransport } from './combat-transports';
import { validRaiderBounty, type RaiderBounty } from './combat-rewards';
import { MAX_CONFIRMED_IMPACTS, IMPACT_LIFETIME, type ConfirmedImpact } from './confirmed-impacts';
import { createGrenadeSystem, validThrowGrenade, type ThrowGrenade, type GrenadeBurst, type LiveGrenade, type GrenadeEvent } from './grenade-system';
import { applyGrenadeConditions, advanceGrenadeConditions, arenaConditionModifiers, type ActiveGrenadeConditions } from './grenade-effects';
import { heldSupplies } from './utility-belt';
import { WORLD_VEHICLES, clearVehicleSpawn } from './world-vehicles';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { createVerticalNavigator, type NavigationPoint } from './vertical-navigation';
import { createVerticalMovement, MAX_STEP_HEIGHT, type VerticalWorld } from './vertical-movement';
import { type RegionBounds, footprintRayInterval, overlapsObstacleRect } from './region-collision';
import { surfaceContains } from './vertical-routes';
import { validVehicleControls, createSharedVehicle, seatOf, seatPoint, gunnerId, vehicleGunRay, vehicleRayDistance, type SharedVehicle, type VehicleControls } from './vehicle-seats';
import { VEHICLE_KINDS, paddleVehicle, vehicleName, vehicleSpeed, stopVehicle, driveVehicle, flyVehicle, stepVehicleWreck, vehicleBounds, vehicleExit, type VehicleSpawns, type VehicleKind, type VehicleSpawn, type FlightObstacle } from './vehicle-rules';
import { BAILOUT_ROLL_SECONDS } from './bailout-roll';
import { damageVehicle, fireVehicleWeapon, vehicleCollisionDamage, vehicleExitDamage, VEHICLE_COMBAT } from './vehicle-combat';
import { applyArmorDamage } from './armory-state';
import { insertTraits, sightRangeAgainst, smokeHides, type InsertTraits } from './armor-inserts';
import { PRONE_EYE_HEIGHT, weaponBraced, unsupportedRecoilDamage } from './fps-stance';
import { MARINA_BOUNDS, moveInMarina, type Obstacle } from './marina-collision';
import { advanceWeapon, beginReload, createLoadout, FPS_WEAPONS, fireWeapon, hitDamage, interruptReload, reloadCommit, reloadProgress, roundReady, type WeaponSpec, type WeaponState } from './fps-rules';
import { armamentFamilies, chooseArmament, getArenaRole, type ArenaRolePlugin } from './arena-roles';
import { fittedVariantSpec } from './armory-state';
import { BOT_AIM, BOT_HEAL, advanceBotAimFocus, botAimScale, botBurstLimit, botFireCadence, botShotSpread, botTransverseSpeed, botWantsHeal, type BotAimFocus } from './arena-bot-combat';
import { DRONE, DRONE_BLAST, MORTAR, OVERWATCH, RAID, SUPPLY } from './combat-event-catalog';
import { combatPhase, combatTimeline, getCombatEvent, orbitPose, transportPose, MAX_COMBAT_EVENTS, MAX_TROOPS, type CloudPayload, type CombatEventDescriptor, type CombatOutcome, type CombatPlane, type CratePayload, type MunitionPayload, type OrbitPayload, type TransportPayload } from './combat-events';
import { createCombatDirector, planTransport, type CombatRisk } from './combat-director';
import { OVERHEAD_SHELTER, resolveBlast, type BlastTarget } from './combat-blast';
import { DEFAULT_BOT_FACTION, getArenaFaction, hostile, isProxyFaction, PLAYER_FACTION, SQUAD_FACTIONS, type SquadFaction } from './arena-factions';
import { BARK_RANGE, BARK_TUNING, createBarkDirector, type BarkEvent } from './npc-barks';
import { CALLOUT_COOLDOWN, getPlayerCallout } from './player-callouts';
import { ORDER_ACKS, ORDER_TUNING, orderGoal, orderStep, standingOrder, type OrderKind, type StandingOrder } from './squad-orders';
import { RANK_IDS } from './npc-barks';
import { TRANSPORT_DROP_RANGE } from './combat-director';
import { ballisticPoint, isInstant, muzzleBallistics, type BallisticSpec } from './fps-ballistics';
import type { PublishedRound } from './fps-projectiles';
import { weaponRange } from './weapon-range';
import { BOT_THREAT, nearBullet, type BotThreat } from './bot-threat';
import type { BotDifficulty } from './bot-difficulty';
import { createBotSpotting, spottingStance, type BotSpotting, type SpottingCandidate } from './bot-spotting';
import { objectiveApproach, objectiveStep, spacedObjectiveStep } from './bot-objectives';
import { assignBattlefieldFronts, BATTLEFIELD_POPULATIONS, type BattlefieldSize } from './battlefield';
import { commandPatrolStops, guardPatrolGoal, type GuardPatrol } from './command-camp';
import { advancePatrolInvestigation, createSectorPatrols, SECTOR_PATROL, type BattlefieldDuty, type PatrolInvestigation, type PatrolSector } from './sector-patrols';
import { createHeatField, HEAT_TUNING, type HeatBand, type HeatSector } from './faction-heat';
import { BOT_RANKS, drawRank, type BotRank } from './arena-ranks';
import { ELITE_SQUAD, eliteRoster, eliteSquadPoints, isEliteEvent, isEliteRole } from './elite-squads';
import { muzzleSignature, sanitizeMuzzle, type MuzzleDevice } from './weapon-accessories';
import { advanceFoodEffects, applyFoodEffects, arenaFoodModifiers, NO_FOOD, survivesWithAhMa, type ActiveFoodEffects } from './food-effects';
import { CONSUMABLE_LIMIT, itemById } from './armory-catalog';
import { supplyProfile } from './fps-healing';
import { createFacilities, facilityActionFor, facilityOperational, facilityRayDistance, FACILITY_RULES, type FacilitySite, type FacilitySnapshot, type FacilityState } from './facilities';
import type { DeploymentPoint } from './expedition-deployment';
import { DEFAULT_RESPAWN_ZONE, type PlayerRespawnView } from './player-respawn';

/** All coordinates use metres; actor y is eye height, not the feet. */
export interface ArenaActor {
  /** Host-carried passenger in an authored building lift. */
  lift?: string;
  /** Match time of a surviving moving bailout, for a synchronized landing roll. */
  bailoutAt?: number;
  proxyTargets?: string[];
  proxyOperation?: string;
  parachuting?: true;
  id: string; name: string; bot: boolean; x: number; y: number; z: number; yaw: number; pitch: number;
  health: number; armor: number; kills: number; deaths: number; alive: boolean; rentalTimeMs?: number; respawnIn: number; weapon: number;
  swimming?: boolean;
  merlionSupply?: { serial: number; family: number };
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
  squad?: string;
  /** Current squad objective, for the tactical snapshot and diagnostics. */
  objective?: string;
  duty?: BattlefieldDuty;
  patrolSector?: string;
  /** An occupant of a scripted transport or raid helicopter, separate from the drivable fleet. */
  transport?: string;
  /** Helicopter pilot or a passenger firing their own rifle. */
  aircrew?: AircrewRole;
}
export type ArenaRaiderState = 'landing' | 'landed' | 'inbound' | 'orbit' | 'leaving' | 'cruise' | 'lock' | 'dive' | 'down' | 'wreck' | 'exploded';
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
  /** Finite mounted-gun stock; absent on drones. */
  ammo?: number;
}
export interface ArenaFeed { id: string; text: string; killerId?: string; victimId?: string; bounty?: RaiderBounty }
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
  merlion?: MerlionState;
  proxies?: ProxySnapshot;
  facilities?: FacilitySnapshot;
  grenades?: LiveGrenade[]; grenadeEvents?: GrenadeEvent[];
  type: 'arena-snapshot'; tick: number; elapsed: number; actors: ArenaActor[];
  reinforcementClocks?: ReinforcementClocks;
  feed: ArenaFeed[]; finished: boolean; winner: string; vehicles?: SharedVehicle[];
  /** Combat events still running or lingering; each one's rounds follow from its descriptor. */
  events?: CombatEventDescriptor[];
  /** Raid helicopters and drones in the air, or coming down. */
  raiders?: ArenaRaider[];
  transports?: ArenaTransport[];
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
  waterFire?: boolean;
  /** Eye position relative to the shared car floor; avoids consuming walking budget on lift travel. */
  liftOffset?: number;
}
export type ArenaWeapon = Pick<WeaponSpec, 'damage' | 'interval' | 'capacity' | 'reload' | 'requiresMount' | 'bolt'> & Partial<Pick<WeaponSpec, 'ballistics'>> & { accessories?: { muzzle?: MuzzleDevice }; rentalRemainingMs?: number };
export interface ArenaPoint { x: number; y: number; z: number }
export interface ArenaShot { hitId: string | null; killed: boolean; damage: number }
export interface ArenaVitals { health: number; armor: number }
export interface ArenaEnvironment {
  /** Solo expedition only; shared campaign object retains favor and pacing across travel. */
  proxies?: ProxyCampaign;
  battlefield?: { size: BattlefieldSize };
  bakedNavigation?: import('./navigation-bake').NavigationBake;
  navigationAnchors?: readonly { x: number; z: number }[];
  /** Geographical patrol areas, independent of camp footprints and heat. */
  patrolSectors?: readonly PatrolSector[];
  paratroopers?: boolean;
  /** Built-scene canopy clearance, including foliage; never supplied by guests. */
  dropColumnClear?: (p: CombatPlane, floor: number) => boolean;
  navalSites?: readonly NavalLandingSite[];
  savedReinforcementClocks?: ReinforcementClocks;
  savedMerlion?: MerlionState;
  departedCrew?: readonly string[];
  departedVehicles?: readonly VehicleKind[];
  deployments?: readonly DeploymentPoint[];
  facilities?: { sites: readonly FacilitySite[]; saved?: FacilitySnapshot; savedVehicles?: SharedVehicle[] };
  bounds: RegionBounds;
  move: (position: { x: number; z: number }, dx: number, dz: number, radius: number, obstacles: readonly Obstacle[]) => { x: number; z: number };
  spawns: readonly { x: number; z: number }[];
  endless?: boolean;
  /** Authority-owned accuracy preference, read live; shared matches use Normal. */
  botDifficulty?: () => BotDifficulty;
  playerSpawn?: { x: number; z: number; yaw?: number; pitch?: number };
  /** This side's permanent district entry, independent of gateway arrivals. */
  defaultPlayerSpawn?: { x: number; z: number; yaw?: number; pitch?: number };
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
  spawns: VehicleSpawns; flightObstacles?: readonly FlightObstacle[];
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
export const MAX_ARENA_BOTS = 64;
/** A bot with a home sector only answers contacts this close and otherwise patrols home; a surging side ranges up to twice as far. */
export const HOME_LEASH = 90;
/** Infantry, room players and up to three attached crew for each bounded combat event. */
export const MAX_ARENA_ACTORS = MAX_ARENA_BOTS + 8 + MAX_COMBAT_EVENTS * 3;
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
 * A carried gun's round in flight on the host. Cover, people, vehicles and
 * raiders are tested along each tick's stretch of its arc, so targets can
 * step into it or out of its way, including beyond the damage falloff band.
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
export interface VehicleCrewTransfer {
  vehicle: SharedVehicle;
  playerId: string;
  sourceCrewIds: string[];
  elapsed: number;
  crew: Omit<InternalActor, 'role' | 'navigation' | 'spotting'>[];
}
interface InternalActor {
  swimBudget?:number; lastSwimInput?:number; swimmingUntil?:number;
  vehicleBoardAfter?: number;
  boatIslandUntil?: number; boatGuard?: number;
  evacuating?: { x: number; z: number; until: number };
  velocityY?: number;
  navigation?: { path: NavigationPoint[]; target: NavigationPoint; retry: number; stuck?: number; pending?: Generator<undefined, NavigationPoint[]> };
  equipmentRentals?: Record<string, number>;
  actor: ArenaActor; healthMax: number; armorMax: number; absorption: number; insert: InsertTraits; weapons: ArenaWeapon[]; nextWeapons?: { weapons: ArenaWeapon[]; allowed: number[] }; allowedWeapons: number[]; role?: ArenaRolePlugin;
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
  parachute?: { event: string; since: number; floor: number };
  proxyExit?: ProxyPoint;
  proxyUnseenSince?: number;
  navalTransit?: { site: NavalLandingSite; event: string; since: number };
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
  spotting?: BotSpotting;
  /** Accepted host shots only; clients cannot submit a flash or spotting confidence. */
  shotFlash?: { at: number; flare: number };
  /** Exposure to the same target life, with short-lived aim memory after losing sight. */
  aimFocus?: BotAimFocus;
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
  threat?: BotThreat;
  /** Enlisted by a transport beyond the starting garrison; `reserve` until it first steps off one, and left out of snapshots. */
  recruit?: boolean; reserve?: boolean;
  /** With heat: the sector this bot was dropped into, which it patrols and defends. */
  home?: string;
  mission?: { x: number; z: number; y?: number };
  assignment?: { site: string; via?: ArenaPoint; until: number };
  guardPatrol?: GuardPatrol;
  investigation?: PatrolInvestigation;
  /** Bots: when they last saw an enemy or were hit, which decides whether a sighting is a fresh contact and whether they are calm enough to chat. */
  lastFight?: number;
  /** Bots: reloading, or running from a marked barrage, as of the last tick, so the bark goes with the start of it. */
  barkReload?: boolean; barkFleeing?: boolean;
  /** Personal-weapon passenger burst timing, independent of the mounted gun. */
  airNext?: number; airBurst?: number;
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

export function arenaNavigationAnchors(obstacles: readonly Obstacle[], environment?: ArenaEnvironment, vehicleOptions?: ArenaVehicleOptions) {
  return [...(obstacles.some(o=>o.water)?[...BOAT_FOOT_ANCHORS,...[-2.6,2.6].flatMap(x=>[-15,-9].map(z=>({x,z})))]:[]),...(environment?.navigationAnchors??[]),...(environment?.battlefield && vehicleOptions ? Object.values(vehicleOptions.spawns).flatMap(p=>[-6,6].flatMap(dx=>[-6,6].map(dz=>({x:p.x+dx,z:p.z+dz})))) : [])];
}

/** Host-owned match. Clients may submit movement and aim, never damage or scores. */
export function createArena(obstacles: readonly Obstacle[], botCount: number, composition = 'mixed', environment?: ArenaEnvironment, vehicleOptions?: ArenaVehicleOptions, traversalWorld?: VerticalWorld, coverDistance?: ArenaCoverDistance, grenadeCoverTrace?: import('./grenade-flight').GrenadeTrace, sightDistance?: ArenaCoverDistance, difficulty: () => BotDifficulty = () => environment?.botDifficulty?.() ?? 'normal') {
  // Rendered cover stops every round, with or without vehicles in the match.
  const cover = coverDistance ?? vehicleOptions?.coverDistance;
  const bounds: RegionBounds = environment?.bounds ?? MARINA_BOUNDS;
  const swimmer = traversalWorld?.obstacles.some(o=>o.water) ? createSwimmingMovement(traversalWorld) : null;
  const traversal = traversalWorld ? createVerticalMovement({...traversalWorld,surfaces:traversalWorld.surfaces.filter(s=>!s.lift)}) : null;
  const vehicleGround = [...obstacles, ...(traversalWorld ? verticalVehicleObstacles({...traversalWorld,bounds}) : [])];
  const navigationAnchors = arenaNavigationAnchors(obstacles, environment, vehicleOptions);
  const navigator = traversalWorld && (traversalWorld.surfaces.length || navigationAnchors.length) ? createVerticalNavigator(traversalWorld, navigationAnchors, environment?.bakedNavigation) : null;
  const regularLimit = environment?.battlefield?.size ?? 20;
  let liftGeometryAt=-Infinity,liftGeometry:ReturnType<typeof liftBodies>=[];
  const liveLiftBodies=()=>{if(liftGeometryAt!==elapsed){liftGeometryAt=elapsed;liftGeometry=liftBodies(traversalWorld?.lifts??[],elapsed);}return liftGeometry;};
  const floorAt = (point: ArenaPoint) => traversal?.supportHeight(point.x, point.z, point.y - .5, .35, .6,traversalWorld?.lifts?.some(l=>insideLift(l,point,-.5))?liveLiftBodies():[]) ?? 0;
  const move = environment?.move ?? moveInMarina;
  const coverObstacles = [...obstacles.filter(o=>!o.water), ...(traversalWorld?.traversalObstacles ?? [])];
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
  function merlionTrace(origin:ArenaPoint,ray:ArenaPoint,range:number){
    let end=worldWallDistance(origin,ray,range);
    for(const v of vehicles)if(!v.despawned)end=Math.min(end,vehicleRayDistance(v,origin,ray));
    for(const t of transports.values())if(t.visible)end=Math.min(end,transportRayDistance(t,origin,ray));
    return end;
  }
  const merlion = obstacles.some(o=>o.water) ? createMerlionController(merlionTrace,environment?.savedMerlion) : null;
  const members = new Map<string, InternalActor>();
  // Faction heat (who pushes how hard where), not the activity grid `heat` further down that aims world events.
  const factionHeat = environment?.reinforcements && environment.heat ? createHeatField(environment.heat) : null;
  const isSquad = (faction: string): faction is SquadFaction => (SQUAD_FACTIONS as readonly string[]).includes(faction);
  const inside = (p: { x: number; z: number }, b: HeatSector['bounds']) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
  let vehicles: SharedVehicle[] = environment?.facilities?.savedVehicles ? structuredClone(environment.facilities.savedVehicles) : vehicleOptions ? VEHICLE_KINDS.filter(kind=>vehicleOptions.spawns[kind]).map(kind => createSharedVehicle(kind, vehicleOptions.spawns[kind]!)) : [];
  if (environment?.facilities?.savedVehicles) for (const v of vehicles) { v.occupants = [null, null, null, null]; stopVehicle(v); }
  vehicles = vehicles.filter(v => !environment?.departedVehicles?.includes(v.kind));
  const controls = new Map<string, { input: VehicleControls; expires: number }>();
  let airSortie: { pilot: string; mission: HelicopterMission; created: number; boarded: boolean } | undefined;
  const airDecisionAt = new Map<string, number>();
  interface BoatSortie { pilot:string; route:BoatRoute|null; index:number; boarded:boolean; returning:boolean; started:number; phaseAt:number; phase:'boarding'|'sailing'|'unloading'; progressAt:number; last:{x:number;z:number;yaw:number}; retryAt:number; crew:string[] }
  const boatSorties=new Map<VehicleKind,BoatSortie>(),boatDecisionAt=new Map<VehicleKind,number>();
  let aviationSeed = 173821;
  const aviationRandom = () => { aviationSeed = (Math.imul(aviationSeed, 1664525) + 1013904223) >>> 0; return aviationSeed / 4294967296; };
  const vehicleLife = new Map<VehicleKind, { idle: number; wreck: number; stuck: number; wait: number; unload: boolean; think: number; lastThink: number; crew: string[]; assembleUntil: number; departed: boolean; pickupDriver?: string; pickupStopped: number; goal?: VehicleSpawn }>();
  const lifeOf = (v: SharedVehicle) => {
    let life = vehicleLife.get(v.kind);
    if (!life) { life = { idle: 0, wreck: 0, stuck: 0, wait: 0, unload: false, think: 0, lastThink: elapsed, crew: [], assembleUntil: 0, departed: false, pickupStopped: 0 }; vehicleLife.set(v.kind, life); }
    return life;
  };
  let tick = 0; let elapsed = 0; let finished = false; let winner = ''; let eventId = 0; let seed = 92371, hurtSerial = 0;
  let facilities = environment?.facilities ? createFacilities(environment.facilities.sites, environment.facilities.saved) : null;
  if (facilities && !environment?.facilities?.savedVehicles) for (const v of vehicles) {
    if(isDragonBoat(v.kind)) continue;
    const site = facilities.sites.find(s => s.kind === (v.kind === 'car' ? 'garage' : 'helipad'));
    if (!site || !facilityOperational(site)) v.health = 0;
    else v.faction = site.owner!;
  }
  let proxyAutomatic=true;
  const proxies = environment?.proxies ? createProxyOperations(environment.proxies) : null;
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
    if (!actor.bot || !actor.alive || entry.reserve || isProxyFaction(actor.faction)) return;
    const text = barker.offer(actor.id, { faction: actor.faction, side: getArenaFaction(actor.faction)?.side, role: actor.role, rank: actor.rank }, event, elapsed);
    if (text) say(actor.id, text, event);
  }
  const announce = (text: string, killerId?: string, victimId?: string, bounty?: RaiderBounty) => {
    feed.push({ ...(validRaiderBounty(bounty) ? { bounty } : {}), id: String(++eventId), text, ...(killerId ? { killerId } : {}), ...(victimId ? { victimId } : {}) });
    if (feed.length > 8) feed.shift();
  };
  const groundObstacles = obstacles.filter(o => (o.maxY ?? 200) > 0.15);
  const patrolGround = (x:number,z:number) => {
    const floor=bounds.groundHeight?.(x,z)??0;
    return traversal?.supportHeight(x,z,floor+.35,.4,1.8)??floor;
  };
  const clearSpawn = (p: { x: number; z: number }) => {
    const floor=patrolGround(p.x,p.z);
    return Number.isFinite(p.x) && Number.isFinite(p.z) &&
    p.x - 0.5 >= bounds.minX && p.x + 0.5 <= bounds.maxX && p.z - 0.5 >= bounds.minZ && p.z + 0.5 <= bounds.maxZ &&
    !vehicles.some(v => { if (v.despawned) return false; const b = vehicleBounds(v); return v.y < 2 && p.x + .5 > b.minX && p.x - .5 < b.maxX && p.z + .5 > b.minZ && p.z - .5 < b.maxZ; }) &&
    !groundObstacles.some(o => (o.minY??0)<floor+1.8 && (o.maxY??Infinity)>floor && p.x + 0.5 > o.minX && p.x - 0.5 < o.maxX && p.z + 0.5 > o.minZ && p.z - 0.5 < o.maxZ);
  };
  const clearSitePoint = (p: {x:number;z:number}, site: FacilitySite) => {
    const ground=bounds.groundHeight?.(site.x,site.z)??0;
    if (Math.abs(site.y-ground)<.35) return clearSpawn(p);
    return !!traversal && traversal.canOccupy(p.x,site.y,p.z,.5,1.8) &&
      Math.abs((traversal.supportHeight(p.x,p.z,site.y+.1,.5,1.8)??-100)-site.y)<.1;
  };
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
  const sectorPatrols = environment?.patrolSectors?.length ? createSectorPatrols(environment.patrolSectors,navigationAnchors,p=> {
    const y=patrolGround(p.x,p.z);
    return clearSpawn(p) && (!traversal || traversal.canOccupy(p.x,y,p.z,.4,1.8) && Math.abs((traversal.supportHeight(p.x,p.z,y+.1,.4,1.8)??100)-y)<.1);
  },patrolGround) : undefined;
  const respawnChoices = new Map<string, { selected: string | null; automatic: boolean }>();
  const spawn = (entry: InternalActor, destination?: { x: number; z: number; y: number; yaw: number }) => {
    releaseSeat(entry.actor.id);
    const others = [...members.values()].filter(m => m !== entry && m.actor.alive && !m.reserve && !m.actor.transport);
    const positions = [...validSpawns].sort((a, b) => {
      const safety = (p: { x: number; z: number }) => Math.min(1000, ...others.map(m => Math.hypot(m.actor.x - p.x, m.actor.z - p.z)));
      return safety(b) - safety(a);
    });
    const preferred = entry.usePlayerSpawn && environment?.playerSpawn && clearSpawn(environment.playerSpawn) ? environment.playerSpawn : undefined;
    const post = facilities?.sites.find(s => s.kind === 'command' && facilityOperational(s, entry.actor.faction));
    const postPoints = post ? deploymentPoints(post) : [];
    const factionPoint = postPoints.find(p => clearSpawn(p) && others.every(m => Math.hypot(m.actor.x - p.x, m.actor.z - p.z) > (m.actor.faction === entry.actor.faction ? 1.5 : 16)));
    const p = destination ?? (facilities && !entry.actor.bot && entry.actor.deaths > 0 && factionPoint ? factionPoint : preferred ?? (facilities && entry.actor.bot && factionPoint ? factionPoint : positions[0]));
    if (entry.role) {
      // A fresh soldier off the transport: rank first, since it decides the kit.
      const strength = factionHeat && isSquad(entry.actor.faction) ? factionHeat.strength(entry.actor.faction, entry.home ?? null) : undefined;
      entry.rank = isEliteRole(entry.role.id) ? BOT_RANKS[2] : drawRank(strength, armamentRandom); entry.actor.rank = entry.rank.grade;
      // Armour follows rank and heat: a hot sector's troops come back with heavier plates.
      entry.armorMax = isEliteRole(entry.role.id) ? entry.role.armor : clamp(entry.role.armor * entry.rank.armor * (strength === undefined ? 1 : .75 + .5 * strength), 0, 150);
      if (entry.callsign) entry.actor.name = `${entry.rank.title[getArenaFaction(entry.actor.faction)?.side ?? 'opposition']} ${entry.callsign}`;
    }
    delete entry.actor.bailoutAt;
    Object.assign(entry.actor, { x: p.x, z: p.z }, { y: 1.75 + (destination?.y ?? bounds.groundHeight?.(p.x,p.z) ?? 0), health: entry.healthMax, armor: entry.armorMax, alive: true, prone: false, respawnIn: 0,
      yaw: destination?.yaw ?? (Number.isFinite(preferred?.yaw) ? preferred!.yaw! : 0), pitch: Number.isFinite(preferred?.pitch) ? clamp(preferred!.pitch!, -1.5, 1.5) : 0 });
    if (entry.role && entry.actor.faction === PLAYER_FACTION) {
      // Heavy gunners carry the issued FN MAG; other support troops use the Ultimax.
      entry.actor.weapon = forcesFamily(entry.role); delete entry.actor.variant;
      entry.spec = entry.role.id === 'heavy' ? FPS_WEAPONS[entry.actor.weapon] : undefined;
      if (entry.spec) entry.weapons[entry.actor.weapon] = sanitizeWeapons([entry.spec])[0];
      entry.medkits = (entry.role.medkits ?? 1) + (entry.rank?.medkits ?? 0);
    } else if (entry.role) {
      const issued = chooseArmament(entry.role, armamentRandom, entry.rank?.kit); entry.actor.weapon = issued.family; entry.actor.variant = issued.id;
      // What they carry is what they fire: the variant's damage, falloff, cycle, magazine and reload.
      entry.spec = fittedVariantSpec(issued) ?? undefined;
      if (entry.spec) entry.weapons[issued.family] = sanitizeWeapons([entry.spec])[0];
      entry.medkits = (entry.role.medkits ?? 1) + (entry.rank?.medkits ?? 0);
    }
    const respawnChoice = respawnChoices.get(entry.actor.id);
    if (respawnChoice) respawnChoice.selected = null;
    if (entry.nextWeapons && !entry.actor.bot) {
      entry.weapons = entry.nextWeapons.weapons; entry.allowedWeapons = entry.nextWeapons.allowed;
      entry.actor.weapon = entry.allowedWeapons[0]; entry.nextWeapons = undefined;
    }
    expirePlayerRentals(entry);
    entry.ammo = entry.weapons.map(hostAmmo);
    entry.burst = 0; entry.burstFired = 0; entry.heal = undefined; entry.lastHurt = -Infinity; delete entry.actor.healing; entry.shieldUntil = elapsed + SPAWN_SHIELD_SECONDS;
    // A respawn starts hungry.
    entry.meals = undefined; delete entry.actor.food; delete entry.actor.conditions; delete entry.actor.markedBy;
    entry.grenadeSupplies ??= {}; entry.lastContact = undefined;
    if (entry.actor.bot && entry.actor.faction === 'mercenaries' && ['assault', 'tank'].includes(entry.role?.id ?? '')) { entry.actor.grenade = entry.role?.id === 'tank' ? 'grenade-smoke' : 'grenade-frag'; entry.grenadeSupplies[entry.actor.grenade] = 1; } else delete entry.actor.grenade;
    entry.velocity = undefined; entry.speed = 0; entry.lastAt = undefined; entry.aimFocus = undefined; entry.turn = undefined;
    entry.spotting = undefined; entry.shotFlash = undefined;
    entry.parachute = undefined; delete entry.actor.parachuting; delete entry.actor.lift; entry.navigation = undefined; entry.assignment = undefined; entry.guardPatrol = undefined; entry.investigation = undefined; sectorPatrols?.release(entry.actor.id); entry.mission = undefined; delete entry.actor.objective; delete entry.actor.duty; delete entry.actor.patrolSector; entry.navalTransit = undefined; delete entry.actor.ground; entry.evacuating = undefined; entry.vehicleBoardAfter = undefined; entry.boatIslandUntil=undefined; entry.boatGuard=undefined; entry.velocityY = 0; entry.waiting = undefined; entry.ride = undefined; entry.reserve = false;
    delete entry.actor.swimming;entry.swimBudget=.08;entry.lastSwimInput=undefined;entry.swimmingUntil=undefined;
    entry.movementBudget = 2; entry.reaction = 1; entry.target = ''; entry.wasReloading = false; entry.threat = undefined; entry.grudge = undefined;
  };
  function sanitizeWeapons(weapons: readonly ArenaWeapon[]) {
    return (weapons.length ? weapons : FPS_WEAPONS).slice(0, FPS_WEAPONS.length).map((w: ArenaWeapon, index): ArenaWeapon => ({
      ...(Number.isFinite(w.rentalRemainingMs) && w.rentalRemainingMs! >= 0 ? { rentalRemainingMs: w.rentalRemainingMs } : {}),
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
  /** Initial deployment only: the caller submits an approved id, never coordinates. */
  function setPlayerDeployment(id: string, pointId: string) {
    const entry = members.get(id), point = playerDeployments(id).find(p => p.id === pointId && p.available !== false);
    if (!entry || entry.actor.bot || !entry.actor.alive || entry.actor.deaths !== 0 || elapsed !== 0 || finished || seatOf(vehicles, id) || !point || !clearSpawn(point)) return false;
    if ([...members.values()].some(m => m !== entry && m.actor.alive && Math.hypot(m.actor.x - point.x, m.actor.z - point.z) < (m.actor.faction === entry.actor.faction ? 1.5 : 30))) return false;
    Object.assign(entry.actor, { x: point.x, y: (point.y ?? bounds.groundHeight?.(point.x,point.z) ?? 0)+1.75, z: point.z, yaw: point.yaw, pitch: point.pitch, prone: false });
    entry.lastAt = undefined; entry.velocity = undefined; entry.speed = 0; entry.navigation = undefined; entry.velocityY = 0;
    return true;
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
    if (!entry || merlion?.state.operator===id || entry.actor.swimming || finished || !entry.actor.alive || !entry.playing || seatOf(vehicles, id) || !validThrowGrenade(input) || distance(input.origin, entry.actor) > 1.5) return false;
    if (input.id === OICW_GRENADE) return false;
    if (arenaConditionModifiers(entry.actor.conditions).frozen && input.cooked < itemById(input.id)!.grenade!.fuse) return false;
    if (elapsed - (entry.lastGrenadeAt ?? -Infinity) < .9 || (entry.grenadeSupplies?.[input.id] ?? 0) <= 0) return false;
    if (input.id === 'grenade-red-smoke' && elapsed - (entry.lastMissionAt ?? -Infinity) < 60) return false;
    if (!grenadeSystem.throwGrenade(id, input)) return false;
    entry.grenadeSupplies![input.id]--; entry.lastGrenadeAt = elapsed;
    if (entry.actor.bot) delete entry.actor.grenade;
    if (input.id === 'grenade-red-smoke') entry.lastMissionAt = elapsed;
    return true;
  }
  function merlionAction(id: string, action: MerlionAction) {
    const entry=members.get(id);
    if(!merlion||!entry||finished||!entry.actor.alive||(!entry.actor.bot&&!entry.playing)||action!=='leave'&&arenaConditionModifiers(entry.actor.conditions).frozen)return false;
    if(!merlion.action(entry.actor,action))return false;
    if(action==='supply'){
      entry.actor.health=Math.min(entry.healthMax,entry.actor.health+25);
      entry.actor.merlionSupply={serial:(entry.actor.merlionSupply?.serial??0)+1,family:entry.actor.weapon};
    }
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
    if (!entry || merlion?.state.operator===id || entry.actor.swimming || entry.actor.bot || finished || !entry.actor.alive || item?.category !== 'consumable' || !item.effect) return false;
    if (entry.supplies && !((entry.supplies[item.id] ?? 0) > 0)) return false;
    const hands = supplyProfile(item);
    if (entry.lastSupplyAt !== undefined && elapsed - entry.lastSupplyAt < hands.seconds * hands.commit * .5) return false;
    if (entry.supplies) { if (entry.supplies[item.id] > 1) entry.supplies[item.id]--; else delete entry.supplies[item.id]; }
    entry.lastSupplyAt = elapsed;
    if (item.effect.ammoRefill) refillAmmo(entry.ammo[entry.actor.weapon], entry.weapons[entry.actor.weapon]);
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
  function queuePlayerWeapons(id: string, weapons: readonly ArenaWeapon[], allowed: readonly number[]) {
    const entry = members.get(id); if (!entry || entry.actor.bot || finished) return false;
    const next = sanitizeWeapons(weapons);
    entry.nextWeapons = { weapons: next, allowed: allowedIndexes(next, allowed) };
    return true;
  }
  /** Admitted gear leases use the same authoritative active-play clock as weapons. */
  function setPlayerEquipmentRentals(id: string, rentals: Record<string, number> = {}) {
    const entry = members.get(id); if (!entry || entry.actor.bot) return;
    entry.equipmentRentals = Object.fromEntries(Object.entries(rentals).filter(([, remaining]) => Number.isFinite(remaining) && remaining >= 0));
  }
  /** Expire server-side benefits even when a client retains an older loadout. */
  function expirePlayerRentals(entry: InternalActor) {
    if (entry.actor.bot) return;
    for (const [id, remaining] of Object.entries(entry.equipmentRentals ?? {})) {
      if (remaining > 0) continue;
      if (id.startsWith('plate-')) {
        entry.armorMax = entry.absorption = entry.actor.armor = 0;
        wearInsert(entry, insertTraits({}));
      }
      if (id === 'slot-extra') {
        entry.allowedWeapons = withWeaponModes([entry.allowedWeapons[0], 2]);
        if (entry.nextWeapons) entry.nextWeapons.allowed = withWeaponModes([entry.nextWeapons.allowed[0], 2]);
        if (!entry.allowedWeapons.includes(entry.actor.weapon)) entry.actor.weapon = entry.allowedWeapons[0];
      }
      delete entry.equipmentRentals![id];
    }
    entry.weapons.forEach((weapon, family) => {
      if (weapon.rentalRemainingMs === undefined || weapon.rentalRemainingMs > 0) return;
      entry.weapons[family] = sanitizeWeapons(FPS_WEAPONS)[family];
      entry.ammo[family] = hostAmmo(entry.weapons[family]);
      entry.wasReloading = false;
    });
  }
  function removePlayer(id: string) {
    const entry = members.get(id); if (!entry || entry.actor.bot) return;
    grenadeSystem.removeCaller(id); releaseSeat(id); members.delete(id); respawnChoices.delete(id); announce(`${entry.actor.name} left`);
  }
  function setInput(id: string, input: ArenaInput) {
    const entry = members.get(id); if (!entry || entry.actor.bot || finished || !input || !finitePoint(input)) return;
    if (![input.yaw, input.pitch].every(Number.isFinite)) return;
    entry.playing = input.playing === true;
    const actor = entry.actor; if (!actor.alive) return;
    if (arenaConditionModifiers(actor.conditions).frozen) { controls.delete(id); return; }
    // Using a supply shows: the same pose a bot takes to dress a wound.
    if (Number.isFinite(input.supply)) actor.healing = clamp(input.supply!, 0, 1); else delete actor.healing;
    if(merlion?.state.operator===id){
      actor.yaw=input.yaw%(Math.PI*2);actor.pitch=clamp(input.pitch,MERLION.minPitch,MERLION.maxPitch);
      merlion.input(actor,input.waterFire===true,input.playing===true);return;
    }
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
    if(swimmer && (swimmer.touchesWater(actor.x,actor.z)||swimmer.touchesWater(input.x,input.z)) && (actor.swimming || actor.y<2 && input.y<2)){
      const dt=Math.max(0,Math.min(.25,elapsed-(entry.lastSwimInput??elapsed-.05)));entry.lastSwimInput=elapsed;
      const dx=input.x-actor.x,dz=input.z-actor.z,d=Math.hypot(dx,dz),budget=entry.swimBudget??.08,scale=d>0?Math.min(1,budget/d):1;
      const next=swimmer.move({x:actor.x,y:0,z:actor.z,velocityY:0},dx*scale,dz*scale,dt,.35,1.8,vehicles.filter(v=>!v.despawned&&v.y<2).map(vehicleBounds));
      const moved=Math.hypot(next.x-actor.x,next.z-actor.z);entry.swimBudget=Math.max(0,budget-moved);
      if(moved>SWIMMING.stillSpeed*dt)entry.swimmingUntil=elapsed+SWIMMING.settleSeconds;
      Object.assign(actor,{x:next.x,z:next.z,y:next.y+(next.swimming?SWIMMING.eyeHeight:actor.swimming?1.75:clamp(input.y,PRONE_EYE_HEIGHT,1.75)),yaw:input.yaw%(Math.PI*2),pitch:clamp(input.pitch,-1.5,1.5),prone:!next.swimming && input.prone===true && input.y<=PRONE_EYE_HEIGHT+.02});
      if(next.swimming)actor.swimming=true;else delete actor.swimming;
      return;
    }
    const riding=traversalWorld?.lifts?.find(l=>l.id===actor.lift && insideLift(l,actor));
    delete actor.swimming;entry.lastSwimInput=undefined;
    const target = { x: clamp(input.x, bounds.minX + 0.5, bounds.maxX - 0.5), y: clamp(input.y, input.prone === true ? PRONE_EYE_HEIGHT : 1, 90), z: clamp(input.z, bounds.minZ + 0.5, bounds.maxZ - 0.5) };
    if(riding){
      const car=liftSample(riding,elapsed);
      target.y=car.y+clamp(Number.isFinite(input.liftOffset)?input.liftOffset!:actor.y-car.y,.55,2.65);
      if(car.moving){target.x=clamp(target.x,riding.x-riding.width/2+.55,riding.x+riding.width/2-.55);target.z=clamp(target.z,riding.z-riding.depth/2+.55,riding.z+riding.depth/2-.55);}
    }
    const wasProne = actor.prone;
    const floor = riding?liftSample(riding,elapsed).y:floorAt(target);
    actor.prone = input.prone === true && target.y <= floor + PRONE_EYE_HEIGHT + .02;
    if (weaponBraced(entry.weapons[actor.weapon], actor.prone, target.y <= floor + PRONE_EYE_HEIGHT + .02)) { target.x = actor.x; target.z = actor.z; }
    // Eye-height changes are stance changes, not travel that consumes the movement budget.
    if (actor.prone || wasProne && target.y <= floor + 1.75) actor.y = target.y;
    const travel = distance(actor, target); const scale = travel > 0 ? Math.min(1, entry.movementBudget / travel) : 0;
    const y = actor.y + (target.y - actor.y) * scale;
    const bodyHeight = actor.prone ? .6 : target.y - floor < 1.4 ? 1.2 : 1.8;
    const feet = y - (bodyHeight - .05);
    const solids = [...obstacles, ...vehicles.filter(v => !v.despawned && v.y < 2).map(vehicleBounds)].filter(o => (o.maxY ?? 200) > feet + 1e-5 && (o.minY??0)<y+.05);
    solids.push(...liveLiftBodies().filter(o=>(o.minY??0)<y+.05&&(o.maxY??0)>feet));
    if (traversalWorld) solids.push(...traversalWorld.traversalObstacles.filter(o => o.maxY > feet + 1e-5 && o.minY < y + .05));
    let position = move(actor, (target.x - actor.x) * scale, (target.z - actor.z) * scale, 0.35, solids);
    if (traversal && !traversal.canOccupy(position.x, Math.max(0, feet), position.z, .35, bodyHeight,liveLiftBodies())) position = { x: actor.x, z: actor.z };
    entry.movementBudget = Math.max(0, entry.movementBudget - Math.hypot(position.x - actor.x, y - actor.y, position.z - actor.z));
    Object.assign(actor, position, { y, yaw: input.yaw % (Math.PI * 2), pitch: clamp(input.pitch, -1.5, 1.5) });
  }
  function reloadPlayer(id: string, weapon: number, capacity?: number) {
    const entry = members.get(id);
    if (!entry || (seatOf(vehicles, id)?.seat ?? 2) < 2 || !entry.actor.alive || finished || !Number.isInteger(weapon) || weapon !== entry.actor.weapon || !entry.weapons[weapon] || !entry.allowedWeapons.includes(weapon)) return;
    if (arenaConditionModifiers(entry.actor.conditions).frozen) return;
    if (capacity !== undefined) {
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) return;
      entry.ammo[weapon].reloadCapacity = capacity;
    }
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
  function shoot(id: string, origin: ArenaPoint, direction: ArenaPoint, weapon: number, maxDistance = weaponRange(FPS_WEAPONS[weapon])): ArenaShot {
    const entry = members.get(id);
    if (entry?.actor.swimming && !swimmingCanFire(weapon,elapsed<(entry.swimmingUntil??0)?1:0)) return {...EMPTY_SHOT};
    if (!entry || entry.actor.transport && !rifleSeat(entry.actor.aircrew) || (seatOf(vehicles, id)?.seat ?? 2) < 2 || finished || !entry.actor.alive || !entry.playing || !finitePoint(origin) || !finitePoint(direction)) return { ...EMPTY_SHOT };
    if (arenaConditionModifiers(entry.actor.conditions).frozen || entry.actor.bot&&(entry.actor.conditions?.['water-eyes']?.strength??0)>.8 || merlion?.state.operator===id) return { ...EMPTY_SHOT };
    if (!Number.isInteger(weapon) || weapon !== entry.actor.weapon || !entry.weapons[weapon] || !entry.allowedWeapons.includes(weapon)) return { ...EMPTY_SHOT };
    if (weapon === OICW_LAUNCHER && !entry.allowedWeapons.includes(OICW_RIFLE)) return { ...EMPTY_SHOT };
    const ammo = entry.ammo[weapon];
    if (distance(origin, entry.actor) > 1.5 || ammo.cooldown > 1e-7 || ammo.reloadRemaining > 0) return { ...EMPTY_SHOT };
    const length = Math.hypot(direction.x, direction.y, direction.z); if (length < 0.5 || length > 1.5) return { ...EMPTY_SHOT };
    let ray = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    if(entry.actor.swimming) ray=swimmingShotDirection(ray,random);
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
    entry.shotFlash = { at: elapsed, flare: muzzleSignature(muzzle).flare };
    ammo.cooldown = 0; fireWeapon(ammo, weapon, entry.weapons); entry.actor.shots++; warm(entry.actor, muzzleSignature(muzzle).heat); entry.shieldUntil = 0;
    if (!roundReady(ammo, entry.weapons[weapon])) startReload(entry, weapon);
    if (weapon === OICW_LAUNCHER) {
      grenadeSystem.throwGrenade(id, { id: OICW_GRENADE, origin, direction: ray, under: false, cooked: 0 });
      return { ...EMPTY_SHOT };
    }
    return launch(entry, origin, ray, entry.weapons[weapon], Number.isFinite(maxDistance) ? Math.min(weaponRange(FPS_WEAPONS[weapon]), Math.max(0, maxDistance)) : 0, weapon);
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
        const shot = round.shooter ? resolveShot(round.shooter, from, ray, round.damage, reach, round.vehicle ?? round.ignoreHull, round.spec, round.travelled, round.calibre, !!round.vehicle, round.origin)
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
    if (attacker && damage > 0 && isProxyFaction(victim.actor.faction) && !isProxyFaction(attacker.actor.faction)) {
      proxies?.provoke(victim.actor.faction as ProxyId, proxyParticipant(attacker)); syncProxyTargets();
    }
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
      delete victim.actor.bailoutAt;
      victim.parachute = undefined; delete victim.actor.parachuting; victim.actor.alive = false; victim.actor.deaths++; victim.actor.respawnIn = ARENA_RESPAWN_SECONDS; releaseSeat(victim.actor.id);
      victim.heal = undefined; delete victim.actor.conditions; delete victim.actor.markedBy; delete victim.actor.healing; victim.meals = undefined; delete victim.actor.food;
      if (attacker && attacker !== victim) attacker.actor.kills++;
      if (factionHeat && isSquad(victim.actor.faction)) factionHeat.casualty(victim.actor.faction, factionHeat.sectorAt(victim.actor.x, victim.actor.z)?.id ?? null, heatShare(victim, attacker));
      announce(cause && !attacker ? `${cause} killed ${victim.actor.name}` : `${attacker?.actor.name ?? 'Vehicle'} eliminated ${victim.actor.name}`, attacker?.actor.id, victim.actor.id);
      if (attacker && attacker !== victim) bark(attacker, 'kill');
      // The nearest of their own side who saw it go down says so.
      const witness = [...members.values()].filter(m => m !== victim && m.actor.bot && m.actor.alive && !m.reserve && m.actor.faction === victim.actor.faction && distance(m.actor, victim.actor) <= 30)
        .sort((a, b) => distance(a.actor, victim.actor) - distance(b.actor, victim.actor))[0];
      if (witness) bark(witness, 'man-down');
      if (victim.actor.transport) {
        const t = transports.get(victim.actor.transport);
        if (t && t.driver === victim.actor.id && t.health > 0) evacuateTransport(t, true);
        const r = raiders.get(victim.actor.transport);
        if (r?.kind === 'gunship' && r.health > 0 && victim.actor.aircrew === 'pilot') {
          r.state = 'landing'; r.aim = null; r.victim = undefined; r.vx = r.vz = 0;
          const event = events.find(e => e.descriptor.id === r.event); if (event) endEvent(event, 'silenced');
          announce('Raid pilot down · helicopter making an emergency descent');
        }
      }
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
  let threatCoverQueries = 0;
  /** A short dash to nearby cover, checked against the direction of the report. */
  function threatCover(entry: InternalActor, source: ArenaPoint): ArenaPoint | undefined {
    let best: ArenaPoint | undefined, bestDistance = Infinity;
    for (const radius of [4, 7]) for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const point = { x: entry.actor.x + Math.cos(angle) * radius, y: entry.actor.y, z: entry.actor.z + Math.sin(angle) * radius };
      if (!clearSpawn(point)) continue;
      // A squad reacting together shares a small mesh-ray budget; others evade.
      if (threatCoverQueries >= 8) return best;
      threatCoverQueries++;
      point.y = floorAt(point) + 1.75;
      const length = distance(point, source);
      if (length < .01) continue;
      const ray = { x: (source.x - point.x) / length, y: (source.y - point.y) / length, z: (source.z - point.z) / length };
      if (worldWallDistance(point, ray, length) < length - .5 && radius < bestDistance) { best = point; bestDistance = radius; }
    }
    return best;
  }
  function reportThreat(entry: InternalActor, attacker: InternalActor, source: ArenaPoint, direct: boolean): boolean {
    if (!entry.actor.bot || !entry.actor.alive || entry.reserve || !hostile(entry.actor, attacker.actor)) return false;
    const previous = entry.threat;
    if (previous && elapsed - previous.reportedAt < BOT_THREAT.reportInterval && (!direct || previous.direct)) return false;
    // A radio report cannot replace a fresh personal contact with another attacker.
    if (!direct && previous?.direct && previous.until > elapsed && previous.id !== attacker.actor.id) return false;
    entry.threat = { id: attacker.actor.id, point: { ...source }, until: elapsed + BOT_THREAT.memory,
      // Continuous harassment must not indefinitely pin a capture squad off its objective.
      evadeUntil: entry.mission && previous && previous.until > elapsed ? previous.evadeUntil : elapsed + BOT_THREAT.evade, reportedAt: elapsed, direct,
      cover: previous?.id === attacker.actor.id && previous.until > elapsed ? previous.cover : threatCover(entry, source) };
    entry.lastFight = elapsed;
    return true;
  }
  function underFire(victim: InternalActor, attacker: InternalActor, source: ArenaPoint) {
    if (!reportThreat(victim, attacker, source, true)) return;
    const mates = [...members.values()].filter(m => m !== victim && m.actor.bot && m.actor.alive && !m.reserve && m.actor.faction === victim.actor.faction && distance(m.actor, victim.actor) <= BOT_THREAT.squadRadius)
      .sort((a, b) => distance(a.actor, victim.actor) - distance(b.actor, victim.actor)).slice(0, BOT_THREAT.squadmates);
    for (const mate of mates) reportThreat(mate, attacker, source, false);
  }
  /**
   * `spec`, when given, prices the hit by range and zone the way the player's
   * own rounds are. A round in flight passes `flown`, the distance it covered
   * before this stretch. Cover and bodies are tested along that segment,
   * and the hit is priced at the whole distance. `stopped` says something in range took the round.
   */
  function resolveShot(entry: InternalActor, origin: ArenaPoint, ray: ArenaPoint, damage: number, range: number, ignore?: VehicleKind, spec?: WeaponSpec, flown?: number, calibre?: number, mountedGun = true, source = origin): ArenaShot & { stopped?: boolean } {
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
      if (other === entry || entry.actor.transport && entry.actor.transport === other.actor.transport || !other.actor.alive || other.reserve || (other.actor.vehicle && !isDragonBoat(other.actor.vehicle))) continue;
      const intersection = bodyDistance(origin, ray, other.actor);
      if (intersection < nearest) { victim = other; hull = undefined; nearest = intersection; }
    }
    let raider: Raider | undefined;
    for (const candidate of raiders.values()) {
      if (entry.actor.transport === candidate.event) continue;
      const intersection = raiderDistance(candidate, origin, ray);
      if (intersection < nearest) { raider = candidate; victim = undefined; hull = undefined; nearest = intersection; }
    }
    let transport: Transport | undefined;
    for (const candidate of transports.values()) {
      if (entry.actor.transport === candidate.event) continue;
      const intersection = transportRayDistance(candidate, origin, ray);
      if (intersection < nearest) { transport = candidate; nearest = intersection; raider = undefined; victim = undefined; hull = undefined; }
    }
    let equipment: FacilityState | undefined;
    for (const candidate of facilities?.sites ?? []) {
      const intersection = facilityRayDistance(candidate, origin, ray);
      if (intersection < nearest) { equipment = candidate; nearest = intersection; transport = undefined; raider = undefined; victim = undefined; hull = undefined; }
    }
    if (ignore && mountedGun) {
      const v = vehicles.find(v => v.kind === ignore)!;
      v.shotEnd = { x: origin.x + ray.x * nearest, y: origin.y + ray.y * nearest, z: origin.z + ray.z * nearest };
    }
    // Only the clear, actually travelled segment can alert nearby infantry.
    for (const other of members.values()) if (other !== victim && other !== entry && other.actor.bot && other.actor.alive && !other.reserve && !other.actor.parachuting && !seatOf(vehicles, other.actor.id) && hostile(other.actor, entry.actor) &&
      nearBullet(chestOf(other.actor), origin, ray, nearest)) underFire(other, entry, source);
    if (victim) underFire(victim, entry, source);
    if (flown !== undefined && !raider && !hull && !victim && !equipment && !transport) return { ...EMPTY_SHOT, stopped: wallStops };
    if (spec) damage = hitDamage(spec, (flown ?? 0) + nearest, victim && headHit(origin, ray, victim.actor, nearest) ? 'head' : undefined);
    if (equipment) {
      const taken = damageFacility(equipment, damage, entry.actor.faction);
      return { hitId: taken ? `facility-${equipment.id}` : null, damage: taken, killed: taken > 0 && equipment.health === 0, stopped: true };
    }
    if (transport) return { ...hurtTransport(transport, damage, entry), stopped: true };
    if (raider) return { ...hurtRaider(raider, damage, entry), stopped: true };
    if (hull) { const before = hull.health; damageHull(hull, damage, entry); return { hitId: `vehicle-${hull.kind}`, killed: before > 0 && hull.health === 0, damage: Math.min(before, damage), stopped: true }; }
    // A round that finds one of the shooter's own side stops there and does no harm.
    if (victim && !hostile(entry.actor, victim.actor) && !(!entry.actor.bot && isProxyFaction(victim.actor.faction))) return { ...EMPTY_SHOT, stopped: true };
    if (victim && entry.actor.bot && !victim.actor.bot && elapsed < (victim.shieldUntil ?? 0)) return { hitId: victim.actor.id, killed: false, damage: 0, stopped: true };
    return victim ? { ...wound(victim, origin, ray, nearest, damage, entry, undefined, ignore ? origin : undefined, calibre), stopped: true } : { ...EMPTY_SHOT, stopped: true };
  }
  function releaseSeat(id: string, switching = false) {
    const mounted = seatOf(vehicles, id);
    if (mounted) {
      mounted.vehicle.occupants[mounted.seat] = null;
      if (mounted.seat === 0) { const life = lifeOf(mounted.vehicle); life.pickupDriver = undefined; life.pickupStopped = 0; }
      if (vehicleOptions?.openWorld && !switching && (mounted.seat === 0 ||
        !members.get(id)?.actor.bot && !mounted.vehicle.occupants[0] && !mounted.vehicle.occupants.some(occupant => occupant && !members.get(occupant)?.actor.bot))) lifeOf(mounted.vehicle).unload = true;
    }
    const actor = members.get(id)?.actor; if (actor) { delete actor.vehicle; delete actor.seat; }
    controls.delete(id);
  }
  function syncOccupants() {
    for (const v of vehicles) v.occupants.forEach((id, seat) => {
      if (!id) return;
      const entry = members.get(id);
      if (!entry?.actor.alive) { releaseSeat(id); return; }
      delete entry.actor.swimming;
      Object.assign(entry.actor, seatPoint(v, seat), { vehicle: v.kind, seat, prone: false });
      delete entry.actor.bailoutAt;
    });
  }
  function vehicleAction(id: string, action: 'enter' | 'exit' | 'switch', kind?: VehicleKind) {
    const entry = members.get(id); if (!entry?.actor.alive || merlion?.state.operator===id || !entry.playing || finished || entry.actor.bot && !vehicleOptions?.openWorld && !isDragonBoat(kind??entry.actor.vehicle??'')) return false;
    const mounted = seatOf(vehicles, id);
    if (action === 'exit' && mounted) {
      // A moving bailout releases only the caller; the remaining crew brakes and unloads safely.
      if (entry.actor.bot && vehicleSpeed(mounted.vehicle) > 2) return false;
      if (vehicleOptions?.openWorld && mounted.seat === 0 && vehicleSpeed(mounted.vehicle) <= 2) return unloadVehicle(mounted.vehicle);
      const others = vehicles.filter(v => !v.despawned && v !== mounted.vehicle && v.y < 2).map(vehicleBounds);
      const exit = vehicleExit(mounted.vehicle, [...obstacles, ...others], bounds, exitFloor); if (!exit) return false;
      const damage = vehicleExitDamage(mounted.vehicle);
      releaseSeat(id); Object.assign(entry.actor, exit, { y: exit.y + 1.75 }); entry.movementBudget = 0; entry.vehicleBoardAfter = elapsed + WORLD_VEHICLES.boardCooldown;
      entry.navigation = undefined; entry.velocityY = 0;
      if (damage > 0) {
        hurtActor(entry, damage, undefined, 'High-speed bailout', mounted.vehicle, false, true);
        if (entry.actor.alive) entry.actor.bailoutAt = elapsed;
      }
      return true;
    }
    if (action === 'switch' && mounted) {
      for (let n = 1; n < 4; n++) { const seat = (mounted.seat + n) % 4; if (mounted.vehicle.occupants[seat] === null && !(entry.actor.bot && mounted.vehicle.kind === 'helicopter' && seat === 0)) {
        releaseSeat(id, true); mounted.vehicle.occupants[seat] = id; if(isDragonBoat(mounted.vehicle.kind) && seat===0) lifeOf(mounted.vehicle).unload=false; syncOccupants(); return true;
      } }
      return false;
    }
    if (action !== 'enter' || mounted) return false;
    const v = vehicles.find(v => v.kind === kind);
    if (!v || v.health <= 0 || v.y > (bounds.groundHeight?.(v.x, v.z) ?? 0) + .4 || vehicleSpeed(v) > 2 || v.kind === 'helicopter' && Math.abs(v.climb) > .5 || Math.hypot(entry.actor.x - v.x, entry.actor.z - v.z) > (v.kind === 'car' ? 4.5 : 6) || Math.abs(entry.actor.y - 1.75 - (v.y - .13)) > 1.25) return false;
    if(isDragonBoat(v.kind)){const landing=vehicleExit(v,obstacles,bounds,exitFloor);if(!landing || Math.hypot(entry.actor.x-landing.x,entry.actor.z-landing.z)>2) return false;}
    const center = { x: v.x, y: v.y + 1.3, z: v.z }, d = distance(entry.actor, center);
    const ray = { x: (center.x - entry.actor.x) / d, y: (center.y - entry.actor.y) / d, z: (center.z - entry.actor.z) / d };
    if (d > .1 && worldWallDistance(entry.actor, ray, d) < d - .2) return false;
    // Nobody boards the opposing side's hull, or one whose crew is unloading.
    if (vehicleOptions?.openWorld && (lifeOf(v).unload || v.occupants.some(occupant => occupant && getArenaFaction(entry.actor.faction)?.side !== getArenaFaction(members.get(occupant)!.actor.faction)?.side))) return false;
    const seat = v.occupants.indexOf(null); if (seat < 0) return false;
    v.occupants[seat] = id; stopReload(entry, entry.actor.weapon);
    entry.heal = undefined; delete entry.actor.healing; entry.navigation = undefined;
    if (seat === 0) {
      const life = lifeOf(v); life.wait = elapsed + WORLD_VEHICLES.waitForCrew;
      life.assembleUntil = elapsed + WORLD_VEHICLES.assembleSeconds; life.departed = false;
      life.crew = entry.actor.bot ? crewCandidates(entry, v).slice(0, 3).map(m => m.actor.id) : [];
    }
    syncOccupants(); return true;
  }
  const exitFloor = (x: number, z: number) => traversal ? traversal.supportHeight(x, z, (bounds.groundHeight?.(x,z)??0)+MAX_STEP_HEIGHT, .38, 1.8) : 0;
  /** Plan every exit before freeing a seat: never stack a squad or put it inside cover. */
  function unloadVehicle(v: SharedVehicle, keepPilot = false) {
    if (vehicleSpeed(v) > 2) return false;
    const solids = [...obstacles, ...vehicles.filter(other => !other.despawned && other !== v && other.y < 2).map(vehicleBounds)];
    const crew = v.occupants.slice(keepPilot ? 1 : 0).filter((id): id is string => !!id);
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
    stopVehicle(v); lifeOf(v).unload = false; return true;
  }
  function damageHull(v: SharedVehicle, damage: number, attacker?: InternalActor, cause?: string) {
    if (!damageVehicle(v, damage)) return;
    const point = { x: v.x, y: v.y + 1.3, z: v.z };
    const crew = [...v.occupants].filter((id): id is string => id !== null);
    for (const id of crew) { const member = members.get(id); if (member) hurtActor(member, member.actor.health + member.actor.armor + 1, attacker, cause); }
    // A wreck is a blast like any other, with the hull's own linear falloff and no stance relief.
    const spec = VEHICLE_COMBAT[v.kind];
    if(spec.blastRadius>0) blast(point, { radius: spec.blastRadius, damage: spec.blastDamage, minScale: 0, vehicleScale: 1, stance: false }, attacker, cause, v);
    announce(`${vehicleName(v.kind)} destroyed`, attacker?.actor.id);
  }
  /** Whether nothing solid stands between a blast and what it reaches. */
  function clearBlast(from: ArenaPoint, to: ArenaPoint, length: number) {
    if (length < .1) return true;
    const dir = { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length };
    return worldWallDistance(from, dir, length) >= length - .1;
  }
  type BlastItem = { hull: SharedVehicle } | { member: InternalActor } | { transport: Transport };
  function blast(point: ArenaPoint, spec: Parameters<typeof resolveBlast>[1], attacker?: InternalActor, cause?: string, source?: SharedVehicle, grenade = false, shred = 0) {
    warm(point, 3);
    for (const site of facilities?.sites ?? []) {
      const center = { x: site.x, y: site.y + .9, z: site.z }, d = distance(point, center);
      if (d < spec.radius && clearBlast(point, center, d)) damageFacility(site, spec.damage * Math.max(0, 1 - d / spec.radius), attacker?.actor.faction);
    }
    const targets: BlastTarget<BlastItem>[] = [];
    // Hulls first, so a chain of wrecks resolves before the crews and bystanders, as it always has.
    for (const other of vehicles) if (other !== source && other.health > 0 && (!grenade || !attacker || !other.occupants.some(id => id && id !== attacker.actor.id && members.has(id) && !hostile(attacker.actor, members.get(id)!.actor)))) targets.push({ item: { hull: other }, point: { x: other.x, y: other.y + 1.3, z: other.z }, vehicle: true });
    for (const t of transports.values()) if (t.health > 0 && t.visible && (!grenade || !attacker || hostile(attacker.actor, { bot: true, faction: transportFaction(t) }))) targets.push({ item: { transport: t }, point: transportPoint(t, 0, 1.3, 0), vehicle: true });
    for (const member of members.values()) if (member.actor.alive && !member.reserve && !member.actor.transport && !seatOf(vehicles, member.actor.id)) {
      if (grenade && attacker && member !== attacker && !hostile(attacker.actor, member.actor) && !(!attacker.actor.bot && isProxyFaction(member.actor.faction))) continue;
      const { actor } = member, low = actor.y - floorAt(actor) < 1.4;
      // Wrecks have always measured to the eye; stance-aware blasts measure to the body.
      targets.push({ item: { member }, stance: actor.prone ? 'prone' : low ? 'crouch' : 'stand',
        point: !spec.stance ? { x: actor.x, y: actor.y, z: actor.z } : { x: actor.x, y: actor.prone ? actor.y - PRONE_EYE_HEIGHT + .35 : actor.y - (low ? .45 : .62), z: actor.z } });
    }
    for (const hit of resolveBlast(point, spec, targets, clearBlast)) {
      if ('hull' in hit.item) { if (hit.item.hull.health > 0) damageHull(hit.item.hull, hit.damage, attacker, cause); }
      else if ('transport' in hit.item) { hurtTransport(hit.item.transport, hit.damage, attacker, cause, true); }
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
  interface Transport extends ArenaTransport { payload: TransportPayload; emergency: boolean; escape: number; nextExit: number; fallSpeed: number; ground: number; driftX: number; driftZ: number; sea?: { site: NavalLandingSite; departing?: number; blocked?: number }; }
  const transports = new Map<string, Transport>();
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
  function startEvent(directive: Pick<CombatEventDescriptor, 'kind' | 'seed' | 'target' | 'heading' | 'intensity' | 'reach' | 'troops' | 'faction' | 'landing' | 'origin' | 'altitude'>) {
    const plugin = getCombatEvent(directive.kind);
    if (isEliteEvent(directive.kind) && events.some(e => isEliteEvent(e.descriptor.kind) && ['warning', 'active'].includes(combatPhase(e.descriptor, elapsed)))) return null;
    // At most three of a kind at once: transports are news and hazards are not, so a busy road never holds back a barrage.
    const alike = events.filter(e => combatPhase(e.descriptor, elapsed) !== 'aftermath' && !!getCombatEvent(e.descriptor.kind)?.hazard === !!plugin?.hazard);
    if (!plugin || finished || events.length >= MAX_COMBAT_EVENTS || alike.length >= 3) return null;
    const target = { x: clamp(directive.target.x, bounds.minX, bounds.maxX), z: clamp(directive.target.z, bounds.minZ, bounds.maxZ) };
    // Whose event it is: a transport says; anything else belongs to the side opposing whoever is nearest its
    // target, so shelling a player is the mercenaries' doing and shelling a mercenary patrol is fire support.
    const owner = isEliteEvent(plugin.id) ? DEFAULT_BOT_FACTION : directive.faction ?? (plugin.id.startsWith('transport') ? DEFAULT_BOT_FACTION : ownerAt(target));
    const descriptor: CombatEventDescriptor = { id: `event-${++eventSerial}`, kind: plugin.id, seed: directive.seed >>> 0, start: elapsed, target,
      heading: Number.isFinite(directive.heading) ? directive.heading : 0, intensity: clamp(Number.isFinite(directive.intensity) ? directive.intensity : 1, .5, 2),
      ...(Number.isFinite(directive.reach) ? { reach: clamp(directive.reach!, 0, 400) } : {}),
      ...(Number.isInteger(directive.troops) ? { troops: clamp(directive.troops!, 1, MAX_TROOPS) } : {}), ...(owner === PLAYER_FACTION ? { faction: owner } : {}) };
    if (directive.landing) descriptor.landing = directive.landing;
    if (directive.origin) descriptor.origin = { ...directive.origin };
    if (directive.altitude !== undefined) descriptor.altitude = directive.altitude;
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
    if (isEliteEvent(d.kind)) {
      const center = eliteSite(d); if (!center) return false;
      d.origin = center;
    }
    if (d.kind === 'transport-sea' && !environment?.navalSites?.some(s => s.id === d.landing)) return false;
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
  /** All four slots must be walkable and distant from players and protected arrivals. */
  function eliteSlotsClear(d: CombatEventDescriptor, center: CombatPlane) {
    const points = eliteSquadPoints(center, d.heading), humans = humansAlive();
    return points.every(p => {
      const floor = floorAt({ ...p, y: (bounds.groundHeight?.(p.x, p.z) ?? 0) + 3.5 });
      return clearSpawn(p) && Math.abs(groundHeight(p.x, p.z) - floor) < .6 &&
        humans.every(h => Math.hypot(h.actor.x - p.x, h.actor.z - p.z) >= ELITE_SQUAD.minimumDistance) &&
        (!environment?.playerSpawn || Math.hypot(environment.playerSpawn.x - p.x, environment.playerSpawn.z - p.z) >= ELITE_SQUAD.spawnClearance) &&
        [...members.values()].every(m => !m.actor.alive || m.reserve || Math.hypot(m.actor.x - p.x, m.actor.z - p.z) >= 2);
    });
  }
  function eliteSite(d: CombatEventDescriptor): CombatPlane | null {
    const candidates = [d.target, ...validSpawns];
    for (let i = 0; i < 16; i++) for (const radius of [55, 75, 95]) {
      const a = d.heading + i * Math.PI / 8;
      candidates.push({ x: d.target.x + Math.cos(a) * radius, z: d.target.z + Math.sin(a) * radius });
    }
    return candidates.filter(p => eliteSlotsClear(d, p)).sort((a, b) =>
      Math.hypot(a.x - d.target.x, a.z - d.target.z) - Math.hypot(b.x - d.target.x, b.z - d.target.z))[0] ?? null;
  }
  /** Insert once after the warning. A player entering the marked area cancels the insertion. */
  function fieldElite(event: RunningEvent) {
    const d = event.descriptor, roster = eliteRoster(d.kind);
    if (!d.origin || members.size + roster.length > MAX_ARENA_ACTORS || !eliteSlotsClear(d, d.origin)) return false;
    const points = eliteSquadPoints(d.origin, d.heading);
    roster.forEach((roleId, slot) => {
      const role = getArenaRole(roleId)!, at = points[slot];
      const entry = addMember(`${d.id}-elite-${slot}`, role.name, role.armor, role.absorption, FPS_WEAPONS, false, undefined, role)!;
      entry.role = role; entry.healthMax = role.health;
      Object.assign(entry.actor, { bot: true, role: role.id, faction: DEFAULT_BOT_FACTION, squad: d.id });
      spawn(entry, { ...at, y: floorAt({ ...at, y: (bounds.groundHeight?.(at.x, at.z) ?? 0) + 3.5 }), yaw: d.heading });
      entry.temporary = { event: d.id, from: elapsed }; entry.shieldUntil = 0;
      entry.actor.name = slot === 0 && d.kind === 'command-hunt' ? 'Legendary Commander' : `Ultra ${role.name.replace(' rifleman', '').replace(' breacher', '').replace(' gunner', '')}`;
      entry.mission = { ...d.target }; entry.actor.objective = d.kind;
    });
    event.crew = d.kind === 'command-hunt' ? 'Command squad' : 'Elite squad';
    announce(d.kind === 'command-hunt' ? 'Command squad deployed · leader carries a Legendary rifle' : 'Elite sweep deployed · recover Ultra weapons from fallen specialists');
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
    if (d.kind.startsWith('transport-')) return fieldTransport(event);
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
        health: gunship ? RAID.health : DRONE.health, maxHealth: gunship ? RAID.health : DRONE.health, ...(gunship ? { ammo: VEHICLE_COMBAT.helicopter.ammo } : {}), state: gunship ? 'inbound' : 'cruise',
        aim: null, shots: 0, vx: 0, vy: 0, vz: 0, since: 0, fired: 0, next: 0, lost: 0, until: Infinity, angle: 0 });
      if (gunship) {
        const r = raiders.get(d.id)!, orbit = combatTimeline(d).find((p): p is OrbitPayload => p.type === 'orbit');
        if (orbit) Object.assign(r, orbitPose(orbit, 0, d.altitude ?? 40));
        if (!fieldAircrew(d, r)) { raiders.delete(d.id); return false; }
      }
    }
    return !event.crew || [...members.values()].some(m => m.temporary?.event === d.id);
  }
  const transportFaction = (t: Transport) => events.find(e => e.descriptor.id === t.event)?.descriptor.faction ?? DEFAULT_BOT_FACTION;
  const transportPassengers = (t: Transport) => [...members.values()].filter(m => m.ride?.event === t.event).sort((a, b) => a.ride!.slot - b.ride!.slot);
  function fieldTransport(event: RunningEvent) {
    const d = event.descriptor, payload = combatTimeline(d).find(p => p.type === 'transport');
    if (!payload || payload.type !== 'transport') return false;
    const savedSeed = seed;
    const driver = addMember(`${d.id}-driver`, payload.mode === 'sea' ? 'Coxswain' : payload.mode === 'land' ? 'Transport driver' : 'Transport pilot', 0, 0, FPS_WEAPONS, false);
    seed = savedSeed;
    if (!driver) return false;
    driver.actor.bot = true; driver.actor.role = 'assault'; driver.actor.faction = d.faction ?? DEFAULT_BOT_FACTION;
    driver.actor.transport = d.id; if (payload.mode === 'air') driver.actor.aircrew = 'pilot'; driver.temporary = { event: d.id, from: Infinity }; driver.reserve = true;
    const pose = transportPose(payload, 0), ground = payload.mode === 'sea' ? d.altitude! : groundHeight(pose.x, pose.z), health = TRANSPORT_HULL[payload.mode].health;
    const t: Transport = { event: d.id, mode: payload.mode, x: pose.x, y: ground + pose.y, z: pose.z, yaw: pose.yaw, health, maxHealth: health,
      state: 'inbound', visible: false, driver: driver.actor.id, driverAlive: true, passengers: 0, payload, emergency: false, escape: 0, nextExit: 0, fallSpeed: 0, ground, driftX: 0, driftZ: 0 };
    if (payload.mode === 'sea') { t.ramp = 0; t.sea = { site: environment!.navalSites!.find(s => s.id === d.landing)! }; }
    transports.set(d.id, t); if (payload.mode === 'air') fieldAircrew(d, t, driver.actor.id); syncTransportDriver(t); return true;
  }
  function syncTransportDriver(t: Transport) {
    const driver = members.get(t.driver); if (!driver) return;
    driver.reserve = !t.visible || t.state === 'departed';
    const seat = transportDriverPoint(t);
    Object.assign(driver.actor, seat, { yaw: t.yaw, pitch: 0, ground: seat.y - 1.2 });
    t.driverAlive = driver.actor.alive;
    if (t.mode === 'air') syncAircrew(t.event, t, t.visible && t.state !== 'departed');
  }
  function fieldAircrew(d: CombatEventDescriptor, frame: { x: number; y: number; z: number; yaw: number }, existingPilot?: string) {
    let pilot = !!existingPilot;
    for (const role of helicopterCrew(d)) {
      if (role === 'pilot' && existingPilot) continue;
      const savedSeed = seed;
      const weapons = FPS_WEAPONS.map(w => ({ ...w, damage: AIRCREW.damage, capacity: 24, interval: AIRCREW.interval }));
      const entry = addMember(`${d.id}-${role}`, role === 'pilot' ? 'Gunship pilot' : role === 'door-left' ? 'Left rifleman' : 'Right rifleman', 0, 0, weapons, false, [0]);
      seed = savedSeed;
      if (!entry) continue;
      Object.assign(entry.actor, { bot: true, role: 'assault', faction: d.faction ?? DEFAULT_BOT_FACTION, transport: d.id, aircrew: role });
      entry.role = getArenaRole('assault'); entry.temporary = { event: d.id, from: d.start + (getCombatEvent(d.kind)?.warning ?? 0) };
      entry.reserve = true; if (role === 'pilot') pilot = true;
    }
    syncAircrew(d.id, frame, !existingPilot); return pilot;
  }
  function syncAircrew(id: string, frame: { x: number; y: number; z: number; yaw: number }, visible: boolean) {
    for (const entry of members.values()) if (entry.actor.transport === id && entry.actor.aircrew) {
      const seat = aircrewPoint(frame, entry.actor.aircrew);
      Object.assign(entry.actor, seat, { ground: seat.y - 1.2 }); entry.reserve = !visible;
      if (!rifleSeat(entry.actor.aircrew) || !entry.target) Object.assign(entry.actor, { yaw: aircrewFacing(frame.yaw, entry.actor.aircrew), pitch: 0 });
    }
  }
  function evacuateAircrew(id: string, frame: { x: number; y: number; z: number; yaw: number; ground?: number }) {
    let slot = 0;
    for (const entry of members.values()) if (entry.actor.transport === id && rifleSeat(entry.actor.aircrew) && entry.actor.alive) {
      const at = transportExit({ ...frame, ground: frame.ground ?? groundHeight(frame.x, frame.z) }, slot++); if (!at) continue;
      Object.assign(entry.actor, at); delete entry.actor.transport; delete entry.actor.aircrew; delete entry.actor.ground;
      entry.reserve = false; entry.target = ''; entry.temporary = { event: id, from: elapsed };
      entry.patrol = { x: clamp(at.x + (at.x - frame.x) * 2, bounds.minX + 1, bounds.maxX - 1), z: clamp(at.z + (at.z - frame.z) * 2, bounds.minZ + 1, bounds.maxZ - 1) };
      entry.evacuating = { ...entry.patrol, until: elapsed + 3 };
    }
  }
  function stepAircrew() {
    for (const entry of members.values()) {
      const actor = entry.actor; if (!actor.transport || !rifleSeat(actor.aircrew) || !actor.alive || entry.reserve || elapsed < (entry.temporary?.from ?? 0)) continue;
      const frame = transports.get(actor.transport) ?? raiders.get(actor.transport); if (!frame || frame.health <= 0) continue;
      const facing = aircrewFacing(frame.yaw, actor.aircrew!), fx = -Math.sin(facing), fz = -Math.cos(facing);
      const victim = [...members.values()].filter(m => m.actor.alive && !m.reserve && m.actor.transport !== actor.transport && hostile(actor, m.actor) && distance(actor, m.actor) < AIRCREW.range &&
        (m.actor.x - actor.x) * fx + (m.actor.z - actor.z) * fz > 0 && lineClear(actor, chestOf(m.actor)))
        .sort((a, b) => distance(actor, a.actor) - distance(actor, b.actor))[0];
      if (!victim) { entry.target = ''; continue; }
      entry.target = victim.actor.id;
      const aim = chestOf(victim.actor), dx = aim.x - actor.x, dy = aim.y - actor.y, dz = aim.z - actor.z, length = Math.hypot(dx, dy, dz);
      actor.yaw = Math.atan2(-dx, -dz); actor.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      if (elapsed < (entry.airNext ?? 0)) continue;
      const spread = .035, ray = { x: dx / length + (random() - .5) * spread, y: dy / length + (random() - .5) * spread, z: dz / length + (random() - .5) * spread };
      shoot(actor.id, actor, ray, actor.weapon);
      entry.airBurst = (entry.airBurst ?? 0) + 1;
      entry.airNext = elapsed + (entry.airBurst >= AIRCREW.burst ? AIRCREW.pause : AIRCREW.interval);
      if (entry.airBurst >= AIRCREW.burst) entry.airBurst = 0;
    }
  }
  /** Stop where the host actually is. An airborne pilot loss makes a bounded emergency descent. */
  function evacuateTransport(t: Transport, all: boolean) {
    if (t.health <= 0 || t.state === 'departed') return;
    const aboard = transportPassengers(t);
    if (t.mode === 'sea') {
      if (all) { t.driverAlive = false; t.emergency = true; t.state = 'stopped'; }
      // A damaged hull cannot conjure exits in open water. At the beach its dry ramp still works.
      if (all) announce('Coxswain down · landing craft stopped');
      return;
    }
    if (all) t.driverAlive = false;
    if (!t.emergency) {
      t.emergency = true; t.ground = groundHeight(t.x, t.z); t.driftX = t.driftZ = 0;
      t.state = t.mode === 'air' && t.y > t.ground + .4 ? 'landing' : 'stopped';
      // Landing stays over the current location; if it cannot unload safely, the passengers stay aboard.
      t.nextExit = elapsed + TRANSPORT_EXIT_SECONDS;
      t.escape = all ? aboard.length : Math.floor(aboard.length / 2);
      announce(all ? `${t.mode === 'land' ? 'Transport driver' : 'Transport pilot'} down · troops evacuating` : 'Transport critical · troops abandoning vehicle');
    } else if (all) t.escape = aboard.length;
  }
  function hurtTransport(t: Transport, damage: number, attacker?: InternalActor, cause = 'Transport explosion', explosive = false): ArenaShot {
    const before = t.health;
    if (!(damage > 0) || before <= 0 || !t.visible || t.state === 'departed') return { ...EMPTY_SHOT };
    // Infantry fire obeys the same faction rule as a shot on the driver.
    if (attacker && !explosive && !hostile(attacker.actor, { bot: true, faction: transportFaction(t) })) return { ...EMPTY_SHOT };
    t.health = Math.max(0, before - damage);
    if (t.health === 0) {
      t.emergency = true; t.escape = 0; t.driverAlive = false; t.ground = t.sea?.site.waterY ?? groundHeight(t.x, t.z);
      t.state = t.mode === 'air' && t.y > t.ground + .4 ? 'down' : 'wreck';
      for (const crew of members.values()) if (crew.actor.transport === t.event && crew.actor.alive)
        hurtActor(crew, crew.actor.health + crew.actor.armor + 1, attacker, cause);
      // Nobody still booked into this wreck may appear at its old drop or use an expired fallback clock.
      for (const passenger of transportPassengers(t)) {
        passenger.ride = undefined; passenger.waiting = elapsed; passenger.actor.respawnIn = ARENA_RESPAWN_SECONDS;
        if (passenger.reserve && passenger.recruit) dismiss(passenger.actor.id);
      }
      t.passengers = 0;
      const spec = TRANSPORT_HULL[t.mode];
      blast(transportPoint(t, 0, 1.3, 0), { radius: spec.blastRadius, damage: spec.blastDamage, minScale: 0, vehicleScale: 1, stance: true }, attacker, cause);
      announce(`${t.mode === 'sea' ? 'Landing craft' : t.mode === 'land' ? 'Troop truck' : 'Troop helicopter'} destroyed`, attacker?.actor.id);
      const event = events.find(e => e.descriptor.id === t.event); if (event) endEvent(event, 'downed');
    } else if (t.health <= t.maxHealth * TRANSPORT_CRITICAL && !t.emergency) evacuateTransport(t, false);
    return { hitId: `transport-${t.event}`, damage: Math.min(before, damage), killed: t.health === 0 };
  }
  /** A clear way out beside the stopped hull, never the original scheduled drop. */
  function transportExit(t: Pick<Transport, 'x' | 'y' | 'z' | 'yaw' | 'ground'>, slot: number) {
    for (let trial = 0; trial < 12; trial++) {
      const side = (slot + trial) % 2 ? -1 : 1, row = Math.floor(trial / 2);
      const at = transportPoint(t, side * (3 + Math.floor(row / 3)), 1.75, (row % 3 - 1) * 1.8);
      at.y = groundHeight(at.x, at.z) + 1.75;
      if (Math.abs(at.y - 1.75 - t.ground) > .6 || !clearSpawn(at) || [...members.values()].some(m => !m.reserve && m.actor.alive && !m.actor.transport && distance(m.actor, at) < 1.1)) continue;
      const door = transportPoint(t, side * 1.25, 1.2, 0);
      if (clearBlast(door, { ...at, y: at.y - .55 }, distance(door, { ...at, y: at.y - .55 }))) return at;
    }
    return null;
  }
  function clearTransport(id: string) {
    const t = transports.get(id); if (!t) return;
    for (const passenger of transportPassengers(t)) { passenger.ride = undefined; passenger.waiting = elapsed; }
    for (const member of members.values()) if (member.actor.transport === id) dismiss(member.actor.id);
    transports.delete(id);
  }
  /** A destroyed hull rides out its speed until friction or something solid stops it; the air barely slows a falling one. */
  function coastTransportWreck(t: Transport, dt: number) {
    const speed = Math.hypot(t.driftX, t.driftZ); if (speed < .01) return;
    const reach = speed * dt, ray = { x: t.driftX / speed, y: 0, z: t.driftZ / speed }, nose = 3.4;
    const x = t.x + ray.x * reach, z = t.z + ray.z * reach;
    if (worldWallDistance({ x: t.x, y: t.y + 1.3, z: t.z }, ray, reach + nose) < reach + nose || !inside({ x, z }, bounds)) { t.driftX = t.driftZ = 0; return; }
    t.x = x; t.z = z; t.ground = groundHeight(x, z);
    const kept = t.state === 'down' ? Math.exp(-.25 * dt) : Math.max(0, speed - 7 * dt) / speed;
    t.driftX *= kept; t.driftZ *= kept;
  }
  function stepTransports(dt: number) {
    for (const t of transports.values()) {
      const event = events.find(e => e.descriptor.id === t.event); if (!event) continue;
      const age = elapsed - event.descriptor.start;
      if (t.sea) { stepSeaTransport(t, event.descriptor, age); syncTransportDriver(t); if (t.state === 'departed') for (const m of members.values()) if (m.actor.transport === t.event) dismiss(m.actor.id); continue; }
      if (!t.emergency) {
        const pose = transportPose(t.payload, age);
        // What the route was doing is what a wreck carries on doing.
        t.driftX = t.visible && dt > 0 ? (pose.x - t.x) / dt : 0; t.driftZ = t.visible && dt > 0 ? (pose.z - t.z) / dt : 0;
        Object.assign(t, { x: pose.x, z: pose.z, yaw: pose.yaw, visible: pose.visible });
        t.ground = groundHeight(t.x, t.z); t.y = t.ground + pose.y;
        t.state = age > t.payload.leave ? 'departed' : age >= t.payload.depart ? 'leaving' : age >= t.payload.arrive ? 'unloading' : 'inbound';
      } else if (t.state === 'landing' || t.state === 'down') {
        if (t.state === 'down') coastTransportWreck(t, dt);
        t.fallSpeed = t.state === 'down' ? Math.min(24, t.fallSpeed + 9.8 * dt) : 5;
        t.y = Math.max(t.ground, t.y - t.fallSpeed * dt);
        if (t.y <= t.ground + .01) { t.state = t.health > 0 ? 'stopped' : 'wreck'; t.y = t.ground; }
      } else if (t.state === 'wreck') { coastTransportWreck(t, dt); t.y = t.ground; }
      t.passengers = transportPassengers(t).length;
      if (t.state === 'stopped' && t.escape > 0 && elapsed >= t.nextExit) {
        t.nextExit = elapsed + TRANSPORT_EXIT_SECONDS;
        const passenger = transportPassengers(t)[0], at = passenger && transportExit(t, passenger.ride!.slot);
        if (passenger && at) {
          const slot = passenger.ride!.slot;
          disembark(event.descriptor, slot, at); passenger.actor.y = at.y;
          // They run clear before resuming normal combat; the driver stays at the wheel if alive.
          passenger.patrol = { x: clamp(at.x + (at.x - t.x) * 2, bounds.minX + 1, bounds.maxX - 1), z: clamp(at.z + (at.z - t.z) * 2, bounds.minZ + 1, bounds.maxZ - 1) };
          passenger.evacuating = { ...passenger.patrol, until: elapsed + 3 };
          t.escape--; t.passengers = transportPassengers(t).length;
        }
      }
      if (age > t.payload.leave && !t.emergency) {
        t.visible = false; for (const member of members.values()) if (member.actor.transport === t.event) dismiss(member.actor.id);
        for (const passenger of transportPassengers(t)) { passenger.ride = undefined; passenger.waiting = elapsed; }
      }
      syncTransportDriver(t);
      if (t.state === 'stopped' && !t.driverAlive) evacuateAircrew(t.event, t);
    }
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
  const proxyParticipant = (m: InternalActor): ProxyParticipant => ({ ...m.actor, playing: m.playing, feet: m.actor.y - (m.actor.prone ? PRONE_EYE_HEIGHT : 1.75) });
  const proxyParticipants = () => [...members.values()].filter(m => !m.reserve).map(proxyParticipant);
  function syncProxyTargets() {
    const op = proxies?.current();
    for (const m of members.values()) if (m.actor.proxyOperation) m.actor.proxyTargets = op ? [...op.targets[m.actor.faction as ProxyId]] : [];
  }
  function startProxyOperation(target?: CombatPlane) {
    if (!proxies || !environment?.proxies || members.size + 4 > MAX_ARENA_ACTORS || [...members.values()].some(m => m.actor.proxyOperation) || proxies.current() && proxies.current()!.phase !== 'complete') return false;
    const human = humansAlive().find(m => m.playing)?.actor;
    if (!human) return false;
    const candidates = target ? [target] : Array.from({ length: 24 }, (_, i) => {
      const a = i * Math.PI / 12, r = i % 2 ? 65 : 45;
      return { x: human.x + Math.cos(a) * r, z: human.z + Math.sin(a) * r };
    });
    for (const at of candidates) {
      if (!proxyDropClear(at)) continue;
      const y = patrolGround(at.x, at.z);
      for (let heading = 0; heading < 8; heading++) {
        const angle = heading * Math.PI / 4;
        const entries = Object.fromEntries(PROXY_IDS.map((f, i) => {
          const sign = i ? -1 : 1, x = at.x + Math.cos(angle) * 28 * sign, z = at.z + Math.sin(angle) * 28 * sign;
          return [f, { x, y: patrolGround(x,z), z }];
        })) as Record<ProxyId, ProxyPoint>;
        const safe = Object.values(entries).every(p => proxyCellPoints(at, p).every(proxyDropClear) &&
          humansAlive().every(h => Math.hypot(h.actor.x-p.x,h.actor.z-p.z) >= 20) &&
          Array.from({length:15},(_,i) => ({x:at.x+(p.x-at.x)*i/14,z:at.z+(p.z-at.z)*i/14})).every(q => clearSpawn(q) && Math.abs(patrolGround(q.x,q.z)-y)<.6));
        if (!safe) continue;
        if (!proxies.start({ ...at, y }, entries)) return false;
        announce(`${proxyName(proxies.current()!.owner)} prototype cargo descending. Freedom Force and Collective Corps parachute cells inbound. Cargo tracker is broadcasting.`);
        return true;
      }
    }
    environment.proxies.nextIn = 20; return false;
  }
  /** Separate full canopies, with both operators approaching from the same side. */
  function proxyCellPoints(at: CombatPlane, p: ProxyPoint) {
    const length = Math.max(1, Math.hypot(p.x-at.x,p.z-at.z));
    return [-3.5,3.5].map(offset => {
      const x=p.x-(p.z-at.z)/length*offset, z=p.z+(p.x-at.x)/length*offset;
      return {x,y:patrolGround(x,z),z};
    });
  }
  function proxyDropClear(p: CombatPlane) {
    const floor=patrolGround(p.x,p.z);
    return clearSpawn(p) && (!environment?.dropColumnClear || environment.dropColumnClear(p,floor)) &&
      [[0,0],[2.6,0],[-2.6,0],[0,2.6],[0,-2.6]].every(([dx,dz]) => {
        const q={x:p.x+dx,z:p.z+dz};
        return clearSpawn(q) && Math.abs(patrolGround(q.x,q.z)-floor)<.45 &&
          !obstacles.some(o => q.x>=o.minX && q.x<=o.maxX && q.z>=o.minZ && q.z<=o.maxZ && (o.maxY??200)>floor+.5 && (o.minY??0)<floor+PARATROOPERS.height+8);
      });
  }
  let proxyFielded: string | undefined;
  function fieldProxyCells() {
    const op = proxies?.current(); if (!op || members.size + 4 > MAX_ARENA_ACTORS) return false;
    // Validate the entire insertion before adding anyone; never leave a partial cell behind.
    const points=PROXY_IDS.flatMap(faction=>proxyCellPoints(op.at,op.entries[faction]));
    if (points.some(p=>!proxyDropClear(p) || [...members.values()].some(m=>m.actor.alive && !m.reserve && Math.hypot(m.actor.x-p.x,m.actor.z-p.z)<2))) return false;
    for (const faction of PROXY_IDS) for (let slot=0;slot<2;slot++) {
      const roleId = faction === 'freedom-force' ? slot ? 'sniper' : 'assault' : slot ? 'assault' : 'tank';
      const role = getArenaRole(roleId)!;
      const at = proxyCellPoints(op.at,op.entries[faction])[slot];
      const entry = addMember(`${op.id}-${faction}-${slot}`, 'Proxy operator', 65, .45, FPS_WEAPONS, false, undefined, role)!;
      entry.role = role; entry.healthMax = 110;
      Object.assign(entry.actor, { bot:true, role:roleId, faction, proxyOperation:op.id });
      spawn(entry, {...at,y:patrolGround(at.x,at.z),yaw:Math.atan2(at.x-op.at.x,at.z-op.at.z)});
      entry.actor.y=at.y+PARATROOPERS.height+1.75; entry.actor.parachuting=true;
      entry.parachute={event:op.id,since:elapsed,floor:at.y};
      entry.actor.health=110; entry.actor.armor=65; entry.actor.rank=3;
      entry.actor.name = faction === 'freedom-force' ? slot ? 'FF Wayfinder' : 'FF Lancer' : slot ? 'CC Conductor' : 'CC Bastion';
      entry.temporary={event:op.id,from:elapsed}; entry.shieldUntil=0;
      entry.mission={x:op.at.x,z:op.at.z}; entry.actor.objective='Parachute insertion';
    }
    proxyFielded=op.id;
    return true;
  }
  /** Continue beyond the landing zone along a clear ground route, rather than vanishing there. */
  function proxyExitPoint(m: InternalActor, op: ProxyOperation) {
    const p=op.entries[m.actor.faction as ProxyId], heading=Math.atan2(p.z-op.at.z,p.x-op.at.x);
    for (const turn of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2]) {
      for (const radius of [90,65,40,20]) {
        const goal={x:p.x+Math.cos(heading+turn)*radius,z:p.z+Math.sin(heading+turn)*radius};
        const steps=Math.ceil(Math.hypot(goal.x-m.actor.x,goal.z-m.actor.z)/1.5);
        if (Array.from({length:steps+1},(_,i)=>({x:m.actor.x+(goal.x-m.actor.x)*i/steps,z:m.actor.z+(goal.z-m.actor.z)*i/steps})).every(q=>clearSpawn(q) && Math.abs(patrolGround(q.x,q.z)-p.y)<.6))
          return {...goal,y:patrolGround(goal.x,goal.z)};
      }
    }
    return {...p};
  }
  /** All players must lose sight of the whole body for a full second before cleanup. */
  function proxyOutOfSight(m: InternalActor) {
    const feet=m.heal?.feet ?? m.actor.y-(m.actor.prone?PRONE_EYE_HEIGHT:1.75);
    const seen=humansAlive().some(h=>{
      const dx=m.actor.x-h.actor.x,dz=m.actor.z-h.actor.z,d=Math.hypot(dx,dz);
      if (d<20) return true;
      // A generous 270-degree view also protects wide screens and peripheral glances.
      if (!h.actor.vehicle && (-Math.sin(h.actor.yaw)*dx-Math.cos(h.actor.yaw)*dz)/d<-.707) return false;
      return [0,.8,1.6].some(height=>lineClear(h.actor,{x:m.actor.x,y:feet+height,z:m.actor.z}));
    });
    if (seen) { m.proxyUnseenSince=undefined; return false; }
    m.proxyUnseenSince??=elapsed;
    return elapsed-m.proxyUnseenSince>=1;
  }
  function proxyAction(id: string, action: ProxyAction) {
    const entry = members.get(id), op = proxies?.current();
    if (!entry || !op || seatOf(vehicles,id)) return false;
    const delivery = action === 'deliver' ? facilities?.sites.find(site => facilityOperational(site, PLAYER_FACTION) &&
      Math.hypot(site.x-entry.actor.x,site.z-entry.actor.z)<=PROXY_RULES.reach && Math.abs(site.y-proxyParticipant(entry).feet)<2 &&
      lineClear(entry.actor,{x:site.x,y:site.y+1,z:site.z})) : undefined;
    if (action === 'deliver' && (!delivery || !facilities || facilities.supplies[PLAYER_FACTION] >= FACILITY_RULES.supplyCap && delivery.health === delivery.maxHealth && delivery.deployIn === 0)) return false;
    if (action !== 'deliver' && !lineClear(entry.actor,{...op.at,y:op.at.y+.7})) return false;
    if (!proxies!.action(id,action,proxyParticipants(),delivery)) return false;
    if (action === 'deliver' && facilities && delivery) {
      const added=Math.min(PROXY_RULES.supplies,FACILITY_RULES.supplyCap-facilities.supplies[PLAYER_FACTION]);
      facilities.supplies[PLAYER_FACTION]+=added; delivery.health=delivery.maxHealth; delivery.deployIn=0;
      op.outcome=`Delivered at ${delivery.name}: +${Math.floor(added)} Armed Forces supplies; equipment repaired and deployment ready.`;
    }
    syncProxyTargets(); announce(op.outcome); return true;
  }
  function stepProxies(dt: number) {
    if (!proxies) return;
    const oldOutcome = proxies.current()?.outcome;
    proxies.step(dt,proxyParticipants(),lineClear);
    let op = proxies.current();
    if (proxyAutomatic && (!op || op.phase === 'complete' && op.cargo!=='carried') && environment!.proxies!.nextIn<=0) startProxyOperation();
    op=proxies.current(); if (!op) return;
    if (proxyFielded!==op.id && (op.phase==='incoming' && op.remaining<=PARATROOPERS.descent || op.phase==='contested')) {
      if (!fieldProxyCells()) { op.cargo='resolved'; proxies.withdraw('Recovery insertion aborted: approach compromised.'); }
      else announce('Freedom Force and Collective Corps canopies sighted. Cells are descending to their marked landing zones.');
    }
    const local = [...members.values()].filter(m => m.actor.proxyOperation===op.id);
    for (const m of local) {
      const faction=m.actor.faction as ProxyId;
      const withdrawing=op.phase==='withdrawing'||op.phase==='complete';
      const hunted = [...members.values()].find(p => !p.actor.bot && p.actor.alive && op.targets[faction].includes(p.actor.id));
      if (withdrawing) m.proxyExit??=proxyExitPoint(m,op);
      const goal = withdrawing ? m.proxyExit! : hunted ? hunted.actor : op.at;
      m.mission={x:goal.x,z:goal.z,y:withdrawing?goal.y+1.75:hunted?goal.y:op.at.y+1.75};
      m.actor.objective=m.parachute?'Parachute insertion':withdrawing?'Withdraw':hunted?'Recover tracked cargo':'Recover prototype';
      if (Math.hypot(m.actor.x-op.at.x,m.actor.z-op.at.z)<25) m.proxyUnseenSince=undefined;
      if (withdrawing && m.actor.alive && !m.parachute && Math.hypot(m.actor.x-op.at.x,m.actor.z-op.at.z)>=25 && proxyOutOfSight(m)) { dismiss(m.actor.id); continue; }
      // Only soldiers who can see a nearby threatened player join this local dispute.
      if (hunted && !withdrawing && Math.hypot(m.actor.x-hunted.actor.x,m.actor.z-hunted.actor.z)<45) {
        for (const ally of members.values()) if (ally.actor.bot && ally.actor.alive && ally.actor.faction===PLAYER_FACTION &&
          Math.hypot(ally.actor.x-hunted.actor.x,ally.actor.z-hunted.actor.z)<18 && lineClear(ally.actor,m.actor)) proxies.target(faction,ally.actor.id);
      }
    }
    syncProxyTargets();
    if (op.outcome && op.outcome!==oldOutcome) announce(op.outcome);
  }
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
    if (kind === 'paratroopers') return dispatchParatroopers('mercenaries', true);
    if (kind === 'transport-sea') return dispatchNavalLanding('mercenaries', true);
    if (kind === 'transport-land' || kind === 'transport-air') return dispatchReinforcements(kind === 'transport-land' ? 'land' : 'air');
    const human = [...members.values()].find(m => !m.actor.bot && m.actor.alive)?.actor;
    const aim = target ?? (human ? { x: human.x, z: human.z } : null);
    if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.z)) return null;
    return startEvent({ kind, seed: Math.floor(random() * 0xffffffff) >>> 0, target: aim, heading, intensity: 1 });
  }
  function setCombatEvents(enabled: boolean) { directorEnabled = !!director && enabled; proxyAutomatic=enabled; }
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
        heat: [...heat.values()], places: validSpawns, tempo, enemyHeat: factionHeat ? Math.max(...factionHeat.snapshot().map(row => row.mercenaries)) : 0 });
      if (directive && !startEvent(directive)) director.refused(directive, elapsed);
    }
    if (environment?.reinforcements) {
      for (const faction of SQUAD_FACTIONS) if (faction === 'mercenaries' || factionHeat) { dispatchNavalLanding(faction); dispatchParatroopers(faction); dispatchReinforcements(undefined, faction); }
    }
    stepParatroopers();
    stepTransports(dt);
    let budget = BLASTS_PER_TICK;
    liveClouds = [];
    for (const event of events) {
      const age = elapsed - event.descriptor.start;
      if (isEliteEvent(event.descriptor.kind) && event.descriptor.ended === undefined && age >= ELITE_SQUAD.warning && !event.resolved.has(-1)) {
        event.resolved.add(-1);
        if (!fieldElite(event)) { endEvent(event, 'withdrawn'); announce('Elite insertion aborted · landing area compromised'); }
      }
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
        if (payload.type === 'insert') { const t = transports.get(event.descriptor.id); if (t && !t.emergency && t.health > 0 && t.driverAlive) disembark(event.descriptor, payload.slot, payload.at); }
        else if (payload.blast) { budget--; blast(landing(payload), payload.blast, undefined, event.name); }
      }
    }
    cool(dt); stepGas(dt); stepCrates(dt); stepRaiders(dt); stepAircrew();
    for (let i = interests.length - 1; i >= 0; i--) if (interests[i].until < elapsed) interests.splice(i, 1);
    // A crew all down silences its event; a crew whose event has run its course pulls out.
    for (const event of events) {
      if (!event.crew) continue;
      const d = event.descriptor, crew = [...members.values()].filter(m => m.temporary?.event === d.id);
      if (d.ended === undefined && !crew.some(m => m.actor.alive)) { endEvent(event, 'silenced'); announce(`${event.crew} silenced`); }
      const presence = combatTimeline(d).find(p => p.type === 'presence');
      if (isEliteEvent(d.kind) && presence && elapsed - d.start > presence.until && d.ended === undefined) {
        endEvent(event, 'withdrawn'); announce(`${event.crew} withdrew`);
      }
      if (presence && elapsed - d.start > presence.until) for (const m of crew) if (m.actor.alive) dismiss(m.actor.id);
    }
    for (let i = events.length - 1; i >= 0; i--) if (combatPhase(events[i].descriptor, elapsed) === 'done') { const id = events[i].descriptor.id; clearTransport(id); raiders.delete(id); events.splice(i, 1); }
    for (const member of members.values()) {
      // A ride whose event is gone (a reset, a cap) will never arrive: wait for the next one.
      if (member.ride && !events.some(e => e.descriptor.id === member.ride!.event)) member.ride = undefined;
      if (member.temporary && !member.actor.proxyOperation && !events.some(e => e.descriptor.id === member.temporary!.event)) dismiss(member.actor.id);
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
    if(mistBetween(merlion?.state,a,b))return true;
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
    return transportRayDistance({ ...r, mode: 'air', visible: true, state: 'inbound' }, origin, ray);
  }
  function hurtRaider(r: Raider, damage: number, attacker?: InternalActor): ArenaShot {
    const event = events.find(e => e.descriptor.id === r.event), before = r.health;
    if (!(damage > 0) || before <= 0 || r.kind === 'gunship' && attacker && !hostile(attacker.actor, { bot: true, faction: event?.descriptor.faction ?? DEFAULT_BOT_FACTION })) return { ...EMPTY_SHOT };
    r.health = Math.max(0, r.health - damage);
    const killed = before > 0 && r.health === 0;
    if (killed) {
      r.state = 'down'; r.aim = null; r.victim = undefined;
      // Shot down outranks breaking off: a raid already heading home that is brought down was downed.
      if (event) { endEvent(event, 'downed'); event.descriptor.outcome = 'downed'; }
      for (const crew of members.values()) if (crew.actor.transport === r.event && crew.actor.alive) hurtActor(crew, crew.actor.health + crew.actor.armor + 1, attacker, 'Helicopter destruction');
      announce(`${attacker?.actor.name ?? 'Fire support'} downed the ${r.kind === 'drone' ? 'drone' : 'raid helicopter'}`, attacker?.actor.id, undefined, attacker ? r.kind : undefined);
    } else if (r.kind === 'gunship' && r.health < r.maxHealth * .25 && event && event.descriptor.ended === undefined) {
      // Badly hit, it breaks off: its path turns for home from wherever it is.
      endEvent(event, 'withdrawn'); announce('Raid helicopter breaking off');
    }
    return { hitId: `raider-${r.event}`, killed, damage: Math.min(before, damage) };
  }
  /** A raider's round: whatever it meets first, a wall, a hull or a body. */
  /** A raider's round: nobody's, so it hits whoever it meets, credited to `cause`. */
  function raiderShot(origin: ArenaPoint, ray: ArenaPoint, damage: number, cause: string, shooter?: InternalActor) {
    // Its strikes look like a GPMG's: its damage is set low for balance, not because it is a small gun.
    send({ shooter, origin, direction: ray, ballistics: muzzleBallistics(RAID.muzzle), damage, cause, calibre: RAID.caliberMm, power: RAID.look }, 150);
  }
  /** One stretch of a shooterless round's flight, including rendered cover. */
  function strayShot(origin: ArenaPoint, ray: ArenaPoint, reach: number, damage: number, cause: string, calibre?: number): ArenaShot & { stopped: boolean } {
    let nearest = Math.min(reach, worldWallDistance(origin, ray, reach));
    const wallStops = nearest < reach;
    let hull: SharedVehicle | undefined, victim: InternalActor | undefined;
    for (const v of vehicles) { const d = vehicleRayDistance(v, origin, ray); if (d < nearest) { nearest = d; hull = v; } }
    for (const member of members.values()) {
      if (!member.actor.alive || member.reserve || seatOf(vehicles, member.actor.id)) continue;
      const d = bodyDistance(origin, ray, member.actor); if (d < nearest) { nearest = d; victim = member; hull = undefined; }
    }
    let transport: Transport | undefined;
    for (const t of transports.values()) { const d = transportRayDistance(t, origin, ray); if (d < nearest) { nearest = d; transport = t; hull = undefined; victim = undefined; } }
    let equipment: FacilityState | undefined;
    for (const candidate of facilities?.sites ?? []) {
      const d = facilityRayDistance(candidate, origin, ray);
      if (d < nearest) { nearest = d; equipment = candidate; transport = undefined; hull = undefined; victim = undefined; }
    }
    if (equipment) { damageFacility(equipment, damage); return { ...EMPTY_SHOT, stopped: true }; }
    if (transport) { hurtTransport(transport, damage, undefined, cause); return { ...EMPTY_SHOT, stopped: true }; }
    if ((hull || victim) && !(damage > 0)) return { ...EMPTY_SHOT, stopped: true };
    if (hull) { damageHull(hull, damage, undefined, cause); return { ...EMPTY_SHOT, stopped: true }; }
    if (victim) return { ...wound(victim, origin, ray, nearest, damage, undefined, cause, origin, calibre), stopped: true };
    return { ...EMPTY_SHOT, stopped: wallStops };
  }
  /** The nearest actor, player or patrol, a raider at `from` can see within `range`. Raiders belong to nobody. */
  function spot(from: ArenaPoint, range: number, ownCrew?: string) {
    return [...members.values()].filter(m => m.actor.alive && !m.reserve && (!ownCrew || m.actor.transport !== ownCrew && hostile(members.get(`${ownCrew}-pilot`)?.actor ?? { bot: true }, m.actor))).filter(m => !seatOf(vehicles, m.actor.id) && distance(from, m.actor) <= range && lineClear(from, chestOf(m.actor)))
      .sort((a, b) => distance(from, a.actor) - distance(from, b.actor))[0] ?? null;
  }
  function stepRaiders(dt: number) {
    for (const [id, r] of raiders) {
      const event = events.find(e => e.descriptor.id === id); if (!event) { raiders.delete(id); continue; }
      if (r.kind === 'gunship' && (r.state === 'landing' || r.state === 'landed')) {
        const ground = groundHeight(r.x, r.z); r.y = Math.max(ground, r.y - AIRCREW.descent * dt);
        if (r.y <= ground + .01) { if (r.state !== 'landed') r.until = elapsed + 15; r.state = 'landed'; evacuateAircrew(id, r); }
        syncAircrew(id, r, true); if (elapsed > r.until) { for (const m of members.values()) if (m.actor.transport === id) dismiss(m.actor.id); raiders.delete(id); }
        continue;
      }
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
    if (age > orbit.gone) { for (const m of members.values()) if (m.actor.transport === r.event) dismiss(m.actor.id); raiders.delete(d.id); return; }
    syncAircrew(r.event, r, pose.visible);
    r.state = age < orbit.arrive ? 'inbound' : age <= orbit.leave ? 'orbit' : 'leaving';
    if (r.ammo === 0 && d.ended === undefined) endEvent(event, 'withdrawn');
    if (r.state !== 'orbit' || age < RAID.warning || r.ammo === 0) { r.aim = null; r.victim = undefined; return; }
    const gun = helicopterGunPoint(r);
    if (!r.victim) {
      if (elapsed < r.next) { r.aim = null; return; }
      const sighted = spot(gun, RAID.sight, r.event);
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
      if (!(r.ammo! > 0)) break;
      r.ammo!--; r.shots++;
      // The walk-in rounds are real tracers but harmless: they warn, the burst after them kills.
      const line = helicopterGunRay(r, r.aim).direction, spread = RAID.spread;
      const ray = { x: line.x + (random() - .5) * spread, y: line.y + (random() - .5) * spread, z: line.z + (random() - .5) * spread }, norm = Math.hypot(ray.x, ray.y, ray.z);
      raiderShot(gun, { x: ray.x / norm, y: ray.y / norm, z: ray.z / norm }, t < RAID.walkIn ? 0 : RAID.round, event.name, members.get(`${r.event}-pilot`));
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
  const savedClocks = validReinforcementClocks(environment?.savedReinforcementClocks) ? environment!.savedReinforcementClocks : undefined;
  const reserveAt: Record<SquadFaction, number> = { mercenaries: savedClocks?.external.mercenaries ?? FACILITY_RULES.reserveSeconds, 'armed-forces': savedClocks?.external['armed-forces'] ?? FACILITY_RULES.reserveSeconds };
  const airborneAt: Record<SquadFaction, number> = { mercenaries: savedClocks?.airborne?.mercenaries ?? PARATROOPERS.interval, 'armed-forces': savedClocks?.airborne?.['armed-forces'] ?? PARATROOPERS.interval };
  const airborneMissions = new Map<string, { points: CombatPlane[] }>();
  const navalAt: Record<SquadFaction, number> = { mercenaries: savedClocks?.naval.mercenaries ?? NAVAL.interval, 'armed-forces': savedClocks?.naval['armed-forces'] ?? NAVAL.interval };
  function deploymentPoints(site: FacilitySite) {
    return Array.from({ length: environment?.battlefield ? 36 : 12 }, (_, i) => ({ x: site.deployment.x + Math.sin(i * Math.PI / 6) * (3.6 + Math.floor(i/12)*3.6), z: site.deployment.z + Math.cos(i * Math.PI / 6) * (3.6 + Math.floor(i/12)*3.6) }));
  }
  function respawnChoice(id: string) {
    let choice = respawnChoices.get(id);
    if (!choice) { choice = { selected: null, automatic: false }; respawnChoices.set(id, choice); }
    return choice;
  }
  function respawnPoint(entry: InternalActor, site: FacilityState, hostileDistance = 16) {
    if (!facilityOperational(site, entry.actor.faction)) return undefined;
    return deploymentPoints(site).find(p => clearSpawn(p) && [...members.values()].every(m =>
      m === entry || !m.actor.alive || m.reserve || m.actor.transport || Math.abs(floorAt(m.actor) - site.y) >= 2 ||
      Math.hypot(m.actor.x - p.x, m.actor.z - p.z) > (m.actor.faction === entry.actor.faction ? 1.5 : hostileDistance)));
  }
  function defaultRespawnPoint(entry: InternalActor) {
    const home = environment?.defaultPlayerSpawn ?? environment?.playerSpawn;
    if (!home || entry.actor.faction !== PLAYER_FACTION) return undefined;
    const candidates = [home, ...Array.from({ length: 36 }, (_, i) => ({
      x: home.x + Math.sin(i * Math.PI / 6) * (3.6 + Math.floor(i / 12) * 3.6),
      z: home.z + Math.cos(i * Math.PI / 6) * (3.6 + Math.floor(i / 12) * 3.6),
    }))];
    const point = candidates.find(p => clearSpawn(p) && (!swimmer?.isWater(p.x, p.z) || patrolGround(p.x, p.z) > .35) && [...members.values()].every(m =>
      m === entry || !m.actor.alive || m.reserve || m.actor.transport || Math.abs(floorAt(m.actor) - patrolGround(p.x, p.z)) >= 2 ||
      Math.hypot(m.actor.x - p.x, m.actor.z - p.z) > (m.actor.faction === entry.actor.faction ? 1.5 : 16)));
    return point ? { x: point.x, z: point.z, y: patrolGround(point.x, point.z), yaw: home.yaw ?? 0 } : undefined;
  }
  function playerRespawn(id: string): PlayerRespawnView | null {
    const entry = members.get(id);
    if (!facilities || !entry || entry.actor.bot) return null;
    const choice = respawnChoice(id);
    const zones = facilities.sites.filter(s => s.kind !== 'supply').map(site => {
      const available = !!respawnPoint(entry, site);
      return { id: site.id, name: site.name, x: site.deployment.x, y: site.y, z: site.deployment.z, available,
        reason: site.owner !== entry.actor.faction ? site.owner ? 'Enemy controlled' : 'Capture and build to deploy' :
          !site.health ? 'Equipment destroyed' : site.suppressed ? 'Deployment suppressed' : available ? '' : 'Landing zone blocked or unsafe' };
    });
    const home = environment?.defaultPlayerSpawn ?? environment?.playerSpawn;
    if (home && entry.actor.faction === PLAYER_FACTION) {
      const available = !!defaultRespawnPoint(entry);
      zones.push({ id: DEFAULT_RESPAWN_ZONE, name: 'Default spawn', x: home.x, y: patrolGround(home.x, home.z), z: home.z,
        available, reason: available ? '' : 'Default spawn blocked or unsafe' });
    }
    if (!zones.some(z => z.id === choice.selected && z.available)) choice.selected = null;
    return { zones, ...choice };
  }
  /** Allied structures and this side's designated entry are authority-owned. */
  function playerDeployments(id: string): DeploymentPoint[] {
    const entry = members.get(id);
    if (!entry || entry.actor.bot) return [];
    const authored = environment?.deployments ?? [];
    if (!facilities) return authored.map(p => ({ ...p, available: clearSpawn(p) }));
    const sites = facilities.sites;
    const defaults = environment?.playerSpawn;
    const points = authored.map(p => {
      const designated = !!defaults && p.id === 'entry' && Math.hypot(p.x - defaults.x, p.z - defaults.z) < .1;
      const allied = sites.some(site => site.kind !== 'supply' && facilityOperational(site, entry.actor.faction) && Math.hypot(p.x - site.deployment.x, p.z - site.deployment.z) <= FACILITY_RULES.presenceRadius);
      const available = (designated || allied) && clearSpawn(p) && [...members.values()].every(m =>
        m === entry || !m.actor.alive || m.reserve || m.actor.transport || Math.hypot(m.actor.x - p.x, m.actor.z - p.z) >= (m.actor.faction === entry.actor.faction ? 1.5 : 30));
      return { ...p, available, reason: available ? '' : designated || allied ? 'Landing zone blocked or unsafe' : 'Outside allied deployment zones' };
    });
    const zones = playerRespawn(id)!.zones;
    for (const site of sites.filter(s => s.kind !== 'supply')) {
      const zone = zones.find(z => z.id === site.id)!;
      const point = respawnPoint(entry, site, 30);
      points.push({ id: `facility:${site.id}`, name: site.name, x: point?.x ?? zone.x, y: site.y, z: point?.z ?? zone.z,
        yaw: site.deployment.yaw, pitch: 0, available: zone.available && !!point, reason: zone.available && !point ? 'Landing zone blocked or unsafe' : zone.reason });
    }
    return points;
  }
  function choosePlayerRespawn(id: string, zone: string) {
    const entry = members.get(id), view = playerRespawn(id);
    if (!entry || entry.actor.alive || finished || !view?.zones.some(z => z.id === zone && z.available)) return false;
    respawnChoice(id).selected = zone; return true;
  }
  function setPlayerAutoRespawn(id: string, automatic: boolean) {
    if (!playerRespawn(id) || finished || typeof automatic !== 'boolean') return false;
    respawnChoice(id).automatic = automatic; return true;
  }
  function respawnPlayer(entry: InternalActor) {
    const view = playerRespawn(entry.actor.id);
    if (!view) return;
    const available = view.zones.filter(z => z.available);
    const structures = available.filter(z => z.id !== DEFAULT_RESPAWN_ZONE);
    const automaticZones = structures.length ? structures : available;
    const safety = (zone: { x: number; z: number }) => Math.min(1000, ...[...members.values()]
      .filter(m => m.actor.alive && hostile(entry.actor, m.actor)).map(m => Math.hypot(m.actor.x - zone.x, m.actor.z - zone.z)));
    const selected = available.find(z => z.id === view.selected) ?? (view.automatic ? automaticZones.sort((a, b) => safety(b) - safety(a))[0] : undefined);
    if (selected?.id === DEFAULT_RESPAWN_ZONE) {
      const point = defaultRespawnPoint(entry);
      if (point) spawn(entry, point);
      return;
    }
    const site = selected && facilities?.sites.find(s => s.id === selected.id);
    const point = site && respawnPoint(entry, site);
    if (site && point) spawn(entry, { ...point, y: site.y, yaw: site.deployment.yaw });
  }
  function damageFacility(site: FacilityState, damage: number, side?: string) {
    const taken = facilities?.damage(site.id, damage, side) ?? 0;
    if (taken && site.health === 0) announce(`${site.name}: equipment destroyed. Deployment offline.`);
    return taken;
  }
  function facilityAction(id: string, site: string) {
    const actor = members.get(id);
    if (!facilities || !actor?.actor.alive || !actor.playing || finished || seatOf(vehicles, id)) return false;
    facilities.step(0, facilityPresence(), (a, b) => clearBlast(a, b, distance(a, b)));
    return facilities.request(site, id);
  }
  function facilityPresence() {
    return [...members.values()].filter(m => !m.reserve && !m.temporary && !m.parachute).map(m => ({ ...m.actor, playing: m.playing, feet: floorAt(m.actor) }));
  }
  function stepFacilities(dt: number) {
    if (!facilities) return;
    const before = new Map(facilities.sites.map(s => [s.id, { owner: s.owner, health: s.health, action: s.action?.kind }]));
    facilities.step(dt, facilityPresence(), (a, b) => clearBlast(a, b, distance(a, b)));
    for (const site of facilities.sites) {
      const old = before.get(site.id)!;
      if (site.owner !== old.owner || old.action && !site.action && site.health > old.health)
        announce(`${site.name}: ${getArenaFaction(site.owner ?? '')?.short ?? 'Neutral'} ${old.action === 'repair' ? 'repaired equipment' : 'secured the facility'}.`);
      if (site.kind !== 'command' || !facilityOperational(site) || site.deployIn > 0 || !site.owner) continue;
      const faction = site.owner;
      const all = [...members.values()], mine = all.filter(m => m.actor.bot && !m.temporary && m.actor.faction === faction);
      const waiting = mine.filter(m => !m.actor.alive && !m.ride && m.actor.respawnIn === 0);
      const room = Math.max(0, Math.min(population(faction) - mine.length, regularLimit - all.filter(m => m.actor.bot && !m.temporary).length));
      let deployed = 0, recruited = 0;
      for (const point of deploymentPoints(site)) {
        if (deployed >= 4 || !clearSpawn(point) || [...members.values()].some(m => m.actor.alive && Math.hypot(m.actor.x - point.x, m.actor.z - point.z) < (m.actor.faction === faction ? 1.5 : 16))) continue;
        const member = waiting.shift();
        if (!member && recruited >= room) break;
        if (!facilities.spend(faction, FACILITY_RULES.infantryCost)) break;
        const soldier = member ?? enlist(true, faction); if (!member) recruited++;
        spawn(soldier,{...point,y:groundHeight(point.x,point.z),yaw:site.deployment.yaw});
        soldier.home = factionHeat?.sectorAt(point.x, point.z)?.id; deployed++;
      }
      if (deployed) { site.deployIn = FACILITY_RULES.waveSeconds; announce(`${site.name}: ${deployed} reinforcements deployed.`); }
    }
  }
  let squadThink = 0;
  const squadObjectives = new Map<string, string>();
  const squadApproaches = new Map<string, { site: string; via?: ArenaPoint; until: number }>();
  let approachSerial = 0;
  function stepSquads(dt: number) {
    if ((!facilities && !sectorPatrols?.areas.length) || (squadThink -= dt) > 0) return;
    const sites=facilities?.sites??[];
    squadThink = 2;
    const groups = new Map<string, InternalActor[]>();
    for (const entry of members.values()) if (entry.actor.squad && entry.actor.alive && !entry.reserve && !entry.temporary) {
      const group = groups.get(entry.actor.squad) ?? []; group.push(entry); groups.set(entry.actor.squad, group);
    }
    const teams=[...groups].map(([id,group]) => ({ id, faction:group[0].actor.faction as SquadFaction,
      x:group.reduce((n,m)=>n+m.actor.x,0)/group.length,z:group.reduce((n,m)=>n+m.actor.z,0)/group.length,
      members:group.length,previous:squadObjectives.get(id),available:group.every(m=>!m.actor.vehicle&&!m.actor.transport&&!m.parachute&&(!m.order||m.order.until<=elapsed)) }));
    const director=sectorPatrols?.areas.length?sectorPatrols:undefined;
    director?.observe([...members.values()].filter(m=>m.actor.alive&&!m.reserve&&!m.actor.vehicle&&!m.actor.transport&&!m.parachute).map(m=>m.actor),elapsed);
    const duties=director?.allocate(teams,sites,elapsed);
    const assignments = assignBattlefieldFronts(teams.filter(t=>!duties?.has(t.id)), sites, {rearGuard:!director});
    const patrollers:InternalActor[]=[];
    const setDuty=(entry:InternalActor,duty:BattlefieldDuty,sector?:string)=>{
      const before=entry.actor.duty==='investigate'?'patrol':entry.actor.duty,after=duty==='investigate'?'patrol':duty;
      if(entry.actor.patrolSector!==sector || before!==after) {
        entry.investigation=undefined;entry.navigation=undefined;entry.assignment=undefined;
      }
      entry.actor.duty=duty;
      if(sector)entry.actor.patrolSector=sector;else delete entry.actor.patrolSector;
    };
    const postSlot=(entry:InternalActor,site:FacilityState,radius:number,angle:number)=>{
      const slot=Array.from({length:12},(_,i)=>({x:site.x+Math.sin(angle+i*Math.PI/6)*radius,z:site.z+Math.cos(angle+i*Math.PI/6)*radius})).find(clearSpawn);
      entry.mission=slot?{...slot,y:patrolGround(slot.x,slot.z)+1.75}:undefined;
    };
    if(director&&duties) {
      for(const [id,group] of groups) {
        const duty=duties.get(id);if(!duty)continue;
        const home=sites.find(s=>s.id===duty.homeCamp);
        const sentries=duty.kind==='camp-defense'?Math.min(2,Math.max(1,Math.floor(group.length/2))):0;
        if(sentries&&home)squadObjectives.set(id,home.id);else squadObjectives.delete(id);
        group.forEach((entry,i)=>{
          entry.assignment=undefined;entry.guardPatrol=undefined;
          if(i<sentries&&home) {
            setDuty(entry,'sentry');entry.actor.objective=home.id;
            const working=facilityActionFor(home,entry.actor.faction)!==null;
            postSlot(entry,home,working&&i===0?2.6:8+i*4,i*Math.PI+(working||home.contested?0:Math.floor(elapsed/35)*Math.PI/2));
            if(i===0)facilities?.request(home.id,entry.actor.id);
          } else {setDuty(entry,entry.actor.duty==='respond'?'respond':'patrol',duty.sector);delete entry.actor.objective;patrollers.push(entry);}
        });
      }
      const responders=new Map<string,FacilityState>();
      for(const faction of ['mercenaries','armed-forces'] as const) {
        const side=patrollers.filter(m=>m.actor.faction===faction),limit=Math.min(2,Math.floor(side.length/2));
        for(const site of sites.filter(s=>s.kind==='command'&&s.owner===faction&&(s.contested||s.health<s.maxHealth))) {
          for(const member of side.filter(m=>!responders.has(m.actor.id)&&distance(m.actor,{...site,y:site.y+1.75})<SECTOR_PATROL.respondRadius)
            .sort((a,b)=>Math.hypot(a.actor.x-site.x,a.actor.z-site.z)-Math.hypot(b.actor.x-site.x,b.actor.z-site.z))) {
            if(side.filter(m=>responders.has(m.actor.id)).length>=limit)break;
            responders.set(member.actor.id,site);
          }
        }
      }
      const covering=new Set<string>();
      for(const entry of patrollers) {
        const site=responders.get(entry.actor.id);
        if(site) {
          setDuty(entry,'respond',entry.actor.patrolSector);entry.investigation=undefined;entry.actor.objective=site.id;
          const ids=[...responders].filter(([,s])=>s.id===site.id).map(([id])=>id),index=ids.indexOf(entry.actor.id);
          const worker=facilityActionFor(site,entry.actor.faction)!==null&&(site.action?site.action.by===entry.actor.id:index===0);
          postSlot(entry,site,worker?2.6:10+index*2,index*Math.PI);facilities?.request(site.id,entry.actor.id);
        } else {
          setDuty(entry,'patrol',entry.actor.patrolSector);
          const point=director.goal({id:entry.actor.id,faction:entry.actor.faction as SquadFaction,sector:entry.actor.patrolSector!,x:entry.actor.x,z:entry.actor.z},elapsed);
          entry.mission=point?{...point,y:patrolGround(point.x,point.z)+1.75}:undefined;
          covering.add(entry.actor.id);
        }
      }
      director.sync(covering);
    }
    for (const [id, group] of groups) {
      if(duties?.has(id))continue;
      const site=sites.find(s=>s.id===assignments.get(id)); if (!site) continue;
      squadObjectives.set(id,site.id);
      const leader=group.find(m=>m.actor.id===site.action?.by && (!m.order || m.order.until<=elapsed)) ?? group.find(m=>!m.order || m.order.until<=elapsed) ?? group[0];
      const working = facilityActionFor(site, leader.actor.faction) !== null;
      let approach = squadApproaches.get(id);
      if (!approach || approach.site !== site.id) {
        const center = { x: group.reduce((n,m)=>n+m.actor.x,0)/group.length, z: group.reduce((n,m)=>n+m.actor.z,0)/group.length };
        const point = working && Math.abs(site.y-(bounds.groundHeight?.(site.x,site.z)??0))<.35 ? objectiveApproach(center, site, navigationAnchors, (approachSerial++ % 3) - 1, clearSpawn,
          [...squadApproaches.values()].flatMap(a=>a.via && a.until>elapsed?[a.via]:[])) : undefined;
        approach = { site: site.id, via: point ? {...point,y:patrolGround(point.x,point.z)+1.75} : undefined,
          until: elapsed + (point ? Math.hypot(center.x-point.x,center.z-point.z) / 2 + 20 : 0) };
        squadApproaches.set(id, approach);
      }
      group.forEach((entry,i)=> {
        if(director)setDuty(entry,'attack');
        entry.actor.objective=site.id;
        if (entry.assignment?.site !== site.id) { entry.assignment = {...approach}; entry.navigation=undefined; }
        const patrolling = site.kind==='command' && !working && !site.contested && (!entry.order || entry.order.until<=elapsed);
        const stops = patrolling ? site.camp?.patrol ?? commandPatrolStops(site,(x,z)=>clearSpawn({x,z}),patrolGround) : [];
        const patrol = patrolling ? guardPatrolGoal(entry.guardPatrol,site.id,stops,entry.actor,elapsed,i) : undefined;
        if(patrol) {
          entry.guardPatrol=patrol.state;
          entry.assignment.via=undefined;
          entry.mission={...patrol.goal,y:patrol.goal.y+1.75};
          return;
        }
        entry.guardPatrol=undefined;
        // One worker operates the cabinet; the rest cover a broad perimeter.
        // Quiet friendly posts rotate their patrol instead of camping the slot.
        const worker = working && entry === leader;
        const covering = working || site.contested;
        const radius = worker ? 2.6 : covering ? 8 + i * 2 : 14 + i * 3;
        const angle=i*Math.PI/2 + (covering ? 0 : Math.floor(elapsed/22)*Math.PI/2);
        const point={x:site.x+Math.sin(angle)*radius,z:site.z+Math.cos(angle)*radius};
        // Capture slots must be reachable at the objective's actual terrain height.
        const fallback=[radius,2.6].flatMap(r=>Array.from({length:12},(_,j)=>({x:site.x+Math.sin(angle+j*Math.PI/6)*r,z:site.z+Math.cos(angle+j*Math.PI/6)*r}))).find(p=>clearSitePoint(p,site));
        const slot=clearSitePoint(point,site)?point:fallback;
        entry.mission=slot?{...slot,y:(Math.abs(site.y-(bounds.groundHeight?.(site.x,site.z)??0))<.35?patrolGround(slot.x,slot.z):site.y)+1.75}:undefined;
      });
      if (!leader.order || leader.order.until<=elapsed) facilities?.request(site.id,leader.actor.id);
    }
  }
  /** Battlefield rosters stay fixed; heat still controls kit, events and reserve timing. */
  const population = (faction: SquadFaction) => environment?.battlefield ? BATTLEFIELD_POPULATIONS[environment.battlefield.size][faction]
    : factionHeat ? clamp(factionHeat.troops(faction), faction === 'mercenaries' ? count : 0, regularLimit)
    : faction === 'mercenaries' ? fixedPopulation : 0;

  /**
   * Books a transport for one side's bots waiting on one, at most one ride per
   * side on the road at a time, and fills its empty seats with recruits while
   * that side is below its headcount. With heat, the ride heads for the sector
   * that most needs troops. `force` sends one now, by road or air, waiting or not.
   */
  function dispatchReinforcements(force?: 'land' | 'air', faction: SquadFaction = 'mercenaries') {
    if ((environment?.navalSites?.length || environment?.paratroopers) && (elapsed < reserveAt[faction] || externalTransportActive(faction))) return null;
    // Posts and transports share the regular roster. Owning a working post must
    // not disable road/air arrivals; the external reserve clock bounds their rate.
    if (facilities && elapsed < reserveAt[faction]) return null;
    const mine = (m: InternalActor) => m.actor.bot && !m.temporary && m.actor.faction === faction, all = [...members.values()];
    const waiting = all.filter(m => mine(m) && !m.actor.alive && m.waiting !== undefined && !m.ride).sort((a, b) => a.waiting! - b.waiting!);
    const room = Math.max(0, Math.min(population(faction) - all.filter(mine).length, regularLimit - all.filter(m => m.actor.bot && !m.temporary).length));
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
    const hasPost = facilities?.sites.some(s => s.kind === 'command' && facilityOperational(s, faction));
    const reserveDrops = facilities && !hasPost ? [...validSpawns].sort((a, b) => Math.min(a.x - bounds.minX, bounds.maxX - a.x, a.z - bounds.minZ, bounds.maxZ - a.z) - Math.min(b.x - bounds.minX, bounds.maxX - b.x, b.z - bounds.minZ, bounds.maxZ - b.z)).slice(0, 6) : validSpawns;
    const plan = ((!facilities || hasPost) && local.length ? planTransport({ ...view, drops: local }, random, force) : null) ?? planTransport({ ...view, drops: reserveDrops }, random, force);
    const seats = plan ? REINFORCEMENT_SEATS[plan.kind === 'transport-land' ? 'land' : 'air'] : 0;
    const troops = waiting.slice(0, seats), recruits = Math.min(room, seats - troops.length, Math.max(0, MAX_ARENA_ACTORS - members.size - 1));
    const descriptor = plan && startEvent({ ...plan, seed: Math.floor(random() * 0xffffffff) >>> 0, intensity: 1, troops: Math.max(1, troops.length + recruits), ...(faction === PLAYER_FACTION ? { faction } : {}) });
    if (!descriptor) { state.next = elapsed + 5; return null; }
    for (let i = 0; i < recruits; i++) troops.push(enlist(true, faction));
    const home = factionHeat?.sectorAt(descriptor.target.x, descriptor.target.z)?.id;
    troops.forEach((member, slot) => { member.ride = { event: descriptor.id, slot }; if (home) member.home = home; });
    transports.get(descriptor.id)!.passengers = troops.length;
    state.last = elapsed;
    if (facilities || environment?.navalSites?.length || environment?.paratroopers) reserveAt[faction] = elapsed + FACILITY_RULES.reserveSeconds;
    return descriptor;
  }
  function externalTransportActive(faction: SquadFaction) {
    return events.some(e => e.descriptor.kind === 'paratroopers' && (e.descriptor.faction ?? 'mercenaries') === faction && airborneMissions.has(e.descriptor.id)) || [...transports.values()].some(t => transportFaction(t) === faction && t.state !== 'departed' && t.health > 0);
  }
  /** Dry, ground-level support and a full canopy-sized open descent column. */
  function clearDrop(p: CombatPlane) {
    if (!clearSpawn(p)) return false;
    const floor = traversal?.supportHeight(p.x, p.z, (bounds.groundHeight?.(p.x,p.z)??0)+.6, .4, 1.8) ?? 0;
    if (environment?.dropColumnClear && !environment.dropColumnClear(p, floor)) return false;
    if (Math.abs(floor) > .45 || traversal && !traversal.canOccupy(p.x, floor, p.z, .5, 1.8)) return false;
    for (const [dx, dz] of [[0, 0], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]]) {
      if (!clearSpawn({ x: p.x + dx, z: p.z + dz }) || Math.abs(groundHeight(p.x + dx, p.z + dz) - floor) > .45) return false;
    }
    return true;
  }
  function dispatchParatroopers(faction: SquadFaction, force = false) {
    if (!environment?.paratroopers || !environment.reinforcements || externalTransportActive(faction) ||
      !force && (elapsed < airborneAt[faction] || elapsed < reserveAt[faction])) return null;
    const all = [...members.values()], mine = all.filter(m => m.actor.bot && !m.temporary && m.actor.faction === faction);
    const waiting = mine.filter(m => !m.actor.alive && m.actor.respawnIn === 0 && m.waiting !== undefined && !m.ride).sort((a, b) => a.waiting! - b.waiting!);
    const room = Math.max(0, Math.min(population(faction) - mine.length, regularLimit - all.filter(m => m.actor.bot && !m.temporary).length, MAX_ARENA_ACTORS - members.size));
    const count = Math.min(PARATROOPERS.seats, waiting.length + room);
    if (!count) return null;
    const protectedPoints = [...(environment.playerSpawn ? [environment.playerSpawn] : []), ...(environment.deployments ?? [])];
    const target = planParatroopers(validSpawns, all.filter(m => !m.actor.bot && m.actor.alive).map(m => m.actor), protectedPoints,
      p => clearDrop(p) && ![...airborneMissions.values()].some(mission => mission.points.some(at => Math.hypot(at.x - p.x, at.z - p.z) < 9)) && !all.some(m => m.actor.alive && !m.reserve && Math.hypot(m.actor.x - p.x, m.actor.z - p.z) < 2));
    if (!target) { if (!force) airborneAt[faction] = elapsed + PARATROOPERS.retry; return null; }
    const descriptor = startEvent({ kind: 'paratroopers', seed: Math.floor(random() * 0xffffffff) >>> 0, target, heading: 0, intensity: 1, troops: count, faction });
    if (!descriptor) return null;
    const troops = waiting.slice(0, count);
    while (troops.length < count) troops.push(enlist(true, faction));
    troops.forEach((m, slot) => { m.ride = { event: descriptor.id, slot }; });
    airborneMissions.set(descriptor.id, { points: dropPoints(target) });
    airborneAt[faction] = elapsed + PARATROOPERS.interval; reserveAt[faction] = elapsed + PARATROOPERS.externalGap;
    announce(`${getArenaFaction(faction)?.short ?? faction}: paratroopers inbound · ${troops.length} troops · drop in ${PARATROOPERS.warning}s`);
    return descriptor;
  }
  function stepParatroopers() {
    for (const [id, mission] of airborneMissions) {
      const event = events.find(e => e.descriptor.id === id)?.descriptor;
      if (!event) { airborneMissions.delete(id); continue; }
      for (const m of members.values()) {
        if (m.ride?.event !== id) continue;
        const slot = m.ride.slot, p = mission.points[slot];
        if (elapsed < event.start + PARATROOPERS.warning + slot * PARATROOPERS.spacing) continue;
        if (!clearDrop(p)) { m.ride = undefined; m.waiting = elapsed; continue; }
        const floor = traversal?.supportHeight(p.x, p.z, (bounds.groundHeight?.(p.x,p.z)??0)+.6, .4, 1.8) ?? 0;
        spawn(m); m.shieldUntil = 0;
        Object.assign(m.actor, p, { y: floor + PARATROOPERS.height + 1.75, parachuting: true });
        m.parachute = { event: id, since: elapsed, floor };
      }
      if (![...members.values()].some(m => m.ride?.event === id || m.actor.alive && m.parachute?.event === id)) airborneMissions.delete(id);
    }
  }
  function stepParachute(m: InternalActor) {
    const drop = m.parachute!, k = Math.min(1, (elapsed - drop.since) / PARATROOPERS.descent);
    m.actor.y = drop.floor + PARATROOPERS.height * (1 - k) + 1.75;
    if (k < 1) return;
    m.parachute = undefined; delete m.actor.parachuting;
    if (!(m.actor.proxyOperation ? proxyDropClear(m.actor) : clearDrop(m.actor)) || [...members.values()].some(other => other !== m && other.actor.alive && !other.reserve && Math.abs(other.actor.y - m.actor.y) < 2 && Math.hypot(other.actor.x - m.actor.x, other.actor.z - m.actor.z) < 1)) {
      hurtActor(m, 1000, undefined, 'Blocked parachute landing', m.actor, true, true); return;
    }
    reportIn(m, 0, 1);
  }
  function dispatchNavalLanding(faction: SquadFaction, force = false) {
    const sites = environment?.navalSites;
    if (!environment || !sites?.length || !environment.reinforcements || !force && (elapsed < navalAt[faction] || elapsed < reserveAt[faction]) || externalTransportActive(faction)) return null;
    const all = [...members.values()], mine = all.filter(m => m.actor.bot && !m.temporary && m.actor.faction === faction);
    const waiting = mine.filter(m => !m.actor.alive && m.actor.respawnIn === 0 && m.waiting !== undefined && !m.ride).sort((a, b) => a.waiting! - b.waiting!);
    const room = Math.max(0, Math.min(population(faction) - mine.length, regularLimit - all.filter(m => m.actor.bot && !m.temporary).length, MAX_ARENA_ACTORS - members.size - 1));
    const count = Math.min(NAVAL.seats, waiting.length + room);
    if (!count) return null;
    const humans = all.filter(m => !m.actor.bot && m.actor.alive).map(m => m.actor);
    const busy = new Set([...transports.values()].filter(t => t.sea && t.state !== 'departed').map(t => t.sea!.site.id));
    const protectedPoints = [...(environment.playerSpawn ? [environment.playerSpawn] : []), ...(environment.deployments ?? [])];
    const clearDry = (p: CombatPlane) => clearSpawn(p) && !all.some(m => m.actor.alive && !m.reserve && !m.actor.transport && Math.hypot(m.actor.x - p.x, m.actor.z - p.z) < 1.2);
    const site = planNavalLanding(sites, faction, humans, busy, clearDry, protectedPoints);
    if (!site) { if (!force) navalAt[faction] = elapsed + NAVAL.retry; return null; }
    const descriptor = startEvent({ kind: 'transport-sea', seed: Math.floor(random() * 0xffffffff) >>> 0, target: site.berth, heading: 0, intensity: 1,
      troops: count, faction, landing: site.id, origin: site.entry, altitude: site.waterY });
    if (!descriptor) { if (!force) navalAt[faction] = elapsed + NAVAL.retry; return null; }
    const troops = waiting.slice(0, count);
    while (troops.length < count) troops.push(enlist(true, faction));
    troops.forEach((m, slot) => { m.ride = { event: descriptor.id, slot }; });
    transports.get(descriptor.id)!.passengers = troops.length;
    navalAt[faction] = elapsed + NAVAL.interval; reserveAt[faction] = elapsed + NAVAL.externalGap;
    announce(`${getArenaFaction(faction)?.short ?? faction}: landing craft inbound · ${site.name} · ${troops.length} troops · ETA ${NAVAL.approach + NAVAL.rampSeconds}s`);
    return descriptor;
  }
  function releaseSeaPassengers(t: Transport) {
    for (const m of transportPassengers(t)) { m.ride = undefined; m.waiting = elapsed; }
    t.passengers = 0;
  }
  function stepSeaTransport(t: Transport, d: CombatEventDescriptor, age: number) {
    const sea = t.sea!, site = sea.site;
    if (t.health <= 0) { t.ramp = 0; return; }
    const atBeach = Math.hypot(t.x - site.berth.x, t.z - site.berth.z) < .2;
    if (t.emergency && !atBeach) {
      // No safe emergency exit offshore. The surviving manifest withdraws to reserve after a bounded wait.
      if (age >= t.payload.leave) { releaseSeaPassengers(t); t.visible = false; t.state = 'departed'; }
      return;
    }
    if (sea.departing !== undefined) {
      const k = Math.min(1, (age - sea.departing) / NAVAL.exitSeconds);
      t.ramp = Math.max(0, 1 - k * 6); t.x = site.berth.x + (site.entry.x - site.berth.x) * k * k;
      t.z = site.berth.z + (site.entry.z - site.berth.z) * k * k; t.state = k >= 1 ? 'departed' : 'leaving'; t.visible = k < 1;
      if (k >= 1) releaseSeaPassengers(t);
      return;
    }
    if (age < NAVAL.approach) {
      const pose = transportPose(t.payload, age); Object.assign(t, { x: pose.x, z: pose.z, yaw: pose.yaw, y: site.waterY, visible: pose.visible, state: 'inbound' }); return;
    }
    t.x = site.berth.x; t.z = site.berth.z; t.y = site.waterY; t.visible = true;
    t.ramp = Math.min(1, (age - NAVAL.approach) / NAVAL.rampSeconds);
    if (!t.emergency) t.state = t.ramp < 1 ? 'ramping' : 'unloading';
    const passengers = transportPassengers(t); t.passengers = passengers.length;
    if (t.ramp < 1 || elapsed < t.nextExit) return;
    if (passengers.length && age < t.payload.depart) {
      const clear = clearSpawn(site.ramp.to) && ![...members.values()].some(m => m.actor.alive && !m.reserve && !m.actor.transport &&
        Math.abs(m.actor.x - site.ramp.to.x) < 1.2 && m.actor.z >= site.ramp.to.z - 1.2 && m.actor.z <= site.ramp.from.z + 1.2);
      if (!clear) { sea.blocked ??= age; if (age - sea.blocked < NAVAL.hold) return; }
      else {
        sea.blocked = undefined;
        const m = passengers[0], slot = m.ride!.slot;
        spawn(m); m.shieldUntil = 0;
        const point = navalRampPoint(site, 0); Object.assign(m.actor, point, { y: point.y + 1.75, ground: point.y, yaw: 0 });
        m.navalTransit = { site, event: t.event, since: elapsed }; m.evacuating = { ...site.rally, until: elapsed + 12 };
        m.home = factionHeat?.sectorAt(site.rally.x, site.rally.z)?.id;
        reportIn(m, slot, d.troops ?? 1); t.passengers = transportPassengers(t).length; t.nextExit = elapsed + 1; return;
      }
    }
    // Let the last soldier finish crossing before raising the ramp.
    if ([...members.values()].some(m => m.actor.alive && m.navalTransit?.event === t.event)) return;
    releaseSeaPassengers(t);
    if (t.driverAlive) { sea.departing = age; t.state = 'leaving'; }
    else if (age >= t.payload.leave) { t.visible = false; t.state = 'departed'; }
  }
  function stepNavalTransit(entry: InternalActor) {
    const transit = entry.navalTransit!;
    const t = transports.get(transit.event), progress = Math.min(1, (elapsed - transit.since) / .95);
    if (!t || t.health <= 0) {
      if (entry.actor.z > transit.site.water.minZ - .5) hurtActor(entry, entry.actor.health + entry.actor.armor + 1, undefined, 'Landing craft destruction');
      delete entry.actor.ground; entry.navalTransit = undefined; return;
    }
    const point = navalRampPoint(transit.site, progress);
    Object.assign(entry.actor, point, { y: point.y + 1.75, ground: point.y, yaw: 0 });
    if (progress >= 1) { entry.navalTransit = undefined; delete entry.actor.ground; }
  }
  /** A waiting bot steps off its transport at `at`, or at the drop if that spot is blocked. */
  function disembark(event: CombatEventDescriptor, slot: number, at: CombatPlane) {
    const member = [...members.values()].find(m => m.ride?.event === event.id && m.ride.slot === slot);
    if (!member || member.actor.alive) return;
    spawn(member);
    const point = clearSpawn(at) ? at : event.target;
    const human = [...members.values()].filter(m => !m.actor.bot && m.actor.alive).sort((a, b) => distance(a.actor, member.actor) - distance(b.actor, member.actor))[0]?.actor;
    Object.assign(member.actor, { x: point.x, z: point.z, yaw: human ? Math.atan2(-(human.x - point.x), -(human.z - point.z)) : event.heading });
    const t = transports.get(event.id); if (t) t.passengers = transportPassengers(t).length;
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
        if (d < payload.radius + 2) {
          if (event.descriptor.kind === 'artillery-creeping') {
            // Leave the whole corridor sideways instead of fleeing along it into the next salvo.
            const x = -Math.cos(event.descriptor.heading), z = Math.sin(event.descriptor.heading);
            const side = (actor.x - event.descriptor.target.x) * x + (actor.z - event.descriptor.target.z) * z < 0 ? -1 : 1;
            return { x: x * side, z: z * side };
          }
          return d > .01 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 };
        }
      }
    }
    return null;
  }
  function vehicleEnemy(entry: InternalActor, v: SharedVehicle) {
    if(arenaConditionModifiers(entry.actor.conditions).dazed)return undefined;
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
  const airObstacles = () => [...(vehicleOptions?.flightObstacles ?? obstacles.map(o=>({...o,minY:o.minY??0,maxY:o.maxY??2.5}))),
    ...vehicles.filter(v=>v.kind!=='helicopter'&&!v.despawned).map(v=>({...vehicleBounds(v),minY:v.y,maxY:v.y+2.7}))];
  function eligibleAircrew(m: InternalActor, pilot: InternalActor, v: SharedVehicle) {
    return m.actor.bot && m.actor.alive && !m.reserve && !m.temporary && !m.anchor && !m.heal &&
      m.actor.faction===pilot.actor.faction && m.actor.squad===pilot.actor.squad &&
      m.actor.duty!=='sentry' && !m.actor.patrolSector && !(m.order&&m.order.until>elapsed) &&
      m.actor.health>=m.healthMax*.5 && !dangerExit(m.actor) && elapsed>=(m.vehicleBoardAfter??0) &&
      (m.actor.vehicle===v.kind || !m.actor.vehicle && distance(m.actor,v)<WORLD_VEHICLES.crewRange);
  }
  function wantsHelicopter(entry: InternalActor, v: SharedVehicle) {
    if (airSortie) return airSortie.mission.phase==='boarding' &&
      (entry.actor.id===airSortie.pilot || !!v.occupants[0] && airSortie.mission.reservations.some(r=>r.id===entry.actor.id));
    if (v.occupants[0] || !eligibleAircrew(entry,entry,v) || distance(entry.actor,v)>WORLD_VEHICLES.boardRange) return false;
    const key=entry.actor.squad??entry.actor.id;
    if (elapsed<(airDecisionAt.get(key)??0)) return false;
    const group=[entry,...crewCandidates(entry,v).filter(m=>eligibleAircrew(m,entry,v))].slice(0,4);
    if (group.some(m=>m.actor.id.localeCompare(entry.actor.id)<0)) return false;
    airDecisionAt.set(key,elapsed+HELICOPTER_AI.decisionSeconds);
    const objective=facilities?.sites.find(s=>s.id===entry.actor.objective) ?? entry.mission;
    if (!objective) return false;
    const nearby=[...members.values()].filter(m=>m.actor.alive&&!m.reserve&&distance(m.actor,{...objective,y:('y' in objective?objective.y:0)??0})<90);
    const enemies=nearby.filter(m=>hostile(entry.actor,m.actor));
    const ground=nearby.filter(m=>m.actor.faction===entry.actor.faction&&!m.actor.vehicle&&!m.actor.transport&&!group.includes(m)).length;
    const solids=airObstacles();
    const home={x:v.x,y:v.y,z:v.z};
    const landing=validSpawns.filter(p=>Math.hypot(p.x-objective.x,p.z-objective.z)<65 && Math.hypot(p.x-v.x,p.z-v.z)>=55 &&
      enemies.every(m=>Math.hypot(m.actor.x-p.x,m.actor.z-p.z)>30) &&
      clearVehicleSpawn('helicopter',{...p,yaw:0},vehicleGround,solids,bounds) &&
      [[0,0],[5,0],[-5,0],[0,5],[0,-5]].every(([dx,dz])=>clearSpawn({x:p.x+dx,z:p.z+dz})))
      .sort((a,b)=>Math.hypot(a.x-objective.x,a.z-objective.z)-Math.hypot(b.x-objective.x,b.z-objective.z))
      .map(p=>planAirRoute(home,{...p,y:groundHeight(p.x,p.z)+.13},solids,bounds)).find(Boolean);
    let support: ReturnType<typeof planAirRoute> = null;
    if (enemies.length && v.ammo>0) for (const height of [22,36,54]) {
      const stations=Array.from({length:8},(_,n)=>{const angle=n*Math.PI/4;return {x:objective.x+Math.sin(angle)*55,z:objective.z+Math.cos(angle)*55,y:Math.max(0,('y' in objective?objective.y:0)??0)+height};})
        .sort((a,b)=>distance(a,home)-distance(b,home));
      for (const p of stations) {
        if (!enemies.some(m=>distance(p,m.actor)<WORLD_VEHICLES.combatRange && lineClear(p,chestOf(m.actor)))) continue;
        support=planAirRoute(home,p,solids,bounds); if(support)break;
      }
      if(support)break;
    }
    const airCoverage=[...raiders.values()].filter(r=>r.kind==='gunship'&&r.health>0&&distance(r,{...objective,y:0})<160&&events.some(e=>e.descriptor.id===r.event&&(e.descriptor.faction??DEFAULT_BOT_FACTION)===entry.actor.faction)).length;
    const role=chooseAirMission({ground,groundNeeded:Math.max(4,enemies.length*.7),pressure:Math.min(1,enemies.length/6),airCoverage,
      distance:Math.hypot(objective.x-v.x,objective.z-v.z),passengers:group.length-1,transportClear:!!landing,supportClear:!!support},aviationRandom());
    const route=role==='transport'?landing:role==='support'?support:null;
    if (!route || role==='infantry') return false;
    const mission=createHelicopterMission(role,'id' in objective?String(objective.id):'squad-objective',route,elapsed,
      group.slice(1).map(m=>({id:m.actor.id,distance:distance(m.actor,v),progressAt:elapsed})));
    airSortie={pilot:entry.actor.id,mission,created:elapsed,boarded:false};
    announce(`${entry.actor.faction===PLAYER_FACTION?'Allied':'Enemy'} helicopter crew assembling for ${role==='support'?'air support':'squad transport'}.`);
    return true;
  }
  /** Bounded drivable sorties never alter scripted raids or transport events. */
  function stepHelicopterPilot(v: SharedVehicle, driver: InternalActor, hold: (id:string,input:VehicleControls)=>void) {
    if (!airSortie || airSortie.pilot!==driver.actor.id) {
      // Explicit seat changes do not invent a sortie. Land and release the crew.
      hold(driver.actor.id,{forward:0,steer:0,lift:-1,brake:true,boost:false,fire:false});
      unloadVehicle(v);return;
    }
    const m=airSortie.mission, solids=airObstacles();
    const returnToSafety=()=>returnHelicopter(m,v,elapsed,solids,bounds,validSpawns.filter(clearSpawn)
      .sort((a,b)=>Math.hypot(a.x-m.home.x,a.z-m.home.z)-Math.hypot(b.x-m.home.x,b.z-m.home.z)).slice(0,8)
      .map(p=>({...p,y:groundHeight(p.x,p.z)+.13})));
    if (!airSortie.boarded) {airSortie.boarded=true;m.started=m.phaseAt=elapsed;}
    m.reservations=updateBoardingReservations(m.reservations,elapsed,id=>{
      const member=members.get(id);return member?{eligible:eligibleAircrew(member,driver,v),aboard:v.occupants.includes(id),distance:distance(member.actor,v)}:undefined;
    });
    const passengers=v.occupants.slice(1).some(Boolean);
    const cancelled=!!(driver.order&&driver.order.until>elapsed) || m.role==='support'&&facilities?.sites.some(s=>s.id===m.objective&&s.owner===driver.actor.faction&&!s.contested);
    if (m.phase==='boarding' && (cancelled || !passengers&&m.role==='transport'&&(!m.reservations.length||elapsed-m.started>=HELICOPTER_AI.boardingLimit))) {
      unloadVehicle(v); airDecisionAt.set(driver.actor.squad??driver.actor.id,elapsed+HELICOPTER_AI.retrySeconds);airSortie=undefined;return;
    }
    if (!m.returning && m.phase!=='boarding' && (cancelled||v.health<VEHICLE_COMBAT.helicopter.health*.35||elapsed-m.started>HELICOPTER_AI.missionSeconds||m.role==='support'&&v.ammo===0||m.phase==='support'&&elapsed-m.phaseAt>=HELICOPTER_AI.supportSeconds))
      returnToSafety();
    if (m.phase==='unloading') {
      if (unloadVehicle(v,true) || elapsed-m.phaseAt>6) returnToSafety();
    }
    // A vehicle can park on the home pad after departure. Revalidate a stalled
    // descent and choose a nearby clear recovery point rather than hover forever.
    if (m.phase==='landing'&&elapsed-m.phaseAt>30) returnToSafety();
    const input=helicopterMissionControls(m,v,elapsed);
    if (m.phase==='done') {
      if(unloadVehicle(v)){airDecisionAt.set(driver.actor.squad??driver.actor.id,elapsed+HELICOPTER_AI.retrySeconds);driver.vehicleBoardAfter=elapsed+HELICOPTER_AI.retrySeconds;airSortie=undefined;}
      return;
    }
    hold(driver.actor.id,input);
    const gunner=gunnerId(v),gun=gunner?members.get(gunner):undefined;
    if(gun?.actor.bot) {
      const target=m.phase==='support'?vehicleEnemy(gun,v):undefined;
      hold(gun.actor.id,{...(gun===driver?input:{forward:0,steer:0,lift:0,brake:true,boost:false,fire:false}),fire:!!target,...(target?{aim:chestOf(target.actor)}:{})});
    }
  }
  function walkBoatInfantry(entry:InternalActor,goal:BoatPoint,dt:number) {
    const a=entry.actor,target={...goal,y:0};
    if(entry.navigation)entry.navigation.retry-=dt;
    if(navigator&&(!entry.navigation||Math.hypot(entry.navigation.target.x-goal.x,entry.navigation.target.z-goal.z)>.6||!entry.navigation.pending&&!entry.navigation.path.length&&entry.navigation.retry<=0))
      entry.navigation={path:[],target,retry:1.5,pending:navigator.plan({x:a.x,y:Math.max(0,a.y-1.75),z:a.z},target)};
    while(entry.navigation?.path.length&&Math.hypot(entry.navigation.path[0].x-a.x,entry.navigation.path[0].z-a.z)<.3)entry.navigation.path.shift();
    const next=entry.navigation?.path[0]??goal,dx=next.x-a.x,dz=next.z-a.z,d=Math.hypot(dx,dz),stride=Math.min(d,entry.role!.speed*dt);
    if(d<.01)return;
    const solids=vehicles.filter(v=>!v.despawned&&v.y<2).map(vehicleBounds);
    if(traversal){const p=traversal.move({x:a.x,y:Math.max(0,a.y-1.75),z:a.z,velocityY:entry.velocityY??0},dx/d*stride,dz/d*stride,dt,.4,1.8,solids);Object.assign(a,{x:p.x,y:p.y+1.75,z:p.z});entry.velocityY=p.velocityY;}
    else Object.assign(a,move(a,dx/d*stride,dz/d*stride,.4,[...groundObstacles,...solids]));
    a.yaw=Math.atan2(-dx,-dz);a.prone=false;
  }
  function boatInfantryEligible(m:InternalActor) {
    const a=m.actor;
    return a.bot&&a.alive&&!m.reserve&&!a.vehicle&&!a.transport&&!a.parachuting&&!a.swimming&&!m.anchor&&!m.temporary&&!m.heal&&
      !(m.order&&m.order.until>elapsed)&&elapsed>=(m.vehicleBoardAfter??0)&&elapsed>=(m.boatIslandUntil??0)&&
      a.health>=m.healthMax*.5&&!arenaConditionModifiers(a.conditions).dazed&&!arenaConditionModifiers(a.conditions).frozen;
  }
  function boatSolids(v:SharedVehicle){return vehicles.filter(o=>o!==v&&!o.despawned).map(vehicleBounds);}
  const onMerlionIsland=(p:BoatPoint)=>Math.hypot(p.x,p.z-MERLION.z)<22;
  function boatGoals(island:boolean){return BOAT_BERTHS.filter(b=>b.island===island);}
  function newBoatSortie(v:SharedVehicle,pilot:InternalActor,route:BoatRoute,crew:string[]):BoatSortie {
    return{pilot:pilot.actor.id,route,index:0,boarded:false,returning:!route.berth.island,started:elapsed,phaseAt:elapsed,phase:'boarding',progressAt:elapsed,last:{x:v.x,z:v.z,yaw:v.yaw},retryAt:elapsed,crew};
  }
  /** Approach a real dry exit, never the hull's centre across water. Reservations expire without inventing crew. */
  function tryBoardDragonBoat(entry:InternalActor,dt:number) {
    if(!merlion||entry.actor.vehicle||entry.actor.transport||entry.actor.swimming||entry.actor.parachuting||merlion.state.operator===entry.actor.id)return false;
    const boats=vehicles.filter(v=>isDragonBoat(v.kind)&&!v.despawned&&v.health>VEHICLE_COMBAT[v.kind].health*.35&&vehicleSpeed(v)<1&&v.occupants.includes(null))
      .sort((a,b)=>distance(entry.actor,a)-distance(entry.actor,b));
    for(const v of boats){
      const landing=vehicleExit(v,obstacles,bounds,exitFloor);if(!landing||onMerlionIsland(entry.actor)!==onMerlionIsland(landing)||Math.hypot(entry.actor.x-landing.x,entry.actor.z-landing.z)>BOAT_AI.boardRange)continue;
      const driver=v.occupants[0]?members.get(v.occupants[0]):undefined,life=lifeOf(v);
      if(v.occupants.some(id=>id&&members.get(id)?.actor.faction!==entry.actor.faction)||life.unload)continue;
      if(driver&&!driver.actor.bot){
        const order=entry.order&&entry.order.until>elapsed?entry.order:undefined;
        if(!driver.actor.alive||!driver.playing||life.pickupDriver!==driver.actor.id||life.pickupStopped<WORLD_VEHICLES.pickupSeconds||order&&(order.kind!=='gather'||order.by!==driver.actor.id)||entry.anchor||entry.temporary||entry.heal||elapsed<(entry.vehicleBoardAfter??0))continue;
      }else{
        if(!boatInfantryEligible(entry))continue;
        let sortie=boatSorties.get(v.kind);
        if(sortie&&(sortie.phase!=='boarding'||sortie.pilot!==entry.actor.id&&!sortie.crew.includes(entry.actor.id)))continue;
        if(!sortie){
          if(driver||elapsed<(boatDecisionAt.get(v.kind)??0)||[...members.values()].some(m=>!m.actor.bot&&m.actor.alive&&distance(m.actor,v)<12))continue;
          const candidates=[...members.values()].filter(m=>boatInfantryEligible(m)&&m.actor.faction===entry.actor.faction&&Math.hypot(m.actor.x-landing.x,m.actor.z-landing.z)<BOAT_AI.boardRange)
            .sort((a,b)=>Math.hypot(a.actor.x-landing.x,a.actor.z-landing.z)-Math.hypot(b.actor.x-landing.x,b.actor.z-landing.z)||a.actor.id.localeCompare(b.actor.id));
          if(candidates[0]!==entry)continue;
          boatDecisionAt.set(v.kind,elapsed+BOAT_AI.retrySeconds);
          const route=planBoatRoute(v,boatGoals(!onMerlionIsland(v)),boatSolids(v));if(!route)continue;
          sortie=newBoatSortie(v,entry,route,candidates.slice(1,4).map(m=>m.actor.id));boatSorties.set(v.kind,sortie);
        }
        if(!driver&&sortie.pilot!==entry.actor.id){walkBoatInfantry(entry,landing,dt);return true;}
      }
      if(vehicleAction(entry.actor.id,'enter',v.kind)){entry.aimFocus=undefined;return true;}
      walkBoatInfantry(entry,landing,dt);entry.aimFocus=undefined;return true;
    }
    return false;
  }
  function assignBoatLanding(ids:readonly string[],island:boolean){
    ids.forEach((id,n)=>{const m=members.get(id);if(!m?.actor.bot)return;
      m.navigation=undefined;if(island){m.boatIslandUntil=elapsed+BOAT_AI.islandSeconds;m.boatGuard=n;m.actor.objective='Merlion';m.actor.duty='attack';}
    });
  }
  /** Existing boats carry existing soldiers. A surviving bot may replace a lost pilot only when no player remains aboard. */
  function stepDragonBoatBrains(){
    const neutral:VehicleControls={forward:0,steer:0,lift:0,brake:true,boost:false,fire:false};
    for(const v of vehicles){
      if(!isDragonBoat(v.kind))continue;
      let sortie=boatSorties.get(v.kind),driver=v.occupants[0]?members.get(v.occupants[0]):undefined;
      const life=lifeOf(v),hold=(input:VehicleControls)=>{if(driver)controls.set(driver.actor.id,{input,expires:elapsed+.35});};
      if(v.despawned||v.health<=0){boatSorties.delete(v.kind);continue;}
      if(driver&&!driver.actor.bot){boatSorties.delete(v.kind);if(life.unload)unloadVehicle(v);continue;}
      if(!driver&&v.occupants.some(Boolean)){
        if(v.occupants.some(id=>id&&!members.get(id)?.actor.bot))continue;
        if(life.unload&&vehicleSpeed(v)<=.8&&unloadVehicle(v)){boatSorties.delete(v.kind);continue;}
        const survivor=v.occupants.slice(1).map(id=>id?members.get(id):undefined).find(m=>m?.actor.alive);
        if(survivor){releaseSeat(survivor.actor.id,true);v.occupants[0]=survivor.actor.id;life.unload=false;driver=survivor;if(sortie)sortie.pilot=driver.actor.id;syncOccupants();}
      }
      if(!driver){
        if(sortie){const pilot=members.get(sortie.pilot);if(!pilot||!boatInfantryEligible(pilot)||elapsed-sortie.started>40){boatSorties.delete(v.kind);boatDecisionAt.set(v.kind,elapsed+BOAT_AI.retrySeconds);}}
        continue;
      }
      if(!sortie){
        const route=planBoatRoute(v,boatGoals(!onMerlionIsland(v)),boatSolids(v));
        if(!route){hold(neutral);continue;}
        sortie=newBoatSortie(v,driver,route,[]);boatSorties.set(v.kind,sortie);
      }
      if(!sortie.boarded){sortie.boarded=true;sortie.started=sortie.phaseAt=sortie.progressAt=elapsed;}
      if(sortie.phase==='boarding'){
        hold(neutral);
        const waiting=sortie.crew.some(id=>{const m=members.get(id);return m&&boatInfantryEligible(m)&&!v.occupants.includes(id);});
        if(elapsed-sortie.phaseAt<BOAT_AI.minWait||waiting&&elapsed-sortie.phaseAt<BOAT_AI.waitSeconds)continue;
        sortie.phase='sailing';sortie.phaseAt=sortie.progressAt=elapsed;
      }
      if(sortie.phase==='unloading'){
        hold(neutral);const island=sortie.route?.berth.island??false,keepPilot=island&&v.occupants.slice(1).some(Boolean);
        const dropped=v.occupants.slice(keepPilot?1:0).filter((id):id is string=>!!id);
        if(unloadVehicle(v,keepPilot)){
          assignBoatLanding(dropped,island);
          if(!keepPilot){boatSorties.delete(v.kind);continue;}
          sortie.returning=true;sortie.started=elapsed;sortie.route=null;sortie.index=0;sortie.phase='sailing';sortie.retryAt=elapsed;
        }else if(elapsed-sortie.phaseAt>6&&elapsed>=sortie.retryAt){
          const route=planBoatRoute(v,boatGoals(island).filter(b=>b.id!==sortie!.route?.berth.id),boatSolids(v));sortie.retryAt=elapsed+BOAT_AI.retrySeconds;
          if(route){sortie.route=route;sortie.index=0;sortie.phase='sailing';sortie.progressAt=elapsed;}
        }
        continue;
      }
      if(driver.order&&driver.order.until>elapsed||elapsed-sortie.started>BOAT_AI.missionSeconds){
        if(!sortie.returning){sortie.returning=true;sortie.route=null;sortie.index=0;sortie.retryAt=elapsed;}
      }
      const moved=Math.hypot(v.x-sortie.last.x,v.z-sortie.last.z),turned=Math.abs(Math.atan2(Math.sin(v.yaw-sortie.last.yaw),Math.cos(v.yaw-sortie.last.yaw)));
      if(moved>.025||turned>.008){sortie.last={x:v.x,z:v.z,yaw:v.yaw};sortie.progressAt=elapsed;}
      if(elapsed-sortie.progressAt>BOAT_AI.retrySeconds&&elapsed>=sortie.retryAt){sortie.route=null;sortie.index=0;}
      if(!sortie.route){
        hold(neutral);if(elapsed<sortie.retryAt)continue;
        sortie.route=planBoatRoute(v,boatGoals(!sortie.returning),boatSolids(v));sortie.index=0;sortie.retryAt=elapsed+BOAT_AI.retrySeconds;sortie.progressAt=elapsed;
        if(!sortie.route)continue;
      }
      const point=sortie.route.points[sortie.index],next=boatAutopilot(v,point);
      hold(next.input);
      if(next.arrived){sortie.index++;sortie.progressAt=elapsed;if(sortie.index===sortie.route.points.length){sortie.phase='unloading';sortie.phaseAt=elapsed;hold(neutral);}}
    }
  }
  function tryBoardVehicle(entry: InternalActor, dt: number) {
    const order = entry.order && entry.order.until > elapsed && entry.order.since <= elapsed ? entry.order : undefined;
    if (!vehicleOptions?.openWorld || order && order.kind !== 'gather' || entry.anchor || entry.temporary || entry.heal || entry.actor.y > (bounds.groundHeight?.(entry.actor.x, entry.actor.z) ?? 0) + 2 ||
      elapsed < (entry.vehicleBoardAfter ?? 0) || dangerExit(entry.actor) || entry.actor.health < entry.healthMax * .5) return false;
    const v = vehicles.filter(v => !isDragonBoat(v.kind) && (!v.faction || v.faction === entry.actor.faction) && v.health > VEHICLE_COMBAT[v.kind].health * .35 && v.y < (bounds.groundHeight?.(v.x, v.z) ?? 0) + .3 && vehicleSpeed(v) < WORLD_VEHICLES.pickupSpeed && Math.abs(v.climb) <= .5 &&
      !lifeOf(v).unload && v.occupants.includes(null) &&
      v.occupants.every(id => !id || members.get(id)?.actor.faction === entry.actor.faction) &&
      // A player changing seats keeps their crew, but does not invite an AI driver.
      (v.occupants[0] || !v.occupants.some(id => id && !members.get(id)?.actor.bot)) &&
      // Leave an unattended motor pool for a player who is already approaching it.
      (v.occupants[0] || ![...members.values()].some(m => !m.actor.bot && m.actor.alive && distance(m.actor, v) < 12)))
      .sort((a, b) => distance(entry.actor, a) - distance(entry.actor, b))
      .find(v => {
        // Even recruited crew cannot use a hull beyond this range; avoid its cover rays.
        const boardingDistance = distance(entry.actor, v);
        if (boardingDistance >= Math.max(WORLD_VEHICLES.boardRange, WORLD_VEHICLES.crewRange)) return false;
        const driver = v.occupants[0] ? members.get(v.occupants[0]) : undefined;
        const pickup = driver && !driver.actor.bot && driver.actor.alive && driver.playing &&
          lifeOf(v).pickupDriver === driver.actor.id && lifeOf(v).pickupStopped >= WORLD_VEHICLES.pickupSeconds;
        if (driver && !driver.actor.bot && !pickup) return false;
        // Follow the caller into their vehicle; explicit positioning orders still win.
        if (order && (!pickup || order.by !== driver?.actor.id)) return false;
        // Player pickups allow extraction under fire, so they need no threat scan.
        if (!pickup) {
          if (v.ammo <= 0) return false;
          const threat = vehicleEnemy(entry, v);
          // Distant firefights should not stop a squad assembling its patrol.
          if (threat && distance(threat.actor, v) < WORLD_VEHICLES.boardThreatRange) return false;
        }
        if (v.kind === 'helicopter' && (!driver || driver.actor.bot) && !wantsHelicopter(entry, v)) return false;
        const recruited = driver?.actor.bot && (v.kind === 'helicopter' ? airSortie?.mission.reservations.some(r=>r.id===entry.actor.id) : !lifeOf(v).departed && lifeOf(v).crew.includes(entry.actor.id));
        return boardingDistance < (recruited ? WORLD_VEHICLES.crewRange : WORLD_VEHICLES.boardRange);
      });
    if (!v) return false;
    if (vehicleAction(entry.actor.id, 'enter', v.kind)) return true;
    // Walk to the hull's side using the same street collision as infantry.
    entry.navigation = undefined;
    const d = Math.hypot(v.x - entry.actor.x, v.z - entry.actor.z), stride = Math.min(d, entry.role!.speed * dt);
    const dx = (v.x - entry.actor.x) / Math.max(.01, d) * stride, dz = (v.z - entry.actor.z) / Math.max(.01, d) * stride;
    const solids = vehicles.filter(other => !other.despawned && other.y < 2).map(vehicleBounds);
    if (traversal) {
      const next = traversal.move({ x: entry.actor.x, y: Math.max(0, entry.actor.y - 1.75), z: entry.actor.z, velocityY: entry.velocityY ?? 0 }, dx, dz, dt, .4, 1.8, solids);
      Object.assign(entry.actor, { x: next.x, y: next.y + 1.75, z: next.z }); entry.velocityY = next.velocityY;
    } else Object.assign(entry.actor, move(entry.actor, dx, dz, .4, [...groundObstacles, ...solids]));
    entry.actor.yaw = Math.atan2(-dx, -dz); return true;
  }
  /** Observe actual movement each tick: a brief pause or a seat change is not a pickup. */
  function stepVehiclePickups(dt: number) {
    for (const v of vehicles) {
      const life = lifeOf(v), driver = v.occupants[0] ? members.get(v.occupants[0]) : undefined;
      const stopped = driver && !driver.actor.bot && driver.actor.alive && driver.playing && v.health > 0 && !life.unload &&
        vehicleSpeed(v) < WORLD_VEHICLES.pickupSpeed && Math.abs(v.climb) <= .5 && v.y < (bounds.groundHeight?.(v.x, v.z) ?? 0) + .3;
      life.pickupStopped = stopped ? (life.pickupDriver === driver.actor.id ? life.pickupStopped : 0) + dt : 0;
      life.pickupDriver = stopped ? driver.actor.id : undefined;
    }
  }
  function stepVehicleBrains(dt: number) {
    if (airSortie) {
      const pilot=members.get(airSortie.pilot),v=vehicles.find(v=>v.kind==='helicopter');
      if (airSortie.boarded && v && !v.occupants[0]) lifeOf(v).unload=true;
      if (!pilot?.actor.alive || !v || v.health<=0 || airSortie.boarded&&v.occupants[0]!==pilot.actor.id || !airSortie.boarded&&(elapsed-airSortie.created>HELICOPTER_AI.boardingLimit || !eligibleAircrew(pilot,pilot,v))) airSortie=undefined;
    }
    for (const v of vehicles) {
      const life = lifeOf(v), occupied = v.occupants.some(Boolean);
      if(isDragonBoat(v.kind)){
        life.idle=occupied?0:life.idle+dt;
        const spawn=vehicleOptions!.spawns[v.kind]!;
        if(spawn && !occupied && (v.health<=0 && life.wreck>=WORLD_VEHICLES.wreckSeconds || life.idle>=WORLD_VEHICLES.abandonedSeconds && Math.hypot(v.x-spawn.x,v.z-spawn.z)>12) &&
          ![...members.values()].some(m=>m.actor.alive && (distance(m.actor,{...spawn,y:1.75})<WORLD_VEHICLES.protectDistance || !v.despawned && distance(m.actor,v)<WORLD_VEHICLES.protectDistance)) && canPaddle(spawn.x,spawn.z,spawn.yaw,vehicles.filter(o=>o!==v&&!o.despawned).map(vehicleBounds))){Object.assign(v,createSharedVehicle(v.kind,spawn));vehicleLife.delete(v.kind);}
        if(life.unload && !boatSorties.has(v.kind) && vehicleSpeed(v)<=.8 && !v.occupants[0]) unloadVehicle(v);
        continue;
      }
      life.idle = occupied ? 0 : life.idle + dt;
      const facility = facilities?.sites.find(s => s.kind === (v.kind === 'car' ? 'garage' : 'helipad') && facilityOperational(s));
      const spawn = facility?.deployment ?? vehicleOptions!.spawns[v.kind]!;
      const replace = v.health <= 0 ? life.wreck >= WORLD_VEHICLES.wreckSeconds : life.idle >= WORLD_VEHICLES.abandonedSeconds && Math.hypot(v.x - spawn.x, v.z - spawn.z) > 12;
      const near = [...members.values()].some(m => m.actor.alive && (distance(m.actor, { ...spawn, y: 1.75 }) < (m.actor.bot ? 8 : WORLD_VEHICLES.protectDistance) ||
        !v.despawned && distance(m.actor, v) < (m.actor.bot ? 8 : v.health <= 0 ? WORLD_VEHICLES.protectDistance : WORLD_VEHICLES.reclaimDistance)));
      if (!occupied && replace && !near && (!facilities || facility && facility.deployIn === 0) && clearVehicleSpawn(v.kind, spawn, vehicleGround, vehicleOptions!.flightObstacles ?? [], bounds,
        vehicles.filter(other => !other.despawned && other !== v && other.y < 6).map(vehicleBounds)) &&
        (!facilities || facilities.spend(facility!.owner!, v.kind === 'car' ? FACILITY_RULES.carCost : FACILITY_RULES.helicopterCost))) {
        Object.assign(v, createSharedVehicle(v.kind, spawn)); if (facility) { v.faction = facility.owner!; facility.deployIn = 45; }
        vehicleLife.delete(v.kind); continue;
      }
      if (v.health <= 0) continue;
      // Route and visibility queries need a few decisions per second, not one per render frame.
      life.think -= dt; if (life.think > 0) continue;
      life.think = .15; const thinkDt = elapsed - life.lastThink; life.lastThink = elapsed;
      const driver = v.occupants[0] ? members.get(v.occupants[0]) : undefined;
      if(v.kind==='helicopter'&&driver?.actor.bot) {
        stepHelicopterPilot(v,driver,(id,input)=>controls.set(id,{input,expires:elapsed+.35}));continue;
      }
      const enemy = driver?.actor.bot ? vehicleEnemy(driver, v) : undefined;
      const armedCrew = !!v.occupants[1] && v.ammo > 0;
      if (driver?.actor.bot && (enemy && !armedCrew || v.health < VEHICLE_COMBAT[v.kind].health * .3 || dangerExit(driver.actor) || life.stuck > WORLD_VEHICLES.stuckSeconds)) life.unload = true;
      if (driver?.actor.bot && !enemy && driver.mission && Math.hypot(v.x - driver.mission.x, v.z - driver.mission.z) < 15) life.unload = true;
      const neutral: VehicleControls = { forward: 0, steer: 0, lift: 0, brake: true, boost: false, fire: false };
      const hold = (id: string, input: VehicleControls) => controls.set(id, { input, expires: elapsed + .35 });
      if (life.unload) {
        // A missing helicopter pilot brings the craft down before the remaining crew exits.
        if (driver) hold(driver.actor.id, neutral);
        if (vehicleSpeed(v) <= 2 && v.y < .3 && Math.abs(v.climb) <= .5) unloadVehicle(v);
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
        const ground = [...vehicleGround, ...vehicles.filter(other => !other.despawned && other !== v && other.y < 2).map(vehicleBounds)];
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
            const heading = driver.mission ? Math.atan2(v.x - driver.mission.x, v.z - driver.mission.z) : v.yaw;
            const yaw = heading + turn, goal = { x: v.x - Math.sin(yaw) * 24, z: v.z - Math.cos(yaw) * 24, yaw };
            if (clearRoute(goal)) { life.goal = goal; break; }
          }
        }
        const goal = life.goal;
        const heading = goal ? Math.atan2(v.x - goal.x, v.z - goal.z) : v.yaw;
        const error = Math.atan2(Math.sin(heading - v.yaw), Math.cos(heading - v.yaw));
        const fighting = !!enemy && armedCrew;
        const waiting = fighting || !goal;
        hold(driver.actor.id, { ...neutral, forward: waiting ? 0 : vehicleSpeed(v) < 7 ? 1 : 0, steer: clamp(-error * 2, -1, 1), brake: waiting || vehicleSpeed(v) > 8 });
        if (!fighting && ((!waiting && vehicleSpeed(v) < .5) || !goal)) life.stuck += thinkDt; else life.stuck = 0;
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
  const vehicleCollisions = createVehicleCollisionBuffers(vehicleGround, obstacles);
  function stepVehicles(dt: number) {
    for (const v of vehicles) {
      if (v.despawned) continue;
      v.weaponCooldown = Math.max(0, v.weaponCooldown - dt);
      const held = (id: string | null) => id && (controls.get(id)?.expires ?? 0) > elapsed ? controls.get(id)!.input : undefined;
      const drive = held(v.occupants[0]);
      if (v.health <= 0) {
        if(isDragonBoat(v.kind)) continue;
        Object.assign(v, stepVehicleWreck(v, dt, v.kind === 'car' && vehicleSpeed(v) > .01 ? vehicleCollisions.ground(v, vehicles) : vehicleCollisions.flight(v, vehicles, vehicleOptions?.flightObstacles), bounds).state); continue;
      }
      // Substeps keep vehicle physics advancing at wall-clock speed with slow hosts.
      const result = isDragonBoat(v.kind) ? paddleVehicle(v,drive?.forward??0,drive?.steer??0,drive?.brake??!!lifeOf(v).unload,dt,v.occupants.slice(1).filter(Boolean).length,vehicles.filter(other=>!other.despawned&&other!==v).map(vehicleBounds)) : v.kind === 'car' ? driveVehicle(v, drive?.forward ?? 0, drive?.steer ?? 0, drive?.brake ?? !drive, dt, vehicleCollisions.ground(v, vehicles), bounds)
        : flyVehicle(v, drive?.forward ?? 0, drive?.steer ?? 0, drive?.lift ?? (vehicleOptions?.openWorld && lifeOf(v).unload && v.y > .13 ? -1 : 0), drive?.boost ?? false, dt, vehicleCollisions.flight(v, vehicles, vehicleOptions?.flightObstacles), bounds);
      Object.assign(v, result.state);
      const collisionDamage = vehicleCollisionDamage(result.impactSpeed);
      if (collisionDamage > 0) damageHull(v, collisionDamage);
      if(isDragonBoat(v.kind)) continue;
      const gunner = gunnerId(v), gun = held(gunner);
      const ray = vehicleGunRay(v, gun?.aim);
      if (gun?.fire && gunner && fireVehicleWeapon(v)) {
        const entry = members.get(gunner); if (!entry) continue;
        v.shots++; entry.actor.shots++; entry.shotFlash = { at: elapsed, flare: 1 };
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
    const sightCover = sightDistance ?? cover;
    if (!sightCover) return worldWallDistance(entry.actor, ray) >= length - .5;
    const sight = entry.sight;
    if (sight && sight.target === target && (sight.wait -= dt) > 0) return sight.clear;
    const clear = sightCover(entry.actor, ray, length) >= length - .5;
    entry.sight = { target, clear, wait: ARENA_SIGHT_RECHECK };
    return clear;
  }
  function seesThreat(entry: InternalActor, enemy: InternalActor, range: number, dt: number): boolean {
    if (arenaConditionModifiers(entry.actor.conditions).dazed || !enemy.actor.alive || enemy.reserve) return false;
    // Heavies identify helicopters as hulls, rather than acquiring their crew as distant infantry.
    if (entry.role?.id === 'heavy' && (enemy.actor.vehicle === 'helicopter' || enemy.actor.aircrew)) return false;
    const chest = chestOf(enemy.actor), length = distance(entry.actor, chest);
    if (length >= range || length < .01) return false;
    const ray = { x: (chest.x - entry.actor.x) / length, y: (chest.y - entry.actor.y) / length, z: (chest.z - entry.actor.z) / length };
    return clearSight(entry, enemy.actor.id, ray, length, dt) && !(smokeHides(enemy.insert) && smokeBetween(entry.actor, enemy.actor));
  }
  const homes = new Map<string, { x: number; z: number }[]>();
  function homeSpawns(id: string) {
    let list = homes.get(id);
    if (!list) { const sector = environment?.heat?.sectors.find(s => s.id === id); list = sector ? validSpawns.filter(p => inside(p, sector.bounds)) : []; homes.set(id, list); }
    return list;
  }
  // Vehicles finish moving before infantry is stepped. Every bot observes the
  // same hulls for this tick; casting down through the district per bot repeats
  // identical terrain/roof queries thousands of times a second at larger rosters.
  let botVehicleGeometry: { movement: Obstacle[]; navigation: Obstacle[]; walking?: Obstacle[]; lifts?: readonly Obstacle[] } | undefined;
  function botVehicleObstacles() {
    if (!botVehicleGeometry) {
      const grounded=vehicles.filter(v=>!v.despawned && v.y-groundHeight(v.x,v.z)<2);
      botVehicleGeometry={movement:grounded.map(vehicleBounds),
        navigation:grounded.map(v=>({...vehicleBounds(v),minY:v.y,maxY:v.y+3}))};
    }
    return botVehicleGeometry;
  }
  // Hulls and lift bodies already have a tick lifetime. Share their combined
  // infantry list too; it is discarded with the hull snapshot or changed lifts.
  function botMovementObstacles() {
    const geometry = botVehicleObstacles(), lifts = liveLiftBodies();
    if (!geometry.walking || geometry.lifts !== lifts) { geometry.walking = [...geometry.movement, ...lifts]; geometry.lifts = lifts; }
    return geometry.walking;
  }
  interface AircraftTarget { id: string; point: ArenaPoint; velocity: ArenaPoint }
  /** Heavy gunners identify the hull itself, including raids with no exposed target soldier. */
  function heavyAircraftTarget(entry: InternalActor, dt: number): AircraftTarget | undefined {
    if (entry.role?.id !== 'heavy' || arenaConditionModifiers(entry.actor.conditions).dazed) return;
    const candidates: AircraftTarget[] = [];
    for (const v of vehicles) {
      if (v.kind !== 'helicopter' || v.health <= 0 || v.despawned) continue;
      const crew = v.occupants.flatMap(id => id && members.get(id) ? [members.get(id)!] : []);
      // Empty/abandoned hulls are not threats; a player's spawn shield still holds.
      if (!crew.some(m => m.actor.alive && hostile(entry.actor, m.actor) && elapsed >= (m.shieldUntil ?? 0))) continue;
      candidates.push({ id: 'aircraft-helicopter', point: { x: v.x, y: v.y + 1.6, z: v.z },
        velocity: { x: -Math.sin(v.yaw) * v.speed + Math.cos(v.yaw) * (v.lateralSpeed ?? 0), y: v.climb, z: -Math.cos(v.yaw) * v.speed - Math.sin(v.yaw) * (v.lateralSpeed ?? 0) } });
    }
    for (const r of raiders.values()) {
      const event = events.find(e => e.descriptor.id === r.event);
      if (r.kind !== 'gunship' || r.health <= 0 || !hostile(entry.actor, { bot: true, faction: event?.descriptor.faction ?? DEFAULT_BOT_FACTION })) continue;
      candidates.push({ id: `aircraft-${r.event}`, point: { x: r.x, y: r.y + 1.6, z: r.z }, velocity: { x: r.vx, y: r.vy, z: r.vz } });
    }
    for (const t of transports.values()) {
      const event = events.find(e => e.descriptor.id === t.event);
      if (t.mode !== 'air' || !t.visible || t.health <= 0 || t.state === 'departed' || !hostile(entry.actor, { bot: true, faction: event?.descriptor.faction ?? DEFAULT_BOT_FACTION })) continue;
      const driver = members.get(t.driver);
      candidates.push({ id: `aircraft-${t.event}`, point: { x: t.x, y: t.y + 1.6, z: t.z },
        velocity: { x: driver?.velocity?.x ?? 0, y: 0, z: driver?.velocity?.z ?? 0 } });
    }
    const range = Math.min(220, weaponRange(entry.spec ?? FPS_WEAPONS[entry.actor.weapon]));
    return candidates.filter(c => distance(entry.actor, c.point) <= range)
      .sort((a, b) => distance(entry.actor, a.point) - distance(entry.actor, b.point))
      .find(c => {
        const length = distance(entry.actor, c.point);
        if (length < .1) return false;
        const ray = { x: (c.point.x - entry.actor.x) / length, y: (c.point.y - entry.actor.y) / length, z: (c.point.z - entry.actor.z) / length };
        return clearSight(entry, c.id, ray, length, dt) && !smokeBetween(entry.actor, c.point);
      });
  }
  /** Island infantry can walk to, operate and yield the same exposed controls as players. */
  function stepMerlionBot(entry: InternalActor,dt:number) {
    if(!merlion)return false;
    const a=entry.actor,s=merlion.state;
    if(entry.anchor||entry.order&&entry.order.until>elapsed){if(s.operator===a.id)merlionAction(a.id,'leave');return false;}
    if(a.swimming||a.parachuting||a.vehicle||a.transport||Math.hypot(a.x,a.z-MERLION.z)>6||arenaConditionModifiers(a.conditions).dazed)return false;
    if(s.operator&&s.operator!==a.id)return false;
    const target=[...members.values()].filter(m=>{
      const origin=merlionMouth(Math.atan2(-m.actor.x,MERLION.z-m.actor.z)),length=distance(origin,m.actor);
      if(!m.actor.alive||m.reserve||!hostile(a,m.actor)||length<.01||length>=MERLION.range||smokeBetween(a,m.actor))return false;
      const ray={x:(m.actor.x-origin.x)/length,y:(m.actor.y-origin.y)/length,z:(m.actor.z-origin.z)/length};
      return merlionTrace(origin,ray,length)>=length-.1;
    })
      .sort((x,y)=>distance(a,x.actor)-distance(a,y.actor))[0]?.actor;
    if(!target){
      if(s.operator===a.id)merlionAction(a.id,'leave');
      if((entry.boatIslandUntil??0)>elapsed){const posts=[{x:2.6,z:-9},{x:-2.6,z:-9},{x:2.6,z:-15},{x:-2.6,z:-15}],post=posts[(entry.boatGuard??0)%posts.length];
        if(a.health<entry.healthMax*.75&&nearMerlion(a,'cache'))merlionAction(a.id,'supply');
        if(Math.hypot(a.x-post.x,a.z-post.z)>.6)walkBoatInfantry(entry,post,dt);return true;
      }
      return false;
    }
    if(!nearMerlion(a,'console')){
      const goal={...MERLION.console,y:0};
      if(entry.navigation)entry.navigation.retry-=dt;
      if(navigator&&(!entry.navigation||entry.navigation.target.x!==goal.x||entry.navigation.target.z!==goal.z||!entry.navigation.pending&&!entry.navigation.path.length&&entry.navigation.retry<=0))entry.navigation={path:[],target:goal,retry:1.5,pending:navigator.plan({x:a.x,y:Math.max(0,a.y-1.75),z:a.z},goal)};
      while(entry.navigation?.path.length&&Math.hypot(entry.navigation.path[0].x-a.x,entry.navigation.path[0].z-a.z)<.35)entry.navigation.path.shift();
      const next=entry.navigation?.path[0]??goal;
      const dx=next.x-a.x,dz=next.z-a.z,d=Math.hypot(dx,dz),step=Math.min(d,entry.role!.speed*dt);
      if(traversal){const p=traversal.move({x:a.x,y:Math.max(0,a.y-1.75),z:a.z,velocityY:0},dx/d*step,dz/d*step,dt,.4,1.8);Object.assign(a,{x:p.x,y:p.y+1.75,z:p.z});}
      else Object.assign(a,move(a,dx/d*step,dz/d*step,.4,obstacles));
      return true;
    }
    entry.navigation=undefined;
    if(!s.operator)merlionAction(a.id,'operate');
    a.prone=false;a.yaw=Math.atan2(-target.x,MERLION.z-target.z);
    const origin=merlionMouth(a.yaw);a.pitch=Math.atan2(target.y-origin.y,Math.hypot(target.x-origin.x,target.z-origin.z));
    if(distance(a,target)<8&&s.cooldown===0)merlionAction(a.id,'mist');
    merlion.input(a,!!target,true);
    // Relieve an exhausted post rather than permanently occupying it.
    if(s.pressure<.05&&s.recovering>0)merlionAction(a.id,'leave');
    return true;
  }
  function stepBot(entry: InternalActor, dt: number) {
    const actor = entry.actor;
    const riding=!!actor.lift && !!traversalWorld?.lifts?.some(l=>l.id===actor.lift && liftSample(l,elapsed).moving);
    if(riding && entry.heal){entry.heal=undefined;delete actor.healing;}
    const conditions = arenaConditionModifiers(actor.conditions);
    if (conditions.frozen) { entry.target = ''; entry.burst = 0; entry.aimFocus = undefined; return; }
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
    if (entry.threat && entry.threat.until <= elapsed) entry.threat = undefined;
    const threat: BotThreat | undefined = entry.threat;
    // A side that is surging hunts beyond its own ground.
    const leash = HOME_LEASH * (1 + (factionHeat && entry.home && isSquad(actor.faction) ? factionHeat.surgeAt(actor.faction, entry.home) : 0));
    const enemies = [...members.values()].filter(m => m !== entry && m.actor.alive && !m.reserve && hostile(actor, m.actor) && !(entry.temporary && m.temporary?.event === entry.temporary.event && m.actor.faction === actor.faction) &&
      (m.anchor?.y === undefined || m.actor.id === grudge) && (!entry.home || distance(actor, m.actor) < leash));
    const reported = threat ? members.get(threat.id) : undefined;
    const confirmed: InternalActor | undefined = reported && hostile(actor, reported.actor) && seesThreat(entry, reported, weaponRange(entry.spec ?? FPS_WEAPONS[actor.weapon]), dt) ? reported : undefined;
    const focused = focusTarget(entry);
    const candidates = enemies.sort((a, b) => distance(actor, a.actor) * (a.actor.bot ? 1.1 : 1) - distance(actor, b.actor) * (b.actor.bot ? 1.1 : 1));
    for (const priority of [focused, confirmed]) if (priority && !candidates.includes(priority)) candidates.push(priority);
    const spotting = entry.spotting ??= createBotSpotting();
    const observations: SpottingCandidate[] = candidates.map(m => ({ id: m.actor.id, life: m.actor.deaths,
      position: m.actor, distance: distance(actor, chestOf(m.actor)), referenceRange: sightRangeAgainst(role.sightRange, m.insert),
      speed: m.speed ?? 0, stance: m.actor.vehicle || m.actor.transport ? 'stand' : spottingStance(m.actor.prone, m.actor.y, m.actor.ground ?? floorAt(m.actor)),
      flashAt: m.shotFlash?.at, flare: m.shotFlash?.flare }));
    const identified = spotting.update(observations, elapsed, dt, c => {
      const target = members.get(c.id);
      return !!target && seesThreat(entry, target, weaponRange(entry.spec ?? FPS_WEAPONS[actor.weapon]), ARENA_SIGHT_RECHECK);
    }, focused?.actor.id, confirmed?.actor.id);
    const enemy: InternalActor | undefined = identified ? members.get(identified) : undefined;
    const aircraft = heavyAircraftTarget(entry, dt);
    const targetId = aircraft?.id ?? enemy?.actor.id;
    const focusKey = aircraft?.id ?? (enemy ? `${enemy.actor.id}:${enemy.actor.deaths}` : undefined);
    entry.patrolTime -= dt;
    if (entry.patrolTime <= 0) {
      const home = entry.home ? homeSpawns(entry.home) : validSpawns, pool = home.length ? home : validSpawns;
      entry.patrol = pool[Math.floor(random() * pool.length)]; entry.patrolTime = 3 + random() * 3; entry.strafe *= -1;
    }
    const searching = threat?.point ?? spotting.lastKnown(elapsed);
    const target: ArenaPoint = aircraft?.point ?? enemy?.actor ?? (searching ?? { ...(entry.mission ?? entry.patrol), y: 1.75 });
    const dx = target.x - actor.x; const dz = target.z - actor.z; const horizontal = Math.hypot(dx, dz);
    const direction = { x: dx / Math.max(horizontal, 0.01), y: 0, z: dz / Math.max(horizontal, 0.01) };
    const line = { x: target.x - actor.x, y: (aircraft ? target.y : enemy?.actor.prone ? target.y - PRONE_EYE_HEIGHT + .35 : target.y - .65) - actor.y, z: target.z - actor.z };
    const visible = !conditions.dazed && (!!enemy || !!aircraft);
    if (visible && !aircraft && threat && enemy?.actor.id === threat.id) { threat.point = { x: target.x, y: target.y, z: target.z }; threat.until = elapsed + BOT_THREAT.memory; }
    if (visible) entry.lastContact = { x: target.x, y: target.y, z: target.z, time: elapsed };
    const contact = entry.lastContact;
    if (!riding && !visible && contact && elapsed - contact.time < 6 && horizontal <= 25 && actor.grenade && grenadeSystem.live.filter(g => members.get(g.caller)?.actor.bot).length < 3 && elapsed - (entry.lastGrenadeAt ?? -Infinity) >= 20) {
      const dx = contact.x - actor.x, dz = contact.z - actor.z, d = Math.hypot(dx, dz), speed = itemById(actor.grenade)!.grenade!.throwSpeed;
      if (d >= 5 && d <= 25) { const angle = Math.asin(Math.min(.95, 9.8 * d / (speed * speed))) / 2;
        throwGrenade(actor.id, { id: actor.grenade, origin: actor, direction: { x: dx / d * Math.cos(angle), y: Math.sin(angle), z: dz / d * Math.cos(angle) }, under: false, cooked: 0 }); }
    }
    if (!riding && !aircraft && actor.duty!=='sentry'&&!actor.patrolSector&&tryBoardVehicle(entry, dt)) { entry.aimFocus = undefined; return; }
    if (role.id === 'overwatch') { if (visible) actor.aiming = true; else delete actor.aiming; }
    if (visible) { if (elapsed - (entry.lastFight ?? -Infinity) > 6) bark(entry, 'contact'); entry.lastFight = elapsed; }
    const patrolling=actor.patrolSector&&(actor.duty==='patrol'||actor.duty==='investigate')&&!entry.order;
    if(patrolling&&sectorPatrols) {
      const before=entry.investigation,clue=enemy?.actor??searching;
      entry.investigation=advancePatrolInvestigation(before,clue,actor,elapsed,p=>sectorPatrols.contains(actor.patrolSector!,p,SECTOR_PATROL.pursuitMargin)&&clearSpawn(p));
      const active=entry.investigation&&elapsed<entry.investigation.until;
      if(!!active!==(!!before&&elapsed-dt<before.until))entry.navigation=undefined;
      actor.duty=active?'investigate':'patrol';
    }
    const intent = role.think({ distance: horizontal, visible, healthFraction: actor.health / entry.healthMax, strafeDirection: entry.strafe });
    let approach = Number.isFinite(intent.approach) ? clamp(intent.approach, -1, 1) : 0;
    const wounded = botWantsHeal({ health: actor.health, healthMax: entry.healthMax, medkits: entry.medkits, sinceHurt: elapsed - entry.lastHurt, visible, danger: !!dangerExit(actor) });
    if (!riding && wounded === 'heal') {
      const feet = Math.max(0, actor.y - 1.75);
      entry.aimFocus = undefined;
      entry.heal = { time: 0, feet, started: elapsed }; actor.healing = 0; actor.y = feet + BOT_HEAL.kneelEye; entry.burst = 0; entry.target = '';
      bark(entry, 'healing');
      return;
    }
    // Wounded with someone in view: back away to break the line before patching up.
    if (wounded === 'retreat' && visible) { approach = -1; bark(entry, 'retreat'); }
    let strafe = Number.isFinite(intent.strafe) ? clamp(intent.strafe, -1, 1) : 0;
    // Objective movement and danger avoidance take priority over deliberate fire.
    if (visible && entry.aimFocus?.target === focusKey && horizontal >= BOT_AIM.controlledRange && (entry.aimFocus?.exposure ?? 0) >= .6 &&
      !entry.mission && !entry.order && !threat && !wounded) { approach = 0; strafe = 0; }
    // Brace against aircraft instead of trying to navigate to a point in the sky.
    if (aircraft && !wounded) { approach = 0; strafe = 0; }
    const normal = Math.max(1, Math.hypot(approach, strafe));
    let dxStep = (direction.x * approach - direction.z * strafe) / normal * role.speed * dt;
    let dzStep = (direction.z * approach + direction.x * strafe) / normal * role.speed * dt;
    const evading = threat && elapsed < threat.evadeUntil ? threat : undefined;
    const assignment = entry.assignment;
    if (assignment?.via && (elapsed >= assignment.until || Math.hypot(actor.x-assignment.via.x,actor.z-assignment.via.z)<5)) {
      assignment.via=undefined; entry.navigation=undefined;
    }
    const investigation=patrolling&&entry.investigation&&elapsed<entry.investigation.until?entry.investigation.point:undefined;
    const mission = investigation?{...investigation,y:patrolGround(investigation.x,investigation.z)+1.75}:assignment?.via??entry.mission;
    const destination: ArenaPoint = evading?.cover ?? (mission ? { ...mission, y: mission.y ?? 1.75 } : target);
    if (evading?.cover) {
      const d = Math.hypot(destination.x - actor.x, destination.z - actor.z), step = Math.min(Math.max(0, d - .4), role.speed * dt);
      dxStep = (destination.x - actor.x) / Math.max(.001, d) * step; dzStep = (destination.z - actor.z) / Math.max(.001, d) * step;
    }
    if (evading && !evading.cover) {
      dxStep = -direction.z * entry.strafe * role.speed * dt;
      dzStep = direction.x * entry.strafe * role.speed * dt;
    }
    if (mission && !evading) {
      const step = objectiveStep(actor, mission, { dx: dxStep, dz: dzStep }, role.speed * dt);
      dxStep = step.dx; dzStep = step.dz;
    }
    if (aircraft && !mission && !evading?.cover) entry.navigation = undefined;
    const routeNeeded = !!mission || !visible && !!searching || !!evading?.cover || !aircraft && Math.abs(target.y - actor.y) > .6 || !!entry.navigation?.pending || !!entry.navigation?.path.length;
    if (!routeNeeded) entry.navigation = undefined;
    if(!riding && !entry.anchor && (!evading || !!evading.cover) && ((navigator && routeNeeded) || entry.navigation?.path.length)) {
      const feet={x:actor.x,y:Math.max(0,actor.y-1.75),z:actor.z};
      const goal={x:destination.x,y:floorAt(destination),z:destination.z};
      if(entry.navigation) entry.navigation.retry-=dt;
      if(navigator && (!entry.navigation || !entry.navigation.pending && entry.navigation.retry<=0 && (!entry.navigation.path.length && distance(feet,goal)>.7 || distance(entry.navigation.target,goal)>4))) {
        const traffic=[...members.values()].filter(m=>m!==entry && m.actor.alive && m.actor.faction===actor.faction && m.actor.squad!==actor.squad)
          .flatMap(m=>m.navigation?.path.filter((_,i)=>i%3===0) ?? []);
        const blockers=botVehicleObstacles().navigation;
        entry.navigation={path:[],target:goal,retry:1.5,pending:navigator.plan(feet,goal,p=>traffic.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<8)?12:0,blockers)};
      }
      if (entry.navigation?.pending) { dxStep=0; dzStep=0; }
      const path=entry.navigation?.path;
      while(path?.length && distance(feet,path[0])<.12)path.shift();
      if(path?.length){const p=path[0],d=Math.hypot(p.x-actor.x,p.z-actor.z),step=Math.min(d,role.speed*dt);dxStep=(p.x-actor.x)/Math.max(d,.001)*step;dzStep=(p.z-actor.z)/Math.max(d,.001)*step;}
    }
    // With nobody in sight, a patrol makes for a supply crate on the ground.
    const crate = !visible && !searching && !entry.temporary && !entry.order && !entry.mission ? lureFor(actor) : null;
    if (crate) {
      const cx = crate.x - actor.x, cz = crate.z - actor.z, d = Math.hypot(cx, cz), stride = Math.max(0, Math.min(d - 1, role.speed * dt));
      dxStep = d > .01 ? cx / d * stride : 0; dzStep = d > .01 ? cz / d * stride : 0;
    }
    if (entry.evacuating && (elapsed >= entry.evacuating.until || Math.hypot(entry.evacuating.x - actor.x, entry.evacuating.z - actor.z) < .5)) entry.evacuating = undefined;
    const escaping = entry.evacuating;
    // A player's order steers the feet and leaves the eyes and trigger alone.
    const ordered = orderedStep(entry, role.speed, dt);
    if (ordered) { dxStep = ordered.dx; dzStep = ordered.dz; }
    if (escaping) {
      const dx = escaping.x - actor.x, dz = escaping.z - actor.z, d = Math.hypot(dx, dz), stride = Math.min(d, role.speed * 1.3 * dt);
      dxStep = dx / Math.max(d, .001) * stride; dzStep = dz / Math.max(d, .001) * stride;
    }
    if (mission && !ordered && !escaping && !evading && !entry.navigation?.pending) {
      const step = spacedObjectiveStep(actor, {dx:dxStep,dz:dzStep}, [...members.values()]
        .filter(m=>m!==entry && m.actor.alive && !m.reserve && !m.actor.vehicle && m.actor.faction===actor.faction).map(m=>m.actor),
        role.speed*dt, Math.min(Math.hypot(destination.x-actor.x,destination.z-actor.z),
          entry.navigation?.path[0] ? Math.hypot(entry.navigation.path[0].x-actor.x,entry.navigation.path[0].z-actor.z) : Infinity));
      dxStep=step.dx; dzStep=step.dz;
    }
    // Bots run from a marked barrage, still firing if they can see someone. An event's crew holds its post.
    const exit = entry.anchor ? null : dangerExit(actor);
    if (exit) { dxStep = exit.x * role.speed * 1.3 * dt; dzStep = exit.z * role.speed * 1.3 * dt; }
    if (exit && !entry.barkFleeing) bark(entry, 'incoming');
    entry.barkFleeing = !!exit;
    const vehicleSolids = botMovementObstacles();
    const beforeMove={x:actor.x,z:actor.z};
    if (riding) { dxStep=0; dzStep=0; }
    else if (entry.anchor) Object.assign(actor, { x: entry.anchor.x, z: entry.anchor.z });
    else if (traversal) {
      const step = traversal.move({ x: actor.x, y: Math.max(0, actor.y - 1.75), z: actor.z, velocityY: entry.velocityY ?? 0 }, dxStep, dzStep, dt, .4, 1.8, vehicleSolids);
      Object.assign(actor, { x: step.x, z: step.z, y: step.y + 1.75 }); entry.velocityY = step.velocityY;
    } else Object.assign(actor, move(actor, dxStep, dzStep, .4, [...groundObstacles, ...vehicleSolids]));
    if (entry.navigation?.path.length && !ordered) {
      const intended=Math.hypot(dxStep,dzStep),actual=Math.hypot(actor.x-beforeMove.x,actor.z-beforeMove.z);
      entry.navigation.stuck=intended>.02 && actual<intended*.2 ? (entry.navigation.stuck??0)+dt : 0;
      if (entry.navigation.stuck>1.5) {entry.navigation.path=[];entry.navigation.retry=0;}
    }
    actor.yaw = escaping && !exit ? Math.atan2(-dxStep, -dzStep) : Math.atan2(-dx, -dz); actor.pitch = Math.atan2(line.y, horizontal);
    const stride = entry.anchor ? 0 : Math.hypot(dxStep, dzStep) / Math.max(1e-6, role.speed * dt);
    // An event's crew may not open fire before the event has been announced; a bot waiting its turn on a player holds fire.
    const reaction = Math.max(.1, role.reaction + (entry.rank?.reaction ?? 0));
    if (escaping || !visible || !intent.fire || (entry.temporary && elapsed < entry.temporary.from) || (!aircraft && (!enemy || !takeTurn(entry, enemy)))) { entry.aimFocus = advanceBotAimFocus(entry.aimFocus, undefined, dt); entry.reaction = reaction; entry.target = ''; entry.burst = 0; return; }
    entry.aimFocus = advanceBotAimFocus(entry.aimFocus, focusKey, dt);
    if (entry.target !== targetId) { entry.target = targetId!; entry.reaction = reaction + random() * 0.3; entry.burst = 0; }
    entry.reaction -= dt;
    if (entry.reaction <= 0) {
      // Bursts at the weapon's own cycle, then a pause the role decides.
      if (entry.burst <= 0) { const [low, high] = role.burst ?? [1, 1]; entry.burst = Math.min(botBurstLimit(role.id, horizontal), low + Math.floor(random() * (high - low + 1))); entry.burstFired = 0; }
      // The role's aim error, steadier with rank, wide on first sight and against a mover; recoil opens it through a burst.
      const base = (Number.isFinite(intent.spread) ? clamp(intent.spread, 0.005, 0.2) : 0.05) * (entry.rank?.aim ?? 1) * botAimScale(entry.aimFocus?.exposure ?? 0, botTransverseSpeed(direction, aircraft?.velocity ?? enemy?.velocity), stride, horizontal, actor.faction === PLAYER_FACTION ? 'normal' : difficulty());
      const spread = entry.spec ? botShotSpread(base, entry.spec, entry.burstFired) : base;
      const chest = { x: line.x + actor.x, y: line.y + actor.y, z: line.z + actor.z };
      const aim = aircraft ? leadPoint(entry, actor, chest, aircraft.velocity) : leadRay(entry, actor, enemy!, chest);
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
    return leadPoint(entry, from, chest, enemy.velocity);
  }
  function leadPoint(entry: InternalActor, from: ArenaPoint, chest: ArenaPoint, motion?: { x: number; y?: number; z: number }) {
    const ballistics = entry.spec?.ballistics ?? entry.weapons[entry.actor.weapon]?.ballistics;
    const range = Math.hypot(chest.x - from.x, chest.y - from.y, chest.z - from.z);
    const flight = ballistics && !isInstant(ballistics) ? range / ballistics.velocity : 0, lead = (entry.rank?.lead ?? .6) * flight, velocity = motion ?? { x: 0, z: 0 };
    const point = { x: chest.x + velocity.x * lead - from.x, y: chest.y + (velocity.y ?? 0) * lead + .5 * (ballistics?.drop ?? 0) * flight * flight - from.y, z: chest.z + velocity.z * lead - from.z };
    const length = Math.hypot(point.x, point.y, point.z) || 1;
    return { x: point.x / length, y: point.y / length, z: point.z / length };
  }
  /** A player's spawn shield as the snapshot carries it: seconds left, while it holds. */
  /** A player's wait for HQ's next transport, as the snapshot carries it. */
  const reinforceOf = (m: InternalActor) => {
    const wait = m.reinforcedAt !== undefined && m.reinforcedAt <= elapsed ? ORDER_TUNING.reinforce.cooldown - (elapsed - m.reinforcedAt) : 0;
    return !m.actor.bot && wait > 0 ? { reinforceIn: Math.ceil(wait) } : {};
  };
  const shieldOf = (m: InternalActor) => {
    const shield = Math.round(Math.max(0, (m.shieldUntil ?? 0) - elapsed) * 100) / 100;
    return !m.actor.bot && m.actor.alive && shield > 0 ? { shield } : {};
  };
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
    if (facilities) {
      const post = facilities.sites.find(s => s.kind === 'command' && facilityOperational(s, caller.actor.faction));
      return { allies: 0, note: post ? `HQ: Reinforcements deploy at ${post.name}. Next wave in ${Math.ceil(post.deployIn)} s, subject to supplies and a clear exit.` : 'HQ: Command posts offline. Reserve transports arrive on the slower reserve schedule. Secure or rebuild a post.' };
    }
    const { cooldown, squad, drop } = ORDER_TUNING.reinforce, last = caller.reinforcedAt;
    // A rematch rewinds the clock; a transport "sent" after now is from the last match.
    if (last !== undefined && last <= elapsed && elapsed - last < cooldown) return { allies: 0, note: `HQ: Negative. Next transport in ${Math.ceil(cooldown - (elapsed - last))} s.` };
    const room = Math.min(squad, regularLimit - [...members.values()].filter(m => m.actor.bot && !m.temporary).length, Math.max(0, MAX_ARENA_ACTORS - members.size - 1));
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
    transports.get(descriptor.id)!.passengers = room;
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
  let navigationDeadline = 0, navigationCursor = 0;
  function stepNavigation() {
    const pending=[...members.values()].filter(m=>m.actor.alive && m.navigation?.pending);
    if (!pending.length) return;
    navigationDeadline = performance.now() + NAVIGATION_BUDGET;
    let work=0;
    // Rotate the first job every tick; a large roster cannot starve its last squads.
    while (performance.now()<navigationDeadline && pending.length && work++<4000) {
      navigationCursor%=pending.length;
      const navigation=pending[navigationCursor].navigation!;
      const result=navigation.pending!.next();
      if (result.done) { navigation.path=result.value; navigation.pending=undefined; pending.splice(navigationCursor,1); }
      else navigationCursor++;
    }
    navigationCursor++;
  }
  function step(dt: number) {
    if (finished || !Number.isFinite(dt) || dt <= 0) return;
    navigationDeadline = performance.now() + NAVIGATION_BUDGET;
    threatCoverQueries = 0;
    dt = Math.min(dt, 0.25);
    for (const entry of members.values()) if (!entry.actor.bot && entry.actor.alive && entry.playing) {
      entry.actor.rentalTimeMs = (entry.actor.rentalTimeMs ?? 0) + dt * 1000;
      for (const weapon of [...entry.weapons, ...(entry.nextWeapons?.weapons ?? [])]) if (weapon.rentalRemainingMs !== undefined) weapon.rentalRemainingMs = Math.max(0, weapon.rentalRemainingMs - dt * 1000);
      for (const id of Object.keys(entry.equipmentRentals ?? {})) entry.equipmentRentals![id] = Math.max(0, entry.equipmentRentals![id] - dt * 1000);
    }
     elapsed = environment?.endless ? elapsed + dt : Math.min(ARENA_DURATION, elapsed + dt); tick++;
    stepFacilities(dt); stepSquads(dt);
    // Wreck cleanup is independent of nearby players, facility supply and replacement safety.
    for (const v of vehicles) {
      const life = lifeOf(v);
      life.wreck = v.health <= 0 ? life.wreck + dt : 0;
      if (v.health <= 0 && !v.occupants.some(Boolean) && life.wreck >= WORLD_VEHICLES.despawnSeconds) v.despawned = true;
    }
    if (vehicleOptions?.openWorld) stepVehicleBrains(dt);
    if(merlion&&vehicleOptions)stepDragonBoatBrains();
    for (let remaining = dt; remaining > 1e-6; remaining -= Math.min(.05, remaining)) stepVehicles(Math.min(.05, remaining));
    if (vehicleOptions?.openWorld||merlion&&vehicleOptions) stepVehiclePickups(dt);
    stepRounds(dt);
    factionHeat?.step(dt);
    stepEvents(dt);
    stepProxies(dt);
    stepGrenades(dt);
    const waterOperator=merlion?.state.operator?members.get(merlion.state.operator):undefined;
    if(waterOperator&&arenaConditionModifiers(waterOperator.actor.conditions).frozen)merlion?.action(waterOperator.actor,'leave');
    merlion?.step(dt,[...members.values()].filter(m=>!m.reserve).map(m=>m.actor),(a,strength)=>{
      const entry=members.get(a.id)!;
      (entry.actor.conditions??={})['water-eyes']={strength,remaining:.24,seconds:.24};
      if(strength>.8){entry.target='';entry.burst=0;entry.aimFocus=undefined;}
    });
    botVehicleGeometry=undefined;
    for(const entry of members.values()) {
      const a=entry.actor;
      if(a.alive&&!a.vehicle&&!a.parachuting)for(const l of traversalWorld?.lifts??[]){
        const before=liftSample(l,elapsed-dt),eye=a.y-before.y;
        if(eye<.5||eye>2.8)continue;
        const threshold=liftDeparture(l,elapsed-dt,elapsed,{x:a.x,z:a.z,y:before.y});
        if(threshold){a.x=threshold.x;a.z=threshold.z;if(threshold.board)a.lift=l.id;}
      }
      const lift=a.alive&&!a.vehicle&&!a.parachuting?(traversalWorld?.lifts??[]).find(l=>{const eye=a.y-liftSample(l,elapsed-dt).y;return insideLift(l,a)&&eye>=.5&&eye<=2.8;}):undefined;
      if(lift){a.y+=liftSample(lift,elapsed).y-liftSample(lift,elapsed-dt).y;a.lift=lift.id;}
      else delete a.lift;
    }
    for (const entry of members.values()) {
      entry.movementBudget = Math.min(8, entry.movementBudget + 40 * dt);
      entry.swimBudget=Math.min(.25,(entry.swimBudget??.08)+SWIMMING.speed*dt);
      if (entry.actor.bailoutAt !== undefined && (!entry.actor.alive || entry.actor.vehicle || elapsed - entry.actor.bailoutAt >= BAILOUT_ROLL_SECONDS)) delete entry.actor.bailoutAt;
      if (!entry.actor.alive) {
        entry.actor.respawnIn = Math.max(0, entry.actor.respawnIn - dt);
        // An event's crew does not come back: the body is cleared away once it has been seen to fall.
        if (entry.temporary) { if (entry.actor.respawnIn === 0) dismiss(entry.actor.id); continue; }
        if (entry.actor.respawnIn === 0) {
          // With reinforcements, a fallen bot comes back on a transport; only one left waiting too long walks back in.
          if (facilities && !entry.actor.bot) respawnPlayer(entry);
          else if (!environment?.reinforcements || !entry.actor.bot) spawn(entry);
          else { entry.waiting ??= elapsed; if (!facilities && !entry.ride && elapsed - entry.waiting > REINFORCEMENT_FALLBACK) spawn(entry); }
        }
        continue;
      }
      if (entry.parachute) { stepParachute(entry); continue; }
      if (entry.navalTransit) { stepNavalTransit(entry); continue; }
      const from = entry.lastAt ?? entry.actor, was = entry.velocity ?? { x: 0, z: 0 }, smooth = Math.min(1, dt * 6);
      const vx = clamp((entry.actor.x - from.x) / dt, -12, 12), vz = clamp((entry.actor.z - from.z) / dt, -12, 12);
      entry.velocity = { x: was.x + (vx - was.x) * smooth, z: was.z + (vz - was.z) * smooth }; entry.speed = Math.hypot(entry.velocity.x, entry.velocity.z);
      entry.lastAt = { x: entry.actor.x, z: entry.actor.z };
      if (!entry.actor.bot) stepMeals(entry, dt);
      const food = entry.meals ? arenaFoodModifiers(entry.meals) : NO_FOOD;
      entry.ammo.forEach((state, index) => advanceWeapon(state, index, dt, entry.weapons, { reload: food.reloadRate * arenaConditionModifiers(entry.actor.conditions).reload, cycle: food.cycleRate }));
      if (entry.actor.bot && !entry.actor.transport && !seatOf(vehicles, entry.actor.id)) {
        if(!tryBoardDragonBoat(entry,dt)&&!stepMerlionBot(entry,dt))stepBot(entry, dt);
        const reloading = (entry.ammo[entry.actor.weapon]?.reloadRemaining ?? 0) > 0;
        if (reloading && !entry.barkReload) bark(entry, 'reloading');
        entry.barkReload = reloading;
      }
      if (finished) break;
    }
    stepNavigation();
    stepBarks(dt);
    if (!environment?.endless && elapsed >= ARENA_DURATION && !finished) {
      finished = true;
      const leaders = [...members.values()].map(m => m.actor).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      winner = leaders.length > 1 && leaders[0].kills === leaders[1].kills && leaders[0].deaths === leaders[1].deaths ? 'Draw' : leaders[0]?.name ?? 'Draw';
      announce(`${winner === 'Draw' ? 'Draw' : `${winner} wins`} · time limit`);
    }
  }
  function snapshot(): ArenaSnapshot {
    const reinforcementClocks: ReinforcementClocks = { airborne: { mercenaries: Math.max(0, airborneAt.mercenaries - elapsed), 'armed-forces': Math.max(0, airborneAt['armed-forces'] - elapsed) }, naval: { mercenaries: Math.max(0, navalAt.mercenaries - elapsed), 'armed-forces': Math.max(0, navalAt['armed-forces'] - elapsed) }, external: { mercenaries: Math.max(0, reserveAt.mercenaries - elapsed), 'armed-forces': Math.max(0, reserveAt['armed-forces'] - elapsed) } };
    return { type: 'arena-snapshot', tick, elapsed, ...(merlion?{merlion:merlion.snapshot()}:{}), ...(proxies ? { proxies: proxies.snapshot() } : {}), ...(facilities || environment?.navalSites?.length || environment?.paratroopers ? { reinforcementClocks } : {}), ...(facilities ? { facilities: facilities.snapshot() } : {}), grenades: grenadeSystem.live.map(g => ({ ...g, position: { ...g.position }, velocity: { ...g.velocity }, landing: { ...g.landing } })), grenadeEvents: grenadeSystem.events.map(e => ({ ...e, point: { ...e.point } })), actors: [...members.values()].filter(m => !m.reserve).map(m => ({ ...m.actor, ...(m.actor.proxyTargets ? { proxyTargets: [...m.actor.proxyTargets] } : {}), ...(m.actor.conditions ? { conditions: structuredClone(m.actor.conditions) } : {}), ...shieldOf(m), ...reinforceOf(m) })), feed: feed.map(event => ({ ...event })), finished, winner, ...(vehicleOptions ? { vehicles: vehicles.map(v => ({ ...v, occupants: [...v.occupants], shotEnd: v.shotEnd ? { ...v.shotEnd } : null })) } : {}),
      ...(events.length ? { events: events.map(e => ({ ...e.descriptor, target: { ...e.descriptor.target }, ...(e.descriptor.origin ? { origin: { ...e.descriptor.origin } } : {}) })) } : {}),
      ...(transports.size ? { transports: [...transports.values()].map(({ event, mode, x, y, z, yaw, health, maxHealth, state, visible, driver, driverAlive, passengers, ramp }) => ({ event, mode, x, y, z, yaw, health, maxHealth, state, visible, driver, driverAlive, passengers, ...(ramp !== undefined ? { ramp } : {}) })) } : {}),
      ...(raiders.size ? { raiders: [...raiders.values()].map(({ event, kind, x, y, z, yaw, health, maxHealth, state, aim, shots, ammo }) => ({ event, kind, x, y, z, yaw, health, maxHealth, state, aim: aim ? { ...aim } : null, shots, ...(ammo !== undefined ? { ammo } : {}) })) } : {}),
      impacts: impacts.filter(e => elapsed - e.time <= IMPACT_LIFETIME).map(e => ({ ...e, point: { ...e.point }, direction: { ...e.direction } })),
      ...(factionHeat ? { heat: factionHeat.snapshot() } : {}), ...(flying.length ? { rounds: roundViews() } : {}),
      ...(barks.length ? { barks: barks.map(b => ({ ...b, ...(b.at ? { at: { ...b.at } } : {}) })) } : {}) };
  }
  function reset() {
    merlion?.reset();boatSorties.clear();boatDecisionAt.clear();
    if (proxies?.current()) { proxies.current()!.phase='complete'; proxies.current()!.cargo='resolved'; proxies.current()!.targets={'freedom-force':[],'collective-cops':[]}; }
    grenadeSystem.reset();
    facilities = environment?.facilities ? createFacilities(environment.facilities.sites) : null;
    botVehicleGeometry=undefined;
    squadObjectives.clear(); squadApproaches.clear(); sectorPatrols?.reset(); approachSerial = 0; squadThink = 0;
    for (const f of SQUAD_FACTIONS) { reserveAt[f] = FACILITY_RULES.reserveSeconds; navalAt[f] = NAVAL.interval; airborneAt[f] = PARATROOPERS.interval; }
    tick = 0; elapsed = 0; finished = false; winner = ''; feed.length = 0; barks.length = 0; replies.length = 0; barker.reset(); idleIn = BARK_TUNING.idleEvery[0]; controls.clear(); vehicleLife.clear(); airSortie=undefined;airDecisionAt.clear();aviationSeed=173821; events.length = 0; raiders.clear(); transports.clear(); airborneMissions.clear(); liveClouds = []; heat.clear(); interests.length = 0; director?.reset();
    flying.length = 0; landed.clear(); impacts.length = 0;
    for (const [id, entry] of members) if (entry.temporary) dismiss(id);
    // Back to the starting garrison: recruits were the reinforcements' doing.
    for (const [id, entry] of members) if (entry.recruit) members.delete(id);
    enlisted = Math.max(count, ...[...members.keys()].map(id => Number(/^bot-(\d+)$/.exec(id)?.[1] ?? 0))); factionHeat?.reset(); clock = dispatchClock();
    vehicles = vehicleOptions ? VEHICLE_KINDS.filter(kind=>vehicleOptions.spawns[kind]).map(kind => createSharedVehicle(kind, vehicleOptions.spawns[kind]!)) : [];
    if (facilities) for (const v of vehicles) { if(isDragonBoat(v.kind)) continue; const site = facilities.sites.find(s => s.kind === (v.kind === 'car' ? 'garage' : 'helipad')); if (!site || !facilityOperational(site)) v.health = 0; else v.faction = site.owner!; }
    for (const entry of members.values()) { entry.actor.kills = 0; entry.actor.deaths = 0; entry.actor.shots = 0; delete entry.actor.merlionSupply; entry.grenadeSupplies = { ...entry.initialGrenades }; entry.lastGrenadeAt = entry.lastMissionAt = undefined; spawn(entry); }
    announce('New arena match');
  }
  const count = environment?.battlefield ? BATTLEFIELD_POPULATIONS[environment.battlefield.size].mercenaries : Number.isFinite(botCount) ? Math.floor(clamp(botCount, 0, 6)) : 0;
  const fixedPopulation = environment?.reinforcements && Number.isFinite(environment.population) ? Math.floor(clamp(environment.population!, count, regularLimit)) : count;
  let enlisted = 0, friendly = 0;
  /** Friendly soldiers carry issued rifles, Ultimax support weapons or FN MAGs, and drop nothing. */
  const forcesFamily = (role: ArenaRolePlugin) => role.id === 'heavy' ? 3 : role.id === 'tank' ? 1 : 0;
  /** A recruit's role under heat: the hotter the side, the more support gunners and marksmen in the mix. */
  function heatedRole(faction: SquadFaction) {
    const s = factionHeat!.districtStrength(faction), weights = faction === PLAYER_FACTION ? [1, .3 * s, .3 * s, .2 * s] : [1, .2 + .8 * s, .2 + .5 * s, .2 + .5 * s];
    let roll = armamentRandom() * weights.reduce((a, b) => a + b, 0);
    return (['assault', 'tank', 'sniper', 'heavy'] as const).find((_, i) => (roll -= weights[i]) <= 0) ?? 'assault';
  }
  /**
   * Signs up the next soldier for a squad faction. The garrison spawns at once; a recruit is
   * held in reserve, dead and waiting, until the transport that booked it
   * sets it down.
   */
  function enlist(recruit = false, faction: SquadFaction = 'mercenaries') {
    const i = enlisted++, id = `bot-${i + 1}`;
    const roleId = recruit && factionHeat && (composition === 'mixed' || faction === PLAYER_FACTION) ? heatedRole(faction)
      : faction === PLAYER_FACTION ? 'assault' : composition === 'mixed' ? ['assault', 'heavy', 'sniper', 'tank'][i % 4] : composition;
    const role = getArenaRole(roleId) ?? getArenaRole('assault')!;
    const armed = faction === PLAYER_FACTION ? [forcesFamily(role)] : armamentFamilies(role), weapons = FPS_WEAPONS.map((w, index) => armed.includes(index) ? role.weapon : w);
    // Each spawn puts their rank's title before this.
    const name = faction === PLAYER_FACTION ? FORCES_NAMES[friendly++ % FORCES_NAMES.length] : CALLSIGNS[i % CALLSIGNS.length];
    // Recruits arrive unannounced: the transport's banner is their entrance.
    if (recruit) addMember(id, name, role.armor, role.absorption, weapons, false, undefined, role); else addPlayer(id, name, role.armor, role.absorption, weapons, undefined, false, undefined, role);
    const entry = members.get(id)!; entry.role = role; entry.healthMax = role.health; entry.callsign = name;
    Object.assign(entry.actor, { bot: true, role: role.id, faction });
    if (facilities || sectorPatrols?.areas.length) { const sameSide = [...members.values()].filter(m => m !== entry && m.actor.bot && !m.temporary && m.actor.faction === faction).length; entry.actor.squad = `${faction}-${Math.floor(sameSide / 4) + 1}`; }
    spawn(entry);
    if (facilities && !facilities.sites.some(s => s.kind === 'command' && facilityOperational(s, faction))) { entry.reserve = true; entry.actor.alive = false; entry.actor.respawnIn = 0; entry.waiting = elapsed; }
    if (recruit) { entry.recruit = true; entry.reserve = true; Object.assign(entry.actor, { alive: false, respawnIn: 0 }); entry.waiting = elapsed; }
    return entry;
  }
  for (let i = 0; i < count; i++) enlist();
  if (facilities) for (let i = 0; i < (environment?.battlefield ? BATTLEFIELD_POPULATIONS[environment.battlefield.size][PLAYER_FACTION] : 4); i++) enlist(false, PLAYER_FACTION);
  for (const id of environment?.departedCrew ?? []) members.delete(id);
  /** Snapshot only a living player's occupied hull and its living bot crew. */
  function vehicleTravel(id: string, district: string): VehicleCrewTransfer | null {
    const mounted = seatOf(vehicles, id);
    if (!mounted || !members.get(id)?.actor.alive || mounted.vehicle.health <= 0) return null;
    const sourceCrewIds = mounted.vehicle.occupants.filter((key): key is string => !!key && key !== id);
    if (sourceCrewIds.some(key => !members.get(key)?.actor.bot || !members.get(key)?.actor.alive)) return null;
    const names = new Map(sourceCrewIds.map(key => [key, key.includes(':') ? key : `${district}:${key}`]));
    const vehicle = structuredClone(mounted.vehicle);
    vehicle.occupants = vehicle.occupants.map(key => key ? names.get(key) ?? key : null);
    const crew = sourceCrewIds.map(key => {
      const { role: _role, navigation: _navigation, spotting: _spotting, ...data } = members.get(key)!;
      const copy = structuredClone(data); copy.actor.id = names.get(key)!;
      return copy;
    });
    return { vehicle, playerId: id, sourceCrewIds, elapsed, crew };
  }
  function detachVehicle(id: string) {
    const mounted = seatOf(vehicles, id); if (!mounted) return;
    for (const key of mounted.vehicle.occupants) if (key) {
      controls.delete(key);
      if (key !== id) members.delete(key);
      else { const actor = members.get(key)?.actor; if (actor) { delete actor.vehicle; delete actor.seat; } }
    }
    vehicles = vehicles.filter(v => v !== mounted.vehicle); vehicleLife.delete(mounted.vehicle.kind);
  }
  function restoreVehicleTravel(transfer: VehicleCrewTransfer, id: string) {
    if (!members.get(id)?.actor.alive || seatOf(vehicles, id) || !vehicleOptions || transfer.vehicle.health <= 0) return false;
    const resident = vehicles.find(v => v.kind === transfer.vehicle.kind);
    // Called during district construction, before any resident can board.
    if (resident?.occupants.some(Boolean)) return false;
    const v = structuredClone(transfer.vehicle);
    v.occupants = v.occupants.map(key => key === transfer.playerId ? id : key);
    if (transfer.crew.some(m => members.has(m.actor.id)) || members.size + transfer.crew.length > MAX_ARENA_ACTORS) return false;
    for (const data of transfer.crew) {
      const m: InternalActor = { ...structuredClone(data), role: getArenaRole(data.actor.role) };
      // Local goals and enemy references belong to the previous district.
      m.navigation = undefined; m.target = ''; m.sight = undefined; m.threat = undefined; m.grudge = undefined;
      m.mission = m.assignment = m.anchor = m.guardPatrol = m.investigation = undefined;
      m.focus = undefined; m.home = undefined; m.actor.objective = undefined;
      if (m.order?.kind === 'gather') { m.order.by = m.order.by === transfer.playerId ? id : m.order.by; m.order.until += elapsed - transfer.elapsed; m.order.since += elapsed - transfer.elapsed; }
      else m.order = undefined;
      if (m.reportTo === transfer.playerId) m.reportTo = id;
      m.actor.squad = `${v.faction ?? m.actor.faction}-travelling-crew`;
      m.patrol = { x: v.x, z: v.z }; m.patrolTime = 0; m.lastAt = undefined;
      m.lastHurt += elapsed - transfer.elapsed;
      if (m.heal) m.heal.started += elapsed - transfer.elapsed;
      m.vehicleBoardAfter = elapsed + WORLD_VEHICLES.boardCooldown;
      members.set(m.actor.id, m);
    }
    vehicles = vehicles.filter(other => other.kind !== v.kind); vehicles.push(v);
    const life = lifeOf(v); life.departed = true; life.crew = transfer.crew.map(m => m.actor.id);
    life.assembleUntil = elapsed; life.wait = elapsed;
    syncOccupants(); return true;
  }
  const navigationStatus = () => [...members.values()].filter(m=>m.actor.bot && m.actor.alive && m.actor.squad).map(m=>({id:m.actor.id,objective:m.actor.objective,duty:m.actor.duty,sector:m.actor.patrolSector,pending:!!m.navigation?.pending,path:m.navigation?.path.length??0,x:m.actor.x,z:m.actor.z,goal:m.navigation?.target,via:m.assignment?.via,mission:m.mission}));
  const patrolStatus = () => sectorPatrols?.status(elapsed)??[];
  const boatStatus=()=>[...boatSorties].map(([kind,s])=>({kind,pilot:s.pilot,phase:s.phase,returning:s.returning,berth:s.route?.berth.id,index:s.index,points:s.route?.points,crew:[...s.crew]}));
  return { navigationGraphStatus: () => navigator?.status() ?? null, boatStatus, merlionAction, vehicleTravel, detachVehicle, restoreVehicleTravel, triggerProxyOperation: startProxyOperation, proxyAction, patrolStatus, navigationStatus, playerDeployments, playerRespawn, choosePlayerRespawn, setPlayerAutoRespawn, setPlayerDeployment, facilityAction, vehicleAction, addPlayer, removePlayer, setInput, reloadPlayer, shoot, callout, takeHits, inFlight, step, snapshot, reset, setPlayerLoadout, setPlayerEquipmentRentals, queuePlayerWeapons, setPlayerVitals, setPlayerSupplies, setPlayerGrenades, throwGrenade, useSupply, setPlayerHealthMultiplier, triggerEvent, setCombatEvents };
}

export type ArenaSimulation = ReturnType<typeof createArena>;
