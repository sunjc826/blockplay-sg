/** Shared axis-aligned collision core. Every region supplies only its bounds. */
export interface Obstacle { minX: number; maxX: number; minZ: number; maxZ: number; maxY?: number; minY?: number; footprint?: readonly Position2D[] }
export interface Position2D { x: number; z: number }
export interface RegionBounds { minX: number; maxX: number; minZ: number; maxZ: number; groundHeight?: (x: number, z: number) => number }

/** Convex authored footprints retain a bounding box for the spatial index. */
export function insideFootprint(points: readonly Position2D[], x: number, z: number) {
  let positive = false, negative = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = (b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);
    positive ||= cross > 1e-5; negative ||= cross < -1e-5;
  }
  return !(positive && negative);
}

/** Separating axes against the same square body envelope used by legacy boxes. */
export function overlapsObstacle(o: Obstacle, x: number, z: number, radius: number, epsilon = 0) {
  return overlapsObstacleRect(o,x,z,radius,radius,epsilon);
}

/** Also accepts the unequal half-extents of a vehicle's existing body envelope. */
export function overlapsObstacleRect(o: Obstacle, x: number, z: number, halfX: number, halfZ: number, epsilon = 0) {
  if (x+halfX <= o.minX+epsilon || x-halfX >= o.maxX-epsilon || z+halfZ <= o.minZ+epsilon || z-halfZ >= o.maxZ-epsilon) return false;
  if (!o.footprint) return true;
  for (let i = 0; i < o.footprint.length; i++) {
    const a = o.footprint[i], b = o.footprint[(i+1)%o.footprint.length];
    const nx = a.z-b.z, nz = b.x-a.x, norm = Math.hypot(nx,nz);
    const projections = o.footprint.map(p => p.x*nx+p.z*nz);
    const center = x*nx+z*nz, extent = halfX*Math.abs(nx)+halfZ*Math.abs(nz);
    if (center+extent <= Math.min(...projections)+epsilon*norm || center-extent >= Math.max(...projections)-epsilon*norm) return false;
  }
  return true;
}

/** Clip a ray to the vertical sides of a convex footprint, in either winding. */
export function footprintRayInterval(points: readonly Position2D[], origin: Position2D, direction: Position2D, near = 0, far = Infinity): [number, number] {
  let area = 0;
  for (let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    area += a.x*b.z-b.x*a.z;
  }
  const sign=Math.sign(area);
  for (let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z;
    const offset=sign*(dx*(origin.z-a.z)-dz*(origin.x-a.x));
    const rate=sign*(dx*direction.z-dz*direction.x);
    if (Math.abs(rate)<1e-8) { if (offset<0) return [Infinity,-Infinity]; }
    else if (rate>0) near=Math.max(near,-offset/rate);
    else far=Math.min(far,-offset/rate);
    if (far<near) break;
  }
  return [near,far];
}

export function withinBounds(bounds: RegionBounds, x: number, z: number, radius: number) {
  return x - radius >= bounds.minX && x + radius <= bounds.maxX && z - radius >= bounds.minZ && z + radius <= bounds.maxZ;
}

/** Bounds and obstacles only; walkable ground height stays the engine's concern. */
export function createRegionMovement(bounds: RegionBounds) {
  const canOccupy = (x: number, z: number, radius: number, obstacles: readonly Obstacle[]) => {
    if (!withinBounds(bounds, x, z, radius)) return false;
    // Boxes reject inline: this runs for every obstacle on every step, and the call costs more than the test.
    return !obstacles.some(o => x + radius > o.minX && x - radius < o.maxX && z + radius > o.minZ && z - radius < o.maxZ && (!o.footprint || overlapsObstacle(o, x, z, radius)));
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
