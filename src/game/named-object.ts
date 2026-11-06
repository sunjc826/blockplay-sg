import type * as THREE from 'three';

const found = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D>>();
/**
 * `root.getObjectByName(name)`, remembered: a per-frame lookup walks the whole
 * subtree every time. The remembered object is used while it is still named so
 * and still under `root`; otherwise (and when there was none) it searches again.
 */
export function namedObject(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let names = found.get(root);
  const known = names?.get(name);
  if (known && known.name === name) {
    let node: THREE.Object3D | null = known;
    while (node && node !== root) node = node.parent;
    if (node) return known;
  }
  const object = root.getObjectByName(name);
  if (object) { if (!names) found.set(root, names = new Map()); names.set(name, object); }
  else names?.delete(name);
  return object;
}
