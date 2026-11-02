import * as THREE from 'three';
import { expect,it } from 'vitest';
import { withBuildingLifts } from './building-lift-scene';
import { liftLandingStatus, type BuildingLift } from './building-lifts';
import { createSceneCover } from './scene-cover';
import { createArena } from './arena-rules';
import { shootAndLand } from './arena-test-shots';
import { firstVisibleHit } from './fps-raycast';
import { getTraversalObstacles } from './vertical-routes';
import { createVerticalMovement } from './vertical-movement';
const lift:BuildingLift={id:'glass',x:0,z:0,width:4.4,depth:4.6,bottom:0,top:66.4,dwell:7,travel:12,offset:0};
const makeWorld=()=>withBuildingLifts({scene:new THREE.Scene(),car:new THREE.Group(),stamps:[],obstacles:[],animate:()=>{},dispose:()=>{}},[lift]);
it('shows an approaching car only at its destination, including the offset service',()=>{
 expect(liftLandingStatus(lift,16,66.4)).toMatchObject({arriving:true,open:false,label:'ARRIVING · 3s'});
 expect(liftLandingStatus(lift,16,0).arriving).toBe(false);
 expect(liftLandingStatus(lift,19,66.4)).toMatchObject({open:true,label:'OPEN · DEPARTS 7s'});
 expect(liftLandingStatus({...lift,offset:19},16,0)).toMatchObject({arriving:true,label:'ARRIVING · 3s'});
 expect(liftLandingStatus(lift,38,0).open).toBe(true);
});
it('lets shots and sight cross closed glass doors in both directions while frames and physical panes block',()=>{
 const world=makeWorld();world.animate(8);const cover=createSceneCover(world.scene);
 for(const reverse of [false,true]){
  const from={x:.8,y:1.75,z:reverse?0:-4},heading={x:0,y:0,z:reverse?-1:1};
  expect(cover.distance(from,heading,4)).toBe(4);expect(cover.sightDistance(from,heading,4)).toBe(4);
  expect(cover.trace(from,heading,4)?.distance).toBeLessThan(4);
  const ray=new THREE.Raycaster(new THREE.Vector3(from.x,from.y,from.z),new THREE.Vector3(heading.x,heading.y,heading.z),0,4);
  expect(firstVisibleHit(ray,world.scene.children)).toBeUndefined();
  expect(firstVisibleHit(ray,world.scene.children,false,true)).toBeDefined();
  const bounds={minX:-20,maxX:20,minZ:-20,maxZ:20};
  const arena=createArena([],0,'mixed',{bounds,spawns:[{x:.8,z:from.z},{x:.8,z:reverse?-4:0}],move:p=>p},undefined,undefined,cover.distance);
  arena.addPlayer('shooter','Shooter');arena.addPlayer('target','Target');
  expect(shootAndLand(arena,'shooter',from,heading,0).damage).toBeGreaterThan(0);
 }
 expect(cover.distance({x:.04,y:1.75,z:-4},{x:0,y:0,z:1},4)).toBeLessThan(4);
 const movement=createVerticalMovement({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},obstacles:[],surfaces:[],traversalObstacles:getTraversalObstacles(world.scene)});
 expect(movement.move({x:0,y:0,z:0,velocityY:0},5,0,0,.38,1.8).x).toBeLessThan(2.2);
 world.dispose();
});
it('moves solid cabin cover with the car between cached ray queries',()=>{
 const world=makeWorld(),cover=createSceneCover(world.scene),from={x:.8,y:10,z:0},down={x:0,y:-1,z:0};
 expect(cover.distance(from,down,20)).toBeCloseTo(7.13);
 world.animate(13);
 expect(cover.distance(from,down,20)).toBe(20);
 expect(cover.distance({x:.8,y:40,z:0},down,20)).toBeCloseTo(3.93);
 world.dispose();
});
it('lets a riding bot track and fire through the glass while keeping its position in the moving car',()=>{
 const bounds={minX:-30,maxX:30,minZ:-30,maxZ:30},slow={...lift,top:10,offset:7,travel:100};
 const world=withBuildingLifts({scene:new THREE.Scene(),car:new THREE.Group(),stamps:[],obstacles:[],animate:()=>{},dispose:()=>{}},[slow]);
 const cover=createSceneCover(world.scene);
 const arena=createArena([],1,'mixed',{bounds,spawns:[{x:.8,z:0}],playerSpawn:{x:.8,z:-6,yaw:0},move:p=>p,endless:true,departedCrew:['bot-2','bot-3','bot-4','bot-5']},undefined,{bounds,obstacles:[],surfaces:[],traversalObstacles:getTraversalObstacles(world.scene),lifts:[slow]},cover.distance,undefined,cover.sightDistance);
 arena.addPlayer('human','Human');const human=arena.snapshot().actors.find(a=>a.id==='human')!;
 arena.shoot('human',human,{x:0,y:0,z:-1},0);
 for(let i=0;i<200;i++){world.animate((i+1)*.05);arena.step(.05);}
 const bot=arena.snapshot().actors.find(a=>a.id==='bot-1')!;
 expect(bot.lift).toBe('glass');expect(bot.x).toBe(.8);expect(bot.z).toBe(0);expect(bot.y).toBeGreaterThan(2);
 expect(bot.shots).toBeGreaterThan(0);
 world.dispose();
});
