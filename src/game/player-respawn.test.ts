import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { createFacilities, type FacilitySite } from './facilities';
import { moveInMarina } from './marina-collision';
import { createProfile, resolveLoadout } from './armory-state';
import { respawnEquipment } from './respawn-equipment';
import { DEFAULT_RESPAWN_ZONE } from './player-respawn';

const zone = (id: string, x: number, initialOwner: FacilitySite['initialOwner'] = 'armed-forces', kind: FacilitySite['kind'] = 'command'): FacilitySite =>
  ({ id, name: id, kind, initialOwner, x, y: 0, z: 0, deployment: { x, z: 0, yaw: .7 } });
const environment = (sites = [zone('West post', -70), zone('East garage', 70, 'armed-forces', 'garage'), zone('Enemy', 130, 'mercenaries'), zone('Unbuilt', 160, null)]): ArenaEnvironment =>
  ({ bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, move: moveInMarina, spawns: [{ x: 100, z: 100 }], playerSpawn: { x: 0, z: 100 }, endless: true, reinforcements: true, facilities: { sites } });
const tick = (a: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - .001; t += .05) a.step(.05); };
const self = (a: ArenaSimulation) => a.snapshot().actors.find(p => p.id === 'p')!;
function setup(env = environment(), obstacles: Parameters<typeof createArena>[0] = []) {
  const a = createArena(obstacles, 0, 'mixed', env); a.addPlayer('p', 'Operator', 80, .5, undefined, undefined, true); return a;
}
const down = (a: ArenaSimulation) => a.setPlayerVitals('p', { health: 0 });

it('waits for a manual allied-zone choice even after the countdown has finished', () => {
  const a = setup(); down(a); tick(a, 4);
  expect(self(a)).toMatchObject({ alive: false, respawnIn: 0 });
  expect(a.playerRespawn('p')!.zones.filter(z => z.available).map(z => z.id)).toEqual(['West post', 'East garage', DEFAULT_RESPAWN_ZONE]);
  expect(a.choosePlayerRespawn('p', 'East garage')).toBe(true); tick(a, .05);
  expect(self(a)).toMatchObject({ alive: true, health: 100, armor: 80, yaw: .7 });
  expect(Math.hypot(self(a).x - 70, self(a).z)).toBeCloseTo(3.6);
});

it('queues a selection, permits changing it, and cannot bypass the respawn timeout', () => {
  const a = setup(); down(a);
  expect(a.choosePlayerRespawn('p', 'West post')).toBe(true); tick(a, 1);
  expect(a.choosePlayerRespawn('p', 'East garage')).toBe(true); tick(a, 1);
  expect(self(a).alive).toBe(false); tick(a, 1.1);
  expect(self(a).alive).toBe(true); expect(self(a).x).toBeGreaterThan(60);
  expect(a.playerRespawn('p')!.selected).toBeNull();
  down(a); tick(a, 4); expect(self(a).alive).toBe(false);
});

it('rejects enemy, neutral, invented, unknown-player and living-player choices', () => {
  const a = setup();
  expect(a.choosePlayerRespawn('p', 'West post')).toBe(false); down(a);
  for (const id of ['Enemy', 'Unbuilt', 'forged']) expect(a.choosePlayerRespawn('p', id)).toBe(false);
  expect(a.choosePlayerRespawn('forged', 'West post')).toBe(false);
  expect(a.setPlayerAutoRespawn('forged', true)).toBe(false);
  expect(a.playerRespawn('forged')).toBeNull();
});

it('automatically chooses an allied destination after the timeout and preserves the preference across deaths', () => {
  const a = setup(); expect(a.setPlayerAutoRespawn('p', true)).toBe(true); down(a); tick(a, 2);
  expect(self(a).alive).toBe(false); tick(a, 1.1); expect(self(a).alive).toBe(true);
  expect(Math.abs(self(a).x)).toBeGreaterThan(60);
  down(a); tick(a, 3.1); expect(self(a).alive).toBe(true);
  expect(a.setPlayerAutoRespawn('p', false)).toBe(true); down(a); tick(a, 4); expect(self(a).alive).toBe(false);
});

it('automatically falls back to the designated default when no allied structure exists', () => {
  const a = setup(environment([zone('Enemy', 130, 'mercenaries'), zone('Neutral', 160, null)]));
  a.setPlayerAutoRespawn('p', true); down(a); tick(a, 4);
  expect(self(a)).toMatchObject({ alive: true, x: 0, z: 100 });
  expect(a.playerRespawn('p')!.zones.filter(z => z.available).map(z => z.id)).toEqual([DEFAULT_RESPAWN_ZONE]);
});

it('disables destroyed and blocked allied sites and refuses them as destinations', () => {
  const env = environment(); env.facilities!.saved = createFacilities(env.facilities!.sites).snapshot(); env.facilities!.saved.sites[0].health = 0;
  const a = setup(env, [{ minX: 65, maxX: 75, minZ: -5, maxZ: 5 }]); down(a);
  expect(a.playerRespawn('p')!.zones.filter(z => z.id !== DEFAULT_RESPAWN_ZONE)).toMatchObject([{ available: false, reason: 'Equipment destroyed' }, { available: false, reason: 'Landing zone blocked or unsafe' }, { available: false, reason: 'Enemy controlled' }, { available: false, reason: 'Capture and build to deploy' }]);
  expect(a.choosePlayerRespawn('p', 'West post')).toBe(false); expect(a.choosePlayerRespawn('p', 'East garage')).toBe(false);
  a.setPlayerAutoRespawn('p', true); tick(a, 4); expect(self(a)).toMatchObject({alive:true,x:0,z:100});
});

it('rechecks occupancy after selection and cancels an unsafe choice at timeout', () => {
  const env = environment();
  env.deployments = Array.from({ length: 12 }, (_, i) => ({ id: `exit-${i}`, name: `Exit ${i}`, x: 70 + Math.sin(i * Math.PI / 6) * 3.6, z: Math.cos(i * Math.PI / 6) * 3.6, yaw: 0, pitch: 0 }));
  const a = setup(env); down(a);
  expect(a.choosePlayerRespawn('p', 'East garage')).toBe(true);
  for (let i = 0; i < 12; i++) {
    const id = `body-${i}`; a.addPlayer(id, id);
    expect(a.setPlayerDeployment(id, `exit-${i}`)).toBe(true);
  }
  tick(a, 3.1);
  expect(self(a).alive).toBe(false); expect(a.playerRespawn('p')!.selected).toBeNull();
  expect(a.playerRespawn('p')!.zones.find(z => z.id === 'East garage')!.available).toBe(false);
  // Enabling the convenience option now chooses the other clear allied zone.
  a.setPlayerAutoRespawn('p', true); tick(a, .05);
  expect(self(a).alive).toBe(true); expect(self(a).x).toBeLessThan(-60);
});

it('prefers a newly captured allied structure over the default on the next respawn', () => {
  const env = environment([zone('Garage', 70, 'mercenaries', 'garage')]);
  env.playerSpawn = {x:73,z:0}; env.defaultPlayerSpawn = {x:0,z:100};
  env.deployments = [{ id: 'entry', name: 'Work', x: 73, z: 0, yaw: 0, pitch: 0 }];
  const a = setup(env); down(a); a.addPlayer('helper', 'Helper'); expect(a.setPlayerDeployment('helper', 'entry')).toBe(true);
  a.setPlayerAutoRespawn('p', true); down(a); tick(a, 4); expect(self(a)).toMatchObject({alive:true,x:0,z:100});
  expect(a.facilityAction('helper', 'Garage')).toBe(true); tick(a, 25); down(a); tick(a, 3.1);
  expect(self(a).alive).toBe(true); expect(self(a).x).toBeGreaterThan(60);
});

it('keeps the ordinary arena three-second automatic respawn', () => {
  const env = environment(); delete env.facilities;
  const a = setup(env); down(a); tick(a, 3.1);
  expect(self(a).alive).toBe(true); expect(a.playerRespawn('p')).toBeNull();
});

for (const automatic of [false, true]) it(`respawns with starting equipment after a pickup (${automatic ? 'automatic' : 'manual'})`, () => {
  const starting = createProfile(); starting.owned.push('plate-soft'); starting.plate = 'plate-soft';
  const original = resolveLoadout(starting), a = createArena([], 0, 'mixed', environment());
  a.addPlayer('p', 'Operator', original.armor, original.absorption, original.weapons, undefined, true, original.carriedFamilies, original.insert);
  const pickedUp = structuredClone(starting); pickedUp.carry = { main: 1, extra: null }; pickedUp.plate = 'plate-elite';
  const update = (profile: typeof starting) => {
    const kit = resolveLoadout(profile);
    a.setPlayerLoadout('p', kit.armor, kit.absorption, kit.weapons, kit.carriedFamilies, kit.insert);
  };
  update(pickedUp); expect(self(a).weapon).toBe(1);
  down(a); update(respawnEquipment(pickedUp, starting));
  if (automatic) a.setPlayerAutoRespawn('p', true); else a.choosePlayerRespawn('p', 'West post');
  tick(a, 3.1);
  expect(self(a)).toMatchObject({ alive: true, armor: original.armor, weapon: original.carriedFamilies[0] });
  down(a); if (!automatic) a.choosePlayerRespawn('p', 'West post'); tick(a, 3.1);
  expect(self(a)).toMatchObject({ alive: true, armor: original.armor, weapon: original.carriedFamilies[0] });
});

it('keeps hostile and neutral facilities on the map as unavailable locations', () => {
  const a = setup(); down(a);
  expect(a.playerRespawn('p')!.zones).toEqual(expect.arrayContaining([
    expect.objectContaining({id:'Enemy',available:false,reason:'Enemy controlled'}),
    expect.objectContaining({id:'Unbuilt',available:false,reason:'Capture and build to deploy'}),
  ]));
});

for (const withAllies of [false, true]) it(`offers manual default respawn ${withAllies ? 'alongside allied structures' : 'after every structure is lost'}`, () => {
  const a=setup(withAllies ? environment() : environment([zone('Enemy',130,'mercenaries')])); down(a);
  expect(a.playerRespawn('p')!.zones.find(z=>z.id===DEFAULT_RESPAWN_ZONE)).toMatchObject({name:'Default spawn',available:true,x:0,z:100});
  expect(a.choosePlayerRespawn('p',DEFAULT_RESPAWN_ZONE)).toBe(true);tick(a,2);
  expect(self(a).alive).toBe(false);tick(a,1.1);
  expect(self(a)).toMatchObject({alive:true,x:0,z:100});
});

it('retains the district default instead of a gateway arrival or previously selected entry', () => {
  const env=environment();env.playerSpawn={x:110,z:100,yaw:1};env.defaultPlayerSpawn={x:-110,z:100,yaw:-.8};
  const a=setup(env);down(a);expect(a.choosePlayerRespawn('p',DEFAULT_RESPAWN_ZONE)).toBe(true);tick(a,3.1);
  expect(self(a)).toMatchObject({alive:true,x:-110,z:100,yaw:-.8});
});

it('invalidates a default that becomes blocked, waits safely, then resumes auto-respawn when clear', () => {
  const obstacle={minX:50,maxX:51,minZ:50,maxZ:51};
  const a=setup(environment([zone('Enemy',130,'mercenaries')]),[obstacle]);down(a);
  expect(a.choosePlayerRespawn('p',DEFAULT_RESPAWN_ZONE)).toBe(true);
  Object.assign(obstacle,{minX:-12,maxX:12,minZ:88,maxZ:112});tick(a,3.1);
  expect(self(a).alive).toBe(false);expect(a.playerRespawn('p')!.selected).toBeNull();
  expect(a.playerRespawn('p')!.zones.find(z=>z.id===DEFAULT_RESPAWN_ZONE)).toMatchObject({available:false,reason:'Default spawn blocked or unsafe'});
  expect(a.choosePlayerRespawn('p',DEFAULT_RESPAWN_ZONE)).toBe(false);
  a.setPlayerAutoRespawn('p',true);tick(a,1);expect(self(a).alive).toBe(false);
  Object.assign(obstacle,{minX:50,maxX:51,minZ:50,maxZ:51});tick(a,.05);
  expect(self(a)).toMatchObject({alive:true,x:0,z:100});
});

it('finds a nearby clear point within the default zone when its centre is occupied', () => {
  const env=environment();env.spawns=[{x:0,z:100}];
  const a=setup(env);down(a);a.addPlayer('other','Friendly');
  expect(a.choosePlayerRespawn('p',DEFAULT_RESPAWN_ZONE)).toBe(true);tick(a,3.1);
  expect(self(a).alive).toBe(true);expect(Math.hypot(self(a).x,self(a).z-100)).toBeCloseTo(3.6);
});

it('holds players down for the delay the game asks for, without slowing bots', () => {
  const a = createArena([], 1, 'mixed'); a.addPlayer('p', 'Operator', 80, .5);
  a.setPlayerRespawnSeconds(6); a.setPlayerVitals('p', { health: 0 });
  expect(self(a).respawnIn).toBe(6);
  tick(a, 5.5); expect(self(a).alive).toBe(false);
  tick(a, .6); expect(self(a).alive).toBe(true);
});
