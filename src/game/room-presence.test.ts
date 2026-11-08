import { afterEach, expect, it, vi } from 'vitest';
import { connectRoomPresence, type RoomPresence } from './room-presence';
import type { LanSession } from './lan-peer';
afterEach(()=>vi.useRealTimers());
it('relays member states, rejects forged rosters and removes departed members',()=>{
 vi.useFakeTimers();const ids=['host','guest','other'],listeners=ids.map(()=>new Set<(from:string,p:unknown)=>void>()),peers=ids.map(()=>new Set<()=>void>());let present=[...ids];
 const sessions=ids.map((id,i):LanSession=>({id,name:id,role:i?'guest':'host',getPeers:()=>present.filter(p=>p!==id).map(id=>({id,name:id})),subscribe:cb=>{listeners[i].add(cb);return()=>{listeners[i].delete(cb);};},onPeers:cb=>{peers[i].add(cb);return()=>{peers[i].delete(cb);};},send:(p,to)=>{const recipients=to?[ids.indexOf(to)]:i?[0]:[1,2];for(const target of recipients)for(const cb of listeners[target])cb(id,structuredClone(p));},close:vi.fn()}));
 const states:Record<string,RoomPresence>[]=[{},{},{}],connections=sessions.map((s,i)=>connectRoomPresence(s,next=>states[i]=next));
 connections[1].set('Loading');connections[0].set('In match');connections[2].set('Ready');expect(states[2]).toMatchObject({host:'In match',guest:'Loading',other:'Ready'});
 listeners[1].forEach(cb=>cb('other',{type:'room-roster',states:{host:'Ready'}}));expect(states[1].host).toBe('In match');
 listeners[0].forEach(cb=>cb('intruder',{type:'room-presence',status:'In match'}));expect(states[0].intruder).toBeUndefined();
 listeners[0].forEach(cb=>cb('guest',{type:'room-presence',status:'forged',states:{host:'Ready'}}));expect(states[0].host).toBe('In match');
 expect(()=>listeners[0].forEach(cb=>cb('guest',{type:'room-presence',status:{toString:null}}))).not.toThrow();expect(states[0].guest).toBe('Loading');
 connections[1].set('In room');expect(states[0].guest).toBe('In room');expect(sessions[1].close).not.toHaveBeenCalled();
 present=['host','guest'];peers[0].forEach(cb=>cb());expect(states[0].other).toBeUndefined();
 connections.forEach(c=>c.dispose());expect(vi.getTimerCount()).toBe(0);listeners.forEach(s=>expect(s.size).toBe(0));
});
