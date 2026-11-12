import { expect, it, vi } from 'vitest';
import { REGION_IDS } from './region-ids';
import { FFA_AREAS, validArenaMatch, sameArenaMatch } from './arena-match';
import { buildFreeForAllWorld } from './free-for-all-world';
import { createArena, ARENA_DURATION, ARENA_KILL_LIMIT } from './arena-rules';
import { hostile } from './arena-factions';
import { validArenaSnapshot } from './arena-runtime';
import { createVerticalMovement } from './vertical-movement';
import { createVerticalNavigator } from './vertical-navigation';
import { getPhysicalWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createSceneCover } from './scene-cover';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { createRegionMovement } from './region-collision';
import { shootAndLand } from './arena-test-shots';

it('covers all regions, validates explicit map identities and preserves area-less legacy matches',()=>{
  expect(FFA_AREAS.map(a=>a.region).sort()).toEqual([...REGION_IDS].sort());
  for(const area of FFA_AREAS)expect(validArenaMatch({mode:'free-for-all',area:area.id})).toBe(true);
  for(const area of ['invalid','__proto__','constructor',null,42])expect(validArenaMatch({mode:'free-for-all',area})).toBe(false);
  expect(validArenaMatch({mode:'free-for-all'})).toBe(true);
  expect(sameArenaMatch({mode:'free-for-all',area:'ubin-village'},{mode:'free-for-all',area:'dragon-courtyard'})).toBe(false);
  expect(sameArenaMatch({mode:'free-for-all'},{mode:'free-for-all',area:'marina-gardens'})).toBe(false);
});

it.each(FFA_AREAS)('$name has connected neutral spawns and a complete individual bot match',area=>{
  const w=buildFreeForAllWorld(area.id),clock=vi.spyOn(performance,'now').mockReturnValue(0);
  try {
    w.stamps.forEach(s=>s.visible=false);accelerateInstancedRaycasts(w.scene);
    const terrain={bounds:w.bounds,obstacles:w.obstacles,surfaces:getPhysicalWalkSurfaces(w.scene),traversalObstacles:getTraversalObstacles(w.scene)};
    const move=createVerticalMovement(terrain),nav=createVerticalNavigator(terrain,w.environment.navigationAnchors),cover=createSceneCover(w.scene);
    expect(w.scene.getObjectByName('Arena barricades')).toBeDefined();
    for(const p of area.spawns){
      const y=w.bounds.groundHeight?.(p.x,p.z)??0;
      expect(move.canOccupy(p.x,y,p.z,.5,1.8),`spawn ${p.x},${p.z}`).toBe(true);
      for(const goal of area.patrols.slice(0,3))expect(nav.route({...p,y},{...goal,y:w.bounds.groundHeight?.(goal.x,goal.z)??0}).length,`${p.x},${p.z} to ${goal.x},${goal.z}`).toBeGreaterThan(0);
    }
    const a=createArena(w.obstacles,6,'mixed',w.environment,undefined,terrain,cover.distance,undefined,cover.sightDistance);
    let snapshot=a.snapshot();expect(snapshot.actors).toHaveLength(6);
    for(const actor of snapshot.actors){
      expect(actor.alive).toBe(true);expect(actor.shield).toBeGreaterThan(0);expect(actor.team).toBeUndefined();
      for(const other of snapshot.actors)if(actor.id!==other.id){expect(hostile(actor,other)).toBe(true);expect(Math.hypot(actor.x-other.x,actor.z-other.z)).toBeGreaterThan(12);}
    }
    let respawned=false;const dead=new Set<string>();
    for(let i=0;i<3600&&!snapshot.finished;i++){
      a.step(.05);snapshot=a.snapshot();
      for(const actor of snapshot.actors){if(!actor.alive)dead.add(actor.id);else if(dead.has(actor.id))respawned=true;}
      if(i%200===0)expect(validArenaSnapshot(snapshot,w.environment)).toBe(true);
    }
    expect(snapshot.finished).toBe(true);expect(snapshot.elapsed<=ARENA_DURATION).toBe(true);
    expect(snapshot.actors.every(a=>a.shots>0)).toBe(true);
    expect(snapshot.actors.filter(a=>a.kills>0).length).toBeGreaterThanOrEqual(2);
    expect(respawned).toBe(true);
    expect(snapshot.freeForAll?.area).toBe(area.id);
    expect(snapshot.actors.every(a=>a.kills<=ARENA_KILL_LIMIT)).toBe(true);
    for(const key of ['teamDeathmatch','hardpoint','facilities','vehicles','transports','heat','reinforcementClocks','proxies'])expect(snapshot).not.toHaveProperty(key);
    expect(validArenaSnapshot({...snapshot,freeForAll:{area:'invalid'}},w.environment)).toBe(false);
    expect(validArenaSnapshot({...snapshot,actors:snapshot.actors.map(a=>({...a,freeForAll:undefined}))},w.environment)).toBe(false);
    a.reset();expect(a.snapshot()).toMatchObject({elapsed:0,finished:false,freeForAll:{area:area.id}});
    expect(a.snapshot().actors.every(a=>a.alive&&a.kills===0&&a.deaths===0&&a.freeForAll)).toBe(true);
    for(let i=0;i<4;i++)a.addPlayer(`human-${i}`,`Human ${i}`);
    const crowded=a.snapshot().actors;expect(crowded).toHaveLength(10);
    for(const actor of crowded){expect(actor.alive).toBe(true);for(const other of crowded)if(actor.id!==other.id)expect(Math.hypot(actor.x-other.x,actor.z-other.z)).toBeGreaterThan(12);}
  }finally{clock.mockRestore();w.dispose();}
},60000);

it('protects respawns, scores individual eliminations and supports the existing bot controls',()=>{
  const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100},area={...FFA_AREAS[0],bounds,spawns:[{x:-60,z:0},{x:60,z:0},{x:0,z:60},{x:0,z:-60}]};
  const environment={bounds,move:createRegionMovement(bounds).move,spawns:area.spawns,freeForAll:area};
  const a=createArena([],0,'mixed',environment);
  a.addPlayer('one','One',0,0,[{damage:500,interval:.1,capacity:100,reload:.5}]);a.addPlayer('two','Two');
  const fire=()=>{const [one,two]=['one','two'].map(id=>a.snapshot().actors.find(a=>a.id===id)!);const dx=two.x-one.x,dy=two.y-.6-one.y,dz=two.z-one.z,d=Math.hypot(dx,dy,dz);return shootAndLand(a,'one',one,{x:dx/d,y:dy/d,z:dz/d},0);};
  expect(fire().damage).toBe(0);
  for(let i=0;i<65;i++)a.step(.05);
  expect(fire().killed).toBe(true);expect(a.snapshot().actors.find(a=>a.id==='one')?.kills).toBe(1);
  a.reset();expect(a.configureBots(2,'mixed')).toBe(true);expect(a.snapshot().actors.filter(a=>a.bot)).toHaveLength(2);
  a.step(.05);expect(a.configureBots(3,'mixed')).toBe(false);
});

it('waits rather than respawning into blocked cover, then retries safely',()=>{
  const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100},area={...FFA_AREAS[0],bounds,spawns:[{x:-60,z:0},{x:60,z:0}]};
  const block={minX:-1,maxX:1,minZ:-1,maxZ:1,maxY:4};
  const a=createArena([block],0,'mixed',{bounds,move:createRegionMovement(bounds).move,spawns:area.spawns,freeForAll:area});
  a.addPlayer('one','One');Object.assign(block,bounds);a.setPlayerVitals('one',{health:0});
  for(let i=0;i<100;i++)a.step(.05);
  expect(a.snapshot().actors[0]).toMatchObject({alive:false,kills:0,deaths:0});
  Object.assign(block,{minX:-1,maxX:1,minZ:-1,maxZ:1});for(let i=0;i<12;i++)a.step(.05);
  expect(a.snapshot().actors[0].alive).toBe(true);expect(a.snapshot().actors[0].shield).toBeGreaterThan(0);
});
