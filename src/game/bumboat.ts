import { batchRigidMeshes } from './rigid-batches';
import * as THREE from 'three';
import type { SceneKit } from './scene-kit';

/** Scenery for the on-foot ferry gateways, not a driveable vehicle. Resources
 * belong to the scene kit, so changing districts disposes them normally. */
export function bumboat(kit: SceneKit, x: number, z: number, yaw = 0) {
  const root = new THREE.Group(); root.name = 'Bumboat ferry'; root.position.set(x, 0, z); root.rotation.y = yaw;
  root.userData.fpsEffect = true; kit.scene.add(root);
  const wood = kit.mat('#785340'), cream = kit.mat('#e5dcc1'), roof = kit.mat('#9d5b46'), glass = kit.mat('#638b92', .3, .2);
  const hull = new THREE.Mesh(kit.geo(new THREE.CylinderGeometry(1, .8, 1, 5)), wood);
  hull.scale.set(2.3, 1.2, 5.7); hull.position.y = .45; root.add(hull);
  kit.box(0, 1.1, 0, 3.5, .25, 8, cream, root);
  kit.box(0, 1.8, -2.5, 3.2, 1.4, 2.4, cream, root);
  kit.box(0, 2, -3.75, 2.8, .8, .08, glass, root);
  kit.box(0, 3.1, .4, 4.2, .3, 9, roof, root);
  for (const side of [-1, 1]) for (const dz of [-2, 1, 4]) kit.box(side * 1.7, 2.1, dz, .14, 1.9, .14, wood, root);
  for (const dz of [-.5, 1.5, 3.5]) kit.box(0, 1.45, dz, 3.1, .22, .65, wood, root);
  const noRaycast = () => {};
  root.traverse(child => { child.raycast = noRaycast; });
  batchRigidMeshes(root, { trackGeometry: kit.geo, raycast: noRaycast });
  return { root, animate(time: number) { root.position.y = Math.sin(time * 1.4) * .06; root.rotation.z = Math.sin(time * .9) * .015; } };
}
