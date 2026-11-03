import { expect, it } from 'vitest';
import { createVehicle, driveVehicle, flyVehicle } from './vehicle-rules';
import { damageVehicle, fireVehicleWeapon, VEHICLE_COMBAT, vehicleBlastDamage, vehicleCollisionDamage, vehicleDamageStage, vehicleExitDamage } from './vehicle-combat';

it.each(['car', 'helicopter'] as const)('%s has finite ammunition, cooldown, and no firing after destruction', kind => {
  const v = createVehicle(kind), spec = VEHICLE_COMBAT[kind];
  expect(v.health).toBe(spec.health);
  for (let i = 0; i < spec.ammo; i++) {
    v.weaponCooldown = 0; expect(fireVehicleWeapon(v)).toBe(true);
    expect(fireVehicleWeapon(v)).toBe(false); expect(v.ammo).toBe(spec.ammo - i - 1);
  }
  v.weaponCooldown = 0; expect(fireVehicleWeapon(v)).toBe(false); expect(v.ammo).toBe(0);
  v.ammo = 1; damageVehicle(v, spec.health); expect(fireVehicleWeapon(v)).toBe(false); expect(v.ammo).toBe(1);
});
it('advances through damage stages and emits destruction only once', () => {
  const v = createVehicle('car'); expect(vehicleDamageStage(v)).toBe('intact');
  for (const stage of ['damaged', 'smoking', 'critical', 'destroyed']) {
    expect(damageVehicle(v, 150)).toBe(stage === 'destroyed'); expect(vehicleDamageStage(v)).toBe(stage);
  }
  expect(damageVehicle(v, 1000)).toBe(false); expect(v.health).toBe(0);
  expect(driveVehicle(v, 1, 1, false, .05, []).state.x).toBe(v.x);
  const heli = createVehicle('helicopter'); damageVehicle(heli, 1000);
  expect(flyVehicle(heli, 1, 1, 1, true, .05, []).state.y).toBe(heli.y);
});
it('rejects invalid damage and falls off blast damage to zero at the radius', () => {
  const v = createVehicle('car'); for (const n of [-1, NaN, Infinity]) damageVehicle(v, n);
  expect(v.health).toBe(600); expect(vehicleBlastDamage('car', 0)).toBe(240);
  expect(vehicleBlastDamage('car', 4.5)).toBe(120); expect(vehicleBlastDamage('car', 9)).toBe(0);
  expect(vehicleBlastDamage('car', 20)).toBe(0); expect(vehicleCollisionDamage(4)).toBe(0);
  expect(vehicleCollisionDamage(20)).toBeGreaterThan(vehicleCollisionDamage(10));
});

it('scales collision damage quadratically above the bump tolerance in either direction', () => {
  for (const speed of [0, 4, 5, NaN, Infinity, -Infinity]) expect(vehicleCollisionDamage(speed)).toBe(0);
  expect(vehicleCollisionDamage(6)).toBe(.5);
  expect(vehicleCollisionDamage(10)).toBe(12.5);
  expect(vehicleCollisionDamage(15)).toBe(50);
  expect(vehicleCollisionDamage(20)).toBe(112.5);
  expect(vehicleCollisionDamage(30)).toBe(312.5);
  expect(vehicleCollisionDamage(-10)).toBe(12.5);
});

it('prices bailouts from total speed with a walking tolerance, including reverse and sideways skids', () => {
  const v = createVehicle('car');
  for (const speed of [0, 2, 3, -3]) expect(vehicleExitDamage({ ...v, speed })).toBe(0);
  expect(vehicleExitDamage({ ...v, speed: 10 })).toBe(24.5);
  expect(vehicleExitDamage({ ...v, speed: -10 })).toBe(24.5);
  expect(vehicleExitDamage({ ...v, speed: 6, lateralSpeed: 8 })).toBe(24.5);
  expect(vehicleExitDamage({ ...v, speed: 0, lateralSpeed: 10 })).toBe(24.5);
  expect(vehicleExitDamage({ ...v, speed: 20 })).toBeGreaterThan(100);
  expect(vehicleExitDamage({ ...createVehicle('helicopter'), speed: 20 })).toBe(0);
});

it('keeps a destroyed hull moving and kicks it, but stops a boat', () => {
  const car = { ...createVehicle('car'), speed: 18, lateralSpeed: 2 };
  expect(damageVehicle(car, 9999)).toBe(true);
  expect(car).toMatchObject({ speed: 18, lateralSpeed: 2, climb: 5.5 }); expect(Math.abs(car.yawSpeed!)).toBeGreaterThan(0);
  const air = { ...createVehicle('helicopter'), speed: 25, climb: -3 };
  damageVehicle(air, 9999); expect(air.speed).toBe(25); expect(air.climb).toBeCloseTo(-.5); expect(Math.abs(air.yawSpeed!)).toBeLessThanOrEqual(3);
  const boat = { ...createVehicle('dragon-boat-red'), speed: 3 };
  damageVehicle(boat, 9999); expect(boat).toMatchObject({ speed: 0, climb: 0 });
});
