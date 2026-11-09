import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createArenaRuntime, validArenaSnapshot } from './arena-runtime';
import { createArena } from './arena-rules';
import { TDM_AREAS } from './arena-match';
import { createRegionMovement } from './region-collision';
import type { LanSession } from './lan-peer';
afterEach(()=>vi.useRealTimers());
it('routes guest configuration and activation through the host, rejects unearned use and forged state',()=>{
 vi.useFakeTimers();
 const listeners=[new Set<(id:string,p:any)=>void>(),new Set<(id:string,p:any)=>void>()], packets:any[]=[];
 const sessions=[0,1].map(i=>({id:i?'guest':'host',name:i?'Guest':'Host',role:i?'guest':'host',getPeers:()=>[{id:i?'host':'guest',name:'Peer'}],isConnected:()=>true,onPeers:()=>()=>{},close(){},subscribe:(cb:any)=>{listeners[i].add(cb);return()=>listeners[i].delete(cb)},send:(p:any)=>{packets.push(p);listeners[1-i].forEach(cb=>cb(i?'guest':'host',structuredClone(p)))}})) as LanSession[];
 const area=TDM_AREAS[0], environment={bounds:area.bounds,move:createRegionMovement(area.bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo],teamDeathmatch:area};
 const host=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],session:sessions[0],environment,botCount:0});
 const guest=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],session:sessions[1],environment,botCount:0});
 const idle={x:10,y:1.75,z:-90,yaw:0,pitch:0,weapon:0,playing:false};
 try{
  host.update(0,idle);guest.update(0,idle);vi.advanceTimersByTime(200);
  expect(guest.configureStreaks(['recon','jammer','hunter'])).toBe(true);
  let g=guest.update(0,idle);expect(g.snapshot?.streaks?.players.guest.loadout).toEqual(['recon','jammer','hunter']);
  const before=structuredClone(g.snapshot!.streaks);
  listeners[0].forEach(cb=>cb('intruder',{type:'streak-loadout',loadout:['interceptor','strike','sentry']}));
  expect(host.update(0,idle).snapshot?.streaks).toEqual(before);
  host.update(.05,{...idle,playing:true});g=guest.update(.05,{...idle,playing:true});vi.advanceTimersByTime(100);
  const reply=vi.fn();guest.activateStreak('recon',undefined,reply);
  expect(reply).toHaveBeenCalledWith(false);expect(packets.some(p=>p.type==='streak-result'&&p.accepted===false)).toBe(true);
  expect(host.update(0,idle).snapshot?.streaks?.effects).toEqual([]);
  const forged=structuredClone(g.snapshot!);forged.streaks!.players.guest.ready=['recon'];
  listeners[1].forEach(cb=>cb('intruder',{type:'arena-state',snapshot:forged,started:true}));
  expect(guest.update(0,idle).snapshot?.streaks?.players.guest.ready).toEqual([]);
 }finally{guest.dispose();host.dispose();}
});
it('rejects malformed team event/streak relationships without throwing',()=>{
 const area=TDM_AREAS[0],environment={bounds:area.bounds,move:createRegionMovement(area.bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo],teamDeathmatch:area};
 const a=createArena([],0,'mixed',environment);const base=a.snapshot();expect(validArenaSnapshot(base,environment)).toBe(true);
 for(const effects of [null,{},[null],[{kind:'hunter',event:'event-1',contacts:[null]}]]){
  const snap={...base,events:[{id:'event-1',kind:'drone'}],streaks:{...base.streaks,effects}};
  expect(()=>validArenaSnapshot(snap,environment)).not.toThrow();expect(validArenaSnapshot(snap,environment)).toBe(false);
 }
});
