import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getRegion } from './regions';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles, surfaceContains } from './vertical-routes';
import { createRegionMovement, overlapsObstacle } from './region-collision';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { elevatedLootAnchors, createVerticalNavigator } from './vertical-navigation';
import { arenaWallDistance } from './arena-rules';

function inDistrict(id: 'chinatown' | 'orchard' | 'bukit-timah', check: (world: ReturnType<ReturnType<typeof getRegion>['build']>, movement: ReturnType<typeof createVerticalMovement>) => void) {
  const region=getRegion(id), world=region.build();
  try { check(world,createVerticalMovement({bounds:region.bounds,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)})); }
  finally { world.dispose(); }
}
const walk = (movement: ReturnType<typeof createVerticalMovement>, points: {x:number;y:number;z:number}[]) => {
  for(const path of [points,[...points].reverse()]) {
    let state={...path[0],velocityY:0};
    for(const to of path.slice(1)) {
      state=movement.move(state,to.x-state.x,to.z-state.z,0,.65,1.8);
      expect(Math.hypot(state.x-to.x,state.z-to.z)).toBeLessThan(.08);
      expect(state.y).toBeCloseTo(to.y,1);
    }
  }
};

describe('level design routes',()=>{
  it('walks from Smith Street through both shops to the rear lane and up each loft',()=>inDistrict('chinatown',(_world,movement)=>{
    for(const x of [-28,8]) {
      walk(movement,[{x:x-2,y:0,z:68},{x:x-2,y:0,z:60},{x,y:0,z:55},{x,y:0,z:46}]);
      walk(movement,[{x:x-2,y:0,z:62.8},{x:x+3.4,y:0,z:62.8},{x:x+3.4,y:0,z:61.1}]);
      walk(movement,[{x:x+3.4,y:0,z:61.1},{x:x+3.4,y:3,z:53.6},{x:x+3.4,y:3,z:52}]);
      expect(movement.canOccupy(x+5.8,0,57)).toBe(false);
      expect(movement.canOccupy(x,8.8,57,.38,1.8)).toBe(false); // Solid shop ceiling.
    }
  }));
  it('gives the shop lofts real street and lane views while retaining their parapets',()=>inDistrict('chinatown',(world,movement)=>{
    world.scene.updateMatrixWorld(true);
    for(const x of [-28,8]) for(const side of [-1,1]) {
      const origin=new THREE.Vector3(x-3.1,4.75,57+side*6);
      const direction=new THREE.Vector3(0,0,side);
      const ray=new THREE.Raycaster(origin,direction,0,5);
      expect(ray.intersectObjects(world.scene.children,true),`window at ${x}, side ${side}`).toEqual([]);
      expect(arenaWallDistance(origin,direction,getTraversalObstacles(world.scene))).toBe(Infinity);
      // The sill is 1.2 m above the loft: walking straight out still meets a wall.
      expect(movement.canOccupy(x-3.1,3,57+side*7.3,.38,1.8)).toBe(false);
      expect(arenaWallDistance({...origin,y:3.8},direction,getTraversalObstacles(world.scene))).toBeLessThan(2);
    }
  }));
  it('lets the player cross the reading room via offset doors and take either upper stair',()=>inDistrict('orchard',(world,movement)=>{
    for(const y of [0,5,10]) walk(movement,[{x:-6,y,z:-85},{x:-6,y,z:-98},{x:6,y,z:-98},{x:6,y,z:-103}]);
    for(const x of [-115,0,117]) {
      walk(movement,[{x:x-15,y:5,z:-65},{x:x+15,y:10,z:-65}]);
      walk(movement,[{x:x+15,y:5,z:-81},{x:x-15,y:10,z:-81}]);
    }
    const diagonal=getTraversalObstacles(world.scene).find(o=>o.footprint && o.minY===5)!;
    expect(diagonal).toBeDefined();
    expect(overlapsObstacle(diagonal,0, -94,.38)).toBe(true);
    // The empty corner of the rotated shelf's bounding box remains walkable.
    expect(overlapsObstacle(diagonal,diagonal.minX+.1,diagonal.minZ+.1,.05)).toBe(false);
  }));
  it('routes bots through the reading room doors and around its diagonal shelf on every level',()=>inDistrict('orchard',(world,movement)=>{
    const navigator=createVerticalNavigator({bounds:getRegion('orchard').bounds,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)});
    for(const y of [0,5,10]) {
      const a={x:-6,y,z:-85},b={x:6,y,z:-103};
      for(const [from,to] of [[a,b],[b,a]]) {
        const path=navigator.route(from,to);
        expect(path.length).toBeGreaterThan(1);
        let state={...from,velocityY:0};
        for(const point of path) {
          const moved=movement.move(state,point.x-state.x,point.z-state.z,0,.4,1.8);
          expect(moved.grounded).toBe(true);
          state=moved;
          expect(Math.hypot(state.x-point.x,state.z-point.z)).toBeLessThan(.05);
          expect(state.y).toBeCloseTo(point.y);
        }
        expect(state.x).toBeCloseTo(to.x);
        expect(state.z).toBeCloseTo(to.z);
      }
    }
  }));
  it('uses terrain outlines for feet, vehicles and loot rather than the bounding rectangle',()=>inDistrict('bukit-timah',(world,movement)=>{
    const surfaces=getWalkSurfaces(world.scene), surface=surfaces.find(s=>s.id.endsWith('/hill-contour-28'))!;
    expect(surfaceContains(surface,-188,-69)).toBe(false);
    expect(movement.supportHeight(-188,-69,28)).toBe(0);
    expect(movement.supportHeight(-171,-62,28)).toBe(28);
    const cars=createRegionMovement(getRegion('bukit-timah').bounds);
    const projection=verticalVehicleObstacles({surfaces:[surface],traversalObstacles:[]});
    expect(cars.canOccupy(-188,-69,.1,projection)).toBe(true);
    expect(cars.canOccupy(-171,-62,.1,projection)).toBe(false);
    for(const p of elevatedLootAnchors([surface],movement)) expect(surfaceContains(surface,p.x,p.z)).toBe(true);
    walk(movement,[{x:-157,y:0,z:42},{x:-157,y:4,z:30},{x:-160,y:4,z:20},{x:-159,y:12,z:0},{x:-164,y:12,z:-10},{x:-162,y:20,z:-30},{x:-155,y:20,z:-40},{x:-163,y:28,z:-60}]);
    const navigator=createVerticalNavigator({bounds:getRegion('bukit-timah').bounds,obstacles:world.obstacles,surfaces,traversalObstacles:getTraversalObstacles(world.scene)});
    expect(navigator.route({x:-157,y:0,z:42},{x:-163,y:28,z:-60}).length).toBeGreaterThan(1);
  }));
});
