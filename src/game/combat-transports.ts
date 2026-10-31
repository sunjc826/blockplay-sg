import type { CombatVector, TransportPayload } from './combat-events';

/** Host-owned reinforcement hulls. Driver health belongs to a real arena actor. */
export const TRANSPORT_HULL = {
  land: { health: 800, blastRadius: 8, blastDamage: 180 },
  air: { health: 1000, blastRadius: 10, blastDamage: 220 },
  sea: { health: 900, blastRadius: 8, blastDamage: 180 },
} as const;
export const TRANSPORT_CRITICAL = .25;
export const TRANSPORT_EXIT_SECONDS = .7;
export type TransportState = 'inbound' | 'ramping' | 'unloading' | 'leaving' | 'stopped' | 'landing' | 'down' | 'wreck' | 'departed';
export interface ArenaTransport extends CombatVector {
  event: string; mode: TransportPayload['mode']; yaw: number;
  health: number; maxHealth: number; state: TransportState; visible: boolean;
  driver: string; driverAlive: boolean; passengers: number;
  /** Sea only: host-owned bow-ramp progress, 0 closed to 1 open. */
  ramp?: number;
}
export function transportPoint(t: Pick<ArenaTransport, 'x' | 'y' | 'z' | 'yaw'>, x: number, y: number, z: number): CombatVector {
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
  return { x: t.x + x * c + z * s, y: t.y + y, z: t.z - x * s + z * c };
}
export function transportDriverPoint(t: ArenaTransport) {
  if (t.mode === 'sea') return transportPoint(t, .65, 2.3, 2.3);
  return t.mode === 'land' ? transportPoint(t, .55, 2.4, -2.4) : transportPoint(t, .45, 2.05, -1.6);
}
/** Oriented hull boxes leave the cockpit glazing open to hits on its driver. */
export function transportRayDistance(t: Pick<ArenaTransport, 'x' | 'y' | 'z' | 'yaw' | 'mode' | 'visible' | 'state' | 'ramp'>, origin: CombatVector, ray: CombatVector) {
  if (!t.visible || t.state === 'departed') return Infinity;
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw), dx = origin.x - t.x, dz = origin.z - t.z;
  const o = [dx * c - dz * s, origin.y - t.y, dx * s + dz * c];
  const d = [ray.x * c - ray.z * s, ray.y, ray.x * s + ray.z * c];
  const boxes = t.mode === 'sea' ? [
    [-1.65, 1.65, -.35, .6, -4, 4], [-1.65, -1.3, .6, 1.3, -4, 4], [1.3, 1.65, .6, 1.3, -4, 4], [-1.3, 1.3, .6, 1.65, 1.6, 3.6],
  ] : t.mode === 'land' ? [
    [-1.2, 1.2, .4, 1.95, -3.3, 3.3], [-1.2, 1.2, 1.95, 3.3, -1.15, 3.3], [-1.2, 1.2, 2.65, 2.8, -3.3, -1.15],
  ] : [
    [-1.1, 1.1, .5, 1.25, -2.2, 1.6], [-1.1, 1.1, 1.25, 2.6, -.5, 1.6], [-.35, .35, 1.3, 2.3, 1.6, 5.7],
  ];
  let nearest = Math.min(...boxes.map(b => rayBox(o, d, b)));
  if (t.mode === 'sea') {
    // The rendered telescoping ramp is armour too, at exactly the same angle and length.
    const k = t.ramp ?? 0, angle = Math.PI / 2 + (-Math.atan2(.41, 5) - Math.PI / 2) * k, c = Math.cos(angle), s = Math.sin(angle);
    const y = o[1] - .6, z = o[2] + 4, extension = .28 + .72 * k;
    nearest = Math.min(nearest, rayBox([o[0], c * y + s * z, (-s * y + c * z) / extension],
      [d[0], c * d[1] + s * d[2], (-s * d[1] + c * d[2]) / extension], [-1.2, 1.2, -.12, 0, -Math.hypot(5, .41), 0]));
  }
  return nearest;
}
function rayBox(origin: readonly number[], ray: readonly number[], box: readonly number[]) {
  let near = 0, far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const lo = box[axis * 2], hi = box[axis * 2 + 1];
    if (Math.abs(ray[axis]) < 1e-8) { if (origin[axis] < lo || origin[axis] > hi) return Infinity; }
    else { const a = (lo - origin[axis]) / ray[axis], b = (hi - origin[axis]) / ray[axis]; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  }
  return far >= near ? near : Infinity;
}
export function validTransport(value: unknown): value is ArenaTransport {
  if (!value || typeof value !== 'object') return false;
  const t = value as ArenaTransport;
  return typeof t.event === 'string' && t.event.length <= 100 && (t.mode === 'land' || t.mode === 'air' || t.mode === 'sea') &&
    ['x', 'y', 'z', 'yaw', 'health', 'maxHealth'].every(k => Number.isFinite(t[k as keyof ArenaTransport])) &&
    Math.abs(t.x) <= 5000 && Math.abs(t.z) <= 5000 && t.y >= -50 && t.y <= 400 &&
    t.maxHealth === TRANSPORT_HULL[t.mode].health && t.health >= 0 && t.health <= t.maxHealth &&
    ['inbound', 'ramping', 'unloading', 'leaving', 'stopped', 'landing', 'down', 'wreck', 'departed'].includes(t.state) &&
    typeof t.visible === 'boolean' && typeof t.driver === 'string' && t.driver.length > 0 && t.driver.length <= 100 && typeof t.driverAlive === 'boolean' &&
    Number.isInteger(t.passengers) && t.passengers >= 0 && t.passengers <= (t.mode === 'sea' ? 4 : t.mode === 'land' ? 8 : 6) &&
    (t.mode === 'sea' ? Number.isFinite(t.ramp) && t.ramp! >= 0 && t.ramp! <= 1 && !['landing', 'down'].includes(t.state) : t.ramp === undefined && t.state !== 'ramping') &&
    (t.health > 0 ? !['down', 'wreck'].includes(t.state) : ['down', 'wreck', 'departed'].includes(t.state)) &&
    (t.driverAlive || !['inbound', 'ramping', 'unloading', 'leaving'].includes(t.state)) && (t.health > 0 || !t.driverAlive);
}
