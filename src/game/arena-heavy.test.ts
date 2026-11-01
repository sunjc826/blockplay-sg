import { describe, expect, it } from 'vitest';
import { createArena, SPAWN_SHIELD_SECONDS, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { armamentFamilies, getArenaRole } from './arena-roles';
import { arenaCharacterLook } from './character-looks';
import { FPS_WEAPONS } from './fps-rules';
import { itemById } from './armory-catalog';
import { variantSpec } from './armory-state';
import { validArenaSnapshot } from './arena-runtime';
import type { VehicleControls } from './vehicle-seats';

const actor = (a: ArenaSimulation, id = 'bot-1') => a.snapshot().actors.find(m => m.id === id)!;
const hull = (a: ArenaSimulation) => a.snapshot().vehicles!.find(v => v.kind === 'helicopter')!;
const neutral: VehicleControls = { forward: 0, steer: 0, lift: 0, brake: true, boost: false, fire: false };
function setup({ range = 80, cover = false, sight = false, occupied = true } = {}) {
  const environment: ArenaEnvironment = {
    bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
    spawns: [{ x: 0, z: 0 }], playerSpawn: { x: range + 3.5, z: 0 }, endless: true,
    // Hold the gunner still to measure its firing independently of navigation.
    move: p => ({ x: p.x, z: p.z }),
  };
  const blocked = (_o: unknown, _d: unknown, reach: number) => reach > 10 ? 2 : reach;
  const a = createArena([], 1, 'heavy', environment, { spawns: { car: { x: -350, z: -350, yaw: 0 }, helicopter: { x: range, z: 0, yaw: 0 } } }, undefined,
    cover ? blocked : undefined, undefined, sight ? blocked : undefined);
  if (occupied) {
    a.addPlayer('p', 'Pilot', 0, 0, undefined, undefined, true);
    expect(a.vehicleAction('p', 'enter', 'helicopter')).toBe(true);
  }
  return { a, environment };
}
function advance(a: ArenaSimulation, seconds: number, lift = 0) {
  for (let t = 0; t < seconds - 1e-8; t += .05) {
    const pilot = actor(a, 'p');
    if (pilot?.alive) a.setInput('p', { ...pilot, playing: true, vehicleControls: { ...neutral, lift } });
    a.step(.05);
  }
}

describe('heavy MG infantry', () => {
  it('fields armored MG4 gunners in mixed squads without adding to the population', () => {
    const role = getArenaRole('heavy')!, assault = getArenaRole('assault')!;
    expect(armamentFamilies(role)).toEqual([FPS_WEAPONS.findIndex(w => w.id === 'mg4-inspired')]);
    expect(role.health).toBeGreaterThan(assault.health);
    expect(role.armor).toBeGreaterThan(assault.armor);
    expect(role.speed).toBeLessThan(assault.speed);
    const a = createArena([], 6);
    expect(a.snapshot().actors).toHaveLength(6);
    expect(a.snapshot().actors.filter(m => m.role === 'heavy')).toHaveLength(2);
    expect(arenaCharacterLook({ bot: true, role: 'heavy', rank: 1 })).toMatchObject({ headwear: 'helmet', plates: true, weapon: 'lmg', roleKit: 'gunner' });
  });

  it('looks up and damages an occupied hovering helicopter with real travelling MG rounds', () => {
    const { a, environment } = setup();
    advance(a, SPAWN_SHIELD_SECONDS - .1, 1);
    expect(actor(a).shots).toBe(0);
    expect(hull(a).health).toBe(900);
    advance(a, 3, 1);
    expect(hull(a).y).toBeGreaterThan(10);
    advance(a, 12);
    expect(actor(a).shots).toBeGreaterThan(10);
    expect(actor(a).pitch).toBeGreaterThan(.1);
    expect(hull(a).health).toBeLessThan(900);
    expect(validArenaSnapshot(a.snapshot(), environment)).toBe(true);
  });

  it.each([{ cover: true }, { sight: true }])('respects cover and rendered sight blockers: %j', options => {
    const { a } = setup(options);
    advance(a, 8, 1); advance(a, 12);
    expect(actor(a).shots).toBe(0);
    expect(hull(a).health).toBe(900);
  });

  it('cannot fire during its actual belt reload, then resumes aircraft suppression', () => {
    const { a } = setup();
    advance(a, 7, 1);
    const gunner = actor(a), spec = variantSpec(itemById(gunner.variant!)!)!;
    expect(gunner.shots).toBeGreaterThan(0);
    a.reloadPlayer(gunner.id, gunner.weapon);
    advance(a, spec.reload - .1);
    expect(actor(a).shots).toBe(gunner.shots);
    advance(a, 2);
    expect(actor(a).shots).toBeGreaterThan(gunner.shots);
  });

  it('ignores abandoned helicopters and aircraft beyond its 220 m identification range', () => {
    for (const options of [{ occupied: false }, { range: 250 }]) {
      const { a } = setup(options);
      advance(a, 8, 1); advance(a, 12);
      expect(actor(a).shots).toBe(0);
      expect(hull(a).health).toBe(900);
    }
  });

  it('engages a hostile scripted raid helicopter without needing to spot a crew member', () => {
    const { a } = setup({ occupied: false });
    const event = a.triggerEvent('helicopter-raid', { x: 0, z: 0 }, 0)!;
    expect(event.faction).toBe('armed-forces');
    advance(a, 14);
    expect(actor(a).shots).toBeGreaterThan(0);
    expect(a.snapshot().raiders![0].health).toBeLessThan(700);
  });

  it('leaves a same-faction scripted raid alone', () => {
    const { a } = setup({ occupied: false });
    a.addPlayer('p', 'Planner', 0, 0, undefined, undefined, true);
    const event = a.triggerEvent('helicopter-raid', { x: 80, z: 0 }, 0)!;
    expect(event.faction).toBeUndefined();
    a.removePlayer('p');
    advance(a, 20);
    expect(actor(a).shots).toBe(0);
    expect(a.snapshot().raiders![0].health).toBe(700);
  });
});
