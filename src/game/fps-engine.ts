import { bipodRecoilMultiplier } from './weapon-support';
import { createWorldAtmosphere } from './world-atmosphere';
import { getRegion } from './regions';
import { createMovementMotion, resetMovementMotion, advanceGroundMotion, advanceBodyMotion, bufferJump, consumeJump, landMovement, INFANTRY_GRAVITY } from './fps-movement';
import { createVerticalMovement } from './vertical-movement';
import { elevatedLootAnchors } from './vertical-navigation';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import type { VehicleControls } from './vehicle-seats';
import { PRONE_EYE_HEIGHT, weaponBraced, unsupportedRecoilDamage, stanceRecoilMultiplier } from './fps-stance';
import { pickupSlot } from './armory-slots';
import { equipmentMovement } from './fps-encumbrance';
import { buildServiceWeapon } from './service-weapon-models';
import { impactSurfaceNormal } from './fps-impact-normal';
import { hitSurface } from './fps-surfaces';
import * as THREE from 'three';
import { requestFpsPointerLock, requiresFpsPointerLock, turnFpsLook, clampFpsPitch } from './fps-pointer';
import { dragLook, resolveMovement, stickKeys, type StickVector } from './touch-controls';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { advanceWeapon, beginReload, chamberRound, createLoadout, findTrait, fireWeapon, fullLoad, interruptReload, roundReady, validWeaponIndex, FPS_SPAWN, FPS_WEAPONS, hitDamage, movementInput, splashScale, type WeaponState } from './fps-rules';
import { firstVisibleHit, visibleHits } from './fps-raycast';
import { sectorAt, zoneSectors } from './zone-sectors';
import { advanceRound, createRound, needsFlight, skipRound, MAX_ROUNDS_IN_FLIGHT, MAX_SKIPS, type InFlightRound } from './fps-projectiles';
import { SKIP_ENERGY, splashWeight, waterRicochet } from './fps-splashes';
import { isWaterObject, rippleWater } from './water';
import { createFpsEffects, type ImpactKind } from './fps-effects';
import { advanceRecoil, compensateRecoil, createRecoil, recoilPose, recoilView, recordRecoilShot, resetRecoil, takeAimPush } from './fps-recoil';
import { effectStyleForWeapon } from './fps-effect-styles';
import { applyArmorDamage, consumeItem, createProfile, encikAddress, resolveLoadout, rewardAmount, completionXp, type ResolvedLoadout, type ExerciseReward, type ArmoryProfile, type VendorPurchaseResult } from './armory-state';
import { registerElimination, ELIMINATION_XP, type KillChain } from './progression';
import { createFpsVehicles } from './fps-vehicles';
import type { MinimapMarker } from './minimap';
import type { VehicleKind } from './vehicle-rules';
import { VEHICLE_COMBAT, vehicleBlastDamage, type VehicleDamageStage } from './vehicle-combat';
import { dressWeapon } from './armory-visuals';
import { createArenaRuntime } from './arena-runtime';
import type { ArenaActor, ArenaEnvironment, ArenaSnapshot, ArenaVitals } from './arena-rules';
import { createSoloSession, type LanSession } from './lan-peer';
import { buildDistrictWorld } from './district-world';
import { getFpsDistrict } from './fps-districts';
import { createExpeditionMarkers } from './expedition-visuals';
import { findWorldGateway, resolveWorldTransition, getWorldZone, type WorldZoneId, type WorldTransition, type ZoneSpawn } from './world-zones';
import type { ExpeditionLoot, FieldLoot } from './expedition-loot';
import { expeditionNpcs, nearestNpc, npcInteractionPrompt, type ExpeditionNpc } from './expedition-npcs';
import { itemById } from './armory-catalog';
import { DEFAULT_FPS_DEBUG, FPS_REGEN_DELAY, normalizeFpsDebug, readFpsDebug, regenerateHealth, saveFpsDebug, type FpsDebugSettings } from './fps-debug';
import { createWeaponHandling } from './fps-viewmodel';
import { createScopeRenderer, getWeaponSight } from './weapon-optics';
import { createOpticReflectionRenderer } from './weapon-reflections';
import { reloadMotion, reloadStage, smoothStep } from './fps-weapon-motion';
import { armReloadGate, reloadInterrupt } from './fps-reload';
import { createFpsComms, type CommsEntry } from './fps-comms';
import { createEncikRadio, type EncikAddress, type EncikCallout, type EncikEvent } from './fps-callouts';
import { createEncikAudio } from './encik-audio';
import { encikRecordingUrl } from './encik-recordings';
import { createPlayerPilot, normalizePilotAction, PILOT_INTERVAL, type PilotObservation, type PilotGoal, type PlayerPilot } from './fps-pilot';
import { visiblePilotContacts, type PilotSubject } from './fps-pilot-perception';
import { createStrategyPlanner, llmPilotStrategy } from './pilot-strategy';
import { findWorldRoute } from './world-zones';
import { advanceBloom, createWeaponBloom, recordBloomShot, sampleShotSpread, weaponSpread } from './fps-accuracy';
import { combatCues, combatPhase, combatTimeline, cratePose, flyerPose, getCombatEvent, transportPose, WHISTLE_LEAD, type CombatEventDescriptor } from './combat-events';
import { createCombatEventVisuals } from './combat-event-visuals';
import { createCombatAudio } from './combat-event-audio';
import { getEnvironmentSettings } from './environment-settings';
import { createHitDirectionOverlay, createHitDirections, hitStrength } from './fps-hit-direction';
import { advanceSupplyUse, startSupplyUse, supplyProfile, supplyProgress, SUPPLY_MOVE_SCALE, type SupplyProfile, type SupplyStyle, type SupplyUse } from './fps-healing';
import { createSupplyViewmodel } from './fps-supply-viewmodel';
import { createSunShadows } from './fps-sun-shadows';
import { createWorldOcclusion } from './world-occlusion';

export interface FpsArenaOptions { session: LanSession; botCount: number; composition?: string; profile: ArmoryProfile; environment?: ArenaEnvironment; initialVitals?: Partial<ArenaVitals> }
export interface FpsCheckpoint { health: number; armor: number; weapon: number; ammunition: WeaponState[]; pilot?: boolean; pilotStrategy?: 'local' | 'llm'; encikVoice?: boolean; comms?: readonly CommsEntry[] }
export interface FpsExpeditionOptions {
  zone: WorldZoneId; spawn?: ZoneSpawn; checkpoint?: FpsCheckpoint; profile: ArmoryProfile; loot: ExpeditionLoot;
  onTravel: (transition: WorldTransition, checkpoint: FpsCheckpoint) => void; onEquipment: (profile: ArmoryProfile) => void;
  onVendorPurchase: (catalogId: string, price: number) => VendorPurchaseResult;
}
const randomRoundId = () => globalThis.crypto?.randomUUID?.() ?? `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export interface FpsHud {
  encikCallout: EncikCallout | null; encikVoice: boolean; comms: readonly CommsEntry[];
  pilotStrategy: 'local' | 'llm'; pilotPlan: string;
  pilotEnabled: boolean; pilotStatus: string; pilotGoal: PilotGoal | null; pilotContacts: number;
  debug: FpsDebugSettings; debugAvailable: boolean; maxHealth: number;
  aimProgress: number; reloadEmpty: boolean;
  /** Share of the held weapon's interrupted reload already done; the next reload resumes from it. */
  reloadSaved: number;
  /** A round sits in the held weapon's chamber, counted in `magazine`. */
  chambered: boolean;
  /** The held weapon's magazine is out: an interrupted reload left the well empty. */
  magazineOut: boolean;
  /** A trigger pull on the held weapon would fire, cooldown and reload aside. */
  roundReady: boolean;
  /** The supply in the player's hands, while one is being used (G, or medical supplies taken with E). */
  supplyUse: { name: string; verb: string; progress: number; style: SupplyStyle } | null;
  crosshairSpread: number; hitKind: 'hit' | 'kill'; quickItem: string; quickType: 'FOOD' | 'UTILITY' | ''; quickCount: number;
  phase: 'loading' | 'ready' | 'playing' | 'paused' | 'complete' | 'defeated' | 'error';
  carriedWeapons: number[]; carriedKg: number; movementScale: number;
  weapon: number; magazine: number; reserve: number; reloading: number;
  prone: boolean; braced: boolean; hits: number; shots: number; landed: number; health: number; armor: number; incoming: boolean; hurt: boolean; lastDamage: number; earned: number; earnedXp: number; callout: string; chain: number; elapsed: number; aiming: boolean; hit: boolean;
  vehicleSeat: number | null; vehicleCanFire: boolean; vehicleSeats: { label: string; name: string; occupied: boolean; self: boolean }[];
  vehicleAimX: number; vehicleAimY: number; vehicleAimVisible: boolean;
  vehicleHealth: number; vehicleMaxHealth: number; vehicleAmmo: number; vehicleAmmoMax: number; vehicleWeapon: string; vehicleDamage: VehicleDamageStage;
  vehicle: VehicleKind | 'on-foot'; vehicleSpeed: number; altitude: number; interact: string; vehicleNotice: string; carDistance: number; helicopterDistance: number;
  locked: boolean; message: string; muted: boolean; x: number; z: number; yaw: number;
  /** Look pitch. Recoil moves this as well as the mouse, so nothing outside the
   * engine can dead-reckon where the shooter is pointing. */
  pitch: number; mapMarkers: MinimapMarker[];
  /** Which control scheme the round is running under; 'touch' skips pointer capture. */
  inputMode: 'mouse' | 'touch';
  arena: ArenaSnapshot | null; arenaSelf: ArenaActor | null; arenaConnected: boolean; arenaStarted: boolean;
  expeditionZone: WorldZoneId | null; lootPrompt: string; npcPrompt: string; travelPrompt: string; lootNotice: string; fieldLoot: FieldLoot[]; npcs: ExpeditionNpc[];
  credits: number; tokens: number;
  /** Named sub-area the player is standing in; '' on ground that belongs to none. */
  sector: string;
  /** The combat event that most concerns the player right now, if any. */
  combatBanner: { text: string; tone: 'hazard' | 'notice' } | null;
  /** Whether this round runs combat events the debug panel can call in. */
  combatEventsAvailable: boolean;
  /** Combat events on the map: rings for marked areas and crates, dots for aircraft in the air. */
  mapDangers: { id: string; x: number; z: number; radius: number; kind: 'ring' | 'crate' | 'raider' }[];
  /** Jammed: the map shows static and nothing on it. */
  mapJammed: boolean;
  /** Standing in smoke or gas, and how thick it is where you are, for a screen overlay. */
  cloudCover: { kind: 'smoke' | 'gas'; amount: number } | null;
  /** The district map is open full-size (M) instead of the corner minimap. */
  mapExpanded: boolean;
}
export const initialFpsHud: FpsHud = { supplyUse: null, mapExpanded: false, combatBanner: null, combatEventsAvailable: false, mapDangers: [], mapJammed: false, cloudCover: null, vehicleSeat: null, vehicleCanFire: false, vehicleSeats: [], vehicleAimX: 50, vehicleAimY: 50, vehicleAimVisible: true, vehicleHealth: 0, vehicleMaxHealth: 0, vehicleAmmo: 0, vehicleAmmoMax: 0, vehicleWeapon: '', vehicleDamage: 'intact', prone: false, braced: false, carriedWeapons: [0, 2], carriedKg: 0, movementScale: 1, quickItem: '', quickType: '', quickCount: 0, encikCallout: null, encikVoice: true, comms: [], pilotStrategy: 'local', pilotPlan: 'Local utility planner', pilotEnabled: false, pilotStatus: 'Player controls', pilotGoal: null, pilotContacts: 0, crosshairSpread: 6, hitKind: 'hit', aimProgress: 0, reloadEmpty: false, reloadSaved: 0, chambered: true, magazineOut: false, roundReady: true, debug: { ...DEFAULT_FPS_DEBUG }, debugAvailable: true, maxHealth: 100, phase: 'loading', weapon: 0, magazine: 30, reserve: 120, reloading: 0, hits: 0, shots: 0, landed: 0, health: 100, armor: 0, incoming: false, hurt: false, lastDamage: 0, earned: 0, earnedXp: 0, callout: '', chain: 0, elapsed: 0, aiming: false, hit: false, vehicle: 'on-foot', vehicleSpeed: 0, altitude: 0, interact: '', vehicleNotice: '', carDistance: 0, helicopterDistance: 0, locked: false, inputMode: 'mouse', message: '', muted: false, x: FPS_SPAWN.x, z: FPS_SPAWN.z, yaw: FPS_SPAWN.yaw, pitch: FPS_SPAWN.pitch, mapMarkers: [], arena: null, arenaSelf: null, arenaConnected: true, arenaStarted: false, expeditionZone: null, lootPrompt: '', npcPrompt: '', travelPrompt: '', lootNotice: '', fieldLoot: [], npcs: [], credits: 0, tokens: 0, sector: '' };

function disposeAssets(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  roots.forEach(root => root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      materials.add(m);
      Object.values(m).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
    });
  }));
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  textures.forEach(t => { t.dispose(); if (typeof ImageBitmap !== 'undefined' && t.source.data instanceof ImageBitmap) t.source.data.close(); });
}

export function createFpsEngine(host: HTMLDivElement, onHud: (hud: FpsHud) => void, options: { region?: WorldZoneId; playerPilot?: PlayerPilot; loadout?: ResolvedLoadout; combat?: boolean; arena?: FpsArenaOptions; expedition?: FpsExpeditionOptions; onComplete?: (reward: ExerciseReward) => void; onElimination?: (id: string) => void; onConsume?: (id: string) => void; onFullscreen?: () => void;
  /** Read per callout, so a level-up mid-exercise is heard immediately. */
  encik?: () => EncikAddress } = {}) {
  const expedition = options.expedition;
  const region = expedition?.zone ?? options.region ?? 'marina-bay';
  const district = getFpsDistrict(region), spawn = district.spawn, targetPositions = district.targets;
  const copyProfile = (profile: ArmoryProfile): ArmoryProfile => JSON.parse(JSON.stringify(profile));
  let fieldProfile = copyProfile(expedition?.profile ?? options.arena?.profile ?? createProfile());
  let equipment = expedition ? resolveLoadout(fieldProfile) : options.loadout || resolveLoadout(createProfile()), specs = equipment.weapons;
  const undress: (() => void)[] = [];
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  // Sun shadows follow the camera (fps-sun-shadows) and stay off on software renderers.
  renderer.shadowMap.enabled = false; renderer.autoClear = false;
  const canvas = renderer.domElement; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', `${expedition ? getWorldZone(expedition.zone).name + ' expedition' : district.label + ' range'}. WASD to move, mouse to look, click to fire.`);
  host.append(canvas);
  const zoneWorld = buildDistrictWorld(region, expedition?.spawn);
  const world = zoneWorld; world.stamps.forEach(o => o.visible = false);
  const atmosphere = createWorldAtmosphere(world.scene, getRegion(region).stamps, world.obstacles, !!options.arena && options.arena.session.role !== 'solo', renderer);
  const sunShadows = createSunShadows(renderer, world.scene);
  let footMovement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
  const expeditionSession = expedition ? createSoloSession('Explorer') : null;
  if (expedition && zoneWorld && expeditionSession) options = { ...options, arena: { session: expeditionSession, profile: fieldProfile, botCount: zoneWorld.zone.botCount, composition: zoneWorld.zone.composition, environment: zoneWorld.environment, initialVitals: expedition.checkpoint } };
  const vehicles = createFpsVehicles(world.scene, world.obstacles, equipment.vehicleSkins, { spawns: district.vehicles, bounds: world.bounds, deriveFlightObstacles: region !== 'marina-bay' });
  if (expedition) vehicles.root.visible = false;
  let arenaRuntime: ReturnType<typeof createArenaRuntime> | null = null;
  const chaseRay = new THREE.Raycaster();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.08, 800); camera.rotation.order = 'YXZ';
  const occlusion = createWorldOcclusion(renderer, world.scene, camera);
  const viewScene = new THREE.Scene(), viewCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 3);
  // The weapon has its own scene, so it is lit to match the world's hour by hand: same key direction, colour and balance.
  const viewSky = new THREE.HemisphereLight('#e4efff', '#576350', 2.1); viewScene.add(viewSky);
  const weaponLight = new THREE.DirectionalLight('#fff4dd', 2.5); weaponLight.position.set(1, 2, 1); viewScene.add(weaponLight);
  const VIEW_SKY = new THREE.Color('#e4efff'), VIEW_GROUND = new THREE.Color('#576350'), VIEW_KEY = new THREE.Color('#fff4dd');
  const viewTint = new THREE.Color(), viewQuaternion = new THREE.Quaternion();
  const scopeRenderer = createScopeRenderer(renderer);
  const opticReflections = createOpticReflectionRenderer(renderer);
  const rig = new THREE.Group(); viewScene.add(rig);
  // Hands and the supply in them; `apply` lands its effect at the commit point and says whether it could.
  const supplyHands = createSupplyViewmodel(viewScene);
  let supplyUse: (SupplyUse & { name: string; id: string; apply: () => boolean }) | null = null;
  let supplyGate = armReloadGate(false, false);
  const loader = new GLTFLoader(), templates: THREE.Group[] = [], weapons: THREE.Group[] = [];
  const handling: ReturnType<typeof createWeaponHandling>[] = [], emptyReload = specs.map(() => false);
  let aimProgress = 0, lastReloadStage = '';
  // Inputs held when a reload began, which do not interrupt it (see fps-reload).
  let reloadGate = armReloadGate(false, false), sprintIntent = false;
  const bloom = specs.map(() => createWeaponBloom());
  let spreadAngle = .005;
  const shotRight = new THREE.Vector3(), shotUp = new THREE.Vector3();
  const targets: { root: THREE.Group; hitZone: THREE.Mesh; alive: boolean; health: number; maxHealth: number; bar: THREE.Mesh }[] = [];
  const decorations = new THREE.Group(); world.scene.add(decorations);
  const targetGeometry = new THREE.CircleGeometry(0.265, 32);
  const headGeometry = new THREE.CircleGeometry(0.115, 20);
  const targetMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  // How each equipped weapon's shots look, resolved from the armoury: a premium
  // variant flares, traces and ejects in its own accent without the engine
  // knowing anything beyond "weapon 0" and "weapon 1". See fps-effect-styles.
  const weaponStyles = specs.map(effectStyleForWeapon);
  // Muzzle flare, brass, sparks, dust, scorches and tracers, pooled and batched.
  // Its whole world-space tree carries `fpsEffect`, so gameplay rays skip it.
  const effects = createFpsEffects(world.scene, viewScene, { style: weaponStyles[0] });
  effects.setStyles(weaponStyles, 0);
  // Combat events are drawn from the descriptors the authority publishes.
  const eventRay = new THREE.Raycaster();
  const combatVisuals = createCombatEventVisuals(world.scene, (origin, direction, far) => {
    eventRay.set(origin, direction); eventRay.near = 0; eventRay.far = far;
    return firstVisibleHit(eventRay, gameplayCandidates())?.point ?? null;
  }, { reduced: () => getEnvironmentSettings().reducedEffects || !!motionPreference?.matches });
  const combatAudio = createCombatAudio(() => audio, () => hud.muted);
  const seenEvents = new Set<string>(), openedSupplies = new Set<string>();
  let eventClock = -1, shake = 0, lockBeep = 0, blackout = 0;
  const debugAvailable = !options.arena || options.arena.session.role === 'solo';
  let debug = debugAvailable ? readFpsDebug() : { ...DEFAULT_FPS_DEBUG }, recoveryDelay = 0;
  const keys = new Set<string>(); const hud: FpsHud = { ...initialFpsHud, weapon: equipment.carriedFamilies[0], carriedWeapons: equipment.carriedFamilies, debug, debugAvailable, quickItem: equipment.quickItem?.name || '', quickType: equipment.quickItem ? equipment.quickItem.supplyType === 'food' ? 'FOOD' : 'UTILITY' : '', quickCount: equipment.quickCount, health: 100 * debug.healthMultiplier, maxHealth: 100 * debug.healthMultiplier, armor: equipment.armor, expeditionZone: expedition?.zone ?? null,
    credits: fieldProfile.credits, tokens: fieldProfile.tokens };
  const npcs = expedition ? expeditionNpcs(expedition.zone, zoneSectors(expedition.zone)) : [];
  hud.npcs = npcs.map(npc => ({ ...npc }));
  if (expedition && zoneWorld) hud.fieldLoot = expedition.loot.enterZone({ id: expedition.zone, spawn: zoneWorld.zone.spawn, bounds: zoneWorld.bounds, obstacles: world.obstacles, canStand: (x, z, radius) => footMovement.canOccupy(x, 0, z, radius, 1.8), elevatedAnchors: elevatedLootAnchors(getWalkSurfaces(world.scene), footMovement), anchors: zoneWorld.zone.encounterSpawns, sectors: zoneSectors(expedition.zone) });
  const markers = expedition ? createExpeditionMarkers(world.scene, expedition.zone, hud.fieldLoot, npcs) : null;
  let checkpointPending = expedition?.checkpoint;
  // Which bots were last seen alive, so a death is noticed once.
  const botsAlive = new Map<string, boolean>();
  let travelPending = false, lootNoticeTime = 0;
  const greetedNpcs = new Set<string>(), dialogueProgress = new Map<string, number>();
  const encik = createEncikRadio(Math.random, () => options.encik?.() ?? encikAddress(fieldProfile)), comms = createFpsComms(expedition?.checkpoint?.comms);
  hud.encikVoice = expedition?.checkpoint?.encikVoice ?? true;
  let killChain: KillChain = { count: 0, lastAt: -Infinity }, calloutTime = 0;
  let roundId = randomRoundId(), attackTimer = 3, hurtTime = 0;
  // Arcs around the crosshair towards whatever hit you; `hurtSerial` is the last arena hit seen.
  const hitDirections = createHitDirections(), hitOverlay = createHitDirectionOverlay(host);
  let hurtSerial = -1;
  const viewer = () => ({ x: position.x, z: position.z, yaw });
  let pendingAttack: { target: number; remaining: number; aim: THREE.Vector3 } | null = null;
  const attackRay = new THREE.Raycaster(), attackOrigin = new THREE.Vector3();
  // Brass has to land on the deck the player is standing on, not on y = 0: a
  // plaza, a bridge or a rooftop all sit above it. One downward cast every
  // three-quarters of a second is far cheaper than one per case and follows the
  // player up and down stairs closely enough for something that lies there for
  // four seconds.
  const floorRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 8);
  let brassFloor = 0, floorCheck = 0;
  const healthGeometry = new THREE.PlaneGeometry(.54, .055), healthMaterial = new THREE.MeshBasicMaterial({ color: "#e1a74e", side: THREE.DoubleSide });
  let disposed = false, loadout = createLoadout(specs), position = { x: spawn.x, z: spawn.z };
  let yaw: number = spawn.yaw, pitch: number = spawn.pitch, vertical = 0, velocityY = 0;
  let triggerSpent = false;
  let lastLookYaw = yaw, lastLookPitch = pitch, lookLagX = 0, lookLagY = 0;
  let trigger = false, ads = false, touchAim = false, actualAim = false, hitTime = 0;
  const bodyMotion = createMovementMotion();
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  // Two-stage recoil: see fps-recoil. The view still couples through the same
  // scale the old scalar did, so a burst costs the aim it always did.
  const kick = createRecoil();
  // The shooter's own ground speed, so walking fire throws brass along with them.
  const carry = new THREE.Vector3();
  // Rounds still in the air. Instant weapons never enter this list, so a hitscan
  // loadout costs exactly the single raycast it always did.
  const rounds: InFlightRound[] = []; let roundSerial = 0;
  // Supplies carried into this exercise. Spending one reports out so the
  // permanent profile can debit it; the count here is what the HUD shows.
  let quickRemaining = equipment.quickCount;
  const ROUND_RANGE = 180;
  const roundRay = new THREE.Raycaster(), roundOrigin = new THREE.Vector3(), roundDirection = new THREE.Vector3(), splashPoint = new THREE.Vector3();
  let strategyMode: 'local' | 'llm' = expedition?.checkpoint?.pilotStrategy ?? 'local';
  let strategicPlanner = strategyMode === 'llm' ? createStrategyPlanner(llmPilotStrategy()) : null;
  let pilot = options.playerPilot ?? createPlayerPilot(strategicPlanner ?? undefined);
  hud.pilotStrategy = strategyMode;
  let pilotEnabled = false, nextPilotAt = 0, pilotDestination: WorldZoneId | undefined;
  let lastPilotObservation: PilotObservation | null = null;
  let capturePending = false, capturePromisePending = false;
  let lastPointerType = 'mouse', inputMode: 'mouse' | 'touch' = 'mouse';
  let lastTime = performance.now(), frame = 0, lastReport = 0, wasLocked = false;
  let drag: { id: number; x: number; y: number } | null = null;
  // The on-screen movement stick. It sits beside the keyboard rather than
  // replacing it, so a tablet with a keyboard attached can use whichever is to
  // hand; looking is a drag on the scene, which `pointermove` below handles.
  let moveStick: StickVector | null = null;
  // Reused so translating a stick into vehicle keys allocates nothing per frame.
  const mountedKeys = new Set<string>();
  let motor: OscillatorNode | null = null, motorGain: GainNode | null = null;
  let audio: AudioContext | null = null, soundBuffer: AudioBuffer | null = null;
  const ray = new THREE.Raycaster(); ray.far = 250;
  const center = new THREE.Vector2(), muzzlePoint = new THREE.Vector3();
  let prone = false;
  const grounded = () => velocityY <= 0 && Math.abs(vertical - (footMovement.supportHeight(position.x, position.z, vertical + .02, .38, .6) ?? -100)) < .025;
  const eyeHeight = () => {
    const requested = prone ? PRONE_EYE_HEIGHT : keys.has('c') ? 1.15 : 1.75;
    for (const height of [requested, 1.15, PRONE_EYE_HEIGHT]) {
      if (height <= requested && footMovement.canOccupy(position.x, vertical, position.z, .38, height + .05)) return height;
    }
    return PRONE_EYE_HEIGHT;
  };
  const stance = () => eyeHeight() < .8 ? 'prone' as const : eyeHeight() < 1.4 ? 'crouch' as const : 'stand' as const;
  const braced = () => !vehicles.active && weaponBraced(specs[hud.weapon], prone, grounded());
  const movement = () => equipmentMovement(equipment, hud.weapon, loadout, quickRemaining);
  const publish = () => {
    if (disposed) return;
    const state = loadout[hud.weapon];
    const burden = movement();
    onHud({ ...hud, supplyUse: supplyUse ? { name: supplyUse.name, verb: supplyUse.profile.verb, progress: supplyProgress(supplyUse), style: supplyUse.profile.style } : null, prone, braced: braced(), carriedWeapons: equipment.carriedFamilies, carriedKg: burden.totalKg, movementScale: burden.movement, comms: comms.snapshot(), pilotEnabled, aimProgress, reloadEmpty: emptyReload[hud.weapon], reloadSaved: state.reloadSaved ?? 0, chambered: chamberRound(state, specs[hud.weapon]) > 0, magazineOut: state.magazineOut === true, roundReady: roundReady(state, specs[hud.weapon]), ...(!expedition ? vehicles.hud(position, Object.fromEntries((hud.arena?.actors ?? []).map(a => [a.id, a.name]))) : {}), ...(vertical > .35 && !vehicles.active ? { vehiclePrompt: '' } : {}), magazine: state.magazine, reserve: state.reserve, reloading: state.reloadRemaining / specs[hud.weapon].reload, aiming: actualAim, hit: hitTime > 0, locked: document.pointerLockElement === canvas, inputMode, x: position.x, z: position.z, yaw, pitch,
      mapMarkers: expedition ? [] : [
        ...(!options.arena ? targetPositions : []).flatMap((point, index): MinimapMarker[] => targets[index]?.alive ? [{ ...point, id: `target-${index}`, kind: 'target', label: `Target ${index + 1}` }] : []),
        ...(['car', 'helicopter'] as const).filter(kind => kind !== vehicles.active && vehicles.states[kind].health > 0).map((kind): MinimapMarker => ({ id: kind, kind, label: kind === 'car' ? 'Utility 01' : 'Falcon 01', x: vehicles.states[kind].x, z: vehicles.states[kind].z })),
      ],
    });
  };
  const clearInput = () => { prone = false; keys.clear(); trigger = false; triggerSpent = false; ads = false; touchAim = false; drag = null; moveStick = null; resetMovementMotion(bodyMotion, eyeHeight()); handling.forEach(model => model.resetBipod()); };
  function configureDebug(value: FpsDebugSettings) {
    if (!debugAvailable || disposed) return;
    const fraction = hud.health / hud.maxHealth;
    debug = normalizeFpsDebug(value); saveFpsDebug(debug);
    hud.debug = debug; hud.maxHealth = 100 * debug.healthMultiplier; hud.health = hud.maxHealth * fraction;
    arenaRuntime?.setHealthMultiplier(debug.healthMultiplier); arenaRuntime?.setCombatEvents(debug.combatEvents); publish();
  }
  function refillHealth() {
    if (!debugAvailable || disposed || hud.health <= 0) return;
    hud.health = hud.maxHealth; arenaRuntime?.setVitals({ health: hud.health }); recoveryDelay = 0; publish();
  }
  function pause() {
    pilotEnabled = false; pilot.reset(); strategicPlanner?.reset(); hud.pilotStatus = 'Player controls'; hud.pilotGoal = null; hud.pilotContacts = 0;
    capturePending = false;
    if (hud.phase !== 'playing') return;
    hud.phase = 'paused'; clearInput(); stopVoice(); encik.clear(); hud.encikCallout = null;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    publish();
  }
  function initAudio() {
    if (hud.muted) return;
    try {
      if (!audio) {
        audio = new AudioContext();
        motor = audio.createOscillator(); motor.type = 'triangle'; motorGain = audio.createGain(); motorGain.gain.value = 0; motor.connect(motorGain).connect(audio.destination); motor.start();
        soundBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.07), audio.sampleRate);
        const samples = soundBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (samples.length * 0.16));
      }
      void audio.resume().catch(() => {});
    } catch { hud.muted = true; }
  }
  function shotSound() {
    if (!audio || !soundBuffer || hud.muted || audio.state !== 'running') return;
    const sound = audio.createBufferSource(), gain = audio.createGain(), filter = audio.createBiquadFilter();
    sound.buffer = soundBuffer; filter.type = 'lowpass'; filter.frequency.value = hud.weapon ? 1100 : 1800; gain.gain.value = 0.16;
    sound.connect(filter).connect(gain).connect(audio.destination); sound.start();
    sound.onended = () => { sound.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  /** A rustle, a tear or a clack as a supply's effect lands. */
  function supplySound(style: SupplyStyle) {
    if (!audio || !soundBuffer || hud.muted || audio.state !== 'running') return;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = soundBuffer; source.playbackRate.value = style === 'eat' ? .45 : style === 'bandage' ? 1.8 : style === 'plates' ? .7 : 1.1;
    filter.type = style === 'eat' ? 'lowpass' : 'bandpass'; filter.frequency.value = style === 'eat' ? 700 : style === 'bandage' ? 3200 : 1400; filter.Q.value = .8;
    gain.gain.value = style === 'plates' ? .14 : .08;
    source.connect(filter).connect(gain).connect(audio.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  function handlingSound(stage: string) {
    if (!audio || !soundBuffer || hud.muted || audio.state !== 'running') return;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = soundBuffer; source.playbackRate.value = stage === 'MAG IN' ? .65 : 1.4;
    filter.type = 'bandpass'; filter.frequency.value = stage === 'CHAMBER' ? 2300 : 1000; filter.Q.value = .7;
    gain.gain.value = stage === 'MAG IN' ? .16 : .09;
    source.connect(filter).connect(gain).connect(audio.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  function movementSound(strength: number, landing = false) {
    if (!audio || !soundBuffer || hud.muted || audio.state !== 'running') return;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = soundBuffer; source.playbackRate.value = landing ? .32 : .5;
    filter.type = 'lowpass'; filter.frequency.value = landing ? 240 : 420;
    gain.gain.value = strength * (landing ? .28 : .17);
    source.connect(filter).connect(gain).connect(audio.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  const encikAudio = createEncikAudio(() => audio);
  function stopVoice() { encikAudio.stop(); }
  function radioCall(event: EncikEvent) {
    if (disposed || !['playing', 'complete', 'defeated'].includes(hud.phase)) return;
    const line = encik.emit(event, performance.now() / 1000); if (!line) return;
    hud.encikCallout = line;
    comms.add('radio', pilotEnabled ? 'Encik · AI' : 'Encik', line.text);
    if (hud.muted || !hud.encikVoice) return;
    const recording = encikRecordingUrl(line);
    // Bundled recordings need no TTS service during gameplay. Captions survive audio failures.
    if (recording) void encikAudio.play(recording);
  }
  function announce(_label: string, count: number) {
    radioCall(count >= 4 ? 'multi' : count === 3 ? 'triple' : count === 2 ? 'double' : 'kill');
    if (hud.muted || audio?.state !== 'running') return;
    const context = audio;
    [0, .09, .18].forEach((offset, i) => {
      const tone = context.createOscillator(), gain = context.createGain(); tone.type = 'triangle';
      tone.frequency.value = 330 + count * 35 + i * 110;
      gain.gain.setValueAtTime(.075, context.currentTime + offset); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + offset + .20);
      tone.connect(gain).connect(context.destination); tone.start(context.currentTime + offset); tone.stop(context.currentTime + offset + .22);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    });
  }
  function enterPlay() {
    if (disposed || !['ready', 'paused'].includes(hud.phase)) return;
    if (!pilotEnabled && inputMode === 'mouse' && document.pointerLockElement !== canvas) { captureFailed(); return; }
    capturePending = false; hud.phase = 'playing'; hud.message = ''; lastTime = performance.now(); clearInput(); canvas.focus(); initAudio(); radioCall('start'); publish();
  }
  function captureFailed() {
    if (disposed) return;
    capturePending = false; hud.message = 'Mouse capture was blocked. Click the Enter or Resume button to retry. Mouse play requires capture; Escape releases it.'; publish();
  }
  function start() {
    if (disposed || capturePending || !['ready', 'paused'].includes(hud.phase)) return;
    initAudio();
    inputMode = requiresFpsPointerLock(lastPointerType) ? 'mouse' : 'touch';
    if (inputMode === 'touch') { enterPlay(); return; }
    if (document.pointerLockElement === canvas) { enterPlay(); return; }
    if (!canvas.requestPointerLock) { captureFailed(); return; }
    capturePending = true;
    // Called directly by the user's Enter/Resume click. Gameplay waits for pointerlockchange.
    try {
      capturePromisePending = true;
      void requestFpsPointerLock(canvas, () => capturePending && !disposed)
        .catch(captureFailed).finally(() => { capturePromisePending = false; });
    } catch { captureFailed(); }
  }
  function reload() {
    if (hud.phase === 'playing') canvas.focus({ preventScroll: true });
    if (hud.phase === 'playing' && supplyUse) endSupply();
    if (hud.phase === 'playing' && (!options.arena || hud.arenaSelf?.alive) && !vehicles.active && beginReload(loadout[hud.weapon], hud.weapon, specs)) {
      emptyReload[hud.weapon] = loadout[hud.weapon].reloadEmpty === true;
      reloadGate = armReloadGate(trigger, sprintIntent);
      radioCall('reload');
      arenaRuntime?.reload(hud.weapon); ads = false; touchAim = false; actualAim = false; lastReloadStage = ''; publish();
    }
  }
  /** Stops the held weapon's reload, keeping its progress if no rounds went in yet. */
  function stopReload() {
    if (!interruptReload(loadout[hud.weapon], hud.weapon, specs)) return;
    lastReloadStage = ''; publish();
  }
  function switchWeapon(index: number) {
    if (hud.phase === 'loading' || hud.phase === 'error' || index === hud.weapon || !validWeaponIndex(index) || !equipment.carriedFamilies.includes(index)) return;
    stopReload(); endSupply();
    trigger = false; triggerSpent = false; ads = false; touchAim = false; resetRecoil(kick);
    hud.weapon = index; weapons.forEach((w, i) => w.visible = i === index);
    if (hud.phase === 'playing') canvas.focus({ preventScroll: true });
    effects.attachMuzzle(weapons[index]?.getObjectByName(`${FPS_WEAPONS[index].id}__socket_muzzle`));
    effects.setStyles(weaponStyles, index); publish();
  }
  function reset() {
    if (hud.phase === 'loading' || hud.phase === 'error') return;
    if (options.arena?.session.role === 'guest') return;
    pilotEnabled = false; pilot.reset(); strategicPlanner?.reset();
    arenaRuntime?.reset();
    capturePending = false; hud.phase = 'ready'; hud.hits = 0; hud.shots = 0; hud.landed = 0; hud.elapsed = 0; hud.message = '';
    combatVisuals.reset(); seenEvents.clear(); openedSupplies.clear(); eventClock = -1; shake = 0; blackout = 0; hud.combatBanner = null; hud.mapDangers = []; hud.mapJammed = false; hud.cloudCover = null;
    hud.health = hud.maxHealth; hud.armor = equipment.armor; hud.incoming = false; hud.hurt = false; hud.earned = 0; hud.earnedXp = 0; hud.lastDamage = 0; hud.callout = ''; hud.chain = 0;
    killChain = { count: 0, lastAt: -Infinity }; calloutTime = 0; stopVoice(); encik.reset(); comms.clear(); hud.encikCallout = null;
    roundId = randomRoundId(); attackTimer = 3; pendingAttack = null; hurtTime = 0; hitDirections.clear(); supplyUse = null;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    vehicles.reset(); loadout = createLoadout(specs); position = { x: spawn.x, z: spawn.z }; yaw = spawn.yaw; pitch = spawn.pitch;
    vertical = velocityY = hitTime = 0; resetRecoil(kick); carry.set(0, 0, 0); clearInput();
    rounds.length = 0; effects.reset();
    aimProgress = 0; bloom.forEach(state => { state.amount = 0; state.delay = 0; });
    targets.forEach(t => { t.alive = true; t.root.visible = true; t.health = t.maxHealth; t.bar.scale.x = 1; });
    updateCameras(0, false, false); publish();
  }
  function interactVehicle() {
    if (hud.phase !== 'playing' || expedition || hud.arenaSelf?.alive === false || (!vehicles.active && vertical > .35)) return;
    if (arenaRuntime) {
      arenaRuntime.vehicleAction(vehicles.active ? 'exit' : 'enter', vehicles.active ?? vehicles.nearest(position));
      clearInput(); canvas.focus({ preventScroll: true }); return;
    }
    const change = vehicles.interact(position);
    if (change) {
      clearInput(); actualAim = false; stopReload();
      position = { x: change.x, z: change.z }; vertical = velocityY = 0; resetRecoil(kick); carry.set(0, 0, 0);
      if (change.entered) { yaw = change.yaw; pitch = -.23; }
      else pitch = -.03;
      updateCameras(0, false, false);
    }
    canvas.focus({ preventScroll: true }); publish();
  }
  function switchVehicleSeat() {
    if (hud.phase !== 'playing' || !vehicles.active) return;
    if (arenaRuntime) arenaRuntime.vehicleAction('switch'); else vehicles.switchSeat();
    clearInput(); canvas.focus({ preventScroll: true }); publish();
  }
  function updateExpeditionPrompts() {
    if (!expedition) return;
    const alive = !!hud.arenaSelf?.alive;
    // Crossing into a named place is worth saying once, so the district reads
    // as somewhere with parts rather than as one field of coordinates.
    const here = sectorAt(expedition.zone, position.x, position.z);
    if ((here?.name ?? '') !== hud.sector) {
      hud.sector = here?.name ?? '';
      if (here && hud.phase === 'playing') comms.add('system', 'Location', `Entering ${here.name}.`);
    }
    const nearest = alive ? expedition.loot.nearest(expedition.zone, { ...position, y: vertical }) : null;
    const npc = alive && vertical <= .35 && !vehicles.active ? nearestNpc(npcs, position) : null;
    const gateway = alive && vertical <= .35 ? findWorldGateway(expedition.zone, position) : null;
    const lootWeapon = nearest?.kind === 'weapon' ? itemById(nearest.catalogId ?? '') : undefined;
    const swapLabel = validWeaponIndex(lootWeapon?.family) ? ` · replace ${pickupSlot(fieldProfile, lootWeapon.family, hud.weapon)}` : '';
    hud.lootPrompt = nearest ? `E · ${nearest.tier} ${nearest.name}${swapLabel}` : '';
    hud.npcPrompt = npc ? `N · ${npcInteractionPrompt(npc)}` : '';
    hud.travelPrompt = gateway ? `T · Travel to ${getWorldZone(gateway.to).name}` : '';
    if (npc && !greetedNpcs.has(npc.id) && hud.phase === 'playing') {
      greetedNpcs.add(npc.id);
      comms.add('system', npc.name, npc.interaction.kind === 'vendor'
        ? `${npcInteractionPrompt(npc)}.` : `${npc.role}. Come closer if you want to talk.`);
    }
  }
  function interactLoot() {
    if (!expedition || hud.phase !== 'playing' || !hud.arenaSelf?.alive || vehicles.active || !arenaRuntime || travelPending) return;
    const nearest = expedition.loot.nearest(expedition.zone, { ...position, y: vertical }); if (!nearest) return;
    if (nearest.kind === 'medical' && hud.health >= hud.maxHealth) { hud.lootNotice = `Health is full. ${nearest.name} remains here.`; lootNoticeTime = 3; publish(); return; }
    if (nearest.kind === 'ammo' && loadout[hud.weapon].reserve >= 999) { hud.lootNotice = 'Ammunition reserve is full.'; lootNoticeTime = 3; publish(); return; }
    const item = nearest.catalogId ? itemById(nearest.catalogId) : undefined;
    if ((nearest.kind === 'weapon' && (!item || item.category !== 'weapon' || !validWeaponIndex(item.family))) || (nearest.kind === 'armor' && item?.category !== 'plate')) return;
    // Medical supplies are used where they lie: taken, and their health given, at the commit point.
    if (nearest.kind === 'medical') {
      const medical = item?.category === 'consumable' ? item : { supplyType: 'medical' as const, effect: { health: nearest.amount } };
      beginSupply(nearest.name, nearest.catalogId ?? '', supplyProfile(medical), () => {
        const taken = expedition.loot.collect(expedition.zone, nearest.id, { ...position, y: vertical });
        if (!taken) { hud.lootNotice = `Moved away from ${nearest.name}.`; lootNoticeTime = 3; return false; }
        const before = hud.health; hud.health = Math.min(hud.maxHealth, hud.health + taken.amount); arenaRuntime?.setVitals({ health: hud.health }); recoveryDelay = 0;
        hud.lootNotice = `${taken.name} · recovered ${Math.round(hud.health - before)} health.`;
        comms.add('system', 'Supplies', hud.lootNotice); radioCall('pickup');
        markers?.remove(taken.id); hud.fieldLoot = expedition.loot.remaining(expedition.zone); lootNoticeTime = 4;
        updateExpeditionPrompts(); publish();
        return true;
      });
      return;
    }
    const collected = expedition.loot.collect(expedition.zone, nearest.id, { ...position, y: vertical }); if (!collected) return;
    if (collected.kind === 'weapon' && item && validWeaponIndex(item.family)) {
      const family = item.family, changed = fieldProfile.guns[family].variant !== item.id;
      const next = copyProfile(fieldProfile); next.owned = [...new Set([...next.owned, item.id])]; next.guns[family].variant = item.id;
      const slot = pickupSlot(next, family, hud.weapon);
      if (slot !== 'sidearm') next.carry = { ...next.carry, [slot]: family };
      fieldProfile = next; equipment = resolveLoadout(fieldProfile); specs = equipment.weapons;
      if (changed) loadout[family] = createLoadout(specs)[family];
      else loadout[family].reserve = Math.min(999, loadout[family].reserve + specs[family].reserve);
      arenaRuntime.updateLoadout(fieldProfile);
      undress.splice(0).forEach(dispose => dispose()); weapons.forEach((model, index) => undress.push(dressWeapon(model, specs[index])));
      switchWeapon(family); expedition.onEquipment(copyProfile(fieldProfile));
      hud.lootNotice = `${item.name} equipped for this expedition.`;
    } else if (collected.kind === 'armor' && item) {
      const next = copyProfile(fieldProfile); next.owned = [...new Set([...next.owned, item.id])]; next.plate = item.id;
      fieldProfile = next; equipment = resolveLoadout(fieldProfile); specs = equipment.weapons;
      arenaRuntime.updateLoadout(fieldProfile); arenaRuntime.setVitals({ armor: equipment.armor }); hud.armor = equipment.armor;
      expedition.onEquipment(copyProfile(fieldProfile)); hud.lootNotice = `${item.name} equipped · ${Math.round(equipment.armor)} armor.`;
    } else if (collected.kind === 'ammo') {
      const before = loadout[hud.weapon].reserve; loadout[hud.weapon].reserve = Math.min(999, before + collected.amount);
      hud.lootNotice = `+${loadout[hud.weapon].reserve - before} rounds for ${specs[hud.weapon].name}.`;
    }
    comms.add('system', 'Supplies', hud.lootNotice); radioCall('pickup');
    markers?.remove(collected.id); hud.fieldLoot = expedition.loot.remaining(expedition.zone); lootNoticeTime = 4;
    updateExpeditionPrompts(); canvas.focus({ preventScroll: true }); publish();
  }
  function interactNpc() {
    if (!expedition || hud.phase !== 'playing' || !hud.arenaSelf?.alive || vehicles.active || !arenaRuntime || travelPending || vertical > .35) return;
    const npc = nearestNpc(npcs, position); if (!npc) return;
    if (npc.interaction.kind === 'dialogue') {
      if (!npc.interaction.lines.length) return;
      const index = dialogueProgress.get(npc.id) ?? 0;
      const line = npc.interaction.lines[index % npc.interaction.lines.length];
      dialogueProgress.set(npc.id, index + 1);
      hud.lootNotice = `${npc.name}: ${line}`; lootNoticeTime = 6; markers?.react(npc.id, index % 3 === 2 ? 'point' : 'talk', 3.2);
      comms.add('system', npc.name, line);
      canvas.focus({ preventScroll: true }); publish(); return;
    }
    const result = expedition.onVendorPurchase(npc.interaction.catalogId, npc.interaction.price);
    if (result.purchased) {
      // Keep expedition-only weapons and armor while adopting the persistent
      // wallet, inventory and newly selected quick item from the purchase.
      fieldProfile = { ...fieldProfile, credits: result.profile.credits, tokens: result.profile.tokens,
        consumables: { ...result.profile.consumables }, quickItem: result.profile.quickItem };
      equipment = resolveLoadout(fieldProfile); quickRemaining = equipment.quickCount;
      hud.quickItem = equipment.quickItem?.name || '';
      hud.quickType = equipment.quickItem ? equipment.quickItem.supplyType === 'food' ? 'FOOD' : 'UTILITY' : '';
      hud.quickCount = quickRemaining; hud.credits = fieldProfile.credits; hud.tokens = fieldProfile.tokens;
      expedition.onEquipment(copyProfile(fieldProfile));
    }
    hud.lootNotice = result.message; lootNoticeTime = 4; markers?.react(npc.id, result.purchased ? 'offer' : 'talk', 2.4);
    comms.add('system', npc.name, result.message);
    updateExpeditionPrompts(); canvas.focus({ preventScroll: true }); publish();
  }
  function travelZone() {
    if (!expedition || travelPending || hud.phase !== 'playing' || !hud.arenaSelf?.alive || vehicles.active || vertical > .35) return;
    const gateway = findWorldGateway(expedition.zone, position); if (!gateway) return;
    const transition = resolveWorldTransition(expedition.zone, gateway.id, position); if (!transition) return;
    comms.add('system', 'Travel', `Moving to ${getWorldZone(transition.to).name}.`);
    const checkpoint: FpsCheckpoint = { comms: comms.snapshot(), pilot: pilotEnabled, pilotStrategy: strategyMode, encikVoice: hud.encikVoice, health: hud.health, armor: hud.armor, weapon: hud.weapon, ammunition: loadout.map(state => ({ ...state, cooldown: 0, reloadRemaining: 0 })) };
    travelPending = true; pause(); expedition.onTravel(transition, checkpoint);
  }
  function jump() { if (hud.phase === 'playing' && (!options.arena || hud.arenaSelf?.alive)) { canvas.focus({ preventScroll: true }); if (!vehicles.active && stance() === 'stand') bufferJump(bodyMotion); } }
  function setInput(key: string, held: boolean) {
    if (hud.phase !== 'playing' || (options.arena && !hud.arenaSelf?.alive)) return;
    if (key === 'v') { if (held) switchVehicleSeat(); return; }
    if (key === 'z') { if (held && !vehicles.active && grounded()) { if (!prone || footMovement.canOccupy(position.x, vertical, position.z, .38, 1.8)) prone = !prone; keys.delete('c'); publish(); } return; }
    if (held && key === 'c' && footMovement.canOccupy(position.x, vertical, position.z, .38, 1.2)) prone = false;
    if (key === 'fire') { trigger = held; if (!trigger) triggerSpent = false; }
    else if (held) keys.add(key); else keys.delete(key);
  }
  /** Analog movement from the left thumb stick; a null or centred stick hands control back to the keys. */
  function setMoveAxis(stick: StickVector | null) {
    if (hud.phase !== 'playing' || (options.arena && !hud.arenaSelf?.alive)) { moveStick = null; return; }
    moveStick = stick && stick.magnitude > 0 ? stick : null;
  }
  /**
   * Keys a mounted vehicle should see. The vehicle model reads a held-key set,
   * so the stick is translated into one rather than that model growing a second
   * input path; held keys stay in the set beside it. Full forward deflection
   * reads as shift, which is the run on foot and the rotor boost in the air.
   */
  function drivingKeys(): ReadonlySet<string> {
    if (!moveStick) return keys;
    mountedKeys.clear();
    for (const key of keys) mountedKeys.add(key);
    for (const key of stickKeys(moveStick)) mountedKeys.add(key);
    return mountedKeys;
  }
  /**
   * Relative look travel, in the same pixels a mouse would have moved. The fire
   * button forwards its own drag through here, so a thumb can hold the trigger
   * and correct its aim at the same time without a second finger.
   */
  function lookBy(dx: number, dy: number) {
    if (pilotEnabled || hud.phase !== 'playing') return;
    const travel = dragLook(dx, dy);
    look(travel.dx, travel.dy);
  }
  /** Opens the whole-district map over the scene, or folds it back into the corner. */
  function toggleMap() { hud.mapExpanded = !hud.mapExpanded; publish(); }
  function toggleAim() {
    if (pilotEnabled || hud.phase !== 'playing' || vehicles.active || hud.arenaSelf?.alive === false || loadout[hud.weapon].reloadRemaining > 0) return;
    touchAim = !touchAim; canvas.focus({ preventScroll: true }); publish();
  }
  const keyboardKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'c', 'z', ' ', 'r', 'q', 'g', '1', '2', '3', 'e', 'n', 't', 'f', 'm', 'control', 'escape'];
  const keydown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === 'f' && !event.repeat) { event.preventDefault(); options.onFullscreen?.(); return; }
    if (hud.phase !== 'playing' || !keyboardKeys.includes(key)) return;
    event.preventDefault();
    if (key === 'q') { if (!event.repeat) toggleAim(); return; }
    if (key === 'm') { if (!event.repeat) toggleMap(); return; }
    if (key === 'escape') pause();
    else if (pilotEnabled) { pause(); hud.message = 'AI stopped. Click Resume to take control.'; publish(); }
    else if (key === 'v') { if (!event.repeat) switchVehicleSeat(); }
    else if (key === 'e') { if (!event.repeat) expedition ? interactLoot() : interactVehicle(); }
    else if (key === 'n') { if (!event.repeat) interactNpc(); }
    else if (key === 't') { if (!event.repeat) travelZone(); }
    else if (key === 'z') { if (!event.repeat) setInput('z', true); }
    else if (key === 'c') setInput('c', true);
    else if (key === 'r') reload();
    else if (key === 'g') { if (!event.repeat) useQuickItem(); }
    else if (/^[1-3]$/.test(key)) switchWeapon(equipment.carriedFamilies[Number(key) - 1]);
    else if (key === ' ') { if (vehicles.active) keys.add(' '); else if (!event.repeat) jump(); }
    else keys.add(key);
  };
  const pilotEscape = (event: KeyboardEvent) => { if (pilotEnabled && event.key === 'Escape') { event.preventDefault(); pause(); } };
  const keyup = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
  const pointerSource = (event: PointerEvent) => {
    lastPointerType = event.pointerType;
    if (hud.phase === 'playing' && inputMode === 'touch' && requiresFpsPointerLock(event.pointerType)) {
      inputMode = 'mouse'; pause();
      hud.message = 'Mouse detected. Click Resume to capture it; Escape opens the menu.'; publish();
    }
  };
  const look = (dx: number, dy: number) => {
    if (hud.phase !== 'playing') return;
    const wasYaw = yaw, wasPitch = pitch;
    ({ yaw, pitch } = turnFpsLook(yaw, pitch, dx, dy, ads || touchAim));
    // Pulling down pays off the climb instead of banking it, so compensating a
    // burst and then releasing does not drag the sights under the target.
    compensateRecoil(kick, pitch - wasPitch, yaw - wasYaw);
  };
  const mousemove = (event: MouseEvent) => { if (!pilotEnabled && document.pointerLockElement === canvas) look(event.movementX, event.movementY); };
  // Pointer events only report the first press and final release of a mouse chord.
  // Mouse events report each button independently, including LMB while RMB is held.
  const mousedown = (event: MouseEvent) => {
    if (pilotEnabled || hud.phase !== 'playing' || document.pointerLockElement !== canvas) return;
    if (event.button === 0) trigger = true;
    if (event.button === 2) ads = true;
  };
  const mouseup = (event: MouseEvent) => {
    if (pilotEnabled || document.pointerLockElement !== canvas) return;
    if (event.button === 0) { trigger = false; triggerSpent = false; }
    if (event.button === 2) ads = false;
  };
  const pointerdown = (event: PointerEvent) => {
    if (pilotEnabled) return;
    if (hud.phase !== 'playing') return;
    canvas.focus();
    if (document.pointerLockElement === canvas) return;
    if (inputMode === 'touch' && !requiresFpsPointerLock(event.pointerType)) {
      canvas.setPointerCapture(event.pointerId); drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    } else {
      pause();
    }
  };
  const pointermove = (event: PointerEvent) => {
    if (document.pointerLockElement === canvas || !drag || event.pointerId !== drag.id) return;
    // The scene is the look surface on a touchscreen: a drag anywhere the thumb
    // layer is not turns the camera, at the gain a thumb needs rather than a mouse's.
    const travel = dragLook(event.clientX - drag.x, event.clientY - drag.y);
    look(travel.dx, travel.dy); drag.x = event.clientX; drag.y = event.clientY;
  };
  const pointerup = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) drag = null;
  };
  const releasePointer = () => { trigger = false; triggerSpent = false; ads = false; drag = null; };
  const lockchange = () => {
    const locked = document.pointerLockElement === canvas;
    if (locked && capturePending) enterPlay();
    else if (locked && hud.phase !== 'playing') document.exitPointerLock();
    if (!locked && !pilotEnabled && hud.phase === 'playing' && (wasLocked || inputMode === 'mouse')) pause(); wasLocked = locked; publish();
  };
  const lockerror = () => { if (!capturePromisePending) captureFailed(); };
  const contextmenu = (event: Event) => event.preventDefault();
  const visibility = () => { if (document.hidden) pause(); };
  window.addEventListener('keydown', pilotEscape, true);
  canvas.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
  window.addEventListener('pointerdown', pointerSource, true); window.addEventListener('pointermove', pointerSource, true);
  canvas.addEventListener('pointerdown', pointerdown); canvas.addEventListener('pointermove', pointermove);
  window.addEventListener('pointerup', pointerup); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);
  canvas.addEventListener('contextmenu', contextmenu); document.addEventListener('mousemove', mousemove);
  canvas.addEventListener('mousedown', mousedown); window.addEventListener('mouseup', mouseup);
  document.addEventListener('pointerlockchange', lockchange); document.addEventListener('pointerlockerror', lockerror);
  window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility);

  function startPilot() {
    if (disposed || !['ready', 'paused', 'playing'].includes(hud.phase) || vehicles.active) return;
    capturePending = false; pilot.reset(); strategicPlanner?.reset(); clearInput(); pilotEnabled = true; nextPilotAt = 0;
    hud.pilotStatus = 'Observing'; hud.message = '';
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    if (hud.phase !== 'playing') enterPlay();
    publish();
  }
  function setPilotStrategy(mode: 'local' | 'llm') {
    if (disposed || !['local', 'llm'].includes(mode) || mode === strategyMode) return;
    pilot.reset(); strategicPlanner?.reset(); clearInput();
    strategyMode = mode; strategicPlanner = mode === 'llm' ? createStrategyPlanner(llmPilotStrategy()) : null;
    pilot = createPlayerPilot(strategicPlanner ?? undefined);
    hud.pilotStrategy = mode; hud.pilotPlan = mode === 'llm' ? 'Waiting for the strategist' : 'Local utility planner';
    nextPilotAt = 0; publish();
  }
  function takeControl() {
    if (disposed) return;
    pause(); start();
  }
  function observePilot(time: number): PilotObservation {
    const subjects: PilotSubject[] = [];
    if (options.arena) {
      // Read rendered avatars here, never hand the authoritative actor list to a policy.
      // Articulated avatars publish their chest and face; a falling body is not a target.
      for (const root of world.scene.children) if (root.visible && typeof root.userData.arenaActorId === 'string' && !root.userData.arenaDown) {
        const named = ['avatar-aim-chest', 'avatar-aim-head'].map(name => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()));
        subjects.push({ id: root.userData.arenaActorId, root, radius: .3, points: named.every(Boolean) ? named as THREE.Vector3[] : [1.15, 1.62].map(y => root.localToWorld(new THREE.Vector3(0, y, 0))) });
      }
    } else for (let i = 0; i < targets.length; i++) if (targets[i].alive) {
      subjects.push({ id: `target-${i}`, root: targets[i].root, radius: .24, points: [targets[i].hitZone.getWorldPosition(new THREE.Vector3())] });
    }
    const weaponRay = new THREE.Raycaster(), weaponMeshes: THREE.Mesh[] = [];
    rig.traverseVisible(node => { if (node instanceof THREE.Mesh) weaponMeshes.push(node); });
    const sight = weapons[hud.weapon] ? getWeaponSight(weapons[hud.weapon]) : undefined;
    const screenBlocked = (point: THREE.Vector2) => {
      // The live scope image is a viewing aperture, not an opaque piece of cover.
      if (sight?.lens.visible) {
        const centre = sight.lens.getWorldPosition(new THREE.Vector3());
        const radiusY = sight.radius / (-centre.z * Math.tan(THREE.MathUtils.degToRad(viewCamera.fov / 2)));
        centre.project(viewCamera);
        if (Math.hypot((point.x * sight.magnification - centre.x) / (radiusY / viewCamera.aspect), (point.y * sight.magnification - centre.y) / radiusY) < .9) return false;
      }
      weaponRay.setFromCamera(point, viewCamera);
      return !!weaponRay.intersectObjects(weaponMeshes, false)[0];
    };
    const state = loadout[hud.weapon];
    const waypoints: PilotObservation['waypoints'][number][] = expedition ? hud.fieldLoot.filter(item => Math.abs((item.y ?? 0)-vertical)<1.2).map(item => ({ id: item.id, x: item.x, z: item.z, kind: item.kind })) :
      options.arena ? [] : targets.flatMap((target, i) => target.alive ? [{ id: `target-${i}`, ...targetPositions[i], kind: 'target' as const }] : []);
    if (expedition && pilotDestination) {
      const gateway = findWorldRoute(expedition.zone, pilotDestination)[0];
      if (gateway) waypoints.push({ id: gateway.id, ...gateway.position, kind: 'checkpoint' });
    }
    return { time, alive: hud.arenaSelf?.alive !== false, health: hud.health, maxHealth: hud.maxHealth, armor: hud.armor,
      ...(vertical > .35 && !vehicles.active ? { vehiclePrompt: '' } : {}), magazine: roundReady(state, specs[hud.weapon]) ? state.magazine : 0, reserve: state.reserve, reloading: state.reloadRemaining > 0, aiming: actualAim, weapon: hud.weapon, availableWeapons: equipment.carriedFamilies.filter(index => loadout[index].magazine > 0 || loadout[index].reserve > 0),
      position: { x: position.x, z: position.z }, yaw, pitch,
      contacts: visiblePilotContacts(camera, world.scene, subjects, screenBlocked), waypoints, ballistics: specs[hud.weapon].ballistics,
      lootPrompt: hud.lootPrompt, travelPrompt: hud.travelPrompt };
  }
  function updatePilot(time: number) {
    if (!pilotEnabled || hud.phase !== 'playing' || options.arena && !hud.arenaSelf) return;
    try {
      lastPilotObservation = observePilot(time);
      const decision = pilot.decide(structuredClone(lastPilotObservation));
      const action = normalizePilotAction(decision.action);
      hud.pilotPlan = strategicPlanner?.status() ?? 'Local utility planner';
      hud.pilotGoal = decision.goal; hud.pilotStatus = decision.status; hud.pilotContacts = lastPilotObservation.contacts.length;
      if (!lastPilotObservation.alive) { clearInput(); return; }
      if (action.callout) radioCall(action.callout);
      for (const [key, held] of [['w', action.forward], ['s', action.backward], ['a', action.left], ['d', action.right], ['shift', action.sprint], ['c', action.crouch]] as const) setInput(key, held === true);
      setInput('fire', action.fire === true);
      look(action.lookX ?? 0, action.lookY ?? 0);
      touchAim = action.aim === true; ads = false;
      if (action.weapon !== undefined) switchWeapon(action.weapon);
      prone = specs[hud.weapon].requiresMount === true && action.fire === true && grounded();
      if (action.reload) reload();
      if (action.jump) jump();
      if (action.interact) expedition ? interactLoot() : interactVehicle();
      if (action.travel) travelZone();
    } catch {
      pause(); hud.message = 'AI pilot stopped because its controller failed. You can resume manually.'; publish();
    }
  }

  /**
   * Recoil takes the shooter's own aim, not only the rendered view, which is
   * what makes a burst something to hold down rather than watch. The engine
   * still owns `pitch` and `yaw`; the recoil only says how far to move them.
   */
  function applyAimPush() {
    const push = takeAimPush(kick);
    if (!push.pitch && !push.yaw) return;
    yaw += push.yaw;
    const wanted = pitch + push.pitch;
    pitch = clampFpsPitch(wanted);
    // Aim the look limit refused was never taken, so it is not owed back
    // either: without this a burst fired at the sky would hand back climb it
    // never got, dragging the sights below where the shooter left them.
    if (pitch !== wanted) compensateRecoil(kick, pitch - wanted, 0);
  }
  function updateCameras(dt: number, moving: boolean, sprinting: boolean) {
    // Bounded camera-relative inertia, driven by angle deltas (not frame rate).
    const yawDelta = Math.atan2(Math.sin(yaw - lastLookYaw), Math.cos(yaw - lastLookYaw));
    lookLagX = THREE.MathUtils.damp(THREE.MathUtils.clamp(lookLagX + yawDelta * .025, -.003, .003), 0, 12, dt);
    lookLagY = THREE.MathUtils.damp(THREE.MathUtils.clamp(lookLagY - (pitch - lastLookPitch) * .025, -.003, .003), 0, 12, dt);
    lastLookYaw = yaw; lastLookPitch = pitch;
    if (vehicles.mounted) {
      actualAim = false; aimProgress = 0; rig.visible = false; supplyHands.update(null, 0);
      const v = vehicles.mounted, target = new THREE.Vector3(v.x, v.y + 1.65, v.z);
      const distance = v.kind === 'car' ? 8.5 : 13;
      const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const wanted = target.clone().addScaledVector(direction, distance); wanted.y = Math.max(.7, wanted.y);
      const offset = wanted.clone().sub(target); chaseRay.set(target, offset.clone().normalize()); chaseRay.near = .2; chaseRay.far = offset.length();
      const obstruction = firstVisibleHit(chaseRay, world.scene.children.filter(o => o !== vehicles.root && !o.userData.fpsEffect));
      camera.position.copy(obstruction ? target.clone().addScaledVector(offset.normalize(), Math.max(.5, obstruction.distance - .4)) : wanted);
      camera.lookAt(target); camera.fov = THREE.MathUtils.damp(camera.fov, 68, 8, dt); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); return;
    }
    const aiming = (ads || touchAim) && !sprinting && loadout[hud.weapon].reloadRemaining === 0 && !supplyUse;
    actualAim = aiming;
    // Heavier carry costs time to settle the sights as well as ground speed.
    aimProgress = THREE.MathUtils.damp(aimProgress, aiming ? 1 : 0, 15 * (aiming ? movement().aimSpeed : 1), dt);
    const aim = smoothStep(aimProgress);
    rig.visible = !options.arena || hud.arenaSelf?.alive !== false;
    const poseStance = stance(), crouching = poseStance !== 'stand';
    const speed = carry.length(), onGround = grounded();
    const sideSpeed = carry.x * Math.cos(yaw) - carry.z * Math.sin(yaw);
    const forwardSpeed = -carry.x * Math.sin(yaw) - carry.z * Math.cos(yaw);
    const step = advanceBodyMotion(bodyMotion, eyeHeight(), poseStance, speed, onGround, sprinting && speed > .2, sideSpeed, forwardSpeed, dt);
    if (step && hud.phase === 'playing') movementSound(poseStance === 'prone' ? .18 : poseStance === 'crouch' ? .25 : sprinting ? .65 : .4);
    const motionScale = motionPreference?.matches ? 0 : 1;
    const gait = bodyMotion.gait, gaitWeight = bodyMotion.gaitWeight * motionScale;
    const headBob = Math.sin(gait * 2) * (poseStance === 'prone' ? .008 : .012) * gaitWeight * (1 - aim * .85);
    let visualEye = bodyMotion.eye + (bodyMotion.compression + headBob) * motionScale;
    if (!footMovement.canOccupy(position.x, vertical, position.z, .38, visualEye + .05)) visualEye = Math.min(visualEye, eyeHeight());
    camera.position.set(position.x, vertical + visualEye, position.z);
    const view = recoilView(kick), pose = recoilPose(kick);
    camera.rotation.set(pitch + view.pitch, yaw + view.yaw, bodyMotion.lean * motionScale * (1 - aim * .9), 'YXZ');
    camera.fov = 65 + bodyMotion.sprint * 6 * (1 - aim) * motionScale;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    viewCamera.fov = THREE.MathUtils.lerp(65, 54, aim); viewCamera.updateProjectionMatrix();
    const sway = Math.sin(gait) * (poseStance === 'prone' ? .025 : .014) * gaitWeight * (1 - aim * .94);
    const bodyFollow = (bodyMotion.compression * .35 + bodyMotion.eyeVelocity * -.012) * motionScale * (1 - aim * .8);
    spreadAngle = weaponSpread(bloom[hud.weapon], hud.weapon, aim, crouching, moving);
    const spreadPixels = Math.tan(spreadAngle) * canvas.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    hud.crosshairSpread = THREE.MathUtils.damp(hud.crosshairSpread, Math.max(3, spreadPixels), 20, dt);
    const state = loadout[hud.weapon], remaining = state.reloadRemaining / specs[hud.weapon].reload;
    const progress = remaining > 0 ? 1 - remaining : null, motion = reloadMotion(progress ?? 0);
    // A supported gun stays low for reloads; hands, magazine and feed cover
    // still perform their complete handling animation around the planted legs.
    const reloadTravel = 1 - (handling[hud.weapon]?.bipodDeployment ?? 0);
    rig.position.set(THREE.MathUtils.lerp(.20, 0, aim) + sway + motion.x * reloadTravel + lookLagX,
      THREE.MathUtils.lerp(-.32, -(handling[hud.weapon]?.aimHeight ?? .435), aim) + Math.abs(sway) - bodyMotion.sprint * .08 + bodyFollow + motion.y * reloadTravel + lookLagY,
      THREE.MathUtils.lerp(-.78, handling[hud.weapon]?.aimDepth ?? -.47, aim) + pose.push + motion.z * reloadTravel + bodyMotion.surge * motionScale * (1 - aim));
    // The weapon carries the buck, the sideways half of the pattern and the roll
    // that goes with it; the camera only ever takes the view coupling above.
    // `recoilPose` sizes them; aiming in is the only thing damped here, because
    // a shouldered weapon is held against the shooter rather than by the hands.
    rig.rotation.set(pose.pitch * (1 - aim * .8) + bodyMotion.sprint * -.18 + bodyFollow * 1.2 + motion.pitch * reloadTravel,
      motion.yaw * reloadTravel + pose.yaw * (1 - aim * .6), motion.roll * reloadTravel + pose.roll * (1 - aim * .5) + sway * .7);
    handling.forEach((model, i) => model.update(i === hud.weapon ? progress : null, emptyReload[i],
      i === hud.weapon ? { prone: prone && hud.phase === 'playing', grounded: onGround, speed, eyeHeight: bodyMotion.eye, dt } : undefined));
    // A supply in the hands takes the weapon down and out of view while it is used.
    const weaponDown = supplyHands.update(rig.visible && supplyUse ? supplyUse.profile.style : null, supplyUse ? supplyProgress(supplyUse) : 0, supplyUse?.id);
    if (weaponDown > 0) { rig.position.x += weaponDown * .12; rig.position.y -= weaponDown * .62; rig.rotation.x -= weaponDown * .9; rig.rotation.z -= weaponDown * .35; }
    canvas.dataset.supplyUse = supplyUse ? `${supplyUse.profile.style}:${supplyProgress(supplyUse).toFixed(2)}` : '';
    canvas.dataset.bipodDeployment = (handling[hud.weapon]?.bipodDeployment ?? 0).toFixed(3);
    const stage = reloadStage(remaining, emptyReload[hud.weapon]);
    if (stage && stage !== lastReloadStage && hud.phase === 'playing') handlingSound(stage);
    lastReloadStage = stage;
    canvas.dataset.aimProgress = aimProgress.toFixed(3); canvas.dataset.reloadStage = stage;
    canvas.dataset.weaponVisible = String(rig.visible);
    canvas.dataset.movement = JSON.stringify({ speed: +speed.toFixed(3), eye: +bodyMotion.eye.toFixed(3),
      feet: +vertical.toFixed(3), grounded: onGround, stance: poseStance, impact: +bodyMotion.compression.toFixed(4) });
    viewScene.updateMatrixWorld(true);
  }
  /** Exposure, sun shadows and the weapon's own lights, from the hour and weather the world resolved to. */
  function lightView(dt: number) {
    const { lighting, key, ambient, shadows } = atmosphere.light;
    // A blackout takes the city's glow with it, which only shows at night.
    renderer.toneMappingExposure = lighting.exposure * (1 - .5 * blackout * lighting.shift);
    sunShadows.update(shadows, camera, lighting.key, dt);
    viewSky.intensity = 2.1 * Math.min(1.25, ambient / .58);
    viewSky.color.copy(VIEW_SKY).lerp(viewTint.set(lighting.skyFill), lighting.shift);
    viewSky.groundColor.copy(VIEW_GROUND).lerp(viewTint.set(lighting.groundFill), lighting.shift);
    weaponLight.intensity = 2.5 * Math.min(1.25, key / 1.12);
    weaponLight.color.copy(VIEW_KEY).lerp(viewTint.set(lighting.keyColor), lighting.shift);
    weaponLight.position.set(lighting.key.x, lighting.key.y, lighting.key.z).applyQuaternion(viewQuaternion.copy(camera.quaternion).invert());
    canvas.dataset.sunShadows = String(sunShadows.enabled); canvas.dataset.shadowCasters = String(sunShadows.casters); canvas.dataset.timeOfDay = lighting.elevation.toFixed(1);
  }
  function gameplayCandidates() {
    // Effects and the viewmodel never obstruct a gameplay ray.
    return world.scene.children.filter(o => !o.userData.fpsEffect);
  }
  const surface = new THREE.Vector3();
  /**
   * The world-space normal of whatever a ray struck, for orienting an impact.
   * A raycast reports the face normal in the struck object's own space, so it
   * has to go through that object's normal matrix before it means anything in
   * the map; a hit with no face at all (a sprite, a degenerate triangle) falls
   * back to facing the shooter.
   */
  function surfaceNormal(hit: THREE.Intersection, direction: THREE.Vector3) {
    return impactSurfaceNormal(hit, direction, surface);
  }

  const impactKind = (hit: THREE.Intersection): ImpactKind => typeof hit.object.userData.fpsTarget === 'number' ? 'target' : 'surface';
  const splatRay = new THREE.Raycaster(), splatNormal = new THREE.Vector3();
  /**
   * Draws a round stopping on `hit`: the struck material picks its debris and
   * mark. A body bleeds, and throws a spatter onto whatever is close behind it.
   */
  function strike(hit: THREE.Intersection, direction: THREE.Vector3, energy: number, style?: string) {
    const normal = surfaceNormal(hit, direction), kind = impactKind(hit);
    const material = kind === 'surface' ? hitSurface(hit, normal.y) : undefined;
    effects.impact(hit.point, normal, kind, energy, style, material);
    if (material !== 'flesh') return;
    splatRay.set(hit.point, direction); splatRay.near = .05; splatRay.far = 2.4;
    const behind = visibleHits(splatRay, gameplayCandidates(), 8).find(next => !isWaterHit(next) && impactKind(next) === 'surface' && hitSurface(next) !== 'flesh');
    if (behind) {
      // Thinner and wider the further the spray had to travel to reach it.
      const reach = behind.distance / splatRay.far;
      effects.decal(behind.point, impactSurfaceNormal(behind, direction, splatNormal), 'blood', (.09 + reach * .14) * Math.min(1.4, Math.max(.5, energy)));
    }
  }
  const isWaterHit = (hit?: THREE.Intersection) => !!hit && isWaterObject(hit.object);
  /**
   * Water ends a shot's list of struck surfaces: a round that goes in breaks
   * up within a metre, and one that skims leaves along a new line that the
   * caller casts separately. Either way nothing behind the surface is reached.
   */
  function stopAtWater(hits: THREE.Intersection[]) {
    const index = hits.findIndex(hit => isWaterObject(hit.object));
    if (index >= 0) hits.length = index + 1;
    return hits;
  }
  /**
   * A round meets water: spray above the surface, a ripple in it where the
   * water can carry one, and the direction it skips off in if it came in
   * shallow enough to skip (see fps-splashes), or null if the water took it.
   */
  function meetWater(hit: THREE.Intersection, direction: THREE.Vector3, energy: number, weapon?: number) {
    const normal = surfaceNormal(hit, direction);
    const skip = waterRicochet(direction, normal), profile = weapon === undefined ? undefined : weaponStyles[weapon]?.impact;
    effects.splash(hit.point, direction, skip ? energy * .6 : energy, profile);
    // A heavier round rocks the surface harder as well as throwing more spray.
    rippleWater(hit.object, hit.point.x, hit.point.z, (skip ? energy * .6 : energy) * splashWeight(profile).size);
    return skip;
  }
  const skipRay = new THREE.Raycaster(), skipDirection = new THREE.Vector3(), skipOrigin = new THREE.Vector3();
  /**
   * An instant round that skimmed water carries on along the skip, weaker,
   * and may strike something — or skim again — further out.
   */
  function skipInstantShot(from: THREE.Vector3, direction: { x: number; y: number; z: number }, travelled: number, energy: number, weapon: number) {
    let skips = 0, at = from, heading: { x: number; y: number; z: number } | null = direction;
    while (heading && skips++ < MAX_SKIPS && travelled < ROUND_RANGE) {
      skipDirection.set(heading.x, heading.y, heading.z);
      // Off the surface by a hair, or the new ray starts inside the water it left.
      skipRay.set(skipOrigin.copy(at).addScaledVector(skipDirection, .05).setY(skipOrigin.y + .01), skipDirection);
      skipRay.near = 0; skipRay.far = ROUND_RANGE - travelled; energy *= SKIP_ENERGY;
      const hits = stopAtWater(visibleHits(skipRay, gameplayCandidates(), 1)), hit = hits[0];
      if (!hit) return;
      const range = travelled + hit.distance;
      energy = resolveSurfaces(hits, weapon, () => range, energy);
      applySplash(hit.point, weapon, range, energy, hit.object.userData.fpsTarget);
      if (!isWaterHit(hit)) { strike(hit, skipDirection, energy, weaponStyles[weapon]?.id); return; }
      heading = meetWater(hit, skipDirection, energy, weapon); at = hit.point.clone(); travelled = range;
    }
  }
  function damageTarget(index: number, weapon: number, range: number, zone: string | undefined, scale = 1, rawDamage?: number) {
    const target = targets[index];
    if (!target?.alive || scale <= 0) return;
    // Falloff reads how far the round actually travelled, which for one in flight
    // is its whole arc rather than the length of its final segment.
    const damage = Math.max(1, Math.round((rawDamage ?? hitDamage(specs[weapon], range, zone)) * scale));
    hud.landed++; hud.lastDamage = Math.min(target.health, damage); target.health = Math.max(0, target.health - damage);
    target.bar.scale.x = target.health / target.maxHealth; hitTime = .20; hud.hitKind = target.health === 0 ? 'kill' : 'hit';
    if (target.health > 0) return;
    target.alive = false; target.root.visible = false; hud.hits++;
    const chain = registerElimination(killChain, hud.elapsed); killChain = chain; hud.chain = chain.count;
    hud.callout = chain.label; calloutTime = hud.callout ? 2.4 : 0; hud.earnedXp += ELIMINATION_XP;
    options.onElimination?.(`${roundId}:kill:${hud.hits}`);
    comms.add('kills', pilotEnabled ? 'AI pilot' : 'You', `Target ${index + 1} eliminated${chain.label ? ' · ' + chain.label : ''}.`);
    announce(hud.callout, killChain.count);
  }
  /** Surfaces a shot may strike: one, plus whatever its ammunition pierces. */
  const pierceBudget = (weapon: number) => findTrait(specs[weapon].traits, 'penetration')?.surfaces ?? 0;
  /**
   * Resolves every surface a shot passes through, decaying its damage per
   * surface. Returns the damage scale left over, so a round still in flight can
   * carry it into the next segment.
   */
  function resolveSurfaces(hits: THREE.Intersection[], weapon: number, rangeAt: (hit: THREE.Intersection) => number, scale: number) {
    const decay = findTrait(specs[weapon].traits, 'penetration')?.decay ?? 1;
    const struckVehicles = new Set<VehicleKind>();
    for (const hit of hits) {
      const kind = vehicles.hitKind(hit.object);
      if (kind && !struckVehicles.has(kind)) {
        struckVehicles.add(kind);
        const damage = Math.min(vehicles.states[kind].health, hitDamage(specs[weapon], rangeAt(hit)) * scale);
        vehicles.damage(kind, damage);
        if (damage > 0) { hud.lastDamage = Math.round(damage); hitTime = .2; hud.hitKind = 'hit'; }
      }
      if (typeof hit.object.userData.fpsTarget === 'number') damageTarget(hit.object.userData.fpsTarget, weapon, rangeAt(hit), hit.object.userData.fpsZone, scale);
      scale *= decay;
    }
    return scale;
  }
  /**
   * Damages everything else standing near where a shot stopped. The directly
   * struck target is excluded, since it already took the round itself.
   */
  function applySplash(point: THREE.Vector3, weapon: number, range: number, scale: number, direct?: number) {
    const splash = findTrait(specs[weapon].traits, 'splash');
    if (!splash || scale <= 0) return;
    for (const kind of ['car', 'helicopter'] as const) {
      const v = vehicles.states[kind], share = splashScale(point.distanceTo(new THREE.Vector3(v.x, v.y + 1.3, v.z)), splash.radius, splash.minScale);
      if (share > 0) vehicles.damage(kind, hitDamage(specs[weapon], range) * scale * share);
    }
    targets.forEach((target, index) => {
      if (!target.alive || index === direct) return;
      target.hitZone.getWorldPosition(splashPoint);
      const share = splashScale(splashPoint.distanceTo(point), splash.radius, splash.minScale);
      if (share > 0) damageTarget(index, weapon, range, undefined, scale * share);
    });
  }
  /** Raises a supply: the weapon goes down and `apply` runs at the commit point, unless the use is stopped first. */
  function beginSupply(name: string, id: string, profile: SupplyProfile, apply: () => boolean) {
    if (supplyUse || hud.phase !== 'playing' || vehicles.active || hud.health <= 0 || hud.arenaSelf?.alive === false) return false;
    stopReload(); ads = false; touchAim = false; actualAim = false;
    supplyUse = { ...startSupplyUse(profile), name, id, apply };
    supplyGate = armReloadGate(trigger, sprintIntent);
    canvas.focus({ preventScroll: true }); publish();
    return true;
  }
  /** Stops a use. Before its commit point nothing was spent; after it, only the putting-away is skipped. */
  function endSupply() {
    if (!supplyUse) return;
    if (!supplyUse.committed) hud.message = `${supplyUse.name} put away.`;
    supplyUse = null; publish();
  }
  function stepSupply(dt: number) {
    if (!supplyUse) return;
    const use = supplyUse, step = advanceSupplyUse(use, dt);
    if (step.commit) { supplySound(use.profile.style); if (!use.apply()) { supplyUse = null; publish(); return; } }
    if (step.done) { supplyUse = null; publish(); }
  }
  function useQuickItem() {
    const supply = equipment.quickItem;
    if (hud.phase !== 'playing' || supplyUse || !supply?.effect || quickRemaining <= 0 || hud.health <= 0) return;
    const { armor = 0, reserve = 0 } = supply.effect;
    const full = hud.health >= hud.maxHealth && (!armor || hud.armor >= equipment.armor) && (!reserve || loadout[hud.weapon].reserve >= 999);
    if (full) { hud.message = 'Nothing to restore right now.'; publish(); return; }
    beginSupply(supply.name, supply.id, supplyProfile(supply), () => applyQuickItem(supply));
  }
  function applyQuickItem(supply: NonNullable<ResolvedLoadout['quickItem']>) {
    if (quickRemaining <= 0 || !supply.effect) return false;
    const { health = 0, armor = 0, reserve = 0 } = supply.effect;
    if (health) { hud.health = Math.min(hud.maxHealth, hud.health + health); arenaRuntime?.setVitals({ health: hud.health }); recoveryDelay = 0; }
    if (armor) { hud.armor = Math.min(equipment.armor, hud.armor + armor); arenaRuntime?.setVitals({ armor: hud.armor }); }
    if (reserve) loadout[hud.weapon].reserve = Math.min(999, loadout[hud.weapon].reserve + reserve);
    quickRemaining--; hud.quickCount = quickRemaining;
    if (expedition) {
      fieldProfile = consumeItem(fieldProfile, supply.id); equipment = resolveLoadout(fieldProfile);
      expedition.onEquipment(copyProfile(fieldProfile));
    }
    hud.message = `${supply.name} used.`;
    options.onConsume?.(supply.id);
    publish();
    return true;
  }
  function checkCompletion() {
    if (options.arena || hud.health <= 0 || hud.phase === 'complete' || hud.hits !== targetPositions.length) return;
    hud.phase = 'complete'; hud.incoming = false; clearInput(); radioCall('complete');
    const reward = { id: roundId, hits: hud.hits, shots: hud.shots, landed: hud.landed, elapsed: hud.elapsed, combat: !!options.combat };
    hud.earned = rewardAmount(reward); hud.earnedXp += completionXp(reward); options.onComplete?.(reward);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  /** Steps every round still in the air and resolves whatever it reaches first. */
  function advanceRounds(dt: number) {
    if (!rounds.length) return;
    world.scene.updateMatrixWorld(true);
    const candidates = gameplayCandidates();
    let struck = false;
    for (let i = rounds.length - 1; i >= 0; i--) {
      const round = rounds[i], step = advanceRound(round, dt, ROUND_RANGE);
      if (step.distance > 1e-6) {
        roundDirection.set(step.to.x - step.from.x, step.to.y - step.from.y, step.to.z - step.from.z).normalize();
        roundRay.set(roundOrigin.set(step.from.x, step.from.y, step.from.z), roundDirection);
        roundRay.near = 0; roundRay.far = step.distance;
        const segmentHits = stopAtWater(visibleHits(roundRay, candidates, 1 + round.pierced));
        if (segmentHits.length) {
          // travelled already covers the arc up to this segment's start.
          const start = round.travelled - step.distance;
          round.scale = resolveSurfaces(segmentHits, round.weapon, hit => start + hit.distance, round.scale);
          const last = segmentHits[segmentHits.length - 1];
          applySplash(last.point, round.weapon, start + last.distance, round.scale, last.object.userData.fpsTarget);
          if (isWaterHit(last)) {
            struck = true;
            const skip = meetWater(last, roundDirection, round.scale, round.weapon);
            // Restarted just above the surface so its first new segment does not
            // begin inside the water it is leaving.
            const exit = { x: last.point.x + (skip?.x ?? 0) * .05, y: last.point.y + .01 + (skip?.y ?? 0) * .05, z: last.point.z + (skip?.z ?? 0) * .05 };
            if (!skip || !skipRound(round, exit, skip, SKIP_ENERGY)) rounds.splice(i, 1);
            continue;
          }
          strike(last, roundDirection, round.scale, weaponStyles[round.weapon]?.id); struck = true;
          // Stopped once it has struck more surfaces than it could pass through.
          if (segmentHits.length > round.pierced) { rounds.splice(i, 1); continue; }
          round.pierced -= segmentHits.length;
        }
      }
      if (step.expired) rounds.splice(i, 1);
    }
    effects.trails(rounds);
    if (struck) { checkCompletion(); publish(); }
  }
  function hurtPlayer(amount: number) {
    if (hud.health <= 0 || amount <= 0) return;
    const damage = applyArmorDamage(hud.health, hud.armor, amount, equipment.absorption);
    hud.health = damage.health; hud.armor = damage.armor; hurtTime = .4; recoveryDelay = FPS_REGEN_DELAY;
    if (!hud.health) { hud.phase = 'defeated'; clearInput(); radioCall('death'); if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  }
  const blastRay = new THREE.Raycaster(), vehicleRay = new THREE.Raycaster();
  const vehicleAimPoint = new THREE.Vector3();
  let vehicleAimTimer = 0;
  function vehicleCandidates(kind: VehicleKind) {
    // Cast from the gun, not the chase camera: nearby walls still stop rounds.
    return [...gameplayCandidates().filter(o => o !== vehicles.root && !hud.arena?.actors.some(a => a.vehicle && a.id === o.userData.arenaActorId)), vehicles.models[kind === 'car' ? 'helicopter' : 'car']];
  }
  function aimVehicle() {
    const kind = vehicles.active; if (!kind) return;
    world.scene.updateMatrixWorld(true); vehicleRay.setFromCamera(center, camera);
    vehicleRay.far = VEHICLE_COMBAT[kind].range;
    const hit = firstVisibleHit(vehicleRay, vehicleCandidates(kind));
    vehicleAimPoint.copy(hit?.point ?? vehicleRay.ray.at(vehicleRay.far, new THREE.Vector3()));
    if (vehicles.canFire) vehicles.aim(vehicleAimPoint);
    const muzzle = vehicles.models[kind].getObjectByName('vehicle-muzzle')!;
    const origin = muzzle.parent!.getWorldPosition(new THREE.Vector3()), direction = new THREE.Vector3(0, 0, -1).transformDirection(muzzle.matrixWorld);
    vehicleRay.set(origin, direction);
    const actual = firstVisibleHit(vehicleRay, vehicleCandidates(kind));
    const projected = (actual?.point.clone() ?? vehicleRay.ray.at(vehicleRay.far, new THREE.Vector3())).project(camera);
    hud.vehicleAimX = (projected.x + 1) * 50; hud.vehicleAimY = (1 - projected.y) * 50;
    hud.vehicleAimVisible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
  }
  function shootVehicle() {
    const mounted = vehicles.mounted;
    if (!mounted || !vehicles.canFire || arenaRuntime || mounted.weaponCooldown > 0 || mounted.ammo <= 0) return;
    aimVehicle();
    const shot = vehicles.fire(); if (!shot) return;
    hud.shots++; shotSound();
    vehicleRay.set(shot.base, shot.direction); vehicleRay.near = 0; vehicleRay.far = shot.range;
    const hit = firstVisibleHit(vehicleRay, vehicleCandidates(shot.kind));
    effects.beam(hit && hit.distance < shot.base.distanceTo(shot.origin) ? shot.base : shot.origin, hit?.point ?? vehicleRay.ray.at(shot.range, new THREE.Vector3()));
    if (hit) {
      const kind = vehicles.hitKind(hit.object);
      if (kind) vehicles.damage(kind, shot.damage);
      if (typeof hit.object.userData.fpsTarget === 'number') damageTarget(hit.object.userData.fpsTarget, hud.weapon, hit.distance, undefined, 1, shot.damage);
      if (isWaterHit(hit)) effects.splash(hit.point, shot.direction, 1);
      else strike(hit, shot.direction, shot.kind === 'car' ? 1 : 1.6);
    }
    resolveVehicleDestruction(); checkCompletion(); publish();
  }
  function resolveVehicleDestruction() {
    let events = vehicles.takeDestructions();
    const hadDestruction = events.length > 0;
    while (events.length) {
      for (const event of events) {
        world.scene.updateMatrixWorld(true);
        const clearBlast = (point: THREE.Vector3) => {
          const delta = point.clone().sub(event.point), distance = delta.length();
          if (distance < .1) return true;
          blastRay.set(event.point, delta.normalize()); blastRay.near = .1; blastRay.far = distance;
          return !firstVisibleHit(blastRay, gameplayCandidates().filter(o => o !== vehicles.root && !targets.some(t => t.root === o)));
        };
        if (audio && soundBuffer && !hud.muted && audio.state === 'running') {
          const sound = audio.createBufferSource(), gain = audio.createGain(); sound.buffer = soundBuffer;
          sound.playbackRate.value = .16; gain.gain.value = .55; sound.connect(gain).connect(audio.destination); sound.start();
          sound.onended = () => { sound.disconnect(); gain.disconnect(); };
        }
        // Destruction is lethal to the crew, including while airborne.
        if (event.occupied) { hud.message = 'Vehicle destroyed with you aboard.'; hurtPlayer(hud.health + hud.armor + 1); }
        else {
          const point = playerPoint(), amount = vehicleBlastDamage(event.kind, point.distanceTo(event.point));
          if (amount > 0 && clearBlast(point)) {
            if (vehicles.active) vehicles.damage(vehicles.active, amount); else hurtPlayer(amount);
          }
        }
        for (const kind of ['car', 'helicopter'] as const) {
          if (kind === event.kind || kind === vehicles.active) continue;
          const v = vehicles.states[kind], point = new THREE.Vector3(v.x, v.y + 1.3, v.z);
          const amount = vehicleBlastDamage(event.kind, point.distanceTo(event.point));
          if (amount > 0 && clearBlast(point)) vehicles.damage(kind, amount);
        }
        targets.forEach((target, index) => {
          if (!target.alive) return;
          const point = target.hitZone.getWorldPosition(new THREE.Vector3()), amount = vehicleBlastDamage(event.kind, point.distanceTo(event.point));
          if (amount > 0 && clearBlast(point)) damageTarget(index, hud.weapon, 0, undefined, 1, amount);
        });
      }
      events = vehicles.takeDestructions();
    }
    if (hadDestruction) { checkCompletion(); publish(); }
  }
  function shoot() {
    if ((!pilotEnabled && specs[hud.weapon].fireMode === 'semi' && triggerSpent) || vehicles.active || (options.arena && !hud.arenaSelf?.alive) || !fireWeapon(loadout[hud.weapon], hud.weapon, specs)) return;
    hud.shots++; shotSound();
    const recoilDamage = unsupportedRecoilDamage(specs[hud.weapon], prone, grounded(), keys.has('c'));
    if (recoilDamage) {
      hud.message = `Unsupported .50 recoil: ${recoilDamage} damage before armor. Z / Prone to deploy the mount.`;
      if (!arenaRuntime) {
        const damage = applyArmorDamage(hud.health, hud.armor, recoilDamage, equipment.absorption);
        hud.health = damage.health; hud.armor = damage.armor; hurtTime = .4; recoveryDelay = FPS_REGEN_DELAY;
        if (!hud.health) { hud.phase = 'defeated'; clearInput(); radioCall('death'); if (document.pointerLockElement === canvas) document.exitPointerLock(); }
      }
    }
    world.scene.updateMatrixWorld(true); ray.setFromCamera(center, camera);
    const dispersion = sampleShotSpread(spreadAngle);
    shotRight.set(1, 0, 0).applyQuaternion(camera.quaternion); shotUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    ray.ray.direction.addScaledVector(shotRight, dispersion.x).addScaledVector(shotUp, dispersion.y).normalize();
    triggerSpent = true;
    recordBloomShot(bloom[hud.weapon], hud.weapon);
    const muzzle = weapons[hud.weapon].getObjectByName(`${FPS_WEAPONS[hud.weapon].id}__socket_muzzle`);
    if (muzzle) { muzzle.getWorldPosition(muzzlePoint); camera.localToWorld(muzzlePoint); }
    else muzzlePoint.copy(camera.position);
    const supportMultiplier = bipodRecoilMultiplier(specs[hud.weapon].bipod, handling[hud.weapon]?.bipodDeployment ?? 0, prone, grounded(), carry.length());
    const recoilMultiplier = stanceRecoilMultiplier(stance(), grounded(), bodyMotion.eye) * supportMultiplier;
    recordRecoilShot(kick, specs[hud.weapon], hud.weapon, Math.random, recoilMultiplier);
    canvas.dataset.recoilMultiplier = recoilMultiplier.toFixed(3);
    effects.fire({ recoil: specs[hud.weapon].recoil, eject: weapons[hud.weapon].getObjectByName(`${FPS_WEAPONS[hud.weapon].id}__socket_eject`), camera, carry });
    // The arena host owns its own shot resolution and stays instant until it can
    // step rounds per tick; everything else with a finite muzzle velocity flies.
    if (!arenaRuntime && needsFlight(specs[hud.weapon].ballistics)) {
      if (rounds.length < MAX_ROUNDS_IN_FLIGHT)
        rounds.push(createRound(++roundSerial, hud.weapon, camera.position.clone(), ray.ray.direction.clone(), specs[hud.weapon].ballistics, pierceBudget(hud.weapon)));
      publish(); return;
    }
    const candidates = gameplayCandidates();
    // The arena host resolves its own shot, so it only needs the nearest surface.
    const hits = stopAtWater(arenaRuntime ? visibleHits(ray, candidates, 1) : visibleHits(ray, candidates, 1 + pierceBudget(hud.weapon)));
    const hit = hits[0];
    // What the round has left when it stops, which scales the spray it throws.
    let energy = 1;
    if (arenaRuntime) {
      let hitActor = false;
      for (let object: THREE.Object3D | null = hit?.object ?? null; object; object = object.parent) if (object.userData.arenaActorId) hitActor = true;
      arenaRuntime.shoot(camera.position, ray.ray.direction, hud.weapon, hit ? hit.distance + (hitActor ? 0.7 : 0) : 125, prone);
    } else {
      energy = resolveSurfaces(hits, hud.weapon, hit => hit.distance, 1);
      const last = hits[hits.length - 1];
      if (last) applySplash(last.point, hud.weapon, last.distance, energy, last.object.userData.fpsTarget);
    }
    const struck = hits[hits.length - 1];
    const end = struck?.point ?? ray.ray.at(180, new THREE.Vector3());
    effects.beam(muzzlePoint, end);
    if (isWaterHit(struck)) {
      const skip = meetWater(struck, ray.ray.direction, energy, hud.weapon);
      // The arena host resolves its own shots, so there the skip is spray only.
      if (skip && !arenaRuntime) skipInstantShot(struck.point, skip, struck.distance, energy, hud.weapon);
    } else if (struck) strike(struck, ray.ray.direction, energy, weaponStyles[hud.weapon]?.id);
    checkCompletion();
    publish();
  }

  function playerPoint() { return vehicles.mounted ? new THREE.Vector3(position.x, vehicles.mounted.y + 1.65, position.z) : camera.position.clone(); }
  function hasLineOfSight(index: number) {
    const target = targets[index];
    if (!target?.alive) return false;
    target.hitZone.getWorldPosition(attackOrigin);
    const direction = playerPoint().sub(attackOrigin), distance = direction.length();
    if (distance > 65) return false;
    attackRay.set(attackOrigin, direction.normalize()); attackRay.near = .07; attackRay.far = Math.max(.07, distance - .1);
    return !firstVisibleHit(attackRay, world.scene.children.filter(o => o !== target.root && !o.userData.fpsEffect && (!vehicles.active || o !== vehicles.root)));
  }
  function counterFire(dt: number) {
    if (pendingAttack) {
      pendingAttack.remaining -= dt;
      if (pendingAttack.remaining <= 0) {
        const attack = pendingAttack; pendingAttack = null; hud.incoming = false;
        if (hasLineOfSight(attack.target) && playerPoint().distanceTo(attack.aim) < .75) {
          if (vehicles.active) vehicles.damage(vehicles.active, 36);
          else { hurtPlayer(18); hitDirections.add(viewer(), attackOrigin, hitStrength(18, hud.maxHealth)); }
          resolveVehicleDestruction();
          publish();
        }
      }
      return;
    }
    attackTimer -= dt;
    if (attackTimer > 0) return;
    attackTimer = 2.2;
    const index = targets.findIndex((_, i) => hasLineOfSight(i));
    if (index >= 0) { pendingAttack = { target: index, remaining: .7, aim: playerPoint() }; hud.incoming = true; publish(); }
  }

  function sharedVehicleControls(): VehicleControls {
    const keys = drivingKeys();
    return { forward: Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown')),
      steer: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')),
      lift: Number(keys.has(' ')) - Number(keys.has('c') || keys.has('control')), brake: keys.has(' '), boost: keys.has('shift'),
      fire: trigger && hud.phase === 'playing' && vehicles.canFire,
      aim: { x: vehicleAimPoint.x, y: vehicleAimPoint.y, z: vehicleAimPoint.z } };
  }
  function updateArena(dt: number) {
    if (!arenaRuntime) return;
    const frame = arenaRuntime.update(dt, {
      x: position.x, y: eyeHeight() + vertical, z: position.z, yaw, pitch,
      ...(vehicles.active ? { vehicleControls: sharedVehicleControls() } : {}),
      prone, weapon: hud.weapon, playing: hud.phase === 'playing', reloading: loadout[hud.weapon].reloadRemaining > 0,
    });
    const previousSelf = hud.arenaSelf;
    const previousMatch = hud.arena;
    // Hosts already reset synchronously in reset(); only guests adopt a remote rematch.
    const newRound = options.arena?.session.role === 'guest' && previousMatch && frame.snapshot && (frame.snapshot.tick < previousMatch.tick || (previousMatch.finished && !frame.snapshot.finished));
    if (newRound) {
      hud.phase = 'ready'; hud.shots = hud.landed = hud.earned = hud.earnedXp = hud.chain = 0;
      hud.callout = ''; hud.message = ''; calloutTime = 0; killChain = { count: 0, lastAt: -Infinity };
      clearInput(); vehicles.reset(); stopVoice(); encik.reset(); comms.clear(); hud.encikCallout = null; loadout = createLoadout(specs);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    const oldVehicle = vehicles.active, oldSeat = vehicles.seat;
    if (frame.snapshot?.vehicles && options.arena) {
      for (const shot of vehicles.adoptShared(frame.snapshot.vehicles, options.arena.session.id)) { effects.beam(shot.origin, shot.end); shotSound(); }
      if (oldVehicle !== vehicles.active || oldSeat !== vehicles.seat) {
        if (!oldVehicle && vehicles.mounted) { yaw = vehicles.mounted.yaw; pitch = -.23; }
        clearInput(); vertical = velocityY = 0;
        if (frame.self) position = { x: frame.self.x, z: frame.self.z };
      }
      if (vehicles.mounted) position = { x: vehicles.mounted.x, z: vehicles.mounted.z };
    }
    if (frame.vehicleNotice) vehicles.setNotice(frame.vehicleNotice);
    hud.arena = frame.snapshot; hud.arenaSelf = frame.self; hud.arenaConnected = frame.connected; hud.arenaStarted = frame.started;
    if (frame.snapshot) hud.elapsed = frame.snapshot.elapsed;
    if (frame.snapshot) dropFallenWeapons(frame.snapshot.actors, frame.feed);
    if (frame.self) {
      if (vehicles.active) hud.shots = frame.self.shots;
      hud.hits = frame.self.kills; hud.health = frame.self.health; hud.armor = frame.self.armor;
      if (previousSelf && frame.self.health < previousSelf.health) { hurtTime = .4; recoveryDelay = FPS_REGEN_DELAY; }
      const struck = frame.self.hurtFrom;
      if (struck && struck.serial !== hurtSerial) {
        const lost = previousSelf ? previousSelf.health + previousSelf.armor - frame.self.health - frame.self.armor : 0;
        if (hurtSerial >= 0 && lost > 0) hitDirections.add(viewer(), struck, hitStrength(lost, hud.maxHealth), struck.blast ? 'blast' : 'shot');
        hurtSerial = struck.serial;
      } else if (!struck) hurtSerial = 0;
      if (!frame.self.alive && previousSelf?.alive) { supplyUse = null; radioCall('death'); clearInput(); killChain = { count: 0, lastAt: -Infinity }; hud.chain = 0; hud.callout = ''; calloutTime = 0; }
      if (frame.spawn) {
        if (previousSelf && !previousSelf.alive) radioCall('respawn');
        pilot.reset(); strategicPlanner?.reset();
        position = { x: frame.self.x, z: frame.self.z }; vertical = Math.max(0, frame.self.y - 1.75); velocityY = 0;
        yaw = frame.self.yaw; pitch = frame.self.pitch; loadout = createLoadout(specs); clearInput(); supplyUse = null;
        if (checkpointPending) {
          loadout = loadout.map((fresh, index) => {
            const carried = checkpointPending?.ammunition?.[index]; if (!carried) return fresh;
            return { magazine: Number.isFinite(carried.magazine) ? Math.max(0, Math.min(fullLoad(specs[index]), Math.floor(carried.magazine))) : fresh.magazine,
              reserve: Number.isFinite(carried.reserve) ? Math.max(0, Math.min(999, Math.floor(carried.reserve))) : fresh.reserve, cooldown: 0, reloadRemaining: 0 };
          });
          hud.weapon = equipment.carriedFamilies.includes(checkpointPending.weapon) ? checkpointPending.weapon : equipment.carriedFamilies[0]; checkpointPending = undefined;
          weapons.forEach((weapon, index) => weapon.visible = index === hud.weapon);
          effects.attachMuzzle(weapons[hud.weapon]?.getObjectByName(`${FPS_WEAPONS[hud.weapon].id}__socket_muzzle`));
          effects.setStyles(weaponStyles, hud.weapon);
        }
        resetRecoil(kick); effects.reset(); hitTime = 0; bloom.forEach(state => { state.amount = 0; state.delay = 0; }); updateCameras(0, false, false);
      } else if (frame.correction && !vehicles.active) {
        position = { x: frame.self.x, z: frame.self.z };
        vertical = Math.max(0, frame.self.y - eyeHeight()); velocityY = 0;
        resetMovementMotion(bodyMotion, eyeHeight()); carry.set(0, 0, 0);
        updateCameras(0, false, false);
      }
      rig.visible = frame.self.alive && !vehicles.active;
    }
    if (frame.hit?.hitId) { hud.landed++; hud.lastDamage = frame.hit.damage; hitTime = .2; hud.hitKind = frame.hit.killed ? 'kill' : 'hit'; }
    for (const event of frame.feed) {
      comms.add('kills', 'Arena', event.text);
      if (event.killerId !== options.arena!.session.id) continue;
      const chain = registerElimination(killChain, hud.elapsed); killChain = chain; hud.chain = chain.count;
      hud.callout = chain.label || 'ELIMINATION'; calloutTime = 2.4; announce(hud.callout, chain.count);
    }
    if (!frame.connected && options.arena!.session.role === 'guest' && hud.phase !== 'loading') {
      hud.message = 'The host disconnected. Return to the lobby to join another match.';
      if (hud.phase === 'playing') pause();
    }
    if (frame.snapshot?.finished && hud.phase !== 'complete') {
      hud.phase = 'complete'; clearInput(); hud.incoming = false; radioCall('complete');
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      publish();
    }
  }

  /**
   * On an expedition a fallen enemy leaves their weapon where they fell. A bot
   * is seen alive and then not, which covers every cause of death, including
   * artillery; the feed only says whether the kill was the player's.
   */
  function dropFallenWeapons(actors: readonly ArenaActor[], feed: readonly { killerId?: string; victimId?: string }[]) {
    for (const actor of actors) {
      if (!actor.bot) continue;
      const was = botsAlive.get(actor.id); botsAlive.set(actor.id, actor.alive);
      if (!expedition || !markers || was !== true || actor.alive || !actor.variant) continue;
      const fell = expedition.loot.drop(expedition.zone, actor.variant, { x: actor.x, z: actor.z, y: Math.max(0, actor.y - (actor.prone ? PRONE_EYE_HEIGHT : 1.75)) });
      if (!fell) continue;
      fell.evicted.forEach(id => markers.remove(id)); markers.addDrop(fell.loot);
      hud.fieldLoot = expedition.loot.remaining(expedition.zone);
      if (feed.some(event => event.victimId === actor.id && event.killerId === options.arena?.session.id))
        comms.add('system', 'Field', `${fell.loot.name} dropped by ${actor.name}. E to take it.`);
    }
  }
  /** Where a point lies from the player, in words: "60 m ahead", "120 m to your left". */
  function whereFrom(target: { x: number; z: number }) {
    const dx = target.x - position.x, dz = target.z - position.z, distance = Math.hypot(dx, dz);
    if (distance < 8) return 'on you';
    const ahead = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / distance, right = (Math.cos(yaw) * dx - Math.sin(yaw) * dz) / distance;
    const side = ahead > .7 ? 'ahead' : ahead < -.7 ? 'behind you' : right > 0 ? 'to your right' : 'to your left';
    return `${Math.round(distance / 5) * 5} m ${side}`;
  }
  /**
   * Runs the event clock between snapshots, plays what lands this frame —
   * blasts, spotting smoke, whistles, mortar thumps, door-gun fire — and keeps
   * the HUD banner on whichever event most concerns the player, the map's
   * danger rings and jamming, and the smoke or gas you are standing in.
   */
  function updateCombatEvents(dt: number) {
    const snapshot = hud.arena, events: readonly CombatEventDescriptor[] = snapshot?.events ?? [], raiders = snapshot?.raiders ?? [];
    if (!snapshot) { hud.combatBanner = null; hud.mapDangers = []; hud.mapJammed = false; hud.cloudCover = null; return; }
    // Snapshots arrive at 10–20 Hz; between them the clock runs on, easing toward
    // the authority's time and never stepping backwards.
    const previous = eventClock < 0 || Math.abs(snapshot.elapsed - eventClock) > .5 ? snapshot.elapsed : eventClock;
    eventClock = Math.max(previous, previous + dt + (snapshot.elapsed - previous - dt) * Math.min(1, dt * 4));
    const listener = camera.position, flat = (p: { x: number; z: number }) => Math.hypot(p.x - listener.x, p.z - listener.z);
    for (const cue of combatCues(events, previous, eventClock)) {
      if (cue.kind === 'launch') { combatAudio.thunk(flat(cue.payload.launch!)); continue; }
      const at = combatVisuals.landingOf(cue.event, cue.payload), distance = at.distanceTo(listener);
      if (cue.kind === 'whistle') { combatAudio.whistle(distance, Math.min(WHISTLE_LEAD, cue.payload.flight)); continue; }
      if (cue.payload.blast) {
        const size = cue.payload.kind === 'bomb' ? 1.5 : cue.payload.kind === 'mortar' ? .8 : 1;
        combatVisuals.blast(at, size); combatAudio.boom(distance, size);
        shake = Math.min(1, shake + Math.max(0, 1 - distance / (70 * size)) * .9 * Math.min(1.2, size));
      } else { combatVisuals.spot(at, cue.payload.smoke ?? '#d8463a'); combatAudio.boom(distance, cue.payload.kind === 'canister' ? .12 : .3); }
    }
    for (const event of events) {
      if (seenEvents.has(event.id)) continue;
      seenEvents.add(event.id);
      const plugin = getCombatEvent(event.kind);
      if (!plugin || !['warning', 'active'].includes(combatPhase(event, eventClock))) continue;
      comms.add('system', plugin.hazard ? 'Fire control' : 'Intel', `${plugin.banner.warning} · ${whereFrom(event.target)}`);
      if (plugin.hazard) combatAudio.alert();
    }
    if (seenEvents.size > 200) { seenEvents.clear(); events.forEach(e => seenEvents.add(e.id)); }
    // A crate this player opened is theirs: the host only says who got there first.
    for (const event of events) if (event.kind === 'supply-drop' && event.outcome === 'claimed' && !openedSupplies.has(event.id)) {
      openedSupplies.add(event.id); if (event.claimedBy === options.arena?.session.id) openSupply(event);
    }
    let banner: FpsHud['combatBanner'] = null, rank = 0, engine: { mode: 'land' | 'air' | null; distance: number; effort: number } = { mode: null, distance: Infinity, effort: 0 };
    // Higher rank wins: a drone diving at you beats a barrage you stand in, which beats news.
    const offer = (text: string, tone: 'hazard' | 'notice', priority: number) => { if (priority > rank) { rank = priority; banner = { text, tone }; } };
    let jet = Infinity, raid = Infinity, drone = Infinity, siren = false, jammed = false, cloud: FpsHud['cloudCover'] = null, lockedOn = false;
    const dangers: FpsHud['mapDangers'] = [];
    for (const event of events) {
      const plugin = getCombatEvent(event.kind); if (!plugin) continue;
      const phase = combatPhase(event, eventClock), age = eventClock - event.start, live = phase === 'warning' || phase === 'active';
      const countdown = `${Math.max(1, Math.ceil(event.start + plugin.warning - eventClock))}s`;
      if (event.kind === 'air-raid' && live) siren = true;
      for (const payload of combatTimeline(event)) {
        if (payload.type === 'transport') {
          const pose = transportPose(payload, age), distance = Math.hypot(pose.x - listener.x, pose.y - listener.y, pose.z - listener.z);
          if (pose.visible && distance < engine.distance) engine = { mode: payload.mode, distance, effort: pose.effort };
          if (!plugin.hazard && age < payload.depart) offer(`${age < payload.arrive ? plugin.banner.warning : plugin.banner.active} · ${whereFrom(payload.drop)}`, 'notice', 1);
        } else if (payload.type === 'flyer') {
          const pose = flyerPose(payload, age); if (pose.visible) jet = Math.min(jet, Math.hypot(pose.x - listener.x, pose.y, pose.z - listener.z));
        } else if (payload.type === 'marker' && age >= payload.from && age <= payload.until) {
          dangers.push({ id: `${event.id}/${payload.id}`, x: payload.center.x, z: payload.center.z, radius: payload.radius, kind: plugin.hazard ? 'ring' : 'crate' });
          if (!plugin.hazard) continue;
          const inside = Math.hypot(position.x - payload.center.x, position.z - payload.center.z) < payload.radius + 12;
          const crew = event.kind === 'mortar' && event.origin && event.ended === undefined ? ` · crew ${whereFrom(event.origin)}` : '';
          // A hazard outranks news; a barrage you are standing in outranks one you are not.
          if (phase === 'warning') offer(`${plugin.banner.warning} · ${countdown} · ${whereFrom(payload.center)}${crew}`, 'hazard', 3);
          else if (phase === 'active' && inside) offer(`${plugin.banner.active}${crew}`, 'hazard', 4);
          else if (phase === 'active' && crew) offer(`MORTAR FIRE${crew}`, 'hazard', 2);
        } else if (payload.type === 'cloud' && age >= payload.from && age <= payload.until) {
          const amount = Math.max(0, 1 - Math.hypot(position.x - payload.center.x, position.z - payload.center.z) / payload.radius);
          if (amount > (cloud?.amount ?? 0) && vertical < 6) cloud = { kind: payload.dps > 0 ? 'gas' : 'smoke', amount };
          if (!plugin.hazard) offer(`${plugin.banner.active} · ${whereFrom(payload.center)}`, 'notice', 1);
        } else if (payload.type === 'jam' && age >= payload.from && age <= payload.until) {
          jammed = true;
          offer(atmosphere.light.lighting.shift > .5 ? 'BLACKOUT · MAP AND RADIO DOWN' : plugin.banner.active, 'notice', 1);
        } else if (payload.type === 'crate' && event.ended === undefined) {
          const pose = cratePose(payload, age);
          if (pose.visible) offer(`${pose.landed ? plugin.banner.active : plugin.banner.warning} · ${whereFrom(payload.at)}`, 'notice', 1);
        }
      }
      if (!live || !['helicopter-raid', 'drone', 'sniper'].includes(event.kind)) continue;
      // Hunters: their warning is a countdown; once here, where they are is what matters.
      if (phase === 'warning') { offer(`${plugin.banner.warning} · ${countdown}`, 'hazard', 3); continue; }
      const raider = raiders.find(r => r.event === event.id);
      if (event.kind === 'sniper') { if (event.ended === undefined && event.origin) offer(`${plugin.banner.active} · ${whereFrom(event.origin)}`, 'hazard', 2); continue; }
      if (!raider || ['down', 'wreck', 'exploded'].includes(raider.state)) continue;
      const onMe = !!raider.aim && Math.hypot(raider.aim.x - position.x, raider.aim.z - position.z) < 2.5;
      if (event.kind === 'drone' && onMe && (raider.state === 'lock' || raider.state === 'dive')) { lockedOn = true; offer('DRONE LOCKED ON · BREAK LINE OF SIGHT OR SHOOT IT', 'hazard', 5); }
      else offer(`${plugin.banner.active} · ${whereFrom(raider)}`, 'hazard', event.kind === 'helicopter-raid' ? 3 : 2);
    }
    for (const r of raiders) {
      if (['wreck', 'exploded'].includes(r.state)) continue;
      const distance = Math.hypot(r.x - listener.x, r.y - listener.y, r.z - listener.z);
      if (r.kind === 'gunship') raid = Math.min(raid, distance); else drone = Math.min(drone, distance);
      if (r.state !== 'down') dangers.push({ id: `raider-${r.event}`, x: r.x, z: r.z, radius: 0, kind: 'raider' });
    }
    lockBeep -= dt;
    if (lockedOn && lockBeep <= 0) { combatAudio.beep(); lockBeep = .22; }
    hud.combatBanner = banner;
    hud.mapJammed = jammed; hud.mapDangers = jammed ? [] : dangers; hud.cloudCover = cloud;
    blackout += ((jammed ? 1 : 0) - blackout) * Math.min(1, dt * 1.5);
    combatAudio.transport(engine.mode, engine.distance, engine.effort);
    combatAudio.loop('jet', jet); combatAudio.loop('raid', raid); combatAudio.loop('drone', drone); combatAudio.loop('siren', siren ? 0 : Infinity);
    const happened = combatVisuals.update(dt, events, eventClock, camera, raiders);
    happened.shots.slice(0, 2).forEach(at => combatAudio.crack(at.distanceTo(listener)));
    for (const { at, size } of happened.blasts) {
      const distance = at.distanceTo(listener); combatAudio.boom(distance, size);
      shake = Math.min(1, shake + Math.max(0, 1 - distance / (60 * size)) * .8);
    }
    const live = combatVisuals.counts, census = `${events.length}/${live.fire}/${live.smoke}/${live.craters}/${live.transports}/${live.flyers}/${live.raiders}/${live.pits}/${live.crates}/${live.puffs}`;
    if (census !== canvas.dataset.combatEvents) canvas.dataset.combatEvents = census;
  }
  /** A supply crate this player reached first: field loot round it on an expedition, a top-up anywhere else. */
  function openSupply(event: CombatEventDescriptor) {
    if (expedition && markers) {
      const items = expedition.loot.supply(expedition.zone, event.id, { x: event.target.x, z: event.target.z, y: vertical });
      items.forEach(item => markers.addDrop(item)); hud.fieldLoot = expedition.loot.remaining(expedition.zone);
      hud.lootNotice = `Supply drop open: ${items.map(item => item.name).join(', ')}. E to take.`; lootNoticeTime = 5;
    } else {
      loadout.forEach((state, index) => { state.reserve = Math.min(999, state.reserve + specs[index].reserve); });
      hud.health = hud.maxHealth; hud.armor = equipment.armor; arenaRuntime?.setVitals({ health: hud.health, armor: hud.armor });
      hud.lootNotice = 'Supply drop open: ammunition topped up, health and plates restored.'; lootNoticeTime = 5;
    }
    comms.add('system', 'Supplies', hud.lootNotice); radioCall('pickup');
  }
  /**
   * Debug: call an event in now. Area events land ahead of you (artillery 35 m,
   * smoke 25 m, a supply drop 30 m, a blackout on you); hunters come for you;
   * a transport plans its own drop.
   */
  function triggerCombatEvent(kind: string) {
    if (!arenaRuntime || !hud.combatEventsAvailable || disposed) return;
    const plugin = getCombatEvent(kind), transport = kind === 'transport-land' || kind === 'transport-air'; if (!plugin) return;
    const reach = transport || plugin.targeting?.policy === 'player' ? null : ({ 'smoke-screen': 25, 'supply-drop': 30, blackout: 0 } as Record<string, number>)[kind] ?? 35;
    const ahead = reach === null ? undefined : { x: position.x - Math.sin(yaw) * reach, z: position.z - Math.cos(yaw) * reach };
    const event = arenaRuntime.triggerEvent(kind, ahead);
    if (!event) {
      hud.message = transport ? 'No clear drop for that transport right now.' : !hud.arenaSelf?.alive && reach === null ? 'That event comes for you: call it once you are back on your feet.'
        : kind === 'mortar' || kind === 'sniper' ? 'Nowhere for that team to set up here right now.' : 'Fire control is busy. Try again when the current events finish.';
      publish();
    }
  }

  const resize = () => {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height); occlusion.setSize(); camera.aspect = viewCamera.aspect = width / height;
    camera.updateProjectionMatrix(); viewCamera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const animate = (now: number) => {
    if (disposed) return;
    // Stop controls even if a browser/VM delays or drops pointerlockchange.
    if (hud.phase === 'playing' && !pilotEnabled && inputMode === 'mouse' && document.pointerLockElement !== canvas) pause();
    const realDt = Math.max((now - lastTime) / 1000, 0), dt = Math.min(realDt, 0.05); lastTime = now;
    if (pilotEnabled && ['complete', 'defeated', 'error'].includes(hud.phase)) { pilotEnabled = false; pilot.reset(); strategicPlanner?.reset(); }
    if (pilotEnabled && hud.phase === 'playing' && now >= nextPilotAt) { nextPilotAt = now + PILOT_INTERVAL * 1000; updatePilot(now / 1000); }
    if (disposed || travelPending) return;
    let moving = false, sprinting = false;
    // The arena keeps running behind pause menus, including magazine reloads.
    if (options.arena) loadout.forEach((state, i) => advanceWeapon(state, i, realDt, specs));
    if (hud.phase === 'playing' && (!options.arena || hud.arenaSelf?.alive)) {
      bloom.forEach(state => advanceBloom(state, dt));
      calloutTime = Math.max(0, calloutTime - realDt); if (!calloutTime) hud.callout = '';
      if (!options.arena) hud.elapsed += realDt;
      if (!options.arena) loadout.forEach((state, i) => advanceWeapon(state, i, realDt, specs));
      if (vehicles.mounted) {
        if (!arenaRuntime) yaw += vehicles.step(drivingKeys(), dt);
        if (vehicles.mounted) position = { x: vehicles.mounted.x, z: vehicles.mounted.z };
        carry.set(0, 0, 0);
      } else {
      if (!arenaRuntime) vehicles.step(keys, dt);
      const move = resolveMovement(keys, moveStick);
      const forward = move.forward, side = move.side;
      const onGround = grounded(), poseStance = stance(), burden = movement();
      sprinting = sprintIntent = move.sprint && forward > .5 && poseStance === 'stand';
      // A fresh trigger pull or sprint stops a reload; one already held when it
      // began does not, and a held sprint drops to a run until the reload ends.
      if (loadout[hud.weapon].reloadRemaining > 0) {
        if (reloadInterrupt(reloadGate, trigger, sprinting, roundReady(loadout[hud.weapon], specs[hud.weapon]))) stopReload();
        else sprinting = false;
      }
      // A fresh trigger pull or sprint puts a supply away; one already held walks.
      if (supplyUse) { if (reloadInterrupt(supplyGate, trigger, sprinting, true)) endSupply(); else sprinting = false; }
      const speed = (poseStance === 'prone' ? .85 : poseStance === 'crouch' ? 2.1 : sprinting ? 7 : (ads || touchAim) ? 2.5 : 4.2) * (supplyUse ? SUPPLY_MOVE_SCALE : 1);
      const target = movementInput(forward, side, yaw, speed * burden.movement, 1);
      if (consumeJump(bodyMotion, onGround, poseStance === 'stand' && bodyMotion.eye > 1.6, dt)) velocityY = 5.6 * burden.jumpVelocity;
      const delta = advanceGroundMotion(bodyMotion, target.x, target.z, onGround && velocityY <= 0, burden.movement, poseStance, braced(), dt);
      // Keep enough clearance for the head while lowering into a crawl.
      const clearance = Math.max(eyeHeight(), bodyMotion.eye) + .05;
      const height = footMovement.canOccupy(position.x, vertical, position.z, .38, clearance) ? clearance : eyeHeight() + .05;
      const next = footMovement.move({ ...position, y: vertical, velocityY }, delta.x, delta.z, dt, .38, height,
        expedition ? [] : vehicles.footObstacles().slice(world.obstacles.length), INFANTRY_GRAVITY);
      moving = Math.hypot(next.x - position.x, next.z - position.z) > .0001;
      carry.set((next.x - position.x) / Math.max(dt, 1e-4), 0, (next.z - position.z) / Math.max(dt, 1e-4));
      // A blocked axis loses momentum instead of storing a burst against the wall.
      if (Math.abs(next.x - position.x - delta.x) > .001) bodyMotion.x = carry.x;
      if (Math.abs(next.z - position.z - delta.z) > .001) bodyMotion.z = carry.z;
      if (next.impactSpeed > 1.5) { landMovement(bodyMotion, next.impactSpeed); movementSound(Math.min(1, next.impactSpeed / 9), true); }
      position = next;
      vertical = next.y; velocityY = next.velocityY;
      }
      // Recoil and the effect pools run on wall-clock time, as the weapon
      // cooldowns already do: on a renderer slow enough that `dt` is clamped,
      // rounds still leave at their real rate, so anything the shot throws off
      // has to settle at its real rate too or it piles up.
      advanceRecoil(kick, realDt); applyAimPush();
      updateCameras(dt, moving, sprinting);
      resolveVehicleDestruction();
      vehicleAimTimer -= realDt;
      if (vehicles.active && vehicleAimTimer <= 0) { aimVehicle(); vehicleAimTimer = .05; }
      if (supplyUse && (vehicles.active || hud.health <= 0)) endSupply();
      stepSupply(realDt);
      if (trigger && !sprinting && !supplyUse && hud.phase === 'playing') { if (vehicles.active) shootVehicle(); else shoot(); }
      if (hud.phase === 'playing' && options.combat && !options.arena) counterFire(realDt);
    } else { advanceRecoil(kick, realDt); applyAimPush(); carry.set(0, 0, 0); updateCameras(dt, false, false); }
    updateArena(realDt);
    updateCombatEvents(realDt);
    if (arenaRuntime && !expedition) vehicles.sharedStep(dt);
    if (debugAvailable && hud.phase === 'playing' && hud.health > 0) {
      recoveryDelay = Math.max(0, recoveryDelay - dt);
      if (debug.regeneration && recoveryDelay === 0 && hud.health < hud.maxHealth) {
        hud.health = regenerateHealth(hud.health, hud.maxHealth, dt); arenaRuntime?.setVitals({ health: hud.health });
      }
    }
    if (!arenaRuntime && (hud.phase === 'defeated' || hud.phase === 'complete')) vehicles.animateEffects(dt);
    if (expedition) { updateExpeditionPrompts(); lootNoticeTime = Math.max(0, lootNoticeTime - realDt); if (!lootNoticeTime) hud.lootNotice = ''; }
    hurtTime = Math.max(0, hurtTime - dt); hud.hurt = hurtTime > 0;
    hitDirections.advance(realDt);
    hitOverlay.render(viewer(), hitDirections.list, hud.phase === 'playing' && hud.health > 0 && hud.arenaSelf?.alive !== false);
    hitTime = Math.max(0, hitTime - dt);
    advanceRounds(realDt);
    resolveVehicleDestruction();
    floorCheck -= realDt;
    if (floorCheck <= 0 && hud.phase === 'playing' && !vehicles.mounted) {
      floorCheck = .75;
      floorRay.ray.origin.copy(camera.position);
      const ground = firstVisibleHit(floorRay, gameplayCandidates());
      brassFloor = ground ? ground.point.y : 0;
    }
    // A hair proud of the deck, so a case lies on it rather than in it.
    effects.update(realDt, camera, brassFloor + .004);
    // One string, written only when it changes, so a browser smoke can watch
    // the pools without the frame paying for four attribute writes.
    const live = effects.counts, census = `${live.casings}/${live.impacts}/${live.sparks}/${live.scorches}`;
    if (census !== canvas.dataset.fxCensus) canvas.dataset.fxCensus = census;
    const water = `${live.splashes}/${live.droplets}`;
    if (water !== canvas.dataset.fxSplash) canvas.dataset.fxSplash = water;
    const kicked = kick.pitch.toFixed(4);
    if (kicked !== canvas.dataset.fxRecoil) canvas.dataset.fxRecoil = kicked;
    // The aim the weapon is currently holding, which is the half a smoke can
    // tell apart from decoration.
    const climb = kick.climb.toFixed(4);
    if (climb !== canvas.dataset.fxClimb) canvas.dataset.fxClimb = climb;
    if (effects.style.id !== canvas.dataset.fxStyle) canvas.dataset.fxStyle = effects.style.id;
    if (motor && motorGain && audio) {
      const active = hud.phase === 'playing' && vehicles.mounted && !hud.muted;
      motorGain.gain.setTargetAtTime(active ? .035 : 0, audio.currentTime, .08);
      motor.frequency.setTargetAtTime(vehicles.active === 'helicopter' ? 54 + Math.sin(hud.elapsed * 24) * 8 : 35 + Math.abs(vehicles.mounted?.speed || 0) * 4, audio.currentTime, .05);
    }
    if (hud.phase === 'playing' && hud.health > 0 && hud.arenaSelf?.alive !== false) {
      if (hud.health < hud.maxHealth * .3) radioCall('medical');
      else if (hurtTime > 0) radioCall('hurt');
      else if (hud.incoming) radioCall('contact');
      else if (loadout[hud.weapon].reserve < 20) radioCall('lowAmmo');
    }
    hud.encikCallout = encik.current(now / 1000);
    world.animate(hud.elapsed);
    markers?.update(realDt, camera.position);
    // Shadows move the sun's target first; the atmosphere then places the sun from it.
    lightView(realDt);
    atmosphere.update(dt, camera);
    // Blast shake, two-axis and quickly settling; none at all with reduced motion.
    if (shake > .001) {
      const amount = motionPreference?.matches ? 0 : shake * shake * .035;
      camera.rotation.x += (Math.random() - .5) * amount; camera.rotation.y += (Math.random() - .5) * amount; camera.updateMatrixWorld(true);
      shake *= Math.exp(-realDt * 5);
    }
    const sight = weapons[hud.weapon] ? getWeaponSight(weapons[hud.weapon]) : undefined;
    const opticActive = rig.visible && !vehicles.active && hud.phase === 'playing';
    const scopeActive = scopeRenderer.render(world.scene, camera, viewCamera, sight, opticActive, aimProgress);
    const reflectionCaptured = opticReflections.render(world.scene, camera, viewCamera, sight?.reflection, opticActive, now / 1000);
    canvas.dataset.scopeActive = String(scopeActive);
    canvas.dataset.reflexPowered = String(!!sight && sight.magnification <= 1.01 && sight.lens.visible);
    canvas.dataset.opticReflection = String(!!sight?.reflection?.uniforms.reflectionReady.value && opticActive);
    canvas.dataset.reflexReflection = String(sight?.magnification === 1 && canvas.dataset.opticReflection === 'true');
    if (reflectionCaptured) canvas.dataset.reflexCaptures = String(Number(canvas.dataset.reflexCaptures || 0) + 1);
    canvas.dataset.occlusion = String(occlusion.render(atmosphere.light.occlusion));
    renderer.clearDepth(); renderer.render(viewScene, viewCamera);
    if (now - lastReport > 100) { publish(); lastReport = now; }
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);

  const assetIds = expedition ? ['sar21-inspired', 'ultimax-inspired'] : ['sar21-inspired', 'ultimax-inspired', 'range-target', 'supply-crate', 'sandbag-wall', 'traffic-cone'];
  void Promise.all(assetIds.map(async id => {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/field-kit/${id}.glb`);
    if (disposed) disposeAssets([gltf.scene]); else templates.push(gltf.scene);
    return gltf.scene;
  })).then(loaded => {
    if (disposed) return;
    weapons.push(loaded[0], loaded[1], ...FPS_WEAPONS.slice(2).map(spec => {
      const model = buildServiceWeapon(spec.id)!; templates.push(model); return model;
    })); weapons.forEach((w, i) => { undress.push(dressWeapon(w, specs[i])); handling.push(createWeaponHandling(w, i)); rig.add(w); w.visible = i === hud.weapon; });
    effects.attachMuzzle(weapons[hud.weapon].getObjectByName(`${FPS_WEAPONS[hud.weapon].id}__socket_muzzle`));
    effects.setStyles(weaponStyles, hud.weapon);
    if (!options.arena) targetPositions.forEach((p, i) => {
      const root = new THREE.Group(); root.position.set(p.x, 0.13, p.z);
      root.rotation.y = Math.atan2(spawn.x - p.x, spawn.z - p.z);
      root.add(loaded[2].clone(true));
      const hitZone = new THREE.Mesh(targetGeometry, targetMaterial); hitZone.position.set(0, 1.3, 0.026); hitZone.userData.fpsTarget = i; root.add(hitZone);
      // A separate, smaller collider above centre mass. It never overlaps the body
      // zone, so the nearest-surface rule picks exactly one of the two.
      const headZone = new THREE.Mesh(headGeometry, targetMaterial); headZone.position.set(0, 1.72, 0.026);
      headZone.userData.fpsTarget = i; headZone.userData.fpsZone = 'head'; root.add(headZone);
      const maxHealth = i % 2 ? 115 : 100;
      const bar = new THREE.Mesh(healthGeometry, healthMaterial); bar.position.set(0, 1.91, .04); root.add(bar);
      world.scene.add(root); targets.push({ root, hitZone, alive: true, health: maxHealth, maxHealth, bar });
      world.obstacles.push({ minX: p.x - 0.42, maxX: p.x + 0.42, minZ: p.z - 0.42, maxZ: p.z + 0.42 });
    });
    if (!expedition) for (const [asset, x, z, width, depth] of district.props) {
      const prop = loaded[asset].clone(true); prop.position.set(x, 0.14, z); decorations.add(prop);
      world.obstacles.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, maxY: asset === 3 ? 0.8 : asset === 4 ? 0.9 : 0.7 });
    }
    // Range props are appended after asynchronous model loading; refresh the static broadphase.
    footMovement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
    if (options.arena) {
      arenaRuntime = createArenaRuntime({ scene: world.scene, obstacles: world.obstacles, ...options.arena, ...(!expedition ? { vehicles: { spawns: district.vehicles, flightObstacles: vehicles.flightObstacles() } } : {}) });
      hud.combatEventsAvailable = options.arena.session.role === 'solo';
      if (debugAvailable) {
        arenaRuntime.setCombatEvents(debug.combatEvents);
        arenaRuntime.setHealthMultiplier(debug.healthMultiplier);
        if (expedition?.checkpoint) arenaRuntime.setVitals({ health: expedition.checkpoint.health });
      }
    }
    hud.phase = 'ready'; updateCameras(0, false, false); publish();
    if (expedition?.checkpoint?.pilot) startPilot();
  }).catch(() => {
    if (!disposed) { hud.phase = 'error'; hud.message = 'The range assets could not load. Retry to load the local models.'; publish(); }
  });

  return {
    start, startPilot, setPilotStrategy, takeControl, pause, reset, reload, switchWeapon, useQuickItem, jump, setInput, setMoveAxis, lookBy, interactVehicle, switchVehicleSeat, interactLoot, interactNpc, travelZone, configureDebug, refillHealth, triggerCombatEvent,
    setPilotDestination(destination?: WorldZoneId) { pilotDestination = destination; },
    getPilotObservation() { return lastPilotObservation ? structuredClone(lastPilotObservation) : null; },
    toggleAim, toggleMap,
    toggleEncikVoice() { hud.encikVoice = !hud.encikVoice; if (!hud.encikVoice) stopVoice(); publish(); },
    toggleSound() { hud.muted = !hud.muted; if (hud.muted) stopVoice(); if (hud.phase === 'playing') { canvas.focus({ preventScroll: true }); if (!hud.muted) initAudio(); } publish(); },
    dispose() {
      disposed = true; pilot.reset(); strategicPlanner?.reset(); encikAudio.dispose(); cancelAnimationFrame(frame); observer.disconnect(); clearInput();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      window.removeEventListener('keydown', pilotEscape, true);
      canvas.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      window.removeEventListener('pointerdown', pointerSource, true); window.removeEventListener('pointermove', pointerSource, true);
      canvas.removeEventListener('pointerdown', pointerdown); canvas.removeEventListener('pointermove', pointermove);
      window.removeEventListener('pointerup', pointerup); canvas.removeEventListener('pointercancel', releasePointer); canvas.removeEventListener('lostpointercapture', releasePointer);
      canvas.removeEventListener('contextmenu', contextmenu); document.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('mousedown', mousedown); window.removeEventListener('mouseup', mouseup);
      document.removeEventListener('pointerlockchange', lockchange); document.removeEventListener('pointerlockerror', lockerror);
      window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility);
      void audio?.close().catch(() => {}); arenaRuntime?.dispose(); expeditionSession?.close(); markers?.dispose(); vehicles.dispose(); undress.forEach(fn => fn()); handling.forEach(model => model.dispose()); disposeAssets(templates); atmosphere.dispose(); world.dispose();
      healthGeometry.dispose(); healthMaterial.dispose(); combatVisuals.dispose(); combatAudio.dispose(); hitOverlay.dispose();
      targetGeometry.dispose(); headGeometry.dispose(); targetMaterial.dispose(); effects.dispose();
      scopeRenderer.dispose(); opticReflections.dispose(); supplyHands.dispose(); sunShadows.dispose(); occlusion.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
export type FpsEngine = ReturnType<typeof createFpsEngine>;
