import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildDistrictWorld } from './district-world';
import { getWalkSurfaces, getTraversalObstacles, surfaceContains } from './vertical-routes';
import { createVerticalMovement } from './vertical-movement';
import { createVerticalNavigator } from './vertical-navigation';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { overlapsObstacle } from './region-collision';
import { canPaddle, MARINA_BRIDGE_PIERS } from './marina-water';
import { MARINA_MAP_ROADS, MARINA_SPAWN } from './marina-scene';
import { MARINA_ESPLANADE, MARINA_HELIX, MARINA_LAWN } from './marina-routes';
import { MARINA_COMBAT_ANCHORS } from './marina-combat';
import { MARINA_STAMPS } from '../data/region-stamps';
import { getFpsDistrict } from './fps-districts';
import { REGION_SECTORS } from '../data/region-sectors';
import { WORLD_ZONES } from './world-zones';

let world: ReturnType<typeof buildDistrictWorld>, movement: ReturnType<typeof createVerticalMovement>, nav: ReturnType<typeof createVerticalNavigator>;
beforeAll(() => {
  world = buildDistrictWorld('marina-bay');
  const config = { bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) };
  movement = createVerticalMovement(config); nav = createVerticalNavigator(config);
});
afterAll(() => world.dispose());

type Point = { x: number; y: number; z: number };
function walk(from: Point, ...legs: { x: number; z: number }[]) {
  let state = { ...from, velocityY: 0 };
  for (const to of legs) {
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - state.x, to.z - state.z) / .1)), dx = (to.x - state.x) / count, dz = (to.z - state.z) / count;
    for (let i = 0; i < count; i++) state = movement.move(state, dx, dz, .025, .4, 1.8);
  }
  return state;
}

it('crosses the bay on the Helix Bridge from quay to quay, on foot', () => {
  const h = MARINA_HELIX, foot = h.z + h.width / 2 + h.stairRun + 1;
  const end = walk({ x: -h.stairX, y: 0, z: foot }, { x: -h.stairX, z: h.z }, { x: h.stairX, z: h.z }, { x: h.stairX, z: foot });
  expect(end.x).toBeCloseTo(h.stairX, 1); expect(end.z).toBeCloseTo(foot, 1); expect(end.y).toBeCloseTo(0, 1);
  const top = walk({ x: -h.stairX, y: 0, z: foot }, { x: -h.stairX, z: h.z }, { x: 0, z: h.z });
  expect(top.y).toBeCloseTo(h.deck, 2);
  // Both stairs at each landing work, and the shore walk continues under the landing.
  const north = walk({ x: h.stairX, y: h.deck, z: h.z }, { x: h.stairX, z: h.z - h.width / 2 - h.stairRun - 1 });
  expect(north.y).toBeCloseTo(0, 1);
  const under = walk({ x: 55.5, y: 0, z: h.z + 6 }, { x: 55.5, z: h.z - 6 });
  expect(under.z).toBeCloseTo(h.z - 6, 1); expect(under.y).toBeCloseTo(0, 2);
});

it('gives bots the bridge as a route between the shores', () => {
  const h = MARINA_HELIX, route = nav.route({ x: -h.stairX, y: 0, z: h.z + 13 }, { x: 20, y: h.deck, z: h.z + h.width / 2 + 1.5 });
  expect(route.length).toBeGreaterThan(1);
  expect(route.at(-1)!.y).toBeCloseTo(h.deck);
});

it('keeps boats off the bridge piers and lets them pass under the deck', () => {
  for (const pier of MARINA_BRIDGE_PIERS) expect(canPaddle((pier.minX + pier.maxX) / 2, MARINA_HELIX.z, 0)).toBe(false);
  for (const x of [-12, 0, 11, 44]) expect(canPaddle(x, MARINA_HELIX.z, 0), `${x}`).toBe(true);
});

it('climbs the Esplanade steps tier by tier, and is stopped by the planted blocks', () => {
  const e = MARINA_ESPLANADE;
  const terrace = walk({ x: -15, y: 0, z: e.foot + 4 }, { x: -15, z: -88 });
  expect(terrace.y).toBeCloseTo(e.terrace.y, 2);
  const concourse = walk({ x: -15, y: 0, z: e.foot + 4 }, { x: -15, z: -98 });
  expect(concourse.y).toBeCloseTo(e.concourse.y, 2); expect(concourse.z).toBeCloseTo(-98, 1);
  const route = nav.route({ x: -24, y: 0, z: e.plazaZ - 4 }, { x: -15, y: e.concourse.y, z: -98 });
  expect(route.length).toBeGreaterThan(0); expect(route.at(-1)!.y).toBeCloseTo(e.concourse.y);
  const [from, to] = e.lowerBlocks[0], blocked = walk({ x: (from + to) / 2, y: 0, z: e.foot + 4 }, { x: (from + to) / 2, z: -88 });
  expect(blocked.z).toBeGreaterThan(e.foot); expect(blocked.y).toBeCloseTo(0, 2);
  for (const [x, z] of [[e.minX - 7, -108], [e.maxX + 7, -108], [-15, e.concourse.maxZ - 8]]) {
    const up = walk({ x, y: 0, z }, { x: x < e.minX ? e.minX + 2 : x > e.maxX ? e.maxX - 2 : x, z: Math.max(z, e.concourse.maxZ + 2) });
    expect(up.y, `${x},${z}`).toBeCloseTo(e.concourse.y, 2);
  }
});

it('raises the east promenade lawn above the boardwalk, with steps and ramps', () => {
  // Walk behind the palms, which stand along the middle of the lawn.
  const l = MARINA_LAWN, z = l.maxZ - 1.4;
  expect(walk({ x: 29, y: 0, z: l.foot - 2 }, { x: 29, z }).y).toBeCloseTo(l.y, 2);
  const across = walk({ x: l.minX - l.ramp - 2, y: 0, z }, { x: l.maxX + l.ramp + 2, z: z });
  expect(across.x).toBeCloseTo(l.maxX + l.ramp + 2, 1); expect(across.y).toBeCloseTo(0, 2);
  // From the road side it is a wall.
  expect(walk({ x: 30, y: 0, z: l.maxZ + 1.4 }, { x: 30, z }).z).toBeGreaterThan(l.maxZ);
});

it('boards the Flyer from the forecourt and walks the ring round the wheel', () => {
  const ring = walk({ x: 154.8, y: 0, z: -141 }, { x: 154.8, z: -152.5 }, { x: 141, z: -152.5 }, { x: 141, z: -167.6 }, { x: 172, z: -167.6 }, { x: 172, z: -155.5 }, { x: 177, z: -156 });
  expect(ring.y).toBeCloseTo(3, 2); expect(ring.x).toBeCloseTo(177, 1);
  expect(walk({ x: 129.5, y: 0, z: -160.25 }, { x: 141, z: -160.25 }).y).toBeCloseTo(3, 2);
  // The undercroft stays open at ground level, through to the stamp under the wheel.
  const stamp = MARINA_STAMPS.find(s => s.name === 'Observation wheel')!;
  const under = walk({ x: 142, y: 0, z: -146 }, { x: 142, z: -160 }, { x: stamp.x, z: stamp.z });
  expect(Math.hypot(under.x - stamp.x, under.z - stamp.z)).toBeLessThan(.5); expect(under.y).toBeCloseTo(0, 2);
  const route = nav.route({ x: 154.8, y: 0, z: -141 }, { x: 168, y: 9, z: -153.5 });
  expect(route.length).toBeGreaterThan(1);
});

it('leaves every road, spawn, stamp, range target and combat anchor on open ground', () => {
  const surfaces = getWalkSurfaces(world.scene), vehicle = verticalVehicleObstacles({ surfaces, traversalObstacles: getTraversalObstacles(world.scene) });
  const routes = new Set(['helix-bridge', 'esplanade-terraces', 'promenade-lawn', 'flyer-terminal']);
  const raised = surfaces.filter(s => routes.has(s.routeId));
  expect(raised.length).toBeGreaterThan(20);
  for (const road of MARINA_MAP_ROADS) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
    for (let n = 0; n <= count; n++) {
      const x = a.x + (b.x - a.x) * n / count, z = a.z + (b.z - a.z) * n / count;
      expect(vehicle.some(o => overlapsObstacle(o, x, z, 1.35)), `road ${x},${z}`).toBe(false);
    }
  }
  const district = getFpsDistrict('marina-bay');
  for (const p of [MARINA_SPAWN, district.spawn, ...district.targets, ...MARINA_STAMPS]) {
    expect(movement.canOccupy(p.x, 0, p.z, .4, 1.8), JSON.stringify(p)).toBe(true);
    expect(movement.supportHeight(p.x, p.z, .01, .4, 1.8), JSON.stringify(p)).toBe(0);
  }
  // Authored ground points are placed at y = 0: none may sit inside a terrace or on a stair.
  const zone = WORLD_ZONES.find(z => z.id === 'marina-bay')!;
  const ground = [...MARINA_COMBAT_ANCHORS, ...REGION_SECTORS['marina-bay'].flatMap(s => s.anchors), ...zone.encounterSpawns, ...Object.values(district.vehicles)];
  for (const p of ground) for (const s of raised)
    expect(Math.max(s.startHeight, s.endHeight) < 2.2 && surfaceContains(s, p.x, p.z, .5), `${JSON.stringify(p)} in ${s.id}`).toBe(false);
  // Sector anchors and encounter spawns must also clear stair feet and their low headroom.
  for (const p of [...REGION_SECTORS['marina-bay'].flatMap(s => s.anchors), ...zone.encounterSpawns])
    expect(movement.canOccupy(p.x, 0, p.z, .4, 1.8), JSON.stringify(p)).toBe(true);
});
