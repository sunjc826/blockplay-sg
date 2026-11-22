import { expect, it } from 'vitest';
import * as THREE from 'three';
import { VIEW_SHADE, createViewmodelSunShade, throwsSunShadow } from './viewmodel-sun-shade';
import { addShadowProxies } from './shadow-proxy';

const SUN = { x: 0, y: 1, z: 0 }, EYE = new THREE.Vector3(0, 1.6, 0);

function fixture() {
  const scene = new THREE.Scene();
  let refreshes = 0, queries = 0;
  const shade = createViewmodelSunShade({
    refresh() { refreshes++; scene.updateMatrixWorld(true); },
    query() { queries++; const found: THREE.Object3D[] = []; scene.traverse(o => { if ((o as THREE.Mesh).isMesh) found.push(o); }); return found; },
  });
  const roof = (y = 4, material: THREE.Material = new THREE.MeshStandardMaterial()) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, .3, 6), material); mesh.position.y = y; mesh.castShadow = true; scene.add(mesh); return mesh;
  };
  return { scene, shade, roof, counts: () => ({ refreshes, queries }) };
}

it('lights the gun fully in the open and not at all under a roof', () => {
  const open = fixture();
  expect(open.shade.update(.016, true, EYE, SUN)).toBe(1);
  const covered = fixture(); covered.roof();
  expect(covered.shade.update(.016, true, EYE, SUN)).toBe(0);
});

it('follows the sun, not what is overhead', () => {
  const f = fixture(); f.roof();
  const low = new THREE.Vector3(1, .2, 0).normalize();
  expect(f.shade.update(.016, true, EYE, low)).toBe(1);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(.3, 8, 8), new THREE.MeshStandardMaterial()); wall.position.x = 10; wall.castShadow = true; f.scene.add(wall);
  for (let i = 0; i < 120; i++) f.shade.update(.016, true, EYE, low);
  expect(f.shade.lit).toBeLessThan(.01);
});

it('eases across a shadow edge instead of snapping', () => {
  const f = fixture();
  f.shade.update(.016, true, EYE, SUN);
  f.roof();
  let lit = 1; const seen: number[] = [];
  for (let i = 0; i < 40; i++) { lit = f.shade.update(.016, true, EYE, SUN); seen.push(lit); }
  expect(seen.some(v => v > .1 && v < .9)).toBe(true);
  expect(seen.every((v, i) => i === 0 || v <= seen[i - 1])).toBe(true);
  expect(lit).toBeLessThan(.02);
});

it('ignores what the shadow pass does not draw', () => {
  const f = fixture();
  const glass = f.roof(4, new THREE.MeshStandardMaterial({ transparent: true, opacity: .3 })); glass.castShadow = false;
  const grass = f.roof(5); grass.castShadow = false; grass.userData.noShadowCast = true;
  const hidden = f.roof(6); hidden.visible = false;
  const group = new THREE.Group(); group.visible = false; f.scene.add(group);
  const inHidden = f.roof(7); group.add(inHidden);
  expect(f.shade.update(.016, true, EYE, SUN)).toBe(1);
  for (const mesh of [glass, grass, hidden, inHidden]) expect(throwsSunShadow(mesh)).toBe(false);
});

it('is shaded by a one-sided sheet seen from its back, as the shadow pass draws it', () => {
  const f = fixture();
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ side: THREE.FrontSide }));
  awning.rotation.x = -Math.PI / 2; awning.position.y = 3; awning.castShadow = true; f.scene.add(awning);
  expect(f.shade.update(.016, true, EYE, SUN)).toBe(0);
});

it('counts a vehicle whose parts cast through a merged stand-in', () => {
  const f = fixture();
  const vehicle = new THREE.Group(), roofPanel = new THREE.Mesh(new THREE.BoxGeometry(3, .1, 3), new THREE.MeshStandardMaterial());
  roofPanel.position.y = 2.4; vehicle.add(roofPanel); f.scene.add(vehicle);
  addShadowProxies(vehicle, new Set());
  expect(roofPanel.castShadow).toBe(false);
  expect(throwsSunShadow(roofPanel)).toBe(true);
  expect(f.shade.update(.016, true, EYE, SUN)).toBe(0);
});

it('leaves the gun in full light, and traces nothing, while sun shadows are off', () => {
  const f = fixture(); f.roof();
  expect(f.shade.update(.016, true, EYE, SUN)).toBe(0);
  const before = f.counts();
  expect(f.shade.update(.016, false, EYE, SUN)).toBe(1);
  expect(f.counts()).toEqual(before);
  // Coming back on lands on the answer at once.
  expect(f.shade.update(.016, true, EYE, SUN)).toBe(0);
});

it('traces a few times a second, not every frame', () => {
  const f = fixture();
  const frames = 120, dt = 1 / 60;
  for (let i = 0; i < frames; i++) f.shade.update(dt, true, EYE, SUN);
  const expected = frames * dt / VIEW_SHADE.interval;
  expect(f.counts().refreshes).toBeGreaterThan(expected * .7);
  expect(f.counts().refreshes).toBeLessThan(expected * 1.3 + 1);
});
