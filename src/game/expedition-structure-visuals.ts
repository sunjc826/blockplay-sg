import type * as THREE from 'three';
import type { FacilitySnapshot } from './facilities';
import { expeditionStructureAppearance } from './expedition-structures';
import type { StructureLayout } from './structure-types';
import { createStructureVisuals } from './structure-visuals';

/** Keep facility presentation and legacy diagnostic tags within expedition. */
export function createExpeditionStructureVisuals(scene: THREE.Scene, layout: StructureLayout, options: { batchParts?: boolean } = {}) {
  const visuals = createStructureVisuals(scene, layout, options);
  for (const { site, root, pad, camp } of visuals.roots) {
    root.userData.facilityId = site.id;
    pad.userData.facilityId = site.id;
    if (camp) camp.userData.commandCamp = site.id;
  }
  return { update: (snapshot?: FacilitySnapshot) => visuals.update(expeditionStructureAppearance(snapshot)), dispose: visuals.dispose };
}
