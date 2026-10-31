import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { createFacilities, type FacilitySite } from './facilities';
import { moveInMarina } from './marina-collision';

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
  expect(a.playerRespawn('p')!.zones.map(z => z.id)).toEqual(['West post', 'East garage']);
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

it('holds auto-respawn when no allied zone exists, rather than deploying at an arbitrary point', () => {
  const a = setup(environment([zone('Enemy', 130, 'mercenaries'), zone('Neutral', 160, null)]));
  a.setPlayerAutoRespawn('p', true); down(a); tick(a, 4);
  expect(self(a)).toMatchObject({ alive: false, respawnIn: 0 }); expect(a.playerRespawn('p')!.zones).toEqual([]);
});

it('disables destroyed and blocked allied sites and refuses them as destinations', () => {
  const env = environment(); env.facilities!.saved = createFacilities(env.facilities!.sites).snapshot(); env.facilities!.saved.sites[0].health = 0;
  const a = setup(env, [{ minX: 65, maxX: 75, minZ: -5, maxZ: 5 }]); down(a);
  expect(a.playerRespawn('p')!.zones).toMatchObject([{ available: false, reason: 'Equipment destroyed' }, { available: false, reason: 'Landing zone blocked or unsafe' }]);
  expect(a.choosePlayerRespawn('p', 'West post')).toBe(false); expect(a.choosePlayerRespawn('p', 'East garage')).toBe(false);
  a.setPlayerAutoRespawn('p', true); tick(a, 4); expect(self(a).alive).toBe(false);
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

it('resumes auto-respawn when an ally captures a control zone after the timer', () => {
  const env = environment([zone('Garage', 70, 'mercenaries', 'garage')]);
  env.deployments = [{ id: 'work', name: 'Work', x: 73, z: 0, yaw: 0, pitch: 0 }];
  const a = setup(env); a.addPlayer('helper', 'Helper'); expect(a.setPlayerDeployment('helper', 'work')).toBe(true);
  a.setPlayerAutoRespawn('p', true); down(a); tick(a, 4); expect(self(a).alive).toBe(false);
  expect(a.facilityAction('helper', 'Garage')).toBe(true); tick(a, 25);
  expect(self(a).alive).toBe(true); expect(self(a).x).toBeGreaterThan(60);
});

it('keeps the ordinary arena three-second automatic respawn', () => {
  const env = environment(); delete env.facilities;
  const a = setup(env); down(a); tick(a, 3.1);
  expect(self(a).alive).toBe(true); expect(a.playerRespawn('p')).toBeNull();
});
