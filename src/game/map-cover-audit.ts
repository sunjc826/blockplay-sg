import * as THREE from 'three';
import { arenaWallDistance } from './arena-rules';
import { firstVisibleHit } from './fps-raycast';
import { createSceneCover } from './scene-cover';
import { getTraversalObstacles } from './vertical-routes';
import type { Obstacle } from './region-collision';

/** Repeatable geometry probes, not a screenshot/texture or exhaustive play audit.
 * Movement-envelope differences are expected; authority/render differences are defects. */
export function auditMapCover(scene: THREE.Scene, obstacles: readonly Obstacle[], maxObstacles = Infinity) {
  scene.updateMatrixWorld(true);
  const cover = createSceneCover(scene), ray = new THREE.Raycaster();
  const boxes = [...obstacles, ...getTraversalObstacles(scene)];
  let probes = 0, authorityMismatches = 0, movementEnvelopeDifferences = 0;
  const examples: { from: THREE.Vector3; to: THREE.Vector3; movementDistance: number; renderedDistance: number; mesh: string; instance?: number }[] = [];
  const stride = Math.max(1, Math.ceil(boxes.length / maxObstacles));
  for (let index = 0; index < boxes.length; index += stride) {
    const box = boxes[index], x = (box.minX + box.maxX) / 2, z = (box.minZ + box.maxZ) / 2;
    const base = 'minY' in box ? (box.minY as number) : 0;
    for (const height of [.55, 1.25, 1.75]) for (const axis of ['x', 'z'] as const) {
      const from = new THREE.Vector3(axis === 'x' ? box.minX - .3 : x, base + height, axis === 'z' ? box.minZ - .3 : z);
      const to = new THREE.Vector3(axis === 'x' ? box.maxX + .3 : x, base + height, axis === 'z' ? box.maxZ + .3 : z);
      const range = from.distanceTo(to), direction = to.clone().sub(from).normalize();
      ray.set(from, direction); ray.near = 0; ray.far = range;
      const visible = firstVisibleHit(ray, scene.children), rendered = visible?.distance ?? range;
      const authority = cover.distance(from, direction, range);
      const movement = Math.min(range, arenaWallDistance(from, direction, boxes));
      probes++;
      if (Math.abs(authority - rendered) > .001) authorityMismatches++;
      if (Math.abs(movement - rendered) > .05) {
        movementEnvelopeDifferences++;
        if (examples.length < 8) examples.push({ from, to, movementDistance: movement, renderedDistance: rendered, mesh: visible?.object.name || visible?.object.parent?.name || visible?.object.type || 'clear', instance: visible?.instanceId });
      }
    }
  }
  return { probes, authorityMismatches, movementEnvelopeDifferences, examples };
}
