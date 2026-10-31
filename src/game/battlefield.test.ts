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
