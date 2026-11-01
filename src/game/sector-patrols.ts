import type { SquadFaction } from './arena-factions';
import type { BattlefieldSquad } from './battlefield';
import type { FacilityState } from './facilities';
import type { RegionBounds } from './region-collision';

export interface PatrolPoint { x:number; z:number }
export interface PatrolSector { id:string; name:string; bounds:RegionBounds; anchors:readonly PatrolPoint[]; parent?:string }
export type BattlefieldDuty = 'attack'|'sentry'|'patrol'|'respond'|'investigate';
export interface SectorDuty { kind:'camp-defense'|'sector-patrol'; sector:string; homeCamp?:string }
interface PatrolSquad extends BattlefieldSquad { available?:boolean }
interface PatrolMember extends PatrolPoint { id:string; faction:SquadFaction; sector:string; y?:number }
interface PatrolNode extends PatrolPoint { last:Partial<Record<SquadFaction,number>> }
interface PatrolLeg { sector:string; faction:SquadFaction; node:number; until:number; pauseUntil?:number; previous?:number }
interface SectorPlan extends PatrolSector { nodes:PatrolNode[] }
export const SECTOR_PATROL = { visitRadius:12, freshSeconds:90, assignmentSeconds:180, pursuitMargin:12, investigateSeconds:10, investigateCooldown:15, respondRadius:110 } as const;
const distance=(a:PatrolPoint,b:PatrolPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const within=(p:PatrolPoint,b:RegionBounds,margin=0)=>p.x>=b.minX-margin&&p.x<=b.maxX+margin&&p.z>=b.minZ-margin&&p.z<=b.maxZ+margin;

/** Sector coverage is independent of camp footprints and facility ownership.
 * The authority records physical visits, leases different stops to patrols,
 * and backs off unreachable legs without pretending they were visited.
 */
export function createSectorPatrols(sectors:readonly PatrolSector[], anchors:readonly PatrolPoint[], clear:(p:PatrolPoint)=>boolean,
 ground:(x:number,z:number)=>number=()=>0) {
  const areas:SectorPlan[]=sectors.map(sector=>{
    const candidates=[...sector.anchors,...anchors.filter(p=>within(p,sector.bounds))].filter(p=>within(p,sector.bounds)&&clear(p));
    const selected:PatrolPoint[]=[];
    // Farthest-point sampling keeps broad sectors broad without an unbounded graph.
    if(candidates.length)selected.push(candidates[0]);
    while(selected.length<24) {
      const next=candidates.map(p=>({p,gap:Math.min(...selected.map(q=>distance(p,q)))})).sort((a,b)=>b.gap-a.gap)[0];
      if(!next||next.gap<18)break;
      selected.push(next.p);
    }
    return {...sector,nodes:selected.map(p=>({...p,last:{}}))};
  }).filter(s=>s.nodes.length>=2);
  const byId=new Map(areas.map(s=>[s.id,s]));
  const duties=new Map<string,SectorDuty&{since:number}>(),legs=new Map<string,PatrolLeg>();
  const blocked=new Map<string,number>();
  const nearest=(point:PatrolPoint)=>[...areas].sort((a,b)=>
    (within(point,a.bounds)?0:Math.min(...a.nodes.map(p=>distance(point,p))))-
    (within(point,b.bounds)?0:Math.min(...b.nodes.map(p=>distance(point,p)))) ||
    (a.bounds.maxX-a.bounds.minX)*(a.bounds.maxZ-a.bounds.minZ)-(b.bounds.maxX-b.bounds.minX)*(b.bounds.maxZ-b.bounds.minZ))[0];
  const freshness=(area:SectorPlan,faction:SquadFaction,now:number)=>area.nodes.filter(n=>now-(n.last[faction]??-Infinity)<SECTOR_PATROL.freshSeconds).length/area.nodes.length;
  function allocate(squads:readonly PatrolSquad[],sites:readonly FacilityState[],now:number) {
    const result=new Map<string,SectorDuty>();
    for(const faction of ['mercenaries','armed-forces'] as const) {
      const groups=squads.filter(s=>s.faction===faction).sort((a,b)=>a.id.localeCompare(b.id));
      const available=groups.filter(s=>s.available!==false),total=groups.reduce((n,s)=>n+(s.members??4),0);
      const fronts=sites.some(s=>s.owner!==faction),focused=sites.some(s=>s.combatFocus);
      const budget=fronts?Math.floor(total * (focused ? .2 : .5)):total;
      const home=sites.find(s=>s.kind==='command'&&s.owner===faction&&s.initialOwner===faction&&s.health>0)??sites.find(s=>s.kind==='command'&&s.owner===faction&&s.health>0);
      const eligible=available.filter(s=>(s.members??4)<=budget);
      const guard=home&&groups.length>=3?eligible.find(s=>duties.get(s.id)?.kind==='camp-defense'&&duties.get(s.id)?.homeCamp===home.id)??[...eligible].sort((a,b)=>distance(a,home)-distance(b,home))[0]:undefined;
      const loads=new Map<string,number>();let assigned=0;
      if(guard&&home) {
        const sector=nearest(home);
        if(sector){result.set(guard.id,{kind:'camp-defense',sector:sector.id,homeCamp:home.id});assigned+=guard.members??4;loads.set(sector.id,1);}
      }
      const target=fronts?(focused?1:Math.floor(groups.length*.4)):groups.length;
      const candidates=available.filter(s=>s!==guard).sort((a,b)=>Number(duties.has(b.id))-Number(duties.has(a.id))||a.id.localeCompare(b.id));
      for(const group of candidates) {
        if(fronts&&(groups.length<3||resultForFaction()>=target||assigned+(group.members??4)>budget))continue;
        const previous=duties.get(group.id);
        const score=(area:SectorPlan)=>{
          const enemy=sites.some(s=>s.owner&&s.owner!==faction&&s.health>0&&within(s,area.bounds));
          const current=previous?.sector===area.id;
          return Math.min(...area.nodes.map(p=>distance(group,p)))*.15+freshness(area,faction,now)*80+
            (loads.get(area.id)??0)*180+(enemy?50:0)-(current&&now-previous.since<SECTOR_PATROL.assignmentSeconds?150:0);
        };
        const sector=[...areas].sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id))[0];
        if(!sector)continue;
        const homeCamp=home?.id;
        result.set(group.id,{kind:'sector-patrol',sector:sector.id,...(homeCamp?{homeCamp}:{})});
        assigned+=group.members??4;loads.set(sector.id,(loads.get(sector.id)??0)+1);
      }
      function resultForFaction(){return groups.filter(s=>result.has(s.id)).length;}
    }
    for(const id of duties.keys())if(!result.has(id))duties.delete(id);
    for(const [id,duty] of result){const old=duties.get(id);duties.set(id,{...duty,since:old?.sector===duty.sector&&old.kind===duty.kind?old.since:now});}
    return result;
  }
  function observe(actors:readonly (PatrolPoint&{faction:string;y?:number})[],now:number) {
    for(const area of areas)for(const node of area.nodes)for(const actor of actors) {
      if((actor.faction==='mercenaries'||actor.faction==='armed-forces')&&distance(actor,node)<=SECTOR_PATROL.visitRadius&&
        (actor.y===undefined||Math.abs(actor.y-1.75-ground(node.x,node.z))<1.5))node.last[actor.faction]=now;
    }
    for(const [key,until] of blocked)if(until<=now)blocked.delete(key);
  }
  function sync(ids:ReadonlySet<string>){for(const id of legs.keys())if(!ids.has(id))legs.delete(id);}
  function goal(member:PatrolMember,now:number) {
    const area=byId.get(member.sector);if(!area)return;
    let leg=legs.get(member.id);
    if(leg?.sector!==area.id){legs.delete(member.id);leg=undefined;}
    if(leg) {
      const arrived=distance(member,area.nodes[leg.node])<3;
      if(arrived&&leg.pauseUntil===undefined)leg.pauseUntil=now+2+(leg.node%3);
      if(now<leg.until&&(leg.pauseUntil===undefined||now<leg.pauseUntil))return area.nodes[leg.node];
      if(!arrived&&leg.pauseUntil===undefined)blocked.set(`${member.id}/${area.id}/${leg.node}`,now+60);
    }
    const previous=leg?.node;
    const score=(node:PatrolNode,index:number)=>{
      const age=Math.min(180,now-(node.last[member.faction]??-90));
      const claims=[...legs].filter(([id,l])=>id!==member.id&&l.faction===member.faction&&l.sector===area.id&&l.until>now&&distance(node,area.nodes[l.node])<26).length;
      return distance(member,node)*.32-age+claims*220+(index===previous?120:0);
    };
    const next=area.nodes.map((p,index)=>({p,index})).filter(n=>(blocked.get(`${member.id}/${area.id}/${n.index}`)??0)<=now&&clear(n.p))
      .sort((a,b)=>score(a.p,a.index)-score(b.p,b.index)||a.index-b.index)[0];
    if(!next){legs.delete(member.id);return;}
    legs.set(member.id,{sector:area.id,faction:member.faction,node:next.index,until:now+Math.min(150,Math.max(30,distance(member,next.p)/3*2+15)),previous});
    return next.p;
  }
  return {areas,allocate,observe,sync,goal,
    contains:(sector:string,p:PatrolPoint,margin=0)=>{const area=byId.get(sector);return !!area&&within(p,area.bounds,margin);},
    release:(id:string)=>legs.delete(id),
    status:(now:number)=>areas.map(area=>({sector:area.id,name:area.name,bounds:area.bounds,points:area.nodes.map(n=>({x:n.x,z:n.z,last:{...n.last}})),
      factions:Object.fromEntries((['mercenaries','armed-forces'] as const).map(f=>[f,{visited:area.nodes.filter(n=>n.last[f]!==undefined).length,
        fresh:area.nodes.filter(n=>now-(n.last[f]??-Infinity)<SECTOR_PATROL.freshSeconds).length,
        unvisited:area.nodes.filter(n=>n.last[f]===undefined).length,oldestVisitAge:Math.max(...area.nodes.map(n=>now-(n.last[f]??0))),total:area.nodes.length}]))})),
    reset:()=>{duties.clear();legs.clear();blocked.clear();for(const area of areas)for(const node of area.nodes)node.last={};},
  };
}

export interface PatrolInvestigation { point:PatrolPoint; until:number; resumeAfter:number }
/** Sightings can interrupt coverage briefly, never renew pursuit indefinitely. */
export function advancePatrolInvestigation(previous:PatrolInvestigation|undefined, clue:PatrolPoint|undefined,
 from:PatrolPoint,now:number,allowed:(p:PatrolPoint)=>boolean):PatrolInvestigation|undefined {
  if(previous&&now>=previous.until) {
    if(now<previous.resumeAfter)return previous;
    previous=undefined;
  }
  if(previous)return {...previous,point:clue&&allowed(clue)&&distance(from,clue)<65?{...clue}:previous.point};
  if(!clue||!allowed(clue)||distance(from,clue)>=65)return;
  return {point:{...clue},until:now+SECTOR_PATROL.investigateSeconds,resumeAfter:now+SECTOR_PATROL.investigateSeconds+SECTOR_PATROL.investigateCooldown};
}
