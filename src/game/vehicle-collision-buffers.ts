import type { Obstacle } from './region-collision';
import { vehicleBounds, type FlightObstacle } from './vehicle-rules';
import type { SharedVehicle } from './vehicle-seats';

interface Buffer<T> { source?: readonly T[]; count: number; items: T[] }
function prefix<T>(buffers: WeakMap<SharedVehicle, Buffer<T>>, vehicle: SharedVehicle, source: readonly T[]) {
  let buffer = buffers.get(vehicle);
  if (!buffer || buffer.source !== source || buffer.count !== source.length) {
    buffer = { source, count: source.length, items: source.slice() }; buffers.set(vehicle, buffer);
  } else buffer.items.length = buffer.count;
  return buffer.items;
}

/** Borrowed per-vehicle buffers for synchronous physics only. Authored source
 * lists have stable membership; use a new list when replacing authored geometry.
 * Objects in that prefix stay live, and other vehicles are sampled on every call
 * in simulation order. No hull geometry or movement results are pooled.
 */
export function createVehicleCollisionBuffers(ground: readonly Obstacle[], fallbackFlight: readonly Obstacle[]) {
  const groundBuffers = new WeakMap<SharedVehicle, Buffer<Obstacle>>();
  const flightBuffers = new WeakMap<SharedVehicle, Buffer<FlightObstacle>>();
  return {
    ground(vehicle: SharedVehicle, vehicles: readonly SharedVehicle[]) {
      const result = prefix(groundBuffers, vehicle, ground);
      for (const other of vehicles) if (!other.despawned && other !== vehicle && other.y < 2) result.push(vehicleBounds(other));
      return result;
    },
    flight(vehicle: SharedVehicle, vehicles: readonly SharedVehicle[], authored?: readonly FlightObstacle[]) {
      let result: FlightObstacle[];
      if (authored) result = prefix(flightBuffers, vehicle, authored);
      else {
        let buffer = flightBuffers.get(vehicle);
        if (!buffer || buffer.source) { buffer = { count: 0, items: [] }; flightBuffers.set(vehicle, buffer); }
        result = buffer.items; result.length = 0;
        // Preserve the fallback's current copied properties, including minY=0.
        for (const obstacle of fallbackFlight) result.push({ ...obstacle, minY: 0, maxY: obstacle.maxY ?? 2.5 });
      }
      for (const other of vehicles) if (!other.despawned && other !== vehicle)
        result.push({ ...vehicleBounds(other), minY: other.y, maxY: other.y + 2.7 });
      return result;
    },
  };
}
