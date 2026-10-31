import { describe, expect, it } from 'vitest';
import { buildMarinaScene } from './marina-scene';
import { canOccupy, MARINA_BOUNDS } from './marina-collision';
import { canFly, createVehicle, driveVehicle, flyVehicle, vehicleBounds, vehicleExit, type FlightObstacle } from './vehicle-rules';
import { createProfile, equip, purchase, resolveLoadout, restoreProfile } from './armory-state';
const wall: FlightObstacle = { minX: -5, maxX: 5, minZ: -5, maxZ: 5, minY: 0, maxY: 12 };
describe('vehicle movement and transitions', () => {
  it('places both vehicles in clear ground, with usable dismount points', () => {
    const world = buildMarinaScene();
    try {
      for (const kind of ['car', 'helicopter'] as const) { const v = createVehicle(kind); expect(canOccupy(v.x, v.z, 2.5, world.obstacles)).toBe(true); expect(vehicleExit(v, world.obstacles)).not.toBeNull(); }
    } finally { world.dispose(); }
  });
  it('accelerates, brakes and stops at a solid obstacle without tunnelling', () => {
    let v = { ...createVehicle('car'), x: 0, z: 20, yaw: 0 };
    for (let i = 0; i < 80; i++) v = driveVehicle(v, 1, 0, false, .05, [wall]).state;
    expect(v.z).toBeGreaterThanOrEqual(7.35); expect(v.speed).toBe(0);
    v = { ...v, speed: 15 }; for (let i = 0; i < 10; i++) v = driveVehicle(v, 0, 0, true, .05, []).state; expect(Math.abs(v.speed)).toBeLessThan(.1);
  });
  it('steers only when rolling and caps frame steps', () => {
    const v = createVehicle('car'); expect(driveVehicle(v, 0, 1, false, .05, []).state.yaw).toBe(v.yaw);
    expect(driveVehicle({ ...v, speed: 10 }, 0, 1, false, .05, []).state.yaw).toBeLessThan(v.yaw);
    expect(driveVehicle(v, 1, 0, false, 10, []).state).toEqual(driveVehicle(v, 1, 0, false, .05, []).state);
  });
  it('flies over an obstacle only above its clearance height and respects ceilings', () => {
    expect(canFly(0, 10, 0, [wall])).toBe(false); expect(canFly(0, 13, 0, [wall])).toBe(true);
    expect(canFly(0, 4, 0, [{ ...wall, minY: 6, maxY: 8 }])).toBe(false);
    expect(canFly(0, 1, 0, [{ ...wall, minY: 6, maxY: 8 }])).toBe(true);
    expect(canFly(MARINA_BOUNDS.maxX + 2, 20, 0, [])).toBe(false);
  });
  it('takes off, stabilizes hover, lands and clamps altitude', () => {
    let v = createVehicle('helicopter'); for (let i = 0; i < 30; i++) v = flyVehicle(v, 0, 0, 1, false, .05, []).state;
    expect(v.y).toBeGreaterThan(5); const climbed = v.y;
    for (let i = 0; i < 50; i++) v = flyVehicle(v, 0, 0, 0, false, .05, []).state;
    expect(Math.abs(v.climb)).toBeLessThan(.01); expect(v.y).toBeLessThan(climbed + 2);
    for (let i = 0; i < 100; i++) v = flyVehicle(v, 0, 0, -1, false, .05, []).state;
    expect(v.y).toBe(.13); expect(v.climb).toBe(0);
    v = flyVehicle({ ...v, y: 120, climb: 5 }, 0, 0, 1, false, .05, []).state; expect(v.y).toBe(120);
  });
  it('rejects moving/airborne exits and chooses ground clear of the vehicle', () => {
    const v = createVehicle('car'); expect(vehicleExit({ ...v, speed: 10 }, [])).toBeNull();
    expect(vehicleExit({ ...createVehicle('helicopter'), y: 10 }, [])).toBeNull();
    const exit = vehicleExit(v, [])!; expect(canOccupy(exit.x, exit.z, .38, [vehicleBounds(v)])).toBe(true);
    expect(vehicleExit(v, [{ minX: -100, maxX: 100, minZ: -100, maxZ: 100 }])).toBeNull();
  });
  it('purchases one cosmetic wrap and equips it independently for each vehicle', () => {
    const base = { ...createProfile(), xp: 800 }, unlocked = purchase(base, 'paint-jungle').profile;
    const car = equip(unlocked, 'paint-jungle', 0, 'car'); expect(car.vehicleSkins).toEqual({ car: 'paint-jungle', helicopter: 'paint-issued' });
    const both = equip(car, 'paint-jungle', 0, 'helicopter'); expect(both.credits).toBe(950); expect(restoreProfile(JSON.stringify(both))).toEqual(both);
    expect(resolveLoadout(both).weapons[0].damage).toBe(resolveLoadout(base).weapons[0].damage);
    expect(restoreProfile(JSON.stringify({ ...base, vehicleSkins: { car: 'paint-arctic' } })).vehicleSkins.car).toBe('paint-issued');
  });
});

describe('vehicle collision approach speed', () => {
  it.each([0, 4, 10, 20])('reports the controlled approach speed for a %s m/s head-on impact', speed => {
    const v = { ...createVehicle('car'), x: 0, z: 7.4, yaw: 0, speed };
    const hit = driveVehicle(v, 1, 0, false, .05, [wall]);
    // Slow approaches do not reach the wall in this frame.
    if (speed === 0) { expect(hit.impactSpeed).toBe(0); return; }
    expect(hit.blocked).toBe(true);
    expect(hit.impactSpeed).toBeCloseTo(Math.min(speed + .5, 20));
    expect(hit.state.speed).toBe(0);
    expect(driveVehicle(hit.state, 1, 0, false, .05, [wall]).impactSpeed).toBeLessThan(1);
  });

  it('detects contact near the end of a frame and captures reverse impacts', () => {
    const v = { ...createVehicle('car'), x: 0, z: 8.2, yaw: 0, speed: 20 };
    const hit = driveVehicle(v, 1, 0, false, .05, [wall]);
    expect(v.z - hit.state.z).toBeGreaterThan(.5);
    expect(hit.blocked).toBe(true); expect(hit.impactSpeed).toBe(20); expect(hit.state.speed).toBe(0);
    const reverse = driveVehicle({ ...v, z: -7.4, speed: -6 }, -1, 0, false, .05, [wall]);
    expect(reverse.blocked).toBe(true); expect(reverse.impactSpeed).toBe(6); expect(reverse.state.speed).toBeCloseTo(0);
  });

  it.each(['car', 'helicopter'] as const)('uses only the blocked component of a glancing %s impact', kind => {
    const v = { ...createVehicle(kind), x: 0, y: kind === 'car' ? .13 : 10, z: 20, yaw: .2, speed: 20 };
    const side = { minX: -5, maxX: 5, minZ: -100, maxZ: 100, minY: 0, maxY: 30 };
    v.x = 5 + (kind === 'car' ? vehicleBounds(v).maxX : 2.5) + .01;
    const hit = kind === 'car' ? driveVehicle(v, 1, 0, false, .05, [side]) : flyVehicle(v, 1, 0, 0, false, .05, [side]);
    expect(hit.blocked).toBe(true);
    expect(hit.impactSpeed).toBeCloseTo(Math.sin(.2) * 20);
    expect(hit.state.z).toBeLessThan(v.z);
    expect(hit.state.speed).toBeGreaterThan(19); expect(hit.state.speed).toBeLessThan(20);
  });

  it('measures roof contact vertically without charging for horizontal helicopter speed', () => {
    const roof = { minX: -50, maxX: 50, minZ: -50, maxZ: 50, minY: 0, maxY: 5 };
    const v = { ...createVehicle('helicopter'), x: 0, z: 20, y: 5.02, yaw: 0, speed: 20, climb: -2 };
    const hit = flyVehicle(v, 1, 0, 0, false, .05, [roof]);
    expect(hit.blocked).toBe(true); expect(hit.impactSpeed).toBeCloseTo(2 * Math.exp(-.15));
    expect(hit.state.climb).toBe(0); expect(hit.state.speed).toBe(20); expect(hit.state.y).toBe(v.y);
    const hard = flyVehicle({ ...v, climb: -12 }, 1, 0, -1, false, .05, [roof]);
    expect(hard.impactSpeed).toBeGreaterThan(10);
  });

  it('captures hard ground/ceiling contacts and combines blocked corner components once', () => {
    const v = { ...createVehicle('helicopter'), x: 0, z: 0, yaw: 0, y: .15, climb: -12 };
    const ground = flyVehicle(v, 0, 0, -1, false, .05, []);
    expect(ground.state.y).toBe(.13); expect(ground.state.climb).toBe(0); expect(ground.impactSpeed).toBeGreaterThan(10);
    const ceiling = flyVehicle({ ...v, y: 6.25, climb: 12 }, 0, 0, 1, false, .05,
      [{ minX: -10, maxX: 10, minZ: -10, maxZ: 10, minY: 10, maxY: 12 }]);
    expect(ceiling.impactSpeed).toBeGreaterThan(10); expect(ceiling.state.climb).toBe(0);
    const corner = flyVehicle({ ...v, x: -2.49, z: -2.49, y: 10, climb: 0, speed: 20, yaw: Math.PI / 4 }, 1, 0, 0, false, .05, [],
      { minX: -5, maxX: 50, minZ: -5, maxZ: 50 });
    expect(corner.impactSpeed).toBeCloseTo(20); expect(corner.state.speed).toBe(0);
  });

  it('reports no impact without movement or after destruction', () => {
    for (const kind of ['car', 'helicopter'] as const) {
      const v = { ...createVehicle(kind), speed: 20, climb: 10 };
      const step = (state: typeof v, dt: number) => kind === 'car' ? driveVehicle(state, 1, 0, false, dt, [wall]) : flyVehicle(state, 1, 0, 1, false, dt, [wall]);
      expect(step(v, 0).impactSpeed).toBe(0); expect(step({ ...v, health: 0 }, .05).impactSpeed).toBe(0);
    }
  });
});

for (const kind of ['car', 'helicopter'] as const) it(`lets occupants leave a parked ${kind} at diagonal headings`, () => {
  for (const yaw of [Math.PI / 4, -Math.PI / 4, Math.PI * 3 / 4]) {
    const v = { ...createVehicle(kind), x: 0, z: 0, yaw };
    const exit = vehicleExit(v, []);
    expect(exit, `clear exit at yaw ${yaw}`).not.toBeNull();
    expect(canOccupy(exit!.x, exit!.z, .38, [vehicleBounds(v)])).toBe(true);
  }
});
