import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { inspectVerticalPlaces, type DiagnosticPlace } from './vertical-place-diagnostics';
import { REGIONS } from './regions';
import { getVerticalPlaces } from './vertical-places';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createVerticalMovement } from './vertical-movement';
import { measureVerticality } from './verticality-metrics';

const floor = { id: 'floor', x: 0, y: 3, z: 0, width: 8, depth: 8 };
const place: DiagnosticPlace = { id: 'test', floors: [floor], connections: [{ id: 'stairs', width: 3, from: { x: -12, y: 0, z: 0 }, to: { x: -4, y: 3, z: 0 } }] };
const world = { bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, obstacles: [], traversalObstacles: [], surfaces: [
  { id: 'floor', routeId: 'test', axis: 'x' as const, minX: -4, maxX: 4, minZ: -4, maxZ: 4, startHeight: 3, endHeight: 3 },
  { id: 'stairs', routeId: 'test', axis: 'x' as const, minX: -12, maxX: -4, minZ: -1.5, maxZ: 1.5, startHeight: 0, endHeight: 3 },
] };
describe('connected-place diagnostics', () => {
  it('uses real movement and reports omitted visual head obstructions', () => {
    const scene = new THREE.Scene();
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(8, .2, 8), new THREE.MeshBasicMaterial());
    ceiling.name = 'unregistered ceiling'; ceiling.position.set(0, 4.4, 0); scene.add(ceiling);
    const report = inspectVerticalPlaces(scene, world, [place])[0];
    expect(report.connections[0].forward).toBe(true);
    expect(report.connections[0].reverse).toBe(true);
    expect(report.floors[0].meshClearanceWarnings.length).toBeGreaterThan(0);
    expect(report.floors[0].meshClearanceWarnings[0].meshes).toContain('unregistered ceiling');
    ceiling.geometry.dispose(); (ceiling.material as THREE.Material).dispose();
  });
  it('does not mistake a supporting slab for blocked body space', () => {
    const scene = new THREE.Scene();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8, .2, 8), new THREE.MeshBasicMaterial());
    slab.position.set(0, 2.9, 0); scene.add(slab);
    expect(inspectVerticalPlaces(scene, world, [place])[0].floors[0].meshClearanceWarnings).toEqual([]);
    slab.geometry.dispose(); (slab.material as THREE.Material).dispose();
  });
  it('connects touching floor pieces only when the shared boundary is traversable', () => {
    const joined = { ...place, floors: [floor, { ...floor, id: 'next', x: 8 }], connections: [] };
    const input = { ...world, surfaces: [...world.surfaces, { ...world.surfaces[0], id: 'next', minX: 4, maxX: 12 }] };
    expect(inspectVerticalPlaces(new THREE.Scene(), input, [joined])[0].topology.components).toBe(1);
    const blocked = { ...input, traversalObstacles: [{ minX: 3.8, maxX: 4.2, minZ: -4, maxZ: 4, minY: 3, maxY: 5 }] };
    expect(inspectVerticalPlaces(new THREE.Scene(), blocked, [joined])[0].topology.components).toBe(2);
  });
  it('detects an obstructed stair head even when metadata declares a connection', () => {
    const blocked = { ...world, traversalObstacles: [{ minX: -5, maxX: -3, minZ: -2, maxZ: 2, minY: 3, maxY: 5 }] };
    const report = inspectVerticalPlaces(new THREE.Scene(), blocked, [place])[0];
    expect(report.connections[0].forward).toBe(false);
  });
});

for (const region of REGIONS) it(`${region.id}: inhabited floors are reached through shipped walking geometry`, async () => {
  // Let the worker flush progress between the district-sized lattice traversals.
  await new Promise(resolve => setTimeout(resolve, 0));
  const built = region.build();
  try {
    const places = getVerticalPlaces(built.scene);
    const input = { bounds: region.bounds, spawn: region.spawn, obstacles: built.obstacles, surfaces: getWalkSurfaces(built.scene), traversalObstacles: getTraversalObstacles(built.scene) };
    const movement = createVerticalMovement(input);
    for (const place of places) for (const connection of place.connections) {
      const length = Math.hypot(connection.to.x-connection.from.x, connection.to.z-connection.from.z);
      const offset = Math.max(0, connection.width/2-.9);
      for (const lateral of [-offset,0,offset]) {
        const shift = (p: typeof connection.from) => ({ x: p.x-(connection.to.z-connection.from.z)/length*lateral, y: p.y, z: p.z+(connection.to.x-connection.from.x)/length*lateral });
        for (const [a,b] of [[shift(connection.from),shift(connection.to)],[shift(connection.to),shift(connection.from)]]) {
          const moved = movement.move({ ...a, velocityY: 0 }, b.x-a.x,b.z-a.z,0,.65,1.8);
          const label = `${place.id}/${connection.id}, wider walker, lateral ${lateral}`;
          expect(Math.hypot(moved.x-b.x,moved.z-b.z), label).toBeLessThan(.05);
          expect(Math.abs(moved.y-b.y), label).toBeLessThan(.08);
        }
      }
    }
    const measured = measureVerticality(input);
    const reports = inspectVerticalPlaces(built.scene, input, places, measured.isReachable);
    for (const report of reports) {
      for (const connection of report.connections) {
        expect(connection.forward, `${report.id}/${connection.id} ascent`).toBe(true);
        expect(connection.reverse, `${report.id}/${connection.id} descent`).toBe(true);
      }
      for (const floor of report.floors) {
        expect(floor.standingSamples, `${report.id}/${floor.id} standing room`).toBeGreaterThan(0);
        expect(floor.spawnReachableSamples, `${report.id}/${floor.id} spawn access`).toBeGreaterThan(0);
      }
    }
  } finally { built.dispose(); }
}, 120000);
