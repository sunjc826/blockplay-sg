import * as THREE from 'three';
import { isWaterObject } from './water';
import { navalWaterRouteClear, type NavalLandingSite } from './naval-landing-sites';
import type { RegionBounds } from './region-collision';
import type { createVerticalMovement } from './vertical-movement';

/** Validate authored lanes against the built scene, including its real water and dry support. */
export function validatedNavalSites(scene: THREE.Scene, sites: readonly NavalLandingSite[], bounds: RegionBounds, movement: ReturnType<typeof createVerticalMovement>) {
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  return sites.filter(site => {
    const wet = navalWaterRouteClear(site, (x, z, radius) => {
      for (const dx of [-radius, 0, radius]) for (const dz of [-4.1, 0, 4.1]) {
        ray.set(new THREE.Vector3(x + dx, 30, z + dz), down); ray.far = 35;
        const first = ray.intersectObject(scene, true).find(hit => hit.object instanceof THREE.Mesh && !hit.object.userData.fpsEffect);
        if (!first || !isWaterObject(first.object) || Math.abs(first.point.y - site.waterY) > .1) return true;
      }
      return false;
    });
    if (!wet) return false;
    for (let i = 0; i <= 44; i++) {
      const x = site.ramp.to.x + (site.rally.x - site.ramp.to.x) * i / 44, z = site.ramp.to.z + (site.rally.z - site.ramp.to.z) * i / 44;
      if (x - .5 < bounds.minX || x + .5 > bounds.maxX || z - .5 < bounds.minZ || z + .5 > bounds.maxZ) return false;
      const y = movement.supportHeight(x, z, .7, .4, 1.8);
      if (y === null || y > .35 || !movement.canOccupy(x, y, z, .5, 1.8)) return false;
    }
    return true;
  });
}
