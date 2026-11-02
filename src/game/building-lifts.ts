import type { Object3D } from 'three';
import type { Obstacle } from './region-collision';

export interface BuildingLift { id:string; x:number; z:number; width:number; depth:number; bottom:number; top:number; dwell:number; travel:number; offset:number }
export const getBuildingLifts=(scene:Object3D):readonly BuildingLift[]=>scene.userData.buildingLifts??[];
/** Automatic shuttle: everyone sees the same car, doors and boarding window. */
export function liftSample(lift:BuildingLift,time:number) {
  const cycle=2*(lift.dwell+lift.travel),t=((time+lift.offset)%cycle+cycle)%cycle;
  const rising=t>=lift.dwell&&t<lift.dwell+lift.travel,falling=t>=2*lift.dwell+lift.travel;
  const moving=rising||falling;
  const progress=rising?(t-lift.dwell)/lift.travel:falling?1-(t-2*lift.dwell-lift.travel)/lift.travel:t<lift.dwell?0:1;
  return {y:lift.bottom+(lift.top-lift.bottom)*progress,moving,open:!moving,up:rising,remaining:moving?(rising?lift.dwell+lift.travel-t:cycle-t):t<lift.dwell?lift.dwell-t:2*lift.dwell+lift.travel-t};
}
export function insideLift(lift:BuildingLift,p:{x:number;z:number},margin=.2) {
  return Math.abs(p.x-lift.x)<=lift.width/2-margin&&Math.abs(p.z-lift.z)<=lift.depth/2-margin;
}
export function liftPassenger(lifts:readonly BuildingLift[],p:{x:number;y:number;z:number},time:number) {
  return lifts.find(l=>insideLift(l,p)&&p.y-liftSample(l,time).y>=-.15&&p.y-liftSample(l,time).y<=1.15);
}
/** Gates protect the shaft at both stops; car side/back walls are authored. */
export function liftGates(lifts:readonly BuildingLift[],time:number):Obstacle[] {
  return lifts.flatMap(l=>[l.bottom,l.top].filter(y=>{const s=liftSample(l,time);return !s.open||Math.abs(s.y-y)>.1;}).map(y=>({minX:l.x-l.width/2-.1,maxX:l.x+l.width/2+.1,minZ:l.z-l.depth/2-.08,maxZ:l.z-l.depth/2+.08,minY:y,maxY:y+2.6})));
}

/** Public signals describe the car, never its occupants. */
export function liftLandingStatus(lift:BuildingLift,time:number,landing:number) {
  const s=liftSample(lift,time),at=Math.abs(s.y-landing)<.1;
  const approaching=s.moving && (s.up ? landing===lift.top : landing===lift.bottom);
  const arriving=approaching && s.remaining<=3;
  return {open:s.open&&at,arriving,
    label:s.open&&at?`OPEN · DEPARTS ${Math.ceil(s.remaining)}s`:arriving?`ARRIVING · ${Math.ceil(s.remaining)}s`:s.moving?`${s.up?'↑ ASCENDING':'↓ DESCENDING'}`:`AT ${s.y===lift.bottom?'LOBBY':'SKYPARK'}`};
}

/** Moving physical floor, ceiling and front gate. Shaft side/back guards are static.
 * The support slab extends under the whole capsule, including door thresholds. */
export function liftBodies(lifts:readonly BuildingLift[],time:number):Obstacle[] {
  return [...liftGates(lifts,time),...lifts.flatMap(l=>{
    const s=liftSample(l,time),minX=l.x-l.width/2+.06,maxX=l.x+l.width/2-.06,minZ=l.z-l.depth/2+.06,maxZ=l.z+l.depth/2-.06;
    const parts:Obstacle[]=[{minX,maxX,minZ,maxZ,minY:s.y-.24,maxY:s.y,supportsTop:true},
      {minX,maxX,minZ,maxZ,minY:s.y+2.73,maxY:s.y+2.87}];
    for(const side of [-1,1]){
      const x=l.x+side*(l.width/2-.16);
      parts.push({minX:x-.04,maxX:x+.04,minZ:l.z-l.depth/2+.15,maxZ:l.z+l.depth/2-.15,minY:s.y,maxY:s.y+2.73});
      const cx=l.x+side*l.width*.375;
      parts.push({minX:cx-l.width/8,maxX:cx+l.width/8,minZ:l.z-l.depth/2-.08,maxZ:l.z-l.depth/2+.14,minY:s.y,maxY:s.y+2.73});
    }
    parts.push({minX,maxX,minZ:l.z+l.depth/2-.22,maxZ:l.z+l.depth/2-.14,minY:s.y,maxY:s.y+2.73});
    if(s.moving)parts.push({minX:l.x-l.width/2,maxX:l.x+l.width/2,minZ:l.z-l.depth/2-.08,maxZ:l.z-l.depth/2+.12,minY:s.y,maxY:s.y+2.73});
    return parts;
  })];
}

/** Resolve the doorway before its collision closes. A body already inside rides;
 * one still outside stays on its landing. Never leave a capsule intersecting the gate. */
export function liftDeparture(lift:BuildingLift,from:number,time:number,p:{x:number;y:number;z:number}) {
  const before=liftSample(lift,from),after=liftSample(lift,time),front=lift.z-lift.depth/2;
  if(!before.open||!after.moving||(p.y-before.y<-.15||p.y-before.y>1.15)||Math.abs(p.x-lift.x)>lift.width/4+.4||Math.abs(p.z-front)>.5)return null;
  return {x:p.x,z:p.z>=front?front+.56:front-.56,board:p.z>=front};
}
