import type { WeaponSpec } from './fps-rules';
export const PRONE_EYE_HEIGHT = .55;
export const UNSUPPORTED_RECOIL_DAMAGE = 20;
export const CROUCHED_RECOIL_DAMAGE = 10;
/** Gameplay support rule; the prone mount is deployed on the ground plane. */
export const weaponBraced = (weapon: Pick<WeaponSpec, 'requiresMount'>, prone: boolean, grounded: boolean) =>
  weapon.requiresMount === true && prone && grounded;
/** Raw recoil damage, before the equipped armor absorbs its share. */
export const unsupportedRecoilDamage = (weapon: Pick<WeaponSpec, 'requiresMount'>, prone: boolean, grounded: boolean, crouched = false) =>
  weapon.requiresMount && !weaponBraced(weapon, prone, grounded) ? (crouched && grounded ? CROUCHED_RECOIL_DAMAGE : UNSUPPORTED_RECOIL_DAMAGE) : 0;
