import { PRONE_EYE_HEIGHT, weaponBraced, unsupportedRecoilDamage } from './fps-stance';
import { pickupSlot } from './armory-slots';
import { equipmentMovement } from './fps-encumbrance';
import { buildServiceWeapon } from './service-weapon-models';
import { impactSurfaceNormal } from './fps-impact-normal';
import * as THREE from 'three';
import { requestFpsPointerLock, requiresFpsPointerLock, turnFpsLook, clampFpsPitch } from './fps-pointer';
import { dragLook, resolveMovement, stickKeys, type StickVector } from './touch-controls';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { advanceWeapon, beginReload, createLoadout, findTrait, fireWeapon, validWeaponIndex, FPS_SPAWN, FPS_WEAPONS, hitDamage, movementInput, splashScale, type WeaponState } from './fps-rules';
import { firstVisibleHit, visibleHits } from './fps-raycast';
import { sectorAt, zoneSectors } from './zone-sectors';
import { advanceRound, createRound, needsFlight, skipRound, MAX_ROUNDS_IN_FLIGHT, MAX_SKIPS, type InFlightRound } from './fps-projectiles';
import { SKIP_ENERGY, waterRicochet } from './fps-splashes';
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
import { reloadMotion, reloadStage, smoothStep } from './fps-weapon-motion';
import { createFpsComms, type CommsEntry } from './fps-comms';
import { createEncikRadio, type EncikAddress, type EncikCallout, type EncikEvent } from './fps-callouts';
import { createEncikAudio } from './encik-audio';
import { encikRecordingUrl } from './encik-recordings';
import { createPlayerPilot, normalizePilotAction, PILOT_INTERVAL, type PilotObservation, type PilotGoal, type PlayerPilot } from './fps-pilot';
import { visiblePilotContacts, type PilotSubject } from './fps-pilot-perception';
import { createStrategyPlanner, llmPilotStrategy } from './pilot-strategy';
import { findWorldRoute } from './world-zones';
import { advanceBloom, createWeaponBloom, recordBloomShot, sampleShotSpread, weaponSpread } from './fps-accuracy';

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
  crosshairSpread: number; hitKind: 'hit' | 'kill'; quickItem: string; quickType: 'FOOD' | 'UTILITY' | ''; quickCount: number;
  phase: 'loading' | 'ready' | 'playing' | 'paused' | 'complete' | 'defeated' | 'error';
  carriedWeapons: number[]; carriedKg: number; movementScale: number;
  weapon: number; magazine: number; reserve: number; reloading: number;
  prone: boolean; braced: boolean; hits: number; shots: number; landed: number; health: number; armor: number; incoming: boolean; hurt: boolean; lastDamage: number; earned: number; earnedXp: number; callout: string; chain: number; elapsed: number; aiming: boolean; hit: boolean;
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
}
export const initialFpsHud: FpsHud = { vehicleAimX: 50, vehicleAimY: 50, vehicleAimVisible: true, vehicleHealth: 0, vehicleMaxHealth: 0, vehicleAmmo: 0, vehicleAmmoMax: 0, vehicleWeapon: '', vehicleDamage: 'intact', prone: false, braced: false, carriedWeapons: [0, 2], carriedKg: 0, movementScale: 1, quickItem: '', quickType: '', quickCount: 0, encikCallout: null, encikVoice: true, comms: [], pilotStrategy: 'local', pilotPlan: 'Local utility planner', pilotEnabled: false, pilotStatus: 'Player controls', pilotGoal: null, pilotContacts: 0, crosshairSpread: 6, hitKind: 'hit', aimProgress: 0, reloadEmpty: false, debug: { ...DEFAULT_FPS_DEBUG }, debugAvailable: true, maxHealth: 100, phase: 'loading', weapon: 0, magazine: 30, reserve: 120, reloading: 0, hits: 0, shots: 0, landed: 0, health: 100, armor: 0, incoming: false, hurt: false, lastDamage: 0, earned: 0, earnedXp: 0, callout: '', chain: 0, elapsed: 0, aiming: false, hit: false, vehicle: 'on-foot', vehicleSpeed: 0, altitude: 0, interact: '', vehicleNotice: '', carDistance: 0, helicopterDistance: 0, locked: false, inputMode: 'mouse', message: '', muted: false, x: FPS_SPAWN.x, z: FPS_SPAWN.z, yaw: FPS_SPAWN.yaw, pitch: FPS_SPAWN.pitch, mapMarkers: [], arena: null, arenaSelf: null, arenaConnected: true, arenaStarted: false, expeditionZone: null, lootPrompt: '', npcPrompt: '', travelPrompt: '', lootNotice: '', fieldLoot: [], npcs: [], credits: 0, tokens: 0, sector: '' };

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
  // Shadow-map rendering doubles work on this VM; the existing map still supplies its lighting.
  renderer.shadowMap.enabled = false; renderer.autoClear = false;
  const canvas = renderer.domElement; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', `${expedition ? getWorldZone(expedition.zone).name + ' expedition' : district.label + ' range'}. WASD to move, mouse to look, click to fire.`);
  host.append(canvas);
  const zoneWorld = buildDistrictWorld(region, expedition?.spawn);
  const world = zoneWorld; world.stamps.forEach(o => o.visible = false);
  const footMove = zoneWorld.move;
  const expeditionSession = expedition ? createSoloSession('Explorer') : null;
  if (expedition && zoneWorld && expeditionSession) options = { ...options, arena: { session: expeditionSession, profile: fieldProfile, botCount: zoneWorld.zone.botCount, composition: zoneWorld.zone.composition, environment: zoneWorld.environment, initialVitals: expedition.checkpoint } };
  const vehicles = createFpsVehicles(world.scene, world.obstacles, equipment.vehicleSkins, { spawns: district.vehicles, bounds: world.bounds, deriveFlightObstacles: region !== 'marina-bay' });
  if (options.arena) vehicles.root.visible = false;
  let arenaRuntime: ReturnType<typeof createArenaRuntime> | null = null;
  const chaseRay = new THREE.Raycaster();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.08, 800); camera.rotation.order = 'YXZ';
  const viewScene = new THREE.Scene(), viewCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 3);
  viewScene.add(new THREE.HemisphereLight('#e4efff', '#576350', 2.1));
  const weaponLight = new THREE.DirectionalLight('#fff4dd', 2.5); weaponLight.position.set(1, 2, 1); viewScene.add(weaponLight);
  const scopeRenderer = createScopeRenderer(renderer);
  const rig = new THREE.Group(); viewScene.add(rig);
  const loader = new GLTFLoader(), templates: THREE.Group[] = [], weapons: THREE.Group[] = [];
  const handling: ReturnType<typeof createWeaponHandling>[] = [], emptyReload = specs.map(() => false);
  let aimProgress = 0, lastReloadStage = '';
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
  const debugAvailable = !options.arena || options.arena.session.role === 'solo';
  let debug = debugAvailable ? readFpsDebug() : { ...DEFAULT_FPS_DEBUG }, recoveryDelay = 0;
  const keys = new Set<string>(); const hud: FpsHud = { ...initialFpsHud, weapon: equipment.carriedFamilies[0], carriedWeapons: equipment.carriedFamilies, debug, debugAvailable, quickItem: equipment.quickItem?.name || '', quickType: equipment.quickItem ? equipment.quickItem.supplyType === 'food' ? 'FOOD' : 'UTILITY' : '', quickCount: equipment.quickCount, health: 100 * debug.healthMultiplier, maxHealth: 100 * debug.healthMultiplier, armor: equipment.armor, expeditionZone: expedition?.zone ?? null,
    credits: fieldProfile.credits, tokens: fieldProfile.tokens };
  const npcs = expedition ? expeditionNpcs(expedition.zone, zoneSectors(expedition.zone)) : [];
  hud.npcs = npcs.map(npc => ({ ...npc }));
  if (expedition && zoneWorld) hud.fieldLoot = expedition.loot.enterZone({ id: expedition.zone, spawn: zoneWorld.zone.spawn, bounds: zoneWorld.bounds, obstacles: world.obstacles, anchors: zoneWorld.zone.encounterSpawns, sectors: zoneSectors(expedition.zone) });
  const markers = expedition ? createExpeditionMarkers(world.scene, expedition.zone, hud.fieldLoot, npcs) : null;
  let checkpointPending = expedition?.checkpoint;
  let travelPending = false, lootNoticeTime = 0;
  const greetedNpcs = new Set<string>(), dialogueProgress = new Map<string, number>();
  const encik = createEncikRadio(Math.random, () => options.encik?.() ?? encikAddress(fieldProfile)), comms = createFpsComms(expedition?.checkpoint?.comms);
  hud.encikVoice = expedition?.checkpoint?.encikVoice ?? true;
  let killChain: KillChain = { count: 0, lastAt: -Infinity }, calloutTime = 0;
  let roundId = randomRoundId(), attackTimer = 3, hurtTime = 0;
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
  let trigger = false, ads = false, touchAim = false, actualAim = false, bob = 0, hitTime = 0;
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
  const eyeHeight = () => prone ? PRONE_EYE_HEIGHT : keys.has('c') ? 1.15 : 1.75;
  const braced = () => !vehicles.active && weaponBraced(specs[hud.weapon], prone, vertical === 0);
  const movement = () => equipmentMovement(equipment, hud.weapon, loadout, quickRemaining);
  const publish = () => {
    if (disposed) return;
    const state = loadout[hud.weapon];
    const burden = movement();
    onHud({ ...hud, prone, braced: braced(), carriedWeapons: equipment.carriedFamilies, carriedKg: burden.totalKg, movementScale: burden.movement, comms: comms.snapshot(), pilotEnabled, aimProgress, reloadEmpty: emptyReload[hud.weapon], ...(!options.arena ? vehicles.hud(position) : {}), magazine: state.magazine, reserve: state.reserve, reloading: state.reloadRemaining / specs[hud.weapon].reload, aiming: actualAim, hit: hitTime > 0, locked: document.pointerLockElement === canvas, inputMode, x: position.x, z: position.z, yaw, pitch,
      mapMarkers: options.arena ? [] : [
        ...targetPositions.flatMap((point, index): MinimapMarker[] => targets[index]?.alive ? [{ ...point, id: `target-${index}`, kind: 'target', label: `Target ${index + 1}` }] : []),
        ...(['car', 'helicopter'] as const).filter(kind => kind !== vehicles.active && vehicles.states[kind].health > 0).map((kind): MinimapMarker => ({ id: kind, kind, label: kind === 'car' ? 'Utility 01' : 'Falcon 01', x: vehicles.states[kind].x, z: vehicles.states[kind].z })),
      ],
    });
  };
  const clearInput = () => { prone = false; keys.clear(); trigger = false; triggerSpent = false; ads = false; touchAim = false; drag = null; moveStick = null; };
  function configureDebug(value: FpsDebugSettings) {
    if (!debugAvailable || disposed) return;
    const fraction = hud.health / hud.maxHealth;
    debug = normalizeFpsDebug(value); saveFpsDebug(debug);
    hud.debug = debug; hud.maxHealth = 100 * debug.healthMultiplier; hud.health = hud.maxHealth * fraction;
    arenaRuntime?.setHealthMultiplier(debug.healthMultiplier); publish();
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
  function handlingSound(stage: string) {
    if (!audio || !soundBuffer || hud.muted || audio.state !== 'running') return;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = soundBuffer; source.playbackRate.value = stage === 'MAG IN' ? .65 : 1.4;
    filter.type = 'bandpass'; filter.frequency.value = stage === 'CHAMBER' ? 2300 : 1000; filter.Q.value = .7;
    gain.gain.value = stage === 'MAG IN' ? .16 : .09;
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
    if (hud.phase === 'playing' && (!options.arena || hud.arenaSelf?.alive) && !vehicles.active && beginReload(loadout[hud.weapon], hud.weapon, specs)) {
      emptyReload[hud.weapon] = loadout[hud.weapon].magazine === 0;
      radioCall('reload');
      arenaRuntime?.reload(hud.weapon); ads = false; touchAim = false; actualAim = false; lastReloadStage = ''; publish();
    }
  }
  function switchWeapon(index: number) {
    if (hud.phase === 'loading' || hud.phase === 'error' || index === hud.weapon || !validWeaponIndex(index) || !equipment.carriedFamilies.includes(index)) return;
    loadout[hud.weapon].reloadRemaining = 0;
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
    hud.health = hud.maxHealth; hud.armor = equipment.armor; hud.incoming = false; hud.hurt = false; hud.earned = 0; hud.earnedXp = 0; hud.lastDamage = 0; hud.callout = ''; hud.chain = 0;
    killChain = { count: 0, lastAt: -Infinity }; calloutTime = 0; stopVoice(); encik.reset(); comms.clear(); hud.encikCallout = null;
    roundId = randomRoundId(); attackTimer = 3; pendingAttack = null; hurtTime = 0;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    vehicles.reset(); loadout = createLoadout(specs); position = { x: spawn.x, z: spawn.z }; yaw = spawn.yaw; pitch = spawn.pitch;
    vertical = velocityY = bob = hitTime = 0; resetRecoil(kick); carry.set(0, 0, 0); clearInput();
    rounds.length = 0; effects.reset();
    aimProgress = 0; bloom.forEach(state => { state.amount = 0; state.delay = 0; });
    targets.forEach(t => { t.alive = true; t.root.visible = true; t.health = t.maxHealth; t.bar.scale.x = 1; });
    updateCameras(0, false, false); publish();
  }
  function interactVehicle() {
    if (hud.phase !== 'playing' || options.arena) return;
    const change = vehicles.interact(position);
    if (change) {
      clearInput(); actualAim = false; loadout[hud.weapon].reloadRemaining = 0;
      position = { x: change.x, z: change.z }; vertical = velocityY = 0; resetRecoil(kick); carry.set(0, 0, 0);
      if (change.entered) { yaw = change.yaw; pitch = -.23; }
      else pitch = -.03;
      updateCameras(0, false, false);
    }
    canvas.focus({ preventScroll: true }); publish();
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
    const nearest = alive ? expedition.loot.nearest(expedition.zone, position) : null;
    const npc = alive && !vehicles.active ? nearestNpc(npcs, position) : null;
    const gateway = alive ? findWorldGateway(expedition.zone, position) : null;
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
    const nearest = expedition.loot.nearest(expedition.zone, position); if (!nearest) return;
    if (nearest.kind === 'medical' && hud.health >= hud.maxHealth) { hud.lootNotice = `Health is full. ${nearest.name} remains here.`; lootNoticeTime = 3; publish(); return; }
    if (nearest.kind === 'ammo' && loadout[hud.weapon].reserve >= 999) { hud.lootNotice = 'Ammunition reserve is full.'; lootNoticeTime = 3; publish(); return; }
    const item = nearest.catalogId ? itemById(nearest.catalogId) : undefined;
    if ((nearest.kind === 'weapon' && (!item || item.category !== 'weapon' || !validWeaponIndex(item.family))) || (nearest.kind === 'armor' && item?.category !== 'plate')) return;
    const collected = expedition.loot.collect(expedition.zone, nearest.id, position); if (!collected) return;
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
    } else if (collected.kind === 'medical') {
      const before = hud.health; hud.health = Math.min(hud.maxHealth, hud.health + collected.amount); arenaRuntime.setVitals({ health: hud.health });
      hud.lootNotice = `${collected.name} · recovered ${Math.round(hud.health - before)} health.`;
    }
    comms.add('system', 'Supplies', hud.lootNotice); radioCall('pickup');
    markers?.remove(collected.id); hud.fieldLoot = expedition.loot.remaining(expedition.zone); lootNoticeTime = 4;
    updateExpeditionPrompts(); canvas.focus({ preventScroll: true }); publish();
  }
  function interactNpc() {
    if (!expedition || hud.phase !== 'playing' || !hud.arenaSelf?.alive || vehicles.active || !arenaRuntime || travelPending) return;
    const npc = nearestNpc(npcs, position); if (!npc) return;
    if (npc.interaction.kind === 'dialogue') {
      if (!npc.interaction.lines.length) return;
      const index = dialogueProgress.get(npc.id) ?? 0;
      const line = npc.interaction.lines[index % npc.interaction.lines.length];
      dialogueProgress.set(npc.id, index + 1);
      hud.lootNotice = `${npc.name}: ${line}`; lootNoticeTime = 6;
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
    hud.lootNotice = result.message; lootNoticeTime = 4;
    comms.add('system', npc.name, result.message);
    updateExpeditionPrompts(); canvas.focus({ preventScroll: true }); publish();
  }
  function travelZone() {
    if (!expedition || travelPending || hud.phase !== 'playing' || !hud.arenaSelf?.alive || vehicles.active) return;
    const gateway = findWorldGateway(expedition.zone, position); if (!gateway) return;
    const transition = resolveWorldTransition(expedition.zone, gateway.id, position); if (!transition) return;
    comms.add('system', 'Travel', `Moving to ${getWorldZone(transition.to).name}.`);
    const checkpoint: FpsCheckpoint = { comms: comms.snapshot(), pilot: pilotEnabled, pilotStrategy: strategyMode, encikVoice: hud.encikVoice, health: hud.health, armor: hud.armor, weapon: hud.weapon, ammunition: loadout.map(state => ({ ...state, cooldown: 0, reloadRemaining: 0 })) };
    travelPending = true; pause(); expedition.onTravel(transition, checkpoint);
  }
  function jump() { if (hud.phase === 'playing' && (!options.arena || hud.arenaSelf?.alive)) { canvas.focus({ preventScroll: true }); if (!vehicles.active && vertical === 0 && !keys.has('c') && !prone) velocityY = 5.2 * movement().jumpVelocity; } }
  function setInput(key: string, held: boolean) {
    if (hud.phase !== 'playing' || (options.arena && !hud.arenaSelf?.alive)) return;
    if (key === 'z') { if (held && !vehicles.active && vertical === 0) { prone = !prone; keys.delete('c'); publish(); } return; }
    if (held && key === 'c') prone = false;
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
  function toggleAim() {
    if (pilotEnabled || hud.phase !== 'playing' || vehicles.active || hud.arenaSelf?.alive === false || loadout[hud.weapon].reloadRemaining > 0) return;
    touchAim = !touchAim; canvas.focus({ preventScroll: true }); publish();
  }
  const keyboardKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'c', 'z', ' ', 'r', 'q', 'g', '1', '2', '3', 'e', 'n', 't', 'f', 'control', 'escape'];
  const keydown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === 'f' && !event.repeat) { event.preventDefault(); options.onFullscreen?.(); return; }
    if (hud.phase !== 'playing' || !keyboardKeys.includes(key)) return;
    event.preventDefault();
    if (key === 'q') { if (!event.repeat) toggleAim(); return; }
    if (key === 'escape') pause();
    else if (pilotEnabled) { pause(); hud.message = 'AI stopped. Click Resume to take control.'; publish(); }
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
      for (const root of world.scene.children) if (root.visible && typeof root.userData.arenaActorId === 'string') {
        subjects.push({ id: root.userData.arenaActorId, root, radius: .3, points: [1.15, 1.62].map(y => root.localToWorld(new THREE.Vector3(0, y, 0))) });
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
        if (Math.hypot(point.x * sight.magnification / (radiusY / viewCamera.aspect), point.y * sight.magnification / radiusY) < .9) return false;
      }
      weaponRay.setFromCamera(point, viewCamera);
      return !!weaponRay.intersectObjects(weaponMeshes, false)[0];
    };
    const state = loadout[hud.weapon];
    const waypoints: PilotObservation['waypoints'][number][] = expedition ? hud.fieldLoot.map(item => ({ id: item.id, x: item.x, z: item.z, kind: item.kind })) :
      options.arena ? [] : targets.flatMap((target, i) => target.alive ? [{ id: `target-${i}`, ...targetPositions[i], kind: 'target' as const }] : []);
    if (expedition && pilotDestination) {
      const gateway = findWorldRoute(expedition.zone, pilotDestination)[0];
      if (gateway) waypoints.push({ id: gateway.id, ...gateway.position, kind: 'checkpoint' });
    }
    return { time, alive: hud.arenaSelf?.alive !== false, health: hud.health, maxHealth: hud.maxHealth, armor: hud.armor,
      magazine: state.magazine, reserve: state.reserve, reloading: state.reloadRemaining > 0, aiming: actualAim, weapon: hud.weapon, availableWeapons: equipment.carriedFamilies.filter(index => loadout[index].magazine > 0 || loadout[index].reserve > 0),
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
      prone = specs[hud.weapon].requiresMount === true && action.fire === true && vertical === 0;
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
      actualAim = false; aimProgress = 0; rig.visible = false;
      const v = vehicles.mounted, target = new THREE.Vector3(v.x, v.y + 1.65, v.z);
      const distance = v.kind === 'car' ? 8.5 : 13;
      const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const wanted = target.clone().addScaledVector(direction, distance); wanted.y = Math.max(.7, wanted.y);
      const offset = wanted.clone().sub(target); chaseRay.set(target, offset.clone().normalize()); chaseRay.near = .2; chaseRay.far = offset.length();
      const obstruction = firstVisibleHit(chaseRay, world.scene.children.filter(o => o !== vehicles.root && !o.userData.fpsEffect));
      camera.position.copy(obstruction ? target.clone().addScaledVector(offset.normalize(), Math.max(.5, obstruction.distance - .4)) : wanted);
      camera.lookAt(target); camera.fov = THREE.MathUtils.damp(camera.fov, 68, 8, dt); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); return;
    }
    const aiming = (ads || touchAim) && !sprinting && loadout[hud.weapon].reloadRemaining === 0;
    actualAim = aiming;
    // Heavier carry costs time to settle the sights as well as ground speed.
    aimProgress = THREE.MathUtils.damp(aimProgress, aiming ? 1 : 0, 15 * (aiming ? movement().aimSpeed : 1), dt);
    const aim = smoothStep(aimProgress);
    rig.visible = !options.arena || hud.arenaSelf?.alive !== false;
    const deployedMount = weapons[hud.weapon]?.getObjectByName('cis50-inspired__deployed-mount');
    if (deployedMount) deployedMount.visible = braced();
    const crouching = keys.has('c') || prone;
    camera.position.set(position.x, eyeHeight() + vertical, position.z);
    const view = recoilView(kick), pose = recoilPose(kick);
    camera.rotation.set(pitch + view.pitch, yaw + view.yaw, 0, 'YXZ');
    camera.fov = THREE.MathUtils.lerp(sprinting ? 71 : 65, 65, aim);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    viewCamera.fov = THREE.MathUtils.lerp(65, 54, aim); viewCamera.updateProjectionMatrix();
    bob += moving ? dt * (sprinting ? 13 : 8) : 0;
    const sway = moving ? Math.sin(bob) * .006 * (1 - aim * .94) : 0;
    spreadAngle = weaponSpread(bloom[hud.weapon], hud.weapon, aim, crouching, moving);
    const spreadPixels = Math.tan(spreadAngle) * canvas.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    hud.crosshairSpread = THREE.MathUtils.damp(hud.crosshairSpread, Math.max(3, spreadPixels), 20, dt);
    const state = loadout[hud.weapon], remaining = state.reloadRemaining / specs[hud.weapon].reload;
    const progress = remaining > 0 ? 1 - remaining : null, motion = reloadMotion(progress ?? 0);
    rig.position.set(THREE.MathUtils.lerp(.20, 0, aim) + sway + motion.x + lookLagX,
      THREE.MathUtils.lerp(-.32, -(handling[hud.weapon]?.aimHeight ?? .435), aim) + Math.abs(sway) - (sprinting ? .08 : 0) + motion.y + lookLagY,
      THREE.MathUtils.lerp(-.78, handling[hud.weapon]?.aimDepth ?? -.47, aim) + pose.push + motion.z);
    // The weapon carries the buck, the sideways half of the pattern and the roll
    // that goes with it; the camera only ever takes the view coupling above.
    // `recoilPose` sizes them; aiming in is the only thing damped here, because
    // a shouldered weapon is held against the shooter rather than by the hands.
    rig.rotation.set(pose.pitch * (1 - aim * .8) + (sprinting ? -.18 : 0) + motion.pitch,
      motion.yaw + pose.yaw * (1 - aim * .6), motion.roll + pose.roll * (1 - aim * .5));
    handling.forEach((model, i) => model.update(i === hud.weapon ? progress : null, emptyReload[i]));
    const stage = reloadStage(remaining, emptyReload[hud.weapon]);
    if (stage && stage !== lastReloadStage && hud.phase === 'playing') handlingSound(stage);
    lastReloadStage = stage;
    canvas.dataset.aimProgress = aimProgress.toFixed(3); canvas.dataset.reloadStage = stage;
    canvas.dataset.weaponVisible = String(rig.visible);
    viewScene.updateMatrixWorld(true);
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
  function meetWater(hit: THREE.Intersection, direction: THREE.Vector3, energy: number) {
    const normal = surfaceNormal(hit, direction);
    const skip = waterRicochet(direction, normal);
    effects.splash(hit.point, direction, skip ? energy * .6 : energy);
    rippleWater(hit.object, hit.point.x, hit.point.z, skip ? energy * .6 : energy);
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
      if (!isWaterHit(hit)) { effects.impact(hit.point, surfaceNormal(hit, skipDirection), impactKind(hit), energy, weaponStyles[weapon]?.id); return; }
      heading = meetWater(hit, skipDirection, energy); at = hit.point.clone(); travelled = range;
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
  function useQuickItem() {
    const supply = equipment.quickItem;
    if (hud.phase !== 'playing' || !supply?.effect || quickRemaining <= 0 || hud.health <= 0) return;
    const { health = 0, armor = 0, reserve = 0 } = supply.effect;
    const full = hud.health >= hud.maxHealth && (!armor || hud.armor >= equipment.armor) && (!reserve || loadout[hud.weapon].reserve >= 999);
    if (full) { hud.message = 'Nothing to restore right now.'; publish(); return; }
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
            const skip = meetWater(last, roundDirection, round.scale);
            // Restarted just above the surface so its first new segment does not
            // begin inside the water it is leaving.
            const exit = { x: last.point.x + (skip?.x ?? 0) * .05, y: last.point.y + .01 + (skip?.y ?? 0) * .05, z: last.point.z + (skip?.z ?? 0) * .05 };
            if (!skip || !skipRound(round, exit, skip, SKIP_ENERGY)) rounds.splice(i, 1);
            continue;
          }
          effects.impact(last.point, surfaceNormal(last, roundDirection), impactKind(last), round.scale, weaponStyles[round.weapon]?.id); struck = true;
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
    return [...gameplayCandidates().filter(o => o !== vehicles.root), vehicles.models[kind === 'car' ? 'helicopter' : 'car']];
  }
  function aimVehicle() {
    const kind = vehicles.active; if (!kind) return;
    world.scene.updateMatrixWorld(true); vehicleRay.setFromCamera(center, camera);
    vehicleRay.far = VEHICLE_COMBAT[kind].range;
    const hit = firstVisibleHit(vehicleRay, vehicleCandidates(kind));
    vehicleAimPoint.copy(hit?.point ?? vehicleRay.ray.at(vehicleRay.far, new THREE.Vector3()));
    vehicles.aim(vehicleAimPoint);
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
    if (!mounted || mounted.weaponCooldown > 0 || mounted.ammo <= 0) return;
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
      else effects.impact(hit.point, surfaceNormal(hit, shot.direction), impactKind(hit), shot.kind === 'car' ? 1 : 1.6);
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
    const recoilDamage = unsupportedRecoilDamage(specs[hud.weapon], prone, vertical === 0, keys.has('c'));
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
    recordRecoilShot(kick, specs[hud.weapon], hud.weapon);
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
      const skip = meetWater(struck, ray.ray.direction, energy);
      // The arena host resolves its own shots, so there the skip is spray only.
      if (skip && !arenaRuntime) skipInstantShot(struck.point, skip, struck.distance, energy, hud.weapon);
    } else if (struck) effects.impact(struck.point, surfaceNormal(struck, ray.ray.direction), impactKind(struck), energy, weaponStyles[hud.weapon]?.id);
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
          else hurtPlayer(18);
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

  function updateArena(dt: number) {
    if (!arenaRuntime) return;
    const frame = arenaRuntime.update(dt, {
      x: position.x, y: eyeHeight() + vertical, z: position.z, yaw, pitch,
      prone, weapon: hud.weapon, playing: hud.phase === 'playing', reloading: loadout[hud.weapon].reloadRemaining > 0,
    });
    const previousSelf = hud.arenaSelf;
    const previousMatch = hud.arena;
    // Hosts already reset synchronously in reset(); only guests adopt a remote rematch.
    const newRound = options.arena?.session.role === 'guest' && previousMatch && frame.snapshot && (frame.snapshot.tick < previousMatch.tick || (previousMatch.finished && !frame.snapshot.finished));
    if (newRound) {
      hud.phase = 'ready'; hud.shots = hud.landed = hud.earned = hud.earnedXp = hud.chain = 0;
      hud.callout = ''; hud.message = ''; calloutTime = 0; killChain = { count: 0, lastAt: -Infinity };
      clearInput(); stopVoice(); encik.reset(); comms.clear(); hud.encikCallout = null; loadout = createLoadout(specs);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    hud.arena = frame.snapshot; hud.arenaSelf = frame.self; hud.arenaConnected = frame.connected; hud.arenaStarted = frame.started;
    if (frame.snapshot) hud.elapsed = frame.snapshot.elapsed;
    if (frame.self) {
      hud.hits = frame.self.kills; hud.health = frame.self.health; hud.armor = frame.self.armor;
      if (previousSelf && frame.self.health < previousSelf.health) { hurtTime = .4; recoveryDelay = FPS_REGEN_DELAY; }
      if (!frame.self.alive && previousSelf?.alive) { radioCall('death'); clearInput(); killChain = { count: 0, lastAt: -Infinity }; hud.chain = 0; hud.callout = ''; calloutTime = 0; }
      if (frame.spawn) {
        if (previousSelf && !previousSelf.alive) radioCall('respawn');
        pilot.reset(); strategicPlanner?.reset();
        position = { x: frame.self.x, z: frame.self.z }; vertical = Math.max(0, frame.self.y - 1.75); velocityY = 0;
        yaw = frame.self.yaw; pitch = frame.self.pitch; loadout = createLoadout(specs); clearInput();
        if (checkpointPending) {
          loadout = loadout.map((fresh, index) => {
            const carried = checkpointPending?.ammunition?.[index]; if (!carried) return fresh;
            return { magazine: Number.isFinite(carried.magazine) ? Math.max(0, Math.min(specs[index].capacity, Math.floor(carried.magazine))) : fresh.magazine,
              reserve: Number.isFinite(carried.reserve) ? Math.max(0, Math.min(999, Math.floor(carried.reserve))) : fresh.reserve, cooldown: 0, reloadRemaining: 0 };
          });
          hud.weapon = equipment.carriedFamilies.includes(checkpointPending.weapon) ? checkpointPending.weapon : equipment.carriedFamilies[0]; checkpointPending = undefined;
          weapons.forEach((weapon, index) => weapon.visible = index === hud.weapon);
          effects.attachMuzzle(weapons[hud.weapon]?.getObjectByName(`${FPS_WEAPONS[hud.weapon].id}__socket_muzzle`));
          effects.setStyles(weaponStyles, hud.weapon);
        }
        resetRecoil(kick); effects.reset(); hitTime = 0; bloom.forEach(state => { state.amount = 0; state.delay = 0; }); updateCameras(0, false, false);
      } else if (frame.correction) {
        position = { x: frame.self.x, z: frame.self.z };
        vertical = Math.max(0, frame.self.y - eyeHeight()); velocityY = 0;
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

  const resize = () => {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height); camera.aspect = viewCamera.aspect = width / height;
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
        yaw += vehicles.step(drivingKeys(), dt);
        if (vehicles.mounted) position = { x: vehicles.mounted.x, z: vehicles.mounted.z };
        carry.set(0, 0, 0);
      } else {
      vehicles.step(keys, dt);
      const move = resolveMovement(keys, moveStick);
      const forward = move.forward, side = move.side;
      sprinting = move.sprint && forward > 0.5 && !keys.has('c') && !prone;
      const speed = braced() ? 0 : prone ? .85 : keys.has('c') ? 2.1 : sprinting ? 7 : (ads || touchAim) ? 2.5 : 4.2;
      const delta = movementInput(forward, side, yaw, speed * movement().movement, dt), next = footMove(position, delta.x, delta.z, 0.38, options.arena ? world.obstacles : vehicles.footObstacles());
      moving = Math.hypot(next.x - position.x, next.z - position.z) > 0.0001;
      carry.set((next.x - position.x) / Math.max(dt, 1e-4), 0, (next.z - position.z) / Math.max(dt, 1e-4));
      position = next;
      // Ground-plane jump; map obstacle collision remains active at every height.
      velocityY -= 15 * dt; vertical = Math.max(0, vertical + velocityY * dt); if (vertical === 0) velocityY = 0;
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
      if (trigger && !sprinting && hud.phase === 'playing') { if (vehicles.active) shootVehicle(); else shoot(); }
      if (hud.phase === 'playing' && options.combat && !options.arena) counterFire(realDt);
    } else { advanceRecoil(kick, realDt); applyAimPush(); carry.set(0, 0, 0); updateCameras(dt, false, false); }
    updateArena(realDt);
    if (debugAvailable && hud.phase === 'playing' && hud.health > 0) {
      recoveryDelay = Math.max(0, recoveryDelay - dt);
      if (debug.regeneration && recoveryDelay === 0 && hud.health < hud.maxHealth) {
        hud.health = regenerateHealth(hud.health, hud.maxHealth, dt); arenaRuntime?.setVitals({ health: hud.health });
      }
    }
    if (hud.phase === 'defeated' || hud.phase === 'complete') vehicles.animateEffects(dt);
    if (expedition) { updateExpeditionPrompts(); lootNoticeTime = Math.max(0, lootNoticeTime - realDt); if (!lootNoticeTime) hud.lootNotice = ''; }
    hurtTime = Math.max(0, hurtTime - dt); hud.hurt = hurtTime > 0;
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
    const scopeActive = scopeRenderer.render(world.scene, camera, viewCamera, weapons[hud.weapon] ? getWeaponSight(weapons[hud.weapon]) : undefined, rig.visible && !vehicles.active && hud.phase === 'playing', aimProgress);
    canvas.dataset.scopeActive = String(scopeActive);
    renderer.clear(); renderer.render(world.scene, camera); renderer.clearDepth(); renderer.render(viewScene, viewCamera);
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
    if (options.arena) {
      arenaRuntime = createArenaRuntime({ scene: world.scene, obstacles: world.obstacles, ...options.arena });
      if (debugAvailable) {
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
    start, startPilot, setPilotStrategy, takeControl, pause, reset, reload, switchWeapon, useQuickItem, jump, setInput, setMoveAxis, lookBy, interactVehicle, interactLoot, interactNpc, travelZone, configureDebug, refillHealth,
    setPilotDestination(destination?: WorldZoneId) { pilotDestination = destination; },
    getPilotObservation() { return lastPilotObservation ? structuredClone(lastPilotObservation) : null; },
    toggleAim,
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
      void audio?.close().catch(() => {}); arenaRuntime?.dispose(); expeditionSession?.close(); markers?.dispose(); vehicles.dispose(); undress.forEach(fn => fn()); handling.forEach(model => model.dispose()); disposeAssets(templates); world.dispose();
      healthGeometry.dispose(); healthMaterial.dispose();
      targetGeometry.dispose(); headGeometry.dispose(); targetMaterial.dispose(); effects.dispose();
      scopeRenderer.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
export type FpsEngine = ReturnType<typeof createFpsEngine>;
