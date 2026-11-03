import { expect, it } from 'vitest';
import * as THREE from 'three';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { createProfile, resolveLoadout, variantSpec } from './armory-state';
import { recoverProxyWeapon, supplyProxyMagazines } from './proxy-equipment';
import { createPooledLoadout, replacePooledWeapon } from './ammo-pools';
import { fireWeapon, advanceWeapon, FPS_WEAPONS, hitDamage } from './fps-rules';
import { OICW_RIFLE, OICW_LAUNCHER, OICW_GRENADE, physicalWeaponFamilies } from './weapon-modes';
import { PROXY_REWARDS } from './proxy-operations';
import { boltCycleMotion } from './fps-weapon-motion';
import { buildServiceWeapon } from './service-weapon-models';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { respawnEquipment } from './respawn-equipment';
import { restoreMagazine, magazineOf } from './magazine-inventory';
import { gunshotSample } from './gunshot-audio';
import { ballisticSegments, flightTime } from './fps-ballistics';
import { shotsToKillOpponent, timeToKill } from './armory-balance';
import { threatOf } from './armor-inserts';

const equipped = (id: string) => resolveLoadout(recoverProxyWeapon(createProfile(), id, 0));
it('adds two Mythic rewards without moving existing family indexes or adding the launcher as another reward', () => {
  expect(PROXY_REWARDS['freedom-force']).toEqual(['ff-scar-l','ff-scar-h','ff-longwatch','ff-oicw','ff-intervention']);
  expect(FPS_WEAPONS.slice(8).map(w=>w.id)).toEqual(['ff-scar-l','ff-scar-h','ff-longwatch','ff-oicw','ff-intervention','ff-oicw-launcher']);
  for(const id of PROXY_REWARDS['freedom-force']) expect(itemById(id)?.tier).toBe('Mythic');
});
it('keeps the two Peace Offering modes in one carry slot with independent physical ammunition through travel and death', () => {
  const profile = recoverProxyWeapon(createProfile(),'ff-oicw',0), equipment = resolveLoadout(profile);
  expect(physicalWeaponFamilies(equipment.carriedFamilies)).toEqual([OICW_RIFLE,2]);
  expect(equipment.carriedFamilies).toContain(OICW_LAUNCHER);
  const states=createPooledLoadout(equipment.weapons,equipment.carriedFamilies);
  const rifle=states[OICW_RIFLE].magazine, launcher=states[OICW_LAUNCHER].magazine;
  expect(fireWeapon(states[OICW_LAUNCHER],OICW_LAUNCHER,equipment.weapons)).toBe(true);
  expect(states[OICW_LAUNCHER].magazine).toBe(launcher-1); expect(states[OICW_RIFLE].magazine).toBe(rifle);
  const restored=createPooledLoadout(equipment.weapons,equipment.carriedFamilies,{ammunition:states});
  expect(restored[OICW_LAUNCHER].magazine).toBe(launcher-1);
  expect(restored[OICW_LAUNCHER].magazineGroup).toBe('20.00:magazine');
  const starting=resolveLoadout(createProfile());
  const removed=replacePooledWeapon(states,equipment.weapons,equipment.carriedFamilies,starting.weapons,starting.carriedFamilies,0);
  expect(removed[0].magazineInventory!.slots.every(m=>m?.caliberMm!==20)).toBe(true);
  const dead=resolveLoadout(respawnEquipment(profile,createProfile())); expect(dead.carriedFamilies).not.toContain(OICW_LAUNCHER);
});
it('provides a distinct sniper calibre, enforces its bolt cadence and gives the hand/bolt time to cycle', () => {
  const e=equipped('ff-intervention'), states=createPooledLoadout(e.weapons,e.carriedFamilies), family=12;
  expect(restoreMagazine(magazineOf(e.weapons[family],family))).toMatchObject({caliberMm:10.36,capacity:7});
  expect(threatOf(10.36)).toBe('heavy'); expect(gunshotSample(10.36).near).toBe('proxy-intervention-shot');
  expect(fireWeapon(states[family],family,e.weapons)).toBe(true);
  advanceWeapon(states[family],family,1.19,e.weapons); expect(fireWeapon(states[family],family,e.weapons)).toBe(false);
  expect(boltCycleMotion(.45).travel).toBeGreaterThan(.9); expect(boltCycleMotion(.45).hand).toBe(1);
  expect(boltCycleMotion(1)).toEqual({hand:0,lift:0,travel:0});
  advanceWeapon(states[family],family,.011,e.weapons); expect(fireWeapon(states[family],family,e.weapons)).toBe(true);
});
it('lets the rifle alone outperform every XM8 in damage, cycle, reach, recoil and ballistics', () => {
  const rifle=equipped('ff-oicw').weapons[OICW_RIFLE];
  const xm8s=ARMORY_CATALOG.filter(i=>i.category==='weapon'&&i.family===5).map(i=>variantSpec(i)!);
  expect(xm8s.length).toBeGreaterThanOrEqual(6);
  for(const other of xm8s){
    for(const distance of [0,25,55,100,145,200,300]) for(const zone of ['body','head'] as const) expect(hitDamage(rifle,distance,zone)).toBeGreaterThan(hitDamage(other,distance,zone));
    expect(rifle.interval).toBeLessThan(other.interval); expect(rifle.recoil).toBeLessThan(other.recoil);
    expect(rifle.recoilRecovery).toBeGreaterThan(other.recoilRecovery); expect(rifle.ballistics.velocity).toBeGreaterThan(other.ballistics.velocity);
    expect(rifle.weightKg!).toBeGreaterThan(other.weightKg!); expect(rifle.mobility).toBeLessThan(other.mobility);
  }
});
it('moves the rear magazine and upper muzzle in launcher mode while leaving the aiming tunnel clear', () => {
  const root=buildServiceWeapon('ff-oicw-launcher')!;
  const magazine=root.getObjectByName('ff-oicw-launcher__magazine')!, muzzle=root.getObjectByName('ff-oicw-launcher__socket_muzzle')!;
  expect(magazine.position.z).toBeGreaterThan(0); expect(muzzle.position.y).toBeCloseTo(.315);
  root.updateMatrixWorld(true);
  expect(new THREE.Raycaster(new THREE.Vector3(0,.442,.8),new THREE.Vector3(0,0,-1),0,2).intersectObject(root,true)).toHaveLength(0);
});
it('hosts a real impact grenade, checks mode ownership and refuses hand-thrown launcher ammunition', () => {
  const e=equipped('ff-oicw');
  const env:ArenaEnvironment={bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawns:[{x:0,z:0}],playerSpawn:{x:0,z:0},move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz}),endless:true};
  const sim=createArena([],0,'mixed',env,undefined,undefined,undefined,(from,to)=>from.z>=-8&&to.z<=-8?{point:{x:0,y:from.y,z:-8},normal:{x:0,y:0,z:1}}:null);
  sim.addPlayer('p','Player',0,0,e.weapons,undefined,true,e.carriedFamilies);
  const actor=()=>sim.snapshot().actors.find(a=>a.id==='p')!;
  sim.setInput('p',{...actor(),weapon:OICW_LAUNCHER,playing:true}); sim.step(.05);
  const input={id:OICW_GRENADE,origin:{x:actor().x,y:actor().y,z:actor().z},direction:{x:0,y:0,z:-1},under:false,cooked:0};
  sim.setPlayerGrenades('p',{[OICW_GRENADE]:10}); expect(sim.throwGrenade('p',input)).toBe(false);
  sim.shoot('p',input.origin,input.direction,OICW_LAUNCHER); expect(sim.snapshot().grenades).toHaveLength(1);
  sim.shoot('p',input.origin,input.direction,OICW_LAUNCHER); expect(sim.snapshot().grenades).toHaveLength(1);
  expect(validArenaSnapshot(sim.snapshot())).toBe(true);
  for(let t=0;t<.3;t+=.01)sim.step(.01);
  expect(sim.snapshot().grenades).toHaveLength(0); expect(sim.snapshot().grenadeEvents?.[0].id).toBe(OICW_GRENADE);
  const normal=resolveLoadout(createProfile());sim.addPlayer('q','No launcher',0,0,normal.weapons,undefined,true,normal.carriedFamilies);
  const q=sim.snapshot().actors.find(a=>a.id==='q')!;sim.setInput('q',{...q,weapon:OICW_LAUNCHER,playing:true});sim.step(.05);
  sim.shoot('q',q,{x:0,y:0,z:-1},OICW_LAUNCHER); expect(sim.snapshot().grenades).toHaveLength(0);
});

it('refits excess rifle spares for the cargo launcher kit without converting retained magazines or other ammunition', () => {
 const old=resolveLoadout(createProfile()), e=equipped('ff-oicw');
 const states=replacePooledWeapon(createPooledLoadout(old.weapons,old.carriedFamilies),old.weapons,old.carriedFamilies,e.weapons,e.carriedFamilies,OICW_RIFLE);
 expect(supplyProxyMagazines(states,OICW_RIFLE)).toBe(2);
 const slots=states[OICW_RIFLE].magazineInventory!.slots;
 expect(slots.filter(m=>m?.caliberMm===20)).toHaveLength(2);
 expect(slots.filter(m=>m?.caliberMm===5.56)).toHaveLength(2);
 expect(slots.filter(m=>m?.caliberMm===5.56).every(m=>m?.capacity===30)).toBe(true);
 expect(slots.filter(m=>m?.caliberMm===9)).toHaveLength(2);
});

it('gives Smart Power enough ammunition and faster follow-ups for the actual proxy recovery cell', () => {
  const e = equipped('ff-longwatch'), rifle = e.weapons[10];
  const operator = { id: 'proxy', name: 'FF operator', health: 110, armor: 65, absorption: .45 };
  const hits = shotsToKillOpponent(operator, hitDamage(rifle, 60), rifle.caliberMm);
  expect(hits).toBe(2);
  expect(timeToKill(hits, rifle.interval)).toBeLessThanOrEqual(.24);
  // At 50% body-hit accuracy, the two-person cell leaves over half a magazine.
  expect(rifle.capacity - hits * 2 * 2).toBeGreaterThanOrEqual(12);
  expect(shotsToKillOpponent(operator, hitDamage(rifle, 60, 'head'), rifle.caliberMm)).toBe(1);
  const states = createPooledLoadout(e.weapons, e.carriedFamilies);
  expect(magazineOf(rifle, 10).capacity).toBe(20);
  expect(fireWeapon(states[10], 10, e.weapons)).toBe(true);
  advanceWeapon(states[10], 10, .23, e.weapons);
  expect(fireWeapon(states[10], 10, e.weapons)).toBe(false);
  advanceWeapon(states[10], 10, .011, e.weapons);
  expect(fireWeapon(states[10], 10, e.weapons)).toBe(true);
});

it.each(['ff-longwatch', 'ff-intervention'])('%s sends its faster, flatter round through arena authority', id => {
  const e = equipped(id), family = itemById(id)!.family!, weapon = e.weapons[family];
  const rifle = equipped('ff-oicw').weapons[OICW_RIFLE];
  expect(weapon.ballistics.velocity).toBeGreaterThan(rifle.ballistics.velocity);
  expect(flightTime(300, weapon.ballistics)).toBeLessThan(id === 'ff-longwatch' ? .43 : .37);
  const arc = ballisticSegments({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, weapon.ballistics, 300);
  expect(-arc.at(-1)!.to.y).toBeLessThan(id === 'ff-longwatch' ? .9 : .7);
  expect(weapon.ballistics.drop).toBe(9.8);
  const env: ArenaEnvironment = { bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 }, spawns: [{ x: 0, z: 0 }], playerSpawn: { x: 0, z: 0 }, move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), endless: true };
  const sim = createArena([], 0, 'mixed', env);
  sim.addPlayer('p', 'Player', 0, 0, e.weapons, undefined, true, e.carriedFamilies);
  const actor = sim.snapshot().actors.find(a => a.id === 'p')!;
  sim.setInput('p', { ...actor, weapon: family, playing: true });sim.step(.01);
  sim.shoot('p', actor, { x: 0, y: 0, z: -1 }, family);sim.step(.01);
  expect(sim.snapshot().rounds?.[0]).toMatchObject({ shooter: 'p', velocity: weapon.ballistics.velocity, drop: 9.8, power: id === 'ff-longwatch' ? 105 : 160 });
  expect(validArenaSnapshot(sim.snapshot())).toBe(true);
});
