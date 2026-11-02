import type { FacilitySite } from './facilities';
import type { Obstacle } from './region-collision';
import type { TraversalObstacle } from './vertical-routes';

export interface CampPoint { x: number; y: number; z: number }
export type CampPropKind = 'canopy' | 'shelter' | 'stores' | 'barricade';
export interface CampProp extends CampPoint { kind: CampPropKind; yaw: number }
export interface CommandCamp { props: CampProp[]; patrol: CampPoint[] }
export const CAMP_PROP_SIZE: Record<CampPropKind, { w: number; d: number; h: number }> = {
  canopy: { w: 5.6, d: 5, h: 3.2 }, shelter: { w: 4.4, d: 3.6, h: 2.8 },
  stores: { w: 2.6, d: 1.8, h: 1.25 }, barricade: { w: 4.2, d: 1, h: 1.1 },
};
const horizontal = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x-b.x,a.z-b.z);
export function campPropBounds(prop: CampProp): Obstacle {
  const size=CAMP_PROP_SIZE[prop.kind], turned=Math.abs(Math.sin(prop.yaw))>.5;
  const w=turned?size.d:size.w,d=turned?size.w:size.d;
  return {minX:prop.x-w/2,maxX:prop.x+w/2,minZ:prop.z-d/2,maxZ:prop.z+d/2,minY:prop.y,maxY:prop.y+size.h,
    supportsTop:prop.kind==='stores'||prop.kind==='barricade'};
}

/** Each component is checked independently; narrow streets keep a smaller camp.
 * Samples cover the whole footprint, including terrain slope and existing props.
 */
export function createCommandCamp(center: CampPoint, clear: (x: number,z: number)=>boolean,
  ground: (x: number,z: number)=>number = ()=>0): CommandCamp {
  const props:CampProp[]=[];
  const fits=(prop:CampProp)=>{
    const b=campPropBounds(prop),nx=Math.ceil((b.maxX-b.minX)/1.2),nz=Math.ceil((b.maxZ-b.minZ)/1.2);
    for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++) {
      const x=b.minX+(b.maxX-b.minX)*ix/nx,z=b.minZ+(b.maxZ-b.minZ)*iz/nz;
      if(!clear(x,z)||Math.abs(ground(x,z)-prop.y)>.3)return false;
    }
    return true;
  };
  const add=(kind:CampPropKind,x:number,z:number,yaw=0)=>{
    const prop={kind,x:center.x+x,z:center.z+z,y:ground(center.x+x,center.z+z),yaw};
    if(fits(prop))props.push(prop);
  };
  add('canopy',0,0);
  // Separated corners leave broad, unfenced approaches to the control table.
  for(const [x,z] of [[-7,-6],[7,6]])add('shelter',x,z);
  for(const [x,z] of [[7,-5],[-7,5]])add('stores',x,z);
  for(const [x,z,yaw] of [[-12,0,Math.PI/2],[12,0,Math.PI/2],[0,-12,0],[0,12,0]])add('barricade',x,z,yaw);
  return {props,patrol:commandPatrolStops(center,clear,ground)};
}
export function commandPatrolStops(center: CampPoint, clear:(x:number,z:number)=>boolean,ground:(x:number,z:number)=>number=()=>0) {
  const patrol:CampPoint[]=[];
  for(let i=0;i<16;i++) {
    const angle=i*Math.PI/8;
    const radius=[24,31,38][i%3];
    for(const r of [radius,24,18,32,40]) {
      const x=center.x+Math.sin(angle)*r,z=center.z+Math.cos(angle)*r;
      if(clear(x,z)) {patrol.push({x,z,y:ground(x,z)});break;}
    }
  }
  return patrol;
}

/** Match the damageable radio/map console and the physical cover footprints. */
export function facilityCoreBounds(site: Pick<FacilitySite,'kind'|'x'|'y'|'z'>): Obstacle {
  const w=site.kind==='command'?1.2:.85,d=site.kind==='command'?.8:.65,h=site.kind==='command'?1.55:1.8;
  return {minX:site.x-w,maxX:site.x+w,minZ:site.z-d,maxZ:site.z+d,minY:site.y,maxY:site.y+h};
}
export function facilityObstacles(site: FacilitySite): Obstacle[] {
  const result=[facilityCoreBounds(site)];
  for(const prop of site.camp?.props??[]) {
    const b=campPropBounds(prop);
    if(prop.kind==='canopy'||prop.kind==='shelter') {
      // Open shelters have four posts and an overhead roof, never a solid box.
      for(const x of [b.minX+.12,b.maxX-.12])for(const z of [b.minZ+.12,b.maxZ-.12])
        result.push({minX:x-.07,maxX:x+.07,minZ:z-.07,maxZ:z+.07,minY:prop.y,maxY:prop.y+2.5});
      result.push({...b,minY:prop.y+2.5});
      if(prop.kind==='shelter')result.push({minX:prop.x-1,maxX:prop.x+1,minZ:prop.z-1.25,maxZ:prop.z-.55,minY:prop.y,maxY:prop.y+.62});
    } else result.push(b);
  }
  return result;
}
export function facilityNavigationAnchors(site: FacilitySite) {
  return [...(site.camp?.patrol??[]),...facilityObstacles(site).flatMap(b=>
    [b.minX-.8,b.maxX+.8].flatMap(x=>[b.minZ-.8,b.maxZ+.8].map(z=>({x,z}))))];
}
/** Overhead panels also enter the vertical kernel's jump/ceiling checks. */
export function facilityCeilings(site: FacilitySite): TraversalObstacle[] {
  return (site.camp?.props??[]).filter(p=>p.kind==='canopy'||p.kind==='shelter').map(p=>
    ({...campPropBounds(p),minY:p.y+2.5,maxY:p.y+CAMP_PROP_SIZE[p.kind].h}));
}

export interface GuardPatrol { site: string; index: number; until: number; slot: number; pauseUntil?: number }
/** Independent patrol legs: spread the initial posts, alternate directions,
 * pause on arrival, and abandon a blocked leg instead of waiting forever.
 */
export function guardPatrolGoal(previous: GuardPatrol | undefined, site: string, points: readonly CampPoint[],
  from: {x:number;z:number}, now: number, slot: number): {state: GuardPatrol; goal: CampPoint} | undefined {
  if(!points.length)return;
  let state=previous?.site===site?previous:undefined;
  if(!state)state={site,index:Math.floor(slot*points.length/4)%points.length,until:now+35,slot};
  if(state.index>=points.length)state.index%=points.length;
  const arrived=horizontal(from,points[state.index])<1.8;
  if(arrived&&state.pauseUntil===undefined)state.pauseUntil=now+2+state.slot*.7;
  if(now>=state.until || state.pauseUntil!==undefined&&now>=state.pauseUntil) {
    const direction=state.slot%2?-1:1;
    state={site,index:(state.index+direction+points.length)%points.length,until:now+35,slot:state.slot};
  }
  return {state,goal:points[state.index]};
}

/** Snapshot layouts are bounded data; older saved games may omit them. */
export function validCommandCamp(value: unknown, center: CampPoint): value is CommandCamp {
  if(!value||typeof value!=='object')return false;
  const c=value as CommandCamp;
  const point=(p:CampPoint)=>!!p&&[p.x,p.y,p.z].every(Number.isFinite)&&horizontal(p,center)<=45&&Math.abs(p.y-center.y)<20;
  return Array.isArray(c.props)&&c.props.length<=9&&c.props.every(p=>point(p)&&typeof p.kind==='string'&&Object.hasOwn(CAMP_PROP_SIZE,p.kind)&&[0,Math.PI/2].includes(p.yaw))&&
    Array.isArray(c.patrol)&&c.patrol.length<=16&&c.patrol.every(point);
}
