import * as THREE from 'three';
import { expect, it } from 'vitest';
import { FPS_WEAPONS, reloadLength } from './fps-rules';
import { readyEnergy } from './fps-reload-energy';
import { createWeaponHandling } from './fps-viewmodel';
import { handleSide, READY_BEATS, READY_SECONDS, readyMotion } from './fps-weapon-motion';
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
      expect(Math.abs(hand.position.x - handle.position.x)).toBeGreaterThan(.11);
      expect(hand.position.z - handle.position.z).toBeGreaterThan(.085);
      const clear = at(1.20).clone();
      expect(clear.z - held.z).toBeCloseTo(handleSide(spec.id) === 'top' ? .13 : .045, 8);
      // Past straight: the palm is thrown open.
      expect(hand.getObjectByName('grip-finger-0')!.rotation.x).toBeLessThan(0);
      expect(at(1.23).distanceTo(clear)).toBeLessThan(1e-9);
      // The deployment-ready action uses the same release, while shot bolt
      // cycles and tactical reloads never enter this gesture.
      handling.update(null, false, undefined, .9 / READY_SECONDS);
      expect(hand.position.distanceTo(clear)).toBeLessThan(1e-9);
      let previous = at(1.149);
      for (let step = 1150; step <= 1421; step++) {
        const current = at(step / 1000);
        expect(current.distanceTo(previous)).toBeLessThan(.017);
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

for (const [index, spec] of FPS_WEAPONS.entries()) {
  if (spec.feed === 'belt' || spec.feed === 'drum') continue;
  it(`${spec.name}: the spawn rack holds still, then the hand jerks back and hangs there`, () => {
    const model = buildServiceWeapon(spec.id) ?? new THREE.Group(), rig = new THREE.Group(); rig.add(model);
    const handling = createWeaponHandling(model, index);
    const hand = model.getObjectByName(spec.action === 'bolt' ? 'reload-hand-right' : 'reload-hand-left')!;
    // Hands are children of the gun, so measure them as the player sees them: with the gun's own movement.
    const depth = (seconds: number) => {
      const p = seconds / READY_SECONDS, motion = readyMotion(p, handleSide(spec.id)), energy = readyEnergy(p, spec);
      rig.position.set(motion.x + energy.x, motion.y + energy.y, motion.z + energy.z);
      rig.rotation.set(motion.pitch + energy.pitch, motion.yaw + energy.yaw, motion.roll + energy.roll);
      handling.update(null, false, undefined, p);
      rig.updateMatrixWorld(true);
      return hand.getWorldPosition(new THREE.Vector3()).z;
    };
    const { stop, release, returns } = READY_BEATS, atStop = depth(stop);
    // Held: no push forward, and no more than a settling drift back.
    for (let seconds = stop; seconds <= release; seconds += .005) {
      expect(depth(seconds)).toBeGreaterThan(atStop - .002);
      expect(depth(seconds)).toBeLessThan(atStop + .03);
    }
    // Let go: most of the jerk back is over within 40 ms, and only the bolt's jolt
    // moves the hand forward, by millimetres, until it starts for the grip.
    const letGo = depth(release), jerked = depth(release + .04);
    // Side handles leave mostly sideways, so they only have to hold their depth.
    expect(jerked - letGo).toBeGreaterThan(handleSide(spec.id) === 'top' ? .09 : -.003);
    const floor = handleSide(spec.id) === 'top' ? jerked : letGo;
    for (let seconds = release + .04; seconds <= returns; seconds += .002) expect(depth(seconds)).toBeGreaterThan(floor - .006);
    handling.dispose(); disposeModel(model);
  });
}
