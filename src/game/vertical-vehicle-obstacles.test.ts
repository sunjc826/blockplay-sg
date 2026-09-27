import {expect,it} from 'vitest';
import {verticalVehicleObstacles} from './vertical-vehicle-obstacles';
import {createVerticalMovement} from './vertical-movement';
import {createRegionMovement} from './region-collision';
import type {WalkSurface} from './vertical-routes';
const bounds={minX:-40,maxX:40,minZ:-40,maxZ:40};
const ramp:WalkSurface={id:'ramp',routeId:'hill',minX:0,maxX:20,minZ:-3,maxZ:3,axis:'x',startHeight:0,endHeight:5};
it('blocks cars at ground columns and solid hills without changing infantry climbing',()=>{
 const world={bounds,obstacles:[],surfaces:[{...ramp,solidBelow:true}],traversalObstacles:[{minX:25,maxX:26,minZ:-2,maxZ:2,minY:0,maxY:10}]};
 const obstacles=verticalVehicleObstacles(world), ground=createRegionMovement(bounds);
 expect(ground.move({x:-4,z:0},30,0,1.35,obstacles).x).toBeLessThan(0);
 expect(ground.move({x:22,z:0},8,0,1.35,obstacles).x).toBeLessThan(25);
 expect(createVerticalMovement(world).move({x:-1,y:0,z:0,velocityY:0},19,0,4).y).toBeCloseTo(4.5);
});
it('preserves space beneath high open decks and clips only a ramps low section',()=>{
 const deck={...ramp,id:'deck',startHeight:5,endHeight:5};
 expect(verticalVehicleObstacles({surfaces:[deck],traversalObstacles:[]})).toEqual([]);
 const ascending=verticalVehicleObstacles({surfaces:[ramp],traversalObstacles:[]});
 expect(ascending[0].maxX).toBeCloseTo(11.84);
 const descending=verticalVehicleObstacles({surfaces:[{...ramp,startHeight:5,endHeight:0}],traversalObstacles:[]});
 expect(descending[0].minX).toBeCloseTo(8.16);
 expect(verticalVehicleObstacles({surfaces:[],traversalObstacles:[{minX:0,maxX:10,minZ:0,maxZ:10,minY:4.74,maxY:5}]})).toEqual([]);
});
