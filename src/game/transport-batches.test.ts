import * as THREE from 'three';
import './combat-event-catalog';
import { expect, it, vi } from 'vitest';
import * as batching from './rigid-batches';
import { getRegion } from './regions';
import { RAIL_ROUTES, railTimetable, type RailDistrict } from './rail-routes';
import { sceneFlightObstacles } from './flight-obstacles';
import { firstVisibleHit } from './fps-raycast';
import { buildLandingCraft } from './landing-craft-model';
import { buildTruck, createCombatEventVisuals } from './combat-event-visuals';
import { disposeModel } from './armory-visuals';
import type { ArenaTransport } from './combat-transports';
import type { CombatEventDescriptor } from './combat-events';

function raw<T>(build: () => T) { const spy = vi.spyOn(batching, 'batchRigidMeshes').mockReturnValue([]); try { return build(); } finally { spy.mockRestore(); } }
const meshes = (root: THREE.Object3D) => { const out: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh) out.push(o); }); return out; };
const bounds = (root: THREE.Object3D) => sceneFlightObstacles(root).map(b => Object.values(b).map(n => Math.round(n! * 1000)).join(',')).sort();
function triangles(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true); const inverse = root.matrixWorld.clone().invert(), result: { key: string; values: number[] }[] = [];
  root.traverseVisible(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry, m = o.material as THREE.MeshStandardMaterial, matrix = inverse.clone().multiply(o.matrixWorld), normal = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < (g.index?.count ?? g.attributes.position.count); i += 3) {
      const values: number[] = [];
      for (let j = i; j < i + 3; j++) {
        const at = g.index?.getX(j) ?? j;
        values.push(...new THREE.Vector3().fromBufferAttribute(g.attributes.position, at).applyMatrix4(matrix).toArray());
        values.push(...new THREE.Vector3().fromBufferAttribute(g.attributes.normal, at).applyNormalMatrix(normal).toArray());
        if (g.attributes.uv) values.push(...new THREE.Vector2().fromBufferAttribute(g.attributes.uv, at).toArray());
      }
      // Offset the coarse sorting bins away from authored half-millimetres;
      // the assertion below still checks every actual component to 0.1 mm.
      result.push({ key: JSON.stringify([m.type, m.color.getHex(), m.transparent, m.opacity, m.side, o.castShadow, o.receiveShadow, ...values.map(n => Math.round(n * 1000 + .123))]), values });
    }
  });
  return result.sort((a, b) => a.key.localeCompare(b.key));
}
function parity(a: THREE.Object3D, b: THREE.Object3D, rays = false) {
  const x = triangles(a), y = triangles(b); expect(y.map(t => t.key)).toEqual(x.map(t => t.key));
  for (let i = 0; i < x.length; i++) for (let j = 0; j < x[i].values.length; j++) expect(Math.abs(x[i].values[j] - y[i].values[j])).toBeLessThan(.0001);
  expect(bounds(b)).toEqual(bounds(a));
  if (!rays) return;
  const targets = meshes(a).map(m => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
  for (const target of targets) for (const direction of [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)]) {
    const ray = new THREE.Raycaster(target.clone().add(new THREE.Vector3(.013, .007, .019)).addScaledVector(direction, -100), direction, 0, 200);
    const u = firstVisibleHit(ray, [a], true, true), v = firstVisibleHit(ray, [b], true, true);
    expect(!!v).toBe(!!u); if (!u || !v) continue;
    expect(v.distance).toBeCloseTo(u.distance, 4);
    expect(((v.object as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()).toBe(((u.object as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex());
    const normal = (h: THREE.Intersection) => h.face!.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld));
    expect(normal(v).distanceTo(normal(u))).toBeLessThan(.0001);
  }
}

for (const [id, before, after] of [['queenstown', 39, 3], ['yishun', 33, 3], ['punggol', 12, 6], ['woodlands', 20, 12], ['sentosa', 9, 4]] as const)
  it(`${id} train retains geometry, flight gaps, timetable poses and sounds`, () => {
    const a = raw(() => getRegion(id).build()), b = getRegion(id).build();
    try {
      const roots = [a, b].map(w => w.scene.getObjectByName(`${id}-train`)!);
      expect(meshes(roots[0])).toHaveLength(before); expect(meshes(roots[1])).toHaveLength(after);
      expect(b.obstacles).toEqual(a.obstacles);
      expect(b.scene.userData.walkSurfaces).toEqual(a.scene.userData.walkSurfaces);
      expect(b.scene.userData.traversalObstacles).toEqual(a.scene.userData.traversalObstacles);
      const timetable = railTimetable(RAIL_ROUTES[id as RailDistrict]);
      for (const time of [0, ...timetable.legs.flatMap(l => [l.depart + .2, (l.depart + l.end) / 2, l.end - .2]), timetable.period + 17]) {
        a.animate(time); b.animate(time);
        expect(roots[1].position.toArray()).toEqual(roots[0].position.toArray());
        expect(b.cues?.(time - 3, time)).toEqual(a.cues?.(time - 3, time));
        parity(roots[0], roots[1], time === 0);
      }
    } finally { a.dispose(); b.dispose(); }
  });

for (const id of ['changi', 'pulau-ubin'] as const) it(`${id} bumboat retains bobbing, roll, geometry and disabled raycasting`, () => {
  const a = raw(() => getRegion(id).build()), b = getRegion(id).build();
  try {
    const roots = [a, b].map(w => w.scene.getObjectByName('Bumboat ferry')!);
    expect(meshes(roots[0])).toHaveLength(14); expect(meshes(roots[1])).toHaveLength(5); expect(b.obstacles).toEqual(a.obstacles);
    for (const time of [0, .37, 17, 641]) { a.animate(time); b.animate(time); parity(roots[0], roots[1], true); expect(roots[1].matrixWorld.elements).toEqual(roots[0].matrixWorld.elements); }
  } finally { a.dispose(); b.dispose(); }
});

it('keeps truck glazing, landing craft ramp poses and wakes, and disposes owned batch geometry', () => {
  for (const [build, before, after] of [[buildTruck, 21, 6], [buildLandingCraft, 29, 7]] as const) {
    const a = raw(build), b = build();
    try {
      expect(meshes(a)).toHaveLength(before); expect(meshes(b)).toHaveLength(after);
      for (const k of [0, .37, 1]) {
        for (const model of [a, b]) { model.position.set(13, 2, -4); model.rotation.y = k * 2;
          const ramp = model.getObjectByName('bow-ramp'); if (ramp) { ramp.rotation.x = Math.PI / 2 + (-Math.atan2(.41, 5) - Math.PI / 2) * k; ramp.scale.z = .28 + .72 * k; }
        }
        parity(a, b, true);
      }
      const geometries = new Set(meshes(b).map(m => m.geometry)), disposed = vi.fn(); geometries.forEach(g => g.addEventListener('dispose', disposed));
      disposeModel(b); expect(disposed).toHaveBeenCalledTimes(geometries.size);
    } finally { disposeModel(a); }
  }
});

it('uses the same live transport poses, damage tint, ramp and wake through arrival, unloading and wreck states', () => {
  for (const mode of ['land', 'sea'] as const) {
    const scenes = [new THREE.Scene(), new THREE.Scene()], camera = new THREE.PerspectiveCamera();
    const visuals = scenes.map(s => createCombatEventVisuals(s, p => new THREE.Vector3(p.x, 0, p.z), { reduced: () => true }));
    const event: CombatEventDescriptor = { id: 'ride', kind: `transport-${mode}`, seed: 4, start: 0, target: { x: 0, z: 0 }, heading: 0, intensity: 1, origin: { x: 0, z: 120 }, troops: 4 };
    const active: ArenaTransport = { event: event.id, mode, x: 3, y: 0, z: 8, yaw: .4, health: 900, maxHealth: 900, state: 'inbound', visible: true, driver: 'd', driverAlive: true, passengers: 4, ramp: 0 };
    const step = (i: number) => visuals[i].update(0, [event], 5, camera, [], [active]);
    try {
      raw(() => step(0)); step(1);
      const roots = scenes.map(s => s.getObjectByName('combat-events')!.children.find(o => o instanceof THREE.Group && o.visible)!);
      expect(roots.every(Boolean)).toBe(true);
      for (const state of ['inbound', 'ramping', 'unloading', 'leaving', 'stopped', 'wreck'] as const) {
        active.state = state; active.ramp = state === 'ramping' ? .37 : state === 'unloading' ? 1 : 0;
        active.health = state === 'wreck' ? 0 : state === 'stopped' ? 200 : 900;
        step(0); step(1); parity(roots[0], roots[1]);
        expect(roots[1].matrixWorld.elements).toEqual(roots[0].matrixWorld.elements);
      }
      visuals.forEach(v => v.reset()); expect(roots.every(r => !r.visible)).toBe(true);
    } finally { visuals.forEach(v => v.dispose()); }
  }
});

it('respects excluded siblings, explicit no-ray policy and shared geometry ownership', () => {
  const parent = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(geometry, material), b = a.clone(), hidden = a.clone(), child = a.clone(); hidden.visible = false;
  const pivot = new THREE.Group(); pivot.add(child); parent.add(a, b, hidden, pivot);
  const disposed = vi.fn(); geometry.addEventListener('dispose', disposed);
  const batches = batching.batchRigidMeshes(parent); expect(batches).toHaveLength(1); expect(disposed).not.toHaveBeenCalled();
  expect(pivot.children[0]).toBe(child); expect(hidden.parent).toBe(parent); disposeModel(parent);
  expect(disposed).toHaveBeenCalledTimes(1);
});
