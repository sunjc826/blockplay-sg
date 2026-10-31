import { expect,it } from 'vitest';
import { advancePatrolInvestigation, createSectorPatrols, type PatrolSector } from './sector-patrols';
import { createFacilities, type FacilitySite } from './facilities';
import { assignBattlefieldFronts } from './battlefield';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import * as THREE from 'three';
import { createCommandCamp, facilityCeilings, facilityNavigationAnchors, facilityObstacles } from './command-camp';
import { createFacilityVisuals } from './facility-visuals';
import { createSceneCover } from './scene-cover';

const sectors:PatrolSector[]=[
 {id:'west',name:'West streets',bounds:{minX:-220,maxX:-10,minZ:-100,maxZ:100},anchors:[{x:-190,z:-60},{x:-90,z:-60},{x:-30,z:0},{x:-90,z:60},{x:-190,z:60}]},
 {id:'east',name:'East streets',bounds:{minX:10,maxX:220,minZ:-100,maxZ:100},anchors:[{x:30,z:0},{x:90,z:60},{x:190,z:60},{x:190,z:-60},{x:90,z:-60}]},
 {id:'north',name:'North gardens',bounds:{minX:-200,maxX:200,minZ:110,maxZ:200},anchors:[{x:-150,z:150},{x:0,z:150},{x:150,z:150}]},
];
const sites:FacilitySite[]=[
 {id:'home',name:'Home',kind:'command',x:-160,y:0,z:0,initialOwner:'mercenaries',deployment:{x:-160,z:0,yaw:0}},
 {id:'enemy',name:'Enemy',kind:'command',x:160,y:0,z:0,initialOwner:'armed-forces',deployment:{x:160,z:0,yaw:0}},
 {id:'front',name:'Front',kind:'supply',x:0,y:0,z:150,initialOwner:null,initiallyBuilt:true,deployment:{x:0,z:150,yaw:0}},
];
const members=(sizes=[4,4,4,4,4])=>sizes.map((count,i)=>({id:`squad-${i}`,faction:'mercenaries' as const,x:-160,z:0,members:count}));

it('builds bounded coverage points across a named sector independently of any camp',()=>{
 const patrol=createSectorPatrols(sectors,[{x:500,z:0},{x:-60,z:0}],p=>p.x!==-90);
 expect(patrol.areas).toHaveLength(3);
 expect(patrol.areas[0].nodes.some(p=>p.x===-60)).toBe(true);
 expect(patrol.areas[0].nodes.some(p=>p.x===-90)).toBe(false);
 expect(patrol.contains('west',{x:-200,z:0})).toBe(true);
 expect(patrol.contains('west',{x:0,z:0})).toBe(false);
 expect(patrol.contains('west',{x:0,z:0},12)).toBe(true);
 expect(createSectorPatrols(sectors,[],()=>false).areas).toEqual([]);
});

it('allocates camp defense and independent sector patrols while preserving at least half on offense',()=>{
 const patrol=createSectorPatrols(sectors,[],()=>true),state=createFacilities(sites),squads=members();
 const duties=patrol.allocate(squads,state.sites,0);
 expect([...duties.values()].filter(d=>d.kind==='camp-defense')).toHaveLength(1);
 expect([...duties.values()].filter(d=>d.kind==='sector-patrol')).toHaveLength(1);
 expect(new Set([...duties.values()].map(d=>d.sector)).size).toBe(2);
 const attack=assignBattlefieldFronts(squads.filter(s=>!duties.has(s.id)),state.sites,{rearGuard:false});
 expect(attack.size).toBe(3);expect([...attack.values()].every(id=>id!=='home')).toBe(true);
 expect([...patrol.allocate(squads,state.sites,2)]).toEqual([...duties]);
 for(const sizes of [[4,1,1],[1,4,4,2,1],[4,4],[4]]) {
  const roster=members(sizes),assigned=patrol.allocate(roster,state.sites,4);
  expect(roster.filter(s=>!assigned.has(s.id)).reduce((n,s)=>n+s.members,0)).toBeGreaterThanOrEqual(roster.reduce((n,s)=>n+s.members,0)/2);
 }
});

it('supports sectors without camps, shifts patrols as coverage changes, and respects unavailable squads',()=>{
 const patrol=createSectorPatrols(sectors,[],()=>true),squads=members();
 const assignments=patrol.allocate(squads,[],0);
 expect(assignments.size).toBe(5);
 expect([...assignments.values()].every(d=>d.kind==='sector-patrol'&&!d.homeCamp)).toBe(true);
 expect(new Set([...assignments.values()].map(d=>d.sector)).size).toBe(3);
 const restricted=patrol.allocate(squads.map(s=>({...s,available:s.id!=='squad-0'})),createFacilities(sites).sites,2);
 expect(restricted.has('squad-0')).toBe(false);
});

it('counts physical same-level visits, ages coverage, and never counts planned or blocked legs',()=>{
 const patrol=createSectorPatrols([sectors[0]],[],()=>true),member={id:'p',faction:'mercenaries' as const,sector:'west',x:-160,z:0};
 const goal=patrol.goal(member,0)!;
 expect(patrol.status(0)[0].factions.mercenaries.visited).toBe(0);
 patrol.goal(member,151);
 expect(patrol.status(151)[0].factions.mercenaries.visited).toBe(0);
 patrol.observe([{...goal,faction:'mercenaries',y:8}],152);
 expect(patrol.status(152)[0].factions.mercenaries.visited).toBe(0);
 patrol.observe([{...goal,faction:'mercenaries',y:1.75}],153);
 expect(patrol.status(153)[0].factions.mercenaries).toMatchObject({visited:1,fresh:1});
 expect(patrol.status(250)[0].factions.mercenaries).toMatchObject({visited:1,fresh:0});
 expect(patrol.status(153)[0].factions['armed-forces'].visited).toBe(0);
 patrol.reset();expect(patrol.status(0)[0].factions.mercenaries.visited).toBe(0);
});

it('leases different stops to friendly patrols without reading the enemy patrol plan',()=>{
 const patrol=createSectorPatrols([sectors[0]],[],()=>true),base={faction:'mercenaries' as const,sector:'west',x:-160,z:0};
 const goals=[0,1,2,3].map(i=>patrol.goal({...base,id:`p${i}`},0)!);
 expect(new Set(goals.map(p=>`${p.x},${p.z}`)).size).toBe(4);
 const enemy=patrol.goal({...base,id:'enemy',faction:'armed-forces'},0)!;
 expect(enemy).toEqual(goals[0]);
 patrol.sync(new Set());
 expect(patrol.goal({...base,id:'fresh'},1)).toEqual(goals[0]);
});

it('bounds investigation time and pursuit, then resumes coverage even with a continuous sighting',()=>{
 const from={x:0,z:0},allowed=(p:{x:number;z:number})=>p.x<=40;
 expect(advancePatrolInvestigation(undefined,{x:80,z:0},from,0,allowed)).toBeUndefined();
 const first=advancePatrolInvestigation(undefined,{x:30,z:0},from,0,allowed)!;
 const moving=advancePatrolInvestigation(first,{x:35,z:0},from,9,allowed)!;
 expect(moving.point.x).toBe(35);expect(moving.until).toBe(10);
 expect(advancePatrolInvestigation(moving,{x:45,z:0},from,9.5,allowed)!.point.x).toBe(35);
 const expired=advancePatrolInvestigation(moving,{x:30,z:0},from,11,allowed)!;
 expect(expired.until).toBeLessThan(11);
 expect(advancePatrolInvestigation(expired,{x:30,z:0},from,26,allowed)!.until).toBe(36);
});

function scenario() {
 const environment:ArenaEnvironment={bounds:{minX:-240,maxX:240,minZ:-220,maxZ:220},spawns:[{x:-160,z:0},{x:160,z:0}],playerSpawn:{x:160,z:0},
  endless:true,reinforcements:true,battlefield:{size:32},patrolSectors:sectors,facilities:{sites},move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz})};
 // Opaque sight isolates patrol allocation and coverage from casualty variance.
 return {environment,arena:createArena([],0,'assault',environment,undefined,undefined,()=>0)};
}

it('patrols beyond camp radius with distinct duties, real coverage and reset-safe snapshots',()=>{
 const {arena,environment}=scenario();arena.step(.05);
 const initial=arena.snapshot(),patrollers=initial.actors.filter(a=>a.duty==='patrol');
 expect(patrollers).toHaveLength(8);
 expect(initial.actors.filter(a=>a.duty==='sentry')).toHaveLength(4);
 expect(initial.actors.filter(a=>a.duty==='attack')).toHaveLength(20);
 expect(validArenaSnapshot(initial,environment)).toBe(true);
 for(let i=0;i<2400;i++)arena.step(.05);
 const current=arena.snapshot();
 for(const faction of ['mercenaries','armed-forces']) {
  const actors=current.actors.filter(a=>a.alive&&a.faction===faction);
  expect(actors.filter(a=>a.duty==='attack').length).toBeGreaterThanOrEqual(actors.length/2);
 }
 expect(current.actors.filter(a=>a.duty==='patrol'&&sites.every(s=>Math.hypot(a.x-s.x,a.z-s.z)>40)).length).toBeGreaterThan(0);
 expect(arena.patrolStatus().filter(s=>s.factions.mercenaries.visited>0)).toHaveLength(3);
 expect(arena.patrolStatus().filter(s=>s.sector==='west'||s.sector==='north').every(s=>s.factions.mercenaries.visited>1)).toBe(true);
 expect(arena.navigationStatus().filter(a=>a.duty==='patrol').every(a=>a.sector&&a.mission)).toBe(true);
 const bad=structuredClone(current);bad.actors[0].duty='bogus' as never;
 expect(validArenaSnapshot(bad,environment)).toBe(false);
 arena.reset();expect(arena.patrolStatus().every(s=>s.factions.mercenaries.visited===0)).toBe(true);
 arena.step(.05);expect(arena.snapshot().actors.filter(a=>a.duty==='patrol')).toHaveLength(8);
});

it('assigns sector patrols in a world with no facilities at all',()=>{
 const arena=createArena([],6,'assault',{bounds:{minX:-240,maxX:240,minZ:-220,maxZ:220},spawns:[{x:-160,z:0}],
  endless:true,patrolSectors:sectors,move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz})});
 arena.step(.05);
 expect(arena.snapshot().actors.filter(a=>a.duty==='patrol')).toHaveLength(6);
 expect(arena.snapshot().actors.every(a=>a.objective===undefined&&!!a.patrolSector)).toBe(true);
});

it('lets explicit player orders override sector coverage',()=>{
 const {arena}=scenario();arena.addPlayer('p','Commander',0,0,undefined,undefined,true);arena.step(.05);
 const response=arena.callout('p','hold-position')!;expect(response.order!.allies).toBeGreaterThan(0);
 const initial=arena.snapshot().actors.filter(a=>a.bot&&a.faction==='armed-forces'&&Math.hypot(a.x-160,a.z)<60)
  .sort((a,b)=>Math.hypot(a.x-160,a.z)-Math.hypot(b.x-160,b.z)).slice(0,response.order!.allies);
 for(let i=0;i<100;i++)arena.step(.05);
 const state=arena.snapshot();
 for(const a of initial){const b=state.actors.find(b=>b.id===a.id)!;expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeLessThan(2);}
});

it('investigates a visible sector contact, then resumes patrol under a continuous sighting',()=>{
 const arena=createArena([],6,'assault',{bounds:{minX:-240,maxX:240,minZ:-220,maxZ:220},spawns:[{x:-160,z:0}],playerSpawn:{x:-130,z:0},
  endless:true,patrolSectors:sectors,move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz})});
 arena.addPlayer('contact','Contact',0,0,undefined,undefined,true);
 const investigating=new Set<string>();let resumed=false;
 for(let i=0;i<420;i++) {
  arena.setPlayerVitals('contact',{health:1000});arena.step(.05);
  for(const actor of arena.snapshot().actors) {
   if(actor.duty==='investigate')investigating.add(actor.id);
   if(i>240&&investigating.has(actor.id)&&actor.duty==='patrol')resumed=true;
  }
 }
 expect(investigating.size).toBeGreaterThan(0);expect(resumed).toBe(true);
});

it('reaches and captures the central console under a camp canopy without treating its roof as ground',()=>{
 const bounds={minX:-100,maxX:100,minZ:-80,maxZ:80},camp=createCommandCamp({x:0,y:0,z:0},()=>true);
 const locations:FacilitySite[]=[{...sites[0],x:-60,z:-30,deployment:{x:-60,z:-30,yaw:0}},
  {...sites[0],id:'target',x:0,z:0,camp,initialOwner:null,initiallyBuilt:true,deployment:{x:0,z:0,yaw:0}}];
 const obstacles=locations.flatMap(facilityObstacles),scene=new THREE.Scene(),visuals=createFacilityVisuals(scene,locations),cover=createSceneCover(scene);
 const anchors=locations.flatMap(facilityNavigationAnchors),sector={id:'field',name:'Field',bounds,anchors:[{x:-60,z:0},{x:50,z:0},{x:0,z:50}]};
 const arena=createArena(obstacles,1,'assault',{bounds,spawns:[{x:-60,z:0}],endless:true,reinforcements:true,facilities:{sites:locations},
  patrolSectors:[sector],navigationAnchors:anchors,move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz})},undefined,
  {bounds,obstacles,surfaces:[],traversalObstacles:locations.flatMap(facilityCeilings)},cover.distance);
 try {
  let worked=false;
  for(let i=0;i<900;i++){arena.step(.1);const state=arena.snapshot();worked ||= !!state.facilities!.sites[1].action;}
  expect(worked).toBe(true);expect(arena.snapshot().facilities!.sites[1].owner).toBe('mercenaries');
 }finally{visuals.dispose();}
});
