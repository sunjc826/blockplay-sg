import * as THREE from 'three';
import { isVisualCover } from './cover-kind';

/** Nearest first, up to `limit` visible ballistic surfaces. Sight also includes foliage. */
export function visibleHits(ray: THREE.Raycaster, objects: THREE.Object3D[], limit: number, includeFoliage = false) {
  const found: THREE.Intersection[] = [];
  if (limit < 1) return found;
  for (const hit of ray.intersectObjects(objects, true)) {
    let node: THREE.Object3D | null = hit.object, visible = true;
    while (node) { if (!node.visible) { visible = false; break; } node = node.parent; }
    if (!visible || (!includeFoliage && isVisualCover(hit.object))) continue;
    found.push(hit);
    if (found.length >= limit) break;
  }
  return found;
}
/** Nearest ballistic surface wins; sight callers explicitly include foliage. */
export function firstVisibleHit(ray: THREE.Raycaster, objects: THREE.Object3D[], includeFoliage = false) {
  return visibleHits(ray, objects, 1, includeFoliage)[0];
}
