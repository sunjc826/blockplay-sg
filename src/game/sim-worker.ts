// Worker entry: the arena simulation and its own copy of the district, off the main thread.
// Development only for now (see sim-remote.ts); the district build here is provisional until
// the engine and this worker share one builder.
import { buildDistrictWorld } from './district-world';
import { districtInfrastructure } from './district-infrastructure';
import { expeditionNpcs } from './expedition-npcs';
import { zoneSectors } from './zone-sectors';
import { installStructureLayout } from './structure-layout';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { getBuildingLifts } from './building-lifts';
import { createArena, type ArenaEnvironment, type ArenaVehicleOptions } from './arena-rules';
import { createSceneCover } from './scene-cover';
import { createDropColumnCheck } from './paratrooper-route-validation';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { createFacilityVisuals } from './facility-visuals';
import { createProxyCampaign } from './proxy-operations';
import { createSimHost } from './sim-host';
import type { SimToHost } from './sim-protocol';
import type { WorldZoneId } from './world-zones';

export interface SimWorkerInit { type: 'init'; zone: WorldZoneId; self: string; environment: Partial<ArenaEnvironment>; vehicles?: ArenaVehicleOptions; botCount: number; composition?: string }
const scope = globalThis as unknown as { postMessage(message: unknown): void; addEventListener(type: 'message', handler: (event: MessageEvent) => void): void };

function build(init: SimWorkerInit) {
  const world = buildDistrictWorld(init.zone);
  const { facilitySites, structures } = districtInfrastructure(world, expeditionNpcs(init.zone, zoneSectors(init.zone)));
  installStructureLayout(world, structures);
  createFacilityVisuals(world.scene, facilitySites);
  accelerateInstancedRaycasts(world.scene); world.scene.updateMatrixWorld(true);
  const cover = createSceneCover(world.scene);
  // Everything function-valued is this district's own; the rest is what the engine resolved.
  const environment = { ...world.environment, ...init.environment, proxies: createProxyCampaign(), dropColumnClear: createDropColumnCheck(cover) } as ArenaEnvironment;
  return createArena(world.obstacles, init.botCount, init.composition, environment, init.vehicles,
    { bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene), lifts: getBuildingLifts(world.scene) },
    cover.distance, (from, to) => {
      const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z); if (distance < 1e-8) return null;
      const hit = cover.trace(from, { x: (to.x - from.x) / distance, y: (to.y - from.y) / distance, z: (to.z - from.z) / distance }, distance);
      return hit?.face ? { point: hit.point, normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld) } : null;
    }, cover.sightDistance, () => 'normal');
}

let deliver: ((message: SimToHost) => void) | null = null;
scope.addEventListener('message', event => {
  const message = event.data as SimWorkerInit | SimToHost;
  if (message.type !== 'init') { deliver?.(message); return; }
  try {
    const start = performance.now(), arena = build(message);
    const host = createSimHost(arena, message.self, { post: out => scope.postMessage(out), listen: handler => { deliver = handler; } });
    scope.postMessage({ type: 'ready', first: host.first(), navigation: arena.navigationGraphStatus(), buildMs: performance.now() - start });
  } catch (error) { scope.postMessage({ type: 'failed', error: String((error as Error)?.stack ?? error) }); }
});
