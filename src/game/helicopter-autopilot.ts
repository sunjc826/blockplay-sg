import { canFly, type FlightObstacle, type VehicleState, type VehicleWorldBounds } from './vehicle-rules';
import type { VehicleControls } from './vehicle-seats';

export type AirMissionRole = 'infantry' | 'transport' | 'support';
export interface AirMissionContext {
  /** Ground soldiers remaining after the proposed crew leaves. */
  ground: number; groundNeeded: number; pressure: number; airCoverage: number;
  distance: number; passengers: number; transportClear: boolean; supportClear: boolean;
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
export const HELICOPTER_AI = { decisionSeconds: 30, boardingGrace: 3, boardingLimit: 18, passengerStuck: 5,
  supportSeconds: 30, missionSeconds: 150, retrySeconds: 45, cruiseSpeed: 12, clearance: 8 } as const;
/** Feasibility is a gate; tactical preference is a weighted squad-level draw. */
export function airMissionWeights(c: AirMissionContext): Record<AirMissionRole, number> {
  const need = Math.max(1, c.groundNeeded), coverage = Math.max(0, c.ground) / need;
  const pressure = clamp(c.pressure, 0, 1), deficit = Math.max(0, 1 - coverage);
  const weights = { infantry: 1.5 + deficit * 7,
    transport: c.transportClear && c.passengers > 0 && c.distance >= 55 ? clamp(c.distance / 90, .5, 3) * (1 + deficit) : 0,
    support: c.supportClear ? (.15 + pressure * 5) * clamp(coverage, .1, 1.5) / (1 + Math.max(0, c.airCoverage) * 3) : 0 };
  const total = weights.infantry + weights.transport + weights.support;
  return { infantry: weights.infantry / total, transport: weights.transport / total, support: weights.support / total };
}
export function chooseAirMission(c: AirMissionContext, roll: number): AirMissionRole {
  const weights = airMissionWeights(c), n = clamp(roll, 0, .999999999);
  return n < weights.infantry ? 'infantry' : n < weights.infantry + weights.transport ? 'transport' : 'support';
}
export interface BoardingReservation { id: string; distance: number; progressAt: number }
/** Disinterest, changed orders and no progress release the seat instead of delaying everyone. */
export function updateBoardingReservations(reservations: readonly BoardingReservation[], now: number,
  passenger: (id: string) => { eligible: boolean; aboard: boolean; distance: number } | undefined): BoardingReservation[] {
  return reservations.flatMap(r => {
    const p = passenger(r.id);
    if (!p || p.aboard || !p.eligible) return [];
    const next = p.distance < r.distance - .35 ? { ...r, distance: p.distance, progressAt: now } : r;
    return now - next.progressAt >= HELICOPTER_AI.passengerStuck ? [] : [next];
  });
}
export const boardingComplete = (started: number, now: number, reservations: readonly BoardingReservation[]) =>
  now >= started + HELICOPTER_AI.boardingGrace && (!reservations.length || now >= started + HELICOPTER_AI.boardingLimit);

export interface AirPoint { x: number; y: number; z: number }
export interface AirRoute { from: AirPoint; to: AirPoint; cruise: number }
/** Rise above the whole corridor, then descend at a validated endpoint. No geometry bypass. */
export function planAirRoute(from: AirPoint, to: AirPoint, obstacles: readonly FlightObstacle[], bounds: VehicleWorldBounds): AirRoute | null {
  // Broad phase once per candidate: the detailed scene contains thousands of
  // small meshes, while a flight corridor intersects only a fraction of them.
  obstacles = obstacles.filter(o => o.maxX > Math.min(from.x,to.x)-4 && o.minX < Math.max(from.x,to.x)+4 &&
    o.maxZ > Math.min(from.z,to.z)-4 && o.minZ < Math.max(from.z,to.z)+4);
  const distance = Math.hypot(to.x - from.x, to.z - from.z), steps = Math.max(1, Math.ceil(distance / 2));
  let cruise = Math.max(from.y, to.y, 18);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
    for (const o of obstacles) if (x + 4 > o.minX && x - 4 < o.maxX && z + 4 > o.minZ && z - 4 < o.maxZ)
      cruise = Math.max(cruise, o.maxY + HELICOPTER_AI.clearance);
    cruise = Math.max(cruise, (bounds.groundHeight?.(x,z) ?? 0) + 18);
  }
  if (cruise > 112) return null;
  for (const p of [from, to]) for (let y = p.y; y <= cruise + 1e-5; y += Math.min(2, Math.max(.01, cruise - y))) {
    if (!canFly(p.x, y, p.z, obstacles, bounds)) return null;
    if (y >= cruise) break;
  }
  for (let i = 0; i <= steps; i++) if (!canFly(from.x + (to.x-from.x)*i/steps, cruise, from.z+(to.z-from.z)*i/steps, obstacles, bounds)) return null;
  return { from:{...from}, to:{...to}, cruise };
}
export interface HelicopterMission {
  role: Exclude<AirMissionRole, 'infantry'>; objective: string; home: AirPoint; destination: AirPoint;
  route: AirRoute; phase: 'boarding' | 'climb' | 'cruise' | 'approach' | 'support' | 'unloading' | 'return-climb' | 'return-cruise' | 'landing' | 'done';
  started: number; phaseAt: number; reservations: BoardingReservation[]; returning: boolean;
}
export function createHelicopterMission(role: HelicopterMission['role'], objective: string, route: AirRoute, now: number, reservations: BoardingReservation[]): HelicopterMission {
  return { role, objective, home:{...route.from}, destination:{...route.to}, route, phase:'boarding', started:now, phaseAt:now, reservations, returning:false };
}
export function returnHelicopter(m: HelicopterMission, v: AirPoint, now: number, obstacles: readonly FlightObstacle[], bounds: VehicleWorldBounds, alternates: readonly AirPoint[] = []) {
  let route: AirRoute | null = null;
  for (const p of [m.home,...alternates]) {route=planAirRoute(v,p,obstacles,bounds);if(route)break;}
  if (!route) return false;
  m.route = route; m.returning = true; m.phase = 'return-climb'; m.phaseAt = now; return true;
}
/** Produces the same controls as a human pilot; flyVehicle remains authoritative. */
export function helicopterMissionControls(m: HelicopterMission, v: VehicleState, now: number): VehicleControls {
  const neutral: VehicleControls = { forward:0, steer:0, lift:0, brake:true, boost:false, fire:false };
  const transition = (phase: HelicopterMission['phase']) => { m.phase=phase; m.phaseAt=now; };
  const horizontal = (p: AirPoint) => Math.hypot(p.x-v.x,p.z-v.z);
  const atHeight = (y: number) => Math.abs(v.y-y)<.25 && Math.abs(v.climb)<.4;
  if (m.phase==='boarding') {
    if (!boardingComplete(m.started,now,m.reservations)) return neutral;
    transition('climb');
  }
  if (m.phase==='climb' || m.phase==='return-climb') {
    if (atHeight(m.route.cruise)) transition(m.returning?'return-cruise':'cruise');
  }
  if (m.phase==='cruise' || m.phase==='return-cruise') {
    if (horizontal(m.route.to)<.55 && Math.abs(v.speed)<.5) transition(m.returning?'landing':'approach');
  }
  if (m.phase==='approach' && atHeight(m.route.to.y) && horizontal(m.route.to)<.6) transition(m.role==='support'?'support':'unloading');
  if (m.phase==='landing' && atHeight(m.route.to.y) && horizontal(m.route.to)<.6) transition('done');
  if (m.phase==='done' || m.phase==='unloading') return neutral;
  const verticalOnly = m.phase==='climb' || m.phase==='return-climb';
  const target = verticalOnly ? m.route.from : m.route.to;
  const y = verticalOnly || m.phase==='cruise' || m.phase==='return-cruise' ? m.route.cruise : target.y;
  const d = horizontal(target), heading = Math.atan2(v.x-target.x,v.z-target.z);
  const error = Math.atan2(Math.sin(heading-v.yaw),Math.cos(heading-v.yaw));
  const lift = clamp((y-v.y)*.7-v.climb*.55,-1,1);
  const desired = verticalOnly || Math.abs(v.y-y)>1 || d<.2 ? 0 : Math.min(HELICOPTER_AI.cruiseSpeed,d*1.2);
  return { ...neutral, lift, steer:d>.2?clamp(-error*2,-1,1):0,
    forward:Math.abs(error)<.3?desired/20:0 };
}
