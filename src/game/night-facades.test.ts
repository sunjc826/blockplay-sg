import * as THREE from 'three';
import { expect, it } from 'vitest';
import { nightFacadeAttributes } from './night-facades';

it('fits each box side to its own edges, including translated geometry', () => {
  const geometry = new THREE.BoxGeometry(11.2, 17.4, 8.7).translate(12, 8, -31);
  const { nightEdge, nightTangent } = nightFacadeAttributes(geometry, new THREE.Vector3(0, 1, 0));
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) {
    if (Math.abs(normals.getY(i)) > .5) { expect(nightEdge.getY(i)).toBe(0); continue; }
    const width = Math.abs(normals.getX(i)) > .5 ? 8.7 : 11.2;
    expect(nightEdge.getY(i)).toBeCloseTo(width);
    expect(Math.min(Math.abs(nightEdge.getX(i)), Math.abs(nightEdge.getX(i) - width))).toBeLessThan(1e-4);
    expect(new THREE.Vector3().fromBufferAttribute(nightTangent, i).length()).toBeCloseTo(1);
  }
});

it('uses individual extruded side lengths instead of the footprint bounding box', () => {
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(8, 0); shape.lineTo(0, 6); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 20, bevelEnabled: false });
  const { nightEdge } = nightFacadeAttributes(geometry, new THREE.Vector3(0, 0, 1));
  const normals = geometry.getAttribute('normal'), widths = new Set<number>();
  for (let i = 0; i < normals.count; i++) if (Math.abs(normals.getZ(i)) < .01) {
    widths.add(Math.round(nightEdge.getY(i)));
    expect(nightEdge.getX(i)).toBeGreaterThanOrEqual(-1e-4);
    expect(nightEdge.getX(i)).toBeLessThanOrEqual(nightEdge.getY(i) + 1e-4);
  }
  expect([...widths].sort((a, b) => a - b)).toEqual([6, 8, 10]);
});

it('unwraps a cylindrical facade continuously with a separate closing seam', () => {
  const geometry = new THREE.CylinderGeometry(5, 5, 30, 16);
  const { nightEdge } = nightFacadeAttributes(geometry, new THREE.Vector3(0, 1, 0));
  expect(nightEdge.getX(0)).toBeCloseTo(0);
  expect(nightEdge.getX(16)).toBeCloseTo(10 * Math.PI);
  for (let i = 0; i <= 16; i++) expect(nightEdge.getY(i)).toBeCloseTo(10 * Math.PI);
});
