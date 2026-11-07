import type * as THREE from 'three';
import type { FacilitySite } from './facilities';
import { expeditionStructureLayout } from './expedition-structures';
import { createExpeditionStructureVisuals } from './expedition-structure-visuals';

/** Compatibility for expedition consumers; physical rendering is mode independent. */
export function createFacilityVisuals(scene: THREE.Scene, sites: readonly FacilitySite[], options: { batchParts?: boolean } = {}) {
  return createExpeditionStructureVisuals(scene, expeditionStructureLayout(sites), options);
}
