import * as THREE from 'three';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {buildDistrictWorld} from './district-world';
import {createVerticalMovement} from './vertical-movement';
import {getPhysicalWalkSurfaces,getTraversalObstacles,surfaceContains} from './vertical-routes';
import {liftBodies,liftSample,liftPassenger,liftDeparture} from './building-lifts';
import {MARINA_LIFTS,SKYPARK_FLOOR} from './marina-landmarks';
import {skyparkOutline} from './marina-interiors';
let world:ReturnType<typeof buildDistrictWorld>,movement:ReturnType<typeof createVerticalMovement>;
beforeAll(()=>{world=buildDistrictWorld('marina-bay');movement=createVerticalMovement({bounds:world.bounds,obstacles:world.obstacles,surfaces:getPhysicalWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)});});
afterAll(()=>world.dispose());
it('supports the entire rendered roof outline and both ends, with real empty lift openings',()=>{
 const deck=getPhysicalWalkSurfaces(world.scene).find(s=>s.id==='sands-skypark/deck')!;
 expect(deck.footprint).toEqual(skyparkOutline());
 let checked=0;
 for(let x=deck.minX+.4;x<deck.maxX-.4;x+=.4)for(let z=deck.minZ+.4;z<deck.maxZ-.4;z+=.6){
  if(!surfaceContains(deck,x,z)||!movement.canOccupy(x,SKYPARK_FLOOR,z,.38,1.8))continue;
  expect(movement.supportHeight(x,z,SKYPARK_FLOOR+.01,.38,1.8),`${x},${z}`).toBeCloseTo(SKYPARK_FLOOR);checked++;
 }
 expect(checked).toBeGreaterThan(2000);
 for(const z of [-62,43])expect(movement.supportHeight(90.6,z,SKYPARK_FLOOR+.01)).toBe(SKYPARK_FLOOR);
 for(const l of MARINA_LIFTS)expect(movement.supportHeight(l.x,l.z,l.top+.01)).not.toBe(l.top);
 const roof=world.scene.getObjectByName('SkyPark continuous walkable stone deck')!;world.scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(90.6,70,-18),new THREE.Vector3(0,-1,0));
 expect(ray.intersectObject(roof)[0]?.point.y).toBeCloseTo(SKYPARK_FLOOR);
});
it('lands on every rooftop planter and steps off onto the deck without dropping through it',()=>{
 for(const [x,z,top] of [...[-40,-24,-8,8,31].map(z=>[94,z,.6]),...[-30,0,16].map(z=>[87.2,z,.59])]){
  let p={x,z,y:SKYPARK_FLOOR+top+1,velocityY:0};
  for(let i=0;i<100;i++)p=movement.move(p,0,0,.02);
  expect(p.y).toBeCloseTo(SKYPARK_FLOOR+top);
  for(let i=0;i<80;i++){p=movement.move(p,(90.6-x)/80,0,.02);expect(p.y).toBeGreaterThanOrEqual(SKYPARK_FLOOR-.001);}
  for(let i=0;i<60;i++)p=movement.move(p,0,0,.02);
  expect(p.y).toBeCloseTo(SKYPARK_FLOOR);
 }
});
it.each(MARINA_LIFTS)('$id carries a walking, crouching and jumping passenger at the walls through two full cycles',l=>{
 let p={x:l.x,z:l.z,y:liftSample(l,0).y,velocityY:0};let distance=0;const dt=.025;
 for(let i=1;i<=3040;i++){
  const time=i*dt,old=liftSample(l,time-dt),now=liftSample(l,time);
  expect(liftPassenger([l],p,time-dt)?.id,`lost passenger at ${time}`).toBe(l.id);
  p.y+=now.y-old.y;
  const height=i%200<80?1.25:1.8;
  if(i%280===0)p.velocityY=5;
  const before={...p},phase=Math.floor(i/100)%4;
  p=movement.move(p,phase===0?.06:phase===2?-.06:0,phase===1?.06:phase===3?-.06:0,dt,.38,height,liftBodies([l],time));
  distance+=Math.hypot(p.x-before.x,p.z-before.z);
  expect(p.y,`below car at ${time}`).toBeGreaterThanOrEqual(now.y-.001);
  expect(p.y+height).toBeLessThanOrEqual(now.y+2.74);
  // During an open stop, stay in the cabin rather than exiting along the test's wall sweep.
  if(now.open&&p.z<l.z-1.25)p.z=l.z-1.25;
 }
 expect(distance).toBeGreaterThan(45);
});

it('keeps the roof under a player brushing a closing landing door and resolves a straddled threshold',()=>{
 const l=MARINA_LIFTS[0];
 for(let time=0;time<38;time+=.2){
  const p=movement.move({x:91.995094,z:-38.760746,y:SKYPARK_FLOOR,velocityY:0},0,.1,.05,.38,1.8,liftBodies([l],time));
  expect(p.y,`door cycle ${time}`).toBeCloseTo(SKYPARK_FLOOR);
 }
 for(const side of [-1,1])for(const jump of [0,.8]){
  const before={x:l.x,y:l.top+jump,z:l.z-l.depth/2+side*.1};
  const transition=liftDeparture(l,25.99,26.04,before)!;expect(transition.board).toBe(side>0);
  let p={x:transition.x,z:transition.z,y:side>0?liftSample(l,26.04).y:l.top,velocityY:0};
  for(let i=1;i<50;i++){
    const t=26.04+i*.02;
    if(transition.board)p.y+=liftSample(l,t).y-liftSample(l,t-.02).y;
    p=movement.move(p,0,0,.02,.38,1.8,liftBodies([l],t));
    expect(p.y).toBeCloseTo(transition.board?liftSample(l,t).y:l.top);
  }
 }
});

it('has continuous full-height routes through the atrium, side entrances and both lift approaches',()=>{
 const routes=[
  [{x:86.7,z:-46},{x:86.7,z:28}],
  ...[-43,-13,17].map(z=>[{x:81,z},{x:86.7,z}]),
  ...MARINA_LIFTS.map(l=>[{x:86.7,z:l.z-7},{x:l.x,z:l.z-7},{x:l.x,z:l.z}]),
  [{x:86.7,z:-18},{x:93.7,z:-18},{x:93.7,z:-13.5}],
 ];
 for(const route of routes){
  let p={...route[0],y:0,velocityY:0};
  for(const to of route.slice(1)){
   const count=Math.ceil(Math.hypot(to.x-p.x,to.z-p.z)/.1),dx=(to.x-p.x)/count,dz=(to.z-p.z)/count;
   for(let n=0;n<count;n++)p=movement.move(p,dx,dz,.025,.38,1.8,liftBodies(MARINA_LIFTS,to.z>0?19:0));
   expect(p.x,JSON.stringify(to)).toBeCloseTo(to.x,1);expect(p.z,JSON.stringify(to)).toBeCloseTo(to.z,1);expect(p.y).toBeCloseTo(0);
  }
 }
});
it('opens the former low ceiling into the atrium and keeps overhead structure physically solid',()=>{
 expect(movement.canOccupy(87.6,0,-17,.38,12)).toBe(true);
 // A player falling onto a scenic bridge or gallery still lands on the visible slab.
 for(const point of [{x:91.4,z:6,top:10.16},{x:85.2,z:-10,top:5.54}]){
  let p={x:point.x,z:point.z,y:point.top+1.5,velocityY:0};for(let i=0;i<120;i++)p=movement.move(p,0,0,.02,.38,1.8);
  expect(p.y).toBeCloseTo(point.top);
 }
});

it.each(MARINA_LIFTS)('$id keeps standing passengers clear of the new stone portals throughout travel',l=>{
 for(let time=0;time<38;time+=.05){
  const sample=liftSample(l,time),bodies=liftBodies([l],time);
  for(const dx of [-1.5,0,1.5])for(const dz of [-1.74,0,1.5])
   expect(movement.canOccupy(l.x+dx,sample.y,l.z+dz,.38,1.8,bodies),`${time}: ${dx},${dz}`).toBe(true);
 }
});
