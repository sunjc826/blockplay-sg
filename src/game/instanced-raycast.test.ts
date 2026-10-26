import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { accelerateInstancedRaycasts, MIN_INSTANCES } from './instanced-raycast';

function random(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

/** A street's worth of boxes, turned and stretched, under a parent that is itself moved and scaled. */
function scenery(seed: number, count = 600) {
  const rand = random(seed);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), count);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    position.set(rand() * 200 - 100, rand() * 30, rand() * 200 - 100);
    rotation.setFromEuler(new THREE.Euler(rand() * .4, rand() * Math.PI * 2, rand() * .4));
    scale.set(.3 + rand() * 6, .3 + rand() * 12, .3 + rand() * 6);
    mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
  }
  const parent = new THREE.Group(); parent.position.set(12, -2, 7); parent.rotation.y = .7; parent.scale.set(1.3, .9, 1.1);
  parent.add(mesh); parent.updateMatrixWorld(true);
  return { mesh, parent, rand };
}

function rays(rand: () => number, n: number) {
  return Array.from({ length: n }, () => {
    const origin = new THREE.Vector3(rand() * 240 - 120, rand() * 40, rand() * 240 - 120);
    const direction = new THREE.Vector3(rand() - .5, (rand() - .5) * .6, rand() - .5).normalize();
    // Mostly short bullet steps, some unlimited.
    const far = rand() < .25 ? Infinity : 2 + rand() * 60, near = rand() < .2 ? rand() * 5 : 0;
    return { origin, direction, near, far };
  });
}

const summary = (hits: THREE.Intersection[]) => hits.map(h => `${h.instanceId}:${h.distance.toFixed(6)}:${h.faceIndex}`).sort();

describe('instanced raycasts through an instance tree', () => {
  it('finds exactly the hits three finds by testing every instance', () => {
    const { mesh, parent, rand } = scenery(7);
    const caster = new THREE.Raycaster();
    const cases = rays(rand, 400);
    const expected = cases.map(({ origin, direction, near, far }) => { caster.set(origin, direction); caster.near = near; caster.far = far; return summary(caster.intersectObject(parent, true)); });
    expect(accelerateInstancedRaycasts(parent)).toBe(1);
    expect(mesh.raycast).not.toBe(THREE.InstancedMesh.prototype.raycast);
    const actual = cases.map(({ origin, direction, near, far }) => { caster.set(origin, direction); caster.near = near; caster.far = far; return summary(caster.intersectObject(parent, true)); });
    expect(actual).toEqual(expected);
    // Not a vacuous match: plenty of rays strike something.
    expect(expected.filter(hits => hits.length).length).toBeGreaterThan(50);
  });

  it('rebuilds when the instances move', () => {
    const { mesh, parent } = scenery(11, 64);
    accelerateInstancedRaycasts(parent);
    const caster = new THREE.Raycaster(new THREE.Vector3(500, 5, 500), new THREE.Vector3(0, -1, 0));
    expect(caster.intersectObject(parent, true)).toHaveLength(0);
    // Move instance 3 under the ray, in the mesh's own space.
    const under = new THREE.Vector3(500, 0, 500).applyMatrix4(mesh.matrixWorld.clone().invert());
    mesh.setMatrixAt(3, new THREE.Matrix4().makeTranslation(under.x, under.y, under.z)); mesh.instanceMatrix.needsUpdate = true;
    // As for three's own raycast, the mesh's bounding sphere has to grow to take it in.
    mesh.computeBoundingSphere();
    expect(caster.intersectObject(parent, true).map(hit => hit.instanceId)).toContain(3);
  });

  it('leaves small, dynamic and already customised meshes alone', () => {
    const small = scenery(3, MIN_INSTANCES - 1).mesh;
    const dynamic = scenery(4, 100).mesh; dynamic.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const custom = scenery(5, 100).mesh; const none = () => {}; custom.raycast = none;
    const root = new THREE.Group(); root.add(small, dynamic, custom);
    expect(accelerateInstancedRaycasts(root)).toBe(0);
    expect(small.raycast).toBe(THREE.InstancedMesh.prototype.raycast);
    expect(dynamic.raycast).toBe(THREE.InstancedMesh.prototype.raycast);
    expect(custom.raycast).toBe(none);
  });
});
