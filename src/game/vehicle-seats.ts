import { createVehicle, type VehicleKind, type VehicleSpawn, type VehicleState } from './vehicle-rules';

export const VEHICLE_SEATS = ['Driver', 'Gunner', 'Passenger left', 'Passenger right'] as const;
export interface VehicleControls { forward: number; steer: number; lift: number; brake: boolean; boost: boolean; fire: boolean; aim?: { x: number; y: number; z: number } }
export interface SharedVehicle extends VehicleState { occupants: (string | null)[]; gunYaw: number; gunPitch: number; shots: number; shotEnd: { x: number; y: number; z: number } | null }
export const createSharedVehicle = (kind: VehicleKind, spawn: VehicleSpawn): SharedVehicle => ({ ...createVehicle(kind, spawn), occupants: [null, null, null, null], gunYaw: spawn.yaw, gunPitch: 0, shots: 0, shotEnd: null });
export function seatOf(vehicles: readonly SharedVehicle[], id: string) {
  for (const vehicle of vehicles) { const seat = vehicle.occupants.indexOf(id); if (seat >= 0) return { vehicle, seat }; }
  return null;
}
export function gunnerId(v: SharedVehicle) { return v.occupants[1] ?? v.occupants[0]; }
export function seatPoint(v: SharedVehicle, seat: number) {
  const x = seat === 0 || seat === 2 ? -.5 : seat === 3 ? .5 : 0;
  const z = seat < 2 ? -.4 : .7;
  return { x: v.x + Math.cos(v.yaw) * x + Math.sin(v.yaw) * z, y: v.y + (seat === 1 && v.kind === 'car' ? 2.8 : 1.65), z: v.z - Math.sin(v.yaw) * x + Math.cos(v.yaw) * z };
}
/** Slab test in hull-local space, including wrecks; no client hit claims needed. */
export function vehicleRayDistance(v: VehicleState, origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }) {
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw), dx = origin.x - v.x, dz = origin.z - v.z;
  const starts = [c * dx - s * dz, origin.y - v.y, s * dx + c * dz];
  const rays = [c * direction.x - s * direction.z, direction.y, s * direction.x + c * direction.z];
  const limits = v.kind === 'car' ? [[-1.1, 1.1], [.2, 2.2], [-2.3, 2.3]] : [[-1.2, 1.2], [.3, 2.9], [-2.3, 3.8]];
  let near = 0, far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(rays[i]) < 1e-8) { if (starts[i] < limits[i][0] || starts[i] > limits[i][1]) return Infinity; }
    else { const a = (limits[i][0] - starts[i]) / rays[i], b = (limits[i][1] - starts[i]) / rays[i]; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  }
  return far >= near ? near : Infinity;
}
export function vehicleGunRay(v: SharedVehicle, aim?: { x: number; y: number; z: number }) {
  const offset = v.kind === 'car' ? -.45 : -1.7;
  const origin = { x: v.x + Math.sin(v.yaw) * offset, y: v.y + (v.kind === 'car' ? 2.55 : .72), z: v.z + Math.cos(v.yaw) * offset };
  if (aim) {
    const dx = aim.x - origin.x, dy = aim.y - origin.y, dz = aim.z - origin.z;
    v.gunYaw = Math.atan2(-dx, -dz); v.gunPitch = Math.max(v.kind === 'car' ? -.26 : -1.05, Math.min(.65, Math.atan2(dy, Math.hypot(dx, dz))));
  }
  return { origin, direction: { x: -Math.sin(v.gunYaw) * Math.cos(v.gunPitch), y: Math.sin(v.gunPitch), z: -Math.cos(v.gunYaw) * Math.cos(v.gunPitch) } };
}

export function validVehicleControls(value: unknown): value is VehicleControls {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!['forward', 'steer', 'lift'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]) && Math.abs(v[k] as number) <= 1) || !['brake', 'boost', 'fire'].every(k => typeof v[k] === 'boolean')) return false;
  if (v.aim !== undefined) {
    if (!v.aim || typeof v.aim !== 'object' || Array.isArray(v.aim)) return false;
    const aim = v.aim as Record<string, unknown>;
    if (!['x', 'y', 'z'].every(k => typeof aim[k] === 'number' && Number.isFinite(aim[k]) && Math.abs(aim[k] as number) <= 2000)) return false;
  }
  return true;
}
