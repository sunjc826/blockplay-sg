import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createAmbientDrift, DRIFT_COUNT, driftAmounts } from './ambient-drift';

const calm = { wind: 0, rain: 0, sun: 1, night: 0, reduced: false, detail: 'high' as const, mobile: false };

describe('ambient drift', () => {
  it('follows the weather: leaves with wind, motes in sun, nothing when reduced or on Low', () => {
    const still = driftAmounts(calm), squall = driftAmounts({ ...calm, wind: 7, rain: 1, sun: .2 });
    expect(still.motes).toBe(.45); expect(still.leaves).toBeCloseTo(.5);
    expect(squall.leaves).toBeGreaterThan(still.leaves * .9); expect(squall.motes).toBe(0); expect(squall.speed).toBeGreaterThan(still.speed * 5);
    expect(driftAmounts({ ...calm, night: 1 }).motes).toBe(0);
    for (const off of [{ ...calm, reduced: true }, { ...calm, detail: 'low' as const }]) expect(driftAmounts(off)).toEqual({ leaves: 0, motes: 0, speed: 0 });
  });
  it('anchors leaves to supplied planting bases, including raised planters, and disables unsourced leaves', () => {
    const scene = new THREE.Scene();
    const leafSources = [{ x: 10, y: 0, z: 20, height: 6 }, { x: -10, y: 7, z: 30, height: .65 }];
    const drift = createAmbientDrift(scene, { leafSources }), empty = createAmbientDrift(scene);
    try {
      const sources = drift.mesh.geometry.getAttribute('driftSource'), kinds = drift.mesh.geometry.getAttribute('driftKind');
      const seen = new Set<number>();
      for (let i = 0; i < sources.count; i++) {
        if (kinds.getX(i) === 1) { expect(sources.getW(i)).toBe(0); continue; }
        const source = leafSources.find(s => s.x === sources.getX(i) && s.y === sources.getY(i) && s.z === sources.getZ(i));
        expect(source).toBeDefined();
        expect(sources.getW(i)).toBeCloseTo(Math.min(3, source!.height));
        seen.add(sources.getY(i));
      }
      expect([...seen].sort()).toEqual([0, 7]);
      expect(Array.from(empty.mesh.geometry.getAttribute('driftSource').array).every(value => value === 0)).toBe(true);
    } finally { drift.dispose(); empty.dispose(); }
  });
  it('moves out-of-sight leaves to plants near the camera, and never onto open ground', () => {
    const scene = new THREE.Scene();
    const far = Array.from({ length: 40 }, (_, i) => ({ x: 400 + i * 30, y: 0, z: 0, height: 5 })), near = [{ x: 3, y: 0, z: 4, height: 2 }, { x: -6, y: 0, z: 2, height: 5 }];
    const drift = createAmbientDrift(scene, { leafSources: [...far, ...near] });
    try {
      const sources = drift.mesh.geometry.getAttribute('driftSource'), kinds = drift.mesh.geometry.getAttribute('driftKind');
      const leavesNear = () => { let n = 0; for (let i = 0; i < sources.count; i += 24) if (kinds.getX(i) === 0 && Math.abs(sources.getX(i)) < 10) n++; return n; };
      const total = DRIFT_COUNT.ultra * 2 / 3, before = leavesNear();
      expect(before).toBeLessThan(total * .2);
      // One pass moves every leaf that is between falls; the rest follow as their falls end.
      drift.update(10, calm, new THREE.Vector3(0, 1.7, 0));
      expect(leavesNear()).toBeGreaterThan(total * .3);
      for (let t = 11; t < 40; t++) drift.update(t, calm, new THREE.Vector3(0, 1.7, 0));
      expect(leavesNear()).toBe(total);
      for (let i = 0; i < sources.count; i += 24) if (kinds.getX(i) === 0) expect([2, 3]).toContain(sources.getW(i));
      // Out on the bay, with no plant in reach, nothing is moved.
      for (let t = 40; t < 70; t++) drift.update(t, calm, new THREE.Vector3(0, 1.7, -300));
      expect(leavesNear()).toBe(total);
    } finally { drift.dispose(); }
  });
  it('is one draw, parked out of sight for override passes, sized by detail and device', () => {
    const scene = new THREE.Scene(), drift = createAmbientDrift(scene);
    try {
      expect(scene.children).toEqual([drift.mesh]);
      const geometry = drift.mesh.geometry;
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.max.y).toBeLessThan(-1000);
      expect(drift.mesh.userData.fpsEffect).toBe(true); expect(drift.mesh.castShadow).toBe(false);
      drift.update(3, calm);
      expect(drift.mesh.visible).toBe(true); expect(geometry.drawRange.count).toBe(DRIFT_COUNT.high * 36);
      drift.update(3, { ...calm, mobile: true, detail: 'ultra' });
      expect(geometry.drawRange.count).toBe(DRIFT_COUNT.ultra / 2 * 36);
      drift.update(3, { ...calm, detail: 'low' });
      expect(drift.mesh.visible).toBe(false);
    } finally { drift.dispose(); }
    expect(scene.children).toHaveLength(0);
  });
});
