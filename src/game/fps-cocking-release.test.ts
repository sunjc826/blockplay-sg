import * as THREE from 'three';
import { expect, it } from 'vitest';
import { FPS_WEAPONS, reloadLength } from './fps-rules';
import { createWeaponHandling } from './fps-viewmodel';
import { buildServiceWeapon } from './service-weapon-models';
import { disposeModel } from './armory-visuals';

for (const [index, spec] of FPS_WEAPONS.entries()) {
  const machineGun = spec.feed === 'belt' || spec.feed === 'drum';
  it(`${spec.name}: ${machineGun ? 'retains MG handling' : 'releases rearward, flicks clear and returns independently'}`, () => {
    const model = buildServiceWeapon(spec.id) ?? new THREE.Group();
    const handling = createWeaponHandling(model, index);
    const right = spec.feed === 'belt' || spec.action === 'bolt';
    const hand = model.getObjectByName(right ? 'reload-hand-right' : 'reload-hand-left')!;
    const handle = model.getObjectByName(`${spec.id}__charging-handle`)!;
    handling.update(null, false);
    const home = hand.position.clone(), handleZ = handle.position.z;
    const at = (time: number) => { handling.update(time / reloadLength(true), true); return hand.position.clone(); };
    at(1.15); const held = hand.position.clone();
    at(1.19);
    expect(handle.position.z).toBeCloseTo(handleZ, 10);
    if (machineGun) {
      expect(hand.position.distanceTo(held)).toBeLessThan(1e-9);
    } else {
      expect(Math.abs(hand.position.x - handle.position.x)).toBeGreaterThan(.13);
      expect(hand.position.z - handle.position.z).toBeGreaterThan(.085);
      expect(hand.position.z - held.z).toBeCloseTo(.045, 8);
      expect(hand.getObjectByName('grip-finger-0')!.rotation.x).toBeLessThan(.13);
      const clear = hand.position.clone();
      expect(at(1.23).distanceTo(clear)).toBeLessThan(1e-9);
      // The deployment-ready action uses the same release, while shot bolt
      // cycles and tactical reloads never enter this gesture.
      handling.update(null, false, undefined, (1.23 - .8) / (reloadLength(true) - .8));
      expect(hand.position.distanceTo(clear)).toBeLessThan(1e-9);
      let previous = at(1.149);
      for (let step = 1150; step <= 1421; step++) {
        const current = at(step / 1000);
        expect(current.distanceTo(previous)).toBeLessThan(.012);
        expect(current.toArray().every(Number.isFinite)).toBe(true);
        previous = current;
      }
    }
    expect(at(1.5).distanceTo(home)).toBeLessThan(1e-9);
    at(1.21); handling.update(null, false);
    expect(hand.position.distanceTo(home)).toBeLessThan(1e-9);
    handling.update(1.2 / 1.5, false); // Tactical reload: no charging gesture.
    expect(handle.position.z).toBeCloseTo(handleZ, 10);
    handling.dispose(); disposeModel(model);
  });
}
