import { sceneFlightObstacles } from './flight-obstacles';
import { createArena } from './arena-rules';
import { FPS_WEAPONS } from './fps-rules';
import * as THREE from 'three';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildQueenstownScene, QUEENSTOWN_MAP_ROADS } from './queenstown-scene';
import { QUEENSTOWN_TERRACES, queenstownTerrainHeight } from './queenstown-terrain';
import { QUEENSTOWN_BOUNDS } from './queenstown-collision';
import { createVerticalMovement } from './vertical-movement';
import { getTraversalObstacles, getWalkSurfaces } from './vertical-routes';
import { createSceneCover } from './scene-cover';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { createVehicle, driveVehicle, flyVehicle, canFly, vehicleExit } from './vehicle-rules';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';

let world: ReturnType<typeof buildQueenstownScene>, movement: ReturnType<typeof createVerticalMovement>;
beforeAll(() => {
  world=buildQueenstownScene();accelerateInstancedRaycasts(world.scene);world.scene.updateMatrixWorld(true);
  movement=createVerticalMovement({bounds:QUEENSTOWN_BOUNDS,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)});
});
afterAll(()=>world.dispose());

it('replaces isolated humps with a sustained hillside and level residential sites',()=>{
  expect(world.scene.userData.landscape.earthBanks).toBe(0);
  expect(queenstownTerrainHeight(-119,-140)).toBeGreaterThan(9);
  expect(queenstownTerrainHeight(-119,-90)).toBeGreaterThan(5);
  expect(queenstownTerrainHeight(-119,4)).toBeLessThan(1);
  for(const pad of QUEENSTOWN_TERRACES) for(const dx of [-pad.width/2+1,0,pad.width/2-1]) for(const dz of [-pad.depth/2+1,0,pad.depth/2-1])
    expect(queenstownTerrainHeight(pad.x+dx,pad.z+dz),pad.id).toBeCloseTo(pad.y,5);
});

it('uses the rendered terrain triangles for support, including diagonal cross slopes',()=>{
  const terrain=world.scene.getObjectByName('Queenstown connected hillside')!;
  for(const [x,z] of [[-143.3,-111.7],[-187.2,-30.4],[157.3,-133.8],[-119,-63],[-65,-63.5]]) {
    const y=queenstownTerrainHeight(x,z);
    const hit=new THREE.Raycaster(new THREE.Vector3(x,y+20,z),new THREE.Vector3(0,-1,0),0,30).intersectObject(terrain)[0];
    expect(hit).toBeDefined();expect(hit.point.y).toBeCloseTo(y,4);
    expect(movement.canOccupy(x,y-.1,z,.38)).toBe(false);
  }
});

function walk(points: readonly (readonly [number,number])[],radius:number) {
  let state={x:points[0][0],z:points[0][1],y:queenstownTerrainHeight(...points[0]),velocityY:0};
  for(const [x,z] of points.slice(1)) {
    const next=movement.move(state,x-state.x,z-state.z,0,radius);
    expect(Math.hypot(next.x-x,next.z-z),JSON.stringify({state,x,z})).toBeLessThan(.05);
    expect(next.y).toBeCloseTo(queenstownTerrainHeight(x,z),2);
    expect(next.grounded).toBe(true);state=next;
  }
  return state;
}
it('walks the longer estate approach and direct terrace stairs in both directions',()=>{
  const routes=[[[ -119,4],[-119,-22],[-119,-59],[-119,-68],[-119,-101]], [[-65,-57],[-65,-59],[-65,-63],[-65,-68],[-65,-69]]] as const;
  for(const points of routes)for(const radius of [.38,.65]){walk(points,radius);walk([...points].reverse(),radius);}
});

it('keeps roads continuous with drivable gradients and grounds the car uphill and downhill',()=>{
  const obstacles=[...world.obstacles,...verticalVehicleObstacles({bounds:QUEENSTOWN_BOUNDS,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)})];
  for(const road of QUEENSTOWN_MAP_ROADS)for(let i=1;i<road.points.length;i++) {
    const a=road.points[i-1],b=road.points[i],length=Math.hypot(a.x-b.x,a.z-b.z);
    for(let d=1;d<=length;d++) {
      const x=a.x+(b.x-a.x)*d/length,z=a.z+(b.z-a.z)*d/length;
      const px=a.x+(b.x-a.x)*(d-1)/length,pz=a.z+(b.z-a.z)*(d-1)/length;
      expect(Math.abs(queenstownTerrainHeight(x,z)-queenstownTerrainHeight(px,pz)),`road grade ${x},${z}`).toBeLessThan(.251);
    }
  }
  for(const [from,to] of [[4,-170],[-170,4]]) {
    let car=createVehicle('car',{x:-140,z:from,yaw:to<from?0:Math.PI});car.y=queenstownTerrainHeight(car.x,car.z)+.13;
    for(let i=0;i<1400&&Math.abs(car.z-to)>.7;i++) {
      const result=driveVehicle(car,1,0,false,.02,obstacles,QUEENSTOWN_BOUNDS);expect(result.blocked,`car at ${car.x},${car.z}`).toBe(false);car=result.state;
      expect(car.y).toBeCloseTo(queenstownTerrainHeight(car.x,car.z)+.13,6);
    }
    expect(Math.abs(car.z-to)).toBeLessThan(.7);
    car.speed=0;
    expect(vehicleExit(car,world.obstacles,QUEENSTOWN_BOUNDS,(x,z)=>movement.supportHeight(x,z,queenstownTerrainHeight(x,z)+.35))).not.toBeNull();
  }
});

it('keeps foliage as visual cover above the local terrain datum',()=>{
  const cover=createSceneCover(world.scene),x=-196,z=79.5,base=queenstownTerrainHeight(x,z),direction={x:0,y:0,z:1};
  expect(cover.sightDistance({x,y:base+1.15,z},direction,10)).toBeLessThan(10);
  expect(cover.distance({x,y:base+1.15,z},direction,10)).toBe(10);
});

it('spawns the authoritative player on elevated ground instead of below the hillside',()=>{
  const point={x:-119,z:-101,yaw:0,pitch:0};
  const arena=createArena(world.obstacles,0,'mixed',{bounds:QUEENSTOWN_BOUNDS,spawns:[point],playerSpawn:point,move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz})},undefined,{bounds:QUEENSTOWN_BOUNDS,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)});
  arena.addPlayer('terrain-check','Walker',0,0,FPS_WEAPONS,undefined,true);
  expect(arena.snapshot().actors.find(a=>a.id==='terrain-check')!.y).toBeCloseTo(queenstownTerrainHeight(point.x,point.z)+1.75,5);
});

it('lands a helicopter on raised ground with a settled climb rate and usable exit',()=>{
  let helicopter=createVehicle('helicopter',{x:-140,z:-122,yaw:0});
  const base=queenstownTerrainHeight(helicopter.x,helicopter.z);
  helicopter.y=base+1;helicopter.climb=-3;
  for(let i=0;i<100;i++)helicopter=flyVehicle(helicopter,0,0,-1,false,.02,[],QUEENSTOWN_BOUNDS).state;
  expect(helicopter.y).toBeCloseTo(base+.13,5);expect(helicopter.climb).toBe(0);
  expect(vehicleExit(helicopter,[],QUEENSTOWN_BOUNDS,queenstownTerrainHeight)).not.toBeNull();
});

it('keeps low airspace open above continuous terrain and graded paving',()=>{
  const flight=sceneFlightObstacles(world.scene);
  expect(canFly(0,.13,116,flight,QUEENSTOWN_BOUNDS)).toBe(true);
  expect(canFly(0,5,116,flight,QUEENSTOWN_BOUNDS)).toBe(true);
  expect(canFly(-140,queenstownTerrainHeight(-140,-122)-.1,-122,flight,QUEENSTOWN_BOUNDS)).toBe(false);
});
