import { createRangeDirector, rangeTargetRise, rangeTargetHeight, validRangeDrill, RANGE_DURATION, type RangeDrillId, type RangeDrillView } from './range-drills';
import { resupplyEquipment, rangeEquipmentStock } from './equipment-resupply';
import { createRangeResupply, rangeResupplyPoint } from './range-resupply';
import { combatFeedReward, type RaiderBounty } from './combat-rewards';
import { WEATHER } from './world-events';
import { createDeploymentBlur } from './deployment-blur';
import { createDeploymentOverview, deploymentMarkers, overviewFrame } from './deployment-overview';
import { createDeploymentIntro } from './deployment-intro';
import { visionMountPose } from './fps-vision-mount';
import type { PlayerRespawnView } from './player-respawn';
import { districtDeploymentPoints, deploymentOrder, type DeploymentView } from './expedition-deployment';
import { createSceneCover } from './scene-cover';
import { NAVAL as NAVAL_LANDING } from './naval-landings';
import { validatedNavalSites } from './naval-route-validation';
import { SENTOSA_LANDING_SITES } from './naval-landing-sites';
import { districtFacilitySites } from './facility-sites';
import { createObjectiveBeacons, objectiveHint, type ObjectiveHint } from './objective-beacons';
import { enemyObjectives } from './expedition-objectives';
import { createFacilityVisuals } from './facility-visuals';
import { facilityPrompt, facilityStatus, facilityActionFor, type FacilityState } from './facilities';
import { buildTutorialWorld } from './tutorial-world';
import { TUTORIAL_DISTRICT } from './tutorial-course';
import { takeConfirmedImpacts } from './confirmed-impacts';
import { createKeyboardCrouch, fpsControlKey, fpsInteractionTarget, fpsKeyAction } from './fps-keybindings';
import { createWeaponDevices, fittedWeaponDevices, toggleWeaponDevice, toggleWeaponRail } from './weapon-device-state';
import { createGrenadeSystem, grenadePayloads, grenadeSmokeBetween, type GrenadeBurst, type LiveGrenade, type GrenadeEvent } from './grenade-system';
import { createGrenadeViewmodel } from './grenade-models';
import { createGrenadeVisuals } from './grenade-visuals';
import { grenadeDangerRadius, grenadeWhistleLine } from './grenade-catalog';
import { grenadeOptions } from './utility-belt';
import { applyGrenadeConditions, advanceGrenadeConditions, arenaConditionModifiers, grenadeConditionViews, type ActiveGrenadeConditions, type GrenadeConditionView } from './grenade-effects';
import { resolveBlast } from './combat-blast';
import { bipodRecoilMultiplier } from './weapon-support';
import { createWorldAtmosphere } from './world-atmosphere';
import { createNightLights, nightLevel } from './world-night-lights';
import { getRegion } from './regions';
import { createMovementMotion, resetMovementMotion, advanceGroundMotion, advanceBodyMotion, bufferJump, consumeJump, landMovement, INFANTRY_GRAVITY } from './fps-movement';
import { createVerticalMovement, MAX_STEP_HEIGHT } from './vertical-movement';
import { elevatedLootAnchors } from './vertical-navigation';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { seatPoint, type VehicleControls } from './vehicle-seats';
import { PRONE_EYE_HEIGHT, weaponBraced, unsupportedRecoilDamage, stanceRecoilMultiplier } from './fps-stance';
import { pickupSlot, restoreCarrySlots } from './armory-slots';
import { equipmentMovement } from './fps-encumbrance';
import { createFpsBody } from './fps-body';
import { buildServiceWeapon } from './service-weapon-models';
import { impactSurfaceNormal } from './fps-impact-normal';
import { hitSurface } from './fps-surfaces';
import * as THREE from 'three';
import { requestFpsPointerLock, requiresFpsPointerLock, turnFpsLook, clampFpsPitch } from './fps-pointer';
import { dragLook, resolveMovement, stickKeys, type StickVector } from './touch-controls';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { advanceWeapon, beginReload, chamberRound, findTrait, fireWeapon, interruptReload, reloadDuration, roundReady, validWeaponIndex, FPS_SPAWN, FPS_WEAPONS, hitDamage, movementInput, splashScale, type WeaponSpec, type WeaponState } from './fps-rules';
import { addReserveRounds, ammoPools, createPooledLoadout, MAX_RESERVE, replacePooledWeapon, type AmmoPools } from './ammo-pools';
import { firstVisibleHit, visibleHits } from './fps-raycast';
import { sectorAt, zoneSectors } from './zone-sectors';
import { adoptPublishedRounds, advanceRound, createRound, needsFlight, skipRound, MAX_ROUNDS_IN_FLIGHT, MAX_SKIPS, type InFlightRound, type PublishedRound } from './fps-projectiles';
import { SKIP_ENERGY, splashWeight, waterRicochet } from './fps-splashes';
import { isWaterObject, rippleWater } from './water';
import { createFpsEffects, type ImpactKind } from './fps-effects';
import { assistCone, assistLook, ASSIST_RANGE } from './aim-assist';
import { getAimAssist } from './aim-assist-setting';
import { advanceRecoil, compensateRecoil, createRecoil, recoilPose, recoilView, recordRecoilShot, resetRecoil, takeAimPush } from './fps-recoil';
import { effectStyleForWeapon, resolveEffectStyle, type EffectStyle } from './fps-effect-styles';
import type { ImpactProfile } from './fps-impact-profile';
import { applyArmorDamage, claimElimination, consumeItem, createProfile, encikAddress, resolveLoadout, rewardAmount, completionXp, type ResolvedLoadout, type ExerciseReward, type ArmoryProfile, type VendorPurchaseResult } from './armory-state';
import { registerElimination, ELIMINATION_XP, ELIMINATION_CREDITS, type KillChain } from './progression';
import { worldVehicleSpawns } from './world-vehicles';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { sceneFlightObstacles } from './flight-obstacles';
import { createFpsVehicles } from './fps-vehicles';
import { minimapContactRange, MINIMAP_CONTACT_RANGE, type MinimapMarker } from './minimap';
import { combatMinimapMarkers, type MinimapCloud } from './fps-minimap-contacts';
import type { VehicleKind } from './vehicle-rules';
import { VEHICLE_COMBAT, vehicleBlastDamage, type VehicleDamageStage } from './vehicle-combat';
import { dressWeapon } from './armory-visuals';
import { createArenaRuntime } from './arena-runtime';
import type { ArenaActor, ArenaBark, ArenaEnvironment, ArenaHeat, ArenaSnapshot, ArenaVitals } from './arena-rules';
import { CALLOUT_COOLDOWN, CALLOUT_PAGES, getPlayerCallout, wheelSlot } from './player-callouts';
import { BARK_RANGE } from './npc-barks';
import { ORDER_TUNING } from './squad-orders';
import { createSoloSession, type LanSession } from './lan-peer';
import { buildDistrictWorld } from './district-world';
import { getFpsDistrict } from './fps-districts';
import { createExpeditionMarkers } from './expedition-visuals';
import { createLootGround } from './expedition-ground';
import { findWorldGateway, resolveWorldTransition, getWorldZone, type WorldZoneId, type WorldTransition, type ZoneSpawn } from './world-zones';
import type { ExpeditionLoot, FieldLoot } from './expedition-loot';
import { expeditionNpcs, nearestNpc, npcInteractionPrompt, type ExpeditionNpc } from './expedition-npcs';
import { itemById } from './armory-catalog';
import { DEFAULT_FPS_DEBUG, FPS_REGEN_DELAY, normalizeFpsDebug, readFpsDebug, regenerateHealth, saveFpsDebug, type FpsDebugSettings } from './fps-debug';
import { createWeaponHandling } from './fps-viewmodel';
import { createScopeRenderer, getWeaponSight, setSightNightVision } from './weapon-optics';
import { DEFLECT_LINE, sightRangeAgainst } from './armor-inserts';
import { muzzleSocket, railEmitters } from './weapon-accessory-models';
import { accessorySpreadScale, hasLight, type MuzzleDevice, type RailDevice } from './weapon-accessories';
import { createRailEffects } from './weapon-rail-effects';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { separateInstancedMaterials } from './instanced-materials';
import { createOpticReflectionRenderer } from './weapon-reflections';
import { handleSide, INSPECT_DURATION, inspectMotion, reloadMotion, readyMotion, reloadStage, smoothStep } from './fps-weapon-motion';
import { armReloadGate, reloadInterrupt } from './fps-reload';
import { advanceSprintBreak, createSprintBreak } from './fps-sprint';
import { createFpsComms, type CommsEntry } from './fps-comms';
import { createEncikRadio, type EncikAddress, type EncikCallout, type EncikEvent } from './fps-callouts';
import { createEncikAudio } from './encik-audio';
import { encikRecordingUrl } from './encik-recordings';
import { createPlayerPilot, normalizePilotAction, PILOT_HEALING_KINDS, PILOT_INTERVAL, type PilotObservation, type PilotGoal, type PlayerPilot } from './fps-pilot';
import { visiblePilotContacts, type PilotSubject } from './fps-pilot-perception';
import { createStrategyPlanner, llmPilotStrategy } from './pilot-strategy';
import { findWorldRoute } from './world-zones';
import { advanceBloom, createWeaponBloom, recordBloomShot, sampleShotSpread, weaponSpread } from './fps-accuracy';
import { combatCues, combatPhase, combatTimeline, cratePose, flyerPose, getCombatEvent, transportPose, WHISTLE_LEAD, type CombatEventDescriptor } from './combat-events';
import { createCombatEventVisuals } from './combat-event-visuals';
import { bannerOf, threatens } from './combat-event-catalog';
import { factionIdOf, getArenaFaction, hostile, PLAYER_FACTION, SQUAD_FACTIONS, type SquadFaction } from './arena-factions';
import { HEAT_CALLS } from './faction-heat';
import { createCombatAudio } from './combat-event-audio';
import { createAmbientSky } from './ambient-sky-visuals';
import { COASTAL_SEA, type AmbientKind } from './ambient-sky';
import { gunfireReports } from './gunfire-reports';
import { createGunshotAudio, gunshotTone } from './gunshot-audio';
import { createSfxBank, type SfxGroup } from './sfx-bank';
import { getEnvironmentSettings } from './environment-settings';
import { createHitDirectionOverlay, createHitDirections, hitStrength } from './fps-hit-direction';
import { advanceSupplyUse, startSupplyUse, supplyProfile, supplyProgress, SUPPLY_MOVE_SCALE, type SupplyProfile, type SupplyStyle, type SupplyUse } from './fps-healing';
import { createSupplyViewmodel } from './fps-supply-viewmodel';
import { foodOptions, heldSupplies, pickUtility, utilityBelt, utilityKind, utilitySlot, utilitySlotForKey, UTILITY_SLOTS, type FoodOption, type UtilityKind, type UtilitySlotView } from './utility-belt';
import { advanceFoodEffects, aimSpeedScale, applyFoodEffects, cycleRate, damageDealtScale, damageTakenScale, FOOD_EFFECTS, foodEffectViews, footSpeedScale, loadRelief, recoilScale, reloadRate, survivesWithAhMa, type ActiveFoodEffects, type FoodEffectView } from './food-effects';
import { ammoBlocked, ammoTarget, beltRoom, focusLoot, lootCard, withinReach, type CarriedGun, type LootCard } from './loot-focus';
import { armorPickup, type ArmorPickupAction } from './armor-pickup';
import { createSunShadows } from './fps-sun-shadows';
import { createWorldOcclusion } from './world-occlusion';
import { createVisionSystem } from './fps-vision';
import { createLensEffects } from './fps-lens';
import { activePalette, advanceVision, nvgAimingActive, createVisionState, cycleVisionPalette, stepVisionButton, toggleVision, type ThermalPalette, type VisionKind } from './vision-devices';

export interface FpsArenaOptions { session: LanSession; botCount: number; composition?: string; profile: ArmoryProfile; environment?: ArenaEnvironment; initialVitals?: Partial<ArenaVitals> }
export interface FpsCheckpoint { health: number; armor: number; weapon: number; ammunition: WeaponState[]; pilot?: boolean; pilotStrategy?: 'local' | 'llm'; encikVoice?: boolean; comms?: readonly CommsEntry[];
  /** Loose rounds saved once per calibre, rather than once per gun using them. */
  ammoPools?: AmmoPools;
  /** The head-mounted device was switched on, so it stays on across the gateway. */
  vision?: boolean;
  /** Supplies picked up on this expedition and still on the belt; they never touch the saved profile. */
  fieldSupplies?: Record<string, number> }
export interface FpsExpeditionOptions {
  autoRespawn?: boolean;
  infrastructure?: Map<WorldZoneId, Pick<ArenaSnapshot, 'facilities' | 'vehicles' | 'reinforcementClocks'>>;
  zone: WorldZoneId; spawn?: ZoneSpawn; checkpoint?: FpsCheckpoint; profile: ArmoryProfile; loot: ExpeditionLoot;
  onTravel: (transition: WorldTransition, checkpoint: FpsCheckpoint) => void; onEquipment: (profile: ArmoryProfile) => void;
  onVendorPurchase: (catalogId: string, price: number) => VendorPurchaseResult;
}
/**
 * How long a trigger press is remembered, in seconds. The trigger is read once
 * a frame, so without this a tap released before the next frame — common on a
 * phone running the scene at 20–30 fps — or one landing in the last round's
 * cooldown was dropped, and holding was the only pull that reliably fired.
 */
const TRIGGER_BUFFER = .18;
/** How near a friendly has to fall, in metres, for the radio to say what they left. */
const FRIENDLY_KIT_CALL_RANGE = 90;
const randomRoundId = () => globalThis.crypto?.randomUUID?.() ?? `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** A line said near the player, on the HUD's chatter strip for a few seconds. */
export interface ChatterLine { id: number; source: string; text: string; tone: 'self' | 'friend' | 'enemy' | 'player' | 'order'; until: number }
/** Seconds a chatter line stays on the HUD, and how many show at once. */
const CHATTER_SECONDS = 6, CHATTER_LINES = 4;
/** How long the food key is held before it opens the food picker rather than eating on release. */
const FOOD_PICKER_HOLD_MS = 280;
const ahMaLine = (health: number) => `Ah Ma: "Not yet! You haven't finished eating." Back up on ${Math.round(health)} HP.`;
export interface FpsHud {
  /** Live movement telemetry for the guided recruit course. */
  tutorial?: { feet: number; grounded: boolean; stance: 'stand' | 'crouch' | 'prone'; sprinting: boolean };
  encikCallout: EncikCallout | null; encikVoice: boolean; comms: readonly CommsEntry[];
  /** The callout wheel while it is open: the page shown and the slot the pointer is on. */
  calloutWheel: { page: number; slot: number | null } | null;
  /** For the wheel's Orders page: allies in order range, and whether HQ will send a transport ('none' where it never will). */
  orderStatus: { allies: number; reinforce: 'ready' | 'none' | number } | null;
  /** Barks and callouts heard lately, newest last. */
  chatter: readonly ChatterLine[];
  pilotStrategy: 'local' | 'llm'; pilotPlan: string;
  pilotEnabled: boolean; pilotStatus: string; pilotGoal: PilotGoal | null; pilotContacts: number;
  debug: FpsDebugSettings; debugAvailable: boolean; maxHealth: number;
  aimProgress: number; reloadEmpty: boolean; inspecting: boolean;
  /** Share of the held weapon's interrupted reload already done; the next reload resumes from it. */
  reloadSaved: number;
  /** A round sits in the held weapon's chamber, counted in `magazine`. */
  chambered: boolean;
  /** The held weapon's magazine is out: an interrupted reload left the well empty. */
  magazineOut: boolean;
  /** A trigger pull on the held weapon would fire, cooldown and reload aside. */
  roundReady: boolean;
  /** The supply in the player's hands, while one is being used (G, or medical supplies taken with E). */
  supplyUse: { name: string; verb: string; progress: number; style: SupplyStyle; fromBelt: boolean } | null;
  /** The utility belt, every slot in order; `beltSelected` is the one G uses again. */
  belt: UtilitySlotView[]; beltSelected: UtilityKind;
  /** Meals still working (food-effects); the food slot's pick, null for Auto; the food picker while it is open. */
  grenadeHeld: { id: string; name: string; ready: number; cooked: number; fuse: number; pinned: boolean; under: boolean } | null;
  grenadeChoice: string | null; grenadePicker: { options: FoodOption[]; slot: number | null } | null;
  conditions: GrenadeConditionView[]; grenadeWarnings: { serial: number; angle: number; remaining: number }[];
  foodEffects: FoodEffectView[]; foodChoice: string | null; foodPicker: { options: FoodOption[]; slot: number | null } | null;
  crosshairSpread: number; hitKind: 'hit' | 'kill'; quickItem: string; quickType: 'FOOD' | 'UTILITY' | ''; quickCount: number;
  phase: 'loading' | 'ready' | 'deploying' | 'playing' | 'paused' | 'complete' | 'defeated' | 'error';
  carriedWeapons: number[]; carriedKg: number; movementScale: number;
  weapon: number; magazine: number; reserve: number; reloading: number;
  rangeDrill: RangeDrillView | null; rangeSupplyPrompt: string;
  prone: boolean; braced: boolean; hits: number; shots: number; landed: number; health: number; armor: number; incoming: boolean; hurt: boolean; lastDamage: number; earned: number; earnedXp: number; callout: string; chain: number; elapsed: number; aiming: boolean; hit: boolean;
  vehicleView: 'first-person' | 'third-person'; vehiclePersonalWeapon: boolean; vehicleSeat: number | null; vehicleCanFire: boolean; vehicleSeats: { label: string; name: string; occupied: boolean; self: boolean }[];
  vehicleAimX: number; vehicleAimY: number; vehicleAimVisible: boolean;
  vehicleHealth: number; vehicleMaxHealth: number; vehicleAmmo: number; vehicleAmmoMax: number; vehicleWeapon: string; vehicleDamage: VehicleDamageStage;
  vehicle: VehicleKind | 'on-foot'; vehicleSpeed: number; altitude: number; interact: string; vehicleNotice: string; carDistance: number; helicopterDistance: number;
  locked: boolean; message: string; muted: boolean; x: number; z: number; yaw: number;
  /** Look pitch. Recoil moves this as well as the mouse, so nothing outside the
   * engine can dead-reckon where the shooter is pointing. */
  pitch: number; mapMarkers: MinimapMarker[]; mapContactRange: number;
  /** Which control scheme the round is running under; 'touch' skips pointer capture. */
  inputMode: 'mouse' | 'touch';
  arena: ArenaSnapshot | null; arenaSelf: ArenaActor | null; arenaConnected: boolean; arenaStarted: boolean;
  respawn: PlayerRespawnView | null;
  deployment: DeploymentView | null;
  deploymentIntro: { stage: 'descent' | 'ready'; fade: number; elapsed: number; reduced: boolean; time: string; weather: string } | null;
  expeditionZone: WorldZoneId | null; facility: FacilityState | null; facilityPrompt: string; lootPrompt: string;
  /** The item being looked at within reach, as its card shows it. */
  lootCard: LootCard | null; npcPrompt: string; travelPrompt: string; lootNotice: string; fieldLoot: FieldLoot[]; npcs: ExpeditionNpc[];
  credits: number; tokens: number;
  /** Named sub-area the player is standing in; '' on ground that belongs to none. */
  sector: string;
  /** Each side's heat where the player stands, 0–1, when the district has heat. */
  sectorHeat: Record<SquadFaction, number> | null;
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
  objectiveHints: boolean; objectiveMarkers: ObjectiveHint[];
  /** The worn night-vision or thermal device, if any, and what it is doing. */
  vision: { name: string; kind: VisionKind; generation: number; on: boolean; palette: ThermalPalette | ''; palettes: number; warm: number; calibrating: boolean } | null;
  /** The weapon in hand's laser (B) and light (L), and its offset dot (X cants onto it). */
  rail: { kind: RailDevice; on: boolean; laserOn?: boolean; lightOn?: boolean } | null; offsetDot: boolean; canted: boolean;
}
export const initialFpsHud: FpsHud = { rangeDrill: null, rangeSupplyPrompt: '', grenadeHeld: null, grenadeChoice: null, grenadePicker: null, conditions: [], grenadeWarnings: [], inspecting: false, calloutWheel: null, orderStatus: null, chatter: [], vision: null, rail: null, offsetDot: false, canted: false, supplyUse: null, belt: [], beltSelected: 'bandage', foodEffects: [], foodChoice: null, foodPicker: null, mapExpanded: false, objectiveHints: false, objectiveMarkers: [], combatBanner: null, combatEventsAvailable: false, mapDangers: [], mapJammed: false, cloudCover: null, vehicleView: 'third-person', vehiclePersonalWeapon: false, vehicleSeat: null, vehicleCanFire: false, vehicleSeats: [], vehicleAimX: 50, vehicleAimY: 50, vehicleAimVisible: true, vehicleHealth: 0, vehicleMaxHealth: 0, vehicleAmmo: 0, vehicleAmmoMax: 0, vehicleWeapon: '', vehicleDamage: 'intact', prone: false, braced: false, carriedWeapons: [0, 2], carriedKg: 0, movementScale: 1, quickItem: '', quickType: '', quickCount: 0, encikCallout: null, encikVoice: true, comms: [], pilotStrategy: 'local', pilotPlan: 'Local utility planner', pilotEnabled: false, pilotStatus: 'Player controls', pilotGoal: null, pilotContacts: 0, crosshairSpread: 6, hitKind: 'hit', aimProgress: 0, reloadEmpty: false, reloadSaved: 0, chambered: true, magazineOut: false, roundReady: true, debug: { ...DEFAULT_FPS_DEBUG }, debugAvailable: true, maxHealth: 100, phase: 'loading', weapon: 0, magazine: 30, reserve: 120, reloading: 0, hits: 0, shots: 0, landed: 0, health: 100, armor: 0, incoming: false, hurt: false, lastDamage: 0, earned: 0, earnedXp: 0, callout: '', chain: 0, elapsed: 0, aiming: false, hit: false, vehicle: 'on-foot', vehicleSpeed: 0, altitude: 0, interact: '', vehicleNotice: '', carDistance: 0, helicopterDistance: 0, locked: false, inputMode: 'mouse', message: '', muted: false, x: FPS_SPAWN.x, z: FPS_SPAWN.z, yaw: FPS_SPAWN.yaw, pitch: FPS_SPAWN.pitch, mapMarkers: [], mapContactRange: MINIMAP_CONTACT_RANGE, arena: null, arenaSelf: null, arenaConnected: true, arenaStarted: false, respawn: null, deployment: null, deploymentIntro: null, expeditionZone: null, facility: null, facilityPrompt: '', lootPrompt: '', lootCard: null, npcPrompt: '', travelPrompt: '', lootNotice: '', fieldLoot: [], npcs: [], credits: 0, tokens: 0, sector: '', sectorHeat: null };

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

export function createFpsEngine(host: HTMLDivElement, onHud: (hud: FpsHud) => void, options: { rangeDrill?: RangeDrillId; tutorial?: boolean; region?: WorldZoneId; playerPilot?: PlayerPilot; loadout?: ResolvedLoadout; combat?: boolean; arena?: FpsArenaOptions; expedition?: FpsExpeditionOptions; onComplete?: (reward: ExerciseReward) => void; onElimination?: (id: string, bounty?: RaiderBounty) => void; onConsume?: (id: string) => void; onFullscreen?: () => void;
  /** Read per callout, so a level-up mid-exercise is heard immediately. */
  encik?: () => EncikAddress } = {}) {
  const expedition = options.expedition;
  const region = expedition?.zone ?? options.region ?? 'marina-bay';
  const district = options.tutorial ? TUTORIAL_DISTRICT : getFpsDistrict(region), spawn = district.spawn, targetPositions = district.targets;
  const practiceRange = !expedition && !options.arena && !options.tutorial;
  let drillMode: RangeDrillId = practiceRange && validRangeDrill(options.rangeDrill) ? options.rangeDrill : 'classic';
  let rangeDirector = !expedition && !options.arena ? createRangeDirector(drillMode, targetPositions.length, Math.floor(Math.random() * 0xffffffff)) : null;
  let rangeEndedEarly = false;
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
  const zoneWorld = options.tutorial ? buildTutorialWorld() : buildDistrictWorld(region, expedition?.spawn);
  const world = zoneWorld; world.stamps.forEach(o => o.visible = false);
  // Before night lights and shadows patch the materials: see instanced-materials.
  separateInstancedMaterials(world.scene);
  const atmosphere = createWorldAtmosphere(world.scene, getRegion(region).stamps, world.obstacles, !!options.arena && options.arena.session.role !== 'solo', renderer, options.tutorial);
  // Streetlamps, their pools and lit windows, for dusk and night.
  const nightLights = createNightLights(world.scene, { roads: getRegion(region).mapRoads, roadWidth: getRegion(region).roadWidth, bounds: world.bounds, obstacles: world.obstacles });
  const sunShadows = createSunShadows(renderer, world.scene);
  let footMovement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
  const expeditionSession = expedition ? createSoloSession('Explorer') : null;
  if (expedition && zoneWorld && expeditionSession) options = { ...options, arena: { session: expeditionSession, profile: fieldProfile, botCount: zoneWorld.zone.botCount, composition: zoneWorld.zone.composition, environment: zoneWorld.environment, initialVitals: expedition.checkpoint } };
  const npcs = expedition ? expeditionNpcs(expedition.zone, zoneSectors(expedition.zone)) : [];
  const fleetSpawns = expedition ? worldVehicleSpawns(district.vehicles, [...world.obstacles, ...verticalVehicleObstacles({ surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) })], sceneFlightObstacles(world.scene), world.bounds, [...npcs, zoneWorld?.zone.spawn ?? district.spawn]) : district.vehicles;
  const facilitySites = expedition ? districtFacilitySites(expedition.zone, fleetSpawns,
    (x, z) => footMovement.canOccupy(x, 0, z, 1.1, 2) && Math.abs(footMovement.supportHeight(x, z, .1, .4, 1.8) ?? 100) < .05, npcs) : [];
  if (expedition && options.arena?.environment) {
    const saved = expedition.infrastructure?.get(expedition.zone);
    options.arena.environment.savedReinforcementClocks = saved?.reinforcementClocks;
    options.arena.environment.facilities = { sites: facilitySites, saved: saved?.facilities, savedVehicles: saved?.vehicles };
    for (const site of facilitySites) world.obstacles.push({ minX: site.x - .85, maxX: site.x + .85, minZ: site.z - .65, maxZ: site.z + .65, maxY: 1.8 });
    footMovement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
  }
  const rangeStock = rangeEquipmentStock(equipment.supplies);
  const supplyPoint = practiceRange ? rangeResupplyPoint(spawn, world.bounds, [...world.obstacles,
    ...district.props.map(([, x, z, w, d]) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })),
    ...targetPositions.map(p => ({ minX: p.x - .5, maxX: p.x + .5, minZ: p.z - .5, maxZ: p.z + .5 }))], Object.values(fleetSpawns)) : null;
  const rangeStation = supplyPoint ? createRangeResupply(world.scene, supplyPoint) : null;
  if (rangeStation) {
    const floor = footMovement.supportHeight(supplyPoint!.x, supplyPoint!.z, MAX_STEP_HEIGHT, .4, 1.8) ?? 0;
    rangeStation.root.position.y = floor;
    world.obstacles.push({ minX: supplyPoint!.x - .75, maxX: supplyPoint!.x + .75, minZ: supplyPoint!.z - .75, maxZ: supplyPoint!.z + .75, maxY: floor + 1.1 });
    footMovement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
  }
  const facilityVisuals = createFacilityVisuals(world.scene, facilitySites);
  const objectiveBeacons = expedition ? createObjectiveBeacons(world.scene, facilitySites) : null;
  const facilityCover = createSceneCover(world.scene);
  const vehicles = createFpsVehicles(world.scene, world.obstacles, equipment.vehicleSkins, { spawns: fleetSpawns, bounds: world.bounds, deriveFlightObstacles: region !== 'marina-bay', exitFloor: (x, z) => footMovement.supportHeight(x, z, MAX_STEP_HEIGHT, .38, 1.8) });
  const deploymentPoints = expedition && !expedition.checkpoint && !expedition.spawn ? districtDeploymentPoints(expedition.zone, (x, z) =>
    footMovement.canOccupy(x, 0, z, .5, 1.8) && Math.abs(footMovement.supportHeight(x, z, .1, .4, 1.8) ?? 100) < .05 &&
    npcs.every(n => Math.hypot(n.x - x, n.z - z) > 3) && Object.values(fleetSpawns).every(v => Math.hypot(v.x - x, v.z - z) > 8) &&
    facilitySites.every(f => Math.hypot(f.x - x, f.z - z) > (f.initialOwner === 'mercenaries' ? 35 : 8)),
    (x, z) => footMovement.canOccupy(x, 0, z, .5, 1.8, vehicles.footObstacles()) && Math.abs(footMovement.supportHeight(x, z, .1, .4, 1.8) ?? 100) < .05) : [];
  if (options.arena?.environment?.navalSites?.length) options.arena.environment.navalSites = validatedNavalSites(world.scene, options.arena.environment.navalSites, world.bounds, footMovement);
  const deploymentIntro = createDeploymentIntro();
  let deploymentRoof: number | null = null, readySound = 0;
  let deploymentConditions = { time: '', weather: '' };
  const introEligible = !!expedition && !expedition.checkpoint && !expedition.spawn;
  const overview = createDeploymentOverview(world.scene, deploymentPoints);
  const overviewHighest = world.obstacles.reduce((height, o) => Math.max(height, o.maxY ?? 12), 80);
  let overviewZoom = 1, overviewPan = { x: 0, z: 0 }, overviewDrag: { id: number; x: number; y: number } | null = null;
  const overviewActive = () => introEligible && ['loading', 'ready'].includes(hud.phase) && !deploymentIntro.begun;
  const overviewView = () => overviewFrame(world.bounds, canvas.clientWidth, canvas.clientHeight, overviewHighest, overviewZoom, overviewPan);
  let deploymentChoice = 'random', deploymentResolved = false, resolvedDeployment: string | null = null;
  if (options.arena?.environment && deploymentPoints.length) options.arena.environment.deployments = deploymentPoints;
  let arenaRuntime: ReturnType<typeof createArenaRuntime> | null = null;
  const chaseRay = new THREE.Raycaster();
  let vehicleView: 'first-person' | 'third-person' = 'third-person';
  const firstPersonVehicle = () => vehicleView === 'first-person' || ads || touchAim;
  const camera = new THREE.PerspectiveCamera(65, 1, 0.08, 800); camera.rotation.order = 'YXZ';
  const occlusion = createWorldOcclusion(renderer, world.scene, camera);
  const viewScene = new THREE.Scene(), viewCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 3);
  // Night vision and thermal (N, J for the palette): it draws over every pass below.
  const vision = createVisionSystem(renderer, { world: world.scene, view: viewScene });
  const visionState = createVisionState(!!expedition?.checkpoint?.vision && !!equipment.vision);
  // Sun flare, haze dust and rain on the lens, over the world and weapon and under any vision device.
  const lens = createLensEffects(renderer);
  const deploymentBlur = createDeploymentBlur(renderer);
  // The weapon has its own scene, so it is lit to match the world's hour by hand: same key direction, colour and balance.
  const viewSky = new THREE.HemisphereLight('#e4efff', '#576350', 2.1); viewScene.add(viewSky);
  const weaponLight = new THREE.DirectionalLight('#fff4dd', 2.5); weaponLight.position.set(1, 2, 1); viewScene.add(weaponLight);
  // Overhead streetlamp light at night, as strong as the pool the player stands in.
  const lampLight = new THREE.DirectionalLight('#ffd9a6', 0); viewScene.add(lampLight);
  const UP = new THREE.Vector3(.15, 1, .25).normalize();
  const VIEW_SKY = new THREE.Color('#e4efff'), VIEW_GROUND = new THREE.Color('#576350'), VIEW_KEY = new THREE.Color('#fff4dd');
  const viewTint = new THREE.Color(), viewQuaternion = new THREE.Quaternion();
  const scopeRenderer = createScopeRenderer(renderer);
  const opticReflections = createOpticReflectionRenderer(renderer);
  const rig = new THREE.Group(); viewScene.add(rig);
  const playerBody = createFpsBody(world.scene);
  // Hands and the supply in them; `apply` lands its effect at the commit point and says whether it could.
  const supplyHands = createSupplyViewmodel(viewScene);
  const grenadeHands = createGrenadeViewmodel(viewScene);
  let supplyUse: (SupplyUse & { name: string; id: string; fromBelt: boolean; apply: () => boolean }) | null = null;
  let supplyGate = armReloadGate(false, false);
  const loader = new GLTFLoader(), templates: THREE.Group[] = [], weapons: THREE.Group[] = [];
  const handling: ReturnType<typeof createWeaponHandling>[] = [], emptyReload = specs.map(() => false);
  let aimProgress = 0, lastReloadStage = '';
  let inspectElapsed: number | null = null;
  // Inputs held when a reload began, which do not interrupt it (see fps-reload).
  // Only a held sprint key counts as sprint intent there: a stick pushed to the rim never stops a reload.
  let reloadGate = armReloadGate(false, false), sprintIntent = false;
  // The trigger breaking a run (see fps-sprint); the stick's run state, for its hysteresis.
  const sprintBreak = createSprintBreak();
  let wasSprinting = false, stickRunning = false;
  const bloom = specs.map(() => createWeaponBloom());
  let spreadAngle = .005;
  const shotRight = new THREE.Vector3(), shotUp = new THREE.Vector3();
  const targets: { root: THREE.Group; hitZone: THREE.Mesh; alive: boolean; activation: number; collider: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }; health: number; maxHealth: number; bar: THREE.Mesh }[] = [];
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
  const effects = createFpsEffects(world.scene, viewScene, { style: weaponStyles[0], reduced: () => getEnvironmentSettings().reducedEffects || !!motionPreference?.matches });
  effects.setStyles(weaponStyles, 0);
  // A laser's beam and dot, and a torch only when the loadout carries one (see weapon-rail-effects).
  const railEffects = createRailEffects(world.scene, specs.some(spec => hasLight(spec.accessories)));
  const laserRay = new THREE.Raycaster(), railFrom = new THREE.Vector3(), railTo = new THREE.Vector3(), railLight = new THREE.Vector3(), railForward = new THREE.Vector3();
  /** B/L: independent laser/light switches, shared across weapons. X: canted onto the offset dot, and how far over the weapon is. */
  const weaponDevices = createWeaponDevices();
  let cantWanted = false, cant = 0;
  // Combat events are drawn from the descriptors the authority publishes.
  const eventRay = new THREE.Raycaster();
  const combatVisuals = createCombatEventVisuals(world.scene, (origin, direction, far) => {
    eventRay.set(origin, direction); eventRay.near = 0; eventRay.far = far;
    return firstVisibleHit(eventRay, gameplayCandidates())?.point ?? null;
  }, { reduced: () => getEnvironmentSettings().reducedEffects || !!motionPreference?.matches });
  const grenadeVisuals = createGrenadeVisuals(world.scene, (at, damage) => { combatVisuals.blast(at, damage > 90 ? 1 : .5); combatAudio.boom(at.distanceTo(camera.position), damage > 90 ? 1 : .5); ambientSky.startle(at, 1); }, p => { eventRay.set(p.clone().setY(160), new THREE.Vector3(0, -1, 0)); eventRay.near = 0; eventRay.far = 180; return (firstVisibleHit(eventRay, gameplayCandidates())?.point.clone() ?? p).add(new THREE.Vector3(0, .15, 0)); });
  const combatAudio = createCombatAudio(() => audio, () => hud.muted);
  const sfx = createSfxBank();
  const gunshots = createGunshotAudio(() => audio, () => hud.muted, sfx);
  // Scenery in the sky beyond the district: never a threat, never sent between peers (ambient-sky).
  // Roost sampling runs before the first render, so static world transforms must be ready.
  world.scene.updateMatrixWorld(true);
  const birdRay = new THREE.Raycaster(), birdFrom = new THREE.Vector3(), birdDirection = new THREE.Vector3();
  const birdSurfaces = () => gameplayCandidates().filter(o => o !== vehicles.root && !o.userData.arenaActorId);
  const ambientSky = createAmbientSky(world.scene, { seed: Math.floor(Math.random() * 2 ** 32), risk: options.arena?.environment?.combatEvents?.risk ?? 'low', sea: COASTAL_SEA[region],
    reduced: () => getEnvironmentSettings().reducedEffects || !!motionPreference?.matches, audio: () => audio, muted: () => hud.muted,
    birdSurface(x, z) {
      birdRay.set(birdFrom.set(x, 512, z), birdDirection.set(0, -1, 0)); birdRay.near = 0; birdRay.far = 544;
      const hit = firstVisibleHit(birdRay, birdSurfaces(), true);
      if (!hit || isWaterObject(hit.object) || !hit.face) return null;
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      return normal.y > .85 ? hit.point.y : null;
    },
    birdClear(from, perch) {
      birdFrom.set(from.x, from.y, from.z); birdDirection.set(perch.x, perch.y, perch.z).sub(birdFrom);
      const distance = birdDirection.length();
      birdRay.set(birdFrom, birdDirection.normalize()); birdRay.near = .1; birdRay.far = Math.max(.1, distance - .3);
      return !firstVisibleHit(birdRay, birdSurfaces(), true);
    } });
  let ambientJet = Infinity, cueClock = 0;
  /** Events within this many metres are alarms (banner, tones); further away they are news in the comms log. */
  const COMBAT_NEAR = 130;
  const seenGrenadeCues = new Set<number>();
  const seenEvents = new Set<string>(), openedSupplies = new Set<string>();
  let eventClock = -1, shake = 0, lockBeep = 0, blackout = 0;
  const debugAvailable = !options.arena || options.arena.session.role === 'solo';
  let debug = debugAvailable ? readFpsDebug() : { ...DEFAULT_FPS_DEBUG }, recoveryDelay = 0;
  const keys = new Set<string>(); const hud: FpsHud = { ...initialFpsHud, weapon: equipment.carriedFamilies[0], carriedWeapons: equipment.carriedFamilies, debug, debugAvailable, quickItem: equipment.quickItem?.name || '', quickType: equipment.quickItem ? equipment.quickItem.supplyType === 'food' ? 'FOOD' : 'UTILITY' : '', quickCount: equipment.quickCount, health: 100 * debug.healthMultiplier, maxHealth: 100 * debug.healthMultiplier, armor: equipment.armor, expeditionZone: expedition?.zone ?? null,
    credits: fieldProfile.credits, tokens: fieldProfile.tokens };
  hud.npcs = npcs.map(npc => ({ ...npc }));
  if (expedition && zoneWorld) hud.fieldLoot = expedition.loot.enterZone({ id: expedition.zone, spawn: zoneWorld.zone.spawn, bounds: zoneWorld.bounds, obstacles: vehicles.footObstacles(), canStand: (x, z, radius) => footMovement.canOccupy(x, 0, z, radius, 1.8), elevatedAnchors: elevatedLootAnchors(getWalkSurfaces(world.scene), footMovement), anchors: zoneWorld.zone.encounterSpawns, sectors: zoneSectors(expedition.zone) });
  const markers = expedition ? createExpeditionMarkers(world.scene, expedition.zone, hud.fieldLoot, npcs) : null;
  const lootGround = expedition ? createLootGround(world.scene) : undefined;
  let checkpointPending = expedition?.checkpoint;
  // Which bots were last seen alive, so a death is noticed once.
  const botsAlive = new Map<string, boolean>();
  let travelPending = false, lootNoticeTime = 0;
  const greetedNpcs = new Set<string>(), dialogueProgress = new Map<string, number>();
  /** The escalation step each side last reached across the district, so the radio speaks only when it changes. */
  const heatTiers: Record<SquadFaction, number> = { mercenaries: 0, 'armed-forces': 0 };
  let heatDistrict = '';
  const encik = createEncikRadio(Math.random, () => options.encik?.() ?? encikAddress(fieldProfile)), comms = createFpsComms(expedition?.checkpoint?.comms);
  hud.encikVoice = expedition?.checkpoint?.encikVoice ?? true;
  let killChain: KillChain = { count: 0, lastAt: -Infinity }, calloutTime = 0;
  let roundId = randomRoundId(), attackTimer = 3, hurtTime = 0;
  // Arcs around the crosshair towards whatever hit you; `hurtSerial` is the last arena hit seen.
  const hitDirections = createHitDirections(), hitOverlay = createHitDirectionOverlay(host);
  let hurtSerial = -1;
  const viewer = () => ({ x: position.x, z: position.z, yaw });
  let pendingAttack: { target: number; activation: number; remaining: number; aim: THREE.Vector3 } | null = null;
  const attackRay = new THREE.Raycaster(), attackOrigin = new THREE.Vector3();
  // Brass has to land on the deck the player is standing on, not on y = 0: a
  // plaza, a bridge or a rooftop all sit above it. One downward cast every
  // three-quarters of a second is far cheaper than one per case and follows the
  // player up and down stairs closely enough for something that lies there for
  // four seconds.
  const floorRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 8);
  let brassFloor = 0, floorCheck = 0;
  const healthGeometry = new THREE.PlaneGeometry(.54, .055), healthMaterial = new THREE.MeshBasicMaterial({ color: "#e1a74e", side: THREE.DoubleSide });
  let disposed = false, loadout = createPooledLoadout(specs, equipment.carriedFamilies), position = { x: spawn.x, z: spawn.z };
  let yaw: number = spawn.yaw, pitch: number = spawn.pitch, vertical = 0, velocityY = 0;
  let triggerSpent = false;
  let lastLookYaw = yaw, lastLookPitch = pitch, lookLagX = 0, lookLagY = 0;
  let trigger = false, pullBuffer = 0, ads = false, touchAim = false, actualAim = false, hitTime = 0;
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
  // Supplies carried into this exercise, by id. Spending one reports out so
  // the permanent profile can debit it; the counts here are what the belt shows.
  // Supplies picked up in the field sit on the belt beside them but are the
  // expedition's, not the profile's: they are spent first and never reported out.
  let looted = heldSupplies(expedition?.checkpoint?.fieldSupplies ?? {});
  const withLooted = (held: Readonly<Record<string, number>>) => {
    const belt = { ...held };
    for (const [id, count] of Object.entries(looted)) belt[id] = (belt[id] ?? 0) + count;
    return belt;
  };
  let supplies = withLooted(equipment.supplies);
  let beltSelected: UtilityKind = utilityKind(equipment.quickItem)
    ?? UTILITY_SLOTS.find(slot => pickUtility(slot.kind, supplies))?.kind ?? 'bandage';
  // The food slot's pick (null is Auto, which heals to need; a food chosen as
  // the armory's quick item starts as the pick) and the meals still working.
  let foodChoice: string | null = utilityKind(equipment.quickItem) === 'food' ? equipment.quickItem!.id : null;
  // Offline, the meals run here. In any arena (every expedition is a solo one)
  // the host runs them, and `foodEffects` is a copy of what it last published:
  // the gun, damage and healing are the host's, and the copy drives only what
  // the host never sees, the stride, the load and the sights.
  let grenadeChoice: string | null = utilityKind(equipment.quickItem) === 'grenade' ? equipment.quickItem!.id : null;
  let grenadeHeld: { id: string; ready: number; cooked: number; pinned: boolean } | null = null;
  let conditions: ActiveGrenadeConditions = {};
  let grenadeKeyAt: number | null = null, grenadePicker: { x: number; y: number; slot: number | null; options: FoodOption[] } | null = null;
  let grenadeFireHeld = false;
  let grenadeLastAt = -Infinity, missionLastAt = -Infinity;
  let foodEffects: ActiveFoodEffects = {}, ahMaSavesSeen = 0;
  const gunRates = () => ({ reload: reloadRate(foodEffects) * arenaConditionModifiers(conditions).reload, cycle: cycleRate(foodEffects) });
  /** When 4 went down, until it is let go: held long enough, it opens the food picker. */
  let foodKeyAt: number | null = null, foodPicker: { x: number; y: number; slot: number | null; options: FoodOption[] } | null = null;
  /** The belt as the HUD shows it, and the selected slot as the older quick-item fields. */
  function syncBelt() {
    hud.belt = utilityBelt(supplies, { health: hud.health, maxHealth: hud.maxHealth }, foodChoice, grenadeChoice); hud.beltSelected = beltSelected;
    hud.grenadeChoice = grenadeChoice; hud.grenadePicker = grenadePicker ? { options: grenadePicker.options, slot: grenadePicker.slot } : null;
    hud.conditions = grenadeConditionViews(conditions); hud.grenadeHeld = grenadeHeld ? { ...grenadeHeld, name: itemById(grenadeHeld.id)!.name, fuse: itemById(grenadeHeld.id)!.grenade!.fuse, under: ads || touchAim } : null;
    hud.foodChoice = foodChoice; hud.foodEffects = foodEffectViews(foodEffects);
    const slot = hud.belt.find(entry => entry.kind === beltSelected)!;
    hud.quickItem = slot.next?.name ?? ''; hud.quickCount = slot.count;
    hud.quickType = !slot.next ? '' : slot.kind === 'food' ? 'FOOD' : 'UTILITY';
  }
  syncBelt();
  const ROUND_RANGE = 180;
  /** Other people's rounds are drawn only when they start this close. */
  const REMOTE_TRACER_RANGE = 220;
  const roundRay = new THREE.Raycaster(), roundOrigin = new THREE.Vector3(), roundDirection = new THREE.Vector3(), splashPoint = new THREE.Vector3();
  let strategyMode: 'local' | 'llm' = expedition?.checkpoint?.pilotStrategy ?? 'local';
  let strategicPlanner = strategyMode === 'llm' ? createStrategyPlanner(llmPilotStrategy()) : null;
  let pilot = options.playerPilot ?? createPlayerPilot(strategicPlanner ?? undefined);
  hud.pilotStrategy = strategyMode;
  let pilotEnabled = false, nextPilotAt = 0, pilotDestination: WorldZoneId | undefined;
  let lastPilotObservation: PilotObservation | null = null;
  let pilotGunfireUntil = 0;
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
  const keyboardCrouch = createKeyboardCrouch();
  const crouchRequested = () => keyboardCrouch.active || keys.has('c');
  const grounded = () => velocityY <= 0 && Math.abs(vertical - (footMovement.supportHeight(position.x, position.z, vertical + .02, .38, .6) ?? -100)) < .025;
  const eyeHeight = () => {
    const requested = prone ? PRONE_EYE_HEIGHT : crouchRequested() ? 1.15 : 1.75;
    for (const height of [requested, 1.15, PRONE_EYE_HEIGHT]) {
      if (height <= requested && footMovement.canOccupy(position.x, vertical, position.z, .38, height + .05)) return height;
    }
    return PRONE_EYE_HEIGHT;
  };
  const stance = () => eyeHeight() < .8 ? 'prone' as const : eyeHeight() < 1.4 ? 'crouch' as const : 'stand' as const;
  const braced = () => !vehicles.active && weaponBraced(specs[hud.weapon], prone, grounded());
  const movement = () => equipmentMovement(equipment, hud.weapon, loadout, supplies, loadRelief(foodEffects));
  const publish = () => {
    if (disposed) return;
    const state = loadout[hud.weapon];
    const burden = movement();
    const mapContactRange = minimapContactRange(atmosphere.light.lighting.shift, atmosphere.conditions.weather);
    syncBelt();
    const introFrame = deploymentIntro.frame(eyeHeight() + vertical, pitch, deploymentRoof);
    hud.deploymentIntro = hud.phase === 'deploying' ? { stage: introFrame.stage, fade: introFrame.fade, elapsed: introFrame.elapsed, reduced: introFrame.reduced, ...deploymentConditions } : null;
    hud.respawn = arenaRuntime?.getRespawn() ?? null;
    hud.objectiveMarkers = expedition && hud.objectiveHints && hud.phase === 'playing' && hud.arenaSelf?.alive !== false ? enemyObjectives(hud.arena?.facilities?.sites ?? [], position).map(site => objectiveHint(site, camera, position)) : [];
    hud.deployment = deploymentPoints.length ? { points: deploymentPoints, choice: deploymentChoice, resolved: resolvedDeployment, canChoose: hud.phase === 'ready' && !deploymentResolved && !hud.arenaStarted, markers: overviewActive() ? deploymentMarkers(deploymentPoints, camera) : [], zoom: overviewZoom } : null;
    const nearby = !vehicles.active && hud.arenaSelf?.alive ? hud.arena?.facilities?.sites.filter(s => Math.abs(s.y - vertical) < 2 && Math.hypot(s.x - position.x, s.z - position.z) <= 18).sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z) - Math.hypot(b.x - position.x, b.z - position.z))[0] : null;
    hud.facility = nearby ?? null;
    let canWork = false;
    if (nearby && !nearby.action && facilityActionFor(nearby, PLAYER_FACTION)) {
      const dx = nearby.x - position.x, dz = nearby.z - position.z, dy = nearby.y + 1 - (vertical + eyeHeight()), length = Math.hypot(dx, dy, dz);
      canWork = Math.hypot(dx, dz) <= 4 && facilityCover.distance({ ...position, y: vertical + eyeHeight() }, { x: dx / length, y: dy / length, z: dz / length }, length) >= length - .1;
    }
    hud.facilityPrompt = canWork && nearby ? `E · ${facilityPrompt(nearby)}` : '';
    hud.rangeDrill = practiceRange ? rangeDirector!.view(hud.elapsed, rangeEndedEarly) : null;
    hud.rangeSupplyPrompt = canResupply() ? 'E · Resupply ammo, grenades & utilities' : '';
    if (practiceRange) {
      canvas.dataset.rangeDrill = drillMode; canvas.dataset.rangeActive = String(hud.rangeDrill?.active ?? 0);
      canvas.dataset.rangeSpawned = String(hud.rangeDrill?.spawned ?? 0);
      canvas.dataset.rangeTargets = JSON.stringify(targets.map((t, i) => ({ id: `target-${i}-${t.activation}`, x: t.root.position.x, y: t.hitZone.getWorldPosition(new THREE.Vector3()).y, z: t.root.position.z, alive: t.alive, health: t.health })));
      canvas.dataset.rangeStation = JSON.stringify(rangeStation ? { x: rangeStation.point.x, z: rangeStation.point.z, available: !!hud.rangeSupplyPrompt } : null);
    }
    onHud({ ...hud, ...(options.tutorial ? { tutorial: { feet: vertical, grounded: grounded(), stance: stance(), sprinting: wasSprinting } } : {}), vision: visionHud(), ...railHud(), supplyUse: supplyUse ? { name: supplyUse.name, verb: supplyUse.profile.verb, progress: supplyProgress(supplyUse), style: supplyUse.profile.style, fromBelt: supplyUse.fromBelt } : null, prone, braced: braced(), carriedWeapons: equipment.carriedFamilies, carriedKg: burden.totalKg, movementScale: burden.movement, comms: comms.snapshot(), pilotEnabled, aimProgress, reloadEmpty: emptyReload[hud.weapon], reloadSaved: state.reloadSaved ?? 0, chambered: chamberRound(state, specs[hud.weapon]) > 0, magazineOut: state.magazineOut === true, roundReady: roundReady(state, specs[hud.weapon]), vehicleView: firstPersonVehicle() ? 'first-person' : 'third-person', vehiclePersonalWeapon: vehicles.canUseFirearm, ...vehicles.hud(position, Object.fromEntries((hud.arena?.actors ?? []).map(a => [a.id, a.name]))), ...(!vehicles.active && (vertical > .35 || expedition && (focusedLoot || hud.npcPrompt)) ? { interact: '' } : {}), magazine: state.magazine, reserve: state.reserve, reloading: state.reloadRemaining / reloadDuration(specs[hud.weapon], state.reloadEmpty === true), aiming: actualAim, hit: hitTime > 0, locked: document.pointerLockElement === canvas, inputMode, x: position.x, z: position.z, yaw, pitch,
      mapContactRange, mapMarkers: [
        ...(!options.arena ? targetPositions : []).flatMap((point, index): MinimapMarker[] => targets[index]?.alive ? [{ ...point, id: `target-${index}-${targets[index].activation}`, kind: 'target', label: `Target ${index + 1}` }] : []),
        ...(rangeStation ? [{ id: 'range-resupply', x: rangeStation.point.x, z: rangeStation.point.z, kind: 'loot' as const, label: 'Range resupply · ammo, grenades & utilities' }] : []),
        ...(['car', 'helicopter'] as const).filter(kind => kind !== vehicles.active && vehicles.states[kind].health > 0).map((kind): MinimapMarker => ({ id: kind, kind, label: kind === 'car' ? 'Utility 01' : 'Falcon 01', x: vehicles.states[kind].x, z: vehicles.states[kind].z })),
        ...(hud.arena?.transports ?? []).filter(t => t.mode === 'sea' && t.visible && t.state !== 'departed').map((t): MinimapMarker => {
          const event = hud.arena?.events?.find(e => e.id === t.event), friendly = event?.faction === PLAYER_FACTION;
          const coast = SENTOSA_LANDING_SITES.find(s => s.id === event?.landing)?.name ?? 'Coast';
          return { id: `boat-${t.event}`, x: t.x, z: t.z, kind: 'boat', side: friendly ? 'ally' : 'enemy', label: `${friendly ? 'Friendly' : 'Hostile'} landing craft · ${coast} · ${t.state === 'inbound' ? `ETA ${Math.max(0, Math.ceil((event?.start ?? 0) + NAVAL_LANDING.approach + NAVAL_LANDING.rampSeconds - (hud.arena?.elapsed ?? 0)))}s · ` : ''}${t.passengers} aboard` };
        }),
        ...(hud.arena?.facilities?.sites ?? []).map((s): MinimapMarker => ({ id: s.id, x: s.x, z: s.z, kind: 'facility', label: `${s.name} · ${facilityStatus(s)}`, side: s.owner === PLAYER_FACTION ? 'ally' : s.owner ? 'enemy' : 'neutral', inactive: s.health === 0, active: !!s.action })),
        ...contactMarkers(mapContactRange),
      ],
    });
  };
  /** Share the scene's visibility checks, including allies, at HUD update cadence. */
  const contactMarkers = (range: number): MinimapMarker[] => {
    if (!options.arena || !hud.arenaSelf) return [];
    const clouds: MinimapCloud[] = [];
    const time = Math.max(hud.arena?.elapsed ?? 0, eventClock);
    for (const event of hud.arena?.events ?? []) {
      const age = time - event.start;
      for (const payload of combatTimeline(event)) if (payload.type === 'cloud' && age >= payload.from && age <= payload.until) {
        clouds.push({ x: payload.center.x, z: payload.center.z, radius: payload.radius, ground: footMovement.supportHeight(payload.center.x, payload.center.z, 160, .1, .1) ?? 0 });
      }
    }
    for (const e of activeGrenadeEvents()) for (const p of grenadePayloads(e)) if (p.type === 'cloud' && time - e.start <= p.until && itemById(e.id)?.grenade?.effects.some(effect => effect.kind === 'cloud' && effect.blocksSight !== false)) clouds.push({ x: e.point.x, z: e.point.z, radius: p.radius, ground: e.point.y });
    return combatMinimapMarkers(camera, world.scene, hud.arenaSelf, hud.arena?.actors ?? [], combatSubjects(true), clouds, range);
  };
  const clearInput = () => { stopInspect(); keyboardCrouch.clear(); prone = false; keys.clear(); trigger = false; pullBuffer = 0; triggerSpent = false; Object.assign(sprintBreak, createSprintBreak()); wasSprinting = stickRunning = false; ads = false; touchAim = false; drag = null; moveStick = null; foodKeyAt = null; grenadeKeyAt = null; grenadeFireHeld = false; grenadePicker = null; if (grenadeHeld?.pinned && !disposed) releaseGrenade(); else grenadeHeld = null; resetMovementMotion(bodyMotion, eyeHeight()); handling.forEach(model => model.resetBipod()); };
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
    if (!['playing', 'deploying'].includes(hud.phase)) return;
    hud.phase = 'paused'; clearInput(); stopVoice(); encik.clear(); hud.encikCallout = null; wheel = null; hud.calloutWheel = null; foodPicker = null; hud.foodPicker = null;
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
      sfx.load(audio);
      void audio.resume().catch(() => {});
    } catch { hud.muted = true; }
  }
  /** Our own shot, at the ear: the gun in hand, or the vehicle's when seated. */
  function shotSound(gun: { caliberMm: number; damage: number; accessories?: WeaponSpec['accessories'] }) { gunshots.fire(gunshotTone(gun.caliberMm, gun.damage, 0, true, gun.accessories?.muzzle)); }
  /** Where a sound sits between the ears, from -1 (left) to 1 (right). */
  function panTo(at: { x: number; y: number; z: number }) {
    const toward = new THREE.Vector3(at.x, at.y, at.z).sub(camera.position), right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const length = toward.length(); return length < .5 ? 0 : toward.dot(right) / length * .8;
  }
  /** Someone else's shot from `at`, heard after its travel time and `after` seconds more. */
  function otherShot(at: { x: number; y: number; z: number }, calibre: number, power: number, after = 0, muzzle?: MuzzleDevice) {
    const distance = camera.position.distanceTo(new THREE.Vector3(at.x, at.y, at.z));
    if (distance <= 80) pilotGunfireUntil = Math.max(pilotGunfireUntil, performance.now() / 1000 + Math.max(0, after) + .25);
    gunshots.fire(gunshotTone(calibre, power, distance, false, muzzle), panTo(at), after);
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
  /** One recorded take straight to the speakers, a hair off pitch and level so repeats don't sound looped. Null when none has loaded. */
  function playTake(group: SfxGroup, level: number, options: { rate?: number; cutoff?: number; pan?: number } = {}) {
    const take = audio && sfx.pick(group); if (!audio || !take) return false;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain(), panner = audio.createStereoPanner();
    source.buffer = take; source.playbackRate.value = (options.rate ?? 1) * (.95 + Math.random() * .1);
    filter.type = 'lowpass'; filter.frequency.value = options.cutoff ?? 16000; gain.gain.value = level * (.88 + Math.random() * .24); panner.pan.value = options.pan ?? 0;
    source.connect(filter).connect(gain).connect(panner).connect(audio.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); };
    return true;
  }
  const HANDLING_TAKES: Record<string, [SfxGroup, number]> = { 'MAG OUT': ['mag-out', .2], 'MAG IN': ['mag-in', .22], 'SEAT MAG': ['mag-seat', .28], 'BOLT BACK': ['bolt-back', .24], CHAMBER: ['bolt-release', .3] };
  function handlingSound(stage: string) {
    if (!audio || !soundBuffer || hud.muted || audio.state !== 'running') return;
    const recorded = HANDLING_TAKES[stage]; if (recorded && playTake(...recorded)) return;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    // The rack back is a long scrape and the release a sharp, loud slam.
    source.buffer = soundBuffer; source.playbackRate.value = stage === 'MAG IN' ? .65 : stage === 'BOLT BACK' ? .8 : stage === 'CHAMBER' ? 1.7 : 1.4;
    filter.type = 'bandpass'; filter.frequency.value = stage === 'CHAMBER' ? 2300 : stage === 'BOLT BACK' ? 1600 : 1000; filter.Q.value = .7;
    gain.gain.value = stage === 'MAG IN' ? .16 : stage === 'CHAMBER' ? .2 : stage === 'BOLT BACK' ? .12 : .09;
    source.connect(filter).connect(gain).connect(audio.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  /** A switch click, and on a tube the rising whine of its power supply. */
  function visionSound(step: 'on' | 'off' | 'palette', kind: VisionKind) {
    if (!audio || !soundBuffer || hud.muted || audio.state !== 'running') return;
    const context = audio, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = soundBuffer; source.playbackRate.value = step === 'palette' ? 2.4 : 1.9;
    filter.type = 'highpass'; filter.frequency.value = 2400; gain.gain.value = step === 'off' ? .05 : .07;
    source.connect(filter).connect(gain).connect(context.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    if (step !== 'on' || kind !== 'nvg') return;
    const whine = context.createOscillator(), level = context.createGain(), at = context.currentTime;
    whine.type = 'sine'; whine.frequency.setValueAtTime(5200, at); whine.frequency.exponentialRampToValueAtTime(11500, at + .9);
    level.gain.setValueAtTime(.0001, at); level.gain.exponentialRampToValueAtTime(.012, at + .25); level.gain.exponentialRampToValueAtTime(.0001, at + 1.4);
    whine.connect(level).connect(context.destination); whine.start(at); whine.stop(at + 1.45);
    whine.onended = () => { whine.disconnect(); level.disconnect(); };
  }
  let stepSide = 1;
  function movementSound(strength: number, landing = false) {
    if (!audio || !soundBuffer || hud.muted || audio.state !== 'running') return;
    // Recorded boots on concrete, alternating feet. Quiet steps lose their heel strike; a landing is a lower, heavier step.
    stepSide = -stepSide;
    if (playTake(!landing && strength > .5 ? 'run' : 'walk', strength * (landing ? .4 : .24), { rate: landing ? .8 : 1, cutoff: landing ? 1800 : 1500 + strength * 9000, pan: landing ? 0 : stepSide * .1 })) return;
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
    if (disposed || conditions.deafened || !['playing', 'complete', 'defeated'].includes(hud.phase)) return;
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
  function chooseDeployment(choice: string) {
    if (disposed || hud.phase !== 'ready' || deploymentResolved || hud.arenaStarted || !deploymentPoints.length) return false;
    if (choice === 'random') { deploymentChoice = choice; resolvedDeployment = null; hud.message = ''; publish(); return true; }
    const point = deploymentPoints.find(p => p.id === choice);
    if (!point || !arenaRuntime?.selectDeployment(point.id)) { hud.message = 'That entry point is blocked. Choose another location.'; publish(); return false; }
    deploymentChoice = choice; resolvedDeployment = point.id;
    position = { x: point.x, z: point.z }; yaw = point.yaw; pitch = point.pitch; vertical = velocityY = 0;
    hud.message = ''; updateCameras(0, false, false); publish(); return true;
  }
  function zoomDeployment(factor: number) {
    if (!overviewActive() || !Number.isFinite(factor) || factor <= 0) return;
    overviewZoom = THREE.MathUtils.clamp(overviewZoom * factor, 1, 4); updateCameras(0, false, false); publish();
  }
  function resetDeploymentView() {
    if (!overviewActive()) return;
    overviewZoom = 1; overviewPan = { x: 0, z: 0 }; updateCameras(0, false, false); publish();
  }
  function deployInitially() {
    if (deploymentResolved || !deploymentPoints.length) return true;
    for (const point of deploymentOrder(deploymentPoints, deploymentChoice)) if (arenaRuntime?.selectDeployment(point.id)) {
      position = { x: point.x, z: point.z }; yaw = point.yaw; pitch = point.pitch; vertical = velocityY = 0;
      deploymentResolved = true; resolvedDeployment = point.id; updateCameras(0, false, false); return true;
    }
    capturePending = false; hud.message = 'No clear deployment at that point. Choose another entry.';
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    publish(); return false;
  }
  function enterPlay() {
    if (disposed || !['ready', 'paused'].includes(hud.phase)) return;
    if (!pilotEnabled && inputMode === 'mouse' && document.pointerLockElement !== canvas) { captureFailed(); return; }
    if (!deployInitially()) return;
    capturePending = false; hud.message = ''; lastTime = performance.now(); clearInput(); canvas.focus(); initAudio();
    if (introEligible && !deploymentIntro.begun) {
      deploymentIntro.begin(!!motionPreference?.matches, {
        height: camera.position.y - (vertical + eyeHeight()), x: camera.position.x - position.x, z: camera.position.z - position.z,
        yaw: Math.atan2(Math.sin(-yaw), Math.cos(-yaw)), fov: camera.fov,
      });
      const conditions = atmosphere.conditions, minutes = Math.floor(conditions.hour * 60) % 1440;
      deploymentConditions = { time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, weather: WEATHER[conditions.weather].name };
      // Cast down onto roof faces, excluding the local body/effects and ground below the eye.
      const roofRay = new THREE.Raycaster(new THREE.Vector3(position.x, vertical + eyeHeight() + 180, position.z), new THREE.Vector3(0, -1, 0), .1, 179.6);
      deploymentRoof = firstVisibleHit(roofRay, gameplayCandidates())?.point.y ?? null;
    }
    hud.phase = deploymentIntro.active ? 'deploying' : 'playing';
    if (hud.phase === 'playing') radioCall('start');
    updateCameras(0, false, false); publish();
  }
  function finishDeployment() {
    if (hud.phase !== 'deploying') return;
    deploymentIntro.skip(); clearInput(); hud.phase = 'playing';
    updateCameras(0, false, false); canvas.focus({ preventScroll: true }); radioCall('start'); publish();
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
  function stopInspect() { inspectElapsed = null; hud.inspecting = false; }
  /** K: a cosmetic look over both sides, available whenever the infantry weapon is idle. */
  function inspectWeapon() {
    if (pilotEnabled || hud.phase !== 'playing' || hud.health <= 0 || hud.arenaSelf?.alive === false || vehicles.active || supplyUse || grenadeHeld || loadout[hud.weapon].reloadRemaining > 0 || ads || touchAim || trigger || pullBuffer > 0 || wasSprinting) return;
    if (hud.inspecting) stopInspect();
    else { inspectElapsed = 0; hud.inspecting = true; cantWanted = false; }
    canvas.focus({ preventScroll: true }); publish();
  }
  function reload() {
    if (grenadeHeld || arenaConditionModifiers(conditions).frozen) return;
    stopInspect();
    if (hud.phase === 'playing') canvas.focus({ preventScroll: true });
    if (hud.phase === 'playing' && supplyUse) endSupply();
    if (hud.phase === 'playing' && (!options.arena || hud.arenaSelf?.alive) && (!vehicles.active || vehicles.canUseFirearm) && beginReload(loadout[hud.weapon], hud.weapon, specs)) {
      emptyReload[hud.weapon] = loadout[hud.weapon].reloadEmpty === true;
      reloadGate = armReloadGate(trigger, sprintIntent); pullBuffer = 0;
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
    if (grenadeHeld?.pinned) return;
    if (grenadeHeld) { grenadeHeld = null; publish(); }
    if (hud.phase === 'deploying' || deploymentIntro.active || hud.phase === 'loading' || hud.phase === 'error' || index === hud.weapon || !validWeaponIndex(index) || !equipment.carriedFamilies.includes(index)) return;
    stopInspect(); stopReload(); endSupply();
    trigger = false; pullBuffer = 0; triggerSpent = false; ads = false; touchAim = false; resetRecoil(kick); cantWanted = false; cant = 0;
    hud.weapon = index; weapons.forEach((w, i) => w.visible = i === index);
    if (hud.phase === 'playing') canvas.focus({ preventScroll: true });
    effects.attachMuzzle(muzzleSocket(weapons[index], FPS_WEAPONS[index].id));
    effects.setStyles(weaponStyles, index); publish();
  }
  function reset() {
    if (hud.phase === 'loading' || hud.phase === 'error') return;
    if (options.arena?.session.role === 'guest') return;
    pilotEnabled = false; pilot.reset(); strategicPlanner?.reset();
    deploymentResolved = false; resolvedDeployment = null; deploymentIntro.reset(); deploymentRoof = null; readySound = 0; overviewZoom = 1; overviewPan = { x: 0, z: 0 };
    arenaRuntime?.reset();
    hud.objectiveHints = false; hud.objectiveMarkers = [];
    capturePending = false; hud.phase = 'ready'; hud.hits = 0; hud.shots = 0; hud.landed = 0; hud.elapsed = 0; hud.message = '';
    localGrenades.reset(); seenGrenadeCues.clear(); grenadeVisuals.reset(); grenadeHeld = null; grenadePicker = null; conditions = {}; grenadeLastAt = missionLastAt = -Infinity;
    combatVisuals.reset(); seenEvents.clear(); openedSupplies.clear(); eventClock = -1; shake = 0; blackout = 0; hud.combatBanner = null; hud.mapDangers = []; hud.mapJammed = false; hud.cloudCover = null;
    hud.health = hud.maxHealth; hud.armor = equipment.armor; hud.incoming = false; hud.hurt = false; hud.earned = 0; hud.earnedXp = 0; hud.lastDamage = 0; hud.callout = ''; hud.chain = 0;
    killChain = { count: 0, lastAt: -Infinity }; calloutTime = 0; stopVoice(); encik.reset(); comms.clear(); hud.encikCallout = null;
    rangeDirector?.reset(Math.floor(Math.random() * 0xffffffff)); rangeEndedEarly = false;
    if (practiceRange) { looted = {}; supplies = { ...equipment.supplies }; }
    roundId = randomRoundId(); attackTimer = 3; pendingAttack = null; hurtTime = 0; hitDirections.clear(); supplyUse = null; foodEffects = {}; foodPicker = null; hud.foodPicker = null;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    vehicles.reset(); loadout = createPooledLoadout(specs, equipment.carriedFamilies); position = { x: spawn.x, z: spawn.z }; yaw = spawn.yaw; pitch = spawn.pitch;
    vertical = velocityY = hitTime = 0; resetRecoil(kick); carry.set(0, 0, 0); clearInput();
    rounds.length = 0; effects.reset();
    aimProgress = 0; bloom.forEach(state => { state.amount = 0; state.delay = 0; });
    targets.forEach(t => { t.health = t.maxHealth; t.bar.scale.x = 1; t.activation = 0; });
    updateRangeTargets();
    updateCameras(0, false, false); publish();
  }
  function interactVehicle() {
    if (grenadeHeld) return;
    if (hud.phase !== 'playing' || hud.arenaSelf?.alive === false || (!vehicles.active && vertical > .35)) return;
    if (arenaRuntime) {
      arenaRuntime.vehicleAction(vehicles.active ? 'exit' : 'enter', vehicles.active ?? vehicles.nearest(position));
      clearInput(); canvas.focus({ preventScroll: true }); return;
    }
    const change = vehicles.interact(position);
    if (change) {
      clearInput(); actualAim = false; stopReload();
      position = { x: change.x, z: change.z }; vertical = change.y; velocityY = 0; resetMovementMotion(bodyMotion, eyeHeight()); resetRecoil(kick); carry.set(0, 0, 0);
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
  /**
   * Radio traffic as either side steps up or stands down, read from the
   * hottest sector in the district: the push you started is what you hear.
   */
  function announceHeat(rows: readonly ArenaHeat[]) {
    if (!rows.length || hud.phase !== 'playing') return;
    // Where a district rests is its normal state, not news: arriving only takes a reading.
    const arriving = heatDistrict !== hud.expeditionZone; heatDistrict = hud.expeditionZone ?? '';
    for (const faction of SQUAD_FACTIONS) {
      const hottest = Math.max(...rows.map(row => row[faction])), steps = HEAT_CALLS[faction];
      const tier = steps.filter(step => hottest >= step.at).length, was = heatTiers[faction];
      if (tier === was) continue;
      heatTiers[faction] = tier;
      if (arriving) continue;
      if (tier > was) comms.add('system', faction === 'mercenaries' ? 'Intel' : 'HQ', steps[tier - 1].up);
      else if (tier === 0 && was >= 2 && steps[0].down) comms.add('system', faction === 'mercenaries' ? 'Intel' : 'HQ', steps[0].down);
    }
  }
  // The loot being looked at, what the pilot can reach, and the card last built for it.
  let focusedLoot: FieldLoot | null = null, reachableLoot: FieldLoot | null = null, cardKey = '', lastCard: LootCard | null = null;
  const lookDirection = new THREE.Vector3();
  function updateExpeditionPrompts() {
    if (!expedition) return;
    const alive = !!hud.arenaSelf?.alive;
    // Crossing into a named place is worth saying once, so the district reads
    // as somewhere with parts rather than as one field of coordinates.
    const here = sectorAt(expedition.zone, position.x, position.z);
    const heat = hud.arena?.heat?.find(row => row.sector === (here?.id ?? ''));
    hud.sectorHeat = heat ? { 'armed-forces': heat['armed-forces'], mercenaries: heat.mercenaries } : null;
    announceHeat(hud.arena?.heat ?? []);
    if ((here?.name ?? '') !== hud.sector) {
      hud.sector = here?.name ?? '';
      if (here && hud.phase === 'playing') comms.add('system', 'Location', `Entering ${here.name}.`);
    }
    const npc = alive && vertical <= .35 && !vehicles.active ? nearestNpc(npcs, position) : null;
    const gateway = alive && !vehicles.active && vertical <= .35 ? findWorldGateway(expedition.zone, position) : null;
    focusedLoot = alive && !vehicles.active ? focusLoot(hud.fieldLoot, { ...position, y: vertical }, camera.position, camera.getWorldDirection(lookDirection)) : null;
    // The pilot does not look where it walks, so it takes whatever is in reach.
    reachableLoot = alive && pilotEnabled ? hud.fieldLoot.filter(item => withinReach(item, { ...position, y: vertical }) && canTake(item))
      .sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z) - Math.hypot(b.x - position.x, b.z - position.z))[0] ?? null : null;
    hud.lootCard = focusedLoot ? cardFor(focusedLoot) : null;
    hud.lootPrompt = hud.lootCard ? `E · ${hud.lootCard.action} ${hud.lootCard.tier} ${hud.lootCard.name}${hud.lootCard.blocked ? ` · ${hud.lootCard.blocked}` : ''}` : '';
    markers?.focus(focusedLoot?.id ?? null);
    hud.npcPrompt = npc && !focusedLoot ? `E · ${npcInteractionPrompt(npc)}` : '';
    hud.travelPrompt = gateway ? `T · Travel to ${getWorldZone(gateway.to).name}` : '';
    if (npc && !greetedNpcs.has(npc.id) && hud.phase === 'playing') {
      greetedNpcs.add(npc.id);
      comms.add('system', npc.name, npc.interaction.kind === 'vendor'
        ? `${npcInteractionPrompt(npc)}.` : `${npc.role}. Come closer if you want to talk.`);
    }
  }
  /** The guns carried, with their reserves, as loose rounds see them. */
  const carriedGuns = (): CarriedGun[] => equipment.carriedFamilies.map(family => ({ family, spec: specs[family], reserve: loadout[family].reserve }));
  /** The family a found gun of `family` puts down: the same reading `pickupSlot` gives the pickup, the slot it fills and what is in it now. */
  function putDownFor(family: number) {
    const slot = pickupSlot(fieldProfile, family, hud.weapon), carry = restoreCarrySlots(fieldProfile.carry, fieldProfile.owned);
    return slot === 'sidearm' ? family : slot === 'extra' ? carry.extra ?? family : carry.main;
  }
  /** Whether E would take an item now: rounds need a gun that fires them, supplies room on the belt. */
  function canTake(loot: FieldLoot) {
    if (loot.kind === 'ammo') return !!ammoTarget(loot.caliberMm, carriedGuns(), hud.weapon);
    if (loot.kind === 'armor') {
      const item = itemById(loot.catalogId ?? '');
      return !!item && !armorPickup(hud.armor, itemById(fieldProfile.plate), item).blocked;
    }
    return loot.kind !== 'medical' || beltRoom(supplies, loot.catalogId ?? '') > 0;
  }
  /** The card over a looked-at item, rebuilt only when the item or what it is weighed against changes. */
  function cardFor(loot: FieldLoot) {
    const key = `${loot.id}|${hud.weapon}|${supplies[loot.catalogId ?? ''] ?? 0}|${carriedGuns().map(gun => gun.reserve).join()}|${fieldProfile.plate}|${hud.armor}|${fieldProfile.guns.map(gun => gun.variant).join()}|${fieldProfile.carry?.main}/${fieldProfile.carry?.extra}`;
    if (key !== cardKey || !lastCard) {
      cardKey = key;
      lastCard = lootCard(loot, {
        weapons: specs, belt: supplies, carried: carriedGuns(), inHand: hud.weapon, plate: itemById(fieldProfile.plate), armor: hud.armor, variantOf: family => fieldProfile.guns[family]?.variant ?? '',
        replaces: putDownFor,
        variantSpec: item => {
          if (item.family === undefined) return null;
          const next = copyProfile(fieldProfile); next.owned = [...new Set([...next.owned, item.id])]; next.guns[item.family].variant = item.id;
          return resolveLoadout(next).weapons[item.family] ?? null;
        },
      });
    }
    return lastCard;
  }
  function interactLoot(action: ArmorPickupAction = 'collect') {
    if (!expedition || hud.phase !== 'playing' || !hud.arenaSelf?.alive || vehicles.active || !arenaRuntime || travelPending) return;
    const target = (focusedLoot && hud.fieldLoot.some(item => item.id === focusedLoot!.id) ? focusedLoot : null) ?? (pilotEnabled ? reachableLoot : null);
    if (!target) return;
    const item = target.catalogId ? itemById(target.catalogId) : undefined;
    if ((target.kind === 'weapon' && (!item || item.category !== 'weapon' || !validWeaponIndex(item.family))) || (target.kind === 'armor' && item?.category !== 'plate')) return;
    if (action === 'swap' && target.kind !== 'armor') return;
    const armorResult = target.kind === 'armor' && item ? armorPickup(hud.armor, itemById(fieldProfile.plate), item, action) : null;
    if (armorResult?.blocked) { hud.lootNotice = `${armorResult.blocked}. ${target.name} stays here.`; lootNoticeTime = 3; publish(); return; }
    // Loose rounds go into the calibre pool shared by matching carried guns.
    if (target.kind === 'ammo') {
      const gun = ammoTarget(target.caliberMm, carriedGuns(), hud.weapon);
      if (!gun) { hud.lootNotice = `${ammoBlocked(target.caliberMm, carriedGuns(), hud.weapon)}. ${target.name} stay here.`; lootNoticeTime = 3; publish(); return; }
      const taken = expedition.loot.collect(expedition.zone, target.id, { ...position, y: vertical }); if (!taken) return;
      const added = addReserveRounds(loadout[gun.family], taken.amount);
      hud.lootNotice = `+${added} ${taken.name} · ${specs[gun.family].caliberMm} mm reserve`;
      comms.add('system', 'Supplies', hud.lootNotice); radioCall('pickup');
      markers?.remove(taken.id); hud.fieldLoot = expedition.loot.remaining(expedition.zone); lootNoticeTime = 3;
      updateExpeditionPrompts(); canvas.focus({ preventScroll: true }); publish();
      return;
    }
    // Supplies go on the belt, to be used when they are wanted rather than where they lay.
    if (target.kind === 'medical') {
      if (item?.category !== 'consumable') return;
      const slot = utilitySlot(utilityKind(item) ?? ''), room = beltRoom(supplies, item.id);
      if (!room) { hud.lootNotice = `${slot?.label ?? 'Belt'} slot is full. ${target.name} stays here.`; lootNoticeTime = 3; publish(); return; }
      const taken = expedition.loot.collect(expedition.zone, target.id, { ...position, y: vertical }); if (!taken) return;
      supplies[item.id] = (supplies[item.id] ?? 0) + 1; if (item.grenade) arenaRuntime?.setGrenadeSupplies(supplies); looted[item.id] = (looted[item.id] ?? 0) + 1;
      if (slot && !pickUtility(beltSelected, supplies)) beltSelected = slot.kind;
      hud.lootNotice = `+1 ${item.name} · belt ${slot?.key ?? ''} ${slot?.label ?? ''} (${supplies[item.id]})`;
      comms.add('system', 'Supplies', hud.lootNotice); radioCall('pickup');
      markers?.remove(taken.id); hud.fieldLoot = expedition.loot.remaining(expedition.zone); lootNoticeTime = 3;
      updateExpeditionPrompts(); canvas.focus({ preventScroll: true }); publish();
      return;
    }
    const collected = expedition.loot.collect(expedition.zone, target.id, { ...position, y: vertical }); if (!collected) return;
    if (collected.kind === 'weapon' && item && validWeaponIndex(item.family)) {
      const family = item.family, changed = fieldProfile.guns[family].variant !== item.id, wasCarried = equipment.carriedFamilies.includes(family);
      const previousSpecs = specs, previousCarry = equipment.carriedFamilies;
      const next = copyProfile(fieldProfile); next.owned = [...new Set([...next.owned, item.id])]; next.guns[family].variant = item.id;
      const slot = pickupSlot(next, family, hud.weapon);
      if (slot !== 'sidearm') next.carry = { ...next.carry, [slot]: family };
      fieldProfile = next; equipment = resolveLoadout(fieldProfile); specs = equipment.weapons;
      if (!changed && wasCarried) addReserveRounds(loadout[family], specs[family].capacity);
      else {
        loadout = replacePooledWeapon(loadout, previousSpecs, previousCarry, specs, equipment.carriedFamilies, family);
      }
      arenaRuntime.updateLoadout(fieldProfile);
      undress.splice(0).forEach(dispose => dispose()); weapons.forEach((model, index) => undress.push(dressWeapon(model, specs[index])));
      switchWeapon(family); expedition.onEquipment(copyProfile(fieldProfile));
      hud.lootNotice = !changed && wasCarried ? `+${specs[family].capacity} rounds for ${specs[family].name}.` : `${item.name} equipped for this expedition.`;
    } else if (collected.kind === 'armor' && item && armorResult) {
      if (armorResult.equip) {
        const next = copyProfile(fieldProfile); next.owned = [...new Set([...next.owned, item.id])]; next.plate = item.id;
        fieldProfile = next; equipment = resolveLoadout(fieldProfile); specs = equipment.weapons;
        arenaRuntime.updateLoadout(fieldProfile);
        expedition.onEquipment(copyProfile(fieldProfile));
      }
      arenaRuntime.setVitals({ armor: armorResult.armor }); hud.armor = armorResult.armor;
      hud.lootNotice = armorResult.equip ? `${item.name} equipped · ${Math.ceil(armorResult.armor)} armor.`
        : `+${Math.ceil(armorResult.restored)} armor · ${Math.ceil(armorResult.armor)} / ${equipment.armor} · kept ${equipment.plateName}.`;
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
      equipment = resolveLoadout(fieldProfile); supplies = withLooted(equipment.supplies);
      beltSelected = utilityKind(itemById(npc.interaction.catalogId)) ?? beltSelected;
      hud.credits = fieldProfile.credits; hud.tokens = fieldProfile.tokens;
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
    const checkpoint: FpsCheckpoint = { comms: comms.snapshot(), pilot: pilotEnabled, pilotStrategy: strategyMode, encikVoice: hud.encikVoice, vision: visionState.on, fieldSupplies: { ...looted }, health: hud.health, armor: hud.armor, weapon: hud.weapon, ammoPools: ammoPools(loadout, specs, equipment.carriedFamilies), ammunition: loadout.map(state => ({ ...state, cooldown: 0, reloadRemaining: 0 })) };
    travelPending = true; pause(); expedition.onTravel(transition, checkpoint);
  }
  function jump() {
    if (arenaConditionModifiers(conditions).frozen) return; if (hud.phase === 'playing' && (!options.arena || hud.arenaSelf?.alive)) { canvas.focus({ preventScroll: true }); if (!vehicles.active && stance() === 'stand') bufferJump(bodyMotion); } }
  function setInput(key: string, held: boolean) {
    if (hud.phase !== 'playing' || (options.arena && !hud.arenaSelf?.alive)) return;
    if (key === 'k') { if (held) inspectWeapon(); return; }
    if (key === 'v') { if (held) switchVehicleSeat(); return; }
    if (key === 'z') { if (held && !vehicles.active && grounded()) { if (!prone || footMovement.canOccupy(position.x, vertical, position.z, .38, 1.8)) prone = !prone; keyboardCrouch.clear(); keys.delete('c'); publish(); } return; }
    if (held && !vehicles.active && (key === 'c' || key === 'control') && footMovement.canOccupy(position.x, vertical, position.z, .38, 1.2)) prone = false;
    if (key === 'fire') pullTrigger(held);
    else if (held) keys.add(key); else keys.delete(key);
  }
  /** A fresh press is a new pull, buffered until it fires or `TRIGGER_BUFFER` runs out. */
  function pullTrigger(held: boolean) {
    if (grenadeHeld) {
      if (hud.phase !== 'playing' || arenaConditionModifiers(conditions).frozen) return;
      grenadeFireHeld = held;
      if (held && grenadeHeld.ready >= .35) grenadeHeld.pinned = true;
      else if (!held && grenadeHeld.pinned) releaseGrenade();
      trigger = false; pullBuffer = 0; return;
    }
    if (arenaConditionModifiers(conditions).frozen) return;
    if (held) stopInspect();
    if (held && !trigger) { triggerSpent = false; pullBuffer = TRIGGER_BUFFER; }
    trigger = held; if (!held) triggerSpent = false;
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
    look(travel.dx, travel.dy, true);
  }
  /** Opens the whole-district map over the scene, or folds it back into the corner. */
  function toggleObjectiveHints() {
    if (!expedition || hud.phase !== 'playing' || hud.arenaSelf?.alive === false) return;
    hud.objectiveHints = !hud.objectiveHints; canvas.focus({ preventScroll: true }); publish();
  }
  function toggleMap() { hud.mapExpanded = !hud.mapExpanded; publish(); }
  /**
   * The laser's beam and dot and the torch, from the emitters on the weapon in
   * hand. The viewmodel is drawn in camera space, so an emitter's place there
   * goes through the camera to reach the world. The beam meets the world where
   * the crosshair does, which is where the round goes.
   */
  function updateRail(active: boolean, nightVision = false) {
    const model = weapons[hud.weapon], spec = specs[hud.weapon];
    const emitters = railEmitters(model, spec);
    const devices = fittedWeaponDevices(weaponDevices, spec?.accessories);
    const enabled = active && !supplyUse;
    const laserOn = enabled && devices.laser, lightOn = enabled && devices.light;
    if (emitters.lens) emitters.lens.material.emissiveIntensity = devices.light && emitters.light ? 2.4 : 0;
    canvas.dataset.rail = spec?.accessories?.rail ? `${spec.accessories.rail}:${laserOn || lightOn ? 'on' : 'off'}` : '';
    canvas.dataset.railLaser = String(laserOn); canvas.dataset.railLight = String(lightOn);
    if ((!laserOn && !lightOn) || (!emitters.laser && !emitters.light)) { railEffects.update({ camera }); return; }
    camera.getWorldDirection(railForward);
    let laser: Parameters<typeof railEffects.update>[0]['laser'];
    if (emitters.laser && laserOn) {
      emitters.laser.updateWorldMatrix(true, false);
      camera.localToWorld(emitters.laser.getWorldPosition(railFrom));
      laserRay.set(camera.position, railForward); laserRay.near = .05; laserRay.far = 150;
      const hit = stopAtWater(visibleHits(laserRay, gameplayCandidates(), 1))[0];
      railTo.copy(hit?.point ?? laserRay.ray.at(150, railTo));
      laser = { from: railFrom, to: railTo, hit: !!hit };
    }
    let light: Parameters<typeof railEffects.update>[0]['light'];
    if (emitters.light && lightOn) {
      emitters.light.updateWorldMatrix(true, false);
      light = { from: camera.localToWorld(emitters.light.getWorldPosition(railLight)), direction: railForward };
    }
    railEffects.update({ camera, laser, light, nightVision, dark: atmosphere.light.lighting.shift });
  }
  function railHud(): Pick<FpsHud, 'rail' | 'offsetDot' | 'canted'> {
    const accessories = specs[hud.weapon]?.accessories;
    const devices = fittedWeaponDevices(weaponDevices, accessories);
    return { rail: accessories?.rail ? { kind: accessories.rail, on: devices.laser || devices.light, laserOn: devices.laser, lightOn: devices.light } : null, offsetDot: !!accessories?.offsetDot, canted: cantWanted };
  }
  function visionHud(): FpsHud['vision'] {
    const worn = equipment.vision; if (!worn) return null;
    return { name: worn.name, kind: worn.spec.kind, generation: worn.spec.generation, on: visionState.on, palette: activePalette(visionState, worn.spec),
      palettes: worn.spec.palettes.length, warm: visionState.warm, calibrating: visionState.calibrating > 0 };
  }
  /** N: the worn device on or off. J: the next thermal palette. The touch button walks both (see vision-devices). */
  function useVision(step: 'toggle' | 'palette' | 'button') {
    const spec = equipment.vision?.spec;
    if (!spec || hud.phase !== 'playing') return;
    const was = visionState.on;
    const changed = step === 'toggle' ? (toggleVision(visionState, spec), true) : step === 'palette' ? cycleVisionPalette(visionState, spec) : stepVisionButton(visionState, spec) || was !== visionState.on;
    if (!changed) return;
    visionSound(visionState.on && !was ? 'on' : !visionState.on ? 'off' : 'palette', spec.kind);
    publish();
  }
  /** The touch control switches fitted devices together; PC B/L switches each emitter. */
  function toggleRail() {
    if (hud.phase !== 'playing' || !toggleWeaponRail(weaponDevices, specs[hud.weapon].accessories)) return;
    publish();
  }
  function toggleDevice(device: 'laser' | 'light') {
    if (hud.phase !== 'playing' || !toggleWeaponDevice(weaponDevices, specs[hud.weapon].accessories, device)) return;
    publish();
  }
  function toggleKeyboardCrouch() {
    if (hud.phase !== 'playing' || vehicles.active || hud.arenaSelf?.alive === false) return;
    if (prone) {
      if (!footMovement.canOccupy(position.x, vertical, position.z, .38, 1.2)) return;
      prone = false; keyboardCrouch.clear();
    }
    keyboardCrouch.toggle(); publish();
  }
  function interactFacility() {
    if (!expedition || hud.phase !== 'playing' || !hud.arenaSelf?.alive || vehicles.active || !hud.facilityPrompt || !hud.facility) return;
    arenaRuntime?.facilityAction(hud.facility.id);
  }
  function interactContext() {
    if (canResupply()) { resupplyRange(); return; }
    if (!vehicles.active && hud.facilityPrompt && !focusedLoot) { interactFacility(); return; }
    const npc = !!expedition && !vehicles.active && vertical <= .35 && !!nearestNpc(npcs, position);
    const target = fpsInteractionTarget(!!vehicles.active, !!expedition && !!focusedLoot, npc);
    if (target === 'loot') interactLoot();
    else if (target === 'npc') interactNpc();
    else interactVehicle();
  }
  /** X: roll over onto the offset dot beside a magnified sight, and back. */
  function toggleCant() {
    if (hud.phase !== 'playing' || vehicles.active && !vehicles.canUseFirearm || !specs[hud.weapon].accessories?.offsetDot) return;
    cantWanted = !cantWanted; publish();
  }
  function toggleAim() {
    if (pilotEnabled || hud.phase !== 'playing' || hud.arenaSelf?.alive === false || loadout[hud.weapon].reloadRemaining > 0) return;
    stopInspect(); touchAim = !touchAim; canvas.focus({ preventScroll: true }); publish();
  }
  function toggleVehicleView() {
    if (hud.phase !== 'playing' || !vehicles.active) return;
    vehicleView = firstPersonVehicle() ? 'third-person' : 'first-person';
    ads = touchAim = false; updateCameras(0, false, false); publish();
  }
  const keyboardKeys = ['y', 'tab', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'c', 'z', ' ', 'r', 'k', 'q', 'g', '1', '2', '3', ...UTILITY_SLOTS.map(slot => slot.key), 'e', 'i', 'v', 'l', 'n', 't', 'm', 'h', 'j', 'b', 'x', 'control', 'escape'];
  const keydown = (event: KeyboardEvent) => {
    const key = fpsControlKey(event);
    if (hud.phase === 'deploying' && (key === 'escape' || key === ' ')) {
      event.preventDefault(); if (!event.repeat) { if (key === 'escape') pause(); else finishDeployment(); } return;
    }
    if (!key || hud.phase !== 'playing' || !keyboardKeys.includes(key)) return;
    event.preventDefault();
    if (key === 'y') { if (!event.repeat && !pilotEnabled) openCalloutWheel(); return; }
    // While the wheel is open, Tab turns its page and a number says that slot at once; moving keeps working.
    if (wheel && key === 'tab') { setCalloutPage(wheel.page + (event.shiftKey ? -1 : 1)); return; }
    if (wheel && /^[1-8]$/.test(key)) { const callout = CALLOUT_PAGES[wheel.page].callouts[Number(key) - 1]; if (callout && !event.repeat) sendCallout(callout.id); return; }
    if (key === 'tab') return;
    if (key === 'q') { if (!event.repeat) toggleAim(); return; }
    if (key === 'm') { if (!event.repeat) toggleMap(); return; }
    if (key === 'h') { if (!event.repeat) toggleObjectiveHints(); return; }
    if (key === 'escape') pause();
    else if (pilotEnabled) { pause(); hud.message = 'AI stopped. Click Resume to take control.'; publish(); }
    else if (fpsKeyAction(key, !!vehicles.active)) {
      const action = fpsKeyAction(key, !!vehicles.active)!;
      if (action === 'crouch-hold') {
        keyboardCrouch.hold(event.code || key, true); setInput('control', true);
      } else if (!event.repeat) {
        switch (action) {
          case 'interact': interactContext(); break;
          case 'vision': useVision('toggle'); break;
          case 'palette': useVision('palette'); break;
          case 'light': toggleDevice('light'); break;
          case 'laser': toggleDevice('laser'); break;
          case 'cant': toggleCant(); break;
          case 'seat': switchVehicleSeat(); break;
          case 'vehicle-camera': toggleVehicleView(); break;
          case 'crouch-toggle': toggleKeyboardCrouch(); break;
          case 'prone': setInput('z', true); break;
          case 'inspect': inspectWeapon(); break;
        }
      }
    }
    else if (key === 'i') { if (!event.repeat && focusedLoot?.kind === 'armor') interactLoot('swap'); }
    else if (key === 't') { if (!event.repeat) travelZone(); }
    else if (key === 'r') reload();
    else if (key === 'g') { if (!event.repeat) useQuickItem(); }
    // The food key eats on release, so holding it can open the picker instead.
    else if (utilitySlotForKey(key)?.kind === 'grenade') { if (!event.repeat) grenadeKeyAt = performance.now(); }
    else if (utilitySlotForKey(key)?.kind === 'food') { if (!event.repeat) foodKeyAt = performance.now(); }
    else if (utilitySlotForKey(key)) { if (!event.repeat) useUtility(utilitySlotForKey(key)!.kind); }
    else if (/^[1-3]$/.test(key)) switchWeapon(equipment.carriedFamilies[Number(key) - 1]);
    else if (key === ' ') { if (vehicles.active) keys.add(' '); else if (!event.repeat) jump(); }
    else keys.add(key);
  };
  const pilotEscape = (event: KeyboardEvent) => { if (pilotEnabled && event.key === 'Escape') { event.preventDefault(); pause(); } };
  const keyup = (event: KeyboardEvent) => {
    const key = fpsControlKey(event, true); if (!key) return;
    if (key === 'control') {
      keyboardCrouch.hold(event.code || key, false);
      if (!keyboardCrouch.holding) keys.delete(key);
    } else keys.delete(key);
    if (key === '9') releaseGrenadeKey();
    if (key === 'y') closeCalloutWheel(true);
    if (utilitySlotForKey(key)?.kind === 'food') releaseFoodKey();
  };
  /** With the wheel open, the scroll wheel turns its page. */
  const scrollWheel = (event: WheelEvent) => { if (overviewActive()) { event.preventDefault(); zoomDeployment(Math.exp(-event.deltaY * .0015)); return; } if (!wheel) return; event.preventDefault(); if (Math.abs(event.deltaY) > 4) setCalloutPage(wheel.page + Math.sign(event.deltaY)); };
  const pointerSource = (event: PointerEvent) => {
    lastPointerType = event.pointerType;
    if (hud.phase === 'playing' && inputMode === 'touch' && requiresFpsPointerLock(event.pointerType)) {
      inputMode = 'mouse'; pause();
      hud.message = 'Mouse detected. Click Resume to capture it; Escape opens the menu.'; publish();
    }
  };
  /** `assisted` marks a thumb's drag, which the aim assist may bend; the mouse and the pilot are never helped. */
  const look = (dx: number, dy: number, assisted = false) => {
    if (hud.phase !== 'playing' || arenaConditionModifiers(conditions).frozen) return;
    const wasYaw = yaw, wasPitch = pitch;
    ({ yaw, pitch } = turnFpsLook(yaw, pitch, dx, dy, ads || touchAim));
    const contact = assisted ? assistContact() : null;
    if (contact) {
      const bent = assistLook(yaw - wasYaw, pitch - wasPitch, wasPitch, contact, trigger);
      yaw = wasYaw + bent.yaw; pitch = clampFpsPitch(wasPitch + bent.pitch);
    }
    // Pulling down pays off the climb instead of banking it, so compensating a
    // burst and then releasing does not drag the sights under the target.
    compensateRecoil(kick, pitch - wasPitch, yaw - wasYaw);
  };
  // With the callout wheel open the mouse points at a slot instead of turning the view.
  const mousemove = (event: MouseEvent) => { if (!pilotEnabled && document.pointerLockElement === canvas) { if (wheel) pointCalloutWheel(event.movementX, event.movementY); else if (grenadePicker) pointGrenadePicker(event.movementX, event.movementY); else if (foodPicker) pointFoodPicker(event.movementX, event.movementY); else look(event.movementX, event.movementY); } };
  // Pointer events only report the first press and final release of a mouse chord.
  // Mouse events report each button independently, including LMB while RMB is held.
  const mousedown = (event: MouseEvent) => {
    if (pilotEnabled || hud.phase !== 'playing' || document.pointerLockElement !== canvas) return;
    // A click on the open wheel says the slot (left) or puts the wheel away (right); it never fires.
    if (wheel) { closeCalloutWheel(event.button === 0); return; }
    // The same on the food picker: left picks the food pointed at, right keeps the old pick.
    if (grenadePicker) { closeGrenadePicker(event.button === 0); grenadeKeyAt = null; return; }
    if (foodPicker) { closeFoodPicker(event.button === 0); foodKeyAt = null; return; }
    if (event.button === 0) pullTrigger(true);
    if (event.button === 2) { stopInspect(); ads = true; }
  };
  const mouseup = (event: MouseEvent) => {
    if (pilotEnabled || document.pointerLockElement !== canvas) return;
    if (event.button === 0) pullTrigger(false);
    if (event.button === 2) ads = false;
  };
  const pointerdown = (event: PointerEvent) => {
    if (overviewActive() && event.button === 0) {
      event.preventDefault(); canvas.setPointerCapture(event.pointerId); overviewDrag = { id: event.pointerId, x: event.clientX, y: event.clientY }; return;
    }
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
    if (overviewActive() && overviewDrag?.id === event.pointerId) {
      const scale = overviewView().metresPerPixel;
      overviewPan.x = THREE.MathUtils.clamp(overviewPan.x - (event.clientX - overviewDrag.x) * scale, -(world.bounds.maxX - world.bounds.minX) / 2, (world.bounds.maxX - world.bounds.minX) / 2);
      overviewPan.z = THREE.MathUtils.clamp(overviewPan.z - (event.clientY - overviewDrag.y) * scale, -(world.bounds.maxZ - world.bounds.minZ) / 2, (world.bounds.maxZ - world.bounds.minZ) / 2);
      overviewDrag.x = event.clientX; overviewDrag.y = event.clientY; updateCameras(0, false, false); publish(); return;
    }
    if (document.pointerLockElement === canvas || !drag || event.pointerId !== drag.id) return;
    // The scene is the look surface on a touchscreen: a drag anywhere the thumb
    // layer is not turns the camera, at the gain a thumb needs rather than a mouse's.
    const travel = dragLook(event.clientX - drag.x, event.clientY - drag.y);
    look(travel.dx, travel.dy, true); drag.x = event.clientX; drag.y = event.clientY;
  };
  const pointerup = (event: PointerEvent) => {
    if (overviewDrag?.id === event.pointerId) overviewDrag = null;
    if (drag?.id === event.pointerId) drag = null;
  };
  // A look drag ending on the glass is not the trigger letting go: the fire
  // button may still be held under the other thumb.
  const releasePointer = (event: PointerEvent) => {
    if (overviewDrag?.id === event.pointerId) overviewDrag = null;
    if (drag?.id === event.pointerId) drag = null;
    if (event.pointerType !== 'touch') { trigger = false; pullBuffer = 0; triggerSpent = false; ads = false; }
  };
  const lockchange = () => {
    const locked = document.pointerLockElement === canvas;
    if (locked && capturePending) enterPlay();
    else if (locked && !['playing', 'deploying'].includes(hud.phase)) document.exitPointerLock();
    if (!locked && !pilotEnabled && (!expedition || hud.arenaSelf?.alive !== false) && ['playing', 'deploying'].includes(hud.phase) && (wasLocked || inputMode === 'mouse')) pause(); wasLocked = locked; publish();
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
  canvas.addEventListener('mousedown', mousedown); window.addEventListener('mouseup', mouseup); canvas.addEventListener('wheel', scrollWheel, { passive: false });
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
  /** Everything the player may shoot at right now, as the pilot's sensor and the thumb's aim assist both see it. */
  function combatSubjects(includeAllies = false): PilotSubject[] {
    const subjects: PilotSubject[] = [];
    if (options.arena) {
      // Read rendered avatars here, never hand the authoritative actor list to a policy.
      // Articulated avatars publish their chest and face; a falling body is not a target.
      for (const root of world.scene.children) if (root.visible && typeof root.userData.arenaActorId === 'string' && !root.userData.arenaDown && (includeAllies || !root.userData.arenaFriendly)) {
        const named = ['avatar-aim-chest', 'avatar-aim-head'].map(name => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()));
        subjects.push({ id: root.userData.arenaActorId, root, radius: .3, points: named.every(Boolean) ? named as THREE.Vector3[] : [1.15, 1.62].map(y => root.localToWorld(new THREE.Vector3(0, y, 0))) });
      }
    } else for (let i = 0; i < targets.length; i++) if (targets[i].alive) {
      subjects.push({ id: `target-${i}-${targets[i].activation}`, root: targets[i].root, radius: .24, points: [targets[i].hitZone.getWorldPosition(new THREE.Vector3())] });
    }
    const now = arenaRuntime ? hud.arena?.elapsed ?? 0 : localGrenades.clock;
    return subjects.map(subject => ({ ...subject, points: subject.points.filter(p => !grenadeSmokeBetween(activeGrenadeEvents(), now, camera.position, p)) })).filter(subject => subject.points.length > 0);
  }
  function observePilot(time: number): PilotObservation {
    const subjects = combatSubjects();
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
    const waypoints: PilotObservation['waypoints'][number][] = expedition ? hud.fieldLoot.filter(item => Math.abs((item.y ?? 0)-vertical)<1.2 && canTake(item)).map(item => ({ id: item.id, x: item.x, z: item.z, kind: item.kind })) :
      options.arena ? [] : targets.flatMap((target, i) => target.alive ? [{ id: `target-${i}-${target.activation}`, ...targetPositions[i], kind: 'target' as const }] : []);
    if (rangeStation && state.reserve < 20) waypoints.push({ id: 'range-resupply', x: rangeStation.point.x, z: rangeStation.point.z, kind: 'ammo' });
    if (expedition && pilotDestination) {
      const gateway = findWorldRoute(expedition.zone, pilotDestination)[0];
      if (gateway) waypoints.push({ id: gateway.id, ...gateway.position, kind: 'checkpoint' });
    }
    return { time, alive: hud.arenaSelf?.alive !== false, health: hud.health, maxHealth: hud.maxHealth, armor: hud.armor,
      ...(vertical > .35 && !vehicles.active ? { vehiclePrompt: '' } : {}), magazine: roundReady(state, specs[hud.weapon]) ? state.magazine : 0, reserve: state.reserve, reloading: state.reloadRemaining > 0, aiming: actualAim, weapon: hud.weapon, availableWeapons: equipment.carriedFamilies.filter(index => loadout[index].magazine > 0 || loadout[index].reserve > 0),
      position: { x: position.x, z: position.z }, yaw, pitch,
      contacts: visiblePilotContacts(camera, world.scene, subjects, screenBlocked), waypoints, ballistics: specs[hud.weapon].ballistics,
      supplies: PILOT_HEALING_KINDS.flatMap(kind => {
        const item = pickUtility(kind, supplies, { health: hud.health, maxHealth: hud.maxHealth }, foodChoice);
        return item?.effect?.health ? [{ kind, health: item.effect.health, seconds: supplyProfile(item).seconds }] : [];
      }), grenades: activeGrenades().filter(g => !conditions.deafened && Math.hypot(g.position.x - position.x, g.position.z - position.z) <= grenadeDangerRadius(itemById(g.id)!.grenade!) + 2).map(g => ({ x: g.landing.x, z: g.landing.z, radius: grenadeDangerRadius(itemById(g.id)!.grenade!) + 2, remaining: g.remaining })), usingSupply: !!supplyUse,
      underThreat: hud.incoming || hurtTime > 0 || time < pilotGunfireUntil || hud.cloudCover?.kind === 'gas' || hud.mapDangers.some(d => d.kind !== 'crate' && Math.hypot(d.x - position.x, d.z - position.z) <= d.radius + 8),
      lootPrompt: canResupply() && state.reserve < 20 ? 'E · Range resupply' : reachableLoot ? `E · ${reachableLoot.tier} ${reachableLoot.name}` : '', travelPrompt: hud.travelPrompt };
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
      if (action.cancelSupply) endSupply();
      if (action.callout) radioCall(action.callout);
      for (const [key, held] of [['w', action.forward], ['s', action.backward], ['a', action.left], ['d', action.right], ['shift', action.sprint], ['c', action.crouch]] as const) setInput(key, held === true);
      setInput('fire', action.fire === true);
      look(action.lookX ?? 0, action.lookY ?? 0);
      touchAim = action.aim === true; ads = false;
      if (action.weapon !== undefined) switchWeapon(action.weapon);
      prone = specs[hud.weapon].requiresMount === true && action.fire === true && grounded();
      if (action.reload) reload();
      if (action.jump) jump();
      if (action.useSupply) useUtility(action.useSupply);
      if (action.interact) expedition ? interactLoot() : interactContext();
      if (action.travel) travelZone();
    } catch {
      pause(); hud.message = 'AI pilot stopped because its controller failed. You can resume manually.'; publish();
    }
  }

  /**
   * The figure the thumb's aim assist is working on. Which one, and whether it
   * can be seen, is settled a few times a second, because the sight check
   * raycasts the scene; where it is relative to the aim is recomputed on every
   * drag, from its root, so a moving figure is followed between checks.
   */
  let assistLock: { root: THREE.Object3D; offset: THREE.Vector3; radius: number } | null = null, assistTimer = 0;
  const assistFrame = new THREE.Object3D(), assistPoint = new THREE.Vector3();
  /** The angles from the aim itself — yaw and pitch, not the rendered camera, which carries the view kick. */
  function aimContact(point: THREE.Vector3, radius: number) {
    assistFrame.position.copy(camera.position); assistFrame.rotation.set(pitch, yaw, 0, 'YXZ'); assistFrame.updateMatrixWorld(true);
    const local = assistFrame.worldToLocal(assistPoint.copy(point)), distance = local.length();
    if (distance < .1) return null;
    return { yawError: Math.atan2(-local.x, -local.z), pitchError: Math.atan2(local.y, Math.hypot(local.x, local.z)), angularRadius: Math.atan(radius / distance), distance };
  }
  function assistContact() {
    const lock = assistLock;
    if (!lock || !lock.root.visible || lock.root.userData.arenaDown) return null;
    return aimContact(lock.root.localToWorld(assistPoint.copy(lock.offset)), lock.radius);
  }
  function refreshAimAssist(dt: number) {
    assistTimer -= dt; if (assistTimer > 0) return;
    assistTimer = .1; assistLock = null; canvas.dataset.aimAssist = '';
    if (inputMode !== 'touch' || pilotEnabled || vehicles.mounted || !getAimAssist()) return;
    // One subject per aim point, so the lock lands on the point that can be seen
    // (a head over a wall, not the chest behind it). Only points already near
    // the sights are raycast at all.
    const near: PilotSubject[] = [];
    for (const subject of combatSubjects()) for (const point of subject.points) {
      const contact = aimContact(point, subject.radius);
      if (contact && contact.distance <= ASSIST_RANGE && Math.hypot(contact.yawError, contact.pitchError) < assistCone(contact.angularRadius))
        near.push({ id: `${near.length}`, root: subject.root, radius: subject.radius, points: [point] });
    }
    if (!near.length) return;
    let best: { subject: PilotSubject; score: number } | null = null;
    for (const seen of visiblePilotContacts(camera, world.scene, near)) {
      const subject = near[Number(seen.id)], contact = aimContact(subject.points[0], subject.radius);
      const score = contact ? Math.hypot(contact.yawError, contact.pitchError) / assistCone(contact.angularRadius) : Infinity;
      if (!best || score < best.score) best = { subject, score };
    }
    if (best) assistLock = { root: best.subject.root, offset: best.subject.root.worldToLocal(best.subject.points[0].clone()), radius: best.subject.radius };
    canvas.dataset.aimAssist = assistLock ? 'locked' : '';
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
  function updateVehicleCamera(dt: number) {
    const v = vehicles.viewMounted; if (!v) return;
    if (firstPersonVehicle()) {
      const eye = seatPoint(v, vehicles.seat ?? 0);
      if (vehicles.canFire) {
        const offset = v.kind === 'car' ? -.45 : -1.7;
        eye.x = v.x + Math.sin(v.yaw) * offset; eye.z = v.z + Math.cos(v.yaw) * offset;
        eye.y = v.y + (v.kind === 'car' ? 2.72 : .9);
      }
      camera.position.set(eye.x, eye.y, eye.z); camera.rotation.set(pitch, yaw, 0, 'YXZ');
    } else {
      const target = new THREE.Vector3(v.x, v.y + 1.65, v.z), distance = v.kind === 'car' ? 8.5 : 13;
      const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const wanted = target.clone().addScaledVector(direction, distance); wanted.y = Math.max(.7, wanted.y);
      const offset = wanted.clone().sub(target); chaseRay.set(target, offset.clone().normalize()); chaseRay.near = .2; chaseRay.far = offset.length();
      // Riders and other figures are not camera obstacles: a nearby head used
      // to pull the chase camera into the cab on alternating frames.
      const obstruction = firstVisibleHit(chaseRay, world.scene.children.filter(o => o !== vehicles.root && !o.userData.fpsEffect && !o.userData.arenaActorId));
      camera.position.copy(obstruction ? target.clone().addScaledVector(offset.normalize(), Math.max(.5, obstruction.distance - .4)) : wanted);
      camera.lookAt(target);
    }
    camera.fov = THREE.MathUtils.damp(camera.fov, (ads || touchAim) && !vehicles.canUseFirearm ? 48 : 68, 8, dt);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    canvas.dataset.vehicleView = firstPersonVehicle() ? 'first-person' : 'third-person';
    canvas.dataset.vehicleCamera = JSON.stringify({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
  }
  function updateCameras(dt: number, moving: boolean, sprinting: boolean) {
    // Combat and movement always take priority over this local cosmetic action.
    if (inspectElapsed !== null) {
      if (hud.phase !== 'playing' || hud.health <= 0 || hud.arenaSelf?.alive === false || vehicles.active || supplyUse || grenadeHeld || loadout[hud.weapon].reloadRemaining > 0 || ads || touchAim || trigger || sprinting) stopInspect();
      else {
        inspectElapsed += dt;
        if (inspectElapsed >= INSPECT_DURATION) stopInspect();
      }
    }
    canvas.dataset.inspectProgress = inspectElapsed === null ? '' : (inspectElapsed / INSPECT_DURATION).toFixed(3);
    playerBody.root.visible = false;
    camera.far = 800; overview.update(overviewActive(), deploymentChoice);
    if (overviewActive()) {
      const view = overviewView();
      camera.position.set(view.x, view.y, view.z); camera.rotation.set(-Math.PI / 2, 0, 0, 'YXZ'); camera.fov = 65; camera.far = view.far;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      actualAim = false; aimProgress = 0; rig.visible = false; supplyHands.update(null, 0); grenadeHands.update(null, 0, 0);
      canvas.dataset.weaponVisible = 'false'; canvas.dataset.deploymentIntro = ''; canvas.dataset.readyAction = '';
      canvas.dataset.deploymentOverview = 'true';
      canvas.dataset.deploymentCamera = JSON.stringify({ x: view.x, y: view.y, z: view.z, pitch: -Math.PI / 2, yaw: 0, fov: 65, ready: null, speed: 0, blur: 0 });
      return;
    }
    canvas.dataset.deploymentOverview = 'false';
    // Bounded camera-relative inertia, driven by angle deltas (not frame rate).
    const yawDelta = Math.atan2(Math.sin(yaw - lastLookYaw), Math.cos(yaw - lastLookYaw));
    lookLagX = THREE.MathUtils.damp(THREE.MathUtils.clamp(lookLagX + yawDelta * .025, -.003, .003), 0, 12, dt);
    lookLagY = THREE.MathUtils.damp(THREE.MathUtils.clamp(lookLagY - (pitch - lastLookPitch) * .025, -.003, .003), 0, 12, dt);
    lastLookYaw = yaw; lastLookPitch = pitch;
    if (vehicles.mounted && !vehicles.canUseFirearm) {
      canvas.dataset.body = JSON.stringify({ visible: false, rig: equipment.rigId, plate: equipment.plateId,
        slots: playerBody.root.userData.magazineSlots, magazines: playerBody.root.userData.magazines });
      actualAim = ads || touchAim; aimProgress = 0; rig.visible = false; supplyHands.update(null, 0);
      updateVehicleCamera(dt); return;
    }
    const aiming = !grenadeHeld && arenaConditionModifiers(conditions).aim > 0 && (ads || touchAim) && !sprinting && loadout[hud.weapon].reloadRemaining === 0 && !supplyUse;
    actualAim = aiming;
    // Heavier carry costs time to settle the sights as well as ground speed.
    aimProgress = THREE.MathUtils.damp(aimProgress, aiming ? 1 : 0, 15 * (aiming ? movement().aimSpeed * aimSpeedScale(foodEffects) * arenaConditionModifiers(conditions).aim : 1), dt);
    const aim = smoothStep(aimProgress);
    rig.visible = (!options.arena || hud.arenaSelf?.alive !== false) && (!vehicles.active || firstPersonVehicle());
    const poseStance = stance(), crouching = poseStance !== 'stand';
    const speed = carry.length(), onGround = grounded();
    const sideSpeed = carry.x * Math.cos(yaw) - carry.z * Math.sin(yaw);
    const forwardSpeed = -carry.x * Math.sin(yaw) - carry.z * Math.cos(yaw);
    playerBody.update(dt, equipment, loadout, {
      x: position.x, y: vertical, z: position.z, yaw, activeFamily: hud.weapon,
      velocity: { x: sideSpeed, z: -forwardSpeed }, turn: dt > 0 ? yawDelta / dt : 0,
      crouch: poseStance === 'crouch' ? 1 : 0, prone: poseStance === 'prone', airborne: !onGround,
      visible: rig.visible && hud.health > 0 && !vehicles.active,
    });
    canvas.dataset.body = JSON.stringify({ visible: playerBody.root.visible, rig: equipment.rigId, plate: equipment.plateId,
      slots: playerBody.root.userData.magazineSlots, magazines: playerBody.root.userData.magazines });
    const step = advanceBodyMotion(bodyMotion, eyeHeight(), poseStance, speed, onGround, sprinting && speed > .2, sideSpeed, forwardSpeed, dt);
    if (step && hud.phase === 'playing' && !conditions.deafened) movementSound(poseStance === 'prone' ? .18 : poseStance === 'crouch' ? .25 : sprinting ? .65 : .4);
    const motionScale = motionPreference?.matches ? 0 : 1;
    const gait = bodyMotion.gait, gaitWeight = bodyMotion.gaitWeight * motionScale;
    const headBob = Math.sin(gait * 2) * (poseStance === 'prone' ? .008 : .012) * gaitWeight * (1 - aim * .85);
    let visualEye = bodyMotion.eye + (bodyMotion.compression + headBob) * motionScale;
    if (!footMovement.canOccupy(position.x, vertical, position.z, .38, visualEye + .05)) visualEye = Math.min(visualEye, eyeHeight());
    camera.position.set(position.x, vertical + visualEye, position.z);
    const view = recoilView(kick), pose = recoilPose(kick);
    camera.rotation.set(pitch + view.pitch + (conditions.dazed ? Math.sin(hud.elapsed * 8) * .018 : 0), yaw + view.yaw, bodyMotion.lean * motionScale * (1 - aim * .9), 'YXZ');
    camera.fov = 65 + bodyMotion.sprint * 6 * (1 - aim) * motionScale;
    if (vehicles.mounted) updateVehicleCamera(dt);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    viewCamera.fov = THREE.MathUtils.lerp(65, 54, aim); viewCamera.updateProjectionMatrix();
    const sway = Math.sin(gait) * (poseStance === 'prone' ? .025 : .014) * gaitWeight * (1 - aim * .94);
    const bodyFollow = (bodyMotion.compression * .35 + bodyMotion.eyeVelocity * -.012) * motionScale * (1 - aim * .8);
    // A laser that is switched off still weighs the gun down, but it no longer shows where the round goes.
    const fitted = specs[hud.weapon].accessories;
    spreadAngle = weaponSpread(bloom[hud.weapon], hud.weapon, aim, crouching, moving) * accessorySpreadScale(fittedWeaponDevices(weaponDevices, fitted).laser ? fitted : { ...fitted, rail: undefined }, aim);
    const spreadPixels = Math.tan(spreadAngle) * canvas.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    hud.crosshairSpread = THREE.MathUtils.damp(hud.crosshairSpread, Math.max(3, spreadPixels), 20, dt);
    const state = loadout[hud.weapon], remaining = state.reloadRemaining / reloadDuration(specs[hud.weapon], emptyReload[hud.weapon]);
    const intro = deploymentIntro.active ? deploymentIntro.frame(vertical + visualEye, pitch, deploymentRoof) : null;
    const readyProgress = intro?.weaponVisible ? intro.ready : undefined;
    if (intro) {
      camera.position.set(position.x + intro.x, intro.height, position.z + intro.z); camera.rotation.set(intro.pitch, yaw + intro.yaw, 0, 'YXZ'); camera.fov = intro.fov; camera.far = Math.max(800, intro.height + 400);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      rig.visible = intro.weaponVisible; playerBody.root.visible = false;
      if (hud.phase === 'deploying' && readyProgress !== undefined) {
        if (readyProgress >= .25 && readySound < 1) { handlingSound('BOLT BACK'); readySound = 1; }
        if (readyProgress >= .66 && readySound < 2) { handlingSound('CHAMBER'); readySound = 2; }
      }
    }
    canvas.dataset.deploymentIntro = hud.phase === 'deploying' ? intro?.stage ?? '' : '';
    canvas.dataset.deploymentCamera = JSON.stringify({ x: camera.position.x, y: camera.position.y, z: camera.position.z, pitch: camera.rotation.x, yaw: camera.rotation.y, fov: camera.fov, ready: readyProgress ?? null, speed: intro?.speed ?? 0, blur: intro?.blur ?? 0 });
    const progress = remaining > 0 ? 1 - remaining : null;
    const motion = readyProgress === undefined ? reloadMotion(progress ?? 0, emptyReload[hud.weapon], handleSide(specs[hud.weapon].id)) : readyMotion(readyProgress, handleSide(specs[hud.weapon].id));
    canvas.dataset.readyAction = readyProgress === undefined ? '' : motion.action.toFixed(3);
    // A supported gun stays low for reloads; hands, magazine and feed cover
    // still perform their complete handling animation around the planted legs.
    const reloadTravel = 1 - (handling[hud.weapon]?.bipodDeployment ?? 0);
    // Canting rolls the weapon over until the offset dot stands upright on the
    // eye line: the eye goes to that sight's point, turned by the same roll.
    const offsetSight = weapons[hud.weapon] ? getWeaponSight(weapons[hud.weapon])?.offset : undefined;
    cant = THREE.MathUtils.damp(cant, cantWanted && offsetSight && remaining <= 0 ? 1 : 0, 14, dt);
    if (cant < .001) cant = 0;
    const roll = offsetSight ? cant * offsetSight.roll : 0;
    const eyeX = offsetSight ? cant * (offsetSight.aimX * Math.cos(roll) - offsetSight.aimHeight * Math.sin(roll)) : 0;
    const eyeY = THREE.MathUtils.lerp(handling[hud.weapon]?.aimHeight ?? .435, offsetSight ? offsetSight.aimX * Math.sin(roll) + offsetSight.aimHeight * Math.cos(roll) : 0, offsetSight ? cant : 0);
    const eyeDepth = THREE.MathUtils.lerp(handling[hud.weapon]?.aimDepth ?? -.47, offsetSight?.aimDepth ?? 0, offsetSight ? cant : 0);
    rig.position.set(THREE.MathUtils.lerp(.20, -eyeX, aim) + sway + motion.x * reloadTravel + lookLagX,
      THREE.MathUtils.lerp(-.32, -eyeY, aim) + Math.abs(sway) - bodyMotion.sprint * .08 + bodyFollow + motion.y * reloadTravel + lookLagY,
      THREE.MathUtils.lerp(-.78, eyeDepth, aim) + pose.push + motion.z * reloadTravel + bodyMotion.surge * motionScale * (1 - aim));
    // The weapon carries the buck, the sideways half of the pattern and the roll
    // that goes with it; the camera only ever takes the view coupling above.
    // `recoilPose` sizes them; aiming in is the only thing damped here, because
    // a shouldered weapon is held against the shooter rather than by the hands.
    rig.rotation.set(pose.pitch * (1 - aim * .8) + bodyMotion.sprint * -.18 + bodyFollow * 1.2 + motion.pitch * reloadTravel,
      motion.yaw * reloadTravel + pose.yaw * (1 - aim * .6), motion.roll * reloadTravel + pose.roll * (1 - aim * .5) + sway * .7 + roll * Math.max(aim, .35));
    const inspection = inspectMotion(inspectElapsed === null ? 0 : inspectElapsed / INSPECT_DURATION);
    // Keep the hands on the weapon; reduced motion uses a smaller turn and lift.
    const inspectScale = motionPreference?.matches ? .25 : 1;
    rig.position.x += inspection.x * inspectScale; rig.position.y += inspection.y * inspectScale; rig.position.z += inspection.z * inspectScale;
    rig.rotation.x += inspection.pitch * inspectScale; rig.rotation.y += inspection.yaw * inspectScale; rig.rotation.z += inspection.roll * inspectScale;
    handling.forEach((model, i) => model.update(i === hud.weapon ? progress : null, emptyReload[i],
      i === hud.weapon ? { prone: prone && hud.phase === 'playing', grounded: onGround, speed, eyeHeight: bodyMotion.eye, dt } : undefined, i === hud.weapon ? readyProgress : undefined));
    // A supply in the hands takes the weapon down and out of view while it is used.
    grenadeHands.update(grenadeHeld?.id ?? null, grenadeHeld?.ready ?? 0, grenadeHeld?.cooked ?? 0);
    if (grenadeHeld) rig.visible = false;
    const weaponDown = supplyHands.update(rig.visible && supplyUse ? supplyUse.profile.style : null, supplyUse ? supplyProgress(supplyUse) : 0, supplyUse?.id);
    if (weaponDown > 0) { rig.position.x += weaponDown * .12; rig.position.y -= weaponDown * .62; rig.rotation.x -= weaponDown * .9; rig.rotation.z -= weaponDown * .35; }
    const visionDown = motionPreference?.matches ? 0 : visionMountPose(visionState.mount).weaponDown;
    rig.position.y -= visionDown * .48; rig.rotation.x -= visionDown * .24;
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
    nightLights.update(lighting, blackout, dt, camera, renderer);
    viewSky.intensity = 2.1 * Math.min(1.25, ambient / .58) * atmosphere.light.skyVisibility;
    viewSky.color.copy(VIEW_SKY).lerp(viewTint.set(lighting.skyFill), lighting.shift);
    viewSky.groundColor.copy(VIEW_GROUND).lerp(viewTint.set(lighting.groundFill), lighting.shift);
    weaponLight.intensity = 2.5 * Math.min(1.25, key / 1.12) * atmosphere.light.moonVisibility;
    weaponLight.color.copy(VIEW_KEY).lerp(viewTint.set(lighting.keyColor), lighting.shift);
    weaponLight.position.set(lighting.key.x, lighting.key.y, lighting.key.z).applyQuaternion(viewQuaternion.copy(camera.quaternion).invert());
    lampLight.intensity = 3.2 * nightLights.lightAt(camera.position);
    lampLight.position.copy(UP).applyQuaternion(viewQuaternion);
    canvas.dataset.sunShadows = String(sunShadows.enabled); canvas.dataset.shadowCasters = String(sunShadows.casters); canvas.dataset.timeOfDay = lighting.elevation.toFixed(1);
    canvas.dataset.nightLights = `${nightLights.level.toFixed(2)}:${nightLights.lamps.length}`;
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
    // Cosmetic rounds touch interpolated figures, equipment and friendly rigs.
    // Only the host's confirmed wound events may produce arena blood.
    if (arenaRuntime && material === 'flesh') return;
    effects.impact(hit.point, normal, kind, energy, style, material);
    if (material === 'flesh') bloodSpatter(hit.point, direction, energy);
  }
  function bloodSpatter(point: THREE.Vector3, direction: THREE.Vector3, energy: number) {
    splatRay.set(point, direction); splatRay.near = .05; splatRay.far = 2.4;
    const behind = visibleHits(splatRay, gameplayCandidates(), 8).find(next => !isWaterHit(next) && impactKind(next) === 'surface' && hitSurface(next) !== 'flesh');
    if (behind) {
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
  function meetWater(hit: THREE.Intersection, direction: THREE.Vector3, energy: number, weapon?: number, look?: ImpactProfile) {
    const normal = surfaceNormal(hit, direction);
    const skip = waterRicochet(direction, normal), profile = look ?? (weapon === undefined ? undefined : weaponStyles[weapon]?.impact);
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
    if (!target?.alive || scale <= 0 || practiceRange && (hud.phase !== 'playing' || rangeDirector?.finished)) return;
    // Falloff reads how far the round actually travelled, which for one in flight
    // is its whole arc rather than the length of its final segment.
    const damage = Math.max(1, Math.round((rawDamage ?? hitDamage(specs[weapon], range, zone)) * scale * damageDealtScale(foodEffects)));
    hud.landed++; hud.lastDamage = Math.min(target.health, damage); target.health = Math.max(0, target.health - damage);
    target.bar.scale.x = target.health / target.maxHealth; hitTime = .20; hud.hitKind = target.health === 0 ? 'kill' : 'hit';
    if (target.health > 0) return;
    if (rangeDirector && !rangeDirector.eliminate(index, target.activation, hud.elapsed)) return;
    target.alive = false; target.root.visible = drillMode !== 'classic'; hud.hits++;
    if (pendingAttack?.target === index) { pendingAttack = null; hud.incoming = false; }
    const chain = registerElimination(killChain, hud.elapsed); killChain = chain; hud.chain = chain.count;
    hud.callout = chain.label; calloutTime = hud.callout ? 2.4 : 0; hud.earnedXp += ELIMINATION_XP; hud.earned += ELIMINATION_CREDITS;
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
  function beginSupply(name: string, id: string, profile: SupplyProfile, apply: () => boolean, fromBelt = false) {
    if (grenadeHeld || arenaConditionModifiers(conditions).frozen || supplyUse || hud.phase !== 'playing' || vehicles.active || hud.health <= 0 || hud.arenaSelf?.alive === false) return false;
    stopInspect(); stopReload(); ads = false; touchAim = false; actualAim = false;
    supplyUse = { ...startSupplyUse(profile), name, id, fromBelt, apply };
    supplyGate = armReloadGate(trigger, sprintIntent); pullBuffer = 0;
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
  const grenadeRay = new THREE.Raycaster();
  function traceGrenade(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
    const origin = new THREE.Vector3(from.x, from.y, from.z), delta = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z), distance = delta.length();
    if (distance < 1e-8) return null;
    grenadeRay.set(origin, delta.normalize()); grenadeRay.near = 0; grenadeRay.far = distance;
    const hit = firstVisibleHit(grenadeRay, gameplayCandidates().filter(o => !o.userData.arenaActorId));
    if (hit) return { point: hit.point, normal: hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : delta.clone().negate() };
    if (to.y < .08) { const t = (from.y - .08) / Math.max(1e-8, from.y - to.y); return { point: { x: from.x + (to.x - from.x) * t, y: .08, z: from.z + (to.z - from.z) * t }, normal: { x: 0, y: 1, z: 0 } }; }
    return null;
  }
  const localGrenades = createGrenadeSystem(traceGrenade, (b: GrenadeBurst) => {
    if (b.blast && ['grenade-red-smoke', 'grenade-oranges'].includes(b.id)) { const hit = traceGrenade({ x: b.point.x, y: 160, z: b.point.z }, { x: b.point.x, y: -10, z: b.point.z }); if (hit) b = { ...b, point: { ...hit.point, y: hit.point.y + .15 } }; }
    if (b.blast) {
      const bodies = targets.flatMap((t, i) => t.alive ? [{ item: i, point: t.hitZone.getWorldPosition(new THREE.Vector3()) }] : []);
      bodies.push({ item: -1, point: new THREE.Vector3(position.x, vertical + eyeHeight() * .6, position.z) });
      for (const hit of resolveBlast(b.point, b.blast, bodies, grenadeClear)) {
        if (hit.item === -1) hurtPlayer(hit.damage, undefined, false, b.shred);
        else damageTarget(hit.item, hud.weapon, 0, undefined, 1 / damageDealtScale(foodEffects), hit.damage);
      }
      for (const kind of ['car', 'helicopter'] as const) { const v = vehicles.states[kind], point = { x: v.x, y: v.y + 1, z: v.z };
        for (const h of resolveBlast(b.point, b.blast, [{ item: kind, point, vehicle: true }], grenadeClear)) vehicles.damage(h.item, h.damage); }
      checkCompletion();
    }
    if (b.id === 'grenade-whistle') return;
    const here = { x: position.x, y: vertical + eyeHeight(), z: position.z }, d = Math.hypot(here.x - b.point.x, here.y - b.point.y, here.z - b.point.z);
    if (d <= (b.radius ?? b.blast?.radius ?? 0) && grenadeClear(b.point, here, d)) {
      const away = b.facing && (-Math.sin(yaw) * (b.point.x - here.x) - Math.cos(yaw) * (b.point.z - here.z)) < 0;
      applyGrenadeConditions(conditions, b.conditions.map(c => ({ ...c, seconds: c.seconds * (away ? .5 : 1) })), true);
    }
  });
  function grenadeClear(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, distance: number) {
    if (distance < .1) return true;
    grenadeRay.set(new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z).normalize()); grenadeRay.near = .04; grenadeRay.far = Math.max(.04, distance - .3);
    return !firstVisibleHit(grenadeRay, gameplayCandidates().filter(o => o !== vehicles.root && !targets.some(t => t.root === o) && !o.userData.arenaActorId));
  }
  function readyGrenade() {
    if (grenadeHeld || vehicles.active || hud.arenaSelf?.alive === false || performance.now() / 1000 - grenadeLastAt < .9) return;
    const item = pickUtility('grenade', supplies, undefined, null, grenadeChoice);
    if (!item?.grenade) { hud.message = 'No grenades on the belt.'; publish(); return; }
    if (item.id === 'grenade-red-smoke' && performance.now() / 1000 - missionLastAt < 60) { hud.message = 'Fire control: one mission every 60 s.'; publish(); return; }
    stopInspect(); stopReload(); endSupply(); trigger = false; pullBuffer = 0; ads = touchAim = false; beltSelected = 'grenade';
    grenadeHeld = { id: item.id, ready: 0, cooked: 0, pinned: false }; canvas.focus({ preventScroll: true }); publish();
  }
  function releaseGrenade() {
    if (!grenadeHeld?.pinned) return;
    const held = grenadeHeld, spec = itemById(held.id)!.grenade!, cooked = Math.min(spec.fuse, held.cooked);
    const direction = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const input = { id: held.id, origin: { x: position.x, y: vertical + eyeHeight() - .15, z: position.z }, direction, under: ads || touchAim, cooked };
    grenadeHeld = null; grenadeFireHeld = false; trigger = false; pullBuffer = 0; ads = touchAim = false;
    const previousThrow = grenadeLastAt, previousMission = missionLastAt;
    grenadeLastAt = performance.now() / 1000; if (held.id === 'grenade-red-smoke') missionLastAt = grenadeLastAt;
    hud.message = 'Throwing grenade…'; publish();
    const settled = (accepted: boolean) => {
      if (!accepted) { grenadeLastAt = previousThrow; missionLastAt = previousMission; hud.message = 'Grenade throw refused; item kept.'; publish(); return; }
      if (supplies[held.id] > 1) supplies[held.id]--; else delete supplies[held.id];
      if (grenadeChoice === held.id && !supplies[held.id]) grenadeChoice = null;
      if (looted[held.id]) { if (looted[held.id] > 1) looted[held.id]--; else delete looted[held.id]; }
      else if (!practiceRange) { if (expedition) { fieldProfile = consumeItem(fieldProfile, held.id); equipment = resolveLoadout(fieldProfile); expedition.onEquipment(copyProfile(fieldProfile)); } options.onConsume?.(held.id); }
      hud.message = `${itemById(held.id)!.name} thrown.`; publish();
    };
    if (arenaRuntime) arenaRuntime.throwGrenade(input, settled); else settled(localGrenades.throwGrenade('self', input));
  }

  function chooseGrenade(id: string | null) {
    if (id && (!itemById(id)?.grenade || !supplies[id])) return;
    grenadeChoice = id; beltSelected = 'grenade'; grenadePicker = null; grenadeKeyAt = null; canvas.focus({ preventScroll: true }); publish();
  }
  function openGrenadePicker() {
    if (hud.phase !== 'playing' || pilotEnabled || wheel || foodPicker || grenadeHeld?.pinned) return;
    const options = grenadeOptions(supplies); if (options.length < 2) { grenadeKeyAt = null; return; }
    grenadePicker = { x: 0, y: 0, slot: null, options }; trigger = false; pullBuffer = 0; publish();
  }
  function closeGrenadePicker(pick = false) {
    if (!grenadePicker) return;
    const option = grenadePicker.slot === null ? undefined : grenadePicker.options[grenadePicker.slot]; grenadePicker = null;
    if (pick && option) chooseGrenade(option.id); else publish();
  }
  function pointGrenadePicker(dx: number, dy: number) {
    if (!grenadePicker) return;
    grenadePicker.x += dx; grenadePicker.y += dy;
    grenadePicker.slot = wheelSlot(grenadePicker.x, grenadePicker.y, grenadePicker.options.length); publish();
  }
  function releaseGrenadeKey() {
    const tapped = grenadeKeyAt !== null; grenadeKeyAt = null;
    if (grenadePicker) closeGrenadePicker(true); else if (tapped) useUtility('grenade');
  }
  function activeGrenades(): readonly LiveGrenade[] { return arenaRuntime ? hud.arena?.grenades ?? [] : localGrenades.live; }
  function activeGrenadeEvents(): readonly GrenadeEvent[] { return arenaRuntime ? hud.arena?.grenadeEvents ?? [] : localGrenades.events; }
  function stepGrenadePlayer(dt: number) {
    if (grenadeKeyAt !== null && !grenadePicker && performance.now() - grenadeKeyAt >= FOOD_PICKER_HOLD_MS) openGrenadePicker();
    if (!arenaRuntime && hud.phase === 'playing') { advanceGrenadeConditions(conditions, dt); localGrenades.step(dt); }
    if (grenadeHeld && hud.phase === 'playing') { grenadeHeld.ready += dt; if (grenadeFireHeld && grenadeHeld.ready >= .35 && !arenaConditionModifiers(conditions).frozen) grenadeHeld.pinned = true; if (grenadeHeld.pinned) { grenadeHeld.cooked += dt; if (grenadeHeld.cooked >= itemById(grenadeHeld.id)!.grenade!.fuse) releaseGrenade(); } }
    const snapshotTime = hud.arena?.elapsed ?? 0, now = arenaRuntime ? Math.max(snapshotTime, eventClock) : localGrenades.clock;
    grenadeVisuals.update(activeGrenades(), activeGrenadeEvents(), now, arenaRuntime ? snapshotTime : now);
    hud.grenadeWarnings = activeGrenades().filter(g => { const d = Math.hypot(g.position.x - position.x, g.position.y - vertical - eyeHeight(), g.position.z - position.z); return !conditions.deafened && d <= grenadeDangerRadius(itemById(g.id)!.grenade!) + 2; }).map(g => ({ serial: g.serial, angle: Math.atan2(g.position.x - position.x, -(g.position.z - position.z)) + yaw, remaining: g.remaining }));
    for (const event of activeGrenadeEvents()) {
      const age = now - event.start;
      if (!seenGrenadeCues.has(event.serial)) {
        seenGrenadeCues.add(event.serial);
        const distance = Math.hypot(event.point.x - position.x, event.point.y - vertical - eyeHeight(), event.point.z - position.z);
        if (age < 1 && ['grenade-stun', 'grenade-whistle'].includes(event.id)) {
          const at = new THREE.Vector3(event.point.x, event.point.y, event.point.z); combatVisuals.blast(at, .2); combatAudio.boom(distance, .25);
          if (event.id === 'grenade-whistle' && distance < 14) {
            combatAudio.whistle(distance, .65);
            const address = options.encik?.() ?? encikAddress(fieldProfile), text = grenadeWhistleLine(address);
            hud.encikCallout = encik.announce(text, performance.now() / 1000, address.level >= 35 ? 'defers' : 'recruit');
            comms.add('radio', 'Encik', text);
          }
        }
      }
      for (const p of grenadePayloads(event)) {
        if (p.type === 'marker' && age <= p.until) hud.mapDangers.push({ id: `grenade-${event.serial}/${p.id}`, x: p.center.x, z: p.center.z, radius: p.radius, kind: 'ring' });
        if (p.type === 'cloud' && age <= p.until && Math.abs(vertical + eyeHeight() - event.point.y) < 6) {
          const effect = itemById(event.id)!.grenade!.effects.find(e => e.kind === 'cloud');
          const d = Math.hypot(position.x - p.center.x, position.z - p.center.z);
          if (d < p.radius && effect?.kind === 'cloud') {
            if (effect.blocksSight !== false) hud.cloudCover = { kind: p.dps ? 'gas' : 'smoke', amount: Math.min(1, (p.radius - d) / 2) };
            if (!arenaRuntime && p.dps) { const roof = effect.overhead && traceGrenade({ x: position.x, y: vertical + eyeHeight(), z: position.z }, { x: position.x, y: vertical + eyeHeight() + 40, z: position.z }); hurtPlayer(p.dps * dt * (roof ? .2 : 1), undefined, true); }
          }
        }
      }
    }
    if (!arenaRuntime && hud.phase === 'playing') for (const { effect, point } of localGrenades.areas()) {
      if (!('radius' in effect) || Math.hypot(position.x - point.x, position.z - point.z) > effect.radius || Math.abs(vertical + eyeHeight() - point.y) > 6) continue;
      if (effect.kind === 'condition') applyGrenadeConditions(conditions, [{ kind: effect.condition, strength: effect.strength, seconds: effect.seconds }], true);
      if (effect.kind === 'rally' && (!effect.sky || !traceGrenade({ x: position.x, y: vertical + eyeHeight(), z: position.z }, { x: position.x, y: vertical + eyeHeight() + 40, z: position.z }))) applyFoodEffects(foodEffects, effect.effects);
    }
    if (seenGrenadeCues.size > 2048) seenGrenadeCues.clear();
    if (conditions.deafened) hud.mapJammed = true;
    canvas.dataset.grenade = grenadeHeld ? `${grenadeHeld.id}:${grenadeHeld.pinned ? 'cooking' : 'ready'}:${grenadeHeld.cooked.toFixed(2)}` : '';
    canvas.dataset.grenades = String(activeGrenades().length); canvas.dataset.grenadeEvents = String(activeGrenadeEvents().length);
  }
  /** G: the belt slot used last (or chosen in the armory) again. */
  function useQuickItem() { useUtility(beltSelected); }
  /** Takes the right item for the moment out of a belt slot and starts using it; the slot becomes G's. */
  function useUtility(kind: UtilityKind) {
    if (hud.phase !== 'playing' || supplyUse || hud.health <= 0 || arenaConditionModifiers(conditions).frozen) return;
    if (kind === 'grenade') { readyGrenade(); return; }
    if (grenadeHeld) return;
    beltSelected = kind;
    const supply = pickUtility(kind, supplies, { health: hud.health, maxHealth: hud.maxHealth }, foodChoice);
    if (!supply?.effect) { hud.message = `No ${utilitySlot(kind)!.label.toLowerCase()} on the belt.`; publish(); return; }
    const { armor = 0, reserve = 0 } = supply.effect;
    // A meal with effects is worth eating at full health: the effects are why it was picked.
    const full = hud.health >= hud.maxHealth && (!armor || hud.armor >= equipment.armor) && (!reserve || loadout[hud.weapon].reserve >= MAX_RESERVE) && !(foodChoice && supply.foodEffects?.length);
    if (full) { hud.message = kind === 'food' ? 'Nothing to restore. Hold 4 to pick a food for its effects.' : 'Nothing to restore right now.'; publish(); return; }
    if (!beginSupply(supply.name, supply.id, supplyProfile(supply), () => applyQuickItem(supply), true)) publish();
  }
  function applyQuickItem(supply: NonNullable<ResolvedLoadout['quickItem']>) {
    if (!supplies[supply.id] || !supply.effect) return false;
    const { health = 0, armor = 0, reserve = 0 } = supply.effect;
    // In an arena the host heals, refills the inserts and starts the meal (it
    // owns health, and a guest's supplies); the reserve is this engine's own.
    if (arenaRuntime) arenaRuntime.useSupply(supply.id);
    else {
      if (health) { hud.health = Math.min(hud.maxHealth, hud.health + health); recoveryDelay = 0; }
      if (armor) hud.armor = Math.min(equipment.armor, hud.armor + armor);
      if (supply.foodEffects?.length) applyFoodEffects(foodEffects, supply.foodEffects);
    }
    if (health) recoveryDelay = 0;
    if (reserve) addReserveRounds(loadout[hud.weapon], reserve);
    if (supplies[supply.id] > 1) supplies[supply.id]--; else delete supplies[supply.id];
    hud.message = supply.foodEffects?.length ? `${supply.name} eaten · ${supply.foodEffects.map(effect => FOOD_EFFECTS[effect.kind].label).join(', ')}.` : `${supply.name} used.`;
    // The last of a picked food hands the slot back to Auto.
    if (foodChoice === supply.id && !supplies[supply.id]) { foodChoice = null; hud.message += ' Food slot back on Auto.'; }
    if (looted[supply.id]) { if (looted[supply.id] > 1) looted[supply.id]--; else delete looted[supply.id]; publish(); return true; }
    if (expedition) {
      fieldProfile = consumeItem(fieldProfile, supply.id); equipment = resolveLoadout(fieldProfile);
      expedition.onEquipment(copyProfile(fieldProfile));
    }
    if (!practiceRange) options.onConsume?.(supply.id);
    publish();
    return true;
  }
  function updateRangeTargets() {
    const director = rangeDirector;
    if (!director) return;
    if (hud.phase === 'playing') director.step(hud.elapsed, targetPositions.flatMap((p, i) => Math.hypot(p.x - position.x, p.z - position.z) >= 4 ? [i] : []));
    targets.forEach((target, i) => {
      const slot = director.slots[i];
      if (target.activation !== slot.activation) {
        target.activation = slot.activation; target.health = target.maxHealth; target.bar.scale.x = 1;
        if (drillMode !== 'classic') target.root.rotation.y = Math.atan2(position.x - target.root.position.x, position.z - target.root.position.z);
      }
      target.alive = slot.phase === 'active' && !director.finished;
      const rise = rangeTargetRise(slot, hud.elapsed);
      target.root.visible = rise > 0;
      target.root.position.y = .13 - (1 - rise) * 2.3;
      target.collider.maxY = rangeTargetHeight(slot, hud.elapsed);
    });
  }
  function finishRange(early: boolean) {
    if (!practiceRange || hud.phase !== 'playing' && hud.phase !== 'paused' || hud.health <= 0 || rangeDirector!.finished) return;
    rangeEndedEarly = early; rangeDirector!.finish();
    hud.phase = 'complete'; hud.incoming = false; pendingAttack = null; clearInput(); endSupply(); radioCall('complete');
    if (drillMode === 'classic' || drillMode === 'timed' && !early && hud.hits > 0) {
      const reward: ExerciseReward = { id: roundId, hits: hud.hits, shots: hud.shots, landed: Math.min(hud.landed, hud.shots), elapsed: hud.elapsed, combat: !!options.combat, drill: drillMode, targetCount: targetPositions.length };
      hud.earned += rewardAmount(reward); hud.earnedXp += completionXp(reward); options.onComplete?.(reward);
    }
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    publish();
  }
  function setRangeDrill(mode: RangeDrillId) {
    if (!practiceRange || !validRangeDrill(mode) || mode === drillMode || !['ready', 'complete', 'defeated'].includes(hud.phase)) return;
    drillMode = mode; rangeDirector = createRangeDirector(mode, targetPositions.length, Math.floor(Math.random() * 0xffffffff)); reset();
  }
  function endDrill() { if (drillMode !== 'classic') finishRange(true); }
  function checkCompletion() {
    if (!practiceRange || hud.phase !== 'playing' || hud.health <= 0) return;
    if (drillMode === 'classic' && hud.hits === targetPositions.length) finishRange(false);
    else if (drillMode === 'timed' && hud.elapsed >= RANGE_DURATION) { hud.elapsed = RANGE_DURATION; finishRange(false); }
  }
  function canResupply() {
    if (!rangeStation || hud.phase !== 'playing' || hud.health <= 0 || vehicles.active || grenadeHeld || supplyUse || Math.abs(vertical - rangeStation.root.position.y) > 1 || Math.hypot(position.x - rangeStation.point.x, position.z - rangeStation.point.z) > 3.2) return false;
    const from = { x: position.x, y: vertical + eyeHeight(), z: position.z }, to = rangeStation.root.position, dx = to.x - from.x, dz = to.z - from.z, dy = to.y + .7 - from.y, length = Math.hypot(dx, dy, dz);
    if (length < .1) return true;
    const ray = new THREE.Raycaster(new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(dx / length, dy / length, dz / length), .05, Math.max(.05, length - .15));
    return !firstVisibleHit(ray, world.scene.children.filter(o => o !== rangeStation.root && !o.userData.fpsEffect));
  }
  function resupplyRange() {
    if (!canResupply()) return;
    stopInspect(); endSupply();
    const refill = resupplyEquipment(loadout, specs, equipment.carriedFamilies, supplies, rangeStock);
    hud.message = refill.rounds || refill.items ? `Range resupply · +${refill.rounds} reserve rounds · +${refill.items} grenades / utilities. Free practice stock; reload to load ammunition.` : 'Range equipment already stocked. Reload to load ammunition.';
    comms.add('system', 'Range', hud.message); publish(); canvas.focus({ preventScroll: true });
  }
  /** Host rounds already drawn here, by id. */
  const seenRounds = new Set<number>();
  const seenImpacts = new Set<number>();
  /** Each arena figure's shot count when last heard, by id. */
  const heardShots = new Map<string, number>();
  /** Strike looks for other people's guns, built on first sight from the bore and damage the host publishes. */
  const publishedStyles = new Map<string, EffectStyle>();
  function publishedStyle(view: Pick<PublishedRound, 'calibre' | 'power'>) {
    const id = `round:${view.calibre}:${Math.round(view.power)}`;
    if (!publishedStyles.has(id)) {
      publishedStyles.set(id, { ...resolveEffectStyle({ caliberMm: view.calibre, damage: Math.max(1, view.power) }), id });
      // Registering keeps the weapon in hand as the active look.
      effects.setStyles([...weaponStyles, ...publishedStyles.values()], hud.weapon);
    }
    return id;
  }
  /** Steps every round still in the air and resolves whatever it reaches first. */
  function advanceRounds(dt: number) {
    if (!rounds.length) return;
    world.scene.updateMatrixWorld(true);
    const candidates = gameplayCandidates();
    let struck = false;
    for (let i = rounds.length - 1; i >= 0; i--) {
      const round = rounds[i], step = advanceRound(round, dt, round.range ?? ROUND_RANGE);
      if (step.distance > 1e-6) {
        roundDirection.set(step.to.x - step.from.x, step.to.y - step.from.y, step.to.z - step.from.z).normalize();
        roundRay.set(roundOrigin.set(step.from.x, step.from.y, step.from.z), roundDirection);
        roundRay.near = 0; roundRay.far = step.distance;
        // A round never strikes whoever fired it: their own figure or their own vehicle.
        const from = round.skipVehicle ? vehicleCandidates(round.skipVehicle) : round.skipActor ? candidates.filter(o => o.userData.arenaActorId !== round.skipActor) : candidates;
        if (round.vehicleDamage !== undefined) {
          const hit = firstVisibleHit(roundRay, from);
          effects.smokeTrail(step.from, hit?.point ?? step.to, round.travelled - step.distance + (hit?.distance ?? step.distance));
          if (hit) { vehicleImpact(hit, roundDirection, round.skipVehicle ?? 'car', round.vehicleDamage); rounds.splice(i, 1); struck = true; continue; }
          if (step.expired) rounds.splice(i, 1);
          continue;
        }
        const segmentHits = stopAtWater(visibleHits(roundRay, from, 1 + round.pierced));
        const lastHit = segmentHits[segmentHits.length - 1];
        const stopped = segmentHits.length > round.pierced || isWaterHit(lastHit);
        const stop = round.cosmetic ? segmentHits[0] : stopped ? lastHit : undefined;
        effects.smokeTrail(step.from, stop?.point ?? step.to, round.travelled - step.distance + (stop?.distance ?? step.distance));
        if (segmentHits.length && round.cosmetic) {
          // The arena host has the real round: this one only shows where it went.
          const first = segmentHits[0];
          const look = round.style ?? weaponStyles[round.weapon]?.id;
          if (isWaterHit(first)) meetWater(first, roundDirection, 1, round.weapon, round.style ? publishedStyles.get(round.style)?.impact : undefined); else strike(first, roundDirection, 1, look);
          rounds.splice(i, 1); continue;
        }
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
    if (struck) { resolveVehicleDestruction(); checkCompletion(); publish(); }
  }
  /** `caliberMm` when a round did it, which the inserts' rating and luck answer to (armor-inserts). */
  function hurtPlayer(amount: number, caliberMm?: number, piercing = false, shred = 0) {
    if (hud.health <= 0 || amount <= 0) return;
    const damage = piercing ? { health: Math.max(0, hud.health - amount * damageTakenScale(foodEffects)), armor: hud.armor, deflected: false } : applyArmorDamage(hud.health, hud.armor, amount * (1 - shred) * damageTakenScale(foodEffects), equipment.absorption, { insert: equipment.insert, caliberMm, roll: caliberMm === undefined ? undefined : Math.random() });
    if (damage.deflected) { comms.add('system', 'Inserts', DEFLECT_LINE); return; }
    const ahMa = survivesWithAhMa(foodEffects, Math.max(0, damage.health - amount * shred * damageTakenScale(foodEffects)));
    hud.health = ahMa.health; hud.armor = damage.armor; hurtTime = .4; recoveryDelay = FPS_REGEN_DELAY;
    if (ahMa.saved) { hud.message = ahMaLine(hud.health); comms.add('system', 'Ah Ma', hud.message); arenaRuntime?.setVitals({ health: hud.health }); }
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
    pullBuffer = 0;
    hud.shots++; shotSound(VEHICLE_COMBAT[mounted.kind]);
    ambientSky.startle(shot.base, .8, shot.direction);
    // The round leaves from the turret base, so a muzzle poked through a wall still meets the wall; it flies like any other.
    if (rounds.length < MAX_ROUNDS_IN_FLIGHT) rounds.push(Object.assign(createRound(++roundSerial, hud.weapon, shot.base.clone(), shot.direction.clone(), shot.ballistics),
      { range: shot.range, skipVehicle: shot.kind, vehicleDamage: shot.damage }));
    publish();
  }
  /** What a vehicle gun's round does where it lands, off the arena. */
  function vehicleImpact(hit: THREE.Intersection, direction: THREE.Vector3, kind: VehicleKind, damage: number) {
    const struck = vehicles.hitKind(hit.object);
    if (struck) vehicles.damage(struck, damage);
    if (typeof hit.object.userData.fpsTarget === 'number') damageTarget(hit.object.userData.fpsTarget, hud.weapon, hit.distance, undefined, 1, damage);
    if (isWaterHit(hit)) effects.splash(hit.point, direction, 1);
    else strike(hit, direction, kind === 'car' ? 1 : 1.6);
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
    if ((!pilotEnabled && specs[hud.weapon].fireMode === 'semi' && triggerSpent) || vehicles.active && !vehicles.canUseFirearm || (options.arena && !hud.arenaSelf?.alive) || !fireWeapon(loadout[hud.weapon], hud.weapon, specs)) return;
    hud.shots++; shotSound(specs[hud.weapon]);
    const recoilDamage = unsupportedRecoilDamage(specs[hud.weapon], prone, grounded(), stance() === 'crouch');
    if (recoilDamage) {
      hud.message = `Unsupported .50 recoil: ${recoilDamage} damage before armor. Z / Prone to deploy the mount.`;
      if (!arenaRuntime) {
        const damage = applyArmorDamage(hud.health, hud.armor, recoilDamage, equipment.absorption);
        hud.health = damage.health; hud.armor = damage.armor; hurtTime = .4; recoveryDelay = FPS_REGEN_DELAY;
        if (!hud.health) { hud.phase = 'defeated'; clearInput(); radioCall('death'); if (document.pointerLockElement === canvas) document.exitPointerLock(); }
      }
    }
    world.scene.updateMatrixWorld(true); ray.setFromCamera(center, camera);
    if (vehicles.mounted && vehicles.canUseFirearm) {
      const aimRay = ray.ray.clone(); ray.far = 180;
      const hit = firstVisibleHit(ray, vehicleCandidates(vehicles.active!));
      const target = hit?.point ?? aimRay.at(180, new THREE.Vector3());
      // Authority validates the seat, not a chase camera several metres away.
      const eye = seatPoint(vehicles.mounted, vehicles.seat!);
      ray.ray.origin.set(eye.x, eye.y, eye.z); ray.ray.direction.copy(target).sub(ray.ray.origin).normalize();
    }
    const shotOrigin = ray.ray.origin.clone();
    const shotCandidates = vehicles.active ? vehicleCandidates(vehicles.active) : gameplayCandidates();
    const dispersion = sampleShotSpread(spreadAngle);
    shotRight.set(1, 0, 0).applyQuaternion(camera.quaternion); shotUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    ray.ray.direction.addScaledVector(shotRight, dispersion.x).addScaledVector(shotUp, dispersion.y).normalize();
    ambientSky.startle(shotOrigin, .45, ray.ray.direction);
    triggerSpent = true; pullBuffer = 0;
    recordBloomShot(bloom[hud.weapon], hud.weapon);
    const muzzle = muzzleSocket(weapons[hud.weapon], FPS_WEAPONS[hud.weapon].id);
    if (muzzle) { muzzle.getWorldPosition(muzzlePoint); camera.localToWorld(muzzlePoint); }
    else muzzlePoint.copy(camera.position);
    if (vehicles.active) muzzlePoint.copy(shotOrigin);
    const supportMultiplier = bipodRecoilMultiplier(specs[hud.weapon].bipod, handling[hud.weapon]?.bipodDeployment ?? 0, prone, grounded(), carry.length());
    const recoilMultiplier = stanceRecoilMultiplier(stance(), grounded(), bodyMotion.eye) * supportMultiplier * recoilScale(foodEffects) * arenaConditionModifiers(conditions).recoil;
    recordRecoilShot(kick, specs[hud.weapon], hud.weapon, Math.random, recoilMultiplier);
    canvas.dataset.recoilMultiplier = recoilMultiplier.toFixed(3);
    effects.fire({ recoil: specs[hud.weapon].recoil, eject: weapons[hud.weapon].getObjectByName(`${FPS_WEAPONS[hud.weapon].id}__socket_eject`), camera, carry });
    // Every carried gun's round flies. In the arena the host flies the real one
    // and decides what it hit; this side flies a copy along the same arc to draw.
    if (needsFlight(specs[hud.weapon].ballistics)) {
      if (arenaRuntime) {
        arenaRuntime.shoot(shotOrigin, ray.ray.direction, hud.weapon, 125, prone);
      }
      if (rounds.length < MAX_ROUNDS_IN_FLIGHT && !(arenaRuntime && vehicles.active))
        rounds.push(Object.assign(createRound(++roundSerial, hud.weapon, shotOrigin, ray.ray.direction.clone(), specs[hud.weapon].ballistics, arenaRuntime ? 0 : pierceBudget(hud.weapon), !!arenaRuntime), vehicles.active ? { skipVehicle: vehicles.active } : {}));
      publish(); return;
    }
    const candidates = shotCandidates;
    // The arena host resolves its own shot, so it only needs the nearest surface.
    const hits = stopAtWater(arenaRuntime ? visibleHits(ray, candidates, 1) : visibleHits(ray, candidates, 1 + pierceBudget(hud.weapon)));
    const hit = hits[0];
    // What the round has left when it stops, which scales the spray it throws.
    let energy = 1;
    if (arenaRuntime) {
      let hitActor = false;
      for (let object: THREE.Object3D | null = hit?.object ?? null; object; object = object.parent) if (object.userData.arenaActorId) hitActor = true;
      arenaRuntime.shoot(shotOrigin, ray.ray.direction, hud.weapon, hit ? hit.distance + (hitActor ? 0.7 : 0) : 125, prone);
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
    // A drill target smells a durian from half again as far.
    if (distance > sightRangeAgainst(65, equipment.insert)) return false;
    attackRay.set(attackOrigin, direction.normalize()); attackRay.near = .07; attackRay.far = Math.max(.07, distance - .1);
    return !firstVisibleHit(attackRay, world.scene.children.filter(o => o !== target.root && !o.userData.fpsEffect && (!vehicles.active || o !== vehicles.root)), true);
  }
  function counterFire(dt: number) {
    if (pendingAttack) {
      pendingAttack.remaining -= dt;
      if (pendingAttack.remaining <= 0) {
        const attack = pendingAttack; pendingAttack = null; hud.incoming = false;
        // The target fires whenever it still sees you, and is heard whether or not it finds you.
        const sees = targets[attack.target]?.activation === attack.activation && hasLineOfSight(attack.target);
        if (sees) otherShot(attackOrigin, 5.56, 36);
        if (sees && playerPoint().distanceTo(attack.aim) < .75) {
          if (vehicles.active) vehicles.damage(vehicles.active, 36);
          else { hurtPlayer(18, 5.56); hitDirections.add(viewer(), attackOrigin, hitStrength(18, hud.maxHealth)); }
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
    if (index >= 0) { pendingAttack = { target: index, activation: targets[index].activation, remaining: .7, aim: playerPoint() }; hud.incoming = true; publish(); }
  }

  function sharedVehicleControls(): VehicleControls {
    const keys = drivingKeys();
    return { forward: Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown')),
      steer: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')),
      lift: Number(keys.has(' ')) - Number(keys.has('c') || keys.has('control')), brake: keys.has(' '), boost: keys.has('shift'),
      fire: (trigger || pullBuffer > 0) && hud.phase === 'playing' && vehicles.canFire,
      aim: { x: vehicleAimPoint.x, y: vehicleAimPoint.y, z: vehicleAimPoint.z } };
  }
  function updateArena(dt: number) {
    if (!arenaRuntime) return;
    const frame = arenaRuntime.update(dt, {
      x: position.x, y: eyeHeight() + vertical, z: position.z, yaw, pitch,
      ...(vehicles.active ? { vehicleControls: sharedVehicleControls() } : {}),
      prone, weapon: hud.weapon, playing: hud.phase === 'playing', reloading: loadout[hud.weapon].reloadRemaining > 0,
      ...(supplyUse ? { supply: supplyProgress(supplyUse) } : {}),
    });
    const previousSelf = hud.arenaSelf;
    const previousMatch = hud.arena;
    // Hosts already reset synchronously in reset(); only guests adopt a remote rematch.
    const newRound = options.arena?.session.role === 'guest' && previousMatch && frame.snapshot && (frame.snapshot.tick < previousMatch.tick || (previousMatch.finished && !frame.snapshot.finished));
    if (newRound) {
      hud.phase = 'ready'; hud.shots = hud.landed = hud.earned = hud.earnedXp = hud.chain = 0;
      hud.callout = ''; hud.message = ''; calloutTime = 0; killChain = { count: 0, lastAt: -Infinity };
      clearInput(); vehicles.reset(); stopVoice(); encik.reset(); comms.clear(); hud.encikCallout = null; loadout = createPooledLoadout(specs, equipment.carriedFamilies);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    const oldVehicle = vehicles.active, oldSeat = vehicles.seat;
    if (frame.snapshot?.vehicles && options.arena) {
      // Their rounds arrive with the snapshot's own and are drawn in flight; the shot itself is heard.
      for (const shot of vehicles.adoptShared(frame.snapshot.vehicles, options.arena.session.id)) {
        const gun = VEHICLE_COMBAT[shot.kind];
        if (shot.kind === vehicles.active) shotSound(gun); else otherShot(shot.origin, gun.caliberMm, gun.damage);
      }
      if (oldVehicle !== vehicles.active || oldSeat !== vehicles.seat) {
        if (!oldVehicle && vehicles.mounted) { yaw = vehicles.mounted.yaw; pitch = -.23; }
        velocityY = 0;
        vertical = !vehicles.active && frame.self ? Math.max(0, frame.self.y - 1.75) : 0;
        if (frame.self) position = { x: frame.self.x, z: frame.self.z };
        clearInput();
      }
      if (vehicles.mounted) position = { x: vehicles.mounted.x, z: vehicles.mounted.z };
    }
    if (frame.vehicleNotice) vehicles.setNotice(frame.vehicleNotice);
    facilityVisuals.update(frame.snapshot?.facilities);
    hud.arena = frame.snapshot; hud.arenaSelf = frame.self; hud.arenaConnected = frame.connected; hud.arenaStarted = frame.started;
    // The host's meals, copied: it runs the timers and the healing, and spent Ah Ma's save if she stepped in.
    if (frame.self?.conditions?.deafened && !conditions.deafened) stopVoice();
    conditions = structuredClone(frame.self?.conditions ?? {});
    foodEffects = Object.fromEntries(Object.entries(frame.self?.food ?? {}).map(([kind, effect]) => [kind, { ...effect! }]));
    const ahMaSaves = frame.self?.ahMaSaves ?? 0;
    if (ahMaSaves > ahMaSavesSeen) { hud.message = ahMaLine(frame.self!.health); comms.add('system', 'Ah Ma', hud.message); }
    ahMaSavesSeen = ahMaSaves;
    if (options.arena) rounds.push(...adoptPublishedRounds(frame.snapshot?.rounds ?? [], seenRounds,
      { self: options.arena.session.id, viewer: camera.position, range: REMOTE_TRACER_RANGE, room: MAX_ROUNDS_IN_FLIGHT - rounds.length, nextId: () => ++roundSerial, styleFor: publishedStyle }));
    if (options.arena && frame.snapshot) for (const shot of gunfireReports(frame.snapshot.actors, heardShots, options.arena.session.id, camera.position)) otherShot(shot.from, shot.calibre, shot.power, shot.after, shot.muzzle);
    if (frame.snapshot) hud.elapsed = frame.snapshot.elapsed;
    if (frame.snapshot) dropFallenKit(frame.snapshot.actors, frame.feed);
    if (frame.self) {
      if (vehicles.active) hud.shots = frame.self.shots;
      hud.hits = frame.self.kills; hud.health = frame.self.health; hud.armor = frame.self.armor;
      if (previousSelf && frame.self.health < previousSelf.health) { hurtTime = .4; recoveryDelay = FPS_REGEN_DELAY; }
      const struck = frame.self.hurtFrom;
      if (struck && struck.serial !== hurtSerial) {
        const lost = previousSelf ? previousSelf.health + previousSelf.armor - frame.self.health - frame.self.armor : 0;
        if (hurtSerial >= 0 && lost > 0) hitDirections.add(viewer(), struck, hitStrength(lost, hud.maxHealth), struck.blast ? 'blast' : 'shot');
        // Struck for nothing: the host glanced the round off a lucky insert.
        else if (hurtSerial >= 0 && !struck.blast && equipment.insert.deflect > 0) comms.add('system', 'Inserts', DEFLECT_LINE);
        hurtSerial = struck.serial;
      } else if (!struck) hurtSerial = 0;
      if (expedition && !frame.self.alive && document.pointerLockElement === canvas) document.exitPointerLock();
      if (!frame.self.alive && previousSelf?.alive) { supplyUse = null; radioCall('death'); clearInput(); killChain = { count: 0, lastAt: -Infinity }; hud.chain = 0; hud.callout = ''; calloutTime = 0; }
      if (frame.spawn) {
        if (previousSelf && !previousSelf.alive) radioCall('respawn');
        pilot.reset(); strategicPlanner?.reset();
        position = { x: frame.self.x, z: frame.self.z }; vertical = Math.max(0, frame.self.y - 1.75); velocityY = 0;
        yaw = frame.self.yaw; pitch = frame.self.pitch; loadout = createPooledLoadout(specs, equipment.carriedFamilies); clearInput(); supplyUse = null;
        if (checkpointPending) {
          loadout = createPooledLoadout(specs, equipment.carriedFamilies, checkpointPending);
          hud.weapon = equipment.carriedFamilies.includes(checkpointPending.weapon) ? checkpointPending.weapon : equipment.carriedFamilies[0]; checkpointPending = undefined;
          weapons.forEach((weapon, index) => weapon.visible = index === hud.weapon);
          effects.attachMuzzle(muzzleSocket(weapons[hud.weapon], FPS_WEAPONS[hud.weapon].id));
          effects.setStyles(weaponStyles, hud.weapon);
        }
        resetRecoil(kick); effects.reset(); hitTime = 0; bloom.forEach(state => { state.amount = 0; state.delay = 0; }); updateCameras(0, false, false);
      } else if (frame.correction && !vehicles.active) {
        position = { x: frame.correction.x, z: frame.correction.z };
        vertical = Math.max(0, frame.correction.y - eyeHeight());
        if (frame.hardCorrection) { velocityY = 0; resetMovementMotion(bodyMotion, eyeHeight()); carry.set(0, 0, 0); }
        updateCameras(0, false, false);
      }
      rig.visible = frame.self.alive && (!vehicles.active || vehicles.canUseFirearm && firstPersonVehicle());
    }
    if (newRound) seenImpacts.clear();
    for (const impact of takeConfirmedImpacts(frame.snapshot?.impacts ?? [], seenImpacts, frame.snapshot?.elapsed ?? 0)) {
      if (impact.victim === options.arena?.session.id) continue;
      const point = new THREE.Vector3(impact.point.x, impact.point.y, impact.point.z);
      if (point.distanceTo(camera.position) > REMOTE_TRACER_RANGE) continue;
      const direction = new THREE.Vector3(impact.direction.x, impact.direction.y, impact.direction.z);
      const style = publishedStyle({ calibre: impact.calibre, power: impact.power });
      effects.impact(point, direction.clone().negate(), 'surface', 1, style, 'flesh');
      bloodSpatter(point, direction, 1);
    }
    if (frame.hit?.hitId && frame.hit.damage > 0) { hud.landed++; hud.lastDamage = frame.hit.damage; hitTime = .2; hud.hitKind = frame.hit.killed ? 'kill' : 'hit'; }
    for (const said of frame.barks) if (frame.snapshot) hearBark(said, frame.snapshot.actors);
    if (wheel) hud.orderStatus = orderStatus();
    for (const event of frame.feed) {
      comms.add('kills', 'Arena', event.text);
      const reward = combatFeedReward(event);
      if (event.killerId !== options.arena!.session.id || !reward) continue;
      const chain = registerElimination(killChain, hud.elapsed); killChain = chain; hud.chain = chain.count;
      hud.callout = event.bounty ? `BOUNTY +${reward.credits} CR · +${reward.xp} XP` : chain.label || 'ELIMINATION'; calloutTime = 2.4; announce(hud.callout, chain.count);
      // Feed ids restart with each session, so the round id keeps a kill from matching one already paid.
      const killId = `${roundId}:kill:${event.id}`;
      hud.earned += reward.credits; hud.earnedXp += reward.xp; options.onElimination?.(killId, event.bounty);
      if (expedition) {
        // The wallet on screen and the profile the next district starts from both read the field copy.
        fieldProfile = claimElimination(fieldProfile, killId, event.bounty); hud.credits = fieldProfile.credits;
        expedition.onEquipment(copyProfile(fieldProfile));
      }
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
   * On an expedition a fallen soldier leaves their kit where they fell: an
   * enemy their weapon, a friendly the issued rifle or Ultimax and a pouch of
   * rounds, and either side whatever dressings and plates their rank carried
   * (expedition-loot's FALLEN_KIT). A bot is seen alive and then not, which
   * covers every cause of death, including artillery; the feed only says
   * whether the kill was the player's.
   */
  function dropFallenKit(actors: readonly ArenaActor[], feed: readonly { killerId?: string; victimId?: string }[]) {
    for (const actor of actors) {
      if (!actor.bot) continue;
      const was = botsAlive.get(actor.id); botsAlive.set(actor.id, actor.alive);
      if (!expedition || !markers || was !== true || actor.alive) continue;
      const side = getArenaFaction(factionIdOf(actor))?.side ?? 'opposition';
      const fell = expedition.loot.fallen(expedition.zone, { key: `${actor.id}:${actor.deaths}`, side, rank: actor.rank, grenade: actor.grenade, variant: actor.variant, family: actor.weapon },
        { x: actor.x, z: actor.z, y: actor.ground ?? Math.max(0, actor.y - (actor.prone ? PRONE_EYE_HEIGHT : 1.75)) }, lootGround);
      if (!fell.loot.length) continue;
      fell.evicted.forEach(id => markers.remove(id)); fell.loot.forEach(item => markers.addDrop(item));
      hud.fieldLoot = expedition.loot.remaining(expedition.zone);
      const names = fell.loot.map(item => item.name), list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      const take = fell.loot.length > 1 ? 'E to take them.' : 'E to take it.';
      if (side === 'forces') {
        // A friendly's kit is worth knowing about wherever they fell, if it is near enough to reach.
        if (Math.hypot(actor.x - position.x, actor.z - position.z) <= FRIENDLY_KIT_CALL_RANGE) comms.add('system', 'Field', `${actor.name} is down, ${whereFrom(actor)}. Left ${list}. ${take}`);
      } else if (feed.some(event => event.victimId === actor.id && event.killerId === options.arena?.session.id))
        comms.add('system', 'Field', `${list} dropped by ${actor.name}. ${take}`);
    }
  }
  /**
   * The callout wheel (player-callouts). Held open with Y, it points with the
   * mouse from the centre; a touchscreen or an unlocked pointer taps its
   * buttons instead. `x`/`y` are the mouse travel since it opened.
   */
  let wheel: { page: number; x: number; y: number; slot: number | null } | null = null, wheelPage = 0, lastCalloutAt = -Infinity, chatterSerial = 0;
  const pingRay = new THREE.Raycaster(), pingForward = new THREE.Vector3(), pingAt = new THREE.Vector3();
  const syncWheel = () => { hud.calloutWheel = wheel ? { page: wheel.page, slot: wheel.slot } : null; hud.orderStatus = wheel ? orderStatus() : null; publish(); };
  /** What the Orders page needs to say: who would hear an order now, and when HQ will next send help. */
  function orderStatus(): FpsHud['orderStatus'] {
    const self = hud.arenaSelf;
    if (!arenaRuntime || !self) return { allies: 0, reinforce: 'none' };
    const allies = (hud.arena?.actors ?? []).filter(a => a.bot && a.alive && !hostile({ bot: false, faction: PLAYER_FACTION }, a) && Math.hypot(a.x - position.x, a.z - position.z) <= ORDER_TUNING.range).length;
    return { allies, reinforce: options.arena?.environment?.reinforcements ? self.reinforceIn ?? 'ready' : 'none' };
  }
  /**
   * The food picker. Tapping 4 eats from the food slot; holding it opens the
   * picker over the crosshair, the mouse points at a food the way it points at
   * a callout, and letting go makes that food the slot's pick (Auto, at the
   * top, goes back to healing to need). Nothing pauses and moving keeps
   * working: eating is what takes the time, not choosing.
   */
  function openFoodPicker() {
    if (hud.phase !== 'playing' || pilotEnabled || wheel || foodPicker || grenadeHeld?.pinned) return;
    const options = foodOptions(supplies, { health: hud.health, maxHealth: hud.maxHealth });
    if (options.length < 2) { foodKeyAt = null; hud.message = 'No food on the belt.'; publish(); return; }
    foodPicker = { x: 0, y: 0, slot: null, options }; trigger = false; pullBuffer = 0; syncFoodPicker();
  }
  function syncFoodPicker() { hud.foodPicker = foodPicker ? { options: foodPicker.options, slot: foodPicker.slot } : null; publish(); }
  function pointFoodPicker(dx: number, dy: number) {
    if (!foodPicker) return;
    foodPicker.x += dx; foodPicker.y += dy;
    const reach = Math.hypot(foodPicker.x, foodPicker.y);
    if (reach > 140) { foodPicker.x *= 140 / reach; foodPicker.y *= 140 / reach; }
    const slot = wheelSlot(foodPicker.x, foodPicker.y, foodPicker.options.length);
    if (slot !== foodPicker.slot) { foodPicker.slot = slot; syncFoodPicker(); }
  }
  /** Puts the picker away; with `pick`, the food it points at becomes the slot's. */
  function closeFoodPicker(pick = false) {
    if (!foodPicker) return;
    const option = foodPicker.slot === null ? undefined : foodPicker.options[foodPicker.slot];
    foodPicker = null; hud.foodPicker = null;
    if (pick && option) chooseFood(option.id); else publish();
  }
  /** Makes a carried food the food slot's pick, or Auto with null. Picking it does not eat it. */
  function chooseFood(id: string | null) {
    const item = id ? itemById(id) : undefined;
    if (id && (utilityKind(item) !== 'food' || !supplies[id])) return;
    foodChoice = id; beltSelected = 'food'; foodPicker = null; hud.foodPicker = null;
    hud.message = item ? `Food slot: ${item.name}. Tap 4 to eat.` : 'Food slot: Auto, heals to need.';
    if (hud.phase === 'playing') canvas.focus({ preventScroll: true });
    publish();
  }
  /** 4 let go: a tap eats, a hold picks from the picker it opened. */
  function releaseFoodKey() {
    const tapped = foodKeyAt !== null; foodKeyAt = null;
    if (foodPicker) closeFoodPicker(true);
    else if (tapped && hud.phase === 'playing') useUtility('food');
  }
  /** Meals at work: the picker's hold, healing over time and timers running out. */
  function stepFood(dt: number) {
    if (foodKeyAt !== null && !foodPicker && performance.now() - foodKeyAt >= FOOD_PICKER_HOLD_MS) openFoodPicker();
    // In an arena the host steps the meals and the copy arrives with each frame.
    if (hud.health <= 0 || arenaRuntime) return;
    const fed = advanceFoodEffects(foodEffects, dt);
    if (fed.heal > 0 && hud.health < hud.maxHealth) hud.health = Math.min(hud.maxHealth, hud.health + fed.heal);
    if (fed.expired.includes('ah-ma')) comms.add('system', 'Ah Ma', 'Ah Ma has gone home. Eat properly, ok?');
  }
  function openCalloutWheel() {
    if (hud.phase !== 'playing' || pilotEnabled || wheel || foodPicker || grenadeHeld?.pinned) return;
    wheel = { page: wheelPage, x: 0, y: 0, slot: null }; trigger = false; pullBuffer = 0; syncWheel();
  }
  /** Puts the wheel away; with `say`, says the slot it points at, if any. */
  function closeCalloutWheel(say = false) {
    if (!wheel) return;
    const callout = wheel.slot === null ? undefined : CALLOUT_PAGES[wheel.page].callouts[wheel.slot];
    wheel = null; hud.calloutWheel = null;
    if (say && callout) sendCallout(callout.id); else publish();
  }
  function setCalloutPage(page: number) {
    if (!wheel) return;
    wheel.page = wheelPage = ((Math.round(page) % CALLOUT_PAGES.length) + CALLOUT_PAGES.length) % CALLOUT_PAGES.length; syncWheel();
  }
  function pointCalloutWheel(dx: number, dy: number) {
    if (!wheel) return;
    wheel.x += dx; wheel.y += dy;
    const reach = Math.hypot(wheel.x, wheel.y);
    if (reach > 140) { wheel.x *= 140 / reach; wheel.y *= 140 / reach; }
    const slot = wheelSlot(wheel.x, wheel.y, CALLOUT_PAGES[wheel.page].callouts.length);
    if (slot !== wheel.slot) { wheel.slot = slot; syncWheel(); }
  }
  /** Where the crosshair rests on the world, for a callout that points. */
  function pingPoint() {
    camera.getWorldDirection(pingForward); pingRay.set(camera.position, pingForward); pingRay.near = .3; pingRay.far = 150;
    const hit = firstVisibleHit(pingRay, gameplayCandidates());
    const point = hit?.point ?? pingRay.ray.at(60, pingAt);
    return { x: point.x, y: point.y, z: point.z };
  }
  /** Says a callout. In a match the host says it and it comes back in the frame's barks; on the range it is only heard here. */
  function sendCallout(id: string) {
    const spoken = getPlayerCallout(id);
    if (wheel) { wheel = null; hud.calloutWheel = null; }
    const now = performance.now() / 1000;
    if (!spoken || hud.phase !== 'playing' || now - lastCalloutAt < CALLOUT_COOLDOWN) { publish(); return false; }
    lastCalloutAt = now;
    const at = spoken.ping && (!arenaRuntime || hud.arenaSelf?.alive) ? pingPoint() : undefined;
    if (arenaRuntime) arenaRuntime.callout(id, at);
    else {
      hear('You', spoken.lines[Math.floor(Math.random() * spoken.lines.length)] + (at ? ` · ${whereFrom(at)}` : ''), spoken.order ? 'order' : 'self');
      if (spoken.order) hear('Orders', 'Nobody to order on the range.', 'order', 'system');
    }
    publish(); return true;
  }
  function hear(source: string, text: string, tone: ChatterLine['tone'], channel: 'chatter' | 'system' = 'chatter') {
    comms.add(channel, source, text);
    const now = performance.now() / 1000;
    hud.chatter = [...hud.chatter.filter(line => line.until > now).slice(-(CHATTER_LINES - 1)), { id: ++chatterSerial, source, text, tone, until: now + CHATTER_SECONDS }];
  }
  /**
   * What reaches the player of something said: their own callouts and other
   * players' always (the team net), a friendly bot's over the radio within
   * range, an enemy's only when near enough to overhear.
   */
  function hearBark(said: ArenaBark, actors: readonly ArenaActor[]) {
    if (conditions.deafened) return;
    const speaker = actors.find(actor => actor.id === said.actor); if (!speaker) return;
    const own = speaker.id === options.arena?.session.id, enemy = !own && hostile({ bot: false, faction: PLAYER_FACTION }, speaker);
    const range = own || !speaker.bot ? Infinity : enemy ? BARK_RANGE.overheard : BARK_RANGE.radio;
    if (Math.hypot(speaker.x - position.x, speaker.z - position.z) > range) return;
    // An order says how many took it; one that went nowhere says why.
    const order = said.order, took = order?.allies ? ` · ${order.allies} ${order.allies === 1 ? 'ally' : 'allies'}` : '';
    const text = said.text + (said.at ? ` · ${whereFrom(said.at)}` : '') + took;
    hear(own ? 'You' : enemy && speaker.bot ? `${speaker.name} · overheard` : speaker.name, text, order ? 'order' : own ? 'self' : !speaker.bot ? 'player' : enemy ? 'enemy' : 'friend');
    if (order?.note) hear(own ? 'Orders' : `Orders · ${speaker.name}`, order.note, 'order', 'system');
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
    if (!snapshot) { combatAudio.loop('jet', ambientJet); hud.combatBanner = null; hud.mapDangers = []; hud.mapJammed = false; hud.cloudCover = null; return; }
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
        combatVisuals.blast(at, size); combatAudio.boom(distance, size); ambientSky.startle(at, size);
        shake = Math.min(1, shake + Math.max(0, 1 - distance / (70 * size)) * .9 * Math.min(1.2, size));
      } else { combatVisuals.spot(at, cue.payload.smoke ?? '#d8463a'); combatAudio.boom(distance, cue.payload.kind === 'canister' ? .12 : .3); }
    }
    for (const event of events) {
      if (seenEvents.has(event.id)) continue;
      seenEvents.add(event.id);
      const plugin = getCombatEvent(event.kind);
      if (!plugin || !['warning', 'active'].includes(combatPhase(event, eventClock))) continue;
      // Something happening across the district is news; only one near you is an alarm.
      const near = Math.hypot(event.target.x - position.x, event.target.z - position.z) < COMBAT_NEAR, threat = threatens(event, plugin);
      const named = `${event.faction === 'armed-forces' ? 'FRIENDLY ' : ''}${plugin.name.toUpperCase()}`;
      const coast = event.landing ? SENTOSA_LANDING_SITES.find(s => s.id === event.landing)?.name : undefined;
      comms.add('system', threat && near ? 'Fire control' : 'Intel', near ? `${bannerOf(event, plugin).warning} · ${whereFrom(event.target)}` : `${named} · ${whereFrom(event.target)}`);
      if (coast) comms.add('system', 'Naval control', `${coast} · ETA ${Math.max(0, Math.ceil(event.start + NAVAL_LANDING.approach + NAVAL_LANDING.rampSeconds - eventClock))}s`);
      if (threat && near) combatAudio.alert();
    }
    if (seenEvents.size > 200) { seenEvents.clear(); events.forEach(e => seenEvents.add(e.id)); }
    // A crate this player opened is theirs: the host only says who got there first.
    for (const event of events) if (event.kind === 'supply-drop' && event.outcome === 'claimed' && !openedSupplies.has(event.id)) {
      openedSupplies.add(event.id); if (event.claimedBy === options.arena?.session.id) openSupply(event);
    }
    let banner: FpsHud['combatBanner'] = null, rank = 0, engine: { mode: 'land' | 'air' | 'sea' | null; distance: number; effort: number } = { mode: null, distance: Infinity, effort: 0 };
    // Higher rank wins: a drone diving at you beats a barrage you stand in, which beats news.
    const offer = (text: string, tone: 'hazard' | 'notice', priority: number) => { if (priority > rank) { rank = priority; banner = { text, tone }; } };
    let jet = Infinity, raid = Infinity, drone = Infinity, siren = false, jammed = false, cloud: FpsHud['cloudCover'] = null, lockedOn = false;
    const dangers: FpsHud['mapDangers'] = [];
    for (const event of events) {
      const plugin = getCombatEvent(event.kind); if (!plugin) continue;
      const phase = combatPhase(event, eventClock), age = eventClock - event.start, live = phase === 'warning' || phase === 'active';
      const far = Math.hypot(event.target.x - position.x, event.target.z - position.z) >= COMBAT_NEAR, threat = threatens(event, plugin);
      if (far && live && threat) offer(`${plugin.name.toUpperCase()} · ${whereFrom(event.target)}`, 'notice', 1);
      const countdown = `${Math.max(1, Math.ceil(event.start + plugin.warning - eventClock))}s`;
      if (event.kind === 'air-raid' && live) siren = true;
      for (const payload of combatTimeline(event)) {
        if (payload.type === 'transport') {
          const active = snapshot?.transports?.find(t => t.event === event.id);
          const pose = active ? { ...active, effort: active.health <= 0 || !active.driverAlive ? 0 : active.state === 'stopped' || active.mode === 'sea' && !['inbound', 'leaving'].includes(active.state) ? .2 : .85 } : transportPose(payload, age);
          const distance = Math.hypot(pose.x - listener.x, pose.y - listener.y, pose.z - listener.z);
          if (pose.visible && distance < engine.distance) engine = { mode: payload.mode, distance, effort: pose.effort };
          if (payload.mode === 'sea' && active?.visible) {
            const coast = SENTOSA_LANDING_SITES.find(s => s.id === event.landing)?.name ?? 'Coast';
            if (!far && active.state === 'inbound') offer(`${bannerOf(event, plugin).warning} · ${coast} · ${Math.max(0, Math.ceil(event.start + NAVAL_LANDING.approach + NAVAL_LANDING.rampSeconds - eventClock))}s`, 'notice', 2);
          }
          if (active?.state === 'landing' || active?.state === 'stopped') offer(`TRANSPORT ${active.driverAlive ? 'CRITICAL' : 'DRIVER DOWN'} · TROOPS EVACUATING · ${whereFrom(active)}`, 'notice', 2);
          else if (active && (active.state === 'down' || active.state === 'wreck')) offer(`TRANSPORT DESTROYED · ${whereFrom(active)}`, 'notice', 1);
          else if (!plugin.hazard && age < payload.depart) offer(`${age < payload.arrive ? bannerOf(event, plugin).warning : bannerOf(event, plugin).active} · ${whereFrom(payload.drop)}`, 'notice', 1);
        } else if (payload.type === 'flyer') {
          const pose = flyerPose(payload, age); if (pose.visible) jet = Math.min(jet, Math.hypot(pose.x - listener.x, pose.y, pose.z - listener.z));
        } else if (payload.type === 'marker' && age >= payload.from && age <= payload.until) {
          dangers.push({ id: `${event.id}/${payload.id}`, x: payload.center.x, z: payload.center.z, radius: payload.radius, kind: plugin.hazard ? 'ring' : 'crate' });
          if (!plugin.hazard || far) continue;
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
      const raider = raiders.find(r => r.event === event.id), hunter = raider ?? (event.origin ? { x: event.origin.x, z: event.origin.z } : event.target);
      // A hunter busy across the district is news until it comes your way.
      if (Math.hypot(hunter.x - position.x, hunter.z - position.z) >= COMBAT_NEAR) continue;
      // One on your side is news, not an alarm: it is not looking for you.
      if (!threat) { offer(`${phase === 'warning' ? bannerOf(event, plugin).warning : bannerOf(event, plugin).active} · ${whereFrom(hunter)}`, 'notice', 1); continue; }
      // Hunters: their warning is a countdown; once here, where they are is what matters.
      if (phase === 'warning') { offer(`${plugin.banner.warning} · ${countdown}`, 'hazard', 3); continue; }
      if (event.kind === 'sniper') { if (event.ended === undefined && event.origin) offer(`${plugin.banner.active} · ${whereFrom(event.origin)}`, 'hazard', 2); continue; }
      if (!raider || ['down', 'wreck', 'exploded', 'landing', 'landed'].includes(raider.state)) continue;
      const onMe = !!raider.aim && Math.hypot(raider.aim.x - position.x, raider.aim.z - position.z) < 2.5;
      if (event.kind === 'drone' && onMe && (raider.state === 'lock' || raider.state === 'dive')) { lockedOn = true; offer('DRONE LOCKED ON · BREAK LINE OF SIGHT OR SHOOT IT', 'hazard', 5); }
      else offer(`${plugin.banner.active} · ${whereFrom(raider)}`, 'hazard', event.kind === 'helicopter-raid' ? 3 : 2);
    }
    // An enemy sniper who has fired or shown a glint has given their position away.
    for (const actor of snapshot.actors) if (actor.role === 'overwatch' && actor.alive && (actor.aiming || actor.shots > 0) && hostile({ bot: false }, actor)) dangers.push({ id: `sniper-${actor.id}`, x: actor.x, z: actor.z, radius: 0, kind: 'raider' });
    for (const r of raiders) {
      if (['wreck', 'exploded', 'landed'].includes(r.state)) continue;
      const distance = Math.hypot(r.x - listener.x, r.y - listener.y, r.z - listener.z);
      if (r.kind === 'gunship') raid = Math.min(raid, distance); else drone = Math.min(drone, distance);
      const owner = events.find(e => e.id === r.event);
      if (r.state !== 'down' && (!owner || threatens(owner, getCombatEvent(owner.kind)!))) dangers.push({ id: `raider-${r.event}`, x: r.x, z: r.z, radius: 0, kind: 'raider' });
    }
    lockBeep -= dt;
    if (lockedOn && lockBeep <= 0) { combatAudio.beep(); lockBeep = .22; }
    hud.combatBanner = banner;
    hud.mapJammed = jammed; hud.mapDangers = jammed ? [] : dangers; hud.cloudCover = cloud;
    blackout += ((jammed ? 1 : 0) - blackout) * Math.min(1, dt * 1.5);
    combatAudio.transport(engine.mode, engine.distance, engine.effort);
    combatAudio.loop('jet', Math.min(jet, ambientJet)); combatAudio.loop('raid', raid); combatAudio.loop('drone', drone); combatAudio.loop('siren', siren ? 0 : Infinity);
    const happened = combatVisuals.update(dt, events, eventClock, camera, raiders, snapshot?.transports ?? []);
    // The raid helicopter's pilot-controlled chin mount; rifle passengers use regular actor shots.
    happened.shots.slice(0, 2).forEach(at => otherShot(at, 7.62, 60));
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
      const items = expedition.loot.supply(expedition.zone, event.id, { x: event.target.x, z: event.target.z, y: vertical }, lootGround);
      items.forEach(item => markers.addDrop(item)); hud.fieldLoot = expedition.loot.remaining(expedition.zone);
      hud.lootNotice = `Supply drop open: ${items.map(item => item.name).join(', ')}. E to take.`; lootNoticeTime = 5;
    } else {
      equipment.carriedFamilies.forEach(index => addReserveRounds(loadout[index], specs[index].reserve));
      hud.health = hud.maxHealth; hud.armor = equipment.armor; arenaRuntime?.setVitals({ health: hud.health, armor: hud.armor });
      hud.lootNotice = 'Supply drop open: ammunition topped up, health and plates restored.'; lootNoticeTime = 5;
    }
    comms.add('system', 'Supplies', hud.lootNotice); radioCall('pickup');
  }
  /**
   * The sky beyond the district. Its jets share the combat events' roar; it
   * keeps its jets and rockets back while a real air raid is on, so nothing of
   * it reads as part of the raid.
   */
  function updateAmbientSky(dt: number) {
    const raid = (hud.arena?.events ?? []).some(e => e.kind === 'air-raid' && combatPhase(e, eventClock) !== 'done');
    // The district's set pieces (a train's door chime, a liner's horn) on the same clock that moves them.
    if (hud.elapsed < cueClock) cueClock = hud.elapsed;
    for (const cue of world.cues?.(cueClock, hud.elapsed) ?? []) ambientSky.cue(cue.kind, cue.at);
    cueClock = hud.elapsed;
    const sky = ambientSky.update(dt, { camera, listener: camera.position, bounds: world.bounds, night: nightLevel(atmosphere.light.lighting.elevation), quiet: raid });
    ambientJet = sky.jet; nightLights.shine(sky.lights, camera.position);
    const census = ambientSky.census; if (census !== canvas.dataset.ambientSky) canvas.dataset.ambientSky = census;
  }
  /** Debug: put one of the sky's set pieces up ahead of you now, whatever the hour. */
  function triggerAmbient(kind: AmbientKind) { if (!disposed) ambientSky.trigger(kind, yaw); }
  /**
   * Debug: call an event in now. Area events land ahead of you (artillery 35 m,
   * smoke 25 m, a supply drop 30 m, a blackout on you); hunters come for you;
   * a transport plans its own drop.
   */
  function triggerCombatEvent(kind: string) {
    if (!arenaRuntime || !hud.combatEventsAvailable || disposed) return;
    const plugin = getCombatEvent(kind), transport = kind.startsWith('transport-'); if (!plugin) return;
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
    if (['playing', 'deploying'].includes(hud.phase) && (!expedition || hud.arenaSelf?.alive !== false) && !pilotEnabled && inputMode === 'mouse' && document.pointerLockElement !== canvas) pause();
    const realDt = Math.max((now - lastTime) / 1000, 0), dt = Math.min(realDt, 0.05); lastTime = now;
    if (pilotEnabled && ['complete', 'defeated', 'error'].includes(hud.phase)) { pilotEnabled = false; pilot.reset(); strategicPlanner?.reset(); }
    if (hud.phase === 'deploying') {
      deploymentIntro.advance(realDt);
      if (!deploymentIntro.active) finishDeployment();
    }
    if (pilotEnabled && hud.phase === 'playing' && now >= nextPilotAt) { nextPilotAt = now + PILOT_INTERVAL * 1000; updatePilot(now / 1000); }
    if (disposed || travelPending) return;
    const previousVehicle = vehicles.active, previousHeading = vehicles.viewMounted?.yaw;
    updateArena(realDt);
    if (arenaRuntime) {
      vehicles.sharedStep(realDt);
      arenaRuntime.presentVehicleRiders(vehicles.viewStates);
      if (previousVehicle === vehicles.active && previousHeading !== undefined && vehicles.viewMounted)
        yaw += Math.atan2(Math.sin(vehicles.viewMounted.yaw - previousHeading), Math.cos(vehicles.viewMounted.yaw - previousHeading));
    }
    let moving = false, sprinting = false, fireReady = true;
    // The arena keeps running behind pause menus, including magazine reloads.
    if (options.arena) loadout.forEach((state, i) => advanceWeapon(state, i, realDt, specs, gunRates()));
    if (hud.chatter.length && hud.chatter[0].until <= now / 1000) hud.chatter = hud.chatter.filter(line => line.until > now / 1000);
    if (hud.phase === 'playing' && (!options.arena || hud.arenaSelf?.alive)) {
      if (arenaConditionModifiers(conditions).frozen) { keys.clear(); moveStick = null; trigger = false; pullBuffer = 0; bodyMotion.x = bodyMotion.z = 0; }
      bloom.forEach(state => advanceBloom(state, dt));
      calloutTime = Math.max(0, calloutTime - realDt); if (!calloutTime) hud.callout = '';
      if (!options.arena) hud.elapsed += realDt;
      updateRangeTargets(); checkCompletion();
      if (!options.arena) loadout.forEach((state, i) => advanceWeapon(state, i, realDt, specs, gunRates()));
      if (vehicles.mounted) {
        if (!arenaRuntime) yaw += vehicles.step(drivingKeys(), dt);
        if (vehicles.mounted) position = { x: vehicles.mounted.x, z: vehicles.mounted.z };
        carry.set(0, 0, 0);
      } else {
      if (!arenaRuntime) vehicles.step(keys, dt);
      const move = resolveMovement(keys, moveStick, stickRunning);
      stickRunning = !!moveStick && move.sprint;
      const forward = move.forward, side = move.side;
      const onGround = grounded(), poseStance = stance(), burden = movement();
      const wantsSprint = move.sprint && forward > .5 && poseStance === 'stand', pulled = trigger || pullBuffer > 0;
      sprintIntent = wantsSprint && keys.has('shift');
      // Fire beats sprint: a held trigger drops the run to a jog, and it picks back up on its own.
      ({ sprint: sprinting, fire: fireReady } = advanceSprintBreak(sprintBreak, wantsSprint, pulled, wasSprinting, realDt));
      // A fresh trigger pull or sprint key stops a reload; one already held when
      // it began does not, and a held sprint drops to a run until the reload ends.
      if (loadout[hud.weapon].reloadRemaining > 0) {
        if (reloadInterrupt(reloadGate, pulled, sprintIntent, roundReady(loadout[hud.weapon], specs[hud.weapon]))) stopReload();
        else sprinting = false;
      }
      // A fresh trigger pull or sprint key puts a supply away; one already held walks.
      if (supplyUse) { if (reloadInterrupt(supplyGate, pulled, sprintIntent, true)) endSupply(); else sprinting = false; }
      const speed = (poseStance === 'prone' ? .85 : poseStance === 'crouch' ? 2.1 : sprinting ? 7 : (ads || touchAim) ? 2.5 : 4.2) * (supplyUse ? SUPPLY_MOVE_SCALE : 1) * footSpeedScale(foodEffects);
      const target = movementInput(forward, side, yaw, speed * burden.movement, 1);
      if (consumeJump(bodyMotion, onGround, poseStance === 'stand' && bodyMotion.eye > 1.6, dt)) velocityY = 5.6 * burden.jumpVelocity;
      const delta = advanceGroundMotion(bodyMotion, target.x, target.z, onGround && velocityY <= 0, burden.movement, poseStance, braced(), dt);
      // Keep enough clearance for the head while lowering into a crawl.
      const clearance = Math.max(eyeHeight(), bodyMotion.eye) + .05;
      const height = footMovement.canOccupy(position.x, vertical, position.z, .38, clearance) ? clearance : eyeHeight() + .05;
      const next = footMovement.move({ ...position, y: vertical, velocityY }, delta.x, delta.z, dt, .38, height,
        vehicles.footObstacles().slice(world.obstacles.length), INFANTRY_GRAVITY);
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
      refreshAimAssist(realDt);
      resolveVehicleDestruction();
      vehicleAimTimer -= realDt;
      if (vehicles.active && vehicleAimTimer <= 0) { aimVehicle(); vehicleAimTimer = .05; }
      if (supplyUse && (vehicles.active || hud.health <= 0)) endSupply();
      stepSupply(realDt);
      stepFood(realDt);
      wasSprinting = sprinting;
      if ((trigger || pullBuffer > 0) && fireReady && !supplyUse && !grenadeHeld && !arenaConditionModifiers(conditions).frozen && hud.phase === 'playing') { if (vehicles.active && !vehicles.canUseFirearm) shootVehicle(); else shoot(); }
      pullBuffer = Math.max(0, pullBuffer - realDt);
      if (hud.phase === 'playing' && options.combat && !options.arena) counterFire(realDt);
    } else { advanceRecoil(kick, realDt); applyAimPush(); carry.set(0, 0, 0); updateCameras(dt, false, false); }
    updateAmbientSky(realDt);
    updateCombatEvents(realDt);
    stepGrenadePlayer(realDt);
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
    if (String(live.shotSmoke) !== canvas.dataset.fxShotSmoke) canvas.dataset.fxShotSmoke = String(live.shotSmoke);
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
    objectiveBeacons?.update(hud.arena?.facilities?.sites ?? [], hud.objectiveHints && hud.phase === 'playing' && hud.arenaSelf?.alive !== false && !hud.mapExpanded);
    world.animate(hud.elapsed);
    markers?.update(realDt, camera.position);
    // Shadows move the sun's target first; the atmosphere then places the sun from it.
    lightView(realDt);
    atmosphere.update(dt, camera);
    // The overview's altitude must not turn a ground-level weather preset into
    // an opaque sheet. Restore the exact world fog after this presentation pass.
    const aerialFog = (overviewActive() || deploymentIntro.active) && world.scene.fog instanceof THREE.Fog ? world.scene.fog : null;
    const fogNear = aerialFog?.near ?? 0, fogFar = aerialFog?.far ?? 0;
    if (aerialFog) { const lift = Math.max(0, camera.position.y - 100); aerialFog.near += lift; aerialFog.far += lift; }
    // Blast shake, two-axis and quickly settling; none at all with reduced motion.
    if (shake > .001) {
      const amount = motionPreference?.matches ? 0 : shake * shake * .035;
      camera.rotation.x += (Math.random() - .5) * amount; camera.rotation.y += (Math.random() - .5) * amount; camera.updateMatrixWorld(true);
      shake *= Math.exp(-realDt * 5);
    }
    // Before anything draws the world: the tube's gain goes into exposure, or the scene turns to temperature.
    const visionSpec = equipment.vision?.spec;
    advanceVision(visionState, visionSpec, realDt, !!motionPreference?.matches);
    renderer.toneMappingExposure = vision.begin(visionSpec, visionState, { dt: realDt, lighting: atmosphere.light.lighting, blackout, exposure: renderer.toneMappingExposure });
    const opticActive = rig.visible && (!vehicles.active || vehicles.canUseFirearm) && hud.phase === 'playing';
    const nvgAiming = nvgAimingActive(visionSpec, visionState);
    updateRail(opticActive, nvgAiming);
    // Canted past halfway, the offset dot is the sight in use and the scope beside it goes dark.
    const mountedSight = weapons[hud.weapon] ? getWeaponSight(weapons[hud.weapon]) : undefined;
    setSightNightVision(mountedSight, nvgAiming);
    const sight = mountedSight?.offset && cant > .5 ? mountedSight.offset : mountedSight;
    if (mountedSight?.offset) (sight === mountedSight ? mountedSight.offset : mountedSight).lens.visible = false;
    canvas.dataset.cant = cant.toFixed(2);
    const scopeActive = scopeRenderer.render(world.scene, camera, viewCamera, sight, opticActive, aimProgress);
    const reflectionCaptured = opticReflections.render(world.scene, camera, viewCamera, sight?.reflection, opticActive, now / 1000);
    canvas.dataset.scopeActive = String(scopeActive);
    canvas.dataset.reflexPowered = String(!!sight && sight.magnification <= 1.01 && sight.lens.visible);
    canvas.dataset.opticReflection = String(!!sight?.reflection?.uniforms.reflectionReady.value && opticActive);
    canvas.dataset.reflexReflection = String(sight?.magnification === 1 && canvas.dataset.opticReflection === 'true');
    if (reflectionCaptured) canvas.dataset.reflexCaptures = String(Number(canvas.dataset.reflexCaptures || 0) + 1);
    canvas.dataset.occlusion = String(occlusion.render(!overviewActive() && atmosphere.light.occlusion && !vision.thermal));
    const descent = hud.phase === 'deploying' ? deploymentIntro.frame(eyeHeight() + vertical, pitch, deploymentRoof) : null;
    const blurAmount = descent && !motionPreference?.matches && !getEnvironmentSettings().reducedEffects ? descent.blur : 0;
    deploymentBlur.present(blurAmount); canvas.dataset.deploymentBlur = blurAmount.toFixed(4);
    renderer.clearDepth(); renderer.render(viewScene, viewCamera);
    const { lighting } = atmosphere.light, air = atmosphere.air;
    lens.present({ camera, dt: realDt, time: now / 1000, sun: lighting.key, elevation: lighting.elevation, sunColor: lighting.keyColor, dusk: lighting.shift,
      sunlight: air.sunlight, haze: air.haze, rain: air.rain, wind: air.wind, sheltered: air.sheltered || !!vehicles.active,
      sky: world.scene.background instanceof THREE.Color ? world.scene.background : null, thermal: vision.thermal,
      reduced: getEnvironmentSettings().reducedEffects || !!motionPreference?.matches });
    const lensTag = `${lens.status.flare.toFixed(2)}:${lens.status.dust.toFixed(2)}:${lens.status.drops}`;
    if (lensTag !== canvas.dataset.lens) canvas.dataset.lens = lensTag;
    vision.end(visionSpec, visionState, now / 1000);
    const visionMotion = `${visionState.mount.toFixed(2)}:${visionState.fading.toFixed(2)}`;
    if (visionMotion !== canvas.dataset.visionMotion) canvas.dataset.visionMotion = visionMotion;
    const visionTag = visionState.on && visionSpec ? `${visionSpec.kind}:${visionSpec.generation}:${activePalette(visionState, visionSpec) || 'tube'}:${vision.swapped}` : '';
    if (visionTag !== (canvas.dataset.vision ?? '')) canvas.dataset.vision = visionTag;
    if (aerialFog) { aerialFog.near = fogNear; aerialFog.far = fogFar; }
    if (now - lastReport > 100) { publish(); lastReport = now; }
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);

  /**
   * Compiles every shader the exercise can draw while it is still loading.
   * Three otherwise compiles one on the frame that first shows it, and that
   * frame stalls: the first aim, the first shot, a set piece's first model.
   * The canvas and the offscreen passes (occlusion, scope, reflections) each
   * need their own variant, as tone mapping and colour space differ.
   */
  async function warmShaders() {
    weapons.forEach(weapon => { const sight = getWeaponSight(weapon); if (sight) scopeRenderer.prepare(sight); });
    if (options.arena) combatVisuals.prewarm();
    const targetVisibility = targets.map(t => t.root.visible); targets.forEach(t => t.root.visible = true);
    const previous = renderer.getRenderTarget(), offscreen = new THREE.WebGLRenderTarget(1, 1), compiling: Promise<unknown>[] = [];
    for (const target of [null, offscreen]) {
      renderer.setRenderTarget(target);
      compiling.push(renderer.compileAsync(world.scene, camera), renderer.compileAsync(viewScene, viewCamera));
    }
    renderer.setRenderTarget(previous);
    compiling.push(vision.warm(), deploymentBlur.warm());
    try { await Promise.all(compiling); } finally { targets.forEach((t, i) => t.root.visible = targetVisibility[i]); offscreen.dispose(); }
    if (disposed) return;
    // A compiled shader still needs a pipeline per target format, built on first draw there.
    scopeRenderer.warm(world.scene, camera); opticReflections.warm(world.scene, camera);
  }
  const assetIds = expedition ? ['sar21-inspired', 'ultimax-inspired'] : ['sar21-inspired', 'ultimax-inspired', 'range-target', 'supply-crate', 'sandbag-wall', 'traffic-cone'];
  void Promise.all(assetIds.map(async id => {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/field-kit/${id}.glb`);
    if (disposed) disposeAssets([gltf.scene]); else templates.push(gltf.scene);
    return gltf.scene;
  })).then(async loaded => {
    if (disposed) return;
    weapons.push(loaded[0], loaded[1], ...FPS_WEAPONS.slice(2).map(spec => {
      const model = buildServiceWeapon(spec.id)!; templates.push(model); return model;
    })); weapons.forEach((w, i) => { undress.push(dressWeapon(w, specs[i])); handling.push(createWeaponHandling(w, i)); rig.add(w); w.visible = i === hud.weapon; });
    effects.attachMuzzle(muzzleSocket(weapons[hud.weapon], FPS_WEAPONS[hud.weapon].id));
    effects.setStyles(weaponStyles, hud.weapon);
    if (!options.arena) targetPositions.forEach((p, i) => {
      const root = new THREE.Group(); root.position.set(p.x, 0.13, p.z);
      // Heated, as a thermal-sight range's targets are.
      root.userData.heat = 'target';
      root.rotation.y = Math.atan2(spawn.x - p.x, spawn.z - p.z);
      root.add(loaded[2].clone(true));
      const hitZone = new THREE.Mesh(targetGeometry, targetMaterial); hitZone.position.set(0, 1.3, 0.026); hitZone.userData.fpsTarget = i; root.add(hitZone);
      // A separate, smaller collider above centre mass. It never overlaps the body
      // zone, so the nearest-surface rule picks exactly one of the two.
      const headZone = new THREE.Mesh(headGeometry, targetMaterial); headZone.position.set(0, 1.72, 0.026);
      headZone.userData.fpsTarget = i; headZone.userData.fpsZone = 'head'; root.add(headZone);
      const maxHealth = i % 2 ? 115 : 100;
      const bar = new THREE.Mesh(healthGeometry, healthMaterial); bar.position.set(0, 1.91, .04); root.add(bar);
      const collider = { minX: p.x - .42, maxX: p.x + .42, minZ: p.z - .42, maxZ: p.z + .42, maxY: 2.08 };
      world.scene.add(root); targets.push({ root, hitZone, alive: true, activation: 0, health: maxHealth, maxHealth, bar, collider });
      world.obstacles.push(collider);
    });
    updateRangeTargets();
    if (!expedition) for (const [asset, x, z, width, depth] of district.props) {
      const prop = loaded[asset].clone(true); prop.position.set(x, 0.14, z); decorations.add(prop);
      world.obstacles.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, maxY: asset === 3 ? 0.8 : asset === 4 ? 0.9 : 0.7 });
    }
    // Range props are appended after asynchronous model loading; refresh the static broadphase.
    footMovement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
    if (options.arena) {
      arenaRuntime = createArenaRuntime({ scene: world.scene, obstacles: world.obstacles, ...options.arena, vehicles: { spawns: fleetSpawns, flightObstacles: vehicles.flightObstacles(), openWorld: !!expedition } });
      if (expedition) arenaRuntime.setAutoRespawn(expedition.autoRespawn === true);
      hud.combatEventsAvailable = options.arena.session.role === 'solo';
      if (debugAvailable) {
        arenaRuntime.setCombatEvents(debug.combatEvents);
        arenaRuntime.setHealthMultiplier(debug.healthMultiplier);
        if (expedition?.checkpoint) arenaRuntime.setVitals({ health: expedition.checkpoint.health });
      }
    }
    // Bullets, bots' sight lines and event landings all cast through the district's instanced scenery.
    canvas.dataset.raycastTrees = String(accelerateInstancedRaycasts(world.scene));
    await warmShaders();
    if (disposed) return;
    hud.phase = 'ready'; updateCameras(0, false, false); publish();
    if (expedition?.checkpoint?.pilot) startPilot();
  }).catch(() => {
    if (!disposed) { hud.phase = 'error'; hud.message = 'The range assets could not load. Retry to load the local models.'; publish(); }
  });

  return {
    setTutorialStep(step: number) { if (options.tutorial) world.scene.userData.setTutorialStep?.(step); },
    setRangeDrill, endDrill, resupplyRange,
    chooseRespawn: (zone: string) => { const accepted = arenaRuntime?.chooseRespawn(zone) ?? false; publish(); return accepted; },
    setAutoRespawn: (automatic: boolean) => { arenaRuntime?.setAutoRespawn(automatic); publish(); },
    chooseDeployment, zoomDeployment, resetDeploymentView, skipDeployment: finishDeployment, start, startPilot, setPilotStrategy, takeControl, pause, reset, reload, inspectWeapon, switchWeapon, useQuickItem, useUtility, jump, setInput, setMoveAxis, lookBy, interactVehicle, switchVehicleSeat, interactLoot, interactNpc, interactFacility, travelZone, configureDebug, refillHealth, triggerCombatEvent, triggerAmbient,
    setPilotDestination(destination?: WorldZoneId) { pilotDestination = destination; },
    getPilotObservation() { return lastPilotObservation ? structuredClone(lastPilotObservation) : null; },
    toggleVehicleView, toggleAim, toggleMap, toggleObjectiveHints, toggleRail, toggleCant,
    toggleWeaponLight: () => toggleDevice('light'), toggleWeaponLaser: () => toggleDevice('laser'),
    openCalloutWheel, closeCalloutWheel, setCalloutPage, sendCallout,
    /** Touch: the wheel's button opens it and, open, puts it away. */
    toggleCalloutWheel() { if (wheel) closeCalloutWheel(); else openCalloutWheel(); },
    /** Touch: the food slot's chooser button opens the picker and, open, puts it away. */
    toggleGrenadePicker() { if (grenadePicker) closeGrenadePicker(); else openGrenadePicker(); },
    chooseGrenade, closeGrenadePicker: () => closeGrenadePicker(),
    toggleFoodPicker() { if (foodPicker) closeFoodPicker(); else openFoodPicker(); },
    chooseFood, closeFoodPicker: () => closeFoodPicker(),
    toggleVision: () => useVision('toggle'), cycleVisionPalette: () => useVision('palette'), pressVision: () => useVision('button'),
    toggleEncikVoice() { hud.encikVoice = !hud.encikVoice; if (!hud.encikVoice) stopVoice(); publish(); },
    toggleSound() { hud.muted = !hud.muted; if (hud.muted) stopVoice(); if (hud.phase === 'playing') { canvas.focus({ preventScroll: true }); if (!hud.muted) initAudio(); } publish(); },
    dispose() {
      const infrastructure = arenaRuntime?.getWorldState();
      if (expedition && infrastructure) expedition.infrastructure?.set(expedition.zone, infrastructure);
      facilityVisuals.dispose(); objectiveBeacons?.dispose();
      disposed = true; pilot.reset(); strategicPlanner?.reset(); encikAudio.dispose(); cancelAnimationFrame(frame); observer.disconnect(); clearInput();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      window.removeEventListener('keydown', pilotEscape, true);
      canvas.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      window.removeEventListener('pointerdown', pointerSource, true); window.removeEventListener('pointermove', pointerSource, true);
      canvas.removeEventListener('pointerdown', pointerdown); canvas.removeEventListener('pointermove', pointermove);
      window.removeEventListener('pointerup', pointerup); canvas.removeEventListener('pointercancel', releasePointer); canvas.removeEventListener('lostpointercapture', releasePointer);
      canvas.removeEventListener('contextmenu', contextmenu); document.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('mousedown', mousedown); window.removeEventListener('mouseup', mouseup); canvas.removeEventListener('wheel', scrollWheel);
      document.removeEventListener('pointerlockchange', lockchange); document.removeEventListener('pointerlockerror', lockerror);
      window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility);
      // First, so every mesh has its own material back before anything else restores or disposes them.
      vision.dispose(); lens.dispose(); deploymentBlur.dispose(); overview.dispose();
      void audio?.close().catch(() => {}); arenaRuntime?.dispose(); expeditionSession?.close(); markers?.dispose(); vehicles.dispose(); undress.forEach(fn => fn()); handling.forEach(model => model.dispose()); disposeAssets(templates); nightLights.dispose(); atmosphere.dispose(); playerBody.dispose(); world.dispose();
      healthGeometry.dispose(); healthMaterial.dispose(); combatVisuals.dispose(); combatAudio.dispose(); railEffects.dispose(); gunshots.dispose(); sfx.dispose(); ambientSky.dispose(); hitOverlay.dispose();
      targetGeometry.dispose(); headGeometry.dispose(); targetMaterial.dispose(); effects.dispose();
      rangeStation?.dispose();
      scopeRenderer.dispose(); opticReflections.dispose(); supplyHands.dispose(); grenadeHands.dispose(); grenadeVisuals.dispose(); sunShadows.dispose(); occlusion.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
export type FpsEngine = ReturnType<typeof createFpsEngine>;
