import * as THREE from 'three';

/**
 * Faceted building blocks for the character rig's head and headwear. Every
 * shape comes back indexed, with position, normal and uv, so it merges with
 * three's own primitives; normals are per face, so the planes of a jaw or a
 * helmet catch the light separately instead of shading as one ball.
 */

/** One horizontal slice of a lofted form: half width, and how far it reaches forward (-z) and back (+z) of the axis. A negative `front` starts the slice behind the axis. */
export interface LoftRing { y: number; halfWidth: number; front: number; back: number }

/** Gives every triangle its own vertices and a face normal. */
export function faceted(geometry: THREE.BufferGeometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.computeVertexNormals();
  const count = flat.getAttribute('position').count;
  if (!flat.getAttribute('uv')) flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  flat.setIndex(Array.from({ length: count }, (_, i) => i));
  return flat;
}

function fromTriangles(points: readonly THREE.Vector3[], triangles: readonly number[]) {
  const positions = new Float32Array(triangles.length * 3);
  triangles.forEach((index, i) => points[index].toArray(positions, i * 3));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return faceted(geometry);
}

/**
 * A closed skin over stacked rings, bottom to top. Each ring is a squared-off
 * oval with `sides` corners, laid out so one flat edge faces straight ahead
 * and one straight back: a face has a front plane, two cheek planes and sides.
 * `square` near 0 is a box, 1 an ellipse.
 */
export function loft(rings: readonly LoftRing[], sides = 10, square = .72) {
  const points: THREE.Vector3[] = [], triangles: number[] = [];
  const bend = (value: number) => Math.sign(value) * Math.abs(value) ** square;
  // Scaled so the corners nearest each axis land exactly on the ring's stated extents.
  const angles = Array.from({ length: sides }, (_, k) => -Math.PI / 2 + (k + .5) * Math.PI * 2 / sides);
  const widest = Math.max(...angles.map(angle => Math.abs(bend(Math.cos(angle))))), deepest = Math.max(...angles.map(angle => Math.abs(bend(Math.sin(angle)))));
  for (const ring of rings) for (let k = 0; k < sides; k++) {
    // Counter-clockwise seen from above, starting just right of straight ahead.
    const angle = angles[k], depth = bend(Math.sin(angle)) / deepest;
    // A slice that starts behind the axis is centred on its own middle, so it stays convex.
    const centre = ring.front < 0 ? (ring.back - ring.front) / 2 : 0;
    points.push(new THREE.Vector3(ring.halfWidth * bend(Math.cos(angle)) / widest, ring.y, centre + (depth < 0 ? centre + ring.front : ring.back - centre) * depth));
  }
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < sides; k++) {
    const a = r * sides + k, b = r * sides + (k + 1) % sides, c = a + sides, d = b + sides;
    triangles.push(a, c, b, b, c, d);
  }
  const top = (rings.length - 1) * sides;
  for (let k = 1; k + 1 < sides; k++) { triangles.push(0, k, k + 1); triangles.push(top, top + k + 1, top + k); }
  return fromTriangles(points, triangles);
}

/**
 * A block whose top and bottom differ in size. `x`/`z` are full extents; the
 * block is centred on the axis unless `flush` is 'back', which puts both back
 * edges on z = 0 so the piece sits against a surface and leans out forward.
 */
export function taper(top: { x: number; z: number }, bottom: { x: number; z: number }, height: number, flush: 'centre' | 'back' = 'centre') {
  const corner = (size: { x: number; z: number }, y: number) => {
    const near = flush === 'back' ? -size.z : -size.z / 2, far = flush === 'back' ? 0 : size.z / 2;
    return [new THREE.Vector3(-size.x / 2, y, near), new THREE.Vector3(size.x / 2, y, near), new THREE.Vector3(size.x / 2, y, far), new THREE.Vector3(-size.x / 2, y, far)];
  };
  const points = [...corner(bottom, -height / 2), ...corner(top, height / 2)], triangles: number[] = [];
  for (let k = 0; k < 4; k++) { const a = k, b = (k + 1) % 4, c = a + 4, d = b + 4; triangles.push(a, c, b, b, c, d); }
  triangles.push(0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6);
  return fromTriangles(points, triangles);
}

/** Triangles in a geometry, indexed or not. */
export const triangleCount = (geometry: THREE.BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
