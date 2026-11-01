import { WORLD_GATEWAYS, resolveWorldBorderCrossing, type WorldZoneId, type ZoneSpawn } from './world-zones';
import { canFly, vehicleBounds, type VehicleState, type VehicleWorldBounds, type FlightObstacle } from './vehicle-rules';
import { overlapsObstacleRect } from './region-collision';
import type { Obstacle } from './marina-collision';

/** Use the authoritative hull centre, never a seat's interpolated camera position. */
export function resolveVehicleCrossing(zone: WorldZoneId, previous: VehicleState, next: VehicleState, view: Pick<ZoneSpawn, 'yaw' | 'pitch'>) {
  if (previous.kind !== next.kind || next.despawned || next.health <= 0 ||
    ![next.y, next.yaw, next.speed, next.climb].every(Number.isFinite)) return null;
  const transition = resolveWorldBorderCrossing(zone, previous, next, view);
  const gateway = WORLD_GATEWAYS.find(g => g.id === transition?.gatewayId);
  if (!transition || !gateway?.border || !gateway.vehicles?.includes(next.kind)) return null;
  const lateral = gateway.border.axis === 'z' ? 'x' : 'z';
  const hull = vehicleBounds(next), radius = next.kind === 'helicopter' ? 2.5 : (lateral === 'x' ? hull.maxX - next.x : hull.maxZ - next.z);
  if (Math.abs(next[lateral] - gateway.position[lateral]) + radius > gateway.border.halfWidth) return null;
  // Rotor clearance: flight uses the same corridor, above its shared canopy.
  if (next.kind === 'helicopter' && next.y < 6) return null;
  return { transition, state: { ...next, x: transition.spawn.x, z: transition.spawn.z } };
}

/** Validate the full arriving hull against the actual destination geometry. */
export function vehicleArrivalClear(v: VehicleState, obstacles: readonly Obstacle[], flight: readonly FlightObstacle[], bounds: VehicleWorldBounds) {
  if (v.kind === 'helicopter') return canFly(v.x, v.y, v.z, [...flight, ...obstacles.map(o => ({ ...o, minY: o.minY ?? 0, maxY: o.maxY ?? Infinity }))], bounds);
  const b = vehicleBounds(v), ground = bounds.groundHeight?.(v.x, v.z) ?? 0;
  return Math.abs(v.y - ground - .13) < .2 && b.minX >= bounds.minX && b.maxX <= bounds.maxX && b.minZ >= bounds.minZ && b.maxZ <= bounds.maxZ &&
    !obstacles.some(o => v.y < (o.maxY ?? Infinity) && v.y + 2.57 > (o.minY ?? 0) && overlapsObstacleRect(o, v.x, v.z, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2));
}
