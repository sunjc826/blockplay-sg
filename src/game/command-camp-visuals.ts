import type * as THREE from 'three';
import type { FacilitySite } from './facilities';
import { expeditionStructure } from './expedition-structures';
import { createStructurePropsVisuals } from './structure-prop-visuals';

/** Legacy expedition entry point; new layouts use the physical prop renderer. */
export function createCommandCampVisuals(scene: THREE.Scene, site: FacilitySite, accent: THREE.Material,
  resources: (THREE.BufferGeometry | THREE.Material)[]) {
  const root = createStructurePropsVisuals(scene, expeditionStructure(site), accent, resources);
  root.userData.commandCamp = site.id;
  return root;
}
