import { expect, it } from 'vitest';
import { createVehicle, driveVehicle, flyVehicle } from './vehicle-rules';
import { damageVehicle, fireVehicleWeapon, VEHICLE_COMBAT, vehicleBlastDamage, vehicleCollisionDamage, vehicleDamageStage } from './vehicle-combat';

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
