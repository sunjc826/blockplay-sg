import { beforeAll, afterAll, expect, it } from 'vitest';
import { buildDistrictWorld } from './district-world';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createVerticalMovement } from './vertical-movement';
import { createVerticalNavigator } from './vertical-navigation';
import { MARINA_LANDMARK_PLACES, MARINA_LANDMARK_OBJECTIVES, MARINA_LIFTS } from './marina-landmarks';
let world:ReturnType<typeof buildDistrictWorld>, movement:ReturnType<typeof createVerticalMovement>, nav:ReturnType<typeof createVerticalNavigator>;
beforeAll(()=>{world=buildDistrictWorld('marina-bay');const config={bounds:world.bounds,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene),lifts:MARINA_LIFTS};movement=createVerticalMovement(config);nav=createVerticalNavigator(config);});
afterAll(()=>world.dispose());
it.each(MARINA_LANDMARK_PLACES.flatMap(p=>p.connections.map(c=>({name:`${p.id}/${c.id}`,c}))))('$name permits a full-height player in both directions',({c})=>{
 for(const [a,b] of [[c.from,c.to],[c.to,c.from]]) {
  let state={...a,velocityY:0};const count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1),dx=(b.x-a.x)/count,dz=(b.z-a.z)/count;
  for(let i=0;i<count;i++)state=movement.move(state,dx,dz,.025,.4,1.8);
  expect(state.x).toBeCloseTo(b.x,1);expect(state.z).toBeCloseTo(b.z,1);expect(state.y).toBeCloseTo(b.y,1);
 }
});
it.each(MARINA_LANDMARK_OBJECTIVES)('$name has a real navigable route from ground level',site=>{
 const starts=site.id.includes('skypark')?MARINA_LIFTS.map(l=>({x:l.x,y:0,z:l.z-7})):site.id.includes('flyer')?[{x:180,y:0,z:-171}]:[{x:179.2,y:0,z:5},{x:178,y:0,z:65.6}];
 expect(movement.canOccupy(site.x,site.y,site.z,.4,1.8)).toBe(true);
 for(const start of starts) {
  const route=nav.route(start,site);expect(route.length).toBeGreaterThan(1);
  let state={...start,velocityY:0};
  for(const to of route){
    if(Math.hypot(to.x-state.x,to.z-state.z)<.05 && Math.abs(to.y-state.y)>5){expect(MARINA_LIFTS.some(l=>l.x===to.x&&l.z===to.z)).toBe(true);state={...to,velocityY:0};continue;}
    const count=Math.max(1,Math.ceil(Math.hypot(to.x-state.x,to.z-state.z)/.1)),dx=(to.x-state.x)/count,dz=(to.z-state.z)/count;for(let i=0;i<count;i++)state=movement.move(state,dx,dz,.025,.4,1.8);}
  expect(state.x).toBeCloseTo(site.x,1);expect(state.z).toBeCloseTo(site.z,1);expect(state.y).toBeCloseTo(site.y,1);
 }
},30000);
