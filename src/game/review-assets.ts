import * as THREE from 'three';
import { STREET_PROPS, createStreetPropKit } from './street-props';
import { PROXY_WEAPONS, buildProxyWeapon } from './proxy-weapon-models';
import { PROXY_FACTIONS, proxyCharacterLook } from './proxy-factions';
import { createCharacterRig } from './character-rig';

export interface ReviewAsset {
  id: string; name: string; category: 'Street props' | 'Weapons' | 'Operators'; description: string; rationale: string; source: string; gallery: string;
  frontYaw?: number;
  build(): { root: THREE.Object3D; dispose(): void };
}
/** Stable subject IDs keep conversations independent of gallery order and display names. */
export const REVIEW_ASSETS: readonly ReviewAsset[] = [
  ...STREET_PROPS.map(prop => ({
    id: `prop/${prop.kind}`, name: prop.name, category: 'Street props' as const, description: prop.detail,
    rationale: `${prop.setting}. ${prop.behavior === 'fixed' ? 'This is solid scenery; review its footprint and clearance around nearby routes.' : 'This prop reacts cosmetically; review its visual readability without treating it as protective cover.'} Check silhouette at gameplay distance and how the base meets the ground.`,
    source: 'src/game/street-props.ts', gallery: '/prop-designs',
    build() { const kit = createStreetPropKit(); return { root: kit.create(prop.kind), dispose: () => kit.dispose() }; },
  })),
  ...PROXY_WEAPONS.map(weapon => ({
    id: `weapon/${weapon.id}`, name: weapon.name, category: 'Weapons' as const, description: weapon.silhouette,
    rationale: weapon.interpretation, source: 'src/game/proxy-weapon-models.ts', gallery: '/faction-designs?study=weapons',
    build: () => buildProxyWeapon(weapon.id),
  })),
  ...PROXY_FACTIONS.flatMap(faction => faction.operators.map(operator => ({
    frontYaw: Math.PI,
    id: `operator/${operator.id}`, name: `${faction.name} · ${operator.name}`, category: 'Operators' as const,
    description: operator.equipment, rationale: `${operator.concept}. ${faction.silhouette} Review the frozen standing silhouette and role equipment from front, side and rear; animation timing needs an in-game review.`,
    source: 'src/game/character-rig.ts', gallery: '/faction-designs',
    build() { const rig = createCharacterRig(proxyCharacterLook(faction.id, operator.id), operator.name); rig.update(0, { aim: .3 }); return { root: rig.root, dispose: () => rig.dispose() }; },
  }))),
];
export const getReviewAsset = (id: string) => REVIEW_ASSETS.find(asset => asset.id === id);
