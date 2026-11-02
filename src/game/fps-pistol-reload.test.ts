import * as THREE from 'three';
import { expect, it } from 'vitest';
import { buildServiceWeapon } from './service-weapon-models';
import { createWeaponHandling } from './fps-viewmodel';
import { disposeModel } from './armory-visuals';
import { reloadLength } from './fps-rules';

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
