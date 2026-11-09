import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import type { ArenaInput } from './arena-rules';
import type { LanSession } from './lan-peer';

afterEach(() => vi.useRealTimers());
it('shares a human death drop, equips a guest only on host approval, and rejects replayed/forged claims', () => {
  vi.useFakeTimers();
  const handlers = [new Set<(from: string, p: unknown) => void>(), new Set<(from: string, p: unknown) => void>()];
  const deliver = (i: number, from: string, p: unknown) => handlers[i].forEach(cb => cb(from, structuredClone(p)));
  const sessions = [0,1].map(i => ({ id: i ? 'guest' : 'host', name: i ? 'Guest' : 'Host', role: i ? 'guest' : 'host',
    send: (p: unknown) => deliver(1-i, i ? 'guest' : 'host', p),
    subscribe: (cb: (from: string, p: unknown) => void) => { handlers[i].add(cb); return () => { handlers[i].delete(cb); }; },
    getPeers: () => [{ id: i ? 'host' : 'guest', name: 'Peer' }], onPeers: () => () => {}, close() {},
  })) as LanSession[];
  const environment = { bounds: { minX:-50,maxX:50,minZ:-50,maxZ:50 }, spawns: [{x:0,z:0},{x:0,z:-8}],
    move: (p: {x:number;z:number}, dx:number,dz:number) => ({x:p.x+dx,z:p.z+dz}) };
  const host = createArenaRuntime({ scene: new THREE.Scene(), session: sessions[0], botCount:0, obstacles:[], environment });
  const guest = createArenaRuntime({ scene: new THREE.Scene(), session: sessions[1], botCount:0, obstacles:[], environment });
  const input: ArenaInput = { x:0,y:1.75,z:0,yaw:0,pitch:0,weapon:0,playing:true };
  let h=host.update(.05,input), g=guest.update(.05,input);
  const step = (count=1) => { for(let i=0;i<count;i++) { h=host.update(.05,{...h.self!,playing:true});g=guest.update(.05,{...g.self!,playing:true});vi.advanceTimersByTime(50); } };
  try {
    step(10);
    deliver(0,'intruder',{type:'arena-pickup',id:'match-drop-1'});
    expect(g.self?.weaponPickup).toBeUndefined();
    for(let i=0;i<6 && h.self?.alive;i++) {
      const d=new THREE.Vector3(h.self!.x-g.self!.x,h.self!.y-.65-g.self!.y,h.self!.z-g.self!.z).normalize();
      guest.shoot(g.self!,d,0);step(5);
    }
    expect(h.self?.alive).toBe(false);
    const drop=g.snapshot!.weaponDrops![0];expect(drop).toBeDefined();
    guest.pickupWeapon(drop.id);step();expect(g.self?.weaponPickup).toBeUndefined();
    for(let i=0;i<30 && Math.hypot(g.self!.x-drop.x,g.self!.z-drop.z)>1;i++) {
      g=guest.update(.05,{...g.self!,x:drop.x,z:drop.z,playing:true});h=host.update(.05,{...h.self!,playing:true});vi.advanceTimersByTime(50);
    }
    guest.pickupWeapon(drop.id);step(2);
    expect(g.self?.weaponPickup?.catalogId).toBe(drop.catalogId);
    expect(g.snapshot!.weaponDrops).toEqual([]);
    const serial=g.self!.weaponPickup!.serial;
    guest.pickupWeapon(drop.id);step();expect(g.self!.weaponPickup!.serial).toBe(serial);
    expect(h.snapshot!.actors.find(a=>a.id==='guest')!.weaponPickup).toEqual(g.self!.weaponPickup);
  } finally { host.dispose();guest.dispose(); }
});
