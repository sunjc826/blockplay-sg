import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { createProxyCampaign } from './proxy-operations';
import { validArenaSnapshot } from './arena-runtime';
import { hostile } from './arena-factions';
import { createFacilities, type FacilitySite } from './facilities';
import { shootAndLand } from './arena-test-shots';

const tick=(sim:ArenaSimulation,n:number)=>{for(let t=0;t<n-.00001;t+=.05)sim.step(Math.min(.05,n-t));};
function setup(facility=false, cover?:Parameters<typeof createArena>[6]){
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
 movePlayer(sim,proxy.x+8,proxy.z);const p=sim.snapshot().actors.find(a=>a.id==='p')!,victim=sim.snapshot().actors.find(a=>a.id===proxy.id)!;
 const d={x:victim.x-p.x,y:victim.y-.6-p.y,z:victim.z-p.z},len=Math.hypot(d.x,d.y,d.z);
 const shot=shootAndLand(sim,'p',p,{x:d.x/len,y:d.y/len,z:d.z/len},0);
 expect(sim.snapshot().actors.find(a=>a.id===shot.hitId)?.faction).toBe('freedom-force');expect(shot.damage).toBeGreaterThan(0);expect(sim.snapshot().proxies!.favor['freedom-force']).toBe(-10);
 expect(sim.snapshot().proxies!.favor['collective-cops']).toBe(0);
});
it('keeps visible retreating operators past the deadline, then removes them behind cover without respawning',()=>{
 let hidden=false,onlySecondObserver=false;
 const {sim,env}=setup(false,origin=>hidden?0:onlySecondObserver&&Math.abs(origin.x-82)>.01?0:Infinity);
 start(sim);movePlayer(sim,80);expect(sim.proxyAction('p','return')).toBe(true);
 env.playerSpawn={x:82,z:0};sim.addPlayer('observer','Observer',0,0,undefined,undefined,true);
 const before=sim.snapshot().actors.filter(a=>a.proxyOperation);
 tick(sim,20);
 const after=sim.snapshot(),survivors=after.actors.filter(a=>a.proxyOperation);
 expect(after.proxies!.operation!.phase).toBe('complete');expect(survivors.length).toBeGreaterThan(0);
 expect(survivors.every(a=>a.alive && a.objective==='Withdraw' && Math.hypot(a.x-80,a.z)>Math.hypot(before.find(b=>b.id===a.id)!.x-80,before.find(b=>b.id===a.id)!.z))).toBe(true);
 expect(validArenaSnapshot(after,env)).toBe(true);expect(sim.triggerProxyOperation({x:80,z:0})).toBe(false);
 onlySecondObserver=true;tick(sim,2);expect(sim.snapshot().actors.filter(a=>a.proxyOperation)).toHaveLength(survivors.length);
 hidden=true;tick(sim,.5);expect(sim.snapshot().actors.filter(a=>a.proxyOperation)).toHaveLength(survivors.length);
 hidden=false;tick(sim,.1);hidden=true;tick(sim,.6);expect(sim.snapshot().actors.filter(a=>a.proxyOperation)).toHaveLength(survivors.length);
 tick(sim,.7);expect(sim.snapshot().actors.some(a=>a.proxyOperation)).toBe(false);
 tick(sim,10);expect(sim.snapshot().actors.some(a=>a.proxyOperation)).toBe(false);
});
it('shows separated, non-firing parachute cells during the warning and lands them before recovery',()=>{
 const {sim,env}=setup();expect(sim.triggerProxyOperation({x:80,z:0})).toBe(true);
 tick(sim,5.9);expect(sim.snapshot().actors.filter(a=>a.proxyOperation)).toHaveLength(0);
 tick(sim,2);const airborne=sim.snapshot(),cells=airborne.actors.filter(a=>a.proxyOperation);
 expect(airborne.proxies!.operation!.phase).toBe('incoming');expect(cells).toHaveLength(4);
 expect(cells.every(a=>a.parachuting && a.y>40 && a.shots===0 && a.objective==='Parachute insertion')).toBe(true);
 expect(validArenaSnapshot(airborne,env)).toBe(true);
 for(const faction of ['freedom-force','collective-cops']){const [a,b]=cells.filter(a=>a.faction===faction);expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeCloseTo(7);}
 tick(sim,4);expect(sim.snapshot().actors.filter(a=>a.proxyOperation).every(a=>a.y<cells.find(b=>a.id===b.id)!.y && a.shots===0)).toBe(true);
 tick(sim,6.3);const landed=sim.snapshot();expect(landed.proxies!.operation!.phase).toBe('contested');
 expect(landed.actors.filter(a=>a.proxyOperation).every(a=>!a.parachuting && a.y<2)).toBe(true);
 expect(validArenaSnapshot(landed,env)).toBe(true);
});
it('rechecks every drop column before insertion and aborts the whole cell when one is compromised',()=>{
 const {sim,env}=setup();let calls=0,blocked=false;
 env.dropColumnClear=()=>{calls++;return !blocked || calls%4!==0;};
 expect(sim.triggerProxyOperation({x:80,z:0})).toBe(true);calls=0;blocked=true;tick(sim,6.1);
 expect(sim.snapshot().proxies!.operation!.phase).toBe('withdrawing');expect(sim.snapshot().actors.filter(a=>a.proxyOperation)).toHaveLength(0);
});
it('never inserts operators through a blocked canopy column',()=>{
 const {sim,env}=setup();env.dropColumnClear=()=>false;
 expect(sim.triggerProxyOperation({x:80,z:0})).toBe(false);expect(sim.snapshot().actors.some(a=>a.proxyOperation)).toBe(false);
});
it('autonomously schedules the first operation and reset removes all encounter hostility',()=>{
 const {sim}=setup();tick(sim,61);expect(sim.snapshot().proxies!.operation).not.toBeNull();sim.reset();
 expect(sim.snapshot().actors.some(a=>a.proxyOperation)).toBe(false);expect(sim.snapshot().proxies!.operation!.phase).toBe('complete');
});
