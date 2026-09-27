import {expect,it} from 'vitest';
import {buildOrchardScene,ORCHARD_VERTICAL_PLACES,ORCHARD_BOUNDS} from './orchard-scene';
import {createVerticalNavigator} from './vertical-navigation';
import {getWalkSurfaces,getTraversalObstacles} from './vertical-routes';
it('navigates the Orchard retail levels',()=>{
 const world=buildOrchardScene();try{
 const nav=createVerticalNavigator({...world,bounds:ORCHARD_BOUNDS,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)});
 const stair=ORCHARD_VERTICAL_PLACES[0].connections[0];const path=nav.route(stair.from,{x:-115,y:10,z:-94});
 expect(path.length).toBeGreaterThan(2);
 }finally{world.dispose();}
},20000);

it('places supplies on valid upper floors across every district while preserving sector rolls',async()=>{
 const {REGIONS}=await import('./regions');
 const {zoneSectors}=await import('./zone-sectors');
 const {getWorldZone}=await import('./world-zones');
 const {createExpeditionLoot}=await import('./expedition-loot');
 const {createVerticalMovement}=await import('./vertical-movement');
 const {elevatedLootAnchors}=await import('./vertical-navigation');
 for(const region of REGIONS){const world=region.build();try{
  const movement=createVerticalMovement({...world,bounds:region.bounds,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)});
  const anchors=elevatedLootAnchors(getWalkSurfaces(world.scene),movement), zone=getWorldZone(region.id);
  const geometry={id:region.id,spawn:zone.spawn,bounds:region.bounds,obstacles:world.obstacles,canStand:(x:number,z:number,r:number)=>movement.canOccupy(x,0,z,r,1.8),sectors:zoneSectors(region.id),anchors:zone.encounterSpawns};
  let upstairs=0;
  for(let seed=0;seed<8;seed++){
   const original=createExpeditionLoot(seed).enterZone(geometry),raised=createExpeditionLoot(seed).enterZone({...geometry,elevatedAnchors:anchors});
   expect(raised.map(({x,y,z,...content})=>content),region.id).toEqual(original.map(({x,y,z,...content})=>content));
   for(const item of raised)if((item.y??0)>0){upstairs++;expect(movement.canOccupy(item.x,item.y!,item.z,.65,1.8),item.id).toBe(true);}
  }
  expect.soft(upstairs,`${region.id}: supplies appear on usable floors`).toBeGreaterThan(0);
 }finally{world.dispose();}}
},20000);
