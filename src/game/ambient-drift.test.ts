import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createAmbientDrift, DRIFT_COUNT, driftAmounts } from './ambient-drift';

const calm = { wind: 0, rain: 0, sun: 1, night: 0, reduced: false, detail: 'high' as const, mobile: false };

describe('ambient drift', () => {
  it('follows the weather: leaves with wind, motes in sun, nothing when reduced or on Low', () => {
    const still = driftAmounts(calm), squall = driftAmounts({ ...calm, wind: 7, rain: 1, sun: .2 });
    expect(still.motes).toBe(1); expect(still.leaves).toBeGreaterThan(0);
    expect(squall.leaves).toBeGreaterThan(still.leaves * .9); expect(squall.motes).toBe(0); expect(squall.speed).toBeGreaterThan(still.speed * 5);
    expect(driftAmounts({ ...calm, night: 1 }).motes).toBe(0);
    for (const off of [{ ...calm, reduced: true }, { ...calm, detail: 'low' as const }]) expect(driftAmounts(off)).toEqual({ leaves: 0, motes: 0, speed: 0 });
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
