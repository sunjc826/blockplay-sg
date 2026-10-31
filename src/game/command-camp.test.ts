import * as THREE from 'three';
import { expect, it } from 'vitest';
import { campPropBounds, commandPatrolStops, createCommandCamp, facilityCeilings, facilityCoreBounds, facilityNavigationAnchors, facilityObstacles, guardPatrolGoal, validCommandCamp } from './command-camp';
import { createFacilities, facilityRayDistance, validFacilitySnapshot, type FacilitySite } from './facilities';
import { createVerticalMovement } from './vertical-movement';
import { createFacilityVisuals } from './facility-visuals';
import { createSceneCover } from './scene-cover';
import { createArena } from './arena-rules';

const center={x:0,y:0,z:0};
const home:FacilitySite={...center,id:'camp',name:'Field camp',kind:'command',initialOwner:'mercenaries',deployment:{x:0,z:0,yaw:0}};
const bounds={minX:-200,maxX:200,minZ:-200,maxZ:200};

it('places an open camp and spread patrol stops, adapting every component to available ground',()=>{
  const camp=createCommandCamp(center,()=>true);
  expect(camp.props).toHaveLength(9);expect(camp.patrol).toHaveLength(16);
  expect(camp.patrol.every(p=>Math.hypot(p.x,p.z)>=23.99&&Math.hypot(p.x,p.z)<=38.01)).toBe(true);
  const clipped=createCommandCamp(center,(x,z)=>x>2&&Math.abs(z)<25);
  expect(clipped.props.length).toBeGreaterThan(0);
  for(const prop of clipped.props)expect(campPropBounds(prop).minX).toBeGreaterThan(2);
  expect(clipped.patrol.every(p=>p.x>2&&Math.abs(p.z)<25)).toBe(true);
  expect(createCommandCamp(center,()=>true,x=>x*.4).props.every(p=>p.kind==='barricade')).toBe(true);
  expect(commandPatrolStops(center,()=>false)).toEqual([]);
});

it('uses matching core/cover collisions, leaving shelter aisles and camp approaches open',()=>{
  const site={...home,camp:createCommandCamp(center,()=>true)},obstacles=facilityObstacles(site);
  const move=createVerticalMovement({bounds,obstacles,surfaces:[],traversalObstacles:facilityCeilings(site)});
  expect(move.canOccupy(0,0,0,.4,1.8)).toBe(false);
  expect(move.canOccupy(0,0,3.7,.4,1.8)).toBe(true);
  expect(move.canOccupy(7,0,6.5,.4,1.8)).toBe(true);
  expect(move.canOccupy(7,2.6,6.5,.4,1.8)).toBe(false);
  let jumper={x:7,y:0,z:6.5,velocityY:6};let highest=0;
  for(let tick=0;tick<80;tick++){jumper=move.move(jumper,0,0,.02,.4,1.8);highest=Math.max(highest,jumper.y);}
  expect(highest).toBeLessThanOrEqual(.701);
  expect(jumper.y).toBe(0);
  expect(move.canOccupy(12,0,0,.4,1.8)).toBe(false);
  expect(move.canOccupy(7,0,-5,.4,1.8)).toBe(false);
  expect(facilityCoreBounds(site)).toMatchObject({minX:-1.2,maxX:1.2,minZ:-.8,maxZ:.8,maxY:1.55});
  expect(facilityNavigationAnchors(site).some(p=>Math.hypot(p.x,p.z)>30)).toBe(true);
  const state=createFacilities([site]).sites[0];
  expect(facilityRayDistance(state,{x:-10,y:1,z:0},{x:1,y:0,z:0})).toBeCloseTo(8.8);
  expect(facilityRayDistance(state,{x:-10,y:2,z:0},{x:1,y:0,z:0})).toBe(Infinity);
});

it('renders real camp cover separately from the console, batches furnishing draws and disposes owned resources',()=>{
  const site={...home,camp:createCommandCamp(center,()=>true)},scene=new THREE.Scene(),visuals=createFacilityVisuals(scene,[site]);
  const camp=scene.children.find(n=>n.userData.commandCamp==='camp')!;
  expect(camp).toBeDefined();expect(camp.userData.facilityId).toBeUndefined();
  expect(camp.children.length).toBeLessThanOrEqual(6);
  expect(camp.children.every(m=>m instanceof THREE.InstancedMesh)).toBe(true);
  scene.updateMatrixWorld(true);
  const cover=createSceneCover(scene);
  expect(cover.distance({x:-20,y:.6,z:0},{x:1,y:0,z:0},40)).toBeLessThan(10);
  expect(cover.distance({x:-20,y:1.75,z:0},{x:1,y:0,z:0},40)).toBe(40);
  let geometryDisposed=false,materialDisposed=false;
  const mesh=camp.children[0] as THREE.InstancedMesh;
  mesh.geometry.addEventListener('dispose',()=>geometryDisposed=true);
  (mesh.material as THREE.Material).addEventListener('dispose',()=>materialDisposed=true);
  const snapshot=createFacilities([site]).snapshot();visuals.update(snapshot);
  const flag=camp.children.find(m=>((m as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity===.4) as THREE.Mesh;
  expect((flag.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('f17c61');
  visuals.dispose();expect(scene.children).toHaveLength(0);expect(geometryDisposed&&materialDisposed).toBe(true);
});

it('bounds camp snapshot data and retains legacy saves without layouts',()=>{
  const facilities=createFacilities([{...home,camp:createCommandCamp(center,()=>true)}]);
  expect(validFacilitySnapshot(facilities.snapshot())).toBe(true);
  expect(validFacilitySnapshot(createFacilities([home]).snapshot())).toBe(true);
  const bad=facilities.snapshot();bad.sites[0].camp!.patrol[0].x=Infinity;
  expect(validFacilitySnapshot(bad)).toBe(false);
  expect(validCommandCamp({...facilities.sites[0].camp,props:[{kind:'__proto__',...center,yaw:0}]},center)).toBe(false);
  expect(validCommandCamp({...facilities.sites[0].camp,patrol:Array(100).fill(center)},center)).toBe(false);
});

it('gives each guard separate legs, arrival pauses, opposing directions and bounded blocked-leg recovery',()=>{
  const points=commandPatrolStops(center,()=>true);
  const guards=[0,1,2,3].map(slot=>guardPatrolGoal(undefined,'camp',points,center,0,slot)!);
  expect(new Set(guards.map(g=>g.state.index)).size).toBe(4);
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)expect(Math.hypot(guards[i].goal.x-guards[j].goal.x,guards[i].goal.z-guards[j].goal.z)).toBeGreaterThan(30);
  const arrived=guardPatrolGoal(guards[0].state,'camp',points,guards[0].goal,10,0)!;
  expect(guardPatrolGoal(arrived.state,'camp',points,guards[0].goal,11,0)!.state.index).toBe(0);
  expect(guardPatrolGoal(arrived.state,'camp',points,guards[0].goal,13,0)!.state.index).toBe(1);
  const reverse=guardPatrolGoal(guards[1].state,'camp',points,center,36,1)!;
  expect(reverse.state.index).toBe(3);
  expect(guardPatrolGoal(undefined,'camp',[],center,0,0)).toBeUndefined();
});

it('moves the four rear guards on separate patrols while keeping most of the roster offensive',()=>{
  const camp=createCommandCamp(center,()=>true);
  const sites:FacilitySite[]=[{...home,camp},...[-140,140].map((x,i)=>({...home,camp:undefined,id:`front-${i}`,kind:'supply' as const,x,z:80,initialOwner:null,initiallyBuilt:true,deployment:{x,z:80,yaw:0}}))];
  const arena=createArena([],0,'assault',{bounds,spawns:[{x:0,z:0}],endless:true,reinforcements:true,battlefield:{size:32},facilities:{sites},move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz})});
  arena.step(.05);
  const start=arena.snapshot().actors.filter(a=>a.alive&&a.objective==='camp');
  expect(start).toHaveLength(4);
  expect(arena.snapshot().actors.filter(a=>a.alive&&a.objective!=='camp')).toHaveLength(16);
  const positions=new Map<string,{x:number;z:number}[]>();
  for(let tick=0;tick<1200;tick++) {
    arena.step(.05);
    if(tick%100===0)for(const a of arena.snapshot().actors.filter(a=>start.some(g=>g.id===a.id))) {
      const samples=positions.get(a.id)??[];samples.push({x:a.x,z:a.z});positions.set(a.id,samples);
    }
  }
  for(const guard of start) {
    const samples=positions.get(guard.id)!;
    expect(samples.some(p=>Math.hypot(p.x,p.z)>20)).toBe(true);
    expect(Math.max(...samples.map(p=>Math.hypot(p.x-samples[4].x,p.z-samples[4].z)))).toBeGreaterThan(15);
  }
  expect(arena.navigationStatus().filter(n=>n.objective==='camp').every(n=>Math.hypot(n.mission!.x,n.mission!.z)>=18)).toBe(true);
  arena.addPlayer('raider','Raider',0,0,undefined,undefined,true);
  arena.setPlayerVitals('raider',{health:1000});
  for(let i=0;i<50;i++){arena.setPlayerVitals('raider',{health:1000});arena.step(.05);}
  const defenders=arena.navigationStatus().filter(n=>n.objective==='camp');
  expect(defenders).toHaveLength(4);
  expect(defenders.every(n=>Math.hypot(n.mission!.x,n.mission!.z)<=14.01)).toBe(true);
});
