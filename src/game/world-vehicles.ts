import { canFly, createVehicle, vehicleBounds, type FlightObstacle, type VehicleKind, type VehicleSpawn, type VehicleWorldBounds } from './vehicle-rules';
import type { Obstacle } from './marina-collision';

/** A district keeps one of each hull. Replacements never refill a vehicle in use. */
export const WORLD_VEHICLES = { wreckSeconds: 45, abandonedSeconds: 120, reclaimDistance: 60, protectDistance: 25, boardCooldown: 12, boardRange: 24, combatRange: 35, waitForCrew: 3, crewRange: 45, assembleSeconds: 18, stuckSeconds: 5 } as const;
const overlaps = (a: Obstacle, b: Obstacle) => a.maxX > b.minX && a.minX < b.maxX && a.maxZ > b.minZ && a.minZ < b.maxZ;

export function clearVehicleSpawn(kind: VehicleKind, spawn: VehicleSpawn, ground: readonly Obstacle[], flight: readonly FlightObstacle[], bounds: VehicleWorldBounds, reserved: readonly Obstacle[] = []) {
  const v = createVehicle(kind, spawn), hull = vehicleBounds(v);
  const pad = kind === 'helicopter' ? { minX: v.x - 6, maxX: v.x + 6, minZ: v.z - 6, maxZ: v.z + 6 } : hull;
  return pad.minX >= bounds.minX && pad.maxX <= bounds.maxX && pad.minZ >= bounds.minZ && pad.maxZ <= bounds.maxZ &&
    ![...ground, ...reserved].some(o => overlaps(pad, o)) && (kind !== 'helicopter' || canFly(v.x, v.y, v.z, flight, bounds) && !flight.some(o => o.minY < 6 && o.maxY > .15 && overlaps(pad, o)));
}

/** Prefer the district's authored motor pool; relocate only when new scenery blocks it. */
export function worldVehicleSpawns(preferred: Record<VehicleKind, VehicleSpawn>, ground: readonly Obstacle[], flight: readonly FlightObstacle[], bounds: VehicleWorldBounds, protectedPoints: readonly { x: number; z: number }[] = []) {
  const result = {} as Record<VehicleKind, VehicleSpawn>, reserved: Obstacle[] = protectedPoints.map(p => ({ minX: p.x - 1, maxX: p.x + 1, minZ: p.z - 1, maxZ: p.z + 1 }));
  for (const kind of ['helicopter', 'car'] as const) {
    const origin = preferred[kind], candidates: VehicleSpawn[] = [origin];
    for (let radius = 6; radius <= 90; radius += 6) {
      for (let i = 0; i < 16; i++) candidates.push({ x: origin.x + Math.sin(i * Math.PI / 8) * radius, z: origin.z + Math.cos(i * Math.PI / 8) * radius, yaw: origin.yaw });
    }
    const found = candidates.find(p => clearVehicleSpawn(kind, p, ground, flight, bounds, reserved));
    if (!found) throw new Error(`No clear ${kind} motor pool in this district`);
    result[kind] = found;
    reserved.push(kind === 'helicopter' ? { minX: found.x - 7, maxX: found.x + 7, minZ: found.z - 7, maxZ: found.z + 7 } : vehicleBounds(createVehicle(kind, found)));
  }
  return result;
}
