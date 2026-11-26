import {expect,it} from 'vitest';
import {DETAIL_CHARS, SECTOR_CHARS, learnedMap} from './learned-map';
import {REGION_IDS,type RegionId} from '../src/game/region-ids';
import {borderingSectors,sectorAt,zoneSectors} from '../src/game/zone-sectors';
import type {FamiliarityLevel} from '../src/game/streamer-familiarity';

function visit(regionId:RegionId,id:string,level:FamiliarityLevel) {
  const sectors=zoneSectors(regionId), sector=sectors.find(s => s.id === id)!;
  const position=sector.anchors.find(p => sectorAt(regionId,p.x,p.z)?.id === id)!;
  return {regionId,mode:'expedition' as const,hud:{},notes:[] as string[],observation:{position},familiarity:{[id]:level}};
}
it('unlocks first-visit landmarks and supplies before learned cover and crossing routes',()=>{
  const first=visit('pulau-ubin','village','heard of');
  expect(learnedMap(first).choices.size).toBe(0);
  const seen=learnedMap(visit('pulau-ubin','village','been through'));
  expect(seen.text).toMatch(/Food pickup counter|kaya toast/);
  expect(seen.text).not.toMatch(/barricade|Road across/);
  const known=learnedMap(visit('pulau-ubin','village','knows well'));
  expect(known.text).toMatch(/barricade|Road across/);
  expect([...known.choices.values()].every(p => p.sectorId === 'village')).toBe(true);
  expect(learnedMap({...first,mode:'tutorial'}).text).toBe('');
  expect(learnedMap({...first,mode:'range',familiarity:{village:'knows well'}}).text).not.toMatch(/stallholder|Food pickup counter|post console/);
});

it('includes a distant destination, omits other learned sectors, and never fabricates detail in gaps',()=>{
  const t=visit('queenstown','community-court','knows well'), sectors=zoneSectors(t.regionId);
  t.familiarity=Object.fromEntries(sectors.map(s=>[s.id,'knows well']));
  const here=sectors.find(s=>s.id==='community-court')!, remote=sectors.filter(s=>!borderingSectors(s,here));
  const before=learnedMap(t), after=learnedMap({...t,destinationSector:remote[0].id});
  expect(before.text).not.toContain(remote[0].name+' (knows well)');
  expect(after.text).toContain(remote[0].name+' (knows well, destination)');
  for (const p of after.choices.values()) {
    const s=sectors.find(s=>s.id===p.sectorId)!;
    expect(s===remote[0] || borderingSectors(s,here)).toBe(true);
  }
  expect(learnedMap({...t,observation:{position:{x:9999,z:9999}}}).choices.size).toBe(0);
});
it('marks only the counter actually emptied, and keeps its destination ID on a later visit',()=>{
  const t=visit('pulau-ubin','village','been through');
  const pos=zoneSectors(t.regionId).find(s=>s.id==='village')!.foodAnchors![0];
  t.observation.position=pos;
  const before=learnedMap(t);
  const id=[...before.choices.values()].find(p=>p.name==='Food pickup counter' && p.x===pos.x && p.z===pos.z)!.id;
  const after=learnedMap({...t,notes:['Emptied this session [food-village-1]']});
  expect(after.text).toContain('emptied this session ['+id+']');
  expect(after.text.match(/emptied this session/g)).toHaveLength(1);
});
it.each(REGION_IDS)('bounds every %s row and exposes exactly the printed place IDs', region=>{
  const sectors=zoneSectors(region);
  for (const s of sectors) {
    const t=visit(region,s.id,'knows well');
    if (!t.observation.position) continue;
    t.familiarity=Object.fromEntries(sectors.map(s=>[s.id,'knows well']));
    const {text,choices}=learnedMap(t);
    expect(text.length).toBeLessThanOrEqual(DETAIL_CHARS);
    expect(text.split('\n').every(row=>row.length<=SECTOR_CHARS)).toBe(true);
    expect([...text.matchAll(/\[(p-[a-z0-9]+)\]/g)].map(m=>m[1])).toEqual([...choices.keys()]);
    expect(text).not.toMatch(/"x":|"z":|enemy-post|botWeight/);
  }
});

it('keeps hardpoint destinations inside the active arena and exclusive to the matching mode',()=>{
  const t=visit('chinatown','smith-street','been through');
  const hill={mode:'hardpoint' as const,rank:1,kills:0,deaths:0,assists:0};
  const arena={...t,mode:'arena' as const,arenaArea:'smith-street',hud:{match:hill}};
  const detail=learnedMap(arena);
  expect(detail.text).toContain('control point');
  expect(learnedMap({...arena,hud:{}}).text).not.toContain('control point');
  for (const p of detail.choices.values()) {
    expect(p.x).toBeGreaterThanOrEqual(-65); expect(p.x).toBeLessThanOrEqual(45);
    expect(p.z).toBeGreaterThanOrEqual(42); expect(p.z).toBeLessThanOrEqual(124);
  }
});

it('lets the controller reach the real Changi range chest with no visible supply waypoint',async()=>{
  const {buildDistrictWorld}=await import('../src/game/district-world');
  const {getFpsDistrict}=await import('../src/game/fps-districts');
  const {rangeResupplyObstacle}=await import('../src/game/range-resupply');
  const {createRegionMovement}=await import('../src/game/region-collision');
  const {placeTravelPoint}=await import('../src/game/pilot-sector');
  const {streamerPilotStrategy}=await import('../src/game/streamer-strategy');
  const {createStrategyPlanner}=await import('../src/game/pilot-strategy');
  const {createPlayerPilot}=await import('../src/game/fps-pilot');
  const regionId='changi', district=getFpsDistrict(regionId), world=buildDistrictWorld(regionId);
  try {
    // Start further down the practice firing lane, with a full reserve so the
    // ordinary pilot sensor supplies no return-to-ammo waypoint.
    const start={x:district.spawn.x,z:district.spawn.z-8};
    const sector=sectorAt(regionId,start.x,start.z)!;
    const t={...visit(regionId,sector.id,'been through'),mode:'range' as const,observation:{position:start}};
    const place=[...learnedMap(t).choices.values()].find(p=>p.name.includes('range chest'))!;
    expect(place).toBeTruthy();
    const obstacles=[...world.obstacles,rangeResupplyObstacle({...place,yaw:Math.atan2(place.x-district.spawn.x,place.z-district.spawn.z)},0)];
    const movement=createRegionMovement(world.bounds);
    let clock=0;
    const strategy=streamerPilotStrategy(async()=>({goal:'travel',waypointId:null,placeId:place.id,place,line:null}),()=>{},[sector.id]);
    const planner=createStrategyPlanner(strategy,()=>clock,{sectors:[sector],point:()=>null,
      placePoint:target=>placeTravelPoint(target,world.bounds,p=>movement.canOccupy(p.x,p.z,.38,obstacles) ? 0 : null)});
    const pilot=createPlayerPilot(planner);
    const o={time:0,position:start,yaw:0,pitch:0,health:100,maxHealth:100,armor:0,reloading:false,aiming:false,
      magazine:30,reserve:120,weapon:0,alive:true,contacts:[],waypoints:[],lootPrompt:'',travelPrompt:'',ballistics:{velocity:300,drop:0}};
    pilot.decide(o);
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(planner.status()).toContain('range chest');
    for (let step=0;step<100 && planner.preferredSector?.();step++) {
      clock+=100; o.time=clock/1000;
      const {action}=pilot.decide(o);
      o.yaw-=(action.lookX ?? 0)*.0023;
      if (action.forward) o.position=movement.move(o.position,-Math.sin(o.yaw)*.35,-Math.cos(o.yaw)*.35,.38,obstacles);
    }
    expect(planner.preferredSector?.()).toBeNull();
    expect(Math.hypot(place.x-o.position.x,place.z-o.position.z)).toBeLessThan(2.8);
  } finally { world.dispose(); }
});
