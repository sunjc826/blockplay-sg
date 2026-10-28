import { BALLISTIC_GRAVITY, ballisticPoint, type BallisticPoint as Point } from './fps-ballistics';
import type { GrenadeSpec } from './grenade-catalog';
export interface GrenadeFlight { position: Point; velocity: Point; age: number; remaining: number; rested: boolean; restTime: number; launched: boolean }
export interface GrenadeCollision { point: Point; normal: Point }
export type GrenadeTrace = (from: Point, to: Point) => GrenadeCollision | null;
export function launchGrenade(origin: Point, direction: Point, spec: GrenadeSpec, under = false, cooked = 0): GrenadeFlight {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1, speed = spec.throwSpeed * (under ? .5 : 1);
  return { position: { ...origin }, velocity: { x: direction.x / length * speed, y: direction.y / length * speed, z: direction.z / length * speed },
    age: 0, remaining: Math.max(0, spec.fuse - cooked), rested: false, restTime: 0, launched: false };
}
/** Fixed 10 ms collision steps, using the same constant-gravity integrator as rounds. */
export function stepGrenadeFlight(state: GrenadeFlight, spec: GrenadeSpec, dt: number, trace: GrenadeTrace): boolean {
  if (!Number.isFinite(dt) || dt < 0) return false;
  if (state.remaining <= 0 && (!spec.trigger || state.age === 0)) return true;
  for (let left = Math.min(dt, 1); left > 1e-8;) {
    const step = Math.min(.01, left); left -= step; state.age += step; state.remaining = Math.max(0, state.remaining - step);
    if (state.rested) {
      state.restTime += step;
      if (spec.trigger === 'rest') return true;
      if (spec.trigger === 'launch' && !state.launched && state.restTime >= 2) { state.launched = true; state.rested = false; state.velocity = { x: 0, y: Math.sqrt(2 * BALLISTIC_GRAVITY * 60), z: 0 }; }
    } else {
      const velocity = state.velocity, speed = Math.hypot(velocity.x, velocity.y, velocity.z), from = state.position;
      const to = ballisticPoint(from, speed ? { x: velocity.x / speed, y: velocity.y / speed, z: velocity.z / speed } : { x: 0, y: 0, z: 0 }, { velocity: speed, drop: BALLISTIC_GRAVITY }, step);
      const hit = trace(from, to); velocity.y -= BALLISTIC_GRAVITY * step;
      if (hit) {
        state.position = { x: hit.point.x + hit.normal.x * .025, y: hit.point.y + hit.normal.y * .025, z: hit.point.z + hit.normal.z * .025 };
        const dot = velocity.x * hit.normal.x + velocity.y * hit.normal.y + velocity.z * hit.normal.z;
        state.velocity = { x: (velocity.x - 2 * dot * hit.normal.x) * spec.bounce, y: (velocity.y - 2 * dot * hit.normal.y) * spec.bounce, z: (velocity.z - 2 * dot * hit.normal.z) * spec.bounce };
        if (spec.bounce === 0 || Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z) < 1) { state.rested = true; state.velocity = { x: 0, y: 0, z: 0 }; }
      } else state.position = to;
      if ((spec.trigger === 'apex' || state.launched) && velocity.y <= 0) return true;
    }
    // Fuses always remain dangerous while cooking, but rest/apex mechanisms govern flight.
    if (!spec.trigger && state.remaining <= 1e-7) return true;
    if (state.age >= 15) return true;
  }
  return false;
}
export function predictGrenadeLanding(state: GrenadeFlight, spec: GrenadeSpec, trace: GrenadeTrace): Point {
  const copy = { ...state, position: { ...state.position }, velocity: { ...state.velocity } };
  for (let i = 0; i < 150; i++) if (stepGrenadeFlight(copy, spec, .1, trace) || copy.rested) break;
  return copy.position;
}
