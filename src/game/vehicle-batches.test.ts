import * as THREE from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildVehicleModel, VEHICLE_MOVING_PARTS } from './vehicle-models';
import { batchVehicleParts } from './vehicle-batches';
import { vehicleDamageVisual } from './vehicle-effects';
import { disposeModel } from './armory-visuals';
import { updateHumveeInstruments } from './humvee-cabin';
import { firstVisibleHit } from './fps-raycast';
import { seatLocalPoint, VEHICLE_SEATS } from './vehicle-seats';

beforeEach(() => vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) }));
afterEach(() => vi.unstubAllGlobals());
const meshes = (root: THREE.Object3D) => { const out: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh) out.push(o); }); return out; };
const triangles = (root: THREE.Object3D) => meshes(root).filter(m => !m.userData.shadowProxy).reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0);
const signature = (m: THREE.Material) => { const v = m as THREE.MeshStandardMaterial; return [m.type, m.name, v.color?.getHexString(), v.roughness, v.metalness, m.transparent, m.side]; };

it.each(['car', 'helicopter'] as const)('reduces %s meshes while preserving triangles, glass, shadow proxies and animation anchors', kind => {
  const raw = buildVehicleModel(kind, 'paint-issued', { batchParts: false }), batched = buildVehicleModel(kind);
  try {
    expect(meshes(raw).length - meshes(batched).length).toBeGreaterThan(kind === 'car' ? 140 : 80);
    expect(triangles(batched)).toBe(triangles(raw));
    const glass = (r: THREE.Object3D) => meshes(r).filter(m => (m.material as THREE.Material).transparent).map(m => [m.name, m.position.toArray(), m.geometry.getAttribute('position').count]);
    expect(glass(batched)).toEqual(glass(raw));
    const shadows = (r: THREE.Object3D) => meshes(r).filter(m => m.userData.shadowProxy).map(m => [m.parent!.name, Array.from(m.geometry.getAttribute('position').array)]);
    expect(shadows(batched)).toEqual(shadows(raw));
    for (const name of VEHICLE_MOVING_PARTS) {
      const a = raw.getObjectsByProperty('name', name), b = batched.getObjectsByProperty('name', name);
      expect(b.map(o => [o.position.toArray(), o.rotation.toArray(), o.visible])).toEqual(a.map(o => [o.position.toArray(), o.rotation.toArray(), o.visible]));
    }
  } finally { disposeModel(raw); disposeModel(batched); }
});

it.each(['car', 'helicopter'] as const)('keeps %s exterior and seated ray hits through motion, damage and reset', kind => {
  const raw = buildVehicleModel(kind, 'paint-issued', { batchParts: false }), batched = buildVehicleModel(kind);
  const damage = [vehicleDamageVisual(raw), vehicleDamageVisual(batched)];
  const rays: [THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < 160; i++) {
    const a = i * 2.399963, origin = new THREE.Vector3(Math.cos(a) * 9, .2 + (i % 17) * .29, Math.sin(a) * 9);
    const target = new THREE.Vector3(Math.sin(i * 1.71) * .8, .4 + (i % 9) * .31, Math.cos(i * .77) * 2.3);
    rays.push([origin, target.sub(origin).normalize()]);
  }
  for (let seat = 0; seat < VEHICLE_SEATS.length; seat++) {
    const p = seatLocalPoint(kind, seat);
    for (const d of [[0, -1, 0], [0, 1, 0], [0, 0, -1], [-1, 0, 0], [1, 0, 0], [0, 0, 1]]) rays.push([new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(...d)]);
  }
  try {
    for (const [step, stage] of (['intact', 'critical', 'destroyed', 'intact'] as const).entries()) {
      for (const [i, model] of [raw, batched].entries()) {
        damage[i](stage); model.position.set(7, 2, -3); model.rotation.set(.08, .73, -.11, 'YXZ');
        model.traverse(o => { if (o.name === 'vehicle-wheel') o.rotation.x = step * .71; });
        for (const name of ['main-rotor', 'tail-rotor', 'vehicle-turret']) { const o = model.getObjectByName(name); if (o) o.rotation.y = step * .31; }
        updateHumveeInstruments(model, 13, .2, .1); model.updateMatrixWorld(true);
      }
      for (const [origin, direction] of rays) {
        const ray = new THREE.Raycaster(origin.clone().applyMatrix4(raw.matrixWorld), direction.clone().transformDirection(raw.matrixWorld));
        const a = firstVisibleHit(ray, [raw], true, true), b = firstVisibleHit(ray, [batched], true, true);
        expect(!!b).toBe(!!a);
        if (!a || !b) continue;
        expect(b.distance).toBeCloseTo(a.distance, 4);
        expect(signature((b.object as THREE.Mesh).material as THREE.Material)).toEqual(signature((a.object as THREE.Mesh).material as THREE.Material));
        expect(b.object.userData.rainReceiver).toBe(a.object.userData.rainReceiver);
        expect(b.object.userData.wetSurface).toBe(a.object.userData.wetSurface);
        if (a.uv && b.uv) expect(a.uv.distanceTo(b.uv)).toBeLessThan(.0001);
        const normal = (h: THREE.Intersection) => h.face!.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld));
        expect(normal(a).distanceTo(normal(b))).toBeLessThan(.0001);
      }
    }
  } finally { disposeModel(raw); disposeModel(batched); }
});

it('retains independently controlled or incompatible parts, and disposes only unreferenced source geometry', () => {
  const root = new THREE.Group(), parent = new THREE.Group(); root.add(parent);
  const mat = new THREE.MeshStandardMaterial(), geo = new THREE.BoxGeometry();
  const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat), hidden = new THREE.Mesh(geo, mat);
  b.position.x = 2; hidden.visible = false; parent.add(a, b, hidden);
  const panel = new THREE.Mesh(geo, mat); panel.position.y = 1; root.add(panel);
  const control = new THREE.Mesh(geo, mat); control.name = 'control'; parent.add(control);
  const custom = new THREE.Mesh(geo, mat); custom.onBeforeRender = () => {}; parent.add(custom);
  const dispose = vi.spyOn(geo, 'dispose'); batchVehicleParts(root, new Set(['control']));
  expect(a.parent).toBeNull(); expect(b.parent).toBeNull(); expect(dispose).not.toHaveBeenCalled();
  for (const m of [hidden, panel, control, custom]) expect(m.parent).not.toBeNull();
  const merged = meshes(root).find(m => m.geometry !== geo)!;
  const accelerated = merged.raycast; merged.geometry.dispose();
  expect(merged.raycast).not.toBe(accelerated); disposeModel(root);
});
