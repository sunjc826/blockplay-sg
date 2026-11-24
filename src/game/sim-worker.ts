// Worker entry: the arena simulation and its own copy of the district, off the main thread.
// Started by sim-remote.ts when Settings › Advanced › Background simulation is on.
import { buildExpeditionDistrict } from './expedition-district';
import { buildDistrictWorld } from './district-world';
import { MARINA_BOUNDS } from './marina-collision';
import { buildHardpointWorld } from './hardpoint-world';
import { buildTeamDeathmatchWorld } from './team-deathmatch-world';
import { buildFreeForAllWorld } from './free-for-all-world';
import { createStageView } from './levolution-stage';
import { addPropCover } from './prop-cover';
import type { Obstacle } from './region-collision';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { getBuildingLifts } from './building-lifts';
import { createArena, type ArenaEnvironment, type ArenaSnapshot, type ArenaVehicleOptions, type VehicleCrewTransfer } from './arena-rules';
import { createSceneCover } from './scene-cover';
import { createDropColumnCheck } from './paratrooper-route-validation';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { createProxyCampaign, type ProxyCampaign } from './proxy-operations';
import { getBotDifficulty, setBotDifficulty } from './bot-difficulty-setting';
import type { BotDifficulty } from './bot-difficulty';
import { createSimHost, seatArrivingCrew } from './sim-host';
import type { SimToHost } from './sim-protocol';
import type { WorldZoneId } from './world-zones';

/** Which map the simulation stands in; the worker builds its own copy from this alone. */
export type SimWorldSpec =
  | { kind: 'expedition'; zone: WorldZoneId; spawn?: Parameters<typeof buildExpeditionDistrict>[1] }
  | { kind: 'team-deathmatch' | 'hardpoint' | 'free-for-all'; area: string }
  /** A free-for-all across a whole district with its vehicles: the LAN and public default. */
  | { kind: 'district'; zone: WorldZoneId };
export interface SimWorkerInit { type: 'init'; world: SimWorldSpec; self: string;
  /** Collision boxes of models only the engine can load; they stand here as boxes (prop-cover.ts). */
  props?: Obstacle[]; environment: Partial<ArenaEnvironment>; campaign?: ProxyCampaign; difficulty: BotDifficulty; vehicles?: ArenaVehicleOptions; botCount: number; composition?: string;
  /** The vehicle and crew the player drove in from the last district; they are seated as the player joins. */
  vehicleTravel?: VehicleCrewTransfer }
const scope = globalThis as unknown as { postMessage(message: unknown): void; addEventListener(type: 'message', handler: (event: MessageEvent) => void): void };

/** Development probe: this copy's answer to the same rays the engine's drawn scene is asked (sim-remote.ts). */
export interface SimCoverRay { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number }; range: number }
let probe: ((rays: SimCoverRay[]) => { census: Record<string, [number, number]>; sight: number[]; bullet: number[]; struck: string[] }) | null = null;
/** The simulation time this copy's moving scenery was last placed for. */
let sceneClock = 0;

/** The map, and what keeps it as the engine's drawn copy stands after each step. */
function stand(spec: SimWorldSpec) {
  if (spec.kind === 'expedition') {
    const { world, structureVisuals } = buildExpeditionDistrict(spec.zone, spec.spawn);
    // Structures change with the facility that owns them; cover is re-read four times a second, so every fifth step is often enough.
    return { world, rules: world.environment as ArenaEnvironment | undefined, follow: (now: ArenaSnapshot, steps: number) => { if (steps % 5 === 0) structureVisuals.update(now.facilities); } };
  }
  if (spec.kind === 'district') {
    // The engine builds this one with barricades at the district's edge, and gives the simulation no rules of the district's own.
    const world = buildDistrictWorld(spec.zone, undefined, { barricades: true });
    for (const stamp of world.stamps) stamp.visible = false;
    return { world, rules: undefined, follow: () => {} };
  }
  const world = spec.kind === 'hardpoint' ? buildHardpointWorld(spec.area) : spec.kind === 'team-deathmatch' ? buildTeamDeathmatchWorld(spec.area) : buildFreeForAllWorld(spec.area);
  for (const stamp of world.stamps) stamp.visible = false;
  // The simulation moves a staged part's colliders itself; this moves what stands in the scene, which is what sight and rounds meet.
  const events = world.environment.levolution?.events ?? [], stage = events.length ? createStageView(world, events, false) : null;
  return { world, rules: world.environment as ArenaEnvironment | undefined, follow: (now: ArenaSnapshot) => {
    if (stage) { stage.sync(now.levolution?.events ?? [], now.elapsed); stage.update(now.elapsed); }
    if ('controlStations' in world) (world as ReturnType<typeof buildHardpointWorld>).controlStations.update(now.hardpoint);
  } };
}

function build(init: SimWorkerInit) {
  const { world, rules, follow: followMap } = stand(init.world);
  if (init.props?.length) { world.obstacles.push(...init.props); addPropCover(world.scene, init.props); }
  accelerateInstancedRaycasts(world.scene); world.scene.updateMatrixWorld(true);
  const cover = createSceneCover(world.scene);
  if (import.meta.env.DEV) probe = rays => cover.probe(rays);
  // Everything function-valued is this district's own; the rest is what the engine resolved.
  // Only an expedition has a proxy campaign; a match given one would start proxy operations of its own.
  const campaign = init.world.kind === 'expedition' ? init.campaign ?? createProxyCampaign() : undefined;
  setBotDifficulty(init.difficulty);
  const given = { ...rules, ...init.environment, ...(campaign ? { proxies: campaign } : {}) } as ArenaEnvironment;
  if (given.paratroopers || given.proxies) given.dropColumnClear = createDropColumnCheck(cover);
  // As the runtime does for a simulation of its own: no rules at all is the Marina Bay free-for-all.
  const environment = Object.keys(given).length ? given : undefined;
  const arena = createArena(world.obstacles, init.botCount, init.composition, environment, init.vehicles,
    { bounds: environment?.bounds ?? MARINA_BOUNDS, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene), lifts: getBuildingLifts(world.scene) },
    cover.distance, (from, to) => {
      const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z); if (distance < 1e-8) return null;
      const hit = cover.trace(from, { x: (to.x - from.x) / distance, y: (to.y - from.y) / distance, z: (to.z - from.z) / distance }, distance);
      return hit?.face ? { point: hit.point, normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld) } : null;
    }, cover.sightDistance, getBotDifficulty);
  // Trains and other moving scenery stand where the simulation's own clock puts them, which is the
  // clock the engine draws them by, so a bot's sight meets a train where the player sees it.
  let steps = 0;
  const follow = () => { const now = arena.snapshot(); sceneClock = now.elapsed; world.animate(now.elapsed); followMap(now, steps++); world.scene.updateMatrixWorld(); };
  follow();
  return { campaign, arena: { ...seatArrivingCrew(arena, init.self, init.vehicleTravel), step(dt: number) { arena.step(dt); follow(); }, reset() { steps = 0; arena.reset(); follow(); } } };
}

let deliver: ((message: SimToHost) => void) | null = null;
scope.addEventListener('message', event => {
  const message = event.data as SimWorkerInit | SimToHost | { type: 'probe'; id: number; rays: SimCoverRay[] } | { type: 'difficulty'; value: BotDifficulty };
  if (message.type === 'difficulty') { setBotDifficulty(message.value); return; }
  if (message.type === 'probe') { scope.postMessage({ type: 'probed', id: message.id, elapsed: sceneClock, ...probe?.(message.rays) }); return; }
  if (message.type !== 'init') { deliver?.(message); return; }
  try {
    const start = performance.now(), { arena, campaign } = build(message);
    const host = createSimHost(arena, message.self, { post: out => scope.postMessage(out), listen: handler => { deliver = handler; } }, undefined, campaign);
    scope.postMessage({ type: 'ready', first: host.first(), navigation: arena.navigationGraphStatus(), buildMs: performance.now() - start });
  } catch (error) { scope.postMessage({ type: 'failed', error: String((error as Error)?.stack ?? error) }); }
});
