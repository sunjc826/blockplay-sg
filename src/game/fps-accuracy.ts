export interface WeaponBloom { amount: number; delay: number }
// Stable family index in FPS_WEAPONS. Precision tuning applies to both zoom levels.
const SMART_POWER_FAMILY = 10;
const maximum = [.028, .038, .02, .045, .065], perShot = [.003, .004, .003, .005, .009];
export const createWeaponBloom = (): WeaponBloom => ({ amount: 0, delay: 0 });
export function recordBloomShot(state: WeaponBloom, weapon: number) {
  // A deliberate .24 s follow-up sheds this rifle's bloom before the next shot.
  const precision = weapon === SMART_POWER_FAMILY;
  state.amount = Math.min(precision ? .012 : maximum[weapon] ?? maximum[0], state.amount + (precision ? .001 : perShot[weapon] ?? perShot[0]));
  state.delay = .2;
}
export function advanceBloom(state: WeaponBloom, dt: number) {
  const elapsed = Math.max(0, Math.min(dt, .1));
  const recovering = Math.max(0, elapsed - state.delay);
  state.delay = Math.max(0, state.delay - elapsed);
  state.amount = Math.max(0, state.amount - recovering * .025);
}
/** Cone half-angle in radians; the HUD projects this same cone into screen pixels. */
export function weaponSpread(state: WeaponBloom, weapon: number, aim: number, crouching: boolean, moving: boolean) {
  const aiming = Math.max(0, Math.min(1, aim));
  const aimedReduction = weapon === SMART_POWER_FAMILY ? .92 : .80;
  return (([.005, .007, .006, .01, .016, .006, .0055, .009][weapon] ?? .005) + state.amount + (moving ? .007 : 0)) * (1 - aiming * aimedReduction) * (crouching ? .65 : 1);
}
export function sampleShotSpread(angle: number, random: () => number = Math.random) {
  const radius = Math.sqrt(random()) * Math.tan(angle), theta = random() * Math.PI * 2;
  return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius };
}
