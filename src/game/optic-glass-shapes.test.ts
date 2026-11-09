import { expect, it } from 'vitest';
import * as THREE from 'three';
import { itemById } from './armory-catalog';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { applyEnemyWeaponConfig } from './enemy-weapon-models';
import { disposeModel } from './armory-visuals';
import { buildServiceWeapon } from './service-weapon-models';
import { fitWeaponOptic, getWeaponSight } from './weapon-optics';

// Exercise actual catalog routing, including the deliberately untouched sights.
const cases = [
  ['sar-marksman', 'convex'], ['sar-twoeyes', 'convex'], ['mag-lepak', 'convex'],
  ['cis50-summit', 'convex'], ['p30-kiasu', 'convex'], ['xm8-sharpshooter', 'convex'],
  ['ff-longwatch', 'convex'], ['ff-intervention', 'convex'], ['ff-scar-h', 'convex'], ['cc-network', 'convex'],
  ['sar-nightowl', 'flat'], ['ult-lights', 'flat'],
  ['ult-issued', 'concave'], ['p30-silent', 'concave'], ['ff-scar-l', 'concave'], ['cc-gatekeeper', 'concave'],
  ['sar-issued', 'concave'], ['g36-rifle', 'concave'], ['g36c', 'concave'], ['xm8-carbine', 'concave'],
  ['ff-oicw', 'concave'], ['ff-oicw-launcher', 'concave'], ['cc-qts11', 'concave'], ['cc-qts11-launcher', 'concave'],
] as const;

it.each(cases)('%s uses the approved %s surface without burying a telescope in its end cap', (id, shape) => {
  const item = itemById(id)!, profile = createProfile();
  const weapon = resolveLoadout(equip({ ...profile, owned: [...profile.owned, id] }, id, item.family!)).weapons[item.family!];
  const model = buildServiceWeapon(weapon.id) ?? new THREE.Group();
  const removeConfig = applyEnemyWeaponConfig(model, weapon.id, item.config);
  const remove = fitWeaponOptic(model, weapon), sight = getWeaponSight(model)!;
  try {
    const glass = sight.reflection!.surface, positions = glass.geometry.attributes.position;
    let center = 0, rim = 0, maxRadius = -1, minZ = Infinity;
    for (let i = 0; i < positions.count; i++) {
      const r = Math.hypot(positions.getX(i), positions.getY(i)), z = positions.getZ(i);
      if (r < 1e-8) center = z;
      if (r > maxRadius) { maxRadius = r; rim = z; }
      minZ = Math.min(minZ, z);
    }
    if (shape === 'flat') {
      expect(Math.abs(center)).toBe(0); expect(Math.abs(rim)).toBe(0);
      for (let i = 0; i < positions.count; i++) expect(Math.abs(positions.getZ(i))).toBe(0);
    } else expect(Math.sign(center - rim)).toBe(shape === 'convex' ? 1 : -1);
    if (sight.magnification > 1) expect(minZ).toBeGreaterThanOrEqual(0);
    // Offset dots remain concave even when the main prism eyepiece is convex.
    if (sight.offset) {
      const p = sight.offset.reflection!.surface.geometry.attributes.position;
      expect(Math.min(...Array.from({ length: p.count }, (_, i) => p.getZ(i)))).toBeLessThan(0);
    }
  } finally { remove(); removeConfig(); disposeModel(model); }
});

it('a convex eyepiece reflects sky above the horizon instead of inverting it', () => {
  const item = itemById('ff-intervention')!, profile = createProfile();
  const weapon = resolveLoadout(equip({ ...profile, owned: [...profile.owned, item.id] }, item.id, item.family!)).weapons[item.family!];
  const model = buildServiceWeapon(weapon.id)!, remove = fitWeaponOptic(model, weapon);
  try {
    const geometry = getWeaponSight(model)!.reflection!.surface.geometry;
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    // The viewing ray at each inner vertical sample should return towards the
    // same side of the horizon. This checks geometry-derived reflection rays,
    // independent of texture coordinates and the reflection capture camera.
    let samples = 0;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getX(i)) > 1e-7 || Math.abs(p.getY(i)) < .005) continue;
      const ray = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i) - .5).normalize();
      const normal = new THREE.Vector3().fromBufferAttribute(n, i).normalize();
      ray.reflect(normal);
      expect(ray.z).toBeGreaterThan(0);
      expect(ray.y * p.getY(i)).toBeGreaterThan(0);
      samples++;
    }
    expect(samples).toBeGreaterThan(4);
  } finally { remove(); disposeModel(model); }
});
