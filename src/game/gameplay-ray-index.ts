import * as THREE from 'three';
import { createSceneRayIndex } from './scene-ray-index';
import { graphVersion } from './scene-graph-version';

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
  let objects: THREE.Object3D[] = [];
  const rootOf = new Map<THREE.Object3D, THREE.Object3D>();
  const filtered: THREE.Object3D[] = [];
  /** Each included root's raycastable objects, in traversal order, as of its graph version. */
  const walked = new Map<THREE.Object3D, { version: number; objects: THREE.Object3D[] }>();
  let roots: THREE.Object3D[] = [], nextRoots: THREE.Object3D[] = [], refreshes = 0;
  const sameList = (a: readonly THREE.Object3D[], b: readonly THREE.Object3D[]) => a.length === b.length && a.every((object, i) => object === b[i]);
  return {
    refresh() {
      // A root is walked again only once something was added or removed beneath it,
      // and every root every 60 refreshes, for a raycast swapped in after insertion.
      const sweep = ++refreshes % 60 === 0;
      let changed = false;
      nextRoots.length = 0;
      for (const root of scene.children) {
        if (!include(root)) continue;
        nextRoots.push(root);
        const version = graphVersion(root), known = walked.get(root);
        if (known && known.version === version && !sweep) continue;
        const found: THREE.Object3D[] = [];
        root.traverse(object => { if (object.raycast !== noRaycast) found.push(object); });
        if (!known || !sameList(found, known.objects)) changed = true;
        walked.set(root, { version, objects: found });
      }
      if (!sameList(nextRoots, roots)) {
        changed = true;
        for (const root of walked.keys()) if (!nextRoots.includes(root)) walked.delete(root);
      }
      [roots, nextRoots] = [nextRoots, roots];
      if (changed) {
        // Same order as three's recursive intersect: a node, then its children.
        objects = []; rootOf.clear();
        for (const root of roots) for (const object of walked.get(root)!.objects) { objects.push(object); rootOf.set(object, root); }
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
