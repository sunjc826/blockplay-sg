import { expect, it } from 'vitest';
import { createVerticalNavigator, type NavigationPoint } from './vertical-navigation';
import { navigationWorldKey, validNavigationBake } from './navigation-bake';
import type { VerticalWorld } from './vertical-movement';

const world: VerticalWorld = { bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, obstacles: [], traversalObstacles: [], surfaces: [
  { id: 'ramp', routeId: 'hall', minX: 0, maxX: 12, minZ: -2, maxZ: 2, axis: 'x', startHeight: 0, endHeight: 3 },
  { id: 'floor', routeId: 'hall', minX: 12, maxX: 24, minZ: -6, maxZ: 6, axis: 'x', startHeight: 3, endHeight: 3 },
] };
const start = { x: 18, y: 0, z: 10 }, goal = { x: 20, y: 3, z: 0 };
const finish = (job: Generator<undefined, NavigationPoint[]>) => { let next = job.next(); while (!next.done) next = job.next(); return next.value; };

it('round-trips the complete directed graph and preserves stair routes without validating static edges at runtime', () => {
  const compiler = createVerticalNavigator(world), data = JSON.parse(JSON.stringify(compiler.bake()));
  expect(validNavigationBake(data)).toBe(true);
  expect(compiler.status().validatedConnections).toBeGreaterThan(0);
  const loaded = createVerticalNavigator(world, [], data), lazy = createVerticalNavigator(world);
  for (const [from, to] of [[start, goal], [goal, start]]) {
    const expected = lazy.route(from, to);
    expect(expected.length).toBeGreaterThan(1);
    expect(loaded.route(from, to)).toEqual(expected);
  }
  expect(loaded.status()).toMatchObject({ source: 'baked', validatedConnections: 0, cachedNodes: data.positions.length / 3 });
});

it('keeps dynamic vehicle avoidance and congestion decisions live on a baked graph', () => {
  const ground = { ...world, surfaces: [] }, anchors = [{ x: -20, z: 0 }, { x: 20, z: 0 }, ...[-7, 7].flatMap(x => [-7, 7].map(z => ({ x, z })))];
  const data = createVerticalNavigator(ground, anchors).bake(), loaded = createVerticalNavigator(ground, anchors, data), lazy = createVerticalNavigator(ground, anchors);
  const from = { x: -20, y: 0, z: 0 }, to = { x: 20, y: 0, z: 0 }, vehicle = { minX: -3, maxX: 3, minZ: -4, maxZ: 4, maxY: 3 };
  for (const side of [-1, 1]) {
    const congestion = (p: NavigationPoint) => p.z * side > 0 ? 100 : 0;
    const path = finish(loaded.plan(from, to, congestion, [vehicle]));
    expect(path).toEqual(finish(lazy.plan(from, to, congestion, [vehicle])));
    expect(path.some(p => Math.abs(p.z) > 4.4)).toBe(true);
  }
  expect(loaded.route(from, to)).toEqual([to]);
  expect(loaded.status().validatedConnections).toBe(0);
});

it('falls back to walking validation for changed geometry or anchors', () => {
  const data = createVerticalNavigator(world).bake();
  const blocked = { ...world, traversalObstacles: [{ minX: -.6, maxX: .6, minZ: -3, maxZ: 3, minY: 0, maxY: 5 }] };
  const nav = createVerticalNavigator(blocked, [], data);
  expect(nav.status()).toMatchObject({ source: 'lazy', rejectedBake: true });
  expect(nav.route({ x: -8, y: 0, z: 0 }, goal)).toEqual([]);
  expect(createVerticalNavigator(world, [{ x: -30, z: -30 }], data).status().rejectedBake).toBe(true);
});

it('preserves lift connections, including their direction and cost', () => {
  const liftWorld: VerticalWorld = { ...world, surfaces: [
    { id: 'lift-bottom', routeId: 'lift', lift: 'lift', minX: -2, maxX: 2, minZ: -2, maxZ: 2, axis: 'x', startHeight: 0, endHeight: 0 },
    { id: 'lift-top', routeId: 'lift', lift: 'lift', minX: -2, maxX: 2, minZ: -2, maxZ: 2, axis: 'x', startHeight: 8, endHeight: 8 },
  ], lifts: [{ id: 'lift', x: 0, z: 0, width: 4, depth: 4, bottom: 0, top: 8, dwell: 2, travel: 4, offset: 0 }] };
  const data = createVerticalNavigator(liftWorld).bake(), loaded = createVerticalNavigator(liftWorld, [], data);
  expect(data.costs).toContain(14);
  for (const [a, b] of [[0, 8], [8, 0]]) {
    const from = { x: 0, y: a, z: 0 }, to = { x: 0, y: b, z: 0 };
    const expected = createVerticalNavigator(liftWorld).route(from, to);
    expect(expected.length).toBeGreaterThan(0);
    expect(loaded.route(from, to)).toEqual(expected);
  }
});

it('rejects malformed graph data instead of trusting indexes from a downloaded asset', () => {
  const data = createVerticalNavigator(world).bake();
  for (const bad of [null, {}, { ...data, version: 0 }, { ...data, positions: [NaN, 0, 0] },
    { ...data, offsets: [0] }, { ...data, targets: [-1] }, { ...data, costs: data.costs.map(() => Infinity) }]) expect(validNavigationBake(bad)).toBe(false);
});

it('accepts cross-engine trig rounding while still detecting meaningful geometry changes', () => {
  const geometry = (z: number) => ({ ...world, obstacles: [{ minX: -30, maxX: -20, minZ: -50, maxZ: z }] });
  expect(navigationWorldKey(geometry(-48.65922011883811), [])).toBe(navigationWorldKey(geometry(-48.659220118838114), []));
  expect(navigationWorldKey(geometry(-48.65922011883811), [])).not.toBe(navigationWorldKey(geometry(-48.658), []));
});
