import type { CombatVector, TransportPayload } from './combat-events';

/** Host-owned reinforcement hulls. Driver health belongs to a real arena actor. */
export const TRANSPORT_HULL = {
  land: { health: 800, blastRadius: 8, blastDamage: 180 },
  air: { health: 1000, blastRadius: 10, blastDamage: 220 },
} as const;
export const TRANSPORT_CRITICAL = .25;
export const TRANSPORT_EXIT_SECONDS = .7;
export type TransportState = 'inbound' | 'unloading' | 'leaving' | 'stopped' | 'landing' | 'down' | 'wreck' | 'departed';
export interface ArenaTransport extends CombatVector {
  event: string; mode: TransportPayload['mode']; yaw: number;
  health: number; maxHealth: number; state: TransportState; visible: boolean;
  driver: string; driverAlive: boolean; passengers: number;
}
export function transportPoint(t: Pick<ArenaTransport, 'x' | 'y' | 'z' | 'yaw'>, x: number, y: number, z: number): CombatVector {
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
  return { x: t.x + x * c + z * s, y: t.y + y, z: t.z - x * s + z * c };
}
export function transportDriverPoint(t: ArenaTransport) {
  return t.mode === 'land' ? transportPoint(t, .55, 2.4, -2.4) : transportPoint(t, .45, 2.05, -1.6);
}
/** Oriented hull boxes leave the cockpit glazing open to hits on its driver. */
export function transportRayDistance(t: Pick<ArenaTransport, 'x' | 'y' | 'z' | 'yaw' | 'mode' | 'visible' | 'state'>, origin: CombatVector, ray: CombatVector) {
  if (!t.visible || t.state === 'departed') return Infinity;
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw), dx = origin.x - t.x, dz = origin.z - t.z;
  const o = [dx * c - dz * s, origin.y - t.y, dx * s + dz * c];
  const d = [ray.x * c - ray.z * s, ray.y, ray.x * s + ray.z * c];
  const boxes = t.mode === 'land' ? [
    [-1.2, 1.2, .4, 1.95, -3.3, 3.3], [-1.2, 1.2, 1.95, 3.3, -1.15, 3.3], [-1.2, 1.2, 2.65, 2.8, -3.3, -1.15],
  ] : [
    [-1.1, 1.1, .5, 1.25, -2.2, 1.6], [-1.1, 1.1, 1.25, 2.6, -.5, 1.6], [-.35, .35, 1.3, 2.3, 1.6, 5.7],
  ];
  let nearest = Infinity;
  for (const b of boxes) {
    let near = 0, far = Infinity;
    for (let axis = 0; axis < 3; axis++) {
      const lo = b[axis * 2], hi = b[axis * 2 + 1];
      if (Math.abs(d[axis]) < 1e-8) { if (o[axis] < lo || o[axis] > hi) { far = -1; break; } }
      else { const a = (lo - o[axis]) / d[axis], z = (hi - o[axis]) / d[axis]; near = Math.max(near, Math.min(a, z)); far = Math.min(far, Math.max(a, z)); }
    }
    if (far >= near) nearest = Math.min(nearest, near);
  }
  return nearest;
}
export function validTransport(value: unknown): value is ArenaTransport {
  if (!value || typeof value !== 'object') return false;
  const t = value as ArenaTransport;
  return typeof t.event === 'string' && t.event.length <= 100 && (t.mode === 'land' || t.mode === 'air') &&
    ['x', 'y', 'z', 'yaw', 'health', 'maxHealth'].every(k => Number.isFinite(t[k as keyof ArenaTransport])) &&
    Math.abs(t.x) <= 5000 && Math.abs(t.z) <= 5000 && t.y >= -50 && t.y <= 400 &&
    t.maxHealth === TRANSPORT_HULL[t.mode].health && t.health >= 0 && t.health <= t.maxHealth &&
    ['inbound', 'unloading', 'leaving', 'stopped', 'landing', 'down', 'wreck', 'departed'].includes(t.state) &&
    typeof t.visible === 'boolean' && typeof t.driver === 'string' && t.driver.length > 0 && t.driver.length <= 100 && typeof t.driverAlive === 'boolean' &&
    Number.isInteger(t.passengers) && t.passengers >= 0 && t.passengers <= (t.mode === 'land' ? 8 : 6) &&
    (t.health > 0 ? !['down', 'wreck'].includes(t.state) : ['down', 'wreck', 'departed'].includes(t.state)) &&
    (t.driverAlive || !['inbound', 'unloading', 'leaving'].includes(t.state)) && (t.health > 0 || !t.driverAlive);
}
