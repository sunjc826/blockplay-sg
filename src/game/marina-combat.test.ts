import { marinaPoint } from './marina-layout';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildMarinaScene } from './marina-scene';
import { canOccupy, moveInMarina } from './marina-collision';
import { MARINA_GARDEN_WALLS, MARINA_GARDEN_PAVILIONS, MARINA_COMBAT_BOUNDS } from './marina-combat';
import { createSceneCover } from './scene-cover';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { createFacilities, type FacilitySite } from './facilities';
import { assignBattlefieldFronts } from './battlefield';
import { createSectorPatrols } from './sector-patrols';
import { buildDistrictWorld } from './district-world';
import { districtDeploymentPoints } from './expedition-deployment';

let world: ReturnType<typeof buildMarinaScene>;
beforeAll(()=>{world=buildMarinaScene();accelerateInstancedRaycasts(world.scene);world.scene.updateMatrixWorld(true);});
afterAll(()=>world.dispose());
it('uses actual solid screens to interrupt standing sight and bullets, and low cover that can be fired over',()=>{
  const cover=createSceneCover(world.scene);
  for(const wall of MARINA_GARDEN_WALLS){
    const alongZ=wall.depth>wall.width;
    const from={x:wall.x-(alongZ?4:0),y:1.75,z:wall.z-(alongZ?0:4)},ray={x:alongZ?1:0,y:0,z:alongZ?0:1};
    if(wall.height>1.75){expect(cover.distance(from,ray,6)).toBeLessThan(4);expect(cover.sightDistance(from,ray,6)).toBeLessThan(4);}
    else{expect(cover.distance(from,ray,5)).toBe(5);expect(cover.distance({...from,y:.8},ray,5)).toBeLessThan(4);}
    expect(canOccupy(wall.x,wall.z,.4,world.obstacles)).toBe(false);
  }
});
it('keeps both pavilion entrances open and short north/south infantry routes connected',()=>{
  for(const {x,z} of MARINA_GARDEN_PAVILIONS){
    // The counter occupies the middle; pass either side through both openings.
    const start={x:x+2.5,z:z-3},end=moveInMarina(start,0,6,.4,world.obstacles);
    expect(end.x).toBeCloseTo(start.x);expect(end.z).toBeCloseTo(z+3);
  }
  for(const x of [-90,-42,33,95,160]){
    const p=moveInMarina(marinaPoint({x,z:104}),0,49*.6,.4,world.obstacles);
    expect(p.z).toBeCloseTo(153*.6);
  }
});
it('uses the compact district for deployments and patrols on three landmark approaches',()=>{
  const district=buildDistrictWorld('marina-bay');
  try{
    expect(district.environment.patrolSectors).toHaveLength(3);
    const points=districtDeploymentPoints('marina-bay',(x,z)=>canOccupy(x,z,.5,world.obstacles));
    expect(points.length).toBeGreaterThanOrEqual(3);
    for(const p of points){expect(p.x).toBeGreaterThanOrEqual(MARINA_COMBAT_BOUNDS.minX);expect(p.x).toBeLessThanOrEqual(MARINA_COMBAT_BOUNDS.maxX);expect(p.z).toBeGreaterThanOrEqual(MARINA_COMBAT_BOUNDS.minZ);expect(p.z).toBeLessThanOrEqual(MARINA_COMBAT_BOUNDS.maxZ);}
  }finally{district.dispose();}
});
const sites:FacilitySite[]=[
  {id:'home',name:'Home',kind:'command',x:-100,z:0,y:0,initialOwner:'armed-forces',deployment:{x:-100,z:0,yaw:0}},
  {id:'enemy',name:'Enemy',kind:'command',x:100,z:0,y:0,initialOwner:'mercenaries',deployment:{x:100,z:0,yaw:0}},
  ...[0,45,-45].map((z,i):FacilitySite=>({id:`front-${i}`,name:'Garden',kind:'command',x:0,z,y:0,initialOwner:null,initiallyBuilt:true,combatFocus:i?'secondary':'primary',deployment:{x:0,z,yaw:0}})),
];
it('converges opposing squads on the same local objectives, then holds the courts instead of overwhelming the opposing staging camp',()=>{
  const facilities=createFacilities(sites);
  const squads=['armed-forces','mercenaries'].flatMap(f=>Array.from({length:8},(_,i)=>({id:`${f}-${i}`,faction:f as 'armed-forces'|'mercenaries',x:f==='armed-forces'?-90:90,z:0,members:4})));
  const assignments=assignBattlefieldFronts(squads,facilities.sites);
  for(const faction of ['armed-forces','mercenaries']){
    const side=squads.filter(s=>s.faction===faction).map(s=>assignments.get(s.id));
    expect(side.filter(s=>s==='front-0').length).toBeGreaterThanOrEqual(3);
    expect(side.filter(s=>s?.startsWith('front-')).length).toBe(7);
  }
  facilities.sites.slice(2).forEach(s=>s.owner='armed-forces');
  const advanced=assignBattlefieldFronts(squads,facilities.sites);
  expect(squads.filter(s=>s.faction==='armed-forces'&&advanced.get(s.id)?.startsWith('front-'))).toHaveLength(7);
  expect(squads.some(s=>s.faction==='armed-forces'&&advanced.get(s.id)==='enemy')).toBe(false);
});
it('reserves no more than a fifth of a focused force for patrol/guard duties',()=>{
  const patrols=createSectorPatrols([{id:'garden',name:'Garden',bounds:{minX:-120,maxX:120,minZ:-60,maxZ:60},anchors:[{x:-90,z:0},{x:90,z:0}]}],[],()=>true);
  const facilities=createFacilities(sites);
  for(const count of [3,5,10]){
    const squads=Array.from({length:count},(_,i)=>({id:`s-${i}`,faction:'armed-forces' as const,x:-90,z:0,members:4}));
    const duties=patrols.allocate(squads,facilities.sites,0);
    expect(duties.size*4).toBeLessThanOrEqual(count*4*.2);
    expect(duties.size).toBeLessThanOrEqual(1);
  }
});
