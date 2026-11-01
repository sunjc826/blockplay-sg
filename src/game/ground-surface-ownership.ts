import * as THREE from 'three';
import { accelerateMeshRaycast } from './mesh-raycast';

export interface GroundCap {
  mesh: THREE.Mesh; instance?: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
  y: number; authoredTop: number;
}
type Rect = Pick<GroundCap, 'minX' | 'maxX' | 'minZ' | 'maxZ'>;
const epsilon = 1e-6;
const area = (r: Rect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);

/** Exact rectangular difference. Contacts along an edge do not cut either owner. */
export function subtractGroundRect(source: Rect, cut: Rect): Rect[] {
  const x0 = Math.max(source.minX, cut.minX), x1 = Math.min(source.maxX, cut.maxX);
  const z0 = Math.max(source.minZ, cut.minZ), z1 = Math.min(source.maxZ, cut.maxZ);
  if (x1 - x0 <= epsilon || z1 - z0 <= epsilon) return [source];
  return [
    { ...source, maxX: x0 }, { ...source, minX: x1 },
    { minX: x0, maxX: x1, minZ: source.minZ, maxZ: z0 },
    { minX: x0, maxX: x1, minZ: z1, maxZ: source.maxZ },
  ].filter(r => r.maxX - r.minX > epsilon && r.maxZ - r.minZ > epsilon);
}

/** Give low, rectangular ground caps one visible owner, keeping their existing
 * heights. Cuts are real triangles, so rendering, rain masks and shot rays agree.
 * Elevated instances sharing a ground material retain their original geometry.
 */
export function partitionGroundCaps(caps: readonly GroundCap[]) {
  const geometries: THREE.BufferGeometry[] = [], added: THREE.Mesh[] = [], disposers: (() => void)[] = [];
  const grouped = new Map<THREE.Mesh, { cap: GroundCap; pieces: Rect[] }[]>();
  let cuts = 0;
  // Height wins first. At a normalized tie retain authored layering, then give
  // small painted/detail patches precedence over broad slabs, then stable order.
  const ordered = [...caps].sort((a, b) => Math.round(b.y * 1e5) - Math.round(a.y * 1e5) || b.authoredTop - a.authoredTop || area(a) - area(b) || caps.indexOf(b) - caps.indexOf(a));
  for (let i = 0; i < ordered.length; i++) {
    const cap = ordered[i]; let pieces: Rect[] = [cap];
    for (let j = 0; j < i && pieces.length; j++) {
      const cut = ordered[j];
      if (cap.maxX <= cut.minX || cap.minX >= cut.maxX || cap.maxZ <= cut.minZ || cap.minZ >= cut.maxZ) continue;
      pieces = pieces.flatMap(piece => subtractGroundRect(piece, cut));
    }
    const group = grouped.get(cap.mesh) ?? []; group.push({ cap, pieces }); grouped.set(cap.mesh, group);
    if (pieces.length !== 1 || area(pieces[0]) < area(cap) - epsilon) cuts++;
  }
  for (const [source, entries] of grouped) {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
    const point = new THREE.Vector3(), normal = new THREE.Vector3(), matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
    const inverse = source.matrixWorld.clone().invert(), normalMatrix = new THREE.Matrix3();
    const geometry = source.geometry, index = geometry.index, position = geometry.getAttribute('position'), ns = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    const emit = (p: THREE.Vector3, n: THREE.Vector3, u: number, v: number) => { positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); uvs.push(u, v); };
    const removed = new Set(entries.map(e => e.cap.instance));
    // Preserve the original sides/bottoms, including their UVs and normal direction.
    for (const { cap } of entries) {
      if (source instanceof THREE.InstancedMesh) { source.getMatrixAt(cap.instance!, instance); matrix.copy(instance); }
      else matrix.identity();
      normalMatrix.getNormalMatrix(matrix);
      for (let f = 0; f < (index?.count ?? position.count) / 3; f++) {
        const first = index ? index.getX(f * 3) : f * 3;
        if (ns.getY(first) > .99) continue;
        for (let c = 0; c < 3; c++) {
          const vertex = index ? index.getX(f * 3 + c) : f * 3 + c;
          point.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
          normal.fromBufferAttribute(ns, vertex).applyNormalMatrix(normalMatrix);
          emit(point, normal, uv.getX(vertex), uv.getY(vertex));
        }
      }
    }
    // Caps are authored in world space and transformed back to the source mesh
    // frame; the mesh keeps its material, flags, parent and semantic metadata.
    const up = new THREE.Vector3(0, 1, 0).transformDirection(inverse);
    for (const { cap, pieces } of entries) for (const r of pieces) {
      for (const [x, z] of [[r.minX,r.minZ],[r.minX,r.maxZ],[r.maxX,r.minZ],[r.maxX,r.minZ],[r.minX,r.maxZ],[r.maxX,r.maxZ]]) {
        point.set(x, cap.y, z).applyMatrix4(inverse);
        emit(point, up, (x - cap.minX) / (cap.maxX - cap.minX), 1 - (z - cap.minZ) / (cap.maxZ - cap.minZ));
      }
    }
    const replacement = new THREE.BufferGeometry();
    replacement.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    replacement.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    replacement.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    replacement.computeBoundingBox(); replacement.computeBoundingSphere(); geometries.push(replacement);
    const mesh = new THREE.Mesh(replacement, source.material);
    mesh.name = `${source.name || 'Ground'} / owned surfaces`; mesh.userData = { ...source.userData, ownedGround: true };
    mesh.position.copy(source.position); mesh.quaternion.copy(source.quaternion); mesh.scale.copy(source.scale);
    mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
    source.parent!.add(mesh); added.push(mesh);
    disposers.push(accelerateMeshRaycast(mesh));
    if (source instanceof THREE.InstancedMesh) {
      let retained = 0;
      for (let i = 0; i < source.count; i++) if (!removed.has(i)) { source.getMatrixAt(i, instance); source.setMatrixAt(retained++, instance); }
      source.count = retained; source.instanceMatrix.needsUpdate = true;
      source.computeBoundingBox(); source.computeBoundingSphere();
      if (!retained) source.removeFromParent();
    } else source.removeFromParent();
  }
  return { cuts, caps: caps.length, dispose() { disposers.forEach(dispose => dispose()); added.forEach(mesh => mesh.removeFromParent()); geometries.forEach(g => g.dispose()); } };
}
