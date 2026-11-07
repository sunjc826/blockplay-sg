import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { instanceStaticMeshes } from './static-instances';
import { withVerticalRoutes, getWalkSurfaces, getTraversalObstacles, type VerticalRoute } from './vertical-routes';
import { sceneFlightObstacles } from './flight-obstacles';
import { buildMarinaScene } from './marina-scene';
import { withSetPieces } from './district-set-pieces';
import { firstVisibleHit } from './fps-raycast';
import { createVerticalMovement } from './vertical-movement';

const route: VerticalRoute = { id: 'pond-bank-walk', name: 'Pond bank walk', width: 4, note: '', points: [
  { x: -206, z: -39, y: 0 }, { x: -194, z: -39, y: 2.4 }, { x: -158, z: -39, y: 2.4 }, { x: -146, z: -39, y: 0 },
] };
const bare = () => ({ scene: new THREE.Scene(), car: new THREE.Group(), stamps: [], obstacles: [], animate() {}, dispose() {} });
const meshes = (root: THREE.Object3D) => { const out: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh) out.push(o); }); return out; };
const triangles = (root: THREE.Object3D) => meshes(root).reduce((sum, m) => sum + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3 * (m instanceof THREE.InstancedMesh ? m.count : 1), 0);
const bounds = (root: THREE.Object3D) => sceneFlightObstacles(root).map(b => Object.values(b).map(n => Math.round(n! * 1000)).join(',')).sort();
function compareRays(a: THREE.Object3D, b: THREE.Object3D, targets: THREE.Vector3[], direction: THREE.Vector3) {
  a.updateWorldMatrix(true, true); b.updateWorldMatrix(true, true);
  for (const target of targets) {
    const ray = new THREE.Raycaster(target.clone().add(new THREE.Vector3(.013, .007, .019)).addScaledVector(direction, -100), direction, 0, 200);
    const x = firstVisibleHit(ray, [a], true, true), y = firstVisibleHit(ray, [b], true, true);
    expect(!!y).toBe(!!x); if (!x || !y) continue;
    expect(y.distance).toBeCloseTo(x.distance, 4);
    const material = (h: THREE.Intersection) => (h.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(material(y).color.getHexString()).toBe(material(x).color.getHexString());
    // Intersecting untextured bars may tie at one surface with different unused UVs.
    if (material(x).map && x.uv && y.uv) expect(x.uv.distanceTo(y.uv)).toBeLessThan(.0001);
    const normal = (hit: THREE.Intersection) => {
      const matrix = hit.object.matrixWorld.clone();
      if (hit.instanceId !== undefined) { const local = new THREE.Matrix4(); (hit.object as THREE.InstancedMesh).getMatrixAt(hit.instanceId, local); matrix.multiply(local); }
      return hit.face!.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
    };
    expect(normal(y).distanceTo(normal(x))).toBeLessThan(.0001);
  }
}

it('instances the shared walkway by segment, retaining movement, flight volumes, surfaces and exact rail hits', () => {
  const a = withVerticalRoutes(bare(), [route], { batchParts: false }), b = withVerticalRoutes(bare(), [route]);
  try {
    expect(meshes(a.scene)).toHaveLength(139); expect(meshes(b.scene)).toHaveLength(7);
    expect(triangles(b.scene)).toBe(triangles(a.scene));
    expect(getWalkSurfaces(b.scene)).toEqual(getWalkSurfaces(a.scene));
    expect(getTraversalObstacles(b.scene)).toEqual(getTraversalObstacles(a.scene));
    expect(bounds(b.scene)).toEqual(bounds(a.scene));
    a.scene.updateMatrixWorld(true);
    const targets = meshes(a.scene).map(m => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
    targets.push(...Array.from({ length: 121 }, (_, i) => new THREE.Vector3(-206 + i * .5, 2.9, -39)));
    for (const direction of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)]) compareRays(a.scene, b.scene, targets, direction);
    const movement = [a, b].map(w => createVerticalMovement({ bounds: { minX: -220, maxX: -130, minZ: -60, maxZ: -20 }, obstacles: w.obstacles, surfaces: getWalkSurfaces(w.scene), traversalObstacles: getTraversalObstacles(w.scene) }));
    for (const radius of [.38, .65]) for (const points of [route.points, [...route.points].reverse()]) {
      let states = movement.map(() => ({ ...points[0], velocityY: 0 }));
      for (let segment = 1; segment < points.length; segment++) {
        const from = points[segment - 1], to = points[segment], steps = Math.ceil(Math.abs(to.x - from.x) / .2);
        for (let i = 0; i < steps; i++) { states = states.map((state, j) => movement[j].move(state, (to.x - from.x) / steps, 0, .05, radius)); expect(states[1]).toEqual(states[0]); }
      }
      // Walking into a deck guardrail stops in the same place.
      states = movement.map(() => ({ x: -176, y: 2.4, z: -39, velocityY: 0 }));
      for (let i = 0; i < 30; i++) { states = states.map((state, j) => movement[j].move(state, 0, .2, .05, radius)); expect(states[1]).toEqual(states[0]); }
    }
    const batches = meshes(b.scene).filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh), disposed = vi.fn();
    batches.forEach(m => m.addEventListener('dispose', disposed)); b.dispose(); b.dispose(); expect(disposed).toHaveBeenCalledTimes(batches.length);
  } finally { a.dispose(); b.dispose(); }
});

it('keeps Flyer geometry, capsule counter-rotation, ray hits and individual flight bounds while reducing 242 meshes to 50', () => {
  const a = withSetPieces('marina-bay', buildMarinaScene({ batchFlyer: false })), b = withSetPieces('marina-bay', buildMarinaScene());
  const roots = [a, b].map(w => w.scene.getObjectByName('marina-flyer-wheel')!);
  try {
    expect(meshes(roots[0])).toHaveLength(242); expect(meshes(roots[1])).toHaveLength(50);
    expect(triangles(roots[1])).toBe(triangles(roots[0])); expect(b.obstacles).toEqual(a.obstacles);
    for (const time of [0, 137, 641]) {
      a.animate(time); b.animate(time); roots.forEach(r => r.updateWorldMatrix(true, true));
      expect(bounds(roots[1])).toEqual(bounds(roots[0]));
      const pods = roots.map(r => r.children.filter(o => o.name === 'marina-flyer-capsule'));
      expect(pods[1]).toHaveLength(16);
      for (let i = 0; i < 16; i++) {
        expect(pods[1][i].matrixWorld.elements).toEqual(pods[0][i].matrixWorld.elements);
        expect(new THREE.Vector3(0, 1, 0).transformDirection(pods[1][i].matrixWorld).y).toBeCloseTo(1, 8);
      }
      const targets = meshes(roots[0]).map(m => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
      compareRays(roots[0], roots[1], targets, new THREE.Vector3(0, 0, 1));
    }
    const batches = meshes(roots[1]).filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh), disposed = vi.fn();
    batches.forEach(m => m.addEventListener('dispose', disposed)); b.dispose(); expect(disposed).toHaveBeenCalledTimes(batches.length);
  } finally { a.dispose(); }
});

it('does not combine transparency, differing shadow flags, hidden parts or independently animated child groups', () => {
  const parent = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(geometry, material), b = new THREE.Mesh(geometry, material), shadow = new THREE.Mesh(geometry, material), hidden = new THREE.Mesh(geometry, material);
  shadow.castShadow = true; hidden.visible = false; parent.add(a, b, shadow, hidden);
  const pivot = new THREE.Group(), child = new THREE.Mesh(geometry, material); pivot.add(child); parent.add(pivot);
  const glass = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ transparent: true })); parent.add(glass);
  const batches = instanceStaticMeshes(parent);
  expect(batches).toHaveLength(1); expect(batches[0].count).toBe(2); expect(batches[0].geometry).toBe(geometry);
  for (const object of [shadow, hidden, pivot, glass]) expect(object.parent).toBe(parent);
  expect(child.parent).toBe(pivot); batches.forEach(m => m.dispose()); geometry.dispose(); material.dispose(); glass.material.dispose();
});
