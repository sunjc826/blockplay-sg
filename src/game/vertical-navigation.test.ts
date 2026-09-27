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

it('arena bots follow the stair route to an elevated opponent', async()=>{
 const {createArena}=await import('./arena-rules'), {createRegionMovement}=await import('./region-collision');
 const arena=createArena([],1,'mixed',{bounds:world.bounds,move:createRegionMovement(world.bounds).move,spawns:[{x:18,z:10}],playerSpawn:{x:20,z:0}},undefined,world);
 arena.addPlayer('upstairs','Upstairs',0,0,undefined,undefined,true);
 let highest=0;
 for(let i=0;i<600;i++){
   arena.step(.05);
   arena.setPlayerVitals('upstairs',{health:100});
   arena.setInput('upstairs',{x:20,y:4.75,z:0,yaw:0,pitch:0,weapon:0,playing:true});
   highest=Math.max(highest,arena.snapshot().actors.find(a=>a.bot)!.y);
 }
 expect(highest).toBeGreaterThan(4.6);
});
