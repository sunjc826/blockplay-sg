import { ballisticPoint, isInstant, type BallisticPoint, type BallisticSpec } from './fps-ballistics';

/**
 * A round the engine still has to resolve. Instant weapons never produce one:
 * they keep resolving inside the frame they were fired, as hitscan always has.
 * Stepping is pure so it can be tested without a renderer; the caller raycasts
 * the segment each step hands back and reports what it struck.
 */
export interface InFlightRound {
  id: number; weapon: number; ballistics: BallisticSpec;
  origin: BallisticPoint; direction: BallisticPoint;
  position: BallisticPoint; time: number; travelled: number;
  /** Surfaces this round may still pass through before it stops. */
  pierced: number;
  /** Damage multiplier left after the surfaces it has already pierced. */
  scale: number;
  /** Times it has skipped off water; see `skipRound`. */
  skips: number;
}
/** Keeps the per-frame raycast budget bounded on a software renderer. */
export const MAX_ROUNDS_IN_FLIGHT = 24;

export function createRound(id: number, weapon: number, origin: BallisticPoint, direction: BallisticPoint, ballistics: BallisticSpec, pierced = 0): InFlightRound {
  return { id, weapon, ballistics, origin, direction, position: origin, time: 0, travelled: 0, pierced: Math.max(0, pierced), scale: 1, skips: 0 };
}
export interface RoundStep { from: BallisticPoint; to: BallisticPoint; distance: number; expired: boolean }
/**
 * Advances a round by `dt` and returns the segment to test. `expired` marks the
 * last segment of a round that has reached `maxDistance`, so the caller can drop
 * it after testing rather than before, and never lose its final impact.
 */
export function advanceRound(round: InFlightRound, dt: number, maxDistance: number): RoundStep {
  const step = Math.max(0, dt), from = round.position;
  const to = ballisticPoint(round.origin, round.direction, round.ballistics, round.time + step);
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  round.time += step; round.position = to; round.travelled += distance;
  return { from, to, distance, expired: round.travelled >= maxDistance };
}
/** A round skips at most this often before the water takes it. */
export const MAX_SKIPS = 2;
/** What a skip leaves of a round's speed: the water it shoved aside cost it. */
export const SKIP_SPEED = 0.7;
/**
 * Restarts a round's arc from the point it skipped off water, flying the new
 * direction at reduced speed. Its path is integrated from a fresh origin, so the
 * drop it had built up is spent and the new arc starts level with the bounce.
 * Returns false once it has used up its skips, when the caller should stop it.
 */
export function skipRound(round: InFlightRound, at: BallisticPoint, direction: BallisticPoint, energy: number) {
  if (round.skips >= MAX_SKIPS) return false;
  round.skips++;
  round.origin = { x: at.x, y: at.y, z: at.z }; round.position = round.origin;
  round.direction = { x: direction.x, y: direction.y, z: direction.z };
  round.ballistics = { ...round.ballistics, velocity: round.ballistics.velocity * SKIP_SPEED };
  round.time = 0; round.scale *= energy;
  // A skipped round is deformed and tumbling: it pierces nothing further.
  round.pierced = 0;
  return true;
}
/** Instant specs are resolved by the caller's existing single raycast. */
export const needsFlight = (ballistics: BallisticSpec) => !isInstant(ballistics);
