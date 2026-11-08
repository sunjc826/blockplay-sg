import * as THREE from 'three';
import { isVisualCover, isBulletGlass } from './cover-kind';

export function isVisibleHit(hit: THREE.Intersection, includeFoliage = false, includeGlass = false) {
  for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) if (!node.visible) return false;
  return (includeFoliage || !isVisualCover(hit.object)) && (includeGlass || !isBulletGlass(hit.object));
}

/** Nearest first, up to `limit` visible ballistic surfaces. Sight also includes foliage. Physical traces opt into thin glass.
 * `recursive` false is for a flat list that already holds every descendant to test.
 * A dummy's nearest visible part determines the hit zone and spends one surface. */
export function visibleHits(ray: THREE.Raycaster, objects: THREE.Object3D[], limit: number, includeFoliage = false, includeGlass = false, recursive = true, hitTargets?: ReadonlySet<number>) {
  const found: THREE.Intersection[] = [];
  if (limit < 1) return found;
  for (const hit of ray.intersectObjects(objects, recursive)) {
    if (!isVisibleHit(hit, includeFoliage, includeGlass)) continue;
    const target = hit.object.userData.fpsTarget;
    if (typeof target === 'number' && (hitTargets?.has(target) || found.some(other => other.object.userData.fpsTarget === target))) continue;
    found.push(hit);
    if (found.length >= limit) break;
  }
  return found;
}
/** Nearest ballistic surface wins; sight callers explicitly include foliage. */
export function firstVisibleHit(ray: THREE.Raycaster, objects: THREE.Object3D[], includeFoliage = false, includeGlass = false, recursive = true) {
  return visibleHits(ray, objects, 1, includeFoliage, includeGlass, recursive)[0];
}
