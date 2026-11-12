import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import { FFA_AREAS } from './arena-match';
import { createRegionMovement } from './region-collision';
import type { LanSession } from './lan-peer';
import type { ArenaInput } from './arena-rules';
afterEach(()=>vi.useRealTimers());
function network() {
  const listeners=[new Set<(from:string,p:unknown)=>void>(),new Set<(from:string,p:unknown)=>void>()];
  const peerListeners=[new Set<()=>void>(),new Set<()=>void>()];let connected=true;
  const packets:unknown[]=[];
  const sessions=[0,1].map(i=>({id:i?'guest':'host',role:i?'guest':'host',name:i?'Guest':'Host',
    getPeers:()=>connected?[{id:i?'host':'guest',name:'Peer'}]:[],isConnected:()=>connected,
    subscribe:(cb:(from:string,p:unknown)=>void)=>{listeners[i].add(cb);return()=>{listeners[i].delete(cb);};},
    onPeers:(cb:()=>void)=>{peerListeners[i].add(cb);return()=>{peerListeners[i].delete(cb);};},
    send:(p:unknown)=>{packets.push(structuredClone(p));for(const cb of listeners[1-i])cb(i?'guest':'host',structuredClone(p));},close:()=>{},
  })) as LanSession[];
  return {sessions,packets,deliver:(i:number,from:string,p:unknown)=>listeners[i].forEach(cb=>cb(from,p)),disconnect:()=>{connected=false;peerListeners.forEach(s=>s.forEach(cb=>cb()));}};
}

it.each(FFA_AREAS)('synchronizes $id individual combat, map identity, reset and departure',area=>{
  vi.useFakeTimers();const n=network();
  const environment={bounds:area.bounds,move:createRegionMovement(area.bounds).move,spawns:area.spawns,freeForAll:area};
  const host=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],botCount:3,environment,session:n.sessions[0]});
  const input:ArenaInput={x:area.spawns[0].x,y:1.75,z:area.spawns[0].z,yaw:0,pitch:0,weapon:0,playing:true};
  // Known peers still cannot register on the wrong mode/map (or legacy map-less protocol).
  for(const [mode,map] of [['free-for-all','invalid'],['hardpoint',area.id],[undefined,undefined]])
    n.deliver(0,'guest',{type:'arena-hello',profile:{},mode,area:map});
  expect(host.update(.05,input).snapshot?.actors.some(a=>a.id==='guest')).toBe(false);
  const guest=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],botCount:0,environment,session:n.sessions[1]});
  let h=host.update(.05,input),g=guest.update(.05,input);
  const step=(seconds:number)=>{for(let i=0;i<seconds*20;i++){
    h=host.update(.05,h.self?{...h.self,playing:true}:input);g=guest.update(.05,g.self?{...g.self,playing:true}:input);vi.advanceTimersByTime(50);
  }};
  try {
    step(1);expect(g.snapshot?.freeForAll?.area).toBe(area.id);expect(g.snapshot?.actors).toHaveLength(5);
    expect(g.snapshot?.actors.every(a=>a.freeForAll&&!a.team)).toBe(true);
    n.deliver(0,'guest',{type:'arena-input',input:{...input,team:'alpha',freeForAll:false}});step(.2);
    expect(g.self?.freeForAll).toBe(true);expect(g.self?.team).toBeUndefined();
    step(40);expect(h.snapshot?.actors.some(a=>a.kills>0)).toBe(true);
    expect(g.snapshot?.actors.map(a=>[a.id,a.kills])).toEqual(h.snapshot?.actors.map(a=>[a.id,a.kills]));
    const before=guest.update(0,input).snapshot?.tick;
    n.deliver(1,'host',{type:'arena-state',started:true,matchId:'forged-map',snapshot:{...h.snapshot,tick:99999,freeForAll:{area:'invalid'}}});
    expect(guest.update(0,input).snapshot?.tick).toBe(before);
    host.reset();step(.1);expect(g.snapshot?.freeForAll?.area).toBe(area.id);
    expect(g.snapshot?.actors.every(a=>a.kills===0&&a.deaths===0)).toBe(true);
    n.disconnect();h=host.update(.05,{...input,playing:false});expect(h.snapshot?.actors.filter(a=>!a.bot)).toHaveLength(1);
  }finally{host.dispose();guest.dispose();}
});
