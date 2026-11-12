import { tdmArea, type HardpointAreaId, type ArenaTeam, type TeamDeathmatchArea } from './arena-match';
import type { StructureLayout } from './structure-types';

export const HARDPOINT_RULES = { scoreLimit:200, duration:360, rotationSeconds:60, previewSeconds:10, spawnClearance:10 } as const;
export interface ControlSite { id:string; name:string; x:number; y:number; z:number; radius:number }
export const SMITH_CONTROL_SITES: readonly ControlSite[] = [
  {id:'market',name:'Market crossing',x:-20,y:0,z:80,radius:4},
  {id:'east',name:'Eastern opening',x:31,y:0,z:56,radius:4},
  {id:'south',name:'Southern passage',x:-25,y:0,z:117,radius:4},
];
export const HARDPOINT_AREA: TeamDeathmatchArea = {...tdmArea('smith-street')!,bounds:{...tdmArea('smith-street')!.bounds,maxZ:124}};
export const HARDPOINT_LAYOUT: StructureLayout = {id:'hardpoint:smith-street',structures:SMITH_CONTROL_SITES.map((site,i)=>({
  id:`control-${site.id}`,name:`${site.name} control station`,x:site.x+(i===1?5:-5),y:site.y,z:site.z,
  core:{model:'signal-beacon',cover:'scene'},
  props:[{kind:'barricade',x:site.x,y:site.y,z:site.z+(i===0?5.8:i===1?6:5),yaw:0}],
  navigationAnchors:[{...site},{x:site.x-2,y:site.y,z:site.z},{x:site.x+2,y:site.y,z:site.z}],
}))};
export interface HardpointArena { area:TeamDeathmatchArea; sites:readonly ControlSite[]; layout:StructureLayout }
const sites = (entries:readonly [string,string,number,number,number?][]):ControlSite[] => entries.map(([id,name,x,z,y=0])=>({id,name,x,z,y,radius:4}));
function arena(id:HardpointAreaId, controlSites:readonly ControlSite[]):HardpointArena {
  return {area:tdmArea(id)!,sites:controlSites,layout:{id:`hardpoint:${id}`,structures:controlSites.map(site=>({
    id:`control-${site.id}`,name:`${site.name} control station`,x:site.x,y:site.y,z:site.z-5.5,
    core:{model:'signal-beacon',cover:'scene'},
    navigationAnchors:[{...site},{x:site.x-6,y:site.y,z:site.z},{x:site.x+6,y:site.y,z:site.z}],
  }))}};
}
export const HARDPOINT_ARENAS:readonly HardpointArena[] = [
  {area:HARDPOINT_AREA,sites:SMITH_CONTROL_SITES,layout:HARDPOINT_LAYOUT},
  arena('container-yard',sites([['gantry','Gantry crossing',131,-40],['loading','North loading apron',114,-75],['dispatch','South dispatch apron',148,-14]])),
  arena('woodlands-park',sites([['lawn','Central lawn',137,88],['grove','West grove',108,114],['path','East path',166,60]])),
  arena('bishan-court',sites([['shelter','Shade court',-60,-140],['north','North court approach',-60,-174],['garden','Garden flank',-36,-114]])),
  arena('tampines-hub',sites([['centre','Centre court',55,-40,.7],['concourse','North concourse',55,-70,.18],['arrival','South arrival',55,-10,.18]])),
];
export const hardpointArena = (id:string) => HARDPOINT_ARENAS.find(config=>config.area.id===id);

export interface ControlActor { x:number;y:number;z:number;alive:boolean;team?:ArenaTeam;vehicle?:unknown;transport?:unknown }
export interface HardpointSnapshot {
  area:HardpointAreaId; active:string; next:string|null; remaining:number;
  owner:ArenaTeam|null; contested:boolean; occupants:Record<ArenaTeam,number>; scores:Record<ArenaTeam,number>;
}
export function controlAt(elapsed:number,sites:readonly ControlSite[]=SMITH_CONTROL_SITES) {
  elapsed=Math.min(Math.max(0,Math.round(elapsed*1e6)/1e6),HARDPOINT_RULES.duration-1e-8);
  const index=Math.floor(Math.max(0,elapsed)/HARDPOINT_RULES.rotationSeconds)%sites.length;
  return {site:sites[index],next:sites[(index+1)%sites.length],remaining:HARDPOINT_RULES.rotationSeconds-Math.max(0,elapsed)%HARDPOINT_RULES.rotationSeconds};
}
/** Eye height gate excludes rooftops; crouching/prone infantry still count. */
export function inControlSite(actor:ControlActor,site:ControlSite) {
  return actor.alive && !actor.vehicle && !actor.transport && actor.y>=site.y+.2 && actor.y<=site.y+2.5 && Math.hypot(actor.x-site.x,actor.z-site.z)<=site.radius;
}
export function controlOccupancy(site:ControlSite,actors:readonly ControlActor[]) {
  const occupants={alpha:0,bravo:0};
  for(const a of actors)if(a.team&&inControlSite(a,site))occupants[a.team]++;
  const contested=occupants.alpha>0&&occupants.bravo>0;
  const owner:ArenaTeam|null=contested?null:occupants.alpha?'alpha':occupants.bravo?'bravo':null;
  return {occupants,contested,owner};
}
/** Authority accumulates uncontested occupation time, never kills or head count. */
export function createHardpoint(sites:readonly ControlSite[]=SMITH_CONTROL_SITES,area:HardpointAreaId='smith-street') {
  const held={alpha:0,bravo:0};
  const scores=()=>({alpha:Math.min(HARDPOINT_RULES.scoreLimit,Math.floor(held.alpha+1e-7)),bravo:Math.min(HARDPOINT_RULES.scoreLimit,Math.floor(held.bravo+1e-7))});
  return {
    step(from:number,to:number,actors:readonly ControlActor[],onHold?:(actor:ControlActor,seconds:number)=>void) {
      if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)return;
      let cursor=Math.max(0,from),end=Math.min(to,HARDPOINT_RULES.duration);
      while(cursor<end-1e-8 && held.alpha<HARDPOINT_RULES.scoreLimit && held.bravo<HARDPOINT_RULES.scoreLimit) {
        const {site,remaining}=controlAt(cursor,sites),seconds=Math.min(end-cursor,remaining);
        const {owner}=controlOccupancy(site,actors);
        if(owner){const earned=Math.min(seconds,HARDPOINT_RULES.scoreLimit-held[owner]);held[owner]+=earned;for(const actor of actors)if(actor.team===owner&&inControlSite(actor,site))onHold?.(actor,earned);}
        cursor+=seconds;
      }
    },
    snapshot(elapsed:number,actors:readonly ControlActor[]):HardpointSnapshot {
      const {site,next,remaining}=controlAt(elapsed,sites);
      return {area,active:site.id,next:remaining<=HARDPOINT_RULES.previewSeconds&&elapsed<HARDPOINT_RULES.duration?next.id:null,remaining:Math.round(remaining*100)/100,...controlOccupancy(site,actors),scores:scores()};
    },
    scores,
    reset(){held.alpha=held.bravo=0;},
  };
}
export function controlGoal(site:ControlSite,slot:number) {
  return {x:site.x+(slot%2?1.8:-1.8),y:site.y+1.75,z:site.z+(slot%4<2?-1.8:1.8)};
}

export function validHardpointSnapshot(value:unknown,elapsed:number,actors:readonly ControlActor[],sites:readonly ControlSite[]=SMITH_CONTROL_SITES,area:HardpointAreaId='smith-street'):value is HardpointSnapshot {
  if(!value||typeof value!=='object')return false;
  const s=value as HardpointSnapshot,{site,next,remaining}=controlAt(elapsed,sites),occupancy=controlOccupancy(site,actors);
  return s.area===area && s.active===site.id && s.next===(remaining<=HARDPOINT_RULES.previewSeconds&&elapsed<HARDPOINT_RULES.duration?next.id:null) && s.remaining===Math.round(remaining*100)/100 && s.owner===occupancy.owner && s.contested===occupancy.contested &&
    !!s.occupants && s.occupants.alpha===occupancy.occupants.alpha && s.occupants.bravo===occupancy.occupants.bravo &&
    !!s.scores && [s.scores.alpha,s.scores.bravo].every(n=>Number.isInteger(n)&&n>=0&&n<=HARDPOINT_RULES.scoreLimit);
}
