import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createWetGroundMask } from './rain-reflections';

it('reflects only uniformly exposed pavement, excluding roofs, gaps and steps', () => {
  const surface = vi.fn((x: number, z: number) => x < 0 ? null : z > 20 ? 1 : 0);
  const mask = createWetGroundMask(surface, (x, z) => x > 30 ? 6 : z > 20 ? 1 : 0);
  const eye = new THREE.Vector3(0, 1.7, 0);
  const valid = (x: number, z: number) => {
    const ix = Math.floor((x-mask.bounds.x)/2), iz = Math.floor((z-mask.bounds.y)/2);
    return mask.texture.image.data[(iz*96+ix)*4+3];
  };
  try {
    expect(mask.update(eye)).toBe(true);
    expect(valid(11, 11)).toBe(1);
    expect(valid(-11, 11)).toBe(0); // soil/water/unclassified
    expect(valid(41, 11)).toBe(0); // roof above paving
    expect(valid(11, 21)).toBe(0); // a cell straddling a step
    expect(valid(11, 25)).toBe(1);
    const calls = surface.mock.calls.length;
    eye.x = 5; expect(mask.update(eye)).toBe(false); expect(surface.mock.calls.length).toBe(calls);
    eye.x = 12; expect(mask.update(eye)).toBe(true);
    expect(surface.mock.calls.length-calls).toBeLessThan(calls/4); // only new columns
  } finally { mask.dispose(); }
});
