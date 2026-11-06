import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createGameplayRayIndex } from './gameplay-ray-index';
import { visibleHits } from './fps-raycast';
import { accelerateInstancedRaycasts } from './instanced-raycast';

const include = (o: THREE.Object3D) => !o.userData.fpsEffect;
const material = new THREE.MeshBasicMaterial();
const box = (x: number, y: number, z: number, size = 1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(size, size * 2, size), material); m.position.set(x, y, z); return m; };

/** A small district: static scenery, nested groups, instances, figures, effects, non-mesh raycasts. */
function district() {
  const scene = new THREE.Scene();
  const scenery = new THREE.Group();
  for (let i = 0; i < 60; i++) scenery.add(box((i % 10) * 6 - 27, 0, Math.floor(i / 10) * -6 - 4, 1 + (i % 3) * .5));
  const block = new THREE.Group(); block.position.set(4, 1, -20); block.rotation.y = .3;
  const wing = box(0, 0, 0, 3); wing.add(box(3, 0, 0)); block.add(wing); // a mesh with a child mesh
  scenery.add(block);
  const glass = box(0, 0, -3, 2); glass.material = new THREE.MeshBasicMaterial(); glass.material.userData.bulletGlass = true; scenery.add(glass);
  const shrub = box(-3, 0, -3); shrub.userData.visualCover = true; scenery.add(shrub);
  const hidden = box(2, 0, -8); hidden.visible = false; scenery.add(hidden);
  const layered = box(-2, 0, -12); layered.layers.set(2); scenery.add(layered);
  const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, 3, .5), material, 50);
  for (let i = 0; i < 50; i++) instances.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i - 25, 0, -30 + (i % 5)));
  instances.computeBoundingSphere(); accelerateInstancedRaycasts(instances);
  const points = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1, 0, -15), new THREE.Vector3(-1, 0, -25)]));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5, -1, -9), new THREE.Vector3(5, 1, -9)]));
  const figure = new THREE.Group(); figure.userData.arenaActorId = 'bot-1'; figure.position.set(0, 0, -6); figure.add(box(0, 0, 0, .6));
  const ally = new THREE.Group(); ally.userData.arenaActorId = 'bot-2'; ally.position.set(1.5, 0, -10); ally.add(box(0, 0, 0, .6));
  const effect = new THREE.Group(); effect.userData.fpsEffect = true; effect.add(box(0, 0, -2, 4));
  scene.add(scenery, instances, points, line, figure, ally, effect);
  scene.updateMatrixWorld(true);
  return { scene, figure, ally, scenery, instances };
}

const describe = (hits: THREE.Intersection[]) => hits.map(h => [h.object.id, h.distance.toFixed(9), h.faceIndex ?? null, h.instanceId ?? null, h.index ?? null]);
function rays(count: number, seed = 7) {
  let s = seed; const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, () => {
    const origin = new THREE.Vector3(random() * 20 - 10, random() * 2 - 1, random() * 4);
    const direction = new THREE.Vector3(random() * 1.4 - .7, random() * .3 - .15, -1).normalize();
    return new THREE.Raycaster(origin, direction, 0, 5 + random() * 40);
  });
}
function expectSame(scene: THREE.Scene, index: ReturnType<typeof createGameplayRayIndex>, skipActor?: string, limit = 6, foliage = false, glass = false) {
  let struck = 0;
  for (const ray of rays(300)) {
    const skip = skipActor ? (root: THREE.Object3D) => root.userData.arenaActorId === skipActor : undefined;
    const roots = scene.children.filter(o => include(o) && !skip?.(o));
    const before = describe(visibleHits(ray, roots, limit, foliage, glass));
    expect(describe(visibleHits(ray, index.query(ray, skip), limit, foliage, glass, false))).toEqual(before);
    if (before.length) struck++;
  }
  expect(struck).toBeGreaterThan(150);
}

it('finds the same hits in the same order as a recursive raycast of the gameplay roots', () => {
  const { scene } = district(), index = createGameplayRayIndex(scene, include); index.refresh();
  expectSame(scene, index); expectSame(scene, index, undefined, 1); expectSame(scene, index, undefined, 20, true, true);
});

it('leaves out the shooter\'s own figure and only that', () => {
  const { scene } = district(), index = createGameplayRayIndex(scene, include); index.refresh();
  expectSame(scene, index, 'bot-1'); expectSame(scene, index, 'bot-2');
});

it('follows figures that move, objects added and removed, and instances changed, after the next refresh', () => {
  const { scene, figure, ally, scenery, instances } = district(), index = createGameplayRayIndex(scene, include); index.refresh();
  figure.position.set(-4, 0, -14); ally.removeFromParent(); scenery.add(box(0, 0, -5));
  instances.setMatrixAt(7, new THREE.Matrix4().makeTranslation(0, 0, -7)); instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere();
  scene.updateMatrixWorld(true); index.refresh();
  expectSame(scene, index); expectSame(scene, index, 'bot-1');
});

it('prunes far scenery instead of raycasting every mesh', () => {
  const { scene } = district(), index = createGameplayRayIndex(scene, include); index.refresh();
  const spy = vi.spyOn(THREE.Mesh.prototype, 'raycast');
  try {
    const ray = new THREE.Raycaster(new THREE.Vector3(-27, 0, 0), new THREE.Vector3(0, 0, -1), 0, 8);
    visibleHits(ray, index.query(ray), 1, false, false, false);
    expect(spy.mock.calls.length).toBeLessThan(10);
  } finally { spy.mockRestore(); }
});

it('refits many moved entries to the same boxes as refitting each one', async () => {
  const { createRayBoundsTree } = await import('./ray-bounds-tree');
  let s = 3; const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const make = () => Array.from({ length: 200 }, (_, order) => { const c = new THREE.Vector3(random() * 100, random() * 10, random() * 100); return { order, box: new THREE.Box3(c.clone().subScalar(.5), c.clone().addScalar(.5)) }; });
  const a = make(); s = 3; const b = make();
  const one = createRayBoundsTree(a), many = createRayBoundsTree(b);
  const moved = [5, 17, 18, 60, 61, 62, 150, 199];
  for (const i of moved) { const shift = new THREE.Vector3(random() * 80 - 40, 0, random() * 80 - 40); a[i].box.translate(shift); b[i].box.translate(shift); one.refit(a[i]); }
  many.refitMany(moved.map(i => b[i]));
  let total = 0;
  for (let i = 0; i < 200; i++) {
    const ray = new THREE.Ray(new THREE.Vector3(random() * 100, 5, -10), new THREE.Vector3(random() * .6 - .3, 0, 1).normalize());
    const found = (tree: typeof one) => { const out: { order: number; box: THREE.Box3 }[] = []; tree.query(ray, out, 150); return out.map(e => e.order).sort((x, y) => x - y); };
    const expected = found(one); total += expected.length;
    expect(found(many)).toEqual(expected);
  }
  expect(total).toBeGreaterThan(20);
});
