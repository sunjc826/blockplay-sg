import { describe, expect, it } from 'vitest';
import { objectiveApproach, objectiveStep, spacedObjectiveStep } from './bot-objectives';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { FPS_WEAPONS } from './fps-rules';

describe('map objectives during player contact', () => {
  it('advances to its assigned site instead of following a distant player', () => {
    const step = objectiveStep({ x: -40, z: 0 }, { x: 0, z: 0 }, { dx: 0, dz: 1 }, 1);
    expect(step).toEqual({ dx: 1, dz: 0 });
    expect(objectiveStep({ x: 0, z: 0 }, { x: 0, z: 0 }, { dx: .1, dz: .1 }, 1)).toEqual({ dx: .1, dz: .1 });
    expect(objectiveStep({ x: 0, z: .99 }, { x: 0, z: 0 }, { dx: 0, dz: .1 }, 1)).toEqual({ dx: 0, dz: 0 });
  });
  it.each([false, true])('keeps map control primary with distracting player fire=%s', harassment => {
    const environment: ArenaEnvironment = { bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
      spawns: [{ x: -45, z: 0 }], playerSpawn: { x: 0, z: 120 }, endless: true, reinforcements: true,
      move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }),
      facilities: { sites: [{ id: 'point', name: 'Objective', kind: 'garage', x: 0, y: 0, z: 0,
        initialOwner: null, deployment: { x: 30, z: 0, yaw: 0 } },
        { id: 'home', name: 'Home post', kind: 'command', x: -50, y: 0, z: -25,
          initialOwner: 'mercenaries', deployment: { x: -50, z: -25, yaw: 0 } }] } };
    const arena = createArena([], 1, 'assault', environment);
    arena.addPlayer('you', 'You', 0, 0, FPS_WEAPONS, undefined, true); arena.setPlayerHealthMultiplier('you', 10);
    for (let i = 0; i < 1100; i++) {
      // This is a map-control observation, not a survival test: settled fire
      // can now kill even a 10x-health stationary observer during the 55 s run.
      arena.setPlayerVitals('you', { health: 1000 });
      if (harassment && i % 5 === 0) {
        const actors = arena.snapshot().actors, bot = actors.find(a => a.id === 'bot-1')!, player = actors.find(a => a.id === 'you')!;
        const horizontal = Math.hypot(bot.x - player.x, bot.z - player.z), flight = horizontal / FPS_WEAPONS[0].ballistics.velocity;
        const ray = { x: bot.x + 2 - player.x, y: bot.y - .62 - player.y + .5 * 9.8 * flight * flight, z: bot.z - player.z };
        const length = Math.hypot(ray.x, ray.y, ray.z);
        arena.shoot('you', player, { x: ray.x / length, y: ray.y / length, z: ray.z / length }, 0);
      }
      arena.step(.05);
    }
    const state = arena.snapshot(), bot = state.actors.find(a => a.bot)!;
    expect(state.facilities!.sites[0].owner, JSON.stringify({ bot, objective: state.facilities!.sites[0] })).toBe('mercenaries');
    // Secured posts now have a perimeter patrol, rather than a permanent worker.
    if (!harassment) expect(Math.hypot(bot.x, bot.z)).toBeLessThan(16);
    // Stray rounds may damage the home post, legitimately creating a repair mission.
    // Neither capture nor repair should become a chase toward the player at z=120.
    expect(bot.z).toBeLessThan(10);
    expect(Math.hypot(bot.x, bot.z - 120)).toBeGreaterThan(100);
    expect(bot.shots).toBeGreaterThan(0);
    expect(bot.health).toBeGreaterThan(0);
    expect(state.actors.find(a => a.id === 'you')!.alive).toBe(true);
  });
});

it('uses distinct bounded flanks, avoids occupied approaches, and falls back for short or blocked journeys',()=>{
  const from={x:0,z:0},goal={x:200,z:0},anchors=[{x:90,z:-45},{x:90,z:45},{x:120,z:45},{x:0,z:100},{x:190,z:40}];
  expect(objectiveApproach(from,goal,anchors,-1,()=>true)).toEqual(anchors[0]);
  expect(objectiveApproach(from,goal,anchors,1,()=>true)).toEqual(anchors[1]);
  expect(objectiveApproach(from,goal,anchors,1,()=>true,[anchors[1]])).toEqual(anchors[2]);
  expect(objectiveApproach(from,goal,anchors,0,()=>true)).toBeUndefined();
  expect(objectiveApproach(from,{x:30,z:0},anchors,1,()=>true)).toBeUndefined();
  expect(objectiveApproach(from,goal,anchors,1,()=>false)).toBeUndefined();
});

it('breaks a single file into lateral spacing without speeding up, reversing, or pushing across floors',()=>{
  const step={dx:1,dz:0};
  const front=spacedObjectiveStep({x:1,z:0},step,[{x:0,z:0}],1,20);
  const rear=spacedObjectiveStep({x:0,z:0},step,[{x:1,z:0}],1,20);
  expect(front.dz*rear.dz).toBeLessThan(0);
  for(const result of [front,rear]) {expect(Math.hypot(result.dx,result.dz)).toBeLessThanOrEqual(1);expect(result.dx).toBeGreaterThan(.8);}
  expect(spacedObjectiveStep({x:0,y:0,z:0},step,[{x:1,y:3,z:0}],1,20)).toEqual(step);
  expect(spacedObjectiveStep({x:0,z:0},step,[{x:1,z:0}],1,2)).toEqual(step);
  expect(spacedObjectiveStep({x:0,z:0},{dx:0,dz:0},[{x:1,z:0}],1,20)).toEqual({dx:0,dz:0});
});

it('walks alternate approaches, secures facilities, and sends most troops out of the home post',()=>{
  const bounds={minX:-160,maxX:160,minZ:-120,maxZ:120};
  const sites=[{id:'home',name:'Home',kind:'command' as const,x:-120,z:0,y:0,initialOwner:'mercenaries' as const,deployment:{x:-120,z:0,yaw:0}},
    ...[-70,70].map((z,i)=>({id:`front-${i}`,name:'Front',kind:'supply' as const,x:70,z,y:0,initialOwner:null,initiallyBuilt:true,deployment:{x:70,z,yaw:0}}))];
  const anchors=[-80,-40,0,40].flatMap(x=>[-80,-40,0,40,80].map(z=>({x,z})));
  const arena=createArena([],12,'assault',{bounds,spawns:[{x:-120,z:0}],endless:true,reinforcements:true,
    navigationAnchors:anchors,facilities:{sites},move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz})},undefined,{bounds,obstacles:[],surfaces:[],traversalObstacles:[]});
  arena.step(.05);
  const start=arena.navigationStatus();
  expect(start.filter(m=>m.via).length).toBeGreaterThanOrEqual(4);
  const via=start.find(m=>m.via)!.via!;
  let passedApproach=false,departed=0;
  for(let i=0;i<2000;i++) {
    arena.step(.05);
    if(i%20===0) {
      const bots=arena.snapshot().actors.filter(a=>a.bot);
      departed=Math.max(departed,bots.filter(a=>Math.hypot(a.x+120,a.z)>30).length);
      passedApproach ||= bots.some(a=>Math.hypot(a.x-via.x,a.z-via.z)<8);
    }
  }
  expect(passedApproach).toBe(true);
  expect(departed).toBe(start.length);
  expect(arena.snapshot().facilities!.sites.filter(s=>s.owner==='mercenaries')).toHaveLength(3);
  // Secured objectives release their workers into the perimeter patrol too.
  expect(arena.snapshot().actors.filter(a=>a.bot&&sites.every(s=>Math.hypot(a.x-s.x,a.z-s.z)>5)).length).toBe(start.length);
  arena.reset();arena.step(.05);
  expect(arena.navigationStatus().filter(m=>m.via).length).toBeGreaterThanOrEqual(4);
});

it('abandons a blocked flank after its deadline while retaining the offensive objective',()=>{
  const arena=createArena([],4,'assault',{bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawns:[{x:-60,z:0}],
    endless:true,reinforcements:true,move:p=>p,navigationAnchors:[{x:0,z:-25}],facilities:{sites:[
      {id:'home',name:'Home',kind:'command',x:-60,z:0,y:0,initialOwner:'mercenaries',deployment:{x:-60,z:0,yaw:0}},
      {id:'front',name:'Front',kind:'supply',x:60,z:0,y:0,initialOwner:null,initiallyBuilt:true,deployment:{x:60,z:0,yaw:0}}]}});
  arena.step(.05);
  expect(arena.navigationStatus().some(m=>m.via)).toBe(true);
  for(let i=0;i<1600;i++)arena.step(.05);
  expect(arena.navigationStatus().every(m=>!m.via&&m.objective==='front')).toBe(true);
});
