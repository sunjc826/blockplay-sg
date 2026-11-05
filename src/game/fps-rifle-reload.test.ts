import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FPS_WEAPONS, reloadLength } from './fps-rules';
import { beltWeaponMotion, handleSide, MAGAZINE_THROW, magazineThrow, reloadMotion, weaponReloadMotion } from './fps-weapon-motion';
import { createWeaponHandling } from './fps-viewmodel';
import { buildServiceWeapon } from './service-weapon-models';
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
      // The P30's own wrist pose ends where the common magazine pose picks up, at .48.
      if (weapon.id === 'p30-inspired' && progress * reloadLength(empty) < .48) continue;
      expect(weaponReloadMotion(progress, empty, weapon)).toEqual(weapon.feed === 'belt'
        ? beltWeaponMotion(progress, empty) : reloadMotion(progress, empty, handleSide(weapon.id)));
    }
  }
});

// The SAR 21 and Ultimax are authored GLBs: boxes where their magazines sit, with
// vertices offset from an identity mesh transform as in those files.
function serviceOrAuthored(id: string) {
  const built = buildServiceWeapon(id);
  if (built) return built;
  const drum = id === 'ultimax-inspired', geometry = drum ? new THREE.BoxGeometry(.199, .117, .117) : new THREE.BoxGeometry(.043, .18, .074);
  geometry.translate(0, drum ? .07 : -.05, drum ? -.02 : .245);
  const model = new THREE.Group(), magazine = new THREE.Mesh(geometry); magazine.name = `${id}__magazine`; model.add(magazine);
  return model;
}

describe('throwing the spent magazine', () => {
  const thrower = FPS_WEAPONS.flatMap((spec, index) => spec.feed === 'belt' ? [] : [{ spec, index }]);
  const { strip, whip, release, gone } = MAGAZINE_THROW;
  const speed = (axis: 0 | 1 | 2, time: number, key: 'flown' | 'hand') => (magazineThrow(time + .0005)[key][axis] - magazineThrow(time - .0005)[key][axis]) / .001;

  it('sets off with the hand and at its speed, then leaves the hand behind', () => {
    for (const key of ['flown', 'hand'] as const) for (const axis of magazineThrow(whip)[key]) expect(Math.abs(axis)).toBe(0);
    expect(magazineThrow(release).flown).toEqual(magazineThrow(release).hand);
    for (const axis of [0, 1, 2] as const) expect(speed(axis, release, 'hand')).toBeCloseTo(speed(axis, release, 'flown'), 0);
    expect(magazineThrow(release + .03).flown[0]).toBeLessThan(magazineThrow(release + .03).hand[0] - .05);
    // Across the screen in about a fifth of a second on a rifle, turning over as it goes.
    expect(magazineThrow(gone).flown[0]).toBeLessThan(-.9);
    expect(Math.abs(magazineThrow(gone).spin[2])).toBeGreaterThan(Math.PI * 1.8);
  });

  it('clamps the hand on, then throws it open as it lets go', () => {
    expect(magazineThrow(strip).clamp).toBe(1);
    expect(magazineThrow(strip).open).toBe(0);
    expect(magazineThrow(release + .01).clamp).toBe(0);
    expect(magazineThrow(release + .01).open).toBe(1);
    expect(magazineThrow(gone).open).toBe(0);
    expect(magazineThrow(gone).armOut).toBe(0);
  });

  it.each(thrower)('$spec.name: flies through the frame and is off it before it stops existing', ({ spec, index }) => {
    const rig = new THREE.Group(), model = serviceOrAuthored(spec.id); rig.add(model);
    const handling = createWeaponHandling(model, index), magazine = model.getObjectByName(`${spec.id}__magazine`)!;
    const camera = new THREE.PerspectiveCamera(65, 16 / 9, .01, 20);
    camera.updateMatrixWorld(true); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const frame = (time: number) => {
      const pose = weaponReloadMotion(time, false, spec), energy = reloadEnergy(time, false, spec), pouch = pouchWeaponOffset(time, false);
      rig.position.set(.20 + pose.x + energy.x + pouch.x, -.32 + pose.y + energy.y + pouch.y, -.78 + pose.z + energy.z + pouch.z);
      rig.rotation.set(pose.pitch + energy.pitch, pose.yaw + energy.yaw + pouch.yaw, pose.roll + energy.roll + pouch.roll);
      rig.updateMatrixWorld(true);
      handling.update(time, false, undefined, undefined, undefined, { rounds: spec.capacity, capacity: spec.capacity });
      rig.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(magazine).getCenter(new THREE.Vector3()).project(camera);
    };
    const inFrame = (at: THREE.Vector3) => Math.abs(at.x) < 1 && Math.abs(at.y) < 1;
    const flight = Array.from({ length: 11 }, (_, step) => frame(release + (.355 - release) * step / 10));
    expect(flight.some(inFrame), 'seen on the way').toBe(true);
    // The rules take the magazine out at `gone`: its middle has to be past the edge by a clear margin.
    const last = frame(gone - .001);
    expect(last.y < -1.1 || last.x < -1.1, `${spec.id} at ${last.x.toFixed(2)}, ${last.y.toFixed(2)}`).toBe(true);
    handling.dispose();
  });

  it('leaves the magazine seated when no reload is running, and a spawn rack alone', () => {
    const spec = FPS_WEAPONS[0], model = serviceOrAuthored(spec.id), handling = createWeaponHandling(model, 0);
    const magazine = model.getObjectByName(`${spec.id}__magazine`)!, home = magazine.position.clone();
    handling.update(null, false);
    expect(magazine.position.distanceTo(home)).toBe(0);
    handling.update(null, false, undefined, .5);
    expect(magazine.position.distanceTo(home)).toBe(0);
    handling.dispose();
  });
});

describe('the original reload style', () => {
  const sar = FPS_WEAPONS[0], rack = (time: number) => time / reloadLength(true);

  it('only ever differs from the improved one in how it looks, on the same clock', () => {
    for (const spec of FPS_WEAPONS) for (const empty of [false, true]) for (let step = 0; step <= 100; step++) {
      const a = weaponReloadMotion(step / 100, empty, spec, 'original'), b = weaponReloadMotion(step / 100, empty, spec);
      expect(a.magazineVisible).toBe(b.magazineVisible);
      expect(a.handToMagazine).toBe(b.handToMagazine);
      expect(a.handToHandle).toBe(b.handToHandle);
      expect(a.beltSeated).toBe(b.beltSeated);
    }
  });

  it('keeps the SAR 21 turned to show its left side while racking', () => {
    expect(reloadMotion(rack(1.04), true, 'top', 'original').yaw).toBeCloseTo(.34);
    expect(reloadMotion(rack(1.04), true, 'top').yaw).toBeCloseTo(.05);
  });

  it('adds no shove from a thrown magazine', () => {
    const after = MAGAZINE_THROW.release + .015;
    expect(reloadEnergy(after, false, sar, 'original').x).toBeLessThan(reloadEnergy(after, false, sar).x);
  });

  it('pulls the magazine straight down instead of throwing it, on the same hand', () => {
    const model = serviceOrAuthored(sar.id), handling = createWeaponHandling(model, 0), magazine = model.getObjectByName(`${sar.id}__magazine`)!;
    const home = magazine.position.clone(), time = MAGAZINE_THROW.release + .05;
    handling.update(time, false, undefined, undefined, undefined, undefined, 'original');
    expect(magazine.position.x).toBe(home.x);
    expect(magazine.position.z).toBe(home.z);
    expect(home.y - magazine.position.y).toBeCloseTo(reloadMotion(time).magazineDrop);
    handling.update(time, false);
    expect(magazine.position.x).toBeLessThan(home.x - .1);
    handling.dispose();
  });

  it('leaves the spawn rack as it is, whichever reload is chosen', () => {
    const model = serviceOrAuthored(sar.id), handling = createWeaponHandling(model, 0), hand = model.getObjectByName('reload-hand-left')!;
    for (const ready of [.3, .58, .62, .7]) {
      handling.update(null, false, undefined, ready);
      const improved = hand.position.clone(), turn = hand.quaternion.clone();
      handling.update(null, false, undefined, ready, undefined, undefined, 'original');
      expect(hand.position.distanceTo(improved)).toBe(0);
      expect(hand.quaternion.angleTo(turn)).toBeLessThan(1e-6);
    }
    handling.dispose();
  });
});
