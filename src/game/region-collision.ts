/** Shared axis-aligned collision core. Every region supplies only its bounds. */
export interface Obstacle { minX: number; maxX: number; minZ: number; maxZ: number; maxY?: number }
export interface Position2D { x: number; z: number }
export interface RegionBounds { minX: number; maxX: number; minZ: number; maxZ: number }

export function withinBounds(bounds: RegionBounds, x: number, z: number, radius: number) {
  return x - radius >= bounds.minX && x + radius <= bounds.maxX && z - radius >= bounds.minZ && z + radius <= bounds.maxZ;
}

/** Bounds and obstacles only; walkable ground height stays the engine's concern. */
export function createRegionMovement(bounds: RegionBounds) {
  const canOccupy = (x: number, z: number, radius: number, obstacles: readonly Obstacle[]) => {
    if (!withinBounds(bounds, x, z, radius)) return false;
    return !obstacles.some(o => x + radius > o.minX && x - radius < o.maxX && z + radius > o.minZ && z - radius < o.maxZ);
  };
  /** Small steps prevent tunnelling; separate axes let the player slide along walls. */
  const move = (position: Position2D, dx: number, dz: number, radius: number, obstacles: readonly Obstacle[]) => {
    let { x, z } = position;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.4));
    for (let i = 0; i < steps; i++) {
      if (canOccupy(x + dx / steps, z, radius, obstacles)) x += dx / steps;
      if (canOccupy(x, z + dz / steps, radius, obstacles)) z += dz / steps;
    }
    return { x, z };
  };
  return { bounds, canOccupy, move };
}
export type RegionMovement = ReturnType<typeof createRegionMovement>;
