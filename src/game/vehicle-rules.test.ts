import { describe, expect, it } from 'vitest';
import { buildMarinaScene } from './marina-scene';
import { canOccupy, MARINA_BOUNDS } from './marina-collision';
import { canFly, createVehicle, driveVehicle, flyVehicle, stepVehicleWreck, vehicleBounds, vehicleExit, vehicleSpeed, wreckAtRest, stopVehicle, type FlightObstacle, type VehicleState } from './vehicle-rules';
import type { Obstacle } from './region-collision';
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
  it('allows moving Humvee exits, rejects moving/airborne helicopter exits, and requires clear ground', () => {
    const v = createVehicle('car'); expect(vehicleExit({ ...v, speed: 10 }, [])).not.toBeNull();
    expect(vehicleExit({ ...createVehicle('helicopter'), speed: 10 }, [])).toBeNull();
    expect(vehicleExit({ ...createVehicle('helicopter'), y: 10 }, [])).toBeNull();
    const exit = vehicleExit(v, [])!; expect(canOccupy(exit.x, exit.z, .38, [vehicleBounds(v)])).toBe(true);
    expect(vehicleExit(v, [{ minX: -100, maxX: 100, minZ: -100, maxZ: 100 }])).toBeNull();
  });
  it('rents one cosmetic wrap and equips it independently for each vehicle', () => {
    const base = { ...createProfile(), xp: 800 }, unlocked = purchase(base, 'paint-jungle').profile;
    const car = equip(unlocked, 'paint-jungle', 0, 'car'); expect(car.vehicleSkins).toEqual({ car: 'paint-jungle', helicopter: 'paint-issued' });
    const both = equip(car, 'paint-jungle', 0, 'helicopter'); expect(both.credits).toBe(1535); expect(restoreProfile(JSON.stringify(both))).toEqual(both);
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
    expect(hit.state.speed).toBeLessThan(0);
    expect(driveVehicle(hit.state, 1, 0, false, .05, [wall]).impactSpeed).toBeLessThan(1);
  });

  it('detects contact near the end of a frame and captures reverse impacts', () => {
    const v = { ...createVehicle('car'), x: 0, z: 8.2, yaw: 0, speed: 20 };
    const hit = driveVehicle(v, 1, 0, false, .05, [wall]);
    expect(v.z - hit.state.z).toBeGreaterThan(.5);
    expect(hit.blocked).toBe(true); expect(hit.impactSpeed).toBe(20); expect(hit.state.speed).toBeLessThan(0);
    const reverse = driveVehicle({ ...v, z: -7.4, speed: -6 }, -1, 0, false, .05, [wall]);
    expect(reverse.blocked).toBe(true); expect(reverse.impactSpeed).toBe(6); expect(reverse.state.speed).toBeGreaterThan(0);
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
    expect(hit.state.climb).toBe(0); expect(hit.state.speed).toBe(20); expect(hit.state.y).toBeCloseTo(5, 3);
    const hard = flyVehicle({ ...v, climb: -12 }, 1, 0, -1, false, .05, [roof]);
    expect(hard.impactSpeed).toBeGreaterThan(10);
  });

  it('captures hard ground/ceiling contacts and combines blocked corner components once', () => {
    const v = { ...createVehicle('helicopter'), x: 0, z: 0, yaw: 0, y: .15, climb: -12 };
    const ground = flyVehicle(v, 0, 0, -1, false, .05, []);
    expect(ground.state.y).toBeGreaterThanOrEqual(.13); expect(ground.state.climb).toBeGreaterThan(0); expect(ground.impactSpeed).toBeGreaterThan(10);
    const ceiling = flyVehicle({ ...v, y: 6.25, climb: 12 }, 0, 0, 1, false, .05,
      [{ minX: -10, maxX: 10, minZ: -10, maxZ: 10, minY: 10, maxY: 12 }]);
    expect(ceiling.impactSpeed).toBeGreaterThan(10); expect(ceiling.state.climb).toBeLessThan(0);
    const corner = flyVehicle({ ...v, x: -2.49, z: -2.49, y: 10, climb: 0, speed: 20, yaw: Math.PI / 4 }, 1, 0, 0, false, .05, [],
      { minX: -5, maxX: 50, minZ: -5, maxZ: 50 });
    expect(corner.impactSpeed).toBeCloseTo(20); expect(corner.state.speed).toBeLessThan(0);
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

const worldVelocity = (v: ReturnType<typeof createVehicle>) => ({
  x: -Math.sin(v.yaw) * v.speed + Math.cos(v.yaw) * (v.lateralSpeed ?? 0),
  z: -Math.cos(v.yaw) * v.speed - Math.sin(v.yaw) * (v.lateralSpeed ?? 0),
});

describe('vehicle collision momentum', () => {
  it.each(['car', 'helicopter'] as const)('rebounds a %s head-on without adding energy or spin', kind => {
    const v = { ...createVehicle(kind), x: 0, z: kind === 'car' ? 7.4 : 7.55, y: kind === 'car' ? .13 : 6, yaw: 0, speed: 20 };
    const hit = kind === 'car' ? driveVehicle(v, 1, 0, false, .05, [wall]) : flyVehicle(v, 1, 0, 0, false, .05, [wall]);
    expect(hit.blocked).toBe(true);
    expect(hit.impactSpeed).toBeCloseTo(20);
    expect(hit.state.speed).toBeLessThan(-3);
    expect(vehicleSpeed(hit.state)).toBeLessThan(vehicleSpeed(v));
    expect(hit.state.yawSpeed).toBe(0);
    const next = kind === 'car' ? driveVehicle(hit.state, 0, 0, false, .05, [wall]) : flyVehicle(hit.state, 0, 0, 0, false, .05, [wall]);
    expect(next.state.z).toBeGreaterThan(hit.state.z);
    expect(next.impactSpeed).toBe(0);
  });

  it.each([-1, 1])('preserves slide momentum and turns away from a mirrored glancing wall (%s)', side => {
    const barrier = { minX: side === 1 ? -5 : -100, maxX: side === 1 ? 100 : 5, minZ: -100, maxZ: 100 };
    const v = { ...createVehicle('car'), x: 0, z: 20, yaw: side * .35, speed: 20 };
    const hull = vehicleBounds(v);
    v.x = -side * (5 + hull.maxX + .01);
    // The positive-side wall starts at x=-5, the negative-side wall ends at x=5.
    v.yaw = -side * .35;
    const hit = driveVehicle(v, 1, 0, false, .05, [barrier]);
    expect(hit.blocked).toBe(true);
    expect(worldVelocity(hit.state).z).toBeCloseTo(worldVelocity(v).z);
    expect(worldVelocity(hit.state).x * side).toBeLessThan(0);
    expect(Math.abs(hit.state.lateralSpeed!)).toBeGreaterThan(5);
    expect(hit.state.yawSpeed! * side).toBeGreaterThan(0);
    let skidding = hit.state;
    for (let i = 0; i < 20; i++) {
      skidding = driveVehicle(skidding, 0, 0, false, .025, [barrier]).state;
      expect(vehicleBounds(skidding).minX >= barrier.maxX || vehicleBounds(skidding).maxX <= barrier.minX).toBe(true);
    }
    expect(skidding.yaw * side).toBeGreaterThan(hit.state.yaw * side);
    expect(Math.abs(skidding.yawSpeed!)).toBeLessThan(Math.abs(hit.state.yawSpeed!));
  });

  it('retains world momentum as collision spin rotates the hull', () => {
    const v = { ...createVehicle('car'), x: 0, z: 20, yaw: 0, speed: 20, lateralSpeed: 0, yawSpeed: 1 };
    const next = driveVehicle(v, 1, 0, false, .05, []).state;
    expect(next.yaw).toBeGreaterThan(0);
    expect(worldVelocity(next).x).toBeCloseTo(0);
    expect(worldVelocity(next).z).toBeCloseTo(-20);
  });

  it('brakes a sideways skid, allows bailout, and clears every motion component when stopped', () => {
    const v = { ...createVehicle('car'), speed: 0, lateralSpeed: 8, yawSpeed: 1 };
    expect(vehicleExit(v, [])).not.toBeNull();
    let next = v;
    for (let i = 0; i < 10; i++) next = driveVehicle(next, 0, 0, true, .05, []).state as typeof v;
    expect(vehicleSpeed(next)).toBeLessThan(.1);
    stopVehicle(next);
    expect([next.speed, next.climb, next.lateralSpeed, next.yawSpeed]).toEqual([0, 0, 0, 0]);
  });

  it('does not bounce or spin while pushing gently against a wall', () => {
    let v = { ...createVehicle('car'), x: 0, z: 7.35, yaw: 0 };
    for (let i = 0; i < 120; i++) {
      const hit = driveVehicle(v, 1, 0, false, .05, [wall]);
      v = hit.state;
      expect(hit.impactSpeed).toBeLessThan(1);
      expect(v.speed).toBe(0);
      expect(v.yawSpeed).toBe(0);
      expect(v.z).toBeGreaterThanOrEqual(7.35);
    }
  });

  it.each([1 / 30, 1 / 60, 1 / 120])('contains boosted flight and hard vertical impacts at dt=%s', dt => {
    const thin = { minX: -10, maxX: 10, minZ: -10, maxZ: -9.95, minY: 0, maxY: 30 };
    let v = { ...createVehicle('helicopter'), x: 0, y: 10, z: 0, yaw: 0, speed: 30 };
    let maxImpact = 0;
    for (let i = 0; i < Math.ceil(.5 / dt); i++) {
      const hit = flyVehicle(v, 1, 0, 0, true, dt, [thin]);
      v = hit.state; maxImpact = Math.max(maxImpact, hit.impactSpeed);
      expect(canFly(v.x, v.y, v.z, [thin])).toBe(true);
      expect(v.z).toBeGreaterThanOrEqual(-7.45);
    }
    expect(maxImpact).toBeGreaterThan(29);
    const roof = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, minY: 5, maxY: 5.01 };
    const fall = flyVehicle({ ...v, z: 0, y: 5.05, climb: -100, speed: 0 }, 0, 0, 0, false, dt, [roof]);
    expect(fall.state.y).toBeGreaterThanOrEqual(5.01);
    expect(fall.state.climb).toBeGreaterThan(0);
  });
});

describe('wreck motion', () => {
  const dead = (kind: 'car' | 'helicopter', over: Partial<VehicleState> = {}): VehicleState => ({ ...createVehicle(kind, { x: 0, z: 0, yaw: 0 }), health: 0, ...over });
  const roam = (v: VehicleState, seconds: number, obstacles: Obstacle[] = []) => {
    const seen = [v];
    for (let t = 0; t < seconds; t += .05) { v = stepVehicleWreck(v, .05, obstacles).state; seen.push(v); }
    return seen;
  };
  it('coasts on its speed and stops under ground friction', () => {
    const path = roam(dead('car', { speed: 20 }), 4), end = path.at(-1)!;
    expect(path[1].speed).toBeGreaterThan(19); // decelerating, not stopped
    expect(end.z).toBeLessThan(-20); expect(end.z).toBeGreaterThan(-30);
    expect(vehicleSpeed(end)).toBe(0); expect(wreckAtRest(end)).toBe(true);
  });
  it('keeps world-space momentum while the hull spins under it', () => {
    const end = stepVehicleWreck(dead('helicopter', { y: 60, speed: 20, yawSpeed: 2.4 }), .05, []).state;
    expect(-Math.cos(end.yaw) * end.speed - Math.sin(end.yaw) * (end.lateralSpeed ?? 0)).toBeCloseTo(-20 * Math.exp(-.25 * .05), 3);
    expect(end.yaw).toBeGreaterThan(.1);
  });
  it('carries a falling helicopter forward, records one crash and bounces', () => {
    const path = roam(dead('helicopter', { y: 40, speed: 25 }), 8), landing = path.findIndex(v => v.impact);
    const end = path.at(-1)!;
    expect(landing).toBeGreaterThan(0);
    expect(path[landing].impact).toMatchObject({ y: 1 }); expect(path[landing].impact!.speed).toBeGreaterThan(20);
    expect(path[landing].climb).toBeGreaterThan(0);
    expect(path[landing].z).toBeLessThan(-40); // flew on while it fell
    expect(end.y).toBeCloseTo(.13); expect(vehicleSpeed(end)).toBe(0);
  });
  it('stops against walls and rests on a supporting roof', () => {
    const wall: Obstacle = { minX: -5, maxX: 5, minZ: -13, maxZ: -12 };
    const stopped = roam(dead('car', { speed: 20 }), 3, [wall]);
    expect(stopped.at(-1)!.z).toBeGreaterThan(-12);
    expect(stopped.some(v => (v.impact?.speed ?? 0) >= 7)).toBe(true);
    const roof: Obstacle = { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: 0, maxY: 6 };
    expect(roam(dead('helicopter', { y: 20 }), 5, [roof]).at(-1)!.y).toBe(6);
  });
  it('never exceeds what a snapshot may carry, however fast it died', () => {
    for (const v of roam(dead('helicopter', { y: 60, speed: 30, lateralSpeed: 15, yawSpeed: 2.4 }), 3)) {
      expect(Math.abs(v.speed)).toBeLessThanOrEqual(31); expect(Math.abs(v.lateralSpeed ?? 0)).toBeLessThanOrEqual(31);
    }
  });
  it('leaves a resting wreck and dragon boats alone', () => {
    const rest = dead('car');
    expect(stepVehicleWreck(rest, .05, []).state).toBe(rest);
    const boat = { ...createVehicle('dragon-boat-red'), health: 0, speed: 3 };
    expect(stepVehicleWreck(boat, .05, []).state).toBe(boat);
  });
});
