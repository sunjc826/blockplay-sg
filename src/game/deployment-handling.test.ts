import { expect, it } from 'vitest';
import * as THREE from 'three';
import { FPS_WEAPONS } from './fps-rules';
import { createWeaponHandling } from './fps-viewmodel';

it.each(FPS_WEAPONS.map((spec, i) => [spec.id, i] as const))('moves the %s support hand and action without removing its magazine', (id, i) => {
  const model = new THREE.Group(), magazine = new THREE.Group(), handle = new THREE.Group(), cover = new THREE.Group();
  magazine.name = `${id}__magazine`; handle.name = `${id}__charging-handle`; cover.name = `${id}__feed-cover`;
  handle.position.set(.05, .25, .1); model.add(magazine, handle, cover);
  const handling = createWeaponHandling(model, i);
  const left = model.getObjectByName('fps-handling')!.children[1];
  handling.update(null, false);
  const home = left.position.clone();
  handling.update(null, false, undefined, .48);
  expect(left.position.distanceTo(home)).toBeGreaterThan(.04);
  expect(magazine.position.y).toBe(0); expect(magazine.visible).toBe(true); expect(cover.rotation.x).toBe(0);
  if (i >= 3) expect(handle.position.z).toBeGreaterThan(.16);
  handling.update(null, false);
  expect(left.position.distanceTo(home)).toBe(0);
  if (i >= 3) expect(handle.position.z).toBe(.1);
  handling.dispose();
});
