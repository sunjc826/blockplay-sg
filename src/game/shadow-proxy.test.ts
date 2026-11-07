import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addShadowProxies, SHADOW_PROXY } from './shadow-proxy';
import { buildVehicleModel, VEHICLE_MOVING_PARTS } from './vehicle-models';

const lit = () => new THREE.MeshStandardMaterial();
function model() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), lit()); body.position.set(0, 1, 0); root.add(body);
  const trim = new THREE.Group(); trim.position.set(0, 2, 0); root.add(trim);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2, 8), lit()); rod.rotation.z = Math.PI / 2; trim.add(rod);
  const wheel = new THREE.Group(); wheel.name = 'wheel'; wheel.position.set(1, .5, 1.5); root.add(wheel);
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .3, 16), lit()); wheel.add(tyre);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ transparent: true, opacity: .1 })); root.add(glass);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.2, .5), new THREE.MeshBasicMaterial()); root.add(flash);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(.01, .1, .01), lit()); needle.name = 'needle'; root.add(needle);
  return { root, body, rod, wheel, tyre, glass, flash, needle };
}
afterEach(() => vi.unstubAllGlobals());
const proxiesOf = (node: THREE.Object3D) => node.children.filter(c => c.name === SHADOW_PROXY) as THREE.Mesh[];

describe('shadow proxies', () => {
  it('merges each rigid piece into one shadow-only caster that keeps the outline', () => {
    const m = model(); m.root.updateMatrixWorld(true);
    const before = new THREE.Box3().setFromObject(m.body).union(new THREE.Box3().setFromObject(m.rod));
    addShadowProxies(m.root, new Set(['wheel', 'needle']));
    const [body] = proxiesOf(m.root), [wheel] = proxiesOf(m.wheel);
    expect(proxiesOf(m.root)).toHaveLength(1); expect(proxiesOf(m.wheel)).toHaveLength(1);
    // Body and rod in one, transformed into the root's space.
    m.root.updateMatrixWorld(true);
    const after = new THREE.Box3().setFromBufferAttribute(body.geometry.getAttribute('position') as THREE.BufferAttribute);
    for (const axis of ['x', 'y', 'z'] as const) { expect(after.min[axis]).toBeCloseTo(before.min[axis], 5); expect(after.max[axis]).toBeCloseTo(before.max[axis], 5); }
    expect(body.geometry.getAttribute('position').count).toBe(m.body.geometry.getAttribute('position').count + m.rod.geometry.getAttribute('position').count);
    expect(wheel.geometry.getAttribute('position').count).toBe(m.tyre.geometry.getAttribute('position').count);
    // Originals stop casting; glass, effects and moving meshes are left as they were.
    for (const part of [m.body, m.rod, m.tyre]) { expect(part.castShadow).toBe(false); expect(part.userData.noShadowCast).toBe(true); }
    for (const part of [m.glass, m.flash, m.needle]) expect(part.userData.noShadowCast).toBeUndefined();
    expect(proxiesOf(m.needle)).toHaveLength(0);
  });

  it('draws nothing outside the shadow pass and is invisible to raycasts', () => {
    const m = model(); addShadowProxies(m.root, new Set(['wheel']));
    const [proxy] = proxiesOf(m.root);
    expect(proxy.castShadow).toBe(true);
    expect(proxy.geometry.drawRange.count).toBe(0);
    proxy.onBeforeShadow(undefined as never, undefined as never, undefined as never, undefined as never, proxy.geometry, proxy.material as THREE.Material, null as never);
    expect(proxy.geometry.drawRange.count).toBe(Infinity);
    proxy.onAfterShadow(undefined as never, undefined as never, undefined as never, undefined as never, proxy.geometry, proxy.material as THREE.Material, null as never);
    expect(proxy.geometry.drawRange.count).toBe(0);
    m.root.updateMatrixWorld(true);
    const hits = new THREE.Raycaster(new THREE.Vector3(0, 1, -10), new THREE.Vector3(0, 0, 1)).intersectObject(m.root, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(hit => hit.object.name === SHADOW_PROXY)).toBe(false);
  });

  it('casts the same face of each part as three would', () => {
    const m = model();
    const open = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .4, 8, 1, true), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })); m.root.add(open);
    addShadowProxies(m.root, new Set());
    const sides = proxiesOf(m.root).map(p => (p.material as THREE.Material).shadowSide).sort();
    expect(sides).toEqual([THREE.BackSide, THREE.DoubleSide].sort());
  });

  it('gives a vehicle one caster per moving piece instead of one per part', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {}, fillStyle: '' }) }) });
    for (const kind of ['car', 'helicopter'] as const) {
      const root = buildVehicleModel(kind, 'paint-issued', { batchParts: false });
      let casters = 0, proxies = 0, parts = 0;
      root.traverse(o => {
        if (!(o as THREE.Mesh).isMesh) return;
        if (o.name === SHADOW_PROXY) proxies++; else if (o.userData.noShadowCast) parts++; else if (o.castShadow !== false) casters++;
      });
      expect(parts).toBeGreaterThan(80);
      let pieces = 1; root.traverse(o => { if (o !== root && VEHICLE_MOVING_PARTS.has(o.name) && !(o as THREE.Mesh).isMesh) pieces++; });
      expect(proxies).toBeLessThanOrEqual(pieces * 2);
    }
  });
});
