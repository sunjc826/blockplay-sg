import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { TDM_AREAS } from './arena-match';
import { SMITH_CONTROL_SITES } from './hardpoint';
import { supplyProfile } from './fps-healing';
import { FPS_WEAPONS } from './fps-rules';
import { itemById } from './armory-catalog';
import { validArenaSnapshot } from './arena-runtime';
import { shootAndLand } from './arena-test-shots';
import { matchArmorCard, matchArmorGain, matchArmorLoot, matchBotArmor, matchRegeneratedHealth, MAX_MATCH_ARMOR_DROPS } from './match-recovery';

function setup(mode: 'tdm' | 'hardpoint' | 'ffa' | 'expedition') {
  const bounds={minX:-150,maxX:150,minZ:-150,maxZ:150};
  const area={...TDM_AREAS[0],bounds,spawns:{alpha:[-80,-40,0,40,80].map(z=>({x:-35,z})),bravo:[-80,-40,0,40,80].map(z=>({x:35,z}))}};
  let moving=false, clear=false;
  const environment:ArenaEnvironment={bounds,spawns:[...area.spawns.alpha,...area.spawns.bravo],move:(p,dx,dz)=>moving?{x:p.x+dx,z:p.z+dz}:p,
    ...(mode==='tdm'?{teamDeathmatch:area}:mode==='hardpoint'?{hardpoint:{area,sites:SMITH_CONTROL_SITES}}:mode==='expedition'?{endless:true}:{})};
  const arena=createArena([],mode==='ffa'||mode==='expedition'?1:0,'heavy',environment,undefined,undefined,()=>clear?Infinity:0);
  arena.addPlayer('player','Player',75,.65,FPS_WEAPONS.map(w=>({...w,damage:200})),undefined,false,[0,2]);
  const actor=(id='player')=>arena.snapshot().actors.find(a=>a.id===id)!;
  const step=(seconds:number)=>{for(let i=0;i<Math.round(seconds*20);i++)arena.step(.05);};
  const enemy=()=>arena.snapshot().actors.find(a=>a.bot&&(!actor().team||a.team!==actor().team)&&a.role==='heavy')!;
  const kill=()=>{
    const target=enemy();step(3.1);
    for(let i=0;i<8&&actor(target.id).alive;i++) {
      const a=actor(),b=actor(target.id),dx=b.x-a.x,dy=b.y-.6-a.y,dz=b.z-a.z,d=Math.hypot(dx,dy,dz);
      clear=true;const hit=shootAndLand(arena,a.id,a,{x:dx/d,y:dy/d,z:dz/d},0);clear=false;
      expect(hit.hitId).toBe(target.id);if(!hit.killed)step(.2);
    }
    expect(actor(target.id).alive).toBe(false);
    return arena.snapshot().armorDrops?.at(-1);
  };
  const walk=(x:number,z:number)=>{for(let i=0;i<400&&Math.hypot(actor().x-x,actor().z-z)>.1;i++) {moving=true;arena.setInput('player',{...actor(),x,z,playing:true});moving=false;step(.05);}};
  const pickup=(id:string,blocked=false)=>{clear=!blocked;const result=arena.pickupArmor('player',id);clear=false;return result;};
  return {arena,actor,step,kill,walk,pickup,environment,enemy};
}
it.each(['tdm','hardpoint','ffa'] as const)('%s regenerates health after quiet time, restarts on damage and never regenerates armor',mode=>{
  const {arena,actor,step}=setup(mode);
  arena.setPlayerVitals('player',{health:40,armor:20});step(7);expect(actor().health).toBeCloseTo(40);
  step(1);expect(actor().health).toBeCloseTo(50);expect(actor().armor).toBe(20);
  arena.setPlayerVitals('player',{health:40});step(6.9);expect(actor().health).toBeCloseTo(40);
  step(7);expect(actor().health).toBe(100);expect(actor().armor).toBe(20);
  arena.setInput('player',{...actor(),playing:false});arena.setPlayerVitals('player',{health:20});step(8);expect(actor().health).toBe(20);
  arena.setInput('player',{...actor(),playing:true});arena.setPlayerVitals('player',{health:0});step(.5);expect(actor().alive).toBe(false);expect(actor().health).toBe(0);
});
it('keeps fractional tick boundaries accurate and leaves expedition healing unchanged',()=>{
  expect(matchRegeneratedHealth(40,100,0,7.1,.25)).toBeCloseTo(41);
  expect(matchRegeneratedHealth(99,100,0,9,.25)).toBe(100);
  const {arena,actor,step}=setup('expedition');arena.setPlayerVitals('player',{health:40});step(8);expect(actor().health).toBe(40);
});
it('keeps a first aid kit substantially faster than passive recovery',()=>{
  const {arena,actor,step}=setup('ffa');
  arena.setPlayerSupplies('player',{'kit-first-aid':1});arena.setPlayerVitals('player',{health:20});
  step(supplyProfile(itemById('kit-first-aid')!).seconds);
  expect(actor().health).toBe(20);
  expect(arena.useSupply('player','kit-first-aid')).toBe(true);expect(actor().health).toBe(95);
});
it('maps rifle and support ranks to progressively stronger, rated armor',()=>{
  expect([1,2,3].map(rank=>matchBotArmor('assault',rank))).toEqual(['plate-soft','plate-ceramic','plate-elite']);
  for(const role of ['tank','heavy'])expect([1,2,3].map(rank=>matchBotArmor(role,rank))).toEqual(['plate-steel','plate-composite','plate-pillbox']);
  expect(matchArmorGain(75,75,'plate-soft')).toMatchObject({blocked:true});
  expect(matchArmorGain(10,110,'plate-soft')).toEqual({equip:false,armor:45,blocked:false});
  expect(matchArmorGain(0,0,'plate-soft')).toEqual({equip:true,armor:35,blocked:false});
});
it.each(['tdm','hardpoint','ffa'] as const)('%s shares role/rank armor drops, validates claims and restores starting armor on respawn',mode=>{
  const {arena,actor,kill,walk,pickup,step,environment,enemy}=setup(mode);
  const target=enemy(),drop=kill()!;
  expect(drop.catalogId).toBe(matchBotArmor(target.role,target.rank));
  expect(validArenaSnapshot(arena.snapshot(),environment)).toBe(true);
  expect(pickup(drop.id)).toBe(false);walk(drop.x,drop.z);
  expect(pickup(drop.id,true)).toBe(false);expect(pickup('missing')).toBe(false);
  expect(pickup(drop.id)).toBe(true);
  expect(actor().armor).toBe(itemById(drop.catalogId)!.protection);
  expect(actor().armorPickup).toMatchObject({catalogId:drop.catalogId,plateId:drop.catalogId});
  expect(pickup(drop.id)).toBe(false);
  const receipt=arena.snapshot().actors.find(a=>a.id==='player')!.armorPickup!;receipt.plateId='bad';
  expect(actor().armorPickup!.plateId).toBe(drop.catalogId);
  const card=matchArmorCard(matchArmorLoot(drop,'chinatown'),75,75);
  expect(card.action).toBe('Equip');expect(card.note).toContain('respawn');expect(card.description).toBe(itemById(drop.catalogId)!.description);
  arena.setPlayerVitals('player',{health:0});step(6);
  expect(actor()).toMatchObject({alive:true,armor:75});expect(actor().armorPickup).toBeUndefined();
  const next=kill()!;walk(next.x,next.z);expect(pickup(next.id)).toBe(true);
  arena.reset();expect(actor().armor).toBe(75);expect(actor().armorPickup).toBeUndefined();expect(arena.snapshot().armorDrops).toEqual([]);
});
it('repairs without downgrading, handles expired rented spawn armor, and expires unclaimed drops',()=>{
  const {arena,actor,kill,walk,pickup,step}=setup('ffa');
  const first=kill()!;walk(first.x,first.z);expect(pickup(first.id)).toBe(true);
  arena.setPlayerVitals('player',{armor:10});
  arena.setPlayerEquipmentRentals('player',{'plate-ceramic':0});step(.05);
  expect(actor().armor).toBe(10);
  const next=kill()!;walk(next.x,next.z);expect(pickup(next.id)).toBe(true);expect(actor().armor).toBeGreaterThan(10);
  const expired=kill()!;step(45.1);expect(pickup(expired.id)).toBe(false);expect(arena.snapshot().armorDrops).toEqual([]);
  arena.setPlayerVitals('player',{health:0});step(6);expect(actor().armor).toBe(0);
});
it('rejects malformed, duplicate and excessive armor snapshots and receipts',()=>{
  const {arena,kill,environment}=setup('ffa');kill();
  for(const mutate of [
    (s:ReturnType<typeof arena.snapshot>)=>{s.armorDrops![0].catalogId='sar-issued';},
    (s:ReturnType<typeof arena.snapshot>)=>{s.armorDrops![0].expires=Infinity;},
    (s:ReturnType<typeof arena.snapshot>)=>{s.armorDrops![0].x=99999;},
    (s:ReturnType<typeof arena.snapshot>)=>{s.armorDrops!.push({...s.armorDrops![0]});},
    (s:ReturnType<typeof arena.snapshot>)=>{s.armorDrops=Array.from({length:MAX_MATCH_ARMOR_DROPS+1},(_,i)=>({...s.armorDrops![0],id:`match-armor-${i}`}));},
    (s:ReturnType<typeof arena.snapshot>)=>{s.actors.find(a=>a.id==='player')!.armorPickup={serial:1,catalogId:'plate-soft',plateId:'sar-issued'};},
  ]) {const s=arena.snapshot();mutate(s);expect(validArenaSnapshot(s,environment)).toBe(false);}
  expect(validArenaSnapshot(arena.snapshot(),{...environment,endless:true})).toBe(false);
  expect(setup('expedition').kill()).toBeUndefined();
});
