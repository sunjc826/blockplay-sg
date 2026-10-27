/** A faint wake left in world space, independent of the luminous tracer. */
interface Point { x: number; y: number; z: number }
export interface ShotSmoke extends Point {
  dx: number; dy: number; dz: number; length: number;
  age: number; life: number; phase: number; fresh: boolean;
}
export const MAX_SHOT_SMOKE = 320;
const SPACING = .9;
/** Keep the sights clear and avoid turning distant rifle fire into contrails. */
export const SHOT_SMOKE_START = 1.8, SHOT_SMOKE_END = 38;

/**
 * Distance-based sampling gives the same wake at any frame rate. `travelled`
 * includes this segment, whose end must already be clipped to the actual hit.
 * Adjacent pieces overlap softly; no piece extends through the struck surface.
 */
export function recordShotSmoke(pool: ShotSmoke[], from: Point, to: Point, travelled: number, random = Math.random) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-6 || !Number.isFinite(distance + travelled)) return;
  const start = travelled - distance;
  const lo = Math.max(SHOT_SMOKE_START, start), hi = Math.min(SHOT_SMOKE_END, travelled);
  // Each cell is emitted once, when its end is reached, even across tiny steps.
  for (let cell = Math.floor((lo - SHOT_SMOKE_START) / SPACING + 1e-6); ; cell++) {
    const end = SHOT_SMOKE_START + (cell + 1) * SPACING;
    if (end > hi + 1e-6) break;
    const length = Math.min(SPACING * 1.2, end - SHOT_SMOKE_START);
    const along = end - start - length / 2;
    if (pool.length >= MAX_SHOT_SMOKE) pool.shift();
    pool.push({
      x: from.x + dx / distance * along, y: from.y + dy / distance * along, z: from.z + dz / distance * along,
      dx: dx / distance, dy: dy / distance, dz: dz / distance, length,
      age: 0, life: .48 + random() * .16, phase: random() * Math.PI * 2, fresh: true,
    });
  }
}

export function advanceShotSmoke(pool: ShotSmoke[], dt: number) {
  const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  for (let i = pool.length - 1; i >= 0; i--) {
    const wisp = pool[i];
    // Samples were just emitted during this frame. Give them one soft arrival
    // even if a slow renderer spent longer than their whole lifetime on it.
    const step = wisp.fresh ? Math.min(elapsed, .05) : elapsed;
    wisp.fresh = false; wisp.age += step;
    if (wisp.age >= wisp.life) { pool.splice(i, 1); continue; }
    wisp.x += Math.cos(wisp.phase) * .045 * step;
    wisp.y += .09 * step; wisp.z += Math.sin(wisp.phase) * .045 * step;
  }
}

/** Normal alpha, with a short soft arrival and a longer dissipation. */
export function shotSmokeOpacity(wisp: ShotSmoke) {
  const t = Math.max(0, Math.min(1, wisp.age / wisp.life));
  return .16 * Math.min(1, wisp.age / .035) * Math.pow(1 - t, 1.7);
}
