import { expect, it } from 'vitest';
import { airMissionWeights, chooseAirMission, boardingComplete, updateBoardingReservations, planAirRoute, createHelicopterMission, helicopterMissionControls, returnHelicopter } from './helicopter-autopilot';
import { createVehicle, flyVehicle } from './vehicle-rules';
const bounds={minX:-150,maxX:150,minZ:-150,maxZ:150};
const context={ground:12,groundNeeded:6,pressure:1,airCoverage:0,distance:120,passengers:3,transportClear:true,supportClear:true};
it('weights air support by remaining ground strength, useful pressure and existing coverage',()=>{
 const ready=airMissionWeights(context),thin=airMissionWeights({...context,ground:0}),quiet=airMissionWeights({...context,pressure:0}),covered=airMissionWeights({...context,airCoverage:2});
 expect(ready.support).toBeGreaterThan(ready.infantry);expect(thin.infantry).toBeGreaterThan(.7);
 expect(quiet.support).toBeLessThan(ready.support);expect(covered.support).toBeLessThan(ready.support);
 expect(Object.values(ready).reduce((a,b)=>a+b,0)).toBeCloseTo(1);
});
it('never selects infeasible flights or empty transport missions for any draw',()=>{
 const c={...context,transportClear:false,supportClear:false};
 for(let n=0;n<100;n++)expect(chooseAirMission(c,n/100)).toBe('infantry');
 expect(airMissionWeights({...context,passengers:0}).transport).toBe(0);
 expect(chooseAirMission(context,0)).toBe('infantry');expect(chooseAirMission(context,.99)).toBe('support');
});
it('departs partially full after grace, waits for approaching reservations, and drops stalled or unavailable passengers',()=>{
 const r=[{id:'walking',distance:20,progressAt:0},{id:'stuck',distance:15,progressAt:0},{id:'ordered',distance:15,progressAt:0}];
 const next=updateBoardingReservations(r,5,id=>({eligible:id!=='ordered',aboard:false,distance:id==='walking'?10:15}));
 expect(next.map(r=>r.id)).toEqual(['walking']);expect(boardingComplete(0,6,next)).toBe(false);
 expect(boardingComplete(0,18,next)).toBe(true);expect(boardingComplete(0,2,[])).toBe(false);
 expect(boardingComplete(0,3,[])).toBe(true);
 expect(updateBoardingReservations(next,6,()=>({eligible:true,aboard:true,distance:0}))).toEqual([]);
});
it('rejects sealed takeoff/landing columns and routes above buildings instead of through them',()=>{
 const from={x:0,y:.13,z:70},to={x:0,y:.13,z:-70};
 const wall={minX:-15,maxX:15,minZ:-10,maxZ:10,minY:0,maxY:35};
 expect(planAirRoute(from,to,[wall],bounds)?.cruise).toBe(43);
 expect(planAirRoute(from,to,[{...wall,minZ:60,maxZ:80,minY:8}],bounds)).toBeNull();
 expect(planAirRoute(from,to,[{...wall,maxY:115}],bounds)).toBeNull();
});
it('flies real controls over an obstacle, lands, and returns without collisions or teleportation',()=>{
 const walls=[{minX:-15,maxX:15,minZ:-10,maxZ:10,minY:0,maxY:25}],from={x:0,y:.13,z:70},to={x:0,y:.13,z:-70};
 const route=planAirRoute(from,to,walls,bounds)!;const mission=createHelicopterMission('transport','front',route,0,[]);
 let v=createVehicle('helicopter',{...from,yaw:0}),returned=false,maxY=0;
 for(let t=0;t<160;t+=.05){
  const input=helicopterMissionControls(mission,v,t),step=flyVehicle(v,input.forward,input.steer,input.lift,false,.05,walls,bounds);
  expect(step.impactSpeed).toBe(0);expect(Math.hypot(step.state.x-v.x,step.state.z-v.z)).toBeLessThan(.65);
  v=step.state;maxY=Math.max(maxY,v.y);
  if(mission.phase==='unloading'){expect(Math.hypot(v.x-to.x,v.z-to.z)).toBeLessThan(.6);expect(v.y).toBeLessThan(.4);expect(returnHelicopter(mission,v,t,walls,bounds)).toBe(true);returned=true;}
  if(mission.phase==='done')break;
 }
 expect(returned).toBe(true);expect(maxY).toBeGreaterThan(32);expect(mission.phase).toBe('done');expect(Math.hypot(v.x-from.x,v.z-from.z)).toBeLessThan(.6);
});

it('recovers to a validated alternate if the home landing column becomes blocked',()=>{
 const home={x:0,y:.13,z:70},away={x:0,y:22,z:-50},alternate={x:20,y:.13,z:70};
 const m=createHelicopterMission('support','front',planAirRoute(home,away,[],bounds)!,0,[]);
 const parked={minX:-3,maxX:3,minZ:67,maxZ:73,minY:0,maxY:3};
 expect(returnHelicopter(m,away,30,[parked],bounds,[alternate])).toBe(true);
 expect(m.route.to).toEqual(alternate);expect(m.returning).toBe(true);
});
