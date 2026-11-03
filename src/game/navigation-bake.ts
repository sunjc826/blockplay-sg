import type { VerticalWorld } from './vertical-movement';

/** Lossless JSON arrays: keep JS number precision and directed edge ordering. */
export interface NavigationBake {
  version: 1;
  key: string;
  positions: number[];
  offsets: number[];
  targets: number[];
  costs: number[];
}

/** Geometry/anchor guard. Content-hashed build assets also bind terrain and rules
 * to the app build; this key detects a different live world (e.g. a custom arena).
 */
export function navigationWorldKey(world: VerticalWorld, anchors: readonly { x: number; z: number }[]) {
  // Node and Chrome can differ in the last few trig-result bits. Quantize only
  // the signature to a micrometre (below movement epsilon), never graph values.
  const text = JSON.stringify([world.bounds, world.obstacles, world.surfaces, world.traversalObstacles, world.lifts ?? [], anchors],
    (_key, value) => typeof value === 'number' ? Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : String(value) : value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

export function validNavigationBake(value: unknown): value is NavigationBake {
  if (!value || typeof value !== 'object') return false;
  const b = value as NavigationBake;
  if (b.version !== 1 || typeof b.key !== 'string' ||
    ![b.positions, b.offsets, b.targets, b.costs].every(Array.isArray)) return false;
  const count = b.positions.length / 3;
  return Number.isInteger(count) && b.positions.every(Number.isFinite) && b.offsets.length === count + 1 &&
    b.offsets[0] === 0 && b.offsets[count] === b.targets.length && b.costs.length === b.targets.length &&
    b.offsets.every((n, i) => Number.isInteger(n) && n >= 0 && (i === 0 || n >= b.offsets[i - 1])) &&
    b.targets.every(n => Number.isInteger(n) && n >= 0 && n < count) && b.costs.every(n => Number.isFinite(n) && n >= 0);
}
