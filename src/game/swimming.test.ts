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
 it('stops a walker at every quay rail, even a jumping one, and opens only at the jetties',()=>{const{world,swim}=setup();try{
  const walk=(x:number,z:number,dx:number,dz:number,velocityY=0)=>{let p={x,y:0,z,velocityY};for(let i=0;i<60;i++){p=swim.move(p,dx,dz,.05,.38,1.8,[],{rise:18,fall:24});expect(swim.isWater(p.x,p.z)).toBe(false);}return p;};
  // The body stops clear of the rail, a stride short at most.
  expect(walk(0,33,0,-.2).z).toBeGreaterThanOrEqual(30.76);expect(walk(0,33,0,-.2).z).toBeLessThan(30.9);
  expect(walk(40,-57,0,.2).z).toBeLessThanOrEqual(-54.76);expect(walk(40,-57,0,.2).z).toBeGreaterThan(-54.9);
  expect(walk(-51,0,.2,0).x).toBeLessThanOrEqual(-48.76);expect(walk(-51,0,.2,0).x).toBeGreaterThan(-48.9);
  expect(walk(51,0,-.2,0).x).toBeGreaterThanOrEqual(48.76);expect(walk(51,0,-.2,0).x).toBeLessThan(48.9);
  expect(walk(0,33,0,-.2,7.6).z).toBeGreaterThan(30.7);
  expect(walk(-20.5,33,0,-.2).z).toBeLessThan(25);
  expect(walk(20.5,-57,0,.2).z).toBeGreaterThan(-50);
 }finally{world.dispose();}});
 it('holds a walker on the wooden decks until they jump or take a ladder',()=>{const{world,swim}=setup();try{
  const push=(start:{x:number;z:number},dx:number,dz:number,velocityY=0,ticks=80)=>{let p={...start,y:0,velocityY};for(let i=0;i<ticks;i++)p=swim.move(p,dx,dz,.05,.38,1.8,[],{rise:18,fall:24});return p;};
  for(const [start,dx,dz] of [[{x:-20.5,z:21},-.2,0],[{x:-20.5,z:21},.2,0],[{x:-20.5,z:21},0,-.2],[{x:20.5,z:-45},.2,0],[{x:1.5,z:-4.5},.2,0],[{x:0,z:-12+3.5},-.2,-.2],[{x:7.5,z:-13.5},0,-.2]] as const){
   const p=push(start,dx,dz);expect(swim.isWater(p.x,p.z)).toBe(false);expect(p.y).toBe(0);
  }
  // Sliding along the edge past a ladder's rails stays dry too.
  expect(swim.isWater(push({x:-21.62,z:21},0,.1).x,push({x:-21.62,z:21},0,.1).z)).toBe(false);
  const jump=push({x:-20.5,z:21},-.2,0,7.6,60);expect(swim.isWater(jump.x,jump.z)).toBe(true);expect(jump.y).toBe(0);
  const ladder=push({x:-20.5,z:24},-.2,0,0,60);expect(swim.isWater(ladder.x,ladder.z)).toBe(true);
  // A short jump that lands on the lip is not stranded there, on any side of the deck.
  const lip=push({x:-21.8,z:21},-.2,0,0,40);expect(swim.isWater(lip.x,lip.z)).toBe(true);
  // A jump on the spot comes straight back down on the deck.
  const hop=push({x:-20.5,z:21},0,0,7.6,40);expect(swim.isWater(hop.x,hop.z)).toBe(false);expect(hop.y).toBe(0);
  // Climbing out leaves the body against the edge, free to walk away from it.
  let out={x:-22.3,y:0,z:24,velocityY:0};for(let i=0;i<120;i++)out=swim.move(out,.05,0,.05);expect(out.x).toBeGreaterThan(-21);
 }finally{world.dispose();}});
 it('lets the authority follow a player who jumped off a deck, but never one walking off it',()=>{const{world,traversal}=setup();const environment={bounds:MARINA_BOUNDS,move:moveInMarina,playerSpawn:{x:-20.5,z:21},spawns:[{x:-30,z:50}]};const a=createArena(world.obstacles,0,'mixed',environment,undefined,traversal);try{
  a.addPlayer('p','Swimmer',0,0,[],undefined,true);
  for(let i=0;i<120;i++){a.step(.05);const p=actor(a);a.setInput('p',{...p,x:Math.max(-23,p.x-.2),z:21,playing:true});}
  expect(actor(a).swimming).toBeUndefined();expect(actor(a).x).toBeGreaterThan(-22);expect(actor(a).x).toBeLessThan(-21);
  for(let i=0;i<40;i++){a.step(.05);a.setInput('p',{...actor(a),x:-23,z:21,y:SWIMMING.eyeHeight,playing:true});}
  expect(actor(a).swimming).toBe(true);expect(actor(a).x).toBeLessThan(-22);
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
