import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildServiceWeapon } from './service-weapon-models';
import { createWeaponHandling } from './fps-viewmodel';
import { disposeModel } from './armory-visuals';
import { FPS_WEAPONS, reloadLength } from './fps-rules';
import { PISTOL_FLICK, reloadMotion, weaponReloadMotion } from './fps-weapon-motion';
import { reloadEnergy } from './fps-reload-energy';
import { pouchWeaponOffset } from './fps-pouch-reload';

function fixture() {
  const model = buildServiceWeapon('p30-inspired')!, handling = createWeaponHandling(model, 2);
  const hand = model.getObjectByName('reload-hand-left')!, right = model.getObjectByName('reload-hand-right')!;
  const slide = model.getObjectByName('p30-inspired__slide')!, anchor = model.getObjectByName('p30-inspired__charging-handle')!;
  handling.update(null, false);
  return { model, handling, hand, right, slide, anchor,
    at(time: number) { handling.update(time / reloadLength(true), true); model.updateWorldMatrix(true, true); },
    done() { handling.dispose(); disposeModel(model); } };
}

it('clasps the slide from above with fingers and thumb on opposite sides', () => {
  const f = fixture(), rightHome = f.right.position.clone();
  for (const time of [.94, .98, 1.015, 1.10, 1.15]) {
    f.at(time);
    const slide = new THREE.Box3().setFromObject(f.slide);
    const palm = new THREE.Box3().setFromObject(f.hand.children[0]);
    expect(palm.min.y).toBeCloseTo(slide.max.y, 5);
    expect(palm.min.x).toBeLessThan(slide.min.x);
    expect(palm.max.x).toBeGreaterThan(slide.max.x);
    expect(new THREE.Vector3(0, 0, -1).applyQuaternion(f.hand.quaternion).y).toBeCloseTo(-1);
    for (let i = 0; i < 4; i++) {
      const finger = f.hand.getObjectByName(`grip-finger-${i}`)!;
      const box = new THREE.Box3().setFromObject(finger.children[0]);
      expect(box.min.x).toBeGreaterThanOrEqual(slide.max.x);
      expect(box.min.y).toBeLessThan(slide.max.y);
    }
    const thumb = new THREE.Box3().setFromObject(f.hand.getObjectByName('grip-thumb')!);
    expect(thumb.max.x).toBeLessThan(slide.min.x);
    expect(thumb.min.y).toBeLessThan(slide.max.y);
    expect(f.right.position.distanceTo(rightHome)).toBe(0);
  }
  expect(f.anchor.visible).toBe(false);
  f.done();
});

it('pulls the real slide and its sights together, then lets them snap home below the released hand', () => {
  const f = fixture();
  const parts = f.model.children.filter(part => /__(slide|slide-serration|front-sight|rear-sight)$/.test(part.name));
  const homes = parts.map(part => part.position.z);
  const frame = f.model.getObjectByName('p30-inspired__frame')!, frameHome = frame.position.clone();
  f.at(.94); const palmStart = f.hand.position.z;
  f.at(1.10);
  parts.forEach((part, i) => expect(part.position.z - homes[i]).toBeCloseTo(.035));
  expect(f.hand.position.z - palmStart).toBeCloseTo(.035);
  expect(frame.position.distanceTo(frameHome)).toBe(0);
  f.at(1.19);
  parts.forEach((part, i) => expect(part.position.z).toBeCloseTo(homes[i]));
  expect(f.hand.position.y).toBeGreaterThan(.27);
  expect(f.hand.position.x).toBeLessThan(-.13);
  f.at(1.10); f.handling.update(null, false);
  parts.forEach((part, i) => expect(part.position.z).toBeCloseTo(homes[i]));
  f.at(1.10); f.handling.dispose();
  parts.forEach((part, i) => expect(part.position.z).toBeCloseTo(homes[i]));
  disposeModel(f.model);
});

it('approaches over the slide without cutting the palm through it and skips the clasp on tactical reloads', () => {
  const f = fixture();
  for (let step = 840; step < 940; step++) {
    f.at(step / 1000);
    const palm = new THREE.Box3().setFromObject(f.hand.children[0]);
    const slide = new THREE.Box3().setFromObject(f.slide).expandByScalar(-.0001);
    expect(palm.intersectsBox(slide), `approach ${step}`).toBe(false);
  }
  const home = f.slide.position.z;
  for (let step = 0; step <= 100; step++) {
    f.handling.update(step / 100, false);
    expect(f.slide.position.z).toBe(home);
  }
  f.done();
});

describe('flicking the spent magazine out one-handed', () => {
  const spec = FPS_WEAPONS.find(weapon => weapon.id === 'p30-inspired')!;
  const { snap, stop, release, gone } = PISTOL_FLICK;
  /** The real hip pose through the real camera, as the engine composes them. */
  function viewed(style: 'improved' | 'original' = 'improved', empty = false) {
    const rig = new THREE.Group(), model = buildServiceWeapon(spec.id)!; rig.add(model);
    const handling = createWeaponHandling(model, FPS_WEAPONS.indexOf(spec)), magazine = model.getObjectByName(`${spec.id}__magazine`)!;
    const left = model.getObjectByName('reload-hand-left')!;
    const camera = new THREE.PerspectiveCamera(65, 16 / 9, .01, 20);
    camera.updateMatrixWorld(true); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const at = (time: number) => {
      const progress = time / reloadLength(empty), pose = weaponReloadMotion(progress, empty, spec, style), energy = reloadEnergy(progress, empty, spec, style), pouch = pouchWeaponOffset(progress, empty);
      rig.position.set(.20 + pose.x + energy.x + pouch.x, -.32 + pose.y + energy.y + pouch.y, -.78 + pose.z + energy.z + pouch.z);
      rig.rotation.set(pose.pitch + energy.pitch, pose.yaw + energy.yaw + pouch.yaw, pose.roll + energy.roll + pouch.roll);
      rig.updateMatrixWorld(true);
      handling.update(progress, empty, undefined, undefined, undefined, { rounds: spec.capacity, capacity: spec.capacity }, style);
      rig.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(magazine).getCenter(new THREE.Vector3());
    };
    return { at, model, magazine, left, camera, handling, done() { handling.dispose(); disposeModel(model); } };
  }

  it('leaves for the lower right, in view on the way, and is off the bottom before the rules take it', () => {
    const f = viewed(), seated = f.at(snap).project(f.camera);
    const flight = Array.from({ length: 12 }, (_, step) => f.at(release + (gone - .001 - release) * step / 11).project(f.camera));
    flight.slice(1).forEach((point, i) => {
      expect(point.x, `x, step ${i}`).toBeGreaterThan(flight[i].x);
      expect(point.y, `y, step ${i}`).toBeLessThan(flight[i].y);
    });
    expect(flight[0].x).toBeGreaterThan(seated.x);
    expect(flight.filter(point => Math.abs(point.x) < 1 && Math.abs(point.y) < 1).length).toBeGreaterThanOrEqual(6);
    const last = flight[flight.length - 1];
    expect(last.y).toBeLessThan(-1.1);
    expect(last.x).toBeGreaterThan(seated.x + .25);
    f.done();
  });

  it('keeps the left hand off the gun and the magazine for the whole flick', () => {
    const f = viewed();
    for (let time = snap; time < gone; time += .005) {
      const magazine = f.at(time), palm = f.left.getWorldPosition(new THREE.Vector3());
      expect(palm.distanceTo(magazine), `at ${time}`).toBeGreaterThan(.3);
    }
    f.done();
  });

  it('works the catch with the firing thumb, whose fingers stay wrapped, before the wrist goes', () => {
    const f = viewed(), thumb = f.model.getObjectByName('reload-hand-right')!.getObjectByName('grip-thumb')!, home = thumb.position.x;
    f.at(snap);
    expect(thumb.position.x).toBeGreaterThan(home + .01);
    f.at(stop + .06);
    expect(thumb.position.x).toBeCloseTo(home);
    f.done();
  });

  it('snaps the butt from left to right and stops there, on both reloads alike', () => {
    for (const empty of [false, true]) {
      const roll = (time: number) => weaponReloadMotion(time / reloadLength(empty), empty, spec).roll;
      expect(roll(snap)).toBeLessThan(-.3);
      expect(roll(stop)).toBeGreaterThan(.25);
      expect(roll(stop) - roll(snap)).toBeGreaterThan(.6);
      expect(roll(.48)).toBeCloseTo(reloadMotion(.48 / reloadLength(empty), empty, 'right').roll);
    }
    expect(weaponReloadMotion(0, false, spec)).toEqual(reloadMotion(0, false, 'right'));
  });

  it('throws a whole magazine, hidden inside the grip while seated', () => {
    const f = viewed(); f.at(0);
    expect(new THREE.Box3().setFromObject(f.magazine).getSize(new THREE.Vector3()).y).toBeGreaterThan(.1);
    const body = f.model.getObjectByName(`${spec.id}__magazine-body`) as THREE.Mesh, grip = f.model.getObjectByName(`${spec.id}__grip`)!;
    f.model.updateMatrixWorld(true);
    const intoGrip = grip.matrixWorld.clone().invert();
    body.geometry.computeBoundingBox();
    const { min, max } = body.geometry.boundingBox!;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
      const corner = new THREE.Vector3(x, y, z).applyMatrix4(body.matrixWorld).applyMatrix4(intoGrip);
      expect(Math.abs(corner.x)).toBeLessThan(.022);
      expect(Math.abs(corner.z)).toBeLessThan(.028);
    }
    f.done();
  });

  it('leaves the original reload as it was, with the magazine pulled straight down and no flick', () => {
    const f = viewed('original'), thumb = f.model.getObjectByName('reload-hand-right')!.getObjectByName('grip-thumb')!, thumbHome = thumb.position.x;
    for (const time of [.12, .205, .24, .30]) expect(weaponReloadMotion(time, false, spec, 'original')).toEqual(reloadMotion(time, false, 'right', 'original'));
    f.at(.1); const home = f.magazine.position.clone();
    f.at(.3);
    expect(f.magazine.position.x).toBe(home.x);
    expect(f.magazine.position.y).toBeCloseTo(home.y - reloadMotion(.3, false, 'right', 'original').magazineDrop);
    expect(thumb.position.x).toBe(thumbHome);
    expect(reloadEnergy(.25, false, spec, 'original').y).toBeLessThan(0);
    f.done();
  });
});
