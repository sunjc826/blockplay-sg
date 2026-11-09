import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createMerlionController,MERLION,merlionMouth,merlionDirection,inMerlionMist,mistBetween,validMerlionState,type WaterActor} from './merlion-gameplay';
import {arenaConditionModifiers,advanceGrenadeConditions,validGrenadeConditions} from './grenade-effects';
import {createArena,type ArenaEnvironment} from './arena-rules';
import {createArenaRuntime,validArenaInput,validArenaSnapshot} from './arena-runtime';
import type {LanSession} from './lan-peer';
import {buildMarinaScene} from './marina-scene';
import {getWalkSurfaces,getTraversalObstacles} from './vertical-routes';
import {MARINA_BOUNDS,moveInMarina} from './marina-collision';
import {MARINA_WATER} from './marina-water';
import {createSceneCover} from './scene-cover';

const operator=():WaterActor=>({id:'p',alive:true,bot:false,x:0,y:1.75,z:-8.5,yaw:-Math.PI/2,pitch:-.06});
const clear=(_a:unknown,_b:unknown,r:number)=>r;
describe('Merlion shared controls',()=>{
  it('clips sustained cannon exposure at rendered cover and requires the eye to actually intersect the stream',()=>{
    const c=createMerlionController(clear),p=operator(),at=merlionMouth(p.yaw),dir=merlionDirection(p.yaw,p.pitch);
    const hit={...p,id:'hit',x:at.x+dir.x*20,y:at.y+dir.y*20,z:at.z+dir.z*20};
    const miss={...hit,id:'miss',z:hit.z+2};
    expect(c.action(p,'operate')).toBe(true);c.input(p,true,true);
    const wet:string[]=[];c.step(.05,[p,hit,miss],a=>wet.push(a.id));expect(wet).toEqual(['hit']);
    const blocked=createMerlionController((_a,_b,r)=>Math.min(5,r));blocked.action(p,'operate');blocked.input(p,true,true);
    blocked.step(.05,[p,hit],()=>{throw Error('water through cover');});expect(blocked.state.end.x).toBeLessThan(6);
  });
  it('enforces one reachable living dry operator, bounded rotation, stale input expiry and death release',()=>{
    const c=createMerlionController(clear),p=operator(),other={...p,id:'q'};
    expect(c.action({...p,x:50},'operate')).toBe(false);expect(c.action({...p,swimming:true},'operate')).toBe(false);
    expect(c.action(p,'operate')).toBe(true);expect(c.action(other,'operate')).toBe(false);
    p.yaw=Math.PI/2;c.input(p,true,true);const before=c.state.yaw;c.step(.05,[p],()=>{});
    expect(Math.abs(c.state.yaw-before)).toBeLessThanOrEqual(MERLION.playerTurnSpeed*.05+.001);
    c.step(.4,[p],()=>{});expect(c.state.operator).toBeNull();expect(c.state.firing).toBe(false);
    c.action(p,'operate');c.input(p,true,true);c.step(.05,[{...p,alive:false}],()=>{});expect(c.state.operator).toBeNull();
  });
  it('shares finite pressure between the burst and cannon and replenishes only with time',()=>{
    const c=createMerlionController(clear),p=operator();c.action(p,'operate');expect(c.action(p,'mist')).toBe(true);expect(c.action(p,'mist')).toBe(false);
    expect(c.state.pressure).toBeCloseTo(.6);
    for(let i=0;i<86;i++){c.input(p,true,true);c.step(.05,[p],()=>{});}
    expect(c.state.recovering).toBeGreaterThan(0);expect(c.state.pressure).toBeLessThan(.02);
    for(let i=0;i<80;i++){c.input(p,false,true);c.step(.05,[p],()=>{});}
    expect(c.state.firing).toBe(false);expect(c.state.pressure).toBeGreaterThan(.2);expect(c.state.pressure).toBeLessThan(.3);
  });
  it('mists anyone in the forward cone, leaving the operator, rear and flanks clear',()=>{
    const c=createMerlionController(clear),p=operator();c.action(p,'operate');c.action(p,'mist');
    const wet:string[]=[];
    c.step(.05,[p,{...p,id:'enemy',bot:true,x:7,z:-12},{...p,id:'ally',x:8,z:-12},
      {...p,id:'rear',x:-5,z:-12},{...p,id:'flank',x:3,z:-7},{...p,id:'beyond',x:MERLION.mistRange+2,z:-12}],
      (a,strength)=>{wet.push(a.id);expect(strength).toBe(.48);});
    expect(wet).toEqual(['enemy','ally']);
    expect(mistBetween(c.state,{x:7,y:2,z:-22},{x:7,y:2,z:-2})).toBe(true);
    expect(mistBetween(c.state,{x:-5,y:2,z:-22},{x:-5,y:2,z:-2})).toBe(false);
    expect(mistBetween(c.state,{x:7,y:15,z:-22},{x:7,y:15,z:-2})).toBe(false);
    c.step(5,[p],()=>{});expect(mistBetween(c.state,p,p)).toBe(false);
  });
  it.each([-Math.PI/2,0,Math.PI/2,Math.PI])('keeps mist boundary and sight intersections aligned at yaw %s',yaw=>{
    const c=createMerlionController(clear);c.state.yaw=yaw;c.state.pitch=.2;c.state.mist=2;
    const o=merlionMouth(yaw),d=merlionDirection(yaw,.2),side={x:Math.cos(yaw),y:0,z:-Math.sin(yaw)};
    const at=(along:number,r:number)=>({x:o.x+d.x*along+side.x*r,y:o.y+d.y*along,z:o.z+d.z*along+side.z*r});
    for(const [along,r,inside] of [[MERLION.mistRange/2,MERLION.mistRadius/2-.1,true],[MERLION.mistRange/2,MERLION.mistRadius/2+.1,false],[-1,0,false],[MERLION.mistRange+.1,0,false],[MERLION.mistRange-.1,0,true]] as const){
      const point=at(along,r);expect(inMerlionMist(c.state,point)).toBe(inside);
      expect(mistBetween(c.state,point,point)).toBe(inside);
    }
    expect(mistBetween(c.state,at(-2,0),at(15,0))).toBe(true);
    expect(mistBetween(c.state,at(6,-10),at(6,10))).toBe(true);
    expect(mistBetween(c.state,at(6,10),at(6,-10))).toBe(true);
    expect(mistBetween(c.state,at(MERLION.mistRange+2,-10),at(MERLION.mistRange+2,10))).toBe(false);
  });
  it.each([
    {x:MARINA_WATER.minX-2,z:MERLION.z},{x:MARINA_WATER.maxX+2,z:MERLION.z},
    {x:0,z:MARINA_WATER.minZ-2},{x:0,z:MARINA_WATER.maxZ+2},
    ...[MARINA_WATER.minX-2,MARINA_WATER.maxX+2].flatMap(x=>[MARINA_WATER.minZ-2,MARINA_WATER.maxZ+2].map(z=>({x,z}))),
  ])('reaches a bot on the real dry promenade at %j',shore=>{
    const c=createMerlionController(clear),p=operator();
    p.yaw=Math.atan2(-shore.x,-(shore.z-MERLION.z));c.state.yaw=p.yaw;
    c.action(p,'operate');c.action(p,'mist');
    const bot={...p,...shore,id:'shore-bot',bot:true};
    expect(Math.hypot(bot.x,bot.z-MERLION.z)).toBeGreaterThan(40);
    const wet:string[]=[];c.step(.05,[p,bot],(a,strength)=>{if(a.id===bot.id){wet.push(a.id);expect(strength).toBe(.48);}});
    expect(wet).toEqual(['shore-bot']);
    expect(mistBetween(c.state,merlionMouth(p.yaw),bot)).toBe(true);
    c.step(MERLION.mistSeconds,[bot],()=>{throw Error('expired mist hit');});
    expect(mistBetween(c.state,merlionMouth(p.yaw),bot)).toBe(false);
  });
  it('bounds shared supplies, rejects spam and preserves spent stock on district return',()=>{
    const c=createMerlionController(clear),p={...operator(),...MERLION.cache};
    expect(c.action(p,'supply')).toBe(true);expect(c.action(p,'supply')).toBe(false);
    expect(c.action({...p,id:'q'},'supply')).toBe(true);expect(c.action({...p,id:'r'},'supply')).toBe(true);expect(c.action({...p,id:'s'},'supply')).toBe(false);
    c.step(20,[],()=>{});const back=createMerlionController(clear,c.snapshot());expect(back.state.packs).toBe(0);expect(back.state.refill).toBe(25);
    back.step(25,[],()=>{});expect(back.state.packs).toBe(1);expect(back.state.refill).toBe(45);
  });
  it('clears bot target acquisition only while the stream is hitting, with the same full-duration player condition',()=>{
    const effects={'water-eyes':{strength:1,remaining:.24,seconds:.24}};
    expect(validGrenadeConditions(effects)).toBe(true);expect(arenaConditionModifiers(effects)).toMatchObject({dazed:true,aim:0,frozen:false});
    advanceGrenadeConditions(effects,.25);expect(arenaConditionModifiers(effects).dazed).toBe(false);
    expect(arenaConditionModifiers({'water-eyes':{strength:.48,remaining:.24,seconds:.24}}).dazed).toBe(false);
  });
  it('validates bounded network state and water controls',()=>{
    const c=createMerlionController(clear);expect(validMerlionState(c.snapshot())).toBe(true);
    for(const change of [{pressure:2},{packs:99},{pitch:Infinity},{end:{x:999,y:0,z:0}},{operator:5}])expect(validMerlionState({...c.snapshot(),...change})).toBe(false);
    const input={...operator(),weapon:0,playing:true,waterFire:true};expect(validArenaInput(input)).toBe(true);expect(validArenaInput({...input,waterFire:'yes'})).toBe(false);
  });
});

const env:ArenaEnvironment={bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz}),playerSpawn:MERLION.console,spawns:[{x:18,z:-12}],endless:true};
const taggedWater=[{minX:80,maxX:90,minZ:80,maxZ:90,water:true}];
describe('Merlion arena authority',()=>{
  it('routes an island bot around the real pedestal to the controls without walking through water',()=>{
    const world=buildMarinaScene(),cover=createSceneCover(world.scene);
    const e={...env,bounds:MARINA_BOUNDS,move:moveInMarina,spawns:[{x:0,z:-16}],playerSpawn:{x:8.2,z:-12}};
    const traversal={bounds:MARINA_BOUNDS,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)};
    const a=createArena(world.obstacles,1,'assault',e,undefined,traversal,cover.distance);
    a.addPlayer('p','Target',0,0,undefined,undefined,true);
    try{
      let operated=false;
      for(let i=0;i<320;i++){
        a.step(.05);const bot=a.snapshot().actors.find(x=>x.id==='bot-1')!;
        expect(bot.swimming).toBeUndefined();expect(Math.hypot(bot.x,bot.z+12)).toBeLessThan(6);
        if(a.snapshot().merlion?.operator==='bot-1'){operated=true;break;}
      }
      expect(operated,JSON.stringify({bots:a.snapshot().actors.filter(x=>x.bot),nav:a.navigationStatus(),station:a.snapshot().merlion})).toBe(true);
    }finally{world.dispose();}
  });
  it('stops an infantry bot firing for every tick that the cannon actually intersects it',()=>{
    const a=createArena(taggedWater,1,'assault',env,undefined,undefined,clear);
    a.addPlayer('p','Operator',0,0,undefined,undefined,true);
    const p=()=>a.snapshot().actors.find(x=>x.id==='p')!,bot=()=>a.snapshot().actors.find(x=>x.id==='bot-1')!;
    a.setInput('p',{...p(),playing:true});a.merlionAction('p','operate');
    let wetTicks=0;
    for(let i=0;i<60;i++){
      const before=bot().shots;
      a.setInput('p',{...p(),yaw:-Math.PI/2,pitch:-.06,playing:true,waterFire:true});a.step(.05);
      if(bot().conditions?.['water-eyes']?.strength===1){wetTicks++;expect(bot().shots).toBe(before);}
    }
    expect(wetTicks).toBeGreaterThan(20);
  });
  it('authenticates guest actions and synchronizes occupancy, cannon hits and release across host and guest runtimes',()=>{
    vi.useFakeTimers();
    const handlers=[new Set<(from:string,payload:unknown)=>void>(),new Set<(from:string,payload:unknown)=>void>()];
    const sessions=[0,1].map(i=>({id:i?'guest':'host',name:i?'Guest':'Host',role:i?'guest':'host',
      send(payload:unknown){const copy=structuredClone(payload);setTimeout(()=>{for(const cb of handlers[1-i])cb(i?'guest':'host',copy);},25);},
      subscribe(cb:(from:string,payload:unknown)=>void){handlers[i].add(cb);return()=>{handlers[i].delete(cb);};},
      getPeers:()=>[{id:i?'host':'guest',name:i?'Host':'Guest'}],onPeers:()=>()=>{},close(){},
    })) as LanSession[];
    const host=createArenaRuntime({scene:new THREE.Scene(),obstacles:taggedWater,botCount:0,session:sessions[0],environment:env});
    const guest=createArenaRuntime({scene:new THREE.Scene(),obstacles:taggedWater,botCount:0,session:sessions[1],environment:env});
    const input=(x:number,z:number,fire=false)=>({x,y:1.75,z,yaw:-Math.PI/2,pitch:-.06,weapon:0,playing:true,waterFire:fire});
    let hostFrame:ReturnType<typeof host.update>,guestFrame:ReturnType<typeof guest.update>;
    const tick=(fire=false)=>{vi.advanceTimersByTime(50);hostFrame=host.update(.05,input(18,-12));guestFrame=guest.update(.05,input(0,-8.5,fire));};
    try{
      for(let i=0;i<60;i++)tick();
      guest.merlionAction('operate');for(let i=0;i<20;i++)tick(true);
      expect(hostFrame!.snapshot?.merlion?.operator).toBe('guest');expect(guestFrame!.snapshot?.merlion?.operator).toBe('guest');
      expect(guestFrame!.snapshot?.merlion?.firing).toBe(true);expect(hostFrame!.self?.conditions?.['water-eyes']?.strength).toBe(1);
      expect(validArenaSnapshot(guestFrame!.snapshot,env)).toBe(true);
      const packs=hostFrame!.snapshot!.merlion!.packs;
      guest.merlionAction('supply');for(let i=0;i<3;i++)tick(true);expect(hostFrame!.snapshot!.merlion!.packs).toBe(packs);
      guest.merlionAction('leave');for(let i=0;i<10;i++)tick();
      expect(hostFrame!.snapshot!.merlion!.operator).toBeNull();expect(hostFrame!.self?.conditions?.['water-eyes']).toBeUndefined();
    }finally{host.dispose();guest.dispose();vi.useRealTimers();}
  });
  it('holds the operator at the console, prevents handheld shots and publishes authoritative supplies and effects',()=>{
    const a=createArena(taggedWater,0,'assault',env,undefined,undefined,clear);a.addPlayer('p','Player',0,0,undefined,undefined,true);a.addPlayer('q','Other',0,0,undefined,undefined,true);
    const self=()=>a.snapshot().actors.find(x=>x.id==='p')!;
    a.setInput('p',{...self(),playing:true});expect(a.merlionAction('p','operate')).toBe(true);
    a.setInput('p',{...self(),x:25,z:20,yaw:-Math.PI/2,pitch:-.06,waterFire:true,playing:true});a.step(.05);
    expect(self().x).toBe(0);expect(self().z).toBe(-8.5);expect(a.snapshot().merlion?.firing).toBe(true);
    a.shoot('p',self(),{x:1,y:0,z:0},0);expect(self().shots).toBe(0);
    expect(validArenaSnapshot(a.snapshot(),env)).toBe(true);
    a.removePlayer('p');a.step(.05);expect(a.snapshot().merlion?.operator).toBeNull();
    const q=a.snapshot().actors.find(x=>x.id==='q')!;a.setInput('q',{...q,...MERLION.cache,playing:true});a.setPlayerVitals('q',{health:50});
    expect(a.merlionAction('q','supply')).toBe(true);expect(a.snapshot().actors.find(x=>x.id==='q')).toMatchObject({health:75,merlionSupply:{serial:1,family:0}});
    expect(a.merlionAction('q','supply')).toBe(false);expect(a.snapshot().merlion?.packs).toBe(2);
  });
  it.each([18,-18])('allows an island bot to rotate and blind a target on either side (x=%i) without health damage',(x)=>{
    const e={...env,spawns:[MERLION.console],playerSpawn:{x,z:-12}};
    const a=createArena(taggedWater,1,'assault',e,undefined,undefined,clear);a.addPlayer('p','Target',0,0,undefined,undefined,true);
    const p=()=>a.snapshot().actors.find(x=>x.id==='p')!;
    a.setInput('p',{...p(),playing:true});
    for(let i=0;i<70;i++)a.step(.05);
    expect(a.snapshot().merlion?.operator).toBe('bot-1');expect(a.snapshot().merlion?.firing).toBe(true);
    expect(p().conditions?.['water-eyes']?.strength).toBe(1);expect(p().health).toBe(100);
  });
  it.each([50,75,-75])('aims and mists a distant target at x=%i, including beyond cannon range',x=>{
    const e={...env,spawns:[MERLION.console],playerSpawn:{x,z:-12}};
    const a=createArena(taggedWater,1,'assault',e,undefined,undefined,clear);a.addPlayer('p','Target',0,0,undefined,undefined,true);
    const player=()=>a.snapshot().actors.find(actor=>actor.id==='p')!;
    a.setInput('p',{...player(),playing:true});
    if(x<0){a.step(.05);expect(a.snapshot().merlion?.mist).toBe(0);expect(a.snapshot().merlion?.pressure).toBe(1);}
    let burst=false,wet=false;
    for(let i=0;i<65;i++){
      a.step(.05);const s=a.snapshot().merlion!;
      if(s.mist>0){
        if(!burst)expect(inMerlionMist(s,player())).toBe(true);
        burst=true;expect(s.operator).toBe('bot-1');
        if(Math.abs(x)>MERLION.range){expect(s.firing).toBe(false);expect(s.pressure).toBeGreaterThanOrEqual(.59);}
      }
      if((player().conditions?.['water-eyes']?.strength??0)>0)wet=true;
    }
    expect(burst).toBe(true);expect(wet).toBe(true);
    if(Math.abs(x)>MERLION.range)expect(player().conditions?.['water-eyes']?.strength).toBe(.48);
    expect(player().health).toBe(100);
  });
  it('holds its last aim during mist rather than tracking a hidden moving target',()=>{
    const e={...env,spawns:[MERLION.console],playerSpawn:{x:70,z:-12}};
    const a=createArena(taggedWater,1,'assault',e,undefined,undefined,clear);a.addPlayer('p','Target',0,0,undefined,undefined,true);
    const player=()=>a.snapshot().actors.find(actor=>actor.id==='p')!;
    a.setInput('p',{...player(),playing:true});
    for(let i=0;i<8;i++)a.step(.05);
    expect(a.snapshot().merlion!.mist).toBeGreaterThan(0);
    const aim=a.snapshot().actors.find(actor=>actor.id==='bot-1')!.yaw;
    a.setInput('p',{...player(),z:40,playing:true});
    for(let i=0;i<20;i++)a.step(.05);
    expect(a.snapshot().actors.find(actor=>actor.id==='bot-1')!.yaw).toBeCloseTo(aim);
    expect(a.snapshot().merlion!.operator).toBe('bot-1');
    expect(a.snapshot().merlion!.firing).toBe(false);
  });
  it.each([{x:77,blocked:false},{x:70,blocked:true}])('does not spend mist on an unreachable target %j',({x,blocked})=>{
    const e={...env,spawns:[MERLION.console],playerSpawn:{x,z:-12}};
    const a=createArena(taggedWater,1,'assault',e,undefined,undefined,blocked?(_o,_d,r)=>Math.min(r,5):clear);
    a.addPlayer('p','Target',0,0,undefined,undefined,true);
    const player=a.snapshot().actors.find(actor=>actor.id==='p')!;a.setInput('p',{...player,playing:true});
    for(let i=0;i<20;i++)a.step(.05);
    expect(a.snapshot().merlion).toMatchObject({mist:0,cooldown:0,pressure:1,operator:null});
  });
  it('does not add a Merlion to other districts and resets spent supplies for a new match',()=>{
    expect(createArena([],0,'assault',env).snapshot().merlion).toBeUndefined();
    const a=createArena(taggedWater,0,'assault',{...env,playerSpawn:MERLION.cache});a.addPlayer('p','Player',0,0,undefined,undefined,true);const p=a.snapshot().actors[0];a.setInput('p',{...p,playing:true});
    a.merlionAction('p','supply');expect(a.snapshot().merlion?.packs).toBe(2);a.reset();expect(a.snapshot().merlion?.packs).toBe(3);
  });
});
