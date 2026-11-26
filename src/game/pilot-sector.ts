import type { RegionBounds, Position2D } from './region-collision';
import type { ZoneSector } from './zone-sectors';

export const containsPoint = (b:RegionBounds,p:Position2D) =>
  p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;

/** Work only when a new destination is accepted. Clip to the current arena,
 * then prefer bot navigation anchors and the sector's flood-tested patrol anchors. */
export function sectorTravelPoint(sector:ZoneSector, area:RegionBounds, from:Position2D,
  navigation:readonly Position2D[], walkable:(p:Position2D)=>boolean):Position2D | null {
  const b = {minX:Math.max(sector.bounds.minX,area.minX),maxX:Math.min(sector.bounds.maxX,area.maxX),
    minZ:Math.max(sector.bounds.minZ,area.minZ),maxZ:Math.min(sector.bounds.maxZ,area.maxZ)};
  if (b.minX > b.maxX || b.minZ > b.maxZ) return null;
  const nearest = (a:Position2D,c:Position2D) => Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(c.x-from.x,c.z-from.z);
  for (const anchors of [navigation,sector.anchors]) {
    const point = anchors.filter(p => containsPoint(b,p)).sort(nearest).find(walkable);
    if (point) return point;
  }
  const cx = (b.minX+b.maxX)/2, cz = (b.minZ+b.maxZ)/2;
  // A small arena slice may contain no anchor. Sample the clipped area centre-out.
  for (const radius of [0,.125,.25,.375,.48]) {
    for (let i=0;i<(radius ? 16 : 1);i++) {
      const p = {x:cx+Math.cos(i*Math.PI/8)*(b.maxX-b.minX)*radius,z:cz+Math.sin(i*Math.PI/8)*(b.maxZ-b.minZ)*radius};
      if (walkable(p)) return p;
    }
  }
  return null;
}

type Feet = Position2D & {y:number};
/** Follow normal waypoint steering until cover blocks the walk. Spread the bot
 * graph search over existing pilot decisions, and discard it with the destination. */
export function sectorApproach(target:Position2D, feet:()=>Feet, search:()=>Generator<undefined,Feet[]>) {
  let pending:ReturnType<typeof search> | undefined, route:Feet[] = [];
  return {
    blocked() { pending ??= search(); },
    next():Position2D {
      if (pending) {
        for (let i=0;i<16;i++) {
          const step = pending.next();
          if (step.done) { route = step.value; pending = undefined; break; }
        }
      }
      if (!route.length) return target;
      const p = feet();
      while (route.length && Math.hypot(route[0].x-p.x,route[0].z-p.z) < .7 && Math.abs(route[0].y-p.y) < .6) route.shift();
      return route[0] ?? target;
    },
  };
}

/** Cabinets and cover are solid. Aim at the closest usable footing alongside
 * the remembered object, inside the active arena and at the remembered floor. */
export function placeTravelPoint(place:Position2D & {y?:number},area:RegionBounds,
  support:(p:Position2D,y?:number)=>number|null) {
  if (!containsPoint(area,place)) return null;
  for (const radius of [0,1,1.8,2.6,3.6]) {
    for (let i=0;i<(radius ? 12 : 1);i++) {
      const p = {x:place.x+radius*Math.cos(i*Math.PI/6),z:place.z+radius*Math.sin(i*Math.PI/6)};
      if (!containsPoint(area,p)) continue;
      const y = support(p,place.y);
      if (y !== null && (place.y === undefined || Math.abs(y-place.y)<.6)) return {...p,y};
    }
  }
  return null;
}
