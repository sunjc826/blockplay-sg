import { REGION_IDS } from './regions';
import ARENA_CATALOG from './arena-catalog.json';
import { expect, it, vi } from 'vitest';
import { HARDPOINT_ARENAS, controlGoal, HARDPOINT_RULES } from './hardpoint';
import { buildHardpointWorld } from './hardpoint-world';
import { createVerticalMovement } from './vertical-movement';
import { createVerticalNavigator } from './vertical-navigation';
import { getPhysicalWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createArena } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { createSceneCover } from './scene-cover';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { ARENA_TEAMS, TDM_AREAS, validArenaMatch } from './arena-match';

it('covers every Singapore region exactly once in both modes and the room catalog',()=>{
  expect(TDM_AREAS.map(a=>a.region).sort()).toEqual([...REGION_IDS].sort());
  expect(HARDPOINT_ARENAS.map(a=>a.area.region).sort()).toEqual([...REGION_IDS].sort());
  expect(TDM_AREAS.map(a=>a.id).sort()).toEqual(Object.keys(ARENA_CATALOG).sort());
  for(const a of TDM_AREAS)expect(ARENA_CATALOG[a.id]).toEqual({name:a.name,region:a.region,hardpoint:true});
});

it.each(HARDPOINT_ARENAS.slice(1))('$area.name has clear objectives and connected, safe spawns',({area,sites,layout})=>{
  const w=buildHardpointWorld(area.id);
  try {
    const terrain={bounds:w.bounds,obstacles:w.obstacles,surfaces:getPhysicalWalkSurfaces(w.scene),traversalObstacles:getTraversalObstacles(w.scene)};
    const move=createVerticalMovement(terrain),nav=createVerticalNavigator(terrain,w.environment.navigationAnchors);
    accelerateInstancedRaycasts(w.scene);const cover=createSceneCover(w.scene);
    for(const block of area.cover??[]) {
      const ground=w.bounds.groundHeight?.(block.x,block.z)??0;
      expect(move.canOccupy(block.x,ground,block.z,.5,1.8)).toBe(false);
      expect(cover.distance({x:block.x,y:ground+1.75,z:block.z-block.depth/2-2},{x:0,y:0,z:1},4)).toBeLessThanOrEqual(2.01);
    }
    for(const site of sites) {
      for(const radius of [0,2,4])for(let i=0;i<16;i++) {
        const x=site.x+Math.cos(i*Math.PI/8)*radius,z=site.z+Math.sin(i*Math.PI/8)*radius;
        expect(move.canOccupy(x,site.y,z,.5,1.8),`${site.id} circle ${x},${z}`).toBe(true);
      }
      for(const team of ARENA_TEAMS) {
        const safe=area.spawns[team].filter(p=>sites.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>=s.radius+HARDPOINT_RULES.spawnClearance));
        expect(safe.length,`${team} safe spawn choices`).toBeGreaterThanOrEqual(4);
        for(const p of safe) {
          const y=w.bounds.groundHeight?.(p.x,p.z)??0;
          expect(move.canOccupy(p.x,y,p.z,.5,1.8),`${team} spawn ${p.x},${p.z}`).toBe(true);
          for(let slot=0;slot<4;slot++)expect(nav.route({...p,y},{...controlGoal(site,slot),y:site.y}).length,`${team} spawn ${p.x},${p.z} to ${site.id}/${slot}`).toBeGreaterThan(0);
        }
      }
      for(const side of [-1,1])expect(nav.route({x:site.x+(site.id==='gantry'?0:side*7),y:site.y,z:site.z+(site.id==='gantry'?side*9:0)},{...site}).length,`${site.id} approach ${side}`).toBeGreaterThan(0);
    }
    for(const station of layout.structures) {
      expect(move.canOccupy(station.x,station.y,station.z,.5,1.8),station.id).toBe(false);
      expect(w.bounds.groundHeight?.(station.x,station.z)??0,station.id+' grounded').toBeCloseTo(station.y);
    }
    expect(validArenaMatch({mode:'hardpoint',area:area.id})).toBe(true);
  }finally{w.dispose();}
});

it.each(HARDPOINT_ARENAS.slice(1))('$area.name bots contest every rotation and replicate the correct map',({area,sites})=>{
  const w=buildHardpointWorld(area.id);
  // A fast-forwarded simulation must not depend on CPU contention consuming the
  // live six-millisecond navigation allowance; retain its bounded work count.
  const clock=vi.spyOn(performance,'now').mockReturnValue(0);
  try {
    w.stamps.forEach(s=>s.visible=false);accelerateInstancedRaycasts(w.scene);
    const terrain={bounds:w.bounds,obstacles:w.obstacles,surfaces:getPhysicalWalkSurfaces(w.scene),traversalObstacles:getTraversalObstacles(w.scene)},cover=createSceneCover(w.scene);
    const arena=createArena(w.obstacles,0,'mixed',w.environment,undefined,terrain,cover.distance,undefined,cover.sightDistance);
    const scored=new Set<string>(),teams=new Set<string>();
    let snapshot=arena.snapshot();
    for(let i=0;i<7200&&!snapshot.finished;i++) {
      arena.step(.05);snapshot=arena.snapshot();
      const hp=snapshot.hardpoint!;
      if(hp.owner){scored.add(hp.active);teams.add(hp.owner);}
      if(i%200===0)expect(validArenaSnapshot(snapshot,w.environment)).toBe(true);
    }
    expect([...scored].sort()).toEqual(sites.map(s=>s.id).sort());
    expect(teams.size).toBe(2);
    expect(snapshot.finished).toBe(true);
    expect(snapshot.actors.every(a=>a.shots>0)).toBe(true);
    expect(snapshot.hardpoint?.area).toBe(area.id);
    const other=HARDPOINT_ARENAS.find(config=>config.area.id!==area.id)!;
    expect(validArenaSnapshot({...snapshot,hardpoint:{...snapshot.hardpoint!,area:other.area.id}},w.environment)).toBe(false);
    arena.reset();expect(arena.snapshot().hardpoint).toMatchObject({area:area.id,active:sites[0].id,scores:{alpha:0,bravo:0}});
  }finally{clock.mockRestore();w.dispose();}
},60000);
