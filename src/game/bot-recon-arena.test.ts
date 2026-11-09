import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { TDM_AREAS } from './arena-match';
import { shootAndLand } from './arena-test-shots';

const tick = (a: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - 1e-6; t += .05) a.step(Math.min(.05, seconds - t)); };
const actor = (a: ArenaSimulation, id: string) => a.snapshot().actors.find(a => a.id === id)!;
function setup(recon: boolean) {
  const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
  const area = { ...TDM_AREAS[0], bounds, spawns: {
    alpha: [-18, -6, 6, 18].map(z => ({ x: -40, z })),
    bravo: [-18, -6, 6, 18].map(z => ({ x: 40, z })),
  }, patrols: [{ x: -80, z: 0 }] };
  let open = false, moving = false, firing = false;
  const environment: ArenaEnvironment = { bounds, teamDeathmatch: area, spawns: [...area.spawns.alpha, ...area.spawns.bravo],
    move: (p, dx, dz) => moving ? { x: p.x + dx, z: p.z + dz } : p };
  const a = createArena([], 0, 'assault', environment, undefined, undefined,
    (_p, ray) => open || firing || ray.y > .9 ? Infinity : 0);
  for (const id of ['one', 'two']) a.addPlayer(id, id, 0, 0, [{ damage: 200, interval: .06, capacity: 100, reload: .4 }]);
  expect(a.configureStreaks('one', ['recon', 'hunter', 'strike'])).toBe(true);
  tick(a, 3.1);
  for (let n = 0; n < 3; n++) {
    const from = actor(a, 'one'), to = actor(a, 'two');
    const ray = { x: to.x - from.x, y: to.y - .6 - from.y, z: to.z - from.z }, length = Math.hypot(ray.x, ray.y, ray.z);
    firing = true;
    expect(shootAndLand(a, 'one', from, { x: ray.x / length, y: ray.y / length, z: ray.z / length }, 0).killed).toBe(true);
    firing = false; tick(a, 6.2);
  }
  if (recon) expect(a.activateStreak('one', 'recon')).toBe(true);
  tick(a, .1);
  const bot = a.snapshot().actors.find(p => p.bot && p.team === 'alpha')!;
  return { a, bot: bot.id, open: (value: boolean) => open = value, move: () => moving = true };
}

it('investigates friendly pings behind cover without firing, instead of walking toward its patrol', () => {
  for (const enabled of [false, true]) {
    const { a, bot, move } = setup(enabled), before = actor(a, bot);
    move(); tick(a, 1);
    const after = actor(a, bot);
    expect(after.shots).toBe(0);
    expect(enabled ? after.x > before.x : after.x < before.x).toBe(true);
  }
});

it('fires sooner after seeing a pinged enemy, but cannot fire when cover closes again', () => {
  const firstShot = (enabled: boolean) => {
    const { a, bot, open } = setup(enabled);
    open(true);
    let delay = 0;
    while (actor(a, bot).shots === 0 && delay < 8) { a.step(.05); delay += .05; }
    expect(actor(a, bot).shots).toBeGreaterThan(0);
    open(false);
    const shots = actor(a, bot).shots;
    tick(a, .5); expect(actor(a, bot).shots).toBe(shots);
    return delay;
  };
  expect(firstShot(true)).toBeLessThan(firstShot(false) - .3);
});
