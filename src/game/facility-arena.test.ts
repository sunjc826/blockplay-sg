import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { moveInMarina } from './marina-collision';
import { shootAndLand } from './arena-test-shots';
import type { FacilitySite } from './facilities';

const garage: FacilitySite = { id: 'garage', name: 'Garage', kind: 'garage', x: 0, y: 0, z: 0, initialOwner: 'mercenaries', deployment: { x: 50, z: 0, yaw: 0 } };
const open = (sites = [garage]): ArenaEnvironment => ({ bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, move: moveInMarina, spawns: [{ x: 100, z: 100 }, { x: -100, z: -100 }], playerSpawn: { x: 3, z: 0 }, endless: true, reinforcements: true, facilities: { sites } });
const tick = (a: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - .001; t += .05) a.step(.05); };
const soldier = (a: ArenaSimulation) => a.snapshot().actors.find(p => p.id === 'p')!;
const player = (a: ArenaSimulation) => a.addPlayer('p', 'Operator', 0, 0, [{ damage: 200, interval: .1, capacity: 200, reload: 1 }], undefined, true);

it('applies real ballistic damage to infrastructure and keeps friendly equipment protected', () => {
  const env = open(), a = createArena([], 0, 'mixed', env); player(a);
  for (let i = 0; i < 4; i++) {
    const hit = shootAndLand(a, 'p', soldier(a), { x: -1, y: 0, z: 0 }, 0);
    expect(hit.hitId).toBe('facility-garage'); tick(a, .15);
  }
  expect(a.snapshot().facilities!.sites[0].health).toBe(0);
  expect(a.snapshot().actors.find(p => p.id === 'p')!.kills).toBe(0);
  expect(a.snapshot().feed.some(f => f.text.includes('equipment destroyed'))).toBe(true);
  expect(validArenaSnapshot(a.snapshot(), env)).toBe(true);
});

it('does not allow shooting equipment through a wall', () => {
  const a = createArena([{ minX: 1, maxX: 1.2, minZ: -4, maxZ: 4 }], 0, 'mixed', open()); player(a);
  shootAndLand(a, 'p', soldier(a), { x: -1, y: 0, z: 0 }, 0);
  expect(a.snapshot().facilities!.sites[0].health).toBe(650);
});

it('protects allied equipment from real bullets and damages hostile equipment with grenades', () => {
  const allied = createArena([], 0, 'mixed', open([{ ...garage, initialOwner: 'armed-forces' }])); player(allied);
  shootAndLand(allied, 'p', soldier(allied), { x: -1, y: 0, z: 0 }, 0);
  expect(allied.snapshot().facilities!.sites[0].health).toBe(650);
  const enemy = createArena([], 0, 'mixed', open()); player(enemy);
  enemy.setPlayerGrenades('p', { 'grenade-frag': 1 });
  expect(enemy.throwGrenade('p', { id: 'grenade-frag', origin: soldier(enemy), direction: { x: -1, y: .1, z: 0 }, under: true, cooked: 3 })).toBe(true);
  tick(enemy, 4); expect(enemy.snapshot().facilities!.sites[0].health).toBeLessThan(650);
});

it('checks current position and life on requests between simulation ticks', () => {
  const a = createArena([], 0, 'mixed', open()); player(a); tick(a, .25);
  a.setInput('p', { ...soldier(a), x: 8, playing: true });
  expect(a.facilityAction('p', 'garage')).toBe(false);
});

it('validates contextual actions at the host and captures an intact enemy garage', () => {
  const env = open(), a = createArena([], 0, 'mixed', env); player(a); tick(a, .1);
  expect(a.facilityAction('forged-player', 'garage')).toBe(false);
  expect(a.facilityAction('p', 'unknown-site')).toBe(false);
  expect(a.facilityAction('p', 'garage')).toBe(true); tick(a, 25);
  expect(a.snapshot().facilities!.sites[0].owner).toBe('armed-forces');
  expect(a.snapshot().facilities!.sites[0].health).toBe(650);
  expect(validArenaSnapshot(a.snapshot(), env)).toBe(true);
});

it('only replaces a destroyed vehicle after its facility has been built', () => {
  const env = open([{ ...garage, initialOwner: null }]);
  const vehicles = { spawns: { car: { x: 50, z: 0, yaw: 0 }, helicopter: { x: 100, z: 0, yaw: 0 } }, openWorld: true };
  const a = createArena([], 0, 'mixed', env, vehicles); player(a); tick(a, 48);
  expect(a.snapshot().vehicles![0].health).toBe(0);
  expect(a.facilityAction('p', 'garage')).toBe(true); tick(a, 32);
  const car = a.snapshot().vehicles![0]; expect(car.health).toBeGreaterThan(0); expect(car.faction).toBe('armed-forces');
  expect(a.snapshot().vehicles![1].health).toBe(0);
  expect(validArenaSnapshot(a.snapshot(), env)).toBe(true);
});

it('keeps deployed vehicles when a facility is lost and restores damaged fleets across travel', () => {
  const env = open();
  env.facilities!.saved = { sites: [{ ...garage, owner: 'mercenaries', health: 0, maxHealth: 650, contested: false, suppressed: false, pressure: 0, deployIn: 0, action: null }], supplies: { mercenaries: 50, 'armed-forces': 20 } };
  const initial = createArena([], 0, 'mixed', open(), { spawns: { car: { x: 50, z: 0, yaw: 0 }, helicopter: { x: 100, z: 0, yaw: 0 } }, openWorld: true }).snapshot().vehicles!;
  initial[0].health = 123; env.facilities!.savedVehicles = initial;
  const back = createArena([], 0, 'mixed', env, { spawns: { car: { x: 50, z: 0, yaw: 0 }, helicopter: { x: 100, z: 0, yaw: 0 } }, openWorld: true });
  expect(back.snapshot().vehicles![0].health).toBe(123); expect(back.snapshot().facilities!.sites[0].health).toBe(0);
});

it('deploys coherent friendly squads from posts and removes the arbitrary respawn fallback', () => {
  const post: FacilitySite = { ...garage, id: 'post', name: 'Post', kind: 'command', initialOwner: 'armed-forces', x: -100, z: 0, deployment: { x: -100, z: 0, yaw: 0 } };
  const env = open([post, garage]), a = createArena([], 2, 'mixed', env); player(a); tick(a, 15);
  const allies = a.snapshot().actors.filter(p => p.bot && p.faction === 'armed-forces');
  expect(allies.length).toBeGreaterThan(0); expect(new Set(allies.map(p => p.squad)).size).toBe(1);
  const enemies = a.snapshot().actors.filter(p => p.bot && p.faction === 'mercenaries');
  expect(enemies.every(p => !p.alive)).toBe(true);
  tick(a, 40); expect(a.snapshot().actors.filter(p => p.bot && p.faction === 'mercenaries').every(p => !p.alive)).toBe(true);
  expect(validArenaSnapshot(a.snapshot(), env)).toBe(true);
});

it('lets a squad approach and capture a facility autonomously', () => {
  const post: FacilitySite = { ...garage, id: 'post', name: 'Post', kind: 'command', initialOwner: 'armed-forces', x: -20, z: 0, deployment: { x: -20, z: 0, yaw: 0 } };
  const a = createArena([], 0, 'mixed', open([post, garage]));
  tick(a, 35);
  expect(a.snapshot().facilities!.sites.find(s => s.id === 'garage')!.owner).toBe('armed-forces');
});
