import * as THREE from 'three';

/** Horizontal coordinates for each actual wall plane, rather than a world-space grid.
 * Flat extruded sides get their own extents; cylinders unwrap around their perimeter.
 * The tangent lets the shader retain metre-sized windows under nonuniform scaling.
 */
export function nightFacadeAttributes(geometry: THREE.BufferGeometry, up: THREE.Vector3) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const edge = new Float32Array(position.count * 2), tangents = new Float32Array(position.count * 3);
  const point = new THREE.Vector3(), n = new THREE.Vector3(), tangent = new THREE.Vector3();
  const planes = new Map<string, { vertices: number[]; low: number; high: number }>();
  const round = geometry.type === 'CylinderGeometry', uv = geometry.getAttribute('uv');
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i); n.fromBufferAttribute(normal, i);
    tangent.crossVectors(n, up);
    if (tangent.lengthSq() < 1e-8) continue; // Roof and floor.
    tangent.normalize(); tangent.toArray(tangents, i * 3);
    if (round && uv) {
      // Use a constant circumference metric across the surface. A varying
      // tangent scale on an elliptical instance would change the column count
      // halfway round a window. RMS radial scale keeps the unwrapped grid stable.
      tangent.set(Math.SQRT1_2, 0, Math.SQRT1_2).toArray(tangents, i * 3);
      // CylinderGeometry's seam is already duplicated, so interpolation never crosses it.
      edge.set([uv.getX(i) * Math.PI * size.x, Math.PI * size.x], i * 2);
      continue;
    }
    const key = [n.x, n.y, n.z, n.dot(point)].map(v => Math.round(v * 1e4)).join(',');
    const u = tangent.dot(point), plane = planes.get(key) ?? { vertices: [], low: Infinity, high: -Infinity };
    plane.vertices.push(i); plane.low = Math.min(plane.low, u); plane.high = Math.max(plane.high, u);
    planes.set(key, plane); edge[i * 2] = u;
  }
  for (const plane of planes.values()) for (const i of plane.vertices) {
    edge[i * 2] -= plane.low; edge[i * 2 + 1] = plane.high - plane.low;
  }
  return { nightEdge: new THREE.BufferAttribute(edge, 2), nightTangent: new THREE.BufferAttribute(tangents, 3) };
}
