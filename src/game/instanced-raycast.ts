import * as THREE from 'three';

/**
 * Faster rays through large instanced scenery. Three tests every instance of
 * an InstancedMesh against every ray: a district's street furniture and
 * facade boxes run to thousands of instances per mesh, so one bullet step
 * cost most of a millisecond. Here each such mesh keeps a bounding-volume
 * tree over its instances' boxes and a ray only tests the instances whose box
 * it can reach before its `far`. Hits are exactly three's: the same
 * per-instance test runs on fewer instances.
 *
 * Only meshes whose instances are static (StaticDrawUsage) are accelerated.
 * Should their matrices change anyway (`instanceMatrix.needsUpdate`, or a new
 * `count`), the tree is rebuilt on the next ray.
 */

/** Below this, testing every instance is as quick as walking a tree. */
export const MIN_INSTANCES = 32;
const LEAF = 4;

interface InstanceTree {
  count: number; version: number;
  /** Instance ids, grouped so each leaf's are contiguous. */
  order: Uint32Array;
  /** Per node: min xyz, max xyz in the mesh's own space. */
  bounds: Float32Array;
  /** Per node: first index into `order` and how many (leaves), or -1 and the right child (inner nodes; the left child follows its parent). */
  first: Int32Array; size: Int32Array;
}

const trees = new WeakMap<THREE.InstancedMesh, InstanceTree>();

function buildTree(mesh: THREE.InstancedMesh): InstanceTree {
  const count = mesh.count, geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const boxes = new Float32Array(count * 6), centres = new Float32Array(count * 3);
  const box = new THREE.Box3(), matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, matrix); box.copy(geometry.boundingBox!).applyMatrix4(matrix);
    boxes.set([box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z], i * 6);
    centres.set([(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2], i * 3);
  }
  const order = new Uint32Array(count).map((_, i) => i);
  // Every leaf holds at least one instance, so a binary tree needs fewer than twice as many nodes.
  const nodes = Math.max(1, 2 * count - 1);
  const bounds = new Float32Array(nodes * 6), first = new Int32Array(nodes), size = new Int32Array(nodes);
  let used = 0;
  const build = (start: number, end: number): number => {
    const node = used++;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
    for (let i = start; i < end; i++) {
      const b = order[i] * 6, c = order[i] * 3;
      x0 = Math.min(x0, boxes[b]); y0 = Math.min(y0, boxes[b + 1]); z0 = Math.min(z0, boxes[b + 2]);
      x1 = Math.max(x1, boxes[b + 3]); y1 = Math.max(y1, boxes[b + 4]); z1 = Math.max(z1, boxes[b + 5]);
      cx0 = Math.min(cx0, centres[c]); cy0 = Math.min(cy0, centres[c + 1]); cz0 = Math.min(cz0, centres[c + 2]);
      cx1 = Math.max(cx1, centres[c]); cy1 = Math.max(cy1, centres[c + 1]); cz1 = Math.max(cz1, centres[c + 2]);
    }
    bounds.set([x0, y0, z0, x1, y1, z1], node * 6);
    if (end - start <= LEAF) { first[node] = start; size[node] = end - start; return node; }
    // Median split along the widest spread of centres.
    const spread = [cx1 - cx0, cy1 - cy0, cz1 - cz0], axis = spread.indexOf(Math.max(...spread));
    order.subarray(start, end).sort((a, b) => centres[a * 3 + axis] - centres[b * 3 + axis]);
    const middle = (start + end) >> 1;
    build(start, middle);
    first[node] = -1; size[node] = build(middle, end);
    return node;
  };
  if (count) build(0, count);
  return { count, version: mesh.instanceMatrix.version, order, bounds: bounds.subarray(0, used * 6), first: first.subarray(0, used), size: size.subarray(0, used) };
}

function treeOf(mesh: THREE.InstancedMesh) {
  let tree = trees.get(mesh);
  if (!tree || tree.count !== mesh.count || tree.version !== mesh.instanceMatrix.version) { tree = buildTree(mesh); trees.set(mesh, tree); }
  return tree;
}

const probe = new THREE.Mesh(), found: THREE.Intersection[] = [];
const sphere = new THREE.Sphere(), inverse = new THREE.Matrix4(), local = new THREE.Ray(), end = new THREE.Vector3();
const instanceLocal = new THREE.Matrix4(), instanceWorld = new THREE.Matrix4();
let stack = new Int32Array(64);

/** Drop-in for `InstancedMesh.prototype.raycast`, walking the instance tree. */
export function raycastInstances(this: THREE.InstancedMesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  probe.geometry = this.geometry; probe.material = this.material;
  if (probe.material === undefined) return;
  if (this.boundingSphere === null) this.computeBoundingSphere();
  sphere.copy(this.boundingSphere!).applyMatrix4(this.matrixWorld);
  if (!raycaster.ray.intersectsSphere(sphere)) return;
  const tree = treeOf(this);
  if (!tree.count) return;

  // The ray in the mesh's own space. An affine map scales lengths along one
  // line uniformly, so near and far carry over by mapping their points.
  inverse.copy(this.matrixWorld).invert();
  local.copy(raycaster.ray).applyMatrix4(inverse);
  const along = (distance: number) => Number.isFinite(distance) ? end.copy(raycaster.ray.direction).multiplyScalar(distance).add(raycaster.ray.origin).applyMatrix4(inverse).distanceTo(local.origin) : Infinity;
  const near = along(raycaster.near), far = along(raycaster.far);
  const ox = local.origin.x, oy = local.origin.y, oz = local.origin.z;
  const ix = 1 / local.direction.x, iy = 1 / local.direction.y, iz = 1 / local.direction.z;
  const { bounds, first, size, order } = tree;

  let top = 0; stack[top++] = 0;
  while (top) {
    const node = stack[--top], b = node * 6;
    // Slab test; NaN from 0 × Infinity (a ray lying in a face) counts as touching.
    let t0 = (bounds[b] - ox) * ix, t1 = (bounds[b + 3] - ox) * ix;
    let lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    t0 = (bounds[b + 1] - oy) * iy; t1 = (bounds[b + 4] - oy) * iy;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    t0 = (bounds[b + 2] - oz) * iz; t1 = (bounds[b + 5] - oz) * iz;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    if (hi < lo || hi < near || lo > far) continue;
    if (first[node] < 0) {
      if (top + 2 > stack.length) { const grown = new Int32Array(stack.length * 2); grown.set(stack); stack = grown; }
      stack[top++] = size[node]; stack[top++] = node + 1;
      continue;
    }
    for (let i = first[node], last = first[node] + size[node]; i < last; i++) {
      const id = order[i];
      this.getMatrixAt(id, instanceLocal);
      instanceWorld.multiplyMatrices(this.matrixWorld, instanceLocal);
      probe.matrixWorld = instanceWorld;
      probe.raycast(raycaster, found);
      for (const hit of found) { hit.instanceId = id; hit.object = this; intersects.push(hit); }
      found.length = 0;
    }
  }
}

/** Puts every large, static InstancedMesh under `root` on the tree walk, building its tree now rather than on the first shot. */
export function accelerateInstancedRaycasts(root: THREE.Object3D) {
  let accelerated = 0;
  root.traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || mesh.count < MIN_INSTANCES || mesh.userData.fpsEffect) return;
    if (mesh.instanceMatrix.usage !== THREE.StaticDrawUsage || mesh.raycast !== THREE.InstancedMesh.prototype.raycast) return;
    mesh.raycast = raycastInstances; treeOf(mesh); accelerated++;
  });
  return accelerated;
}
