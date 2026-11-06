import * as THREE from 'three';

export interface RayBoundsEntry { box: THREE.Box3; order: number }
interface Node<T> { box: THREE.Box3; depth: number; mark: number; parent?: Node<T>; items?: T[]; left?: Node<T>; right?: Node<T> }

/** Broadphase only: callers retain their exact raycasts and original hit order. */
export function createRayBoundsTree<T extends RayBoundsEntry>(entries: readonly T[], leafSize = 8) {
  const leaves = new Map<T, Node<T>>(), point = new THREE.Vector3(), dirty: Node<T>[] = [];
  let mark = 0;
  const build = (items: T[], parent?: Node<T>): Node<T> => {
    const node: Node<T> = { box: new THREE.Box3(), depth: parent ? parent.depth + 1 : 0, mark: 0, parent };
    for (const entry of items) node.box.union(entry.box);
    if (items.length <= leafSize) {
      node.items = items;
      for (const entry of items) leaves.set(entry, node);
    } else {
      const size = node.box.getSize(new THREE.Vector3());
      const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
      items.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
      const half = items.length >> 1;
      node.left = build(items.slice(0, half), node); node.right = build(items.slice(half), node);
    }
    return node;
  };
  const root = build([...entries]);
  const fit = (node: Node<T>) => {
    node.box.makeEmpty();
    if (node.items) for (const item of node.items) node.box.union(item.box);
    else node.box.union(node.left!.box).union(node.right!.box);
  };
  return {
    refit(entry: T) {
      for (let node = leaves.get(entry); node; node = node.parent) fit(node);
    },
    /** As `refit` for each entry, but every shared ancestor is refitted once, after its children. */
    refitMany(changed: readonly T[]) {
      if (!changed.length) return;
      mark++; dirty.length = 0;
      for (const entry of changed) { const leaf = leaves.get(entry); if (leaf && leaf.mark !== mark) { leaf.mark = mark; dirty.push(leaf); } }
      for (let i = 0; i < dirty.length; i++) { const parent = dirty[i].parent; if (parent && parent.mark !== mark) { parent.mark = mark; dirty.push(parent); } }
      dirty.sort((a, b) => b.depth - a.depth);
      for (const node of dirty) fit(node);
    },
    /** Appends candidates; callers may add fallback objects before sorting. */
    query(ray: THREE.Ray, output: T[], far = Infinity) {
      const intersects = (box: THREE.Box3) => !box.isEmpty() && (box.containsPoint(ray.origin)
        || (ray.intersectBox(box, point) !== null && point.distanceTo(ray.origin) <= far));
      const visit = (node: Node<T>) => {
        if (!intersects(node.box)) return;
        if (node.items) { for (const item of node.items) if (intersects(item.box)) output.push(item); }
        else { visit(node.left!); visit(node.right!); }
      };
      visit(root);
    },
  };
}

/** Outward rounding protects grazing rays after world/local transformations. */
export function padRayBounds(box: THREE.Box3) {
  if (!box.isEmpty()) box.expandByScalar(1e-7 * Math.max(1, Math.abs(box.min.x), Math.abs(box.min.y), Math.abs(box.min.z), Math.abs(box.max.x), Math.abs(box.max.y), Math.abs(box.max.z)));
  return box;
}

// Arbitrary custom raycasts need not hit within their mesh geometry. Only the
// existing exact geometry accelerators opt in; unknown raycasts stay unpruned.
const boundedRaycasts = new WeakMap<THREE.Mesh['raycast'], (() => boolean) | null>();
export function boundedRaycast<T extends THREE.Mesh['raycast']>(raycast: T, valid?: () => boolean): T {
  boundedRaycasts.set(raycast, valid ?? null); return raycast;
}
export function hasBoundedRaycast(mesh: THREE.Mesh) {
  return mesh.raycast === THREE.Mesh.prototype.raycast || mesh.raycast === THREE.InstancedMesh.prototype.raycast || (boundedRaycasts.has(mesh.raycast) && (boundedRaycasts.get(mesh.raycast)?.() ?? true));
}
