import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { coverMasses, measureCover, EYE, LATTICE, type CoverMass } from './cover-metrics';

const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };

/** The O(cells) distance field must agree with the obvious O(n*m) sweep. */
function bruteForce(b: typeof bounds, masses: readonly CoverMass[]) {
  const open: { x: number; z: number }[] = [], cover: { x: number; z: number }[] = [];
  for (let i = 0; ; i++) {
    const x = b.minX + i * LATTICE; if (x > b.maxX) break;
    for (let j = 0; ; j++) {
      const z = b.minZ + j * LATTICE; if (z > b.maxZ) break;
      (masses.some(m => x >= m.minX && x <= m.maxX && z >= m.minZ && z <= m.maxZ) ? cover : open).push({ x, z });
    }
  }
  if (!cover.length) return Infinity;
  const d = open.map(p => Math.min(...cover.map(c => Math.hypot(c.x - p.x, c.z - p.z)))).sort((a, b2) => a - b2);
  return d.length ? d[Math.floor(d.length * 0.5)] : 0;
}

describe('measureCover', () => {
  it('agrees with a brute-force sweep on random layouts', () => {
    let seed = 20260921;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let trial = 0; trial < 12; trial++) {
      const masses: CoverMass[] = [];
      for (let n = 0; n < 1 + Math.floor(random() * 6); n++) {
        const x = -34 + random() * 68, z = -34 + random() * 68;
        const w = 2 + random() * 10, d = 2 + random() * 10;
        masses.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      // Rasterising snaps a mass to the lattice, so the two agree to one cell.
      expect(Math.abs(measureCover(bounds, masses).median - bruteForce(bounds, masses)), JSON.stringify(masses))
        .toBeLessThanOrEqual(LATTICE);
    }
  });

  it('reports no cover as Infinity rather than a large number', () => {
    const empty = measureCover(bounds, []);
    expect(empty.median).toBe(Infinity);
    expect(empty.p90).toBe(Infinity);
    expect(empty.solid).toBe(0);
  });

  it('measures a single central mass by its distance, not its area', () => {
    const { median, solid } = measureCover(bounds, [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2 }]);
    expect(median).toBeGreaterThan(20);
    expect(median).toBeLessThan(40);
    expect(solid).toBeLessThan(0.05);
  });
});

describe('coverMasses', () => {
  const build = (w: number, h: number, d: number, y: number) => {
    const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(0, y, 0); scene.add(mesh); scene.updateMatrixWorld(true);
    return { scene, dispose: () => geometry.dispose() };
  };

  it('keeps a long thin wall and drops a lamp post of the same height', () => {
    const wall = build(6, 2.4, 0.4, 1.2);
    try { expect(coverMasses(wall.scene).stand).toHaveLength(1); } finally { wall.dispose(); }
    const post = build(0.5, 2.4, 0.5, 1.2);
    try { expect(coverMasses(post.scene).stand).toHaveLength(0); } finally { post.dispose(); }
  });

  it('separates crouch cover from standing cover at the engine eye heights', () => {
    const chestHigh = build(6, 1.3, 0.4, 0.65);
    try {
      const masses = coverMasses(chestHigh.scene);
      expect(masses.crouch, `reaches ${EYE.crouch}`).toHaveLength(1);
      expect(masses.stand, `short of ${EYE.stand}`).toHaveLength(0);
    } finally { chestHigh.dispose(); }
  });

  it('drops water and kerbs, which stop feet but not rounds', () => {
    // HarbourFront's basin: a 228x40m collider whose box tops out at y=0.14.
    const basin = build(228, 0.4, 40, -0.06);
    try { expect(coverMasses(basin.scene).crouch).toHaveLength(0); } finally { basin.dispose(); }
  });

  it('drops a canopy that starts above head height', () => {
    const awning = build(20, 0.6, 8, 4.2);
    try { expect(coverMasses(awning.scene).crouch).toHaveLength(0); } finally { awning.dispose(); }
  });
});
