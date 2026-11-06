import * as THREE from 'three';
import { createSceneRayIndex } from './scene-ray-index';

const noRaycast = THREE.Object3D.prototype.raycast;

/**
 * Broadphase for many rays in one frame against everything a round can strike:
 * every scene root that `include` accepts and all of its descendants, figures,
 * vehicles, targets and water included (unlike scene cover, which leaves those
 * out). Querying then raycasting the result with `recursive` false finds the
 * same hits, in the same order, as `ray.intersectObjects(roots, true)`.
 *
 * Call `refresh` once the scene's world matrices are current; queries see the
 * scene as it was then.
 */
export function createGameplayRayIndex(scene: THREE.Object3D, include: (root: THREE.Object3D) => boolean) {
  const index = createSceneRayIndex();
  let objects: THREE.Object3D[] = [], next: THREE.Object3D[] = [];
  const rootOf = new Map<THREE.Object3D, THREE.Object3D>();
  const filtered: THREE.Object3D[] = [];
  const collect = (object: THREE.Object3D) => { if (object.raycast !== noRaycast) next.push(object); };
  return {
    refresh() {
      next.length = 0;
      // Same order as three's recursive intersect: a node, then its children.
      for (const root of scene.children) if (include(root)) root.traverse(collect);
      const changed = next.length !== objects.length || next.some((object, i) => object !== objects[i]);
      [objects, next] = [next, objects];
      if (changed) {
        rootOf.clear();
        for (const root of scene.children) if (include(root)) root.traverse(object => { if (object.raycast !== noRaycast) rootOf.set(object, root); });
        index.setObjects(objects);
      }
      index.refresh();
    },
    /** Objects the ray may strike, in scene order, leaving out roots `skip` names.
     * Reuses its result array; consume it before the next query. */
    query(ray: THREE.Raycaster, skip?: (root: THREE.Object3D) => boolean) {
      const candidates = index.query(ray);
      if (!skip) return candidates;
      filtered.length = 0;
      for (const object of candidates) if (!skip(rootOf.get(object)!)) filtered.push(object);
      return filtered;
    },
  };
}
