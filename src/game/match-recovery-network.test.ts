import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import type { ArenaInput } from './arena-rules';
import type { LanSession } from './lan-peer';

const cover=vi.hoisted(()=>({clear:false}));
vi.mock('./scene-cover',()=>({createSceneCover:()=>({distance:()=>cover.clear?Infinity:0,sightDistance:()=>0,trace:()=>null})}));
afterEach(() => vi.useRealTimers());
it('shares regeneration and armor drops through the host, rejects forged claims, and retains receipts', () => {
  vi.useFakeTimers();
  const handlers = [new Set<(from: string, p: unknown) => void>(), new Set<(from: string, p: unknown) => void>()];
  const deliver = (i: number, from: string, p: unknown) => handlers[i].forEach(cb => cb(from, structuredClone(p)));
  const sessions = [0,1].map(i => ({ id: i ? 'guest' : 'host', name: i ? 'Guest' : 'Host', role: i ? 'guest' : 'host',
    send: (p: unknown) => deliver(1-i, i ? 'guest' : 'host', p),
    subscribe: (cb: (from: string, p: unknown) => void) => { handlers[i].add(cb); return () => { handlers[i].delete(cb); }; },
    getPeers: () => [{ id: i ? 'host' : 'guest', name: 'Peer' }], onPeers: () => () => {}, close() {},
  })) as LanSession[];
  cover.clear=false;let moving=false;
  const environment = { bounds: { minX:-50,maxX:50,minZ:-50,maxZ:50 }, spawns: [{x:0,z:0},{x:0,z:-8},{x:8,z:-8}],
    move: (p: {x:number;z:number}, dx:number,dz:number) => moving?({x:p.x+dx,z:p.z+dz}):p };
  const host = createArenaRuntime({ scene: new THREE.Scene(), session: sessions[0], botCount:1, obstacles:[], environment });
  const guest = createArenaRuntime({ scene: new THREE.Scene(), session: sessions[1], botCount:0, obstacles:[], environment });
  const input: ArenaInput = { x:0,y:1.75,z:0,yaw:0,pitch:0,weapon:0,playing:true };
  let h=host.update(.05,input), g=guest.update(.05,input);
  const step = (count=1) => { for(let i=0;i<count;i++) { h=host.update(.05,{...h.self!,playing:true});g=guest.update(.05,{...g.self!,playing:true});vi.advanceTimersByTime(50); } };
  try {
    step(10);
    // Actual bullet damage resets the host's regeneration timer.
    cover.clear=true;host.shoot(h.self!,new THREE.Vector3(g.self!.x-h.self!.x,g.self!.y-.65-h.self!.y,g.self!.z-h.self!.z).normalize(),0);step(4);cover.clear=false;
    const hurt=g.self!.health;expect(hurt).toBeLessThan(100);step(130);expect(g.self!.health).toBe(hurt);
    step(100);expect(g.self!.health).toBe(100);expect(h.snapshot!.actors.find(a=>a.id==='guest')!.health).toBe(100);
    const bot=g.snapshot!.actors.find(a=>a.bot)!;
    for(let i=0;i<12 && g.snapshot!.actors.find(a=>a.id===bot.id)!.alive;i++) {
      const b=g.snapshot!.actors.find(a=>a.id===bot.id)!;
      const d=new THREE.Vector3(b.x-g.self!.x,b.y-.65-g.self!.y,b.z-g.self!.z).normalize();
      cover.clear=true;guest.shoot(g.self!,d,0);step(5);cover.clear=false;
    }
    const drop=g.snapshot!.armorDrops![0];expect(drop, JSON.stringify(g.snapshot!.actors.map(a=>({id:a.id,hp:a.health,shots:a.shots,alive:a.alive,x:a.x,z:a.z})))).toBeDefined();
    deliver(0,'intruder',{type:'arena-armor-pickup',id:drop.id});step();expect(g.snapshot!.armorDrops).toHaveLength(1);
    guest.pickupArmor(drop.id);step();expect(g.self?.armorPickup).toBeUndefined();
    moving=true;
    for(let i=0;i<30 && Math.hypot(g.self!.x-drop.x,g.self!.z-drop.z)>1;i++) {
      g=guest.update(.05,{...g.self!,x:drop.x,z:drop.z,playing:true});h=host.update(.05,{...h.self!,playing:true});vi.advanceTimersByTime(50);
    }
    moving=false;cover.clear=true;guest.pickupArmor(drop.id);cover.clear=false;step(2);
    expect(g.self?.armorPickup?.catalogId).toBe(drop.catalogId);expect(g.self!.armor).toBeGreaterThan(0);
    expect(g.snapshot!.armorDrops).toEqual([]);
    const serial=g.self!.armorPickup!.serial;
    guest.pickupArmor(drop.id);step();expect(g.self!.armorPickup!.serial).toBe(serial);
    expect(h.snapshot!.actors.find(a=>a.id==='guest')!.armorPickup).toEqual(g.self!.armorPickup);
    step(10);expect(g.self!.armorPickup!.serial).toBe(serial);
  } finally { host.dispose();guest.dispose(); }
});
