import { describe,it,expect } from 'vitest';
import { createSwimmingMovement, SWIMMING, swimmingCanFire,swimmingShotDirection } from './swimming';
import {buildMarinaScene} from './marina-scene';
import {MARINA_BOUNDS,moveInMarina} from './marina-collision';
import {getWalkSurfaces,getTraversalObstacles} from './vertical-routes';
import {createVerticalMovement} from './vertical-movement';
import {createArena,type ArenaSimulation} from './arena-rules';
import {validArenaSnapshot} from './arena-runtime';
import {MARINA_ISLET,MARINA_SWIM_EXITS} from './marina-water';
import {VEHICLE_SPAWNS} from './vehicle-rules';
function setup(){const world=buildMarinaScene();const traversal={bounds:MARINA_BOUNDS,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)};return{world,traversal,swim:createSwimmingMovement(traversal),dry:createVerticalMovement(traversal)};}
const actor=(a:ArenaSimulation)=>a.snapshot().actors.find(m=>m.id==='p')!;
function hostGo(a:ArenaSimulation,x:number,z:number,max=3000){for(let i=0;i<max;i++){const p=actor(a),d=Math.hypot(x-p.x,z-p.z);if(d<.08)return;a.step(.05);const stride=Math.min(d,.15);a.setInput('p',{...p,x:p.x+(x-p.x)/d*stride,z:p.z+(z-p.z)/d*stride,y:p.swimming?SWIMMING.eyeHeight:1.75,playing:true});}throw Error(`Host cannot reach ${x},${z}; at ${actor(a).x},${actor(a).z}`);}
describe('Marina swimming and Merlion islet',()=>{
 it('shrinks the dry footprint, exposes former camp area and retains a solid Merlion',()=>{const{world,swim,dry}=setup();try{
  expect(MARINA_ISLET.radius).toBe(6);expect(swim.isWater(10,-12)).toBe(true);expect(swim.isWater(5.8,-17.8)).toBe(true);expect(swim.isWater(3,-12)).toBe(false);
  expect(dry.canOccupy(0,0,-12)).toBe(false);expect(dry.canOccupy(3,0,-12)).toBe(true);expect(dry.supportHeight(10,-12,.35)).toBeNull();
  for(const p of MARINA_SWIM_EXITS)expect(dry.supportHeight(p.x,p.z,.35)).toBe(0);
 }finally{world.dispose();}});
 it('can leave a shore jetty, swim to the islet and climb out at a visible ladder',()=>{const{world,swim}=setup();try{
  let p={x:-20.5,y:0,z:24,velocityY:0};
  for(const target of [{x:-24,z:24},{x:-24,z:2},{x:0,z:2},{x:0,z:-3.6}]){
   for(let i=0;i<1800;i++){const d=Math.hypot(target.x-p.x,target.z-p.z);if(d<.03)break;const step=Math.min(d,.2),next=swim.move(p,(target.x-p.x)/d*step,(target.z-p.z)/d*step,.05);if(next.swimming)expect(Math.hypot(next.x-p.x,next.z-p.z)).toBeLessThanOrEqual(SWIMMING.speed*.05+.001);p=next;}
   expect(Math.hypot(target.x-p.x,target.z-p.z)).toBeLessThan(.04);
  }
  expect(swim.isWater(p.x,p.z)).toBe(false);expect(p.y).toBe(0);
 }finally{world.dispose();}});
 it('keeps quay walls closed away from ladders, respects buildings/hulls and has no dry seams through water',()=>{const{world,swim}=setup();try{
  let p={x:30,y:0,z:29,velocityY:0};for(let i=0;i<100;i++)p=swim.move(p,0,.2,.05);expect(p.z).toBeLessThanOrEqual(30.0001);
  for(const [x,z]of [[-6,12],[6,12],[0,-25],[-30,-18]])expect(swim.isWater(x,z)).toBe(true);
  const hit=swim.move({x:-30,y:0,z:0,velocityY:0},.5,0,.05,.38,1.8,[{minX:-29.6,maxX:-28,minZ:-2,maxZ:2}]);expect(hit.x).toBeLessThan(-29.9);
 }finally{world.dispose();}});
 it('enforces slow server movement, validates swimming snapshots, crosses the islet and reaches the far shore',()=>{const{world,traversal}=setup();const environment={bounds:MARINA_BOUNDS,move:moveInMarina,playerSpawn:{x:-20.5,z:24},spawns:[{x:-30,z:50}],endless:true};const a=createArena(world.obstacles,0,'assault',environment,{spawns:VEHICLE_SPAWNS,openWorld:true},traversal);try{
  a.addPlayer('p','Swimmer',0,0,[],undefined,true);
  hostGo(a,-24,24);expect(actor(a).swimming).toBe(true);expect(validArenaSnapshot(a.snapshot(),environment)).toBe(true);
  const before={...actor(a)};a.step(.05);for(let i=0;i<20;i++)a.setInput('p',{...actor(a),x:100,z:24,y:80,playing:true});expect(Math.hypot(actor(a).x-before.x,actor(a).z-before.z)).toBeLessThanOrEqual(SWIMMING.speed*.05+.001);expect(actor(a).y).toBe(SWIMMING.eyeHeight);
  hostGo(a,-24,2);hostGo(a,0,2);hostGo(a,0,-3.6);expect(actor(a).swimming).toBeUndefined();
  hostGo(a,0,-7);hostGo(a,2.25,-7);hostGo(a,2.25,-17);hostGo(a,0,-17);hostGo(a,0,-20.4);hostGo(a,0,-25);expect(actor(a).swimming).toBe(true);
  hostGo(a,24,-25);hostGo(a,24,-48);hostGo(a,21.4,-48);expect(actor(a).swimming).toBeUndefined();expect(actor(a).y).toBe(1.75);expect(validArenaSnapshot(a.snapshot(),environment)).toBe(true);
 }finally{world.dispose();}});
 it('refuses rifles and moving sidearm fire on the authority, but permits inaccurate stationary pistol shots',()=>{const{world,traversal}=setup();const environment={bounds:MARINA_BOUNDS,move:moveInMarina,playerSpawn:{x:-20.5,z:24},spawns:[{x:-30,z:50}],endless:true};const a=createArena(world.obstacles,0,'assault',environment,undefined,traversal);try{
  a.addPlayer('p','Swimmer',0,0,[],undefined,true);hostGo(a,-21.55,24);a.setInput('p',{...actor(a),y:1.15,playing:true});expect(actor(a).y).toBe(1.15);hostGo(a,-24,24);
  a.shoot('p',actor(a),{x:0,y:0,z:-1},actor(a).weapon);expect(actor(a).shots).toBe(0);
  a.setInput('p',{...actor(a),weapon:2,playing:true});a.shoot('p',actor(a),{x:0,y:0,z:-1},2);expect(actor(a).shots).toBe(0);
  a.step(.3);a.shoot('p',actor(a),{x:0,y:0,z:-1},2);expect(actor(a).shots).toBe(1);
  const ray=swimmingShotDirection({x:0,y:0,z:-1},()=>1);expect(Math.abs(ray.x)).toBeGreaterThan(.04);expect(Math.hypot(ray.x,ray.y,ray.z)).toBeCloseTo(1);
  expect(swimmingCanFire(0,0)).toBe(false);expect(swimmingCanFire(2,1)).toBe(false);expect(swimmingCanFire(2,0)).toBe(true);
 }finally{world.dispose();}});
});
