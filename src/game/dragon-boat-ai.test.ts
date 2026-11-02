import {FPS_WEAPONS} from './fps-rules';
import {shootAndLand} from './arena-test-shots';
import {describe,it,expect} from 'vitest';
import {buildMarinaScene} from './marina-scene';
import {createArena,type ArenaSimulation} from './arena-rules';
import {MARINA_BOUNDS,moveInMarina} from './marina-collision';
import {getWalkSurfaces,getTraversalObstacles} from './vertical-routes';
import {createSceneCover} from './scene-cover';
import {DRAGON_BOAT_SPAWNS,canPaddle} from './marina-water';
import {validArenaSnapshot} from './arena-runtime';
import type {VehicleSpawns} from './vehicle-rules';

function setup(openWorld=true,count=3,shore:{x:number;z:number}={x:-20.5,z:24},friendly=false){
  const world=buildMarinaScene(),cover=createSceneCover(world.scene);
  const spawns:VehicleSpawns={car:{x:-110,z:90,yaw:0},helicopter:{x:110,z:90,yaw:0},'dragon-boat-red':DRAGON_BOAT_SPAWNS['dragon-boat-red']};
  const env={bounds:MARINA_BOUNDS,move:moveInMarina,spawns:[shore],playerSpawn:{x:8.2,z:-12,yaw:Math.PI/2},endless:true,...(friendly?{facilities:{sites:[{id:'friendly-post',name:'Friendly post',kind:'command' as const,x:-24,z:34,y:0,initialOwner:'armed-forces' as const,deployment:{...shore,yaw:0}}]}}:{})};
  const traversal={bounds:MARINA_BOUNDS,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)};
  const arena=createArena(world.obstacles,count,'assault',env,{spawns,openWorld},traversal,cover.distance);
  return{world,arena,env};
}
const red=(a:ArenaSimulation)=>a.snapshot().vehicles!.find(v=>v.kind==='dragon-boat-red')!;
const bot=(a:ArenaSimulation,id:string)=>a.snapshot().actors.find(m=>m.id===id)!;
const advance=(a:ArenaSimulation,s:number)=>{for(let t=0;t<s-.001;t+=.05)a.step(.05);};

describe('host-owned dragon boat crews',()=>{
  it('keeps island infantry at the Merlion instead of reserving an unreachable mainland boat',()=>{
    const {world,arena:a}=setup(true,1,{x:0,z:-8.5});
    try{
      a.addPlayer('p','Island target',0,0,undefined,undefined,true);a.setInput('p',{...bot(a,'p'),playing:true});
      for(let n=0;n<80;n++)a.step(.05);
      expect(a.boatStatus()).toEqual([]);
      expect(a.snapshot().merlion?.operator).toBe('bot-1');
      expect(red(a).occupants).toEqual([null,null,null,null]);
    }finally{world.dispose();}
  });
  it.each([true,false])('boards existing infantry, lands a squad and returns the pilot to shore (openWorld=%s)',(openWorld)=>{
    const {world,arena:a,env}=setup(openWorld);let boarded=false,landed=false,returned=false;
    try{
      for(let n=0;n<3600;n++){
        a.step(.05);const v=red(a),actors=a.snapshot().actors;
        expect(actors).toHaveLength(3);expect(actors.every(m=>!m.swimming)).toBe(true);
        expect(canPaddle(v.x,v.z,v.yaw)).toBe(true);
        if(v.occupants.filter(Boolean).length>=2)boarded=true;
        if(actors.some(m=>!m.vehicle&&Math.hypot(m.x,m.z+12)<10))landed=true;
        if(landed&&!v.occupants.some(Boolean)&&Math.hypot(v.x+17,v.z-24)<1){returned=true;break;}
        if(n%100===0)expect(validArenaSnapshot(a.snapshot(),env)).toBe(true);
      }
      expect({boarded,landed,returned},JSON.stringify({boat:red(a),actors:a.snapshot().actors,status:a.boatStatus()})).toEqual({boarded:true,landed:true,returned:true});
      a.addPlayer('p','Island target',0,0,undefined,undefined,true);const p=bot(a,'p');a.setInput('p',{...p,playing:true});
      let operated=false;
      for(let n=0;n<220;n++){a.step(.05);if(a.snapshot().merlion?.operator?.startsWith('bot-')){operated=true;break;}}
      expect(operated,JSON.stringify(a.snapshot().actors)).toBe(true);
    }finally{world.dispose();}
  });
  it('walks down a dry shore approach rather than trying to walk straight across water to the hull',()=>{
    const {world,arena:a}=setup(true,1,{x:-26,z:36});let boarded=false;
    try{
      for(let n=0;n<1800;n++){a.step(.05);const b=bot(a,'bot-1');expect(b.swimming).toBeUndefined();if(b.vehicle==='dragon-boat-red'){boarded=true;break;}}
      expect(boarded,JSON.stringify({actor:bot(a,'bot-1'),status:a.boatStatus()})).toBe(true);
    }finally{world.dispose();}
  });
  it('promotes a surviving bot after losing its pilot at sea, without disembarking into water',()=>{
    const {world,arena:a,env}=setup();
    try{
      for(let n=0;n<1200;n++){a.step(.05);if(red(a).z<15&&red(a).occupants.filter(Boolean).length===3)break;}
      const pilot=red(a).occupants[0]!;expect(pilot).toBeTruthy();expect(red(a).z).toBeLessThan(15);
      env.playerSpawn={x:-20.5,z:24,yaw:0};a.addPlayer('shooter','Shore shooter',0,0,FPS_WEAPONS.map(w=>({...w,damage:300})),undefined,true);
      const from=bot(a,'shooter'),to=bot(a,pilot),d=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z);
      const hit=shootAndLand(a,'shooter',from,{x:(to.x-from.x)/d,y:(to.y-from.y)/d,z:(to.z-from.z)/d},from.weapon);
      expect(hit).toMatchObject({hitId:pilot,killed:true});a.step(.05);
      expect(red(a).occupants[0]).not.toBe(pilot);expect(red(a).occupants[0]).not.toBeNull();
      const survivors=a.snapshot().actors.filter(m=>m.bot&&m.alive);expect(survivors.every(m=>m.vehicle==='dragon-boat-red'&&!m.swimming)).toBe(true);
      let landed=false;for(let n=0;n<1800;n++){a.step(.05);if(survivors.some(m=>{const b=bot(a,m.id);return !b.vehicle&&Math.hypot(b.x,b.z+12)<10;})){landed=true;break;}}
      expect(landed).toBe(true);
    }finally{world.dispose();}
  });
  it('does not commandeer a player boat or its empty driver seat, and only boards after the player waits',()=>{
    const q=setup(true,0,{x:-20.5,z:24},true);try{
      // A player approaching within 12m keeps an unoccupied boat available.
      q.env.playerSpawn={x:-20.5,z:24,yaw:0};q.arena.addPlayer('p','Player',0,0,undefined,undefined,true);
      q.arena.setInput('p',{...bot(q.arena,'p'),playing:true});advance(q.arena,.5);expect(red(q.arena).occupants[0]).toBeNull();
      expect(q.arena.vehicleAction('p','enter','dragon-boat-red')).toBe(true);advance(q.arena,.5);expect(red(q.arena).occupants.filter(Boolean)).toHaveLength(1);
      advance(q.arena,1);expect(red(q.arena).occupants.filter(Boolean).length).toBeGreaterThan(1);
      expect(q.arena.vehicleAction('p','switch')).toBe(true);advance(q.arena,2);expect(red(q.arena).occupants[0]).toBeNull();
    }finally{q.world.dispose();}
  });
});
