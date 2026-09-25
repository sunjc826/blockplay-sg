import type { VehicleKind, VehicleState } from './vehicle-rules';

/** Vehicle ammunition belongs to the hull, never to the player's inventory. */
export const VEHICLE_COMBAT = {
  car: { health: 600, ammo: 240, name: 'Roof GPMG', damage: 60, interval: .12, range: 180, blastRadius: 9, blastDamage: 240 },
  helicopter: { health: 900, ammo: 400, name: 'Chin HMG', damage: 95, interval: .15, range: 240, blastRadius: 12, blastDamage: 320 },
} satisfies Record<VehicleKind, { health: number; ammo: number; name: string; damage: number; interval: number; range: number; blastRadius: number; blastDamage: number }>;
export type VehicleDamageStage = 'intact' | 'damaged' | 'smoking' | 'critical' | 'destroyed';
export function vehicleDamageStage(v: Pick<VehicleState, 'kind' | 'health'>): VehicleDamageStage {
  const ratio = v.health / VEHICLE_COMBAT[v.kind].health;
  return ratio <= 0 ? 'destroyed' : ratio <= .25 ? 'critical' : ratio <= .5 ? 'smoking' : ratio <= .75 ? 'damaged' : 'intact';
}
export function damageVehicle(v: VehicleState, damage: number) {
  if (!Number.isFinite(damage) || damage <= 0 || v.health <= 0) return false;
  v.health = Math.max(0, v.health - damage);
  if (v.health > 0) return false;
  v.speed = v.climb = 0;
  return true; // Exactly one destruction event, even during a chain explosion.
}
export function fireVehicleWeapon(v: VehicleState) {
  if (v.health <= 0 || v.ammo <= 0 || v.weaponCooldown > 0) return false;
  v.ammo--; v.weaponCooldown = VEHICLE_COMBAT[v.kind].interval;
  return true;
}
export function vehicleBlastDamage(kind: VehicleKind, distance: number) {
  const spec = VEHICLE_COMBAT[kind];
  return Math.max(0, spec.blastDamage * (1 - Math.max(0, distance) / spec.blastRadius));
}
export function vehicleCollisionDamage(speed: number) { return Math.max(0, Math.abs(speed) - 5) ** 2 * 2; }
