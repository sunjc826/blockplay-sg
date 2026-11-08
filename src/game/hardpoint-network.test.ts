import { HARDPOINT_AREA, SMITH_CONTROL_SITES } from './hardpoint';
import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import { connectArenaMatch } from './arena-match-session';
import { DEFAULT_ARENA_MATCH, type ArenaMatch } from './arena-match';
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
it('waits for the host, ignores forged/invalid configs, and handles a late host',()=>{
  vi.useFakeTimers();const n=network(),received:ArenaMatch[]=[];
  const guest=connectArenaMatch(n.sessions[1],DEFAULT_ARENA_MATCH,m=>received.push(m));
  n.deliver(1,'intruder',{type:'arena-config',match:{mode:'hardpoint',area:'smith-street'}});
  n.deliver(1,'host',{type:'arena-config',match:{mode:'hardpoint',area:'invalid'}});
  expect(received).toEqual([]);
  const host=connectArenaMatch(n.sessions[0],{mode:'hardpoint',area:'smith-street'},()=>{});
  vi.advanceTimersByTime(1000);expect(received).toEqual([{mode:'hardpoint',area:'smith-street'}]);
  n.deliver(1,'host',{type:'arena-config',match:DEFAULT_ARENA_MATCH});expect(received).toHaveLength(1);
  guest();host();
});
it.each([HARDPOINT_AREA])('synchronizes $id teams, late join, respawn, reset, and departure',area=>{
  vi.useFakeTimers();const n=network();
  const environment={bounds:area.bounds,move:createRegionMovement(area.bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo],hardpoint:{area,sites:SMITH_CONTROL_SITES}};
  const host=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],botCount:6,environment,session:n.sessions[0]});
  const guest=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],botCount:0,environment,session:n.sessions[1]});
  const input:ArenaInput={x:area.spawns.alpha[0].x,y:1.75,z:area.spawns.alpha[0].z,yaw:0,pitch:0,weapon:0,playing:true};
  let h=host.update(.05,input),g=guest.update(.05,input);
  const step=(seconds:number)=>{for(let i=0;i<seconds*20;i++){
    h=host.update(.05,h.self?{...h.self,playing:true}:input);g=guest.update(.05,g.self?{...g.self,playing:true}:input);vi.advanceTimersByTime(50);
  }};
  try {
    step(1);expect(h.self?.team).toBe('alpha');expect(g.self?.team).toBe('bravo');
    expect(g.snapshot?.actors).toHaveLength(8);expect(g.snapshot?.hardpoint?.area).toBe(area.id);
    n.deliver(0,'guest',{type:'arena-input',input:{...input,team:'alpha'}});step(.2);expect(g.self?.team).toBe('bravo');
    host.setVitals({health:0});step(.1);expect(h.self?.alive).toBe(true); // Shared matches refuse local health edits.
    step(65);expect(h.snapshot?.actors.some(a=>a.deaths>0&&a.alive)).toBe(true);
    step(.2);g=guest.update(0,input);expect(g.snapshot?.hardpoint).toEqual((n.packets.filter((p:any)=>p.type==='arena-state').at(-1) as any).snapshot.hardpoint);expect(g.snapshot?.hardpoint?.active).toBe('east');
    const saved=structuredClone(g.snapshot);n.deliver(1,'intruder',{type:'arena-state',snapshot:{...saved,hardpoint:{...saved!.hardpoint,scores:{alpha:200,bravo:0}}}});expect(guest.update(0,input).snapshot?.hardpoint?.scores).toEqual(saved!.hardpoint!.scores);
    n.deliver(0,'guest',{type:'arena-state',snapshot:{...saved,hardpoint:{...saved!.hardpoint,scores:{alpha:200,bravo:0}}}});step(.1);expect(h.snapshot?.hardpoint?.scores.alpha).toBeLessThan(200);
    host.reset();step(.1);g=guest.update(0,input);expect(h.snapshot?.hardpoint?.scores).toEqual({alpha:0,bravo:0});expect(g.snapshot?.hardpoint).toEqual((n.packets.filter((p:any)=>p.type==='arena-state').at(-1) as any).snapshot.hardpoint);
    expect(g.self?.team).toBe('bravo');
    n.disconnect();h=host.update(.05,{...input,playing:false});expect(h.snapshot?.actors).toHaveLength(8);
    expect(h.snapshot?.actors.filter(a=>!a.bot)).toHaveLength(1);expect(h.snapshot?.actors.filter(a=>a.team==='bravo')).toHaveLength(4);
  }finally{host.dispose();guest.dispose();}
});

it('refuses a TDM guest in the same Smith Street area',()=>{
 vi.useFakeTimers();const n=network(),area=HARDPOINT_AREA;
 const base={bounds:area.bounds,move:createRegionMovement(area.bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo]};
 const host=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],botCount:0,environment:{...base,hardpoint:{area,sites:SMITH_CONTROL_SITES}},session:n.sessions[0]});
 const guest=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],botCount:0,environment:{...base,teamDeathmatch:area},session:n.sessions[1]});
 try{vi.advanceTimersByTime(1500);const input={x:0,y:1.75,z:0,yaw:0,pitch:0,weapon:0,playing:true};expect(host.update(.05,input).snapshot?.actors.filter(a=>!a.bot)).toHaveLength(1);expect(guest.update(.05,input).snapshot).toBeNull();}finally{host.dispose();guest.dispose();}
});

it('gives a guest joining after rotation the current objective and scores',()=>{
 vi.useFakeTimers();const n=network(),area=HARDPOINT_AREA,environment={bounds:area.bounds,move:createRegionMovement(area.bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo],hardpoint:{area,sites:SMITH_CONTROL_SITES}};
 const host=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],botCount:0,environment,session:n.sessions[0]});
 const input={x:-61,y:1.75,z:50,yaw:0,pitch:0,weapon:0,playing:true};let guest:ReturnType<typeof createArenaRuntime>|undefined;
 try{
  host.update(.05,input);vi.advanceTimersByTime(65000);
  guest=createArenaRuntime({scene:new THREE.Scene(),obstacles:[],botCount:0,environment,session:n.sessions[1]});
  for(let i=0;i<30;i++){guest.update(.05,input);vi.advanceTimersByTime(50);}
  const h=host.update(0,input),g=guest.update(0,input);
  expect(g.self?.team).toBe('bravo');expect(g.snapshot?.hardpoint?.active).toBe('east');expect(g.snapshot?.hardpoint?.scores).toEqual(h.snapshot?.hardpoint?.scores);expect(g.snapshot?.actors).toHaveLength(8);
 }finally{host.dispose();guest?.dispose();}
});
