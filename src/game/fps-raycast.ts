import * as THREE from 'three';
import { isVisualCover, isBulletGlass } from './cover-kind';

/** Nearest first, up to `limit` visible ballistic surfaces. Sight also includes foliage. Physical traces opt into thin glass.
 * `recursive` false is for a flat list that already holds every descendant to test. */
export function visibleHits(ray: THREE.Raycaster, objects: THREE.Object3D[], limit: number, includeFoliage = false, includeGlass = false, recursive = true) {
  const found: THREE.Intersection[] = [];
  if (limit < 1) return found;
  for (const hit of ray.intersectObjects(objects, recursive)) {
    let node: THREE.Object3D | null = hit.object, visible = true;
    while (node) { if (!node.visible) { visible = false; break; } node = node.parent; }
    if (!visible || (!includeFoliage && isVisualCover(hit.object)) || (!includeGlass && isBulletGlass(hit.object))) continue;
    found.push(hit);
    if (found.length >= limit) break;
  }
  return found;
}
/** Nearest ballistic surface wins; sight callers explicitly include foliage. */
export function firstVisibleHit(ray: THREE.Raycaster, objects: THREE.Object3D[], includeFoliage = false, includeGlass = false, recursive = true) {
  return visibleHits(ray, objects, 1, includeFoliage, includeGlass, recursive)[0];
}
