import type { WeaponSpec } from './fps-rules';
export const PRONE_EYE_HEIGHT = .55;
export const UNSUPPORTED_RECOIL_DAMAGE = 20;
/** Gameplay support rule; the prone mount is deployed on the ground plane. */
export const weaponBraced = (weapon: Pick<WeaponSpec, 'requiresMount'>, prone: boolean, grounded: boolean) =>
  weapon.requiresMount === true && prone && grounded;
export const unsupportedRecoilDamage = (weapon: Pick<WeaponSpec, 'requiresMount'>, prone: boolean, grounded: boolean) =>
  weapon.requiresMount && !weaponBraced(weapon, prone, grounded) ? UNSUPPORTED_RECOIL_DAMAGE : 0;
