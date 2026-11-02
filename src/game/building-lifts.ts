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
export function insideLift(lift:BuildingLift,p:{x:number;z:number},margin=.45) {
  return Math.abs(p.x-lift.x)<=lift.width/2-margin&&Math.abs(p.z-lift.z)<=lift.depth/2-margin;
}
export function liftPassenger(lifts:readonly BuildingLift[],p:{x:number;y:number;z:number},time:number) {
  return lifts.find(l=>insideLift(l,p)&&Math.abs(p.y-liftSample(l,time).y)<.18);
}
/** Gates protect the shaft at both stops; car side/back walls are authored. */
export function liftGates(lifts:readonly BuildingLift[],time:number):Obstacle[] {
  return lifts.flatMap(l=>[l.bottom,l.top].filter(y=>{const s=liftSample(l,time);return !s.open||Math.abs(s.y-y)>.1;}).map(y=>({minX:l.x-l.width/2-.1,maxX:l.x+l.width/2+.1,minZ:l.z-l.depth/2-.16,maxZ:l.z-l.depth/2+.16,minY:y,maxY:y+2.6})));
}
