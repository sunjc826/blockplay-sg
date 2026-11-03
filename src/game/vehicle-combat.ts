import type { VehicleKind, VehicleState } from './vehicle-rules';
import { muzzleBallistics, type BallisticSpec } from './fps-ballistics';

/** Vehicle ammunition belongs to the hull, never to the player's inventory. */
export const VEHICLE_COMBAT = {
  car: { health: 600, ammo: 240, name: 'Roof GPMG', damage: 60, interval: .12, range: 180, blastRadius: 9, blastDamage: 240, caliberMm: 7.62, ballistics: muzzleBallistics(840) },
  helicopter: { health: 900, ammo: 400, name: 'Chin HMG', damage: 95, interval: .15, range: 240, blastRadius: 12, blastDamage: 320, caliberMm: 12.7, ballistics: muzzleBallistics(890) },
  'dragon-boat-red': { health: 300, ammo: 0, name: 'Paddles · unarmed', damage: 0, interval: 1, range: 0, blastRadius: 0, blastDamage: 0, caliberMm: 0, ballistics: muzzleBallistics(1) },
  'dragon-boat-gold': { health: 300, ammo: 0, name: 'Paddles · unarmed', damage: 0, interval: 1, range: 0, blastRadius: 0, blastDamage: 0, caliberMm: 0, ballistics: muzzleBallistics(1) },
} satisfies Record<VehicleKind, { health: number; ammo: number; name: string; damage: number; interval: number; range: number; blastRadius: number; blastDamage: number; caliberMm: number; ballistics: BallisticSpec }>;
/** Upward shove (m/s) and spin (rad/s) from the hull's own explosion. A helicopter that loses its tail rotor spins hard. */
const WRECK_KICK = { car: { climb: 5.5, spin: .9 }, helicopter: { climb: 2.5, spin: 2.4 } } as const;
export type VehicleDamageStage = 'intact' | 'damaged' | 'smoking' | 'critical' | 'destroyed';
export function vehicleDamageStage(v: Pick<VehicleState, 'kind' | 'health'>): VehicleDamageStage {
  const ratio = v.health / VEHICLE_COMBAT[v.kind].health;
  return ratio <= 0 ? 'destroyed' : ratio <= .25 ? 'critical' : ratio <= .5 ? 'smoking' : ratio <= .75 ? 'damaged' : 'intact';
}
export function damageVehicle(v: VehicleState, damage: number) {
  if (!Number.isFinite(damage) || damage <= 0 || v.health <= 0) return false;
  v.health = Math.max(0, v.health - damage);
  if (v.health > 0) return false;
  if (VEHICLE_COMBAT[v.kind].blastRadius <= 0) v.speed = v.climb = v.lateralSpeed = v.yawSpeed = 0;
  else {
    // The hull keeps its momentum and the blast adds a kick; see stepVehicleWreck.
    const kick = WRECK_KICK[v.kind as keyof typeof WRECK_KICK], side = Math.sign(v.lateralSpeed || v.yawSpeed || 0) || (Math.sin(v.x * 12.9898 + v.z * 78.233) < 0 ? -1 : 1);
    v.climb += kick.climb; v.yawSpeed = side * kick.spin;
  }
  return true; // Exactly one destruction event, even during a chain explosion.
}
export function fireVehicleWeapon(v: VehicleState) {
  if (v.health <= 0 || v.ammo <= 0 || v.weaponCooldown > 0) return false;
  v.ammo--; v.weaponCooldown = VEHICLE_COMBAT[v.kind].interval;
  return true;
}
export function vehicleBlastDamage(kind: VehicleKind, distance: number) {
  const spec = VEHICLE_COMBAT[kind];
  return spec.blastRadius > 0 ? Math.max(0, spec.blastDamage * (1 - Math.max(0, distance) / spec.blastRadius)) : 0;
}
/** Forgive bumps up to 5 m/s; harder impacts grow quadratically at a forgiving hull-damage scale. */
export function vehicleCollisionDamage(impactSpeed: number) {
  return Number.isFinite(impactSpeed) ? Math.max(0, Math.abs(impactSpeed) - 5) ** 2 * .5 : 0;
}
/** Stepping off at walking pace is safe; faster bailouts injure the body, bypassing inserts. */
export function vehicleExitDamage(v: VehicleState) {
  return v.kind === 'car' ? Math.max(0, Math.hypot(v.speed, v.lateralSpeed ?? 0) - 3) ** 2 * .5 : 0;
}
