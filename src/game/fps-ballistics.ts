/**
 * Arcade ballistics, intentionally independent of real ammunition behavior.
 * Hitscan is the degenerate case rather than a separate code path: a spec with
 * infinite velocity and no drop yields the single straight segment the engine
 * has always raycast, so existing weapons keep their exact behavior.
 */
export interface BallisticPoint { x: number; y: number; z: number }
export interface BallisticSpec {
  /** Muzzle speed in world units per second. Infinity resolves in the firing frame. */
  velocity: number;
  /** Downward acceleration in units per second squared. Zero flies straight. */
  drop: number;
}
export const HITSCAN: BallisticSpec = Object.freeze({ velocity: Infinity, drop: 0 });
/** Seconds of flight per integration segment, and the ceiling that protects the frame budget. */
export const BALLISTIC_STEP = 0.02;
export const MAX_BALLISTIC_SEGMENTS = 32;

/** A straight path needs one raycast, so the engine can keep its existing fast path. */
export const isFlat = (spec: BallisticSpec) => !(spec.drop > 0) || !(spec.velocity > 0) || !Number.isFinite(spec.velocity);
/** Instant rounds resolve in the frame they are fired, as hitscan always has. */
export const isInstant = (spec: BallisticSpec) => !Number.isFinite(spec.velocity) || !(spec.velocity > 0);
export const flightTime = (distance: number, spec: BallisticSpec) =>
  isInstant(spec) ? 0 : Math.max(0, distance) / spec.velocity;

const normalize = (d: BallisticPoint): BallisticPoint => {
  const length = Math.hypot(d.x, d.y, d.z);
  return length > 0 ? { x: d.x / length, y: d.y / length, z: d.z / length } : { x: 0, y: 0, z: 0 };
};
/** `direction` must be a unit vector; `ballisticSegments` normalizes before calling this. */
export function ballisticPoint(origin: BallisticPoint, direction: BallisticPoint, spec: BallisticSpec, t: number): BallisticPoint {
  const time = Math.max(0, t), travel = (Number.isFinite(spec.velocity) ? Math.max(0, spec.velocity) : 0) * time;
  return {
    x: origin.x + direction.x * travel,
    y: origin.y + direction.y * travel - (spec.drop > 0 ? 0.5 * spec.drop * time * time : 0),
    z: origin.z + direction.z * travel,
  };
}

export interface BallisticSegment {
  from: BallisticPoint; to: BallisticPoint;
  /** Seconds of flight elapsed on arrival at `to`. */
  time: number;
  /** Cumulative path length on arrival at `to`. */
  travelled: number;
}
/**
 * Subdivides a round's arc into segments the caller can raycast in order. A flat
 * or instant spec returns exactly one segment spanning `maxDistance`, which is
 * the straight ray the engine already traces.
 */
export function ballisticSegments(origin: BallisticPoint, direction: BallisticPoint, spec: BallisticSpec, maxDistance: number,
  step = BALLISTIC_STEP, limit = MAX_BALLISTIC_SEGMENTS): BallisticSegment[] {
  const dir = normalize(direction), distance = Math.max(0, maxDistance);
  if (isFlat(spec)) {
    const to = { x: origin.x + dir.x * distance, y: origin.y + dir.y * distance, z: origin.z + dir.z * distance };
    return [{ from: origin, to, time: flightTime(distance, spec), travelled: distance }];
  }
  const total = distance / spec.velocity;
  const count = Math.max(1, Math.min(limit, Math.ceil(total / Math.max(1e-4, step))));
  const segments: BallisticSegment[] = [];
  let from = origin, travelled = 0;
  for (let i = 1; i <= count; i++) {
    const time = total * i / count, to = ballisticPoint(origin, dir, spec, time);
    travelled += Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    segments.push({ from, to, time, travelled });
    from = to;
  }
  return segments;
}

/**
 * Elevation angle in radians that lands a round on a target at `distance`, using
 * the flat-fire approximation `atan(g·d / 2v²)`. Zero for hitscan and flat specs.
 */
export const dropCompensation = (distance: number, spec: BallisticSpec) =>
  isFlat(spec) ? 0 : Math.atan(spec.drop * Math.max(0, distance) / (2 * spec.velocity * spec.velocity));

/**
 * Damage multiplier at a range: full inside `near`, interpolating down to
 * `minScale` at `far` and holding there. A non-positive band collapses to a
 * step at `near`, so a malformed catalog entry still yields a finite scale.
 */
export function falloffScale(distance: number, near: number, far: number, minScale: number) {
  const floor = Math.max(0, Math.min(1, minScale)), range = Math.max(0, distance);
  if (!(far > near)) return range > near ? floor : 1;
  return 1 + (floor - 1) * Math.max(0, Math.min(1, (range - near) / (far - near)));
}
