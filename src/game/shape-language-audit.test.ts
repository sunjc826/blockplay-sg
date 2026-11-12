import { expect, it } from 'vitest';
import * as THREE from 'three';
import { auditShapeLanguage, shapeBoxes } from './shape-language-audit';

const scene = () => {
  const s = new THREE.Scene(), geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshStandardMaterial();
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, rotate = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(w, h, d); m.rotation.y = rotate; s.add(m); return m;
  };
  return { s, add };
};

it('reports module alignment, thin detail and hairline joints between coplanar tops', () => {
  const { s, add } = scene();
  add(0, 0.05, 0, 0.99, 0.1, 1);      // two pavers with a 1 cm joint
  add(1, 0.05, 0, 0.99, 0.1, 1);
  add(5, 1, 5, 0.035, 0.035, 10);     // a rail wire
  add(10, 1.5, 10, 2, 3, 2);          // an on-module block
  add(20, 1, 20, 1, 1, 1, 0.3);       // rotated, so freeform
  const result = auditShapeLanguage(s);
  expect(result.genericBoxes).toBe(4);
  expect(result.rotatedBoxes).toBe(1);
  expect(result.gaps['0.1'].gaps).toBe(1);
  expect(result.thin['0.1'].plan).toBe(1);
  expect(result.modules['0.5'].boxes).toBe(0.25);
});

it('treats boxes inside a declared freeform zone as landmark geometry', () => {
  const { s, add } = scene();
  add(0, 1, 0, 0.03, 2, 0.03);
  const survey = shapeBoxes(s, [{ name: 'landmark', minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]);
  expect(survey.boxes[0].freeform).toBe(true);
  expect(auditShapeLanguage(s, [{ name: 'landmark', minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]).thin['0.1'].plan).toBe(0);
});
