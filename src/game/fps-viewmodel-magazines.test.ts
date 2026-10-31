import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createWeaponHandling } from './fps-viewmodel';

function fixture() {
  const world = new THREE.Group(), body = new THREE.Group(), source = new THREE.Group(); world.add(body); body.add(source);
  body.position.set(1, .9, 2); body.rotation.y = .7; source.position.set(-.1, .1, -.2);
  const sourceMesh = new THREE.Mesh(new THREE.BoxGeometry(.065, .14, .038)); sourceMesh.position.y = .035; source.add(sourceMesh);
  const parent = new THREE.Group(), model = new THREE.Group(); parent.add(model);
  parent.position.set(.2, -.32, -.78); parent.rotation.set(-.1, .2, -.4);
  // Deliberately use the authored GLB convention: vertices offset from an
  // identity mesh transform. Aligning object origins misses the real magazine.
  const geometry = new THREE.BoxGeometry(.043, .18, .074); geometry.translate(0, -.05, .245);
  const magazine = new THREE.Mesh(geometry); magazine.name = 'sar21-inspired__magazine'; model.add(magazine);
  const handling = createWeaponHandling(model, 0), camera = new THREE.PerspectiveCamera(65, 1, .01, 100);
  camera.position.set(1, 1.75, 2); camera.rotation.set(-1, .7, 0, 'YXZ'); camera.updateMatrixWorld(true);
  const input = { model: source, shoulder: new THREE.Vector3(.83, 1.5, 2), worldToView: camera.matrixWorldInverse.clone() };
  const reload = { source: input, magazineOut: true, pending: false, capacity: 30, baseCapacity: 30, saved: .47 };
  const centre = (object: THREE.Object3D) => { object.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()); };
  return { model, magazine, handling, source, sourceMesh, input, reload, centre };
}

it('reaches and grips the actual visible pouch before transferring its magazine', () => {
  const f = fixture();
  f.handling.update(.40, false, undefined, undefined, f.reload);
  expect(f.handling.reloadReach?.phase).toBe('reach');
  const approaching = new THREE.Vector3().fromArray(f.handling.reloadReach!.hand);
  f.handling.update(.46, false, undefined, undefined, f.reload);
  expect(f.handling.reloadReach?.phase).toBe('grip');
  const target = f.centre(f.source).applyMatrix4(f.input.worldToView);
  const hand = f.model.getObjectByName('reload-hand-left')!;
  expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(.055);
  expect(approaching.distanceTo(target)).toBeGreaterThan(hand.getWorldPosition(new THREE.Vector3()).distanceTo(target));
  expect(f.source.visible).toBe(true);
  expect(f.model.getObjectByName('reload-carried-magazine')!.visible).toBe(false);
  expect(f.model.getObjectByName('reload-upper-arm')!.parent!.visible).toBe(true);
  expect(hand.getObjectByName('hand-forearm-stub')!.visible).toBe(false);
  f.handling.dispose();
});

it('extracts the matching pouch geometry continuously, carries it in an arc and inserts at the physical well', () => {
  const f = fixture(); f.source.visible = false;
  f.handling.update(.47, false, undefined, undefined, { ...f.reload, pending: true });
  const carried = f.model.getObjectByName('reload-carried-magazine')!;
  const from = f.centre(f.source).applyMatrix4(f.input.worldToView);
  expect(f.centre(carried).distanceTo(from)).toBeLessThan(1e-6);
  expect((carried.children[0] as THREE.Mesh).geometry).toBe(f.sourceMesh.geometry);
  expect(f.magazine.visible).toBe(false);
  f.handling.update(.55, false, undefined, undefined, { ...f.reload, pending: true });
  expect(f.handling.reloadReach?.phase).toBe('extract');
  expect(f.centre(carried).distanceTo(from)).toBeGreaterThan(.10);
  f.handling.update(.62, false, undefined, undefined, { ...f.reload, pending: true });
  expect(f.handling.reloadReach?.phase).toBe('carry');
  expect(f.model.getObjectByName('reload-carried-magazine')).toBe(carried);
  f.handling.update(.7399, false, undefined, undefined, { ...f.reload, pending: true });
  const destination = new THREE.Vector3(0, -.05, .245).applyMatrix4(f.model.matrixWorld);
  expect(f.centre(carried).distanceTo(destination)).toBeLessThan(.001);
  f.handling.update(.74, false, undefined, undefined, { ...f.reload, magazineOut: false });
  expect(carried.visible).toBe(false); expect(f.magazine.visible).toBe(true);
  const dispose = vi.spyOn(f.sourceMesh.geometry, 'dispose'); f.handling.dispose(); expect(dispose).not.toHaveBeenCalled();
});

it('keeps empty reloads on the same grab clock, holds interrupted extraction, and clears on switch', () => {
  const f = fixture(); f.source.visible = false;
  f.handling.update(.52 / 1.5, true, undefined, undefined, { ...f.reload, pending: true });
  const carried = f.model.getObjectByName('reload-carried-magazine')!, position = f.centre(carried);
  f.handling.update(null, true, undefined, undefined, { ...f.reload, saved: .52 / 1.5, pending: true });
  expect(f.centre(carried).distanceTo(position)).toBeLessThan(1e-6);
  f.handling.update(null, false);
  expect(carried.parent!.visible).toBe(false); expect(f.handling.reloadReach).toBeNull();
  f.handling.dispose();
});

for (const [name, offset, projection] of [
  ['lower torso', [0, -.18, 0], 1], ['left side', [-.13, 0, .12], 1],
  ['right side / ADS exit', [.34, 0, .12], .86],
] as const) it(`contacts the ${name} magazine despite body and camera transforms`, () => {
  const f = fixture(); f.source.position.add(new THREE.Vector3(...offset));
  f.input.worldToView.premultiply(new THREE.Matrix4().makeScale(projection, projection, 1));
  f.handling.update(.46, false, undefined, undefined, f.reload);
  const from = f.centre(f.source).applyMatrix4(f.input.worldToView);
  expect(new THREE.Vector3().fromArray(f.handling.reloadReach!.hand).distanceTo(from)).toBeLessThan(.06);
  f.source.visible = false;
  f.handling.update(.47, false, undefined, undefined, { ...f.reload, pending: true });
  expect(f.centre(f.model.getObjectByName('reload-carried-magazine')!).distanceTo(from)).toBeLessThan(1e-6);
  f.model.updateMatrixWorld(true);
  f.model.traverse(node => expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true));
  f.handling.dispose();
});
