import * as THREE from 'three';
import type { FreeformZone } from './block-module';
export type { FreeformZone };

/**
 * Offline survey of a district's box geometry against the block module
 * (docs/SHAPE-LANGUAGE.md). It reads the actual built scene, expands
 * instances, and measures how much axis-aligned box geometry sits on candidate
 * modules, how much is modelled thinner than candidate minimums, and how many
 * hairline gaps separate coplanar neighbouring tops. It is a measurement, not a
 * pass/fail certificate: landmarks are freeform by design and are reported
 * separately when a district declares freeform zones.
 */

export interface ShapeBox {
  min: [number, number, number]; max: [number, number, number];
  freeform: boolean; material: string;
  /** A ground-cap rectangle (top surface only) from withGroundCover. */
  cap?: boolean;
}

export const AUDIT_MODULES = [0.05, 0.1, 0.125, 0.25, 0.5, 1] as const;
export const AUDIT_MINIMUMS = [0.05, 0.1, 0.125, 0.25] as const;
/** Values within a millimetre of a multiple count as on-module. */
export const AUDIT_TOLERANCE = 0.001;

const onModule = (value: number, module: number, tolerance = AUDIT_TOLERANCE) => {
  const r = Math.abs(value / module - Math.round(value / module)) * module;
  return r <= tolerance;
};

/** Expand every visible static box (BoxGeometry, including partitioned
 * variants that keep their type) into world-space axis-aligned extents.
 * Rotated boxes are skipped and counted as freeform. Animated groups (cars,
 * walkers, the Flyer) and hidden objects are excluded. */
export function shapeBoxes(scene: THREE.Object3D, zones: readonly FreeformZone[] = []) {
  const boxes: ShapeBox[] = [];
  let rotated = 0, otherMeshes = 0, otherTriangles = 0, drawables = 0, triangles = 0;
  const local = new THREE.Matrix4(), matrix = new THREE.Matrix4(), corner = new THREE.Vector3();
  const lo = new THREE.Vector3(), hi = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    const tris = ((geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3);
    drawables++; triangles += tris * count;
    if (object.userData.fpsEffect) return;
    if (object.userData.ownedGround) {
      // Ground caps merged by withGroundCover: each owned rectangle is two
      // up-facing triangles. Keep them as zero-height tops so paving joints
      // and slab edges remain visible to the survey.
      const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
      const material = `#${(object.material as THREE.MeshStandardMaterial).color?.getHexString?.() ?? 'ground'}`;
      for (let v = 0; v + 5 < position.count; v += 3) {
        if (normal.getY(v) < .99) continue;
        lo.set(Infinity, Infinity, Infinity); hi.set(-Infinity, -Infinity, -Infinity);
        for (let k = 0; k < 6; k++) { corner.fromBufferAttribute(position, v + k).applyMatrix4(object.matrixWorld); lo.min(corner); hi.max(corner); }
        v += 3;
        const cx = (lo.x + hi.x) / 2, cz = (lo.z + hi.z) / 2;
        const freeform = zones.some(zone => cx >= zone.minX && cx <= zone.maxX && cz >= zone.minZ && cz <= zone.maxZ);
        boxes.push({ min: [lo.x, lo.y, lo.z], max: [hi.x, hi.y, hi.z], freeform, material, cap: true });
      }
      return;
    }
    if (geometry.type !== 'BoxGeometry') { otherMeshes += count; otherTriangles += tris * count; return; }
    const p = (geometry as THREE.BoxGeometry).parameters;
    const material = Array.isArray(object.material) ? 'multi' : `#${((object.material as THREE.MeshStandardMaterial).color?.getHexString?.() ?? object.material.type)}`;
    for (let i = 0; i < count; i++) {
      if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(i, local); matrix.multiplyMatrices(object.matrixWorld, local); }
      else matrix.copy(object.matrixWorld);
      const e = matrix.elements;
      // Axis aligned when every basis column points along a single axis.
      let aligned = true;
      for (let c = 0; c < 3 && aligned; c++) {
        const x = Math.abs(e[c * 4]), y = Math.abs(e[c * 4 + 1]), z = Math.abs(e[c * 4 + 2]);
        const length = Math.hypot(x, y, z), top = Math.max(x, y, z);
        if (length < 1e-9 || top / length < 0.99999) aligned = false;
      }
      if (!aligned) { rotated++; continue; }
      lo.set(Infinity, Infinity, Infinity); hi.set(-Infinity, -Infinity, -Infinity);
      for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
        corner.set(sx * p.width, sy * p.height, sz * p.depth).applyMatrix4(matrix); lo.min(corner); hi.max(corner);
      }
      const cx = (lo.x + hi.x) / 2, cz = (lo.z + hi.z) / 2;
      const freeform = zones.some(zone => cx >= zone.minX && cx <= zone.maxX && cz >= zone.minZ && cz <= zone.maxZ && (zone.minY === undefined || lo.y >= zone.minY));
      boxes.push({ min: [lo.x, lo.y, lo.z], max: [hi.x, hi.y, hi.z], freeform, material });
    }
  });
  return { boxes, rotated, otherMeshes, otherTriangles, drawables, triangles };
}

/** Narrow gaps between neighbouring box tops at (nearly) the same height:
 * two tops within `step` of each other, overlapping along one horizontal axis
 * and separated by a positive gap under `minimum` along the other. Each
 * pair is counted once; this is what draws dotted-line aliasing and AO
 * shimmer on paving. */
export function narrowTopGaps(boxes: readonly ShapeBox[], minimum: number, step = 0.03) {
  const cell = 2, bins = new Map<string, number[]>();
  const generic = boxes.filter(b => !b.freeform && b.max[1] > -0.05 && b.max[0] - b.min[0] >= 0.02 && b.max[2] - b.min[2] >= 0.02);
  generic.forEach((b, index) => {
    for (let u = Math.floor((b.min[0] - minimum) / cell); u <= Math.floor((b.max[0] + minimum) / cell); u++)
      for (let v = Math.floor((b.min[2] - minimum) / cell); v <= Math.floor((b.max[2] + minimum) / cell); v++) {
        const key = `${u}/${v}`; const bin = bins.get(key) ?? []; bin.push(index); bins.set(key, bin);
      }
  });
  let gaps = 0; const seen = new Set<number>(); const samples: number[][] = [];
  generic.forEach((a, ia) => {
    seen.clear();
    for (let u = Math.floor((a.min[0] - minimum) / cell); u <= Math.floor((a.max[0] + minimum) / cell); u++)
      for (let v = Math.floor((a.min[2] - minimum) / cell); v <= Math.floor((a.max[2] + minimum) / cell); v++)
        for (const ib of bins.get(`${u}/${v}`) ?? []) {
          if (ib <= ia || seen.has(ib)) continue; seen.add(ib);
          const b = generic[ib];
          if (Math.abs(a.max[1] - b.max[1]) > step) continue;
          const overlapX = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
          const overlapZ = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
          // Gap along one axis while overlapping (by more than the gap) along the other.
          const gapX = -overlapX, gapZ = -overlapZ;
          const below = minimum - 1e-3, narrow = (gapX > 1e-4 && gapX < below && overlapZ > minimum) || (gapZ > 1e-4 && gapZ < below && overlapX > minimum);
          if (narrow) { gaps++; if (samples.length < 6) samples.push([+(a.min[0] + a.max[0]) / 2, a.max[1], (a.min[2] + a.max[2]) / 2].map(n => +n.toFixed(2))); }
        }
  });
  return { gaps, samples };
}

const round = (n: number, d = 4) => +n.toFixed(d);

/** Full per-district survey used by `pnpm audit:shape-language`. */
export function auditShapeLanguage(scene: THREE.Object3D, zones: readonly FreeformZone[] = [], gapMinimums: readonly number[] = [0.05, 0.1, 0.25]) {
  const survey = shapeBoxes(scene, zones);
  const generic = survey.boxes.filter(b => !b.freeform && !b.cap);
  const caps = survey.boxes.filter(b => !b.freeform && b.cap);
  const capEdges = caps.flatMap(b => [b.min[0], b.max[0], b.min[2], b.max[2]]);
  const ground = {
    caps: caps.length,
    edges: Object.fromEntries(AUDIT_MODULES.map(m => [m, round(capEdges.filter(v => onModule(v, m)).length / Math.max(1, capEdges.length))])),
    slivers: Object.fromEntries(AUDIT_MINIMUMS.map(t => [t, caps.filter(b => Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]) < t - AUDIT_TOLERANCE).length])),
  };
  const dims = generic.flatMap(b => [0, 1, 2].map(k => b.max[k] - b.min[k]));
  const edges = generic.flatMap(b => [b.min[0], b.max[0], b.min[2], b.max[2], b.min[1], b.max[1]]);
  const planEdges = generic.flatMap(b => [b.min[0], b.max[0], b.min[2], b.max[2]]);
  const modules = Object.fromEntries(AUDIT_MODULES.map(m => [m, {
    dims: round(dims.filter(d => onModule(d, m)).length / Math.max(1, dims.length)),
    edges: round(edges.filter(d => onModule(d, m)).length / Math.max(1, edges.length)),
    planEdges: round(planEdges.filter(d => onModule(d, m)).length / Math.max(1, planEdges.length)),
    /** Whole boxes whose three dimensions and plan edges all sit on the module. */
    boxes: round(generic.filter(b => [0, 1, 2].every(k => onModule(b.max[k] - b.min[k], m)) && [b.min[0], b.max[0], b.min[2], b.max[2]].every(v => onModule(v, m))).length / Math.max(1, generic.length)),
  }]));
  const thin = Object.fromEntries(AUDIT_MINIMUMS.map(t => {
    // Thin in plan: posts, rails, mullions, fins, cables and painted lines.
    const plan = generic.filter(b => Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]) < t - AUDIT_TOLERANCE), inPlan = new Set(plan);
    // Thin and raised: shelves, bands and caps hanging above the ground plane.
    const raised = generic.filter(b => b.max[1] - b.min[1] < t - AUDIT_TOLERANCE && b.min[1] > 0.3 && !inPlan.has(b));
    // Thin ground overlays (paint, pavers) are counted, not treated as defects.
    const overlay = generic.filter(b => b.max[1] - b.min[1] < t - AUDIT_TOLERANCE && b.min[1] <= 0.3 && !inPlan.has(b));
    const area = (list: ShapeBox[]) => round(list.reduce((sum, b) => {
      const d = [0, 1, 2].map(k => b.max[k] - b.min[k]).sort((x, y) => y - x); return sum + d[0] * d[1];
    }, 0), 1);
    return [t, { plan: plan.length, planArea: area(plan), raised: raised.length, raisedArea: area(raised), overlay: overlay.length }];
  }));
  const gaps = Object.fromEntries(gapMinimums.map(t => [t, narrowTopGaps(survey.boxes, t)]));
  // How far the generic geometry sits from each grid: mean snap distance.
  const snap = Object.fromEntries(AUDIT_MODULES.map(m => [m, round(planEdges.reduce((s, v) => s + Math.abs(v - Math.round(v / m) * m), 0) / Math.max(1, planEdges.length), 4)]));
  return {
    boxes: survey.boxes.length, genericBoxes: generic.length, freeformBoxes: survey.boxes.filter(b => b.freeform).length,
    rotatedBoxes: survey.rotated, otherMeshes: survey.otherMeshes, drawables: survey.drawables, triangles: survey.triangles,
    modules, meanSnap: snap, thin, gaps, ground,
  };
}
