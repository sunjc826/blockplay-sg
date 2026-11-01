import { MARINA_BOUNDS, type Obstacle } from './marina-collision';
import { type RegionBounds, createRegionMovement, overlapsObstacle, overlapsObstacleRect } from './region-collision';
import { VEHICLE_COMBAT } from './vehicle-combat';
export type VehicleKind = 'car' | 'helicopter';
export interface VehicleSpawn { x: number; z: number; yaw: number }
export type VehicleWorldBounds = RegionBounds;
export interface VehicleState {
  despawned?: boolean;
  kind: VehicleKind;
  x: number; y: number; z: number; yaw: number; speed: number; climb: number;
  /** Sideways velocity in hull space, m/s; absent in older saved snapshots. */
  lateralSpeed?: number;
  /** Collision-induced yaw rate, rad/s. */
  yawSpeed?: number;
  health: number; ammo: number; weaponCooldown: number;
}
export interface FlightObstacle extends Obstacle { minY: number; maxY: number }
/** Impact speed is the inward velocity at contact, before the collision impulse. */
export interface VehicleMovement { state: VehicleState; blocked: boolean; impactSpeed: number }
export const VEHICLE_SPAWNS = { car: { x: -48, z: 68, yaw: -Math.PI / 2 }, helicopter: { x: -65, z: 69, yaw: 0 } };
export const createVehicle = (kind: VehicleKind, spawn: VehicleSpawn = VEHICLE_SPAWNS[kind]): VehicleState => ({ kind, despawned: false, ...spawn, y: .13, speed: 0, lateralSpeed: 0, yawSpeed: 0, climb: 0, health: VEHICLE_COMBAT[kind].health, ammo: VEHICLE_COMBAT[kind].ammo, weaponCooldown: 0 });
const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function vehicleBounds(v: VehicleState): Obstacle {
  const width = v.kind === 'car' ? 1.25 : 1.35, length = v.kind === 'car' ? 2.35 : 3.8;
  const x = Math.abs(Math.cos(v.yaw)) * width + Math.abs(Math.sin(v.yaw)) * length;
  const z = Math.abs(Math.sin(v.yaw)) * width + Math.abs(Math.cos(v.yaw)) * length;
  return { minX: v.x - x, maxX: v.x + x, minZ: v.z - z, maxZ: v.z + z };
}
/** Total horizontal motion, including a post-impact skid. */
export const vehicleSpeed = (v: VehicleState) => Math.hypot(v.speed, v.lateralSpeed ?? 0);
export function stopVehicle(v: VehicleState) { v.speed = v.climb = v.lateralSpeed = v.yawSpeed = 0; }

/** Advance to the contact surface rather than leaving a substep-sized gap. */
function contactFraction(clear: (fraction: number) => boolean) {
  if (clear(1)) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/** Keep tangent momentum; only the velocity into a surface receives an impulse. */
function horizontalMotion(v: VehicleState, yaw: number, speed: number, lateral: number, yawSpeed: number, dt: number,
  clear: (x: number, z: number) => boolean, gradeClear: (x: number, z: number, nx: number, nz: number) => boolean = () => true) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  let vx = -sin * speed + cos * lateral, vz = -cos * speed - sin * lateral;
  let { x, z } = v;
  let hitX = 0, hitZ = 0, blocked = false;
  const steps = Math.max(1, Math.ceil(Math.hypot(vx, vz) * dt / .25));
  const impulse = (axis: 'x' | 'z') => {
    const incoming = axis === 'x' ? vx : vz, approach = Math.abs(incoming);
    const restitution = approach > 2.5 ? (v.kind === 'car' ? .22 : .16) : 0;
    const outgoing = -incoming * restitution;
    if (axis === 'x') { hitX = Math.max(hitX, approach); vx = outgoing; }
    else { hitZ = Math.max(hitZ, approach); vz = outgoing; }
    // A corner leading into a wall gives the hull a turn away from the impact.
    // Symmetric, head-on contacts have no lever arm and do not invent a spin.
    const nx = axis === 'x' ? -Math.sign(incoming) : 0, nz = axis === 'z' ? -Math.sign(incoming) : 0;
    const front = -sin * nx - cos * nz, side = cos * nx - sin * nz;
    const width = v.kind === 'car' ? 1.25 : 1.35, length = v.kind === 'car' ? 2.35 : 3.8;
    const support = (n: number) => Math.abs(n) < 1e-5 ? 0 : -Math.sign(n);
    const rx = -sin * length * support(front) + cos * width * support(side);
    const rz = -cos * length * support(front) - sin * width * support(side);
    const turn = (axis === 'x' ? rz : -rx) * (outgoing - incoming);
    if (approach > 2.5) yawSpeed = clamp(yawSpeed + turn * .045, -1.2, 1.2);
    blocked = true;
  };
  for (let i = 0; i < steps; i++) {
    const dx = vx * dt / steps;
    if (dx !== 0) {
      const fraction = contactFraction(t => clear(x + dx * t, z) && gradeClear(x, z, x + dx * t, z));
      x += dx * fraction;
      if (fraction < 1) impulse('x');
    }
    const dz = vz * dt / steps;
    if (dz !== 0) {
      const fraction = contactFraction(t => clear(x, z + dz * t) && gradeClear(x, z, x, z + dz * t));
      z += dz * fraction;
      if (fraction < 1) impulse('z');
    }
  }
  return { x, z, speed: (-sin * vx - cos * vz) || 0, lateralSpeed: (cos * vx - sin * vz) || 0, yawSpeed, blocked, impactSpeed: Math.hypot(hitX, hitZ) };
}

export function driveVehicle(v: VehicleState, forward: number, steer: number, brake: boolean, dt: number, obstacles: readonly Obstacle[], bounds: VehicleWorldBounds = MARINA_BOUNDS): VehicleMovement {
  if (v.health <= 0) return { state: { ...v, speed: 0, lateralSpeed: 0, yawSpeed: 0, climb: 0 }, blocked: false, impactSpeed: 0 };
  dt = clamp(dt, 0, .05);
  if (dt === 0) return { state: { ...v }, blocked: false, impactSpeed: 0 };
  const speed = brake ? damp(v.speed, 0, 15, dt) : forward ? clamp(v.speed + forward * 10 * dt, -6, 20) : damp(v.speed, 0, 2, dt);
  const lateral = damp(v.lateralSpeed ?? 0, 0, brake ? 12 : 2.5, dt);
  const yawSpeed = damp(v.yawSpeed ?? 0, 0, 5, dt);
  let steerYaw = v.yaw - steer * Math.min(Math.abs(speed) / 8, 1.3) * Math.sign(speed) * dt;
  let yaw = steerYaw + yawSpeed * dt;
  const clear = (x: number, z: number, heading = yaw) => {
    const b = vehicleBounds({ ...v, x, z, yaw: heading }), ground = bounds.groundHeight?.(x, z) ?? 0;
    return b.minX >= bounds.minX && b.maxX <= bounds.maxX && b.minZ >= bounds.minZ && b.maxZ <= bounds.maxZ && !obstacles.some(o => (ground + .13 < (o.maxY ?? Infinity) && ground + 2.7 > (o.minY ?? 0)) && overlapsObstacleRect(o, x, z, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2));
  };
  if (!clear(v.x, v.z)) { yaw = steerYaw = v.yaw; }
  // Collision spin rotates the body without rotating its world-space momentum.
  const turn = yaw - steerYaw;
  const along = speed * Math.cos(turn) - lateral * Math.sin(turn);
  const across = lateral * Math.cos(turn) + speed * Math.sin(turn);
  const gradeClear = (x: number, z: number, nx: number, nz: number) => !bounds.groundHeight || Math.abs(bounds.groundHeight(nx, nz) - bounds.groundHeight(x, z)) <= Math.hypot(nx - x, nz - z) * .25 + 1e-5;
  const motion = horizontalMotion(v, yaw, along, across, yawSpeed, dt, clear, gradeClear);
  const { blocked, impactSpeed, ...next } = motion;
  return { state: { ...v, ...next, yaw, y: (bounds.groundHeight?.(next.x, next.z) ?? 0) + .13 }, blocked, impactSpeed };
}
export function canFly(x: number, y: number, z: number, obstacles: readonly FlightObstacle[], bounds: VehicleWorldBounds = MARINA_BOUNDS) {
  const r = 2.5;
  if (x - r < bounds.minX || x + r > bounds.maxX || z - r < bounds.minZ || z + r > bounds.maxZ || y < (bounds.groundHeight?.(x,z)??0)+.13 || y > 120) return false;
  return !obstacles.some(o => y < o.maxY && y + 3.7 > o.minY && x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ && (!o.footprint || overlapsObstacle(o,x,z,r)));
}
export function flyVehicle(v: VehicleState, forward: number, steer: number, lift: number, boost: boolean, dt: number, obstacles: readonly FlightObstacle[], bounds: VehicleWorldBounds = MARINA_BOUNDS): VehicleMovement {
  if (v.health <= 0) return { state: { ...v, speed: 0, lateralSpeed: 0, yawSpeed: 0, climb: 0 }, blocked: false, impactSpeed: 0 };
  dt = clamp(dt, 0, .05);
  if (dt === 0) return { state: { ...v }, blocked: false, impactSpeed: 0 };
  const speed = damp(v.speed, forward * (boost ? 30 : 20), 1.8, dt);
  let climb = damp(v.climb, lift * 5, 3, dt), y = v.y, impactY = 0, blockedY = false;
  const yawSpeed = damp(v.yawSpeed ?? 0, 0, 4, dt), yaw = v.yaw - steer * 1.05 * dt + yawSpeed * dt;
  const turn = yawSpeed * dt, lateral = damp(v.lateralSpeed ?? 0, 0, 1.2, dt);
  const along = speed * Math.cos(turn) - lateral * Math.sin(turn), across = lateral * Math.cos(turn) + speed * Math.sin(turn);
  const verticalSteps = Math.max(1, Math.ceil(Math.abs(climb * dt) / .25));
  for (let i = 0; i < verticalSteps; i++) {
    const dy = climb * dt / verticalSteps;
    const fraction = contactFraction(t => canFly(v.x, y + dy * t, v.z, obstacles, bounds));
    y += dy * fraction;
    if (fraction < 1) {
      blockedY = true; impactY = Math.max(impactY, Math.abs(climb));
      climb = Math.abs(climb) > 3 ? -climb * .12 : 0;
      // Exact ground contact keeps ordinary landings on the terrain datum.
      const ground = (bounds.groundHeight?.(v.x, v.z) ?? 0) + .13;
      if (dy < 0 && Math.abs(y - ground) < 1e-4) y = ground;
      if (dy > 0 && Math.abs(y - 120) < 1e-4) y = 120;
    }
  }
  const motion = horizontalMotion(v, yaw, along, across, yawSpeed, dt, (x, z) => canFly(x, y, z, obstacles, bounds));
  const { blocked, impactSpeed, ...next } = motion;
  return { state: { ...v, ...next, y, yaw, climb }, blocked: blocked || blockedY, impactSpeed: Math.hypot(impactSpeed, impactY) };
}
/** Feet height at a place infantry can stand; null means no safe support/headroom. */
export type VehicleExitFloor = (x: number, z: number) => number | null;
export function vehicleExit(v: VehicleState, obstacles: readonly Obstacle[], bounds: VehicleWorldBounds = MARINA_BOUNDS, floor: VehicleExitFloor = () => 0) {
  if (vehicleSpeed(v) > 2 || (v.kind === 'helicopter' && (v.y > (bounds.groundHeight?.(v.x,v.z)??0)+.3 || Math.abs(v.climb) > .5))) return null;
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
