import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { shootAndLand } from './arena-test-shots';
import { createRegionMovement } from './region-collision';
import type { StreakId } from './match-streaks';
const tick = (a: ArenaSimulation, n: number) => { for (let t = 0; t < n - 1e-6; t += .05) a.step(Math.min(.05, n - t)); };
const actor = (a: ArenaSimulation, id: string) => a.snapshot().actors.find(a => a.id === id)!;
function setup(loadout: StreakId[] = ['recon', 'hunter', 'strike']) {
  const bounds = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  const environment: ArenaEnvironment = { bounds, move: createRegionMovement(bounds).move, spawns: [{x:0,z:0},{x:0,z:-20},{x:30,z:-20}] };
  let roof = false;
  const a = createArena([], 0, 'mixed', environment, undefined, undefined, (_p, ray) => roof && ray.y > .9 ? 1 : Infinity);
  for (const id of ['one', 'two']) a.addPlayer(id, id, 0, 0, [{damage:200,interval:.06,capacity:100,reload:.4}]);
  expect(a.configureStreaks('one', loadout)).toBe(true);
  tick(a, 3.1);
  function earn(count: number) {
    for (let i = 0; i < count; i++) {
      a.setPlayerVitals('two', { health: 100 }); const shooter = actor(a, 'one'), target = actor(a, 'two');
      const dx = target.x - shooter.x, dy = target.y - .6 - shooter.y, dz = target.z - shooter.z, d = Math.hypot(dx,dy,dz);
      expect(shootAndLand(a,'one',shooter,{x:dx/d,y:dy/d,z:dz/d},0).killed).toBe(true); tick(a,.1);
    }
  }
  return { a, environment, earn, roof: () => roof = true };
}
it('earns from actual kills, validates snapshots, rejects unearned rewards and locks selection', () => {
  const { a, environment, earn } = setup();
  expect(a.activateStreak('one','recon')).toBe(false);
  earn(3); expect(a.snapshot().streaks?.players.one.ready).toEqual(['recon']);
  expect(a.configureStreaks('one',['jammer','hunter','strike'])).toBe(false);
  expect(a.activateStreak('one','recon')).toBe(true); expect(a.activateStreak('one','recon')).toBe(false);
  expect(validArenaSnapshot(a.snapshot(), environment)).toBe(true);
  a.setPlayerVitals('one', {health:0}); expect(a.snapshot().streaks?.players.one.charge).toBe(0);
});
it('launches along aim and reuses autonomous drone acquisition with credited, non-chaining damage', () => {
  const { a, environment, earn } = setup(); earn(5);
  a.setPlayerVitals('two',{health:1}); const self = actor(a,'one'); a.setInput('one',{...self,yaw:Math.PI/2,pitch:0,playing:true});
  const before = actor(a,'one').kills;
  expect(a.activateStreak('one','hunter')).toBe(true);
  const initial = a.snapshot(); expect(initial.raiders?.[0].x).toBeLessThan(self.x);
  expect(initial.streaks?.effects[0].owner).toBe('one'); expect(validArenaSnapshot(initial,environment)).toBe(true);
  let locked = false;
  for(let i=0;i<500 && actor(a,'one').kills===before;i++){a.step(.05); const s=a.snapshot(); if(s.raiders?.some(r=>r.state==='lock'||r.state==='dive'))locked=true; expect(validArenaSnapshot(s,environment)).toBe(true);}
  expect(locked).toBe(true); expect(actor(a,'one').kills).toBe(before+1);
  expect(a.snapshot().streaks?.players.one.charge).toBe(500);
  expect(a.snapshot().feed.some(e=>e.killerId==='one'&&e.cause==='Hunter Drone')).toBe(true);
});
it('precision strike warns, credits kills, respects overhead cover and cannot chain', () => {
  for(const sheltered of [false,true]){
    const {a,earn,roof}=setup();earn(6);a.setPlayerVitals('two',{health:100});const target=actor(a,'two');
    expect(a.activateStreak('one','strike',{x:target.x,y:0,z:target.z})).toBe(true);
    if(sheltered)roof();tick(a,2.8);expect(actor(a,'two').alive).toBe(true);tick(a,.3);
    expect(actor(a,'two').alive).toBe(sheltered);expect(a.snapshot().streaks?.players.one.charge).toBe(600);
  }
});
it('invalid placement retains rewards; departure removes airborne rewards and contacts', () => {
  const {a,environment,earn}=setup();earn(6);
  expect(a.activateStreak('one','strike',{x:NaN,y:0,z:0})).toBe(false);
  expect(a.activateStreak('one','strike',{x:500,y:0,z:0})).toBe(false);
  expect(a.snapshot().streaks?.players.one.ready).toContain('strike');
  expect(a.activateStreak('one','hunter')).toBe(true);a.removePlayer('one');
  expect(a.snapshot().streaks?.effects).toEqual([]);expect(a.snapshot().raiders).toBeUndefined();expect(validArenaSnapshot(a.snapshot(),environment)).toBe(true);
});
it('does not enable streak rewards in endless expedition simulations', () => {
  const a=createArena([],0,'mixed',{bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},move:(p)=>p,spawns:[{x:0,z:0}],endless:true});a.addPlayer('one','One');
  expect(a.snapshot().streaks).toBeUndefined();expect(a.configureStreaks('one',['recon','hunter','strike'])).toBe(false);expect(a.activateStreak('one','recon')).toBe(false);
});

it('authority accepts a 200m designation but retains the reward beyond 250m', () => {
  const { a, earn, environment } = setup(); earn(6);
  const self = actor(a, 'one');
  expect(a.activateStreak('one', 'strike', { x: self.x, y: 0, z: self.z - 251 })).toBe(false);
  expect(a.snapshot().streaks?.players.one.ready).toContain('strike');
  expect(a.activateStreak('one', 'strike', { x: self.x, y: 0, z: self.z - 200 })).toBe(true);
  expect(a.snapshot().streaks?.players.one.ready).not.toContain('strike');
  expect(validArenaSnapshot(a.snapshot(), environment)).toBe(true);
});
it('strike kills across its core and damages the outer ring without extending beyond it', () => {
  for (const [offset, health] of [[4, 0], [7, 0], [8, 40], [8.1, 100]]) {
    const { a, earn } = setup(); earn(6);
    a.setPlayerVitals('two', { health: 100 }); const target = actor(a, 'two');
    expect(a.activateStreak('one', 'strike', { x: target.x + offset, y: 0, z: target.z })).toBe(true);
    tick(a, 3.01);
    expect(actor(a, 'two').health).toBeCloseTo(health);
    expect(a.snapshot().streaks?.players.one.charge).toBe(600);
  }
});
