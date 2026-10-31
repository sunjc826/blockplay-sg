import { MARINA_BOUNDS, type Obstacle } from './marina-collision';
import { type RegionBounds, createRegionMovement, overlapsObstacle, overlapsObstacleRect } from './region-collision';
import { VEHICLE_COMBAT } from './vehicle-combat';
export type VehicleKind = 'car' | 'helicopter';
export interface VehicleSpawn { x: number; z: number; yaw: number }
export type VehicleWorldBounds = RegionBounds;
export interface VehicleState { kind: VehicleKind; x: number; y: number; z: number; yaw: number; speed: number; climb: number; health: number; ammo: number; weaponCooldown: number }
export interface FlightObstacle extends Obstacle { minY: number; maxY: number }
/** Impact speed is the velocity into rejected movement axes, before the solver stops them. */
export interface VehicleMovement { state: VehicleState; blocked: boolean; impactSpeed: number }
export const VEHICLE_SPAWNS = { car: { x: -48, z: 68, yaw: -Math.PI / 2 }, helicopter: { x: -65, z: 69, yaw: 0 } };
export const createVehicle = (kind: VehicleKind, spawn: VehicleSpawn = VEHICLE_SPAWNS[kind]): VehicleState => ({ kind, ...spawn, y: .13, speed: 0, climb: 0, health: VEHICLE_COMBAT[kind].health, ammo: VEHICLE_COMBAT[kind].ammo, weaponCooldown: 0 });
const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function vehicleBounds(v: VehicleState): Obstacle {
  const width = v.kind === 'car' ? 1.25 : 1.35, length = v.kind === 'car' ? 2.35 : 3.8;
  const x = Math.abs(Math.cos(v.yaw)) * width + Math.abs(Math.sin(v.yaw)) * length;
  const z = Math.abs(Math.sin(v.yaw)) * width + Math.abs(Math.cos(v.yaw)) * length;
  return { minX: v.x - x, maxX: v.x + x, minZ: v.z - z, maxZ: v.z + z };
}
export function driveVehicle(v: VehicleState, forward: number, steer: number, brake: boolean, dt: number, obstacles: readonly Obstacle[], bounds: VehicleWorldBounds = MARINA_BOUNDS): VehicleMovement {
  if (v.health <= 0) return { state: { ...v, speed: 0, climb: 0 }, blocked: false, impactSpeed: 0 };
  dt = clamp(dt, 0, .05);
  if (dt === 0) return { state: { ...v }, blocked: false, impactSpeed: 0 };
  let speed = brake ? damp(v.speed, 0, 15, dt) : forward ? clamp(v.speed + forward * 10 * dt, -6, 20) : damp(v.speed, 0, 2, dt);
  let yaw = v.yaw - steer * Math.min(Math.abs(speed) / 8, 1.3) * Math.sign(speed) * dt;
  const clear = (x: number, z: number, heading: number) => {
    const b = vehicleBounds({ ...v, x, z, yaw: heading }), ground=bounds.groundHeight?.(x,z)??0;
    return b.minX >= bounds.minX && b.maxX <= bounds.maxX && b.minZ >= bounds.minZ && b.maxZ <= bounds.maxZ && !obstacles.some(o => (ground+.13 < (o.maxY??Infinity) && ground+2.7 > (o.minY??0)) && b.maxX > o.minX && b.minX < o.maxX && b.maxZ > o.minZ && b.minZ < o.maxZ && (!o.footprint || overlapsObstacleRect(o,x,z,(b.maxX-b.minX)/2,(b.maxZ-b.minZ)/2)));
  };
  if (!clear(v.x, v.z, yaw)) yaw = v.yaw;
  const dx = -Math.sin(yaw) * speed * dt, dz = -Math.cos(yaw) * speed * dt;
  const gradeClear=(x:number,z:number,nx:number,nz:number)=>!bounds.groundHeight || Math.abs(bounds.groundHeight(nx,nz)-bounds.groundHeight(x,z))<=Math.hypot(nx-x,nz-z)*.25+1e-5;
  const next = { x: v.x, z: v.z }, steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .35));
  let blockedX = false, blockedZ = false;
  for (let i = 0; i < steps; i++) {
    if (clear(next.x + dx / steps, next.z, yaw) && gradeClear(next.x,next.z,next.x+dx/steps,next.z)) next.x += dx / steps; else if (dx !== 0) blockedX = true;
    if (clear(next.x, next.z + dz / steps, yaw) && gradeClear(next.x,next.z,next.x,next.z+dz/steps)) next.z += dz / steps; else if (dz !== 0) blockedZ = true;
  }
  const impactSpeed = Math.hypot(blockedX ? Math.sin(yaw) * speed : 0, blockedZ ? Math.cos(yaw) * speed : 0);
  // Project the surviving motion onto the heading. A scrape sheds its inward
  // velocity instead of repeatedly charging the hull for the same full-speed hit.
  if (blockedX || blockedZ) speed *= (blockedX ? 0 : Math.sin(yaw) ** 2) + (blockedZ ? 0 : Math.cos(yaw) ** 2);
  return { state: { ...v, ...next, yaw, speed, y: (bounds.groundHeight?.(next.x,next.z)??0)+.13 }, blocked: blockedX || blockedZ, impactSpeed };
}
export function canFly(x: number, y: number, z: number, obstacles: readonly FlightObstacle[], bounds: VehicleWorldBounds = MARINA_BOUNDS) {
  const r = 2.5;
  if (x - r < bounds.minX || x + r > bounds.maxX || z - r < bounds.minZ || z + r > bounds.maxZ || y < (bounds.groundHeight?.(x,z)??0)+.13-1e-5 || y > 120) return false;
  return !obstacles.some(o => y < o.maxY && y + 3.7 > o.minY && x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ && (!o.footprint || overlapsObstacle(o,x,z,r)));
}
export function flyVehicle(v: VehicleState, forward: number, steer: number, lift: number, boost: boolean, dt: number, obstacles: readonly FlightObstacle[], bounds: VehicleWorldBounds = MARINA_BOUNDS): VehicleMovement {
  if (v.health <= 0) return { state: { ...v, speed: 0, climb: 0 }, blocked: false, impactSpeed: 0 };
  dt = clamp(dt, 0, .05);
  if (dt === 0) return { state: { ...v }, blocked: false, impactSpeed: 0 };
  let speed = damp(v.speed, forward * (boost ? 30 : 20), 1.8, dt), climb = damp(v.climb, lift * 5, 3, dt);
  const yaw = v.yaw - steer * 1.05 * dt;
  const dx = -Math.sin(yaw) * speed * dt, dz = -Math.cos(yaw) * speed * dt, dy = climb * dt;
  let { x, y, z } = v;
  let blockedX = false, blockedY = false, blockedZ = false;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / .35));
  for (let i = 0; i < steps; i++) {
    const ground=(bounds.groundHeight?.(x,z)??0)+.13;
    const attemptedY = y + dy / steps, nextY = clamp(attemptedY, ground, 120);
    if (canFly(x, nextY, z, obstacles, bounds)) {
      y = nextY;
      if ((attemptedY <= ground || attemptedY >= 120) && dy !== 0) blockedY = true;
    } else if (dy !== 0) blockedY = true;
    if (canFly(x + dx / steps, y, z, obstacles, bounds)) x += dx / steps; else if (dx !== 0) blockedX = true;
    if (canFly(x, y, z + dz / steps, obstacles, bounds)) z += dz / steps; else if (dz !== 0) blockedZ = true;
  }
  const impactSpeed = Math.hypot(blockedX ? Math.sin(yaw) * speed : 0, blockedY ? climb : 0, blockedZ ? Math.cos(yaw) * speed : 0);
  if (blockedX || blockedZ) speed *= (blockedX ? 0 : Math.sin(yaw) ** 2) + (blockedZ ? 0 : Math.cos(yaw) ** 2);
  if (blockedY || y === .13 || y === 120) climb = 0;
  return { state: { ...v, x, y, z, yaw, speed, climb }, blocked: blockedX || blockedY || blockedZ, impactSpeed };
}
/** Feet height at a place infantry can stand; null means no safe support/headroom. */
export type VehicleExitFloor = (x: number, z: number) => number | null;
export function vehicleExit(v: VehicleState, obstacles: readonly Obstacle[], bounds: VehicleWorldBounds = MARINA_BOUNDS, floor: VehicleExitFloor = () => 0) {
  if (Math.abs(v.speed) > 2 || (v.kind === 'helicopter' && (v.y > (bounds.groundHeight?.(v.x,v.z)??0)+.3 || Math.abs(v.climb) > .5))) return null;
  const radius = .38, hull = vehicleBounds(v), nominal = v.kind === 'car' ? 3.2 : 4.3;
  const movement = createRegionMovement(bounds);
  const clear = (x: number, y: number, z: number) => movement.canOccupy(x, z, radius, obstacles.filter(o => y < (o.maxY ?? Infinity) - 1e-5));
  // Keep the door-side preference, then inspect the rest of the perimeter.
  const angles = [Math.PI / 2, -Math.PI / 2, Math.PI, 0, ...Array.from({ length: 32 }, (_, i) => i * Math.PI / 16)];
  for (const angle of angles) {
    const dx = -Math.sin(v.yaw + angle), dz = -Math.cos(v.yaw + angle);
    // Infantry collides with the hull's world-aligned box. A fixed distance
    // leaves every candidate inside that box when a vehicle is parked diagonally.
    const edge = Math.min((hull.maxX - v.x + radius) / Math.max(Math.abs(dx), 1e-8),
      (hull.maxZ - v.z + radius) / Math.max(Math.abs(dz), 1e-8)) + .06;
    for (const distance of [Math.max(nominal, edge), edge, Math.max(nominal, edge) + .8]) {
      const x = v.x + dx * distance, z = v.z + dz * distance, y = floor(x, z);
      if (y === null || !clear(x, y, z) || !movement.canOccupy(x, z, radius, [hull])) continue;
      // A clear endpoint beyond a wall is not an exit. Check the path out of
      // the cab too, using infantry support rather than driving projections.
      let reachable = true;
      for (let d = 0; d < distance; d += .2) {
        const px = v.x + dx * d, pz = v.z + dz * d, py = floor(px, pz);
        if (py === null || !clear(px, py, pz)) { reachable = false; break; }
      }
      if (reachable) return { x, y, z };
    }
  }
  return null;
}
