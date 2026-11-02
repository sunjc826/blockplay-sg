import * as THREE from 'three';
import { expect, it } from 'vitest';
import { FPS_WEAPONS, reloadLength } from './fps-rules';
import { beltWeaponMotion, handleSide, reloadMotion, weaponReloadMotion } from './fps-weapon-motion';
import { reloadEnergy } from './fps-reload-energy';
import { pouchWeaponOffset } from './fps-pouch-reload';

const rifles = FPS_WEAPONS.filter(w => w.id !== 'p30-inspired' && w.feed !== 'belt' && w.feed !== 'drum');

it.each(rifles)('keeps the $name stock below the eye and the muzzle up through reload contacts', weapon => {
  for (const empty of [false, true]) for (const energyScale of [1, .25]) {
    for (let time = .16; time <= (empty ? 1.24 : .80); time += .005) {
      const progress = time / reloadLength(empty), pose = weaponReloadMotion(progress, empty, weapon);
      const energy = reloadEnergy(progress, empty, weapon), pouch = pouchWeaponOffset(progress, empty);
      const rotation = new THREE.Euler(pose.pitch + energy.pitch * energyScale,
        pose.yaw + energy.yaw * energyScale + pouch.yaw, pose.roll + energy.roll * energyScale + pouch.roll);
      const position = new THREE.Vector3(.20 + pose.x + energy.x * energyScale + pouch.x,
        -.32 + pose.y + energy.y * energyScale + pouch.y, -.78 + pose.z + energy.z * energyScale + pouch.z);
      // Upper rear stock envelope, deliberately wider/taller than the butt pad.
      const stock = new THREE.Vector3(.05, .30, .43).applyEuler(rotation).add(position);
      expect(stock.y, `${weapon.id} at ${time}`).toBeLessThan(-.06);
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(rotation);
      expect(forward.y).toBeGreaterThan(.20);
      expect(forward.z).toBeLessThan(-.8);
    }
  }
});

it('preserves mechanical timing and smooth exact endpoints for every rifle', () => {
  for (const weapon of rifles) for (const empty of [false, true]) {
    expect(weaponReloadMotion(0, empty, weapon)).toEqual(reloadMotion(0, empty));
    expect(weaponReloadMotion(1, empty, weapon)).toEqual(reloadMotion(0, empty));
    for (let step = 1; step <= 1000; step++) {
      const progress = step / 1000, pose = weaponReloadMotion(progress, empty, weapon);
      const before = weaponReloadMotion((step - 1) / 1000, empty, weapon);
      const original = reloadMotion(progress, empty, handleSide(weapon.id));
      for (const axis of ['x', 'y', 'z', 'pitch', 'yaw', 'roll'] as const)
        expect(Math.abs(pose[axis] - before[axis])).toBeLessThan(.025);
      for (const key of ['action', 'magazineDrop', 'magazineVisible', 'handToMagazine', 'handToHandle', 'beltSeated'] as const)
        expect(pose[key]).toBe(original[key]);
    }
  }
});

it('retains pistol and machine-gun poses', () => {
  for (const weapon of FPS_WEAPONS.filter(w => !rifles.includes(w))) for (const empty of [false, true]) {
    for (let step = 0; step <= 100; step++) {
      const progress = step / 100;
      expect(weaponReloadMotion(progress, empty, weapon)).toEqual(weapon.feed === 'belt'
        ? beltWeaponMotion(progress, empty) : reloadMotion(progress, empty, handleSide(weapon.id)));
    }
  }
});
