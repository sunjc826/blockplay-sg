import type { WeaponSpec } from './fps-rules';
import type { MovementStance } from './fps-movement';
export const PRONE_EYE_HEIGHT = .55;
export const UNSUPPORTED_RECOIL_DAMAGE = 20;
export const CROUCHED_RECOIL_DAMAGE = 10;
/** Gameplay support rule; the prone mount is deployed on the ground plane. */
export const weaponBraced = (weapon: Pick<WeaponSpec, 'requiresMount'>, prone: boolean, grounded: boolean) =>
  weapon.requiresMount === true && prone && grounded;
/** Raw recoil damage, before the equipped armor absorbs its share. */
export const unsupportedRecoilDamage = (weapon: Pick<WeaponSpec, 'requiresMount'>, prone: boolean, grounded: boolean, crouched = false) =>
  weapon.requiresMount && !weaponBraced(weapon, prone, grounded) ? (crouched && grounded ? CROUCHED_RECOIL_DAMAGE : UNSUPPORTED_RECOIL_DAMAGE) : 0;

/** Per-shot impulse policy, shared by every infantry weapon and variant. */
export const STANCE_RECOIL_MULTIPLIERS = { stand: 1, crouch: .75, prone: .5 } as const;
const STANCE_EYES = { stand: 1.75, crouch: 1.15, prone: PRONE_EYE_HEIGHT } as const;
/** Earn support as the body lowers; standing up or leaving the ground removes it. */
export function stanceRecoilMultiplier(stance: MovementStance, grounded: boolean, eyeHeight: number = STANCE_EYES[stance]) {
  if (!grounded || stance === 'stand' || !Number.isFinite(eyeHeight)) return 1;
  const settled = Math.max(0, Math.min(1, (STANCE_EYES.stand - eyeHeight) / (STANCE_EYES.stand - STANCE_EYES[stance])));
  return 1 - (1 - STANCE_RECOIL_MULTIPLIERS[stance]) * settled;
}
