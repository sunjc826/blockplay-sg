import { describe, expect, it, vi } from 'vitest';
import { DRAGON_BOAT_SPAWNS, MARINA_CAMP_DECKS, MARINA_WATER, canPaddle, isDragonBoat } from './marina-water';
import { buildMarinaScene } from './marina-scene';
import { MARINA_BOUNDS, moveInMarina } from './marina-collision';
import { createVehicle, paddleVehicle, vehicleExit, VEHICLE_SPAWNS, type VehicleSpawns } from './vehicle-rules';
import { createVerticalMovement } from './vertical-movement';
import { getTraversalObstacles, getWalkSurfaces } from './vertical-routes';
import { createArena, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { createFpsVehicles } from './fps-vehicles';
import { fireVehicleWeapon, vehicleBlastDamage } from './vehicle-combat';
import { buildDragonBoatModel, animateDragonBoat } from './dragon-boat-model';
import { disposeModel } from './armory-visuals';
import { shootAndLand } from './arena-test-shots';

function worldSetup() {
  const world=buildMarinaScene();
  const traversal={bounds:MARINA_BOUNDS,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)};
  const movement=createVerticalMovement(traversal);
  return {world,traversal,movement,floor:(x:number,z:number)=>movement.supportHeight(x,z,.35,.38,1.8)};
}
const spawns:VehicleSpawns={...VEHICLE_SPAWNS,...DRAGON_BOAT_SPAWNS};
const boat=(a:ArenaSimulation)=>a.snapshot().vehicles!.find(v=>v.kind==='dragon-boat-red')!;
function input(a:ArenaSimulation,forward:number,steer:number,seconds:number,brake=false){
  for(let t=0;t<seconds-.001;t+=.05){const actor=a.snapshot().actors.find(m=>m.id==='p')!;a.setInput('p',{...actor,playing:true,vehicleControls:{forward,steer,brake,lift:0,boost:false,fire:false}});a.step(.05);}
}

function sailTo(a:ArenaSimulation,x:number,z:number){
  for(let i=0;i<1600;i++){
    const v=boat(a),d=Math.hypot(x-v.x,z-v.z),heading=Math.atan2(v.x-x,v.z-z),error=Math.atan2(Math.sin(heading-v.yaw),Math.cos(heading-v.yaw));
    if(d<.25 && Math.abs(v.speed)<.1) return;
    const braking=d<Math.abs(v.speed)/5+.25;
    input(a,!braking&&Math.abs(error)<.12?1:0,Math.max(-1,Math.min(1,-error*10)),.05,braking||Math.abs(error)>.12);
    if(d<.8&&v.speed===0) return;
  }
  throw Error(`Could not reach ${x},${z}; at ${boat(a).x},${boat(a).z}`);
}

describe('Marina campsite and dragon boats',()=>{
  it('has continuous dry decks and three accessible landings surrounded by blocked water',()=>{
    const {world,movement}=worldSetup();try{
      for(const d of MARINA_CAMP_DECKS){const x=(d.minX+d.maxX)/2,z=(d.minZ+d.maxZ)/2;expect(movement.supportHeight(x,z,.1)).toBe(0);}
      for(const [x,z] of [[0,3],[0,-27],[17,-12],[-20.5,30.8],[20.5,-54.8]])expect(movement.canOccupy(x,0,z,.38,1.8)).toBe(true);
      for(const [x,z] of [[-30,-12],[0,12],[30,-30]])expect(movement.supportHeight(x,z,.35)).toBeNull();
      expect(world.scene.getObjectByName('Camp shelter roof')).toBeTruthy();
      // Each landing has a continuous route through the camp, away from the cover.
      for(const [start,dx,dz] of [[{x:0,y:0,z:3,velocityY:0},0,-12],[{x:0,y:0,z:-27,velocityY:0},0,10],[{x:17,y:0,z:-12,velocityY:0},-16,0]] as const){
        const end=movement.move(start,dx,dz,1);expect(end.x).toBeCloseTo(start.x+dx);expect(end.z).toBeCloseTo(start.z+dz);
      }
    }finally{world.dispose();}
  });
  it('starts at opposing clear jetties, disembarks only beside dry decks and cannot exit at speed',()=>{
    const {world,floor,movement}=worldSetup();try{
      for(const kind of ['dragon-boat-red','dragon-boat-gold'] as const){const v=createVehicle(kind);expect(canPaddle(v.x,v.z,v.yaw)).toBe(true);const exit=vehicleExit(v,world.obstacles,MARINA_BOUNDS,floor)!;expect(exit).not.toBeNull();expect(movement.canOccupy(exit.x,exit.y,exit.z)).toBe(true);expect(vehicleExit({...v,speed:1},world.obstacles,MARINA_BOUNDS,floor)).toBeNull();}
      expect(vehicleExit({...createVehicle('dragon-boat-red'),x:-30,z:-12},world.obstacles,MARINA_BOUNDS,floor)).toBeNull();
      for(const p of [{x:0,z:9,yaw:0},{x:0,z:-33,yaw:Math.PI},{x:23,z:-12,yaw:Math.PI/2}])expect(vehicleExit({...createVehicle('dragon-boat-red'),...p},world.obstacles,MARINA_BOUNDS,floor)).not.toBeNull();
    }finally{world.dispose();}
  });
  it('paddles, turns at rest, coasts and brakes without crossing quays, decks or another boat',()=>{
    const initial=createVehicle('dragon-boat-red');
    let solo=initial,crew=initial;
    for(let i=0;i<40;i++){solo=paddleVehicle(solo,1,0,false,.05).state;crew=paddleVehicle(crew,1,0,false,.05,3).state;}
    expect(crew.speed).toBeGreaterThan(solo.speed);expect(crew.z).toBeLessThan(initial.z);
    const coast=paddleVehicle(crew,0,0,false,.05).state;expect(coast.speed).toBeGreaterThan(0);expect(coast.speed).toBeLessThan(crew.speed);
    expect(paddleVehicle(crew,0,0,true,.05).state.speed).toBeLessThan(coast.speed);
    expect(paddleVehicle(initial,0,1,false,.05).state.yaw).not.toBe(initial.yaw);
    for(const v of [{...initial,x:0,z:12},{...initial,x:35,z:-45}]){let next=v;for(let i=0;i<500;i++){next=paddleVehicle(next,1,0,false,.05).state;expect(canPaddle(next.x,next.z,next.yaw)).toBe(true);}expect(next.speed).toBe(0);}
    expect(canPaddle(initial.x,initial.z,0,[{minX:-18,maxX:-16,minZ:20,maxZ:28}])).toBe(false);
    expect(paddleVehicle(initial,1,1,false,10)).toEqual(paddleVehicle(initial,1,1,false,.05));
    expect(fireVehicleWeapon(initial)).toBe(false);expect(vehicleBlastDamage(initial.kind,0)).toBe(0);
  });
  it('boards and crosses using shared authority, validates four hulls, keeps an open-water crew aboard and unloads at camp',()=>{
    const {world,traversal}=worldSetup();
    const environment={bounds:MARINA_BOUNDS,move:moveInMarina,playerSpawn:{x:-20.5,z:24,yaw:0},spawns:[{x:-30,z:50}],endless:true};
    const a=createArena(world.obstacles,0,'assault',environment,{spawns,openWorld:true},traversal);
    try{
      a.addPlayer('p','Paddler',0,0,[],undefined,true);
      expect(a.snapshot().vehicles).toHaveLength(4);expect(a.vehicleAction('p','enter','dragon-boat-red')).toBe(true);
      for(const id of ['crew1','crew2','crew3']){a.addPlayer(id,id,0,0,[],undefined,true);expect(a.vehicleAction(id,'enter','dragon-boat-red')).toBe(true);}
      input(a,1,0,3);expect(boat(a).z).toBeLessThan(22);expect(validArenaSnapshot(a.snapshot(),environment)).toBe(true);
      expect(a.vehicleAction('p','exit')).toBe(false);
      // The passage goes east of the south landing, then turns west toward its berth.
      sailTo(a,-17,10);sailTo(a,0,10);sailTo(a,0,8);
      expect(a.vehicleAction('p','exit')).toBe(true);expect(a.snapshot().actors.find(m=>m.id==='p')!.vehicle).toBeUndefined();
      expect(a.snapshot().actors.find(m=>m.id==='p')!.z).toBeLessThan(4);
      const crew=a.snapshot().actors.filter(m=>!m.bot);expect(crew.every(m=>m.vehicle===undefined)).toBe(true);
      for(let i=0;i<crew.length;i++)for(let j=i+1;j<crew.length;j++)expect(Math.hypot(crew[i].x-crew[j].x,crew[i].z-crew[j].z)).toBeGreaterThan(.8);
      expect(boat(a).y).toBe(MARINA_WATER.surface);
      a.reset();expect(boat(a)).toMatchObject({...DRAGON_BOAT_SPAWNS['dragon-boat-red'],health:300,y:MARINA_WATER.surface});
    }finally{world.dispose();}
  });
  it('presents both boats, safe prompts, unarmed steering and independent reset',()=>{
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})});
    const {world,floor}=worldSetup();const fleet=createFpsVehicles(world.scene,world.obstacles,{car:'',helicopter:''},{spawns,bounds:MARINA_BOUNDS,exitFloor:floor});
    try{
      expect(fleet.nearest({x:-20.5,z:24})).toBe('dragon-boat-red');expect(fleet.interact({x:-20.5,z:24})?.entered).toBe(true);
      expect(fleet.hud({x:-20.5,z:24})).toMatchObject({vehicleCanFire:false,vehicleAmmo:0,vehicleSeats:[{label:'Steerer'},{label:'Paddler 1'},{label:'Paddler 2'},{label:'Paddler 3'}]});
      for(let i=0;i<60;i++)fleet.step(new Set(['w']),.05);expect(fleet.states['dragon-boat-red'].z).toBeLessThan(22);
      expect(fleet.states['dragon-boat-gold'].z).toBe(-48);fleet.reset();expect(fleet.active).toBeNull();expect(fleet.states['dragon-boat-red'].z).toBe(24);
      const model=buildDragonBoatModel(false);try{animateDragonBoat(model,3,.3);expect(model.getObjectsByProperty('name','dragon-paddle')).toHaveLength(6);expect(model.getObjectByName('dragon-paddle')!.rotation.x).not.toBe(0);}finally{disposeModel(model);}
      expect(Object.values(fleet.states).filter(v=>isDragonBoat(v.kind)&&!v.despawned)).toHaveLength(2);
    }finally{fleet.dispose();world.dispose();vi.unstubAllGlobals();}
  });
  it('leaves exposed boat occupants hittable above the hull',()=>{
    const {world,traversal}=worldSetup();
    const environment={bounds:MARINA_BOUNDS,move:moveInMarina,playerSpawn:{x:-20.5,z:24,yaw:0},spawns:[{x:-30,z:50}],endless:true};
    const a=createArena(world.obstacles,0,'assault',environment,{spawns,openWorld:true},traversal);
    try{
      a.addPlayer('p','Steerer',0,0,[],undefined,true);expect(a.vehicleAction('p','enter','dragon-boat-red')).toBe(true);
      a.addPlayer('shooter','Shooter',0,0,[],undefined,true);
      for(let i=0;i<70;i++)a.step(.05);
      const [target,shooter]=['p','shooter'].map(id=>a.snapshot().actors.find(m=>m.id===id)!);
      const dx=target.x-shooter.x,dy=target.y-.25-shooter.y,dz=target.z-shooter.z,length=Math.hypot(dx,dy,dz);
      const hit=shootAndLand(a,'shooter',shooter,{x:dx/length,y:dy/length,z:dz/length},shooter.weapon);
      expect(hit.hitId).toBe('p');expect(a.snapshot().actors.find(m=>m.id==='p')!.health).toBeLessThan(100);expect(boat(a).health).toBe(300);
    }finally{world.dispose();}
  });
});
