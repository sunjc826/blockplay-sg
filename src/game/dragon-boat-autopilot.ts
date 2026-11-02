import { canPaddle, DRAGON_BOAT_SPAWNS } from './marina-water';
import type { Obstacle } from './region-collision';
import type { VehicleState } from './vehicle-rules';
import type { VehicleControls } from './vehicle-seats';

export const BOAT_AI = { boardRange: 45, waitSeconds: 8, minWait: 3, islandSeconds: 90, retrySeconds: 6, missionSeconds: 180 } as const;
export interface BoatPoint { x: number; z: number }
export interface BoatWaypoint extends BoatPoint { yaw: number; reverse: boolean }
export interface BoatBerth {
  id: string; island: boolean; pose: BoatPoint & { yaw: number }; approach: BoatPoint;
}
export const BOAT_BERTHS: readonly BoatBerth[] = [
  {id:'south-jetty',island:false,pose:DRAGON_BOAT_SPAWNS['dragon-boat-red'],approach:{x:-17,z:12}},
  {id:'north-jetty',island:false,pose:DRAGON_BOAT_SPAWNS['dragon-boat-gold'],approach:{x:17,z:-36}},
  {id:'island-south',island:true,pose:{x:0,z:2,yaw:0},approach:{x:0,z:12}},
  {id:'island-north',island:true,pose:{x:0,z:-26,yaw:Math.PI},approach:{x:0,z:-36}},
  {id:'island-east',island:true,pose:{x:14,z:-12,yaw:Math.PI/2},approach:{x:26,z:-12}},
];
export const BOAT_FOOT_ANCHORS = [{x:-20.5,z:32},{x:-20.5,z:24},{x:20.5,z:-56},{x:20.5,z:-48},{x:0,z:-4},{x:0,z:-20},{x:8,z:-12}];
export interface BoatRoute { berth: BoatBerth; points: BoatWaypoint[] }
const distance=(a:BoatPoint,b:BoatPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

/** Sample the whole oriented hull, including turns. Foot navigation cannot describe water routes. */
export function boatLegClear(a:BoatPoint,b:BoatPoint,yaw:number,obstacles:readonly Obstacle[]=[]){
  const steps=Math.max(1,Math.ceil(distance(a,b)/.75));
  for(let n=0;n<=steps;n++)if(!canPaddle(a.x+(b.x-a.x)*n/steps,a.z+(b.z-a.z)*n/steps,yaw,obstacles))return false;
  return true;
}
function turnClear(p:BoatPoint,from:number,to:number,solids:readonly Obstacle[]){
  const delta=angle(to,from),steps=Math.max(1,Math.ceil(Math.abs(delta)/.07));
  for(let i=0;i<=steps;i++)if(!canPaddle(p.x,p.z,from+delta*i/steps,solids))return false;
  return true;
}

/** Bounded visibility graph: turning basins, an escape from the current berth, and precise final dock legs. */
export function planBoatRoute(v:Pick<VehicleState,'x'|'z'|'yaw'>,berths:readonly BoatBerth[],solids:readonly Obstacle[]=[]):BoatRoute|null{
  const safe=(p:BoatPoint)=>Array.from({length:16},(_,i)=>i*Math.PI/8).every(yaw=>canPaddle(p.x,p.z,yaw,solids));
  const goals=berths.filter(b=>canPaddle(b.pose.x,b.pose.z,b.pose.yaw,solids)&&safe(b.approach)&&boatLegClear(b.approach,b.pose,b.pose.yaw,solids));
  if(!goals.length||!canPaddle(v.x,v.z,v.yaw,solids))return null;
  const nodes:BoatPoint[]=[{x:v.x,z:v.z}];
  for(let x=-38;x<=34;x+=8)for(let z=-44;z<=20;z+=8){const p={x,z};if(safe(p))nodes.push(p);}
  // Near a narrow jetty the long hull must first leave along its current heading.
  for(const step of [-12,-8,8,12]){const p={x:v.x-Math.sin(v.yaw)*step,z:v.z-Math.cos(v.yaw)*step};if(safe(p))nodes.push(p);}
  const terminals=goals.map(berth=>{nodes.push(berth.approach);return{index:nodes.length-1,berth};});
  const costs=new Map<number,number>([[0,0]]),previous=new Map<number,{from:number;yaw:number;reverse:boolean}>(),open=new Set([0]);
  const edges=new Map<string,boolean>();
  while(open.size){
    const current=[...open].sort((a,b)=>costs.get(a)!-costs.get(b)!)[0];open.delete(current);
    for(let next=1;next<nodes.length;next++){
      const length=distance(nodes[current],nodes[next]);if(next===current||length<.01||length>19)continue;
      const heading=Math.atan2(nodes[current].x-nodes[next].x,nodes[current].z-nodes[next].z);
      for(const reverse of current===0?[false,true]:[false]){
        const yaw=heading+(reverse?Math.PI:0);
        if(current===0&&!turnClear(v,v.yaw,yaw,solids))continue;
        const key=[Math.min(current,next),Math.max(current,next)].join(':');
        let clear=edges.get(key);if(clear===undefined){clear=boatLegClear(nodes[current],nodes[next],yaw,solids);edges.set(key,clear);}
        if(!clear)continue;
        const cost=costs.get(current)!+length*(reverse?1.6:1)+.6;
        if(cost<(costs.get(next)??Infinity)){costs.set(next,cost);previous.set(next,{from:current,yaw,reverse});open.add(next);}
      }
    }
  }
  const best=terminals.filter(t=>costs.has(t.index)).sort((a,b)=>costs.get(a.index)!+distance(a.berth.approach,a.berth.pose)-costs.get(b.index)!-distance(b.berth.approach,b.berth.pose))[0];
  if(!best)return null;
  const points:BoatWaypoint[]=[];
  for(let index=best.index;index!==0;){const edge=previous.get(index)!;points.unshift({...nodes[index],yaw:edge.yaw,reverse:edge.reverse});index=edge.from;}
  const b=best.berth,forward={x:-Math.sin(b.pose.yaw),z:-Math.cos(b.pose.yaw)};
  points.push({...b.pose,reverse:(b.pose.x-b.approach.x)*forward.x+(b.pose.z-b.approach.z)*forward.z<0});
  return{berth:b,points};
}

export function boatAutopilot(v:Pick<VehicleState,'x'|'z'|'yaw'|'speed'>,point:BoatWaypoint):{input:VehicleControls;arrived:boolean}{
  const d=distance(v,point),at=d<.45;
  const heading=at?point.yaw:Math.atan2(v.x-point.x,v.z-point.z)+(point.reverse?Math.PI:0),error=angle(heading,v.yaw);
  const turning=Math.abs(error)>.08,braking=turning||d<Math.abs(v.speed)/5+.35||at;
  return{arrived:at&&Math.abs(v.speed)<.08&&Math.abs(angle(point.yaw,v.yaw))<.08,
    input:{forward:braking?0:point.reverse?-1:1,steer:Math.max(-1,Math.min(1,-error*8)),brake:braking,lift:0,boost:false,fire:false}};
}
