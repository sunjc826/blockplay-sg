// Worker entry: the arena simulation and its own copy of the district, off the main thread.
// Development only for now (see sim-remote.ts).
import { buildExpeditionDistrict } from './expedition-district';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { getBuildingLifts } from './building-lifts';
import { createArena, type ArenaEnvironment, type ArenaVehicleOptions } from './arena-rules';
import { createSceneCover } from './scene-cover';
import { createDropColumnCheck } from './paratrooper-route-validation';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { createProxyCampaign, type ProxyCampaign } from './proxy-operations';
import { getBotDifficulty, setBotDifficulty } from './bot-difficulty-setting';
import type { BotDifficulty } from './bot-difficulty';
import { createSimHost } from './sim-host';
import type { SimToHost } from './sim-protocol';
import type { WorldZoneId } from './world-zones';

export interface SimWorkerInit { type: 'init'; zone: WorldZoneId; spawn?: Parameters<typeof buildExpeditionDistrict>[1]; self: string; environment: Partial<ArenaEnvironment>; campaign?: ProxyCampaign; difficulty: BotDifficulty; vehicles?: ArenaVehicleOptions; botCount: number; composition?: string }
const scope = globalThis as unknown as { postMessage(message: unknown): void; addEventListener(type: 'message', handler: (event: MessageEvent) => void): void };

/** Development probe: this copy's answer to the same rays the engine's drawn scene is asked (sim-remote.ts). */
export interface SimCoverRay { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number }; range: number }
let probe: ((rays: SimCoverRay[]) => { sight: number[]; bullet: number[]; struck: string[] }) | null = null;

function build(init: SimWorkerInit) {
  const { world, structureVisuals } = buildExpeditionDistrict(init.zone, init.spawn);
  accelerateInstancedRaycasts(world.scene); world.scene.updateMatrixWorld(true);
  const cover = createSceneCover(world.scene);
  probe = rays => cover.probe(rays);
  // Everything function-valued is this district's own; the rest is what the engine resolved.
  const campaign = init.campaign ?? createProxyCampaign();
  setBotDifficulty(init.difficulty);
  const environment = { ...world.environment, ...init.environment, proxies: campaign, dropColumnClear: createDropColumnCheck(cover) } as ArenaEnvironment;
  const arena = createArena(world.obstacles, init.botCount, init.composition, environment, init.vehicles,
    { bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene), lifts: getBuildingLifts(world.scene) },
    cover.distance, (from, to) => {
      const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z); if (distance < 1e-8) return null;
      const hit = cover.trace(from, { x: (to.x - from.x) / distance, y: (to.y - from.y) / distance, z: (to.z - from.z) / distance }, distance);
      return hit?.face ? { point: hit.point, normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld) } : null;
    }, cover.sightDistance, getBotDifficulty);
  // Trains and other moving scenery block sight where they are now, as in the drawn district.
  // Structures change with the facility that owns them; cover is re-read four times a second, so that is often enough.
  let elapsed = 0, steps = 0;
  const animate = () => { world.animate(elapsed); if (steps++ % 5 === 0) structureVisuals.update(arena.snapshot().facilities); world.scene.updateMatrixWorld(); };
  return { campaign, arena: { ...arena, step(dt: number) { elapsed += dt; animate(); arena.step(dt); }, reset() { elapsed = 0; steps = 0; arena.reset(); animate(); } } };
}

let deliver: ((message: SimToHost) => void) | null = null;
scope.addEventListener('message', event => {
  const message = event.data as SimWorkerInit | SimToHost | { type: 'probe'; id: number; rays: SimCoverRay[] } | { type: 'difficulty'; value: BotDifficulty };
  if (message.type === 'difficulty') { setBotDifficulty(message.value); return; }
  if (message.type === 'probe') { scope.postMessage({ type: 'probed', id: message.id, ...probe?.(message.rays) }); return; }
  if (message.type !== 'init') { deliver?.(message); return; }
  try {
    const start = performance.now(), { arena, campaign } = build(message);
    const host = createSimHost(arena, message.self, { post: out => scope.postMessage(out), listen: handler => { deliver = handler; } }, undefined, campaign);
    scope.postMessage({ type: 'ready', first: host.first(), navigation: arena.navigationGraphStatus(), buildMs: performance.now() - start });
  } catch (error) { scope.postMessage({ type: 'failed', error: String((error as Error)?.stack ?? error) }); }
});
