import { withinBounds, type Obstacle, type RegionBounds } from './region-collision';
import { surfaceHeight, type WalkSurface, type TraversalObstacle } from './vertical-routes';

export const MAX_STEP_HEIGHT = .35;
const EPS = 1e-5;
export interface VerticalState { x: number; y: number; z: number; velocityY: number }
export interface VerticalWorld { bounds: RegionBounds; obstacles: readonly Obstacle[]; surfaces: readonly WalkSurface[]; traversalObstacles: readonly TraversalObstacle[] }

/** Authored walk surfaces only: decorative roofs never silently become floors. */
export function createVerticalMovement(world: VerticalWorld) {
  // Static broadphase shared by gameplay and the offline evaluator. The padded
  // bins cover all supported infantry radii; larger callers use the full list.
  const bucket = <T extends Obstacle>(items: readonly T[]) => {
    const bins = new Map<string, T[]>();
    for (const o of items) for (let ix = Math.floor((Math.max(world.bounds.minX, o.minX) - .75) / 16); ix <= Math.floor((Math.min(world.bounds.maxX, o.maxX) + .75) / 16); ix++)
      for (let iz = Math.floor((Math.max(world.bounds.minZ, o.minZ) - .75) / 16); iz <= Math.floor((Math.min(world.bounds.maxZ, o.maxZ) + .75) / 16); iz++) {
        const key = `${ix},${iz}`; const row = bins.get(key); if (row) row.push(o); else bins.set(key, [o]);
      }
    return (x: number, z: number, radius: number): readonly T[] => radius <= .75 ? bins.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? [] : items;
  };
  const baseAt = bucket(world.obstacles), traversalAt = bucket(world.traversalObstacles);
  const overlap = (o: Obstacle, x: number, z: number, r: number) => x + r > o.minX + EPS && x - r < o.maxX - EPS && z + r > o.minZ + EPS && z - r < o.maxZ - EPS;
  const contains = (s: WalkSurface, x: number, z: number) => x >= s.minX - EPS && x <= s.maxX + EPS && z >= s.minZ - EPS && z <= s.maxZ + EPS;
  const canOccupy = (x: number, y: number, z: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = []) => {
    if (!withinBounds(world.bounds, x, z, radius) || y < -EPS) return false;
    const blocks = (o: Obstacle) => overlap(o, x, z, radius) && y < (o.maxY ?? Infinity) - EPS && y + height > 0;
    if (baseAt(x, z, radius).some(blocks) || extra.some(blocks)) return false;
    if (world.surfaces.some(s => { const roof = surfaceHeight(s, x, z); return contains(s, x, z) && roof > y + EPS && (s.solidBelow || roof < y + height - EPS); })) return false;
    return !traversalAt(x, z, radius).some(o => overlap(o, x, z, radius) && y < o.maxY - EPS && y + height > o.minY + EPS);
  };
  const supportHeight = (x: number, z: number, maxY: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = []): number | null => {
    let best: number | null = maxY >= -EPS && canOccupy(x, 0, z, radius, height, extra) ? 0 : null;
    for (const s of world.surfaces) {
      const margin = Math.abs(s.startHeight - s.endHeight) < EPS ? radius : 0;
      if (x < s.minX - margin || x > s.maxX + margin || z < s.minZ - margin || z > s.maxZ + margin) continue;
      const y = surfaceHeight(s, x, z);
      if (y <= maxY + EPS && (best === null || y > best) && canOccupy(x, y, z, radius, height, extra)) best = y;
    }
    return best;
  };
  function move(state: VerticalState, dx: number, dz: number, dt: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = []) {
    let { x, y, z, velocityY } = state;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .2), Math.ceil(dt / (1 / 120)));
    const tick = Math.max(0, dt) / steps;
    let grounded = false;
    for (let i = 0; i < steps; i++) {
      let support = supportHeight(x, z, y + EPS, radius, height, extra);
      grounded = velocityY <= 0 && support !== null && Math.abs(y - support) < .025;
      for (const axis of ['x', 'z'] as const) {
        const nx = x + (axis === 'x' ? dx / steps : 0), nz = z + (axis === 'z' ? dz / steps : 0);
        const floor = supportHeight(nx, nz, y + (grounded ? MAX_STEP_HEIGHT : EPS), radius, height, extra);
        const ny = grounded && floor !== null && Math.abs(floor - y) <= MAX_STEP_HEIGHT + EPS ? floor : y;
        // A deck's edge is a wall at foot level; only its low ramp entrance can be stepped onto.
        const edge = world.surfaces.some(s => contains(s, nx, nz) && !contains(s, x, z) && surfaceHeight(s, nx, nz) > ny + MAX_STEP_HEIGHT && surfaceHeight(s, nx, nz) < ny + height);
        if (!edge && canOccupy(nx, ny, nz, radius, height, extra)) { x = nx; z = nz; y = ny; }
      }
      support = supportHeight(x, z, y + EPS, radius, height, extra);
      grounded = velocityY <= 0 && support !== null && Math.abs(y - support) < .025;
      if (grounded) { y = support!; velocityY = 0; continue; }
      velocityY -= 15 * tick;
      let nextY = y + velocityY * tick;
      if (velocityY > 0) {
        for (const o of traversalAt(x, z, radius)) if (overlap(o, x, z, radius) && o.minY >= y + height - EPS && o.minY < nextY + height) { nextY = o.minY - height; velocityY = 0; }
        for (const s of world.surfaces) if (contains(s, x, z)) { const roof = surfaceHeight(s, x, z); if (roof >= y + height - EPS && roof < nextY + height) { nextY = roof - height; velocityY = 0; } }
      }
      const landing = supportHeight(x, z, y + EPS, radius, height, extra);
      if (velocityY <= 0 && landing !== null && nextY <= landing) { nextY = landing; velocityY = 0; grounded = true; }
      y = Math.max(0, nextY);
    }
    return { x, y, z, velocityY, grounded };
  }
  return { canOccupy, supportHeight, move };
}
