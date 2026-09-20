import * as THREE from 'three';

/** Nearest first, up to `limit` visible surfaces, for rounds that pass through cover. */
export function visibleHits(ray: THREE.Raycaster, objects: THREE.Object3D[], limit: number) {
  const found: THREE.Intersection[] = [];
  if (limit < 1) return found;
  for (const hit of ray.intersectObjects(objects, true)) {
    let node: THREE.Object3D | null = hit.object, visible = true;
    while (node) { if (!node.visible) { visible = false; break; } node = node.parent; }
    if (!visible) continue;
    found.push(hit);
    if (found.length >= limit) break;
  }
  return found;
}
/** Nearest visible surface wins, so a target behind cover cannot be scored. */
export function firstVisibleHit(ray: THREE.Raycaster, objects: THREE.Object3D[]) {
  return visibleHits(ray, objects, 1)[0];
}
