import { expect, it } from 'vitest';
import { assignBattlefieldFronts, BATTLEFIELD_POPULATIONS, type BattlefieldSize } from './battlefield';
import { createFacilities, type FacilitySite, facilityActionFor } from './facilities';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';

const sites: FacilitySite[] = [
  {id:'home',name:'Home',kind:'command',x:-100,z:0,y:0,initialOwner:'armed-forces',deployment:{x:-100,z:0,yaw:0}},
  {id:'enemy',name:'Enemy',kind:'command',x:100,z:0,y:0,initialOwner:'mercenaries',deployment:{x:100,z:0,yaw:0}},
  ...[-70,0,70].map((z,i):FacilitySite=>({id:`front-${i}`,name:`Front ${i}`,kind:i===2?'supply':'command',x:0,z,y:0,initialOwner:null,initiallyBuilt:true,deployment:{x:0,z,yaw:0}})),
];
it('assigns distinct fronts to three nearby squads while retaining a rear guard',()=>{
  const facilities=createFacilities(sites),squads=Array.from({length:5},(_,i)=>({id:`squad-${i}`,faction:'mercenaries' as const,x:90,z:0}));
  const first=assignBattlefieldFronts(squads,facilities.sites);
  expect(new Set(first.values()).size).toBe(5);
  expect([...first.values()]).toContain('enemy');
  const next=assignBattlefieldFronts(squads.map(s=>({...s,previous:first.get(s.id)})),facilities.sites);
  expect([...next]).toEqual([...first]);
});
it('makes neutral forward posts capturable and supply ownership increase income',()=>{
  const facilities=createFacilities(sites);
  expect(facilityActionFor(facilities.sites[2],'armed-forces')).toBe('capture');
  const worker={id:'p',x:0,z:72,y:1.75,feet:0,faction:'armed-forces',alive:true};
  facilities.step(.1,[worker]);expect(facilities.request('front-2','p')).toBe(true);
  facilities.step(24,[worker]);expect(facilities.sites[4].owner).toBe('armed-forces');
  facilities.step(10,[]);
  expect(facilities.supplies['armed-forces']-facilities.supplies.mercenaries).toBeCloseTo(5);
});
it('treats adjacent objectives as one front when another part of the map needs troops',()=>{
  const locations=createFacilities([sites[0],sites[1],...sites.slice(2).map((s,i)=>({...s,x:0,z:[0,18,130][i]}))]);
  const squads=Array.from({length:3},(_,i)=>({id:`squad-${i}`,faction:'armed-forces' as const,x:-90,z:0}));
  const targets=[...assignBattlefieldFronts(squads,locations.sites).values()];
  expect(targets).toContain('home');expect(targets).toContain('front-0');expect(targets).toContain('front-2');expect(targets).not.toContain('front-1');
});
it('keeps surplus squads attacking when most posts are already friendly, including a contested home',()=>{
  const facilities=createFacilities(sites);
  facilities.sites.forEach(s=>{s.owner='armed-forces';s.health=s.maxHealth;});
  facilities.sites[1].owner='mercenaries';facilities.sites[0].contested=true;
  const squads=Array.from({length:8},(_,i)=>({id:`squad-${i}`,faction:'armed-forces' as const,x:-90,z:0,previous:'home'}));
  const assignments=assignBattlefieldFronts(squads,facilities.sites);
  expect([...assignments.values()].filter(id=>id==='home')).toHaveLength(1);
  expect([...assignments.values()].filter(id=>id==='enemy')).toHaveLength(7);
});
it('keeps at least half the living soldiers attacking with uneven squad casualties',()=>{
  const facilities=createFacilities(sites.slice(0,2));
  const squads=[4,1,1].map((members,i)=>({id:`squad-${i}`,faction:'armed-forces' as const,x:-90,z:0,members,previous:i===0?'home':undefined}));
  const assignments=assignBattlefieldFronts(squads,facilities.sites);
  const attacking=squads.filter(s=>assignments.get(s.id)==='enemy').reduce((n,s)=>n+s.members,0);
  expect(attacking).toBeGreaterThanOrEqual(3);
  expect(assignments.get('squad-0')).toBe('enemy');
});
it('sends one- and two-squad teams forward and still assigns patrols after total map control',()=>{
  const facilities=createFacilities(sites.slice(0,2));
  for(const count of [1,2,5]) {
    const squads=Array.from({length:count},(_,i)=>({id:`squad-${i}`,faction:'armed-forces' as const,x:-90,z:0}));
    const targets=[...assignBattlefieldFronts(squads,facilities.sites).values()];
    expect(targets.filter(id=>id==='enemy').length).toBeGreaterThanOrEqual(Math.ceil(count/2));
    facilities.sites[1].owner='armed-forces';
    expect(assignBattlefieldFronts(squads,facilities.sites).size).toBe(count);
    expect(assignBattlefieldFronts(squads,facilities.sites.slice(0,1)).size).toBe(count);
    facilities.sites[1].owner='mercenaries';
  }
});
it.each([32,48,64] as BattlefieldSize[])('starts and resets exactly %i regular AI with valid snapshots and several fronts',size=>{
  const environment:ArenaEnvironment={bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz}),spawns:[{x:120,z:100},{x:-120,z:100}],endless:true,reinforcements:true,battlefield:{size},facilities:{sites}};
  const arena=createArena([],0,'mixed',environment);
  for(let round=0;round<2;round++) {
    const initial=arena.snapshot().actors.filter(a=>a.bot);
    expect(initial).toHaveLength(size);
    for(const side of ['mercenaries','armed-forces'] as const) expect(initial.filter(a=>a.faction===side)).toHaveLength(BATTLEFIELD_POPULATIONS[size][side]);
    for(let i=0;i<100;i++)arena.step(.05);
    const snapshot=arena.snapshot();expect(validArenaSnapshot(snapshot,environment)).toBe(true);
    for(const side of ['mercenaries','armed-forces']) expect(new Set(snapshot.actors.filter(a=>a.bot&&a.faction===side).map(a=>a.objective)).size).toBeGreaterThanOrEqual(3);
    arena.reset();
  }
});
