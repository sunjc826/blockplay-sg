/**
 * Mantling and vaulting. A jump pressed into chest-high cover climbs onto it,
 * a jump pressed into a low wall with no top to stand on goes over it, and a
 * jump that falls just short of a ledge is pulled up onto it. The plan is
 * checked against the world before the body moves, because the climb itself
 * follows a fixed path rather than colliding its way up. The engine owns when a
 * mantle may start and what the hands do meanwhile.
 */
import type { Obstacle } from './region-collision';

/** The part of the world a plan reads: `createVerticalMovement` supplies both. */
export interface MantleWorld {
  canOccupy(x: number, y: number, z: number, radius?: number, height?: number, extra?: readonly Obstacle[]): boolean;
  supportHeight(x: number, z: number, maxY: number, radius?: number, height?: number, extra?: readonly Obstacle[]): number | null;
}
/** Highest ledge a standing start reaches, in metres above the feet. */
export const MANTLE_REACH = 1.6;
/** Below this a jump clears the thing on its own and keeps its momentum, so a standing start leaves it alone. */
export const MANTLE_GROUND_MIN = .75;
/** How far above the feet the hands catch a ledge in mid-air. */
export const MANTLE_AIR_REACH = 1.25;
export const MANTLE_AIR_MIN = .3;
const RADIUS = .38, STAND = 1.8, TUCK = 1.2;
/** What counts as in the way: taller than a step, at knee height, just ahead. */
const KNEE = .37, AHEAD = .5;
const ONTO = [.85, .65, AHEAD], OVER = [AHEAD, .8, 1.1, 1.4, 1.7, 2];
const LIFT_STEP = .15;
/** Metres a second up the face, then across the top. */
const RISE_SPEED = 3.4, CROSS_SPEED = 4.2;

export interface MantlePlan { x: number; y: number; z: number; vault: boolean }
export interface MantleOptions { minLift: number; reach: number; vault: boolean; extra?: readonly Obstacle[] }

/** Where a mantle from `from` (feet) along the unit direction ends, or null when there is nothing to climb or no room to. */
export function planMantle(world: MantleWorld, from: { x: number; y: number; z: number }, dirX: number, dirZ: number, options: MantleOptions): MantlePlan | null {
  const { x, y, z } = from, { minLift, reach, extra } = options;
  if (!(reach >= minLift) || world.canOccupy(x + dirX * AHEAD, y + KNEE, z + dirZ * AHEAD, RADIUS, 1, extra)) return null;
  for (const d of ONTO) {
    const px = x + dirX * d, pz = z + dirZ * d, top = world.supportHeight(px, pz, y + reach, RADIUS, STAND, extra);
    if (top === null || top < y + minLift) continue;
    // Room for the body up the face and across the lip, tucked.
    if (world.canOccupy(x, top, z, RADIUS, TUCK, extra) && world.canOccupy(x + dirX * d / 2, top, z + dirZ * d / 2, RADIUS, TUCK, extra)) return { x: px, y: top, z: pz, vault: false };
  }
  if (!options.vault) return null;
  // No top to stand on: find the lowest height the body crosses at, and the first ground beyond.
  for (let lift = minLift - LIFT_STEP; lift <= reach + 1e-6; lift += LIFT_STEP) {
    const clear = y + lift;
    if (!world.canOccupy(x, clear, z, RADIUS, TUCK, extra)) return null;
    for (const d of OVER) {
      const px = x + dirX * d, pz = z + dirZ * d;
      if (!world.canOccupy(px, clear, pz, RADIUS, TUCK, extra)) break;
      const land = world.supportHeight(px, pz, clear, RADIUS, STAND, extra);
      if (land === null || land > y + KNEE) continue;
      // Crossed at the first height tried, it is low enough to jump.
      return lift < minLift ? null : { x: px, y: clear, z: pz, vault: true };
    }
  }
  return null;
}

export interface MantleState { active: boolean; vault: boolean; elapsed: number; duration: number; rise: number;
  fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; dirX: number; dirZ: number }
export const createMantle = (): MantleState => ({ active: false, vault: false, elapsed: 0, duration: 0, rise: 0,
  fromX: 0, fromY: 0, fromZ: 0, toX: 0, toY: 0, toZ: 0, dirX: 0, dirZ: 0 });

/** `pace` above 1 climbs faster; a heavy load passes less. */
export function startMantle(state: MantleState, from: { x: number; y: number; z: number }, plan: MantlePlan, pace = 1) {
  const across = Math.hypot(plan.x - from.x, plan.z - from.z), speed = Math.max(.5, Math.min(1.25, pace));
  const rise = Math.max(0, plan.y - from.y) / (RISE_SPEED * speed), cross = across / (CROSS_SPEED * speed);
  Object.assign(state, { active: true, vault: plan.vault, elapsed: 0, duration: rise + cross, rise,
    fromX: from.x, fromY: from.y, fromZ: from.z, toX: plan.x, toY: plan.y, toZ: plan.z,
    dirX: across > 1e-6 ? (plan.x - from.x) / across : 0, dirZ: across > 1e-6 ? (plan.z - from.z) / across : 0 });
}
/** Feet position after `dt` more of the climb: straight up the face, then across, so the body never cuts the corner. */
export function advanceMantle(state: MantleState, dt: number) {
  if (state.active) state.elapsed = Math.min(state.duration, state.elapsed + Math.max(0, Number.isFinite(dt) ? dt : 0));
  const up = state.rise > 1e-6 ? Math.min(1, state.elapsed / state.rise) : 1;
  const span = state.duration - state.rise, over = span > 1e-6 ? Math.max(0, Math.min(1, (state.elapsed - state.rise) / span)) : up >= 1 ? 1 : 0;
  // Pull hard off the ground and ease onto the lip; leave the top already moving.
  const lifted = 1 - (1 - up) * (1 - up), crossed = over * (.6 + .4 * over);
  if (state.elapsed >= state.duration - 1e-9) { state.active = false; return { x: state.toX, y: state.toY, z: state.toZ }; }
  return { x: state.fromX + (state.toX - state.fromX) * crossed, y: state.fromY + (state.toY - state.fromY) * lifted, z: state.fromZ + (state.toZ - state.fromZ) * crossed };
}
