import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createSceneRayIndex } from './scene-ray-index';
import { firstVisibleHit, isVisibleHit } from './fps-raycast';
import { createSceneCover } from './scene-cover';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { accelerateMeshRaycast } from './mesh-raycast';

const box = (x = 0, z = -5) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()); m.position.set(x, 0, z); m.updateMatrixWorld(true); return m; };
const ray = (x = 0, far = 100) => new THREE.Raycaster(new THREE.Vector3(x, 0, 0), new THREE.Vector3(0, 0, -1), 0, far);
const hit = (h?: THREE.Intersection) => h ? { object: h.object.id, distance: h.distance, face: h.faceIndex, instance: h.instanceId, point: h.point.toArray(), normal: h.normal?.toArray(), uv: h.uv?.toArray(), faceNormal: h.face?.normal.toArray(), material: h.face?.materialIndex } : null;
const compare = (index: ReturnType<typeof createSceneRayIndex>, objects: THREE.Mesh[], r = ray(), foliage = false, glass = false) => {
  const expected = firstVisibleHit(r, objects, foliage, glass);
  expect(hit(firstVisibleHit(r, index.candidates(r), foliage, glass))).toEqual(hit(expected));
  expect(hit(index.nearestHit(r, h => isVisibleHit(h, foliage, glass)))).toEqual(hit(expected));
  return expected;
};

it('prunes distant mesh calls while preserving ordering, layers, near/far and rays inside bounds', () => {
  const objects = Array.from({ length: 80 }, (_, i) => box(i * 10));
  const tie = box(); objects.push(tie);
  const index = createSceneRayIndex(); index.setObjects(objects);
  // Count native calls after construction without replacing the mesh raycast.
  const spy = vi.spyOn(THREE.Mesh.prototype, 'raycast');
  try {
    expect(firstVisibleHit(ray(), index.candidates(ray()))?.object).toBe(objects[0]);
    expect(spy.mock.calls.length).toBeLessThan(5);
    for (const r of [ray(), ray(0, 4.49), ray(0, 4.5), ray(10), new THREE.Raycaster(new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, -1))]) compare(index, objects, r);
    objects[0].layers.set(1); compare(index, objects);
    const clipped = ray(); clipped.near = 5; compare(index, objects, clipped);
    objects[0].position.x = .5; objects[0].updateMatrixWorld(true); compare(index, objects);
  } finally { spy.mockRestore(); }
});

it('refits moved and replaced geometry and instance matrices/count before the next query', () => {
  const moving = box(20), index = createSceneRayIndex(); index.setObjects([moving]); compare(index, [moving]);
  moving.position.x = 0; moving.rotation.y = .4; moving.scale.set(2, 1, .7); moving.updateMatrixWorld(true);
  expect(compare(index, [moving])).toBeDefined();
  moving.position.x = 20; moving.rotation.y = 0; moving.updateMatrixWorld(true);
  moving.geometry = new THREE.BoxGeometry(50, 2, 1); expect(compare(index, [moving])).toBeDefined();
  moving.geometry.scale(.01, 1, 1); moving.geometry.computeBoundingBox(); moving.geometry.computeBoundingSphere(); expect(compare(index, [moving])).toBeUndefined();
  const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 40);
  for (let i = 0; i < 40; i++) instances.setMatrixAt(i, new THREE.Matrix4().makeTranslation(30 + i, 0, -5));
  instances.computeBoundingSphere(); accelerateInstancedRaycasts(instances); index.setObjects([instances]);
  expect(compare(index, [instances])).toBeUndefined();
  instances.setMatrixAt(3, new THREE.Matrix4().makeTranslation(0, 0, -5)); instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere();
  expect(compare(index, [instances])?.instanceId).toBe(3);
  instances.count = 2; expect(compare(index, [instances])).toBeUndefined();
});

it('retains custom, deformed and recursive raycasts, including changes after indexing', () => {
  const parent = box(30), index = createSceneRayIndex(); index.setObjects([parent]);
  const child = box(-30); parent.add(child); parent.updateMatrixWorld(true);
  expect(compare(index, [parent])?.object).toBe(child);
  parent.remove(child);
  parent.raycast = (r, hits) => { hits.push({ distance: 2, point: r.ray.at(2, new THREE.Vector3()), object: parent }); };
  expect(compare(index, [parent])?.distance).toBe(2);
  parent.raycast = THREE.Mesh.prototype.raycast;
  const pos = parent.geometry.getAttribute('position') as THREE.BufferAttribute; pos.setUsage(THREE.DynamicDrawUsage);
  parent.position.x = 0; parent.updateMatrixWorld(true); expect(compare(index, [parent])).toBeDefined();
  const morph = box(30); morph.geometry.morphAttributes.position = [morph.geometry.getAttribute('position').clone()]; morph.updateMorphTargets();
  index.setObjects([morph]); expect(index.candidates(ray())).toContain(morph);
  const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); index.setObjects([skin]); expect(index.candidates(ray())).toContain(skin);
});

it('does not prune a static custom accelerator against replacement geometry', () => {
  const mesh = box(), dispose = accelerateMeshRaycast(mesh), index = createSceneRayIndex(); index.setObjects([mesh]);
  expect(compare(index, [mesh])).toBeDefined();
  mesh.geometry = new THREE.BoxGeometry().translate(100, 0, 0);
  // The old accelerator still uses its original proxies until disposed.
  expect(compare(index, [mesh])).toBeDefined(); dispose(); compare(index, [mesh]);
});

it('keeps foliage, glass, visibility, detachment and scene membership refresh semantics', () => {
  vi.useFakeTimers(); vi.spyOn(performance, 'now').mockReturnValue(0);
  try {
    const scene = new THREE.Scene(), foliage = box(0, -2), glass = box(0, -4), wall = box(0, -6);
    foliage.userData.visualCover = true; glass.material.userData.bulletGlass = true; scene.add(foliage, glass, wall);
    const cover = createSceneCover(scene), from = { x: 0, y: 0, z: 0 }, direction = { x: 0, y: 0, z: -1 };
    expect(cover.distance(from, direction, 20)).toBe(5.5); expect(cover.sightDistance(from, direction, 20)).toBe(1.5); expect(cover.trace(from, direction, 20)?.distance).toBe(3.5);
    foliage.visible = false; glass.removeFromParent(); expect(cover.trace(from, direction, 20)?.object).toBe(wall);
    wall.position.x = 30; scene.updateMatrixWorld(true); expect(cover.distance(from, direction, 20)).toBe(20);
    const added = box(0, -3); scene.add(added); expect(cover.distance(from, direction, 20)).toBe(20);
    vi.mocked(performance.now).mockReturnValue(251); expect(cover.distance(from, direction, 20)).toBe(2.5);
  } finally { vi.restoreAllMocks(); vi.useRealTimers(); }
});

it('prunes surfaces behind the closest eligible hit without clipping the native ray', () => {
  const objects = Array.from({ length: 160 }, (_, i) => box(0, -2 - i * 2)).reverse();
  const index = createSceneRayIndex(); index.setObjects(objects); index.refresh();
  const r = ray(0, 400), expected = firstVisibleHit(r, objects);
  const spy = vi.spyOn(THREE.Mesh.prototype, 'raycast');
  try {
    expect(hit(index.nearestHit(r, h => isVisibleHit(h)))).toEqual(hit(expected));
    expect(spy.mock.calls.length).toBeLessThan(10);
    expect(r.far).toBe(400); expect(r.near).toBe(0);
    // An ignored close surface is never allowed to tighten the search distance.
    for (const mesh of objects.slice(-12)) mesh.userData.visualCover = true;
    expect(hit(index.nearestHit(r, h => isVisibleHit(h)))).toEqual(hit(firstVisibleHit(r, objects)));
    expect(hit(index.nearestHit(r, h => isVisibleHit(h, true)))).toEqual(hit(firstVisibleHit(r, objects, true)));
  } finally { spy.mockRestore(); }
});

it('keeps equal-distance scene order across tree branches and unbounded fallbacks', () => {
  const native = box(), custom = box(100), farther = box(0, -40);
  custom.raycast = (r, hits) => {
    expect(r.far).toBe(100);
    hits.push({ distance: 4.5, point: r.ray.at(4.5, new THREE.Vector3()), object: custom, faceIndex: 17 });
  };
  for (const first of [native, custom]) {
    const objects = [first, ...Array.from({ length: 40 }, (_, i) => box((i % 2 ? 1 : -1) * 20, -i * 2)), first === native ? custom : native, farther];
    const index = createSceneRayIndex(); index.setObjects(objects); index.refresh();
    expect(compare(index, objects)?.object).toBe(first);
    const skipped = (object: THREE.Object3D) => object !== first;
    expect(hit(index.nearestHit(ray(), h => isVisibleHit(h), skipped))).toEqual(hit(firstVisibleHit(ray(), objects.filter(skipped))));
  }
});

it('matches native nearest hits across seeded rays, geometry changes and ray policies', () => {
  let seed = 17; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const objects = Array.from({ length: 100 }, (_, i) => {
    const mesh = box((random() - .5) * 50, (random() - .5) * 50);
    mesh.position.y = (random() - .5) * 8; mesh.rotation.set(random(), random(), random()); mesh.scale.set(.5 + random() * 5, .5 + random() * 5, .5 + random() * 5);
    mesh.material.side = THREE.DoubleSide;
    if (i % 5 === 0) mesh.userData.visualCover = true;
    if (i % 7 === 0) mesh.material.userData.bulletGlass = true;
    if (i % 11 === 0) mesh.visible = false;
    if (i % 13 === 0) mesh.layers.set(1);
    mesh.updateMatrixWorld(true); return mesh;
  });
  const index = createSceneRayIndex(); index.setObjects(objects);
  for (let frame = 0; frame < 3; frame++) {
    for (const m of objects) { m.position.x += (random() - .5) * 2; m.updateMatrixWorld(true); }
    for (let i = 0; i < 250; i++) {
      const r = new THREE.Raycaster(new THREE.Vector3((random() - .5) * 50, (random() - .5) * 6, (random() - .5) * 50), new THREE.Vector3(random() - .5, (random() - .5) * .3, random() - .5).normalize(), i % 3 ? 0 : 2, i % 4 ? 100 : 8);
      if (i % 5 === 0) r.layers.set(1);
      compare(index, objects, r, i % 2 === 0, i % 3 === 0);
    }
  }
});
