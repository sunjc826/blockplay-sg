import { withinBounds, overlapsObstacle, type Obstacle, type RegionBounds } from './region-collision';
import { surfaceHeight, surfaceContains, type TraversalObstacle, type WalkSurface } from './vertical-routes';
import type { BuildingLift } from './building-lifts';

export const MAX_STEP_HEIGHT = .35;
const EPS = 1e-5;
const EMPTY_OBSTACLES: readonly Obstacle[] = [];
const DEFAULT_GRAVITY = { rise: 15, fall: 15 };
export interface VerticalState { x: number; y: number; z: number; velocityY: number }
export interface VerticalWorld { bounds: RegionBounds; obstacles: readonly Obstacle[]; surfaces: readonly WalkSurface[]; traversalObstacles: readonly TraversalObstacle[]; lifts?: readonly BuildingLift[] }

/** Authored walk surfaces and solid prop tops; decorative roofs never become floors. */
export function createVerticalMovement(world: VerticalWorld) {
  // Static broadphase shared by gameplay and the offline evaluator. The padded
  // bins cover all supported infantry radii; larger callers use the full list.
  const bucket = <T extends Obstacle>(items: readonly T[]) => {
    const bins = new Map<string, T[]>();
    const empty: readonly T[] = [];
    for (const o of items) for (let ix = Math.floor((Math.max(world.bounds.minX, o.minX) - .75) / 16); ix <= Math.floor((Math.min(world.bounds.maxX, o.maxX) + .75) / 16); ix++)
      for (let iz = Math.floor((Math.max(world.bounds.minZ, o.minZ) - .75) / 16); iz <= Math.floor((Math.min(world.bounds.maxZ, o.maxZ) + .75) / 16); iz++) {
        const key = `${ix},${iz}`; const row = bins.get(key); if (row) row.push(o); else bins.set(key, [o]);
      }
    // Repeated support/clearance checks usually stay in one padded cell. Reuse
    // its candidate list, not collision results: dynamic extras remain live.
    let minX = Infinity, minZ = Infinity, cached = empty;
    return (x: number, z: number, radius: number): readonly T[] => {
      if (!(radius <= .75)) return items;
      if (x >= minX && x < minX + 16 && z >= minZ && z < minZ + 16) return cached;
      const ix = Math.floor(x / 16), iz = Math.floor(z / 16);
      minX = ix * 16; minZ = iz * 16;
      return cached = bins.get(`${ix},${iz}`) ?? empty;
    };
  };
  const baseAt = bucket(world.obstacles), traversalAt = bucket(world.traversalObstacles), surfacesAt = bucket(world.surfaces);
  const topsAt = bucket([...world.obstacles, ...world.traversalObstacles].filter(o => o.supportsTop && !o.water && Number.isFinite(o.maxY)));
  const overlap = (o: Obstacle, x: number, z: number, r: number) => overlapsObstacle(o, x, z, r, EPS);
  const contains = surfaceContains;
  const rawCanOccupy = (x: number, y: number, z: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = EMPTY_OBSTACLES) => {
    if (!withinBounds(world.bounds, x, z, radius) || y < (world.bounds.groundHeight?.(x,z) ?? 0) - EPS) return false;
    const blocks = (o: Obstacle) => overlap(o, x, z, radius) && y < (o.maxY ?? Infinity) - EPS && y + height > (o.minY ?? 0) + EPS;
    if (baseAt(x, z, radius).some(blocks) || extra.some(blocks)) return false;
    if (surfacesAt(x, z, radius).some(s => { const roof = surfaceHeight(s, x, z); return contains(s, x, z) && roof > y + EPS && (s.solidBelow || roof < y + height - EPS); })) return false;
    return !traversalAt(x, z, radius).some(o => overlap(o, x, z, radius) && y < o.maxY - EPS && y + height > o.minY + EPS);
  };
  const rawSupportHeight = (x: number, z: number, maxY: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = EMPTY_OBSTACLES): number | null => {
    const ground = world.bounds.groundHeight?.(x,z) ?? 0;
    let best: number | null = maxY >= ground-EPS && canOccupy(x, ground, z, radius, height, extra) ? ground : null;
    for (const s of surfacesAt(x, z, radius)) {
      const margin = Math.abs(s.startHeight - s.endHeight) < EPS ? radius : 0;
      if (!surfaceContains(s, x, z, margin)) continue;
      const y = surfaceHeight(s, x, z);
      if (y <= maxY + EPS && (best === null || y > best) && canOccupy(x, y, z, radius, height, extra)) best = y;
    }
    const tops = topsAt(x, z, radius);
    for (let i = 0; i < tops.length + extra.length; i++) {
      const o = i < tops.length ? tops[i] : extra[i - tops.length];
      const y = o.maxY;
      // Retain support while the body overlaps the real footprint. Dropping as
      // soon as its centre leaves would trap the body inside the prop's side.
      if (!o.supportsTop || o.water || y === undefined || !Number.isFinite(y) || !overlap(o, x, z, radius)) continue;
      if (y <= maxY + EPS && (best === null || y > best) && canOccupy(x, y, z, radius, height, extra)) best = y;
    }
    return best;
  };

  // One-entry caches exist only inside a synchronous move. Static geometry and
  // terrain samplers are stable during that call; changing extras are re-read on
  // the next call. Standalone queries never reuse an earlier movement answer.
  let queryEpoch = 0, moveDepth = 0;
  let occupyEpoch = -1, occupyX = 0, occupyY = 0, occupyZ = 0, occupyRadius = 0, occupyHeight = 0;
  let occupyExtra: readonly Obstacle[] = EMPTY_OBSTACLES, occupied = false;
  const canOccupy = (x: number, y: number, z: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = EMPTY_OBSTACLES) => {
    if (moveDepth === 1 && occupyEpoch === queryEpoch && x === occupyX && y === occupyY && z === occupyZ && radius === occupyRadius && height === occupyHeight && extra === occupyExtra) return occupied;
    const value = rawCanOccupy(x, y, z, radius, height, extra);
    if (moveDepth === 1) { occupyEpoch = queryEpoch; occupyX = x; occupyY = y; occupyZ = z; occupyRadius = radius; occupyHeight = height; occupyExtra = extra; occupied = value; }
    return value;
  };
  let supportEpoch = -1, supportX = 0, supportZ = 0, supportMaxY = 0, supportRadius = 0, supportBodyHeight = 0;
  let supportExtra: readonly Obstacle[] = EMPTY_OBSTACLES, supported: number | null = null;
  const supportHeight = (x: number, z: number, maxY: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = EMPTY_OBSTACLES) => {
    if (moveDepth === 1 && supportEpoch === queryEpoch && x === supportX && z === supportZ && maxY === supportMaxY && radius === supportRadius && height === supportBodyHeight && extra === supportExtra) return supported;
    const value = rawSupportHeight(x, z, maxY, radius, height, extra);
    if (moveDepth === 1) { supportEpoch = queryEpoch; supportX = x; supportZ = z; supportMaxY = maxY; supportRadius = radius; supportBodyHeight = height; supportExtra = extra; supported = value; }
    return value;
  };
  function move(state: VerticalState, dx: number, dz: number, dt: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = EMPTY_OBSTACLES, gravity = DEFAULT_GRAVITY) {
    queryEpoch++; moveDepth++;
    try { return rawMove(state, dx, dz, dt, radius, height, extra, gravity); }
    finally {
      // Invalidate on exceptions and nested calls too. Returned states are owned
      // by the caller (navigation generators can retain them between frames).
      moveDepth--; queryEpoch++; occupyExtra = supportExtra = EMPTY_OBSTACLES;
    }
  }
  function rawMove(state: VerticalState, dx: number, dz: number, dt: number, radius = .38, height = 1.8, extra: readonly Obstacle[] = EMPTY_OBSTACLES, gravity = DEFAULT_GRAVITY) {
    let { x, y, z, velocityY } = state;
    // A grounded waiting soldier does not need six identical gravity/collision
    // substeps per host tick. Recheck support so moving cover is still respected.
    if (dx === 0 && dz === 0 && velocityY <= 0) {
      const support=supportHeight(x,z,y+EPS,radius,height,extra);
      if (support!==null && Math.abs(y-support)<.025)
        return {x,y:support,z,velocityY:0,grounded:true,impactSpeed:Math.max(0,-velocityY)};
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .2), Math.ceil(dt / (1 / 120)));
    const tick = Math.max(0, dt) / steps;
    let grounded = false, impactSpeed = 0;
    for (let i = 0; i < steps; i++) {
      let support = supportHeight(x, z, y + EPS, radius, height, extra);
      grounded = velocityY <= 0 && support !== null && Math.abs(y - support) < .025;
      for (let axis = 0; axis < 2; axis++) {
        const nx = x + (axis === 0 ? dx / steps : 0), nz = z + (axis === 1 ? dz / steps : 0);
        const floor = supportHeight(nx, nz, y + (grounded ? MAX_STEP_HEIGHT : EPS), radius, height, extra);
        const ny = grounded && floor !== null && Math.abs(floor - y) <= MAX_STEP_HEIGHT + EPS ? floor : y;
        // A deck's edge is a wall at foot level; only its low ramp entrance can be stepped onto.
        const edge = surfacesAt(nx, nz, radius).some(s => contains(s, nx, nz) && !contains(s, x, z) && surfaceHeight(s, nx, nz) > ny + MAX_STEP_HEIGHT && surfaceHeight(s, nx, nz) < ny + height);
        if (!edge && canOccupy(nx, ny, nz, radius, height, extra)) { x = nx; z = nz; y = ny; }
      }
      support = supportHeight(x, z, y + EPS, radius, height, extra);
      grounded = velocityY <= 0 && support !== null && Math.abs(y - support) < .025;
      if (grounded) { impactSpeed = Math.max(impactSpeed, -velocityY); y = support!; velocityY = 0; continue; }
      velocityY -= (velocityY > 0 ? gravity.rise : gravity.fall) * tick;
      let nextY = y + velocityY * tick;
      if (velocityY > 0) {
        // Preserve base/traversal/extra order without concatenating each jump step.
        for (let group = 0; group < 3; group++) {
          const obstacles = group === 0 ? baseAt(x, z, radius) : group === 1 ? traversalAt(x, z, radius) : extra;
          for (const o of obstacles) {
            const underside = o.minY ?? 0;
            if (overlap(o, x, z, radius) && underside >= y + height - EPS && underside < nextY + height) { nextY = underside - height; velocityY = 0; }
          }
        }
        for (const s of surfacesAt(x, z, radius)) if (contains(s, x, z)) { const roof = surfaceHeight(s, x, z); if (roof >= y + height - EPS && roof < nextY + height) { nextY = roof - height; velocityY = 0; } }
      }
      const landing = supportHeight(x, z, y + EPS, radius, height, extra);
      if (velocityY <= 0 && landing !== null && nextY <= landing) { impactSpeed = Math.max(impactSpeed, -velocityY); nextY = landing; velocityY = 0; grounded = true; }
      // Nothing to land on, but no room below either: a solid prop whose top is not a floor, cleared by a jump.
      // Falling on would lodge the body inside it for good, so it stays above, free to move off.
      if (velocityY <= 0 && canOccupy(x, y, z, radius, height, extra) && !canOccupy(x, Math.max(0, nextY), z, radius, height, extra)) { nextY = y; velocityY = 0; }
      y = Math.max(0, nextY);
    }
    return { x, y, z, velocityY, grounded, impactSpeed };
  }
  return { canOccupy, supportHeight, move };
}
