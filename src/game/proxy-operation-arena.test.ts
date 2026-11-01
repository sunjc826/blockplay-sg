import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { createProxyCampaign } from './proxy-operations';
import { validArenaSnapshot } from './arena-runtime';
import { hostile } from './arena-factions';
import { createFacilities, type FacilitySite } from './facilities';
import { shootAndLand } from './arena-test-shots';

const tick=(sim:ArenaSimulation,n:number)=>{for(let t=0;t<n-.00001;t+=.05)sim.step(Math.min(.05,n-t));};
function setup(facility=false, cover?:()=>number){
 const site:FacilitySite={id:'friendly-depot',name:'Friendly depot',kind:'supply',x:82,y:0,z:0,initialOwner:'armed-forces',deployment:{x:100,z:0,yaw:0}};
 const saved=createFacilities([site]).snapshot(); saved.supplies['armed-forces']=0;saved.sites[0].health=100;
 const env:ArenaEnvironment={bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz}),spawns:[{x:0,z:0}],playerSpawn:{x:0,z:0},endless:true,proxies:createProxyCampaign(),...(facility?{facilities:{sites:[site],saved}}:{})};
 const sim=createArena([],0,'mixed',env,undefined,undefined,cover);
 sim.addPlayer('p','Player',0,0,[{damage:100,interval:.1,capacity:200,reload:.5}],undefined,true);
 return {sim,env};
}
function movePlayer(sim:ArenaSimulation,x:number,z=0){
 for(let i=0;i<100;i++){
 const p=sim.snapshot().actors.find(a=>a.id==='p')!,dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);if(d<.1)return;
 sim.setInput('p',{...p,x:p.x+dx/Math.max(d,1)*Math.min(2,d),z:p.z+dz/Math.max(d,1)*Math.min(2,d),weapon:0,playing:true});sim.step(.05);
 }
}
function start(sim:ArenaSimulation){expect(sim.triggerProxyOperation({x:80,z:0})).toBeTruthy();tick(sim,18.1);}

it('runs only in opted-in expeditions with warning, four operators, snapshot validation and no automatic player war',()=>{
 const {sim,env}=setup();expect(createArena([],0).triggerProxyOperation()).toBe(false);
 expect(sim.triggerProxyOperation({x:80,z:0})).toBeTruthy();expect(sim.snapshot().actors.filter(a=>a.proxyOperation)).toHaveLength(0);
 tick(sim,18.1);const s=sim.snapshot(),cells=s.actors.filter(a=>a.proxyOperation),p=s.actors.find(a=>a.id==='p')!;
 expect(cells).toHaveLength(4);expect(cells.every(a=>!hostile(a,p))).toBe(true);
 expect(hostile(cells[0],cells[2])).toBe(true);expect(validArenaSnapshot(s,env)).toBe(true);expect(validArenaSnapshot(s,{...env,proxies:undefined})).toBe(false);
 expect(sim.triggerProxyOperation({x:80,z:0})).toBe(false);
 const forged=structuredClone(s);const proxy=forged.actors.find(a=>a.proxyOperation)!;proxy.proxyTargets=['p'];expect(validArenaSnapshot(forged,env)).toBe(false);
 delete proxy.proxyTargets;delete proxy.proxyOperation;expect(validArenaSnapshot(forged,env)).toBe(false);
});
it('rejects remote/blocked choices and grants a local choice exactly once',()=>{
 const {sim,env}=setup();start(sim);expect(sim.proxyAction('p','keep')).toBe(false);movePlayer(sim,80);
 expect(sim.proxyAction('p','keep')).toBe(true);expect(sim.proxyAction('p','keep')).toBe(false);
 const s=sim.snapshot();expect(s.proxies!.favor).toEqual({'freedom-force':-20,'collective-cops':0});
 expect(s.actors.filter(a=>a.faction==='freedom-force').every(a=>hostile(a,s.actors.find(a=>a.id==='p')!))).toBe(true);
 expect(validArenaSnapshot(s,env)).toBe(true);
 const blocked=setup(false,()=>0);start(blocked.sim);movePlayer(blocked.sim,80);expect(blocked.sim.proxyAction('p','keep')).toBe(false);
});
it('applies a stolen prototype to real friendly infrastructure without rewarding the rival',()=>{
 const {sim}=setup(true);start(sim);movePlayer(sim,80);expect(sim.proxyAction('p','carry')).toBe(true);
 const before=sim.snapshot().facilities!;expect(sim.proxyAction('p','deliver')).toBe(true);const after=sim.snapshot();
 expect(after.facilities!.supplies['armed-forces']).toBeCloseTo(before.supplies['armed-forces']+60);
 expect(after.facilities!.sites[0].health).toBe(after.facilities!.sites[0].maxHealth);expect(after.facilities!.sites[0].deployIn).toBe(0);
 expect(after.proxies!.favor['collective-cops']).toBe(0);expect(sim.proxyAction('p','deliver')).toBe(false);
});
it('lets a deliberate first shot provoke a neutral proxy, without implicating distant friendly soldiers',()=>{
 const {sim}=setup();start(sim);const proxy=sim.snapshot().actors.find(a=>a.faction==='freedom-force')!;
 movePlayer(sim,proxy.x,proxy.z+8);const p=sim.snapshot().actors.find(a=>a.id==='p')!,victim=sim.snapshot().actors.find(a=>a.id===proxy.id)!;
 const d={x:victim.x-p.x,y:victim.y-.6-p.y,z:victim.z-p.z},len=Math.hypot(d.x,d.y,d.z);
 const shot=shootAndLand(sim,'p',p,{x:d.x/len,y:d.y/len,z:d.z/len},0);
 expect(shot.hitId).toBe(proxy.id);expect(shot.damage).toBeGreaterThan(0);expect(sim.snapshot().proxies!.favor['freedom-force']).toBe(-10);
 expect(sim.snapshot().proxies!.favor['collective-cops']).toBe(0);
});
it('removes the finite cells after the operation and does not respawn them',()=>{
 const {sim}=setup();start(sim);movePlayer(sim,80);expect(sim.proxyAction('p','return')).toBe(true);tick(sim,20);
 expect(sim.snapshot().actors.some(a=>a.proxyOperation)).toBe(false);expect(sim.snapshot().proxies!.operation!.phase).toBe('complete');
 tick(sim,10);expect(sim.snapshot().actors.some(a=>a.proxyOperation)).toBe(false);
});
it('autonomously schedules the first operation and reset removes all encounter hostility',()=>{
 const {sim}=setup();tick(sim,61);expect(sim.snapshot().proxies!.operation).not.toBeNull();sim.reset();
 expect(sim.snapshot().actors.some(a=>a.proxyOperation)).toBe(false);expect(sim.snapshot().proxies!.operation!.phase).toBe('complete');
});
