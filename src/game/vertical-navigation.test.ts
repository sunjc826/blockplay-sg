import { expect, it } from 'vitest';
import { createVerticalNavigator, elevatedLootAnchors } from './vertical-navigation';
import { createVerticalMovement, type VerticalWorld } from './vertical-movement';
import type { WalkSurface } from './vertical-routes';
const ramp:WalkSurface={id:'stairs',routeId:'hall',minX:0,maxX:12,minZ:-2,maxZ:2,axis:'x',startHeight:0,endHeight:3};
const floor:WalkSurface={...ramp,id:'hall/floor',minX:12,maxX:24,minZ:-6,maxZ:6,startHeight:3,endHeight:3};
const world:VerticalWorld={bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},surfaces:[ramp,floor],obstacles:[],traversalObstacles:[]};
it('finds a real stair approach from beside an upper floor, then walks its route without teleportation',()=>{
 const nav=createVerticalNavigator(world), move=createVerticalMovement(world), start={x:18,y:0,z:10}, goal={x:20,y:3,z:0};
 const route=nav.route(start,goal);expect(route.length).toBeGreaterThan(1);expect(route.some(p=>p.x<=0.1)).toBe(true);
 let p={...start,velocityY:0};for(const to of route){const n=Math.ceil(Math.hypot(to.x-p.x,to.z-p.z)/.1),dx=(to.x-p.x)/n,dz=(to.z-p.z)/n;for(let i=0;i<n;i++)p=move.move(p,dx,dz,.025,.4,1.8);}
 expect(p.x).toBeCloseTo(goal.x);expect(p.y).toBeCloseTo(goal.y);expect(p.z).toBeCloseTo(goal.z);
 const back=nav.route(goal,start);expect(back.some(p=>p.y===0)).toBe(true);
});
it('does not invent a route through a sealed stair entrance',()=>{
 const blocked={...world,traversalObstacles:[{minX:-.6,maxX:.6,minZ:-3,maxZ:3,minY:0,maxY:5}]};
 expect(createVerticalNavigator(blocked).route({x:-8,y:0,z:0},{x:20,y:3,z:0})).toEqual([]);
});
it('excludes narrow connections and blocked crate positions',()=>{
 const anchors=elevatedLootAnchors(world.surfaces,createVerticalMovement(world));expect(anchors.length).toBe(9);expect(anchors.every(p=>p.x>12&&p.y===3)).toBe(true);
});

it('routes ground troops around a parked vehicle while keeping the cached ground graph usable',()=>{
 const ground={bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},obstacles:[],surfaces:[],traversalObstacles:[]};
 const anchors=[{x:-20,z:0},{x:20,z:0},...[-7,7].flatMap(x=>[-7,7].map(z=>({x,z})))];
 const navigator=createVerticalNavigator(ground,anchors),blocker={minX:-3,maxX:3,minZ:-4,maxZ:4,maxY:3};
 const search=navigator.plan({x:-20,y:0,z:0},{x:20,y:0,z:0},undefined,[blocker]);
 let result=search.next();while(!result.done)result=search.next();
 expect(result.value.some(p=>Math.abs(p.z)>4.4)).toBe(true);
 const movement=createVerticalMovement(ground);let state={x:-20,y:0,z:0,velocityY:0};
 for(const to of result.value){const next=movement.move(state,to.x-state.x,to.z-state.z,0,.4,1.8,[blocker]);expect(Math.hypot(next.x-to.x,next.z-to.z)).toBeLessThan(.12);expect(movement.canOccupy(next.x,next.y,next.z,.4,1.8,[blocker])).toBe(true);state=next;}
 expect(navigator.route({x:-20,y:0,z:0},{x:20,y:0,z:0})).toEqual([{x:20,y:0,z:0}]);
});

it('arena bots follow the stair route to an elevated opponent', async()=>{
 const {createArena}=await import('./arena-rules'), {createRegionMovement}=await import('./region-collision');
 // The exposed deck edge gives the bot a sighting to investigate; a hidden
 // player behind the floor is intentionally unknown to the spotting system.
 const arena=createArena([],1,'mixed',{bounds:world.bounds,move:createRegionMovement(world.bounds).move,spawns:[{x:18,z:10}],playerSpawn:{x:20,z:5.5}},undefined,world);
 arena.addPlayer('upstairs','Upstairs',0,0,undefined,undefined,true);
 let highest=0;
 for(let i=0;i<600;i++){
   arena.step(.05);
   arena.setPlayerVitals('upstairs',{health:100});
   arena.setInput('upstairs',{x:20,y:4.75,z:5.5,yaw:0,pitch:0,weapon:0,playing:true});
   highest=Math.max(highest,arena.snapshot().actors.find(a=>a.bot)!.y);
 }
 expect(highest).toBeGreaterThan(4.6);
});
