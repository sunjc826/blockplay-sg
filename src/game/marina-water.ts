import { marinaBounds } from './marina-layout';
import { type Obstacle } from './region-collision';

/** Gameplay metres, shared by rendering, authority and boat movement. */
export const MARINA_WATER = { ...marinaBounds({ minX: -80, maxX: 80, minZ: -90, maxZ: 50 }), surface: -.24, bed: -1.8 };
export const DRAGON_BOATS = ['dragon-boat-red', 'dragon-boat-gold'] as const;
export type DragonBoatKind = typeof DRAGON_BOATS[number];
export const isDragonBoat = (kind: string): kind is DragonBoatKind => (DRAGON_BOATS as readonly string[]).includes(kind);
export const DRAGON_BOAT_SPAWNS = {
  'dragon-boat-red': { x: -17, z: 24, yaw: 0 },
  'dragon-boat-gold': { x: 17, z: -48, yaw: Math.PI },
};
const corner=6*(Math.SQRT2-1);
export const MARINA_ISLET = { x:0,z:-12,radius:6, footprint:[
  {x:-corner,z:-18},{x:corner,z:-18},{x:6,z:-12-corner},{x:6,z:-12+corner},
  {x:corner,z:-6},{x:-corner,z:-6},{x:-6,z:-12+corner},{x:-6,z:-12-corner},
] };
export const MARINA_CAMP_DECKS: readonly (Obstacle & {id:string})[] = [
  { id:'camp',minX:-6,maxX:6,minZ:-18,maxZ:-6,footprint:MARINA_ISLET.footprint },
  { id:'south-landing',minX:-2.4,maxX:2.4,minZ:-6,maxZ:-3 },
  { id:'north-landing',minX:-2.4,maxX:2.4,minZ:-21,maxZ:-18 },
  { id:'east-landing',minX:6,maxX:9,minZ:-14.4,maxZ:-9.6 },
  { id:'south-jetty',minX:-22,maxX:-19,minZ:18,maxZ:31 },
  { id:'north-jetty',minX:19,maxX:22,minZ:-55,maxZ:-42 },
];
export const MARINA_CAMP_COVER = [
  {minX:-1.8,maxX:1.8,minZ:-13.8,maxZ:-10.2,maxY:4.5},
  {minX:-4.6,maxX:-3.3,minZ:-15.2,maxZ:-14.5,maxY:.9},
  {minX:3.3,maxX:4.6,minZ:-9.5,maxZ:-8.8,maxY:.9},
];
export const MARINA_SWIM_EXITS = [
  {x:0,z:-3.6,dx:0,dz:1},{x:0,z:-20.4,dx:0,dz:-1},{x:8.4,z:-12,dx:1,dz:0},
  {x:-21.4,z:24,dx:-1,dz:0},{x:21.4,z:-48,dx:1,dz:0},
];
const overlaps = (a: Obstacle, b: Obstacle) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
/** Remove walkable deck rectangles from the water blocker, preserving every remaining patch. */
export function marinaWaterObstacles(): Obstacle[] {
  let pieces: Obstacle[] = [{ ...MARINA_WATER, maxY: 2, water: true }];
  for (const cut of MARINA_CAMP_DECKS) pieces = pieces.flatMap(p => {
    if (!overlaps(p, cut)) return [p];
    const x0 = Math.max(p.minX, cut.minX), x1 = Math.min(p.maxX, cut.maxX), z0 = Math.max(p.minZ, cut.minZ), z1 = Math.min(p.maxZ, cut.maxZ);
    return [ { ...p, maxX: x0 }, { ...p, minX: x1 }, { ...p, minX: x0, maxX: x1, maxZ: z0 }, { ...p, minX: x0, maxX: x1, minZ: z1 } ].filter(r => r.maxX > r.minX && r.maxZ > r.minZ);
  });
  // The four clipped corners remain water, matching the octagonal decking.
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*6,z=-12+sz*6;
    const footprint=[{x,z},{x:sx*corner,z},{x,z:-12+sz*corner}];
    pieces.push({minX:Math.min(...footprint.map(p=>p.x)),maxX:Math.max(...footprint.map(p=>p.x)),minZ:Math.min(...footprint.map(p=>p.z)),maxZ:Math.max(...footprint.map(p=>p.z)),maxY:2,water:true,footprint});
  }
  return pieces;
}
/** Exact oriented hull corners, rather than an overlarge box at diagonal headings. */
export function canPaddle(x: number, z: number, yaw: number, otherHulls: readonly Obstacle[] = []) {
  const c = Math.cos(yaw), s = Math.sin(yaw), corners = [-1, 1].flatMap(side => [-1, 1].map(end => ({ x: x + c * side * .95 + s * end * 4.5, z: z - s * side * .95 + c * end * 4.5 })));
  if (corners.some(p => p.x < MARINA_WATER.minX + .3 || p.x > MARINA_WATER.maxX - .3 || p.z < MARINA_WATER.minZ + .3 || p.z > MARINA_WATER.maxZ - .3)) return false;
  // Separating axes for a rotated boat against each axis-aligned deck/hull.
  return ![...MARINA_CAMP_DECKS, ...otherHulls].some(o => {
    if(o.footprint){
      const points=o.footprint,axes=[{x:c,z:-s},{x:s,z:c},...points.map((p,i)=>({x:p.z-points[(i+1)%points.length].z,z:points[(i+1)%points.length].x-p.x}))];
      return axes.every(axis=>{const hull=corners.map(p=>p.x*axis.x+p.z*axis.z),deck=points.map(p=>p.x*axis.x+p.z*axis.z);return Math.min(...hull)<Math.max(...deck)&&Math.max(...hull)>Math.min(...deck);});
    }
    const dx = (o.minX + o.maxX) / 2 - x, dz = (o.minZ + o.maxZ) / 2 - z, hx = (o.maxX - o.minX) / 2, hz = (o.maxZ - o.minZ) / 2;
    return Math.abs(dx) < Math.abs(c) * .95 + Math.abs(s) * 4.5 + hx && Math.abs(dz) < Math.abs(s) * .95 + Math.abs(c) * 4.5 + hz &&
      Math.abs(c * dx - s * dz) < .95 + Math.abs(c) * hx + Math.abs(s) * hz && Math.abs(s * dx + c * dz) < 4.5 + Math.abs(s) * hx + Math.abs(c) * hz;
  });
}
