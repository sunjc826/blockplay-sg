import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createWeaponHandling } from './fps-viewmodel';

it('carries the fresh magazine from the actual pouch through a transformed weapon pose', () => {
  const parent = new THREE.Group(), model = new THREE.Group(), magazine = new THREE.Group();
  parent.position.set(.2, -.32, -.78); parent.rotation.set(-.1, .2, -.4); parent.add(model);
  magazine.name = 'sar21-inspired__magazine'; magazine.position.set(0, -.05, .245); model.add(magazine);
  const home = magazine.position.clone(), handling = createWeaponHandling(model, 0), pouch = new THREE.Vector3(-.15, -.65, -.15);
  const reload = { pouch, magazineOut: true, pending: true, capacity: 36, baseCapacity: 30, saved: .47 };
  handling.update(.47, false, undefined, undefined, reload);
  expect(magazine.getWorldPosition(new THREE.Vector3()).distanceTo(pouch)).toBeLessThan(1e-6);
  expect(magazine.visible).toBe(true); expect(magazine.scale.y).toBeCloseTo(1.2);
  handling.update(.6, false, undefined, undefined, reload);
  const halfway = magazine.getWorldPosition(new THREE.Vector3());
  expect(halfway.distanceTo(pouch)).toBeGreaterThan(.01);
  handling.update(.74, false, undefined, undefined, { ...reload, magazineOut: false, pending: false });
  expect(magazine.position.distanceTo(home)).toBeLessThan(.02);
  handling.update(null, false, undefined, undefined, { ...reload, pending: false });
  expect(magazine.visible).toBe(false);
  handling.dispose();
});
