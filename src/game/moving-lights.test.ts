import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMovingLights, lightFalloff, MOVING_LIGHTS, pickLights, type LightSource } from './moving-lights';
import { createAmbientSky } from './ambient-sky-visuals';

const source = (x: number, intensity = 1, reach = 100): LightSource => ({ x, y: 50, z: 0, colour: new THREE.Color(1, .6, .3), intensity, reach });

describe('moving lights', () => {
  it('fades smoothly to nothing at the edge of its reach', () => {
    expect(lightFalloff(0, 100)).toBe(1);
    expect(lightFalloff(100, 100)).toBe(0); expect(lightFalloff(150, 100)).toBe(0);
    for (let d = 0; d < 100; d += 5) expect(lightFalloff(d + 5, 100)).toBeLessThan(lightFalloff(d, 100));
    expect(lightFalloff(99, 100)).toBeLessThan(.001);
  });

  it('keeps the lights that matter most from the camera, never more than the slots', () => {
    const camera = { x: 0, y: 0, z: 0 };
    const sources = Array.from({ length: 20 }, (_, i) => source(i * 100));
    const chosen = pickLights(sources, camera);
    expect(chosen).toHaveLength(MOVING_LIGHTS);
    expect(chosen.map(s => s.x)).toEqual(sources.slice(0, MOVING_LIGHTS).map(s => s.x));
    // Far but much brighter still wins over near and faint.
    expect(pickLights([source(50, .1), source(400, 20)], camera, 1)[0].x).toBe(400);
    expect(pickLights([source(0, 0), source(0, 1, 0)], camera)).toHaveLength(0);
  });

  it('fills the shader slots at night and empties them by day', () => {
    const lights = createMovingLights(), camera = { x: 0, y: 0, z: 0 };
    lights.set([source(10, 2, 80)], camera, 1);
    expect(lights.uniforms.movingCount.value).toBe(1);
    expect(lights.uniforms.movingLight.value[0].toArray()).toEqual([10, 50, 0, 80]);
    expect(lights.uniforms.movingColour.value[0].r).toBeCloseTo(2);
    lights.set([source(10, 2, 80)], camera, 0);
    expect(lights.uniforms.movingCount.value).toBe(0);
  });

  it('lights the city from a rocket salvo as it flies', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const sky = createAmbientSky(scene, { seed: 7, risk: 'low', reduced: () => false, audio: () => null, muted: () => true });
    const frame = { camera, listener: { x: 0, y: 1.7, z: 0 }, bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 }, night: 1, quiet: true };
    sky.update(1 / 30, frame);
    expect(sky.trigger('rockets')).not.toBeNull();
    let most = 0;
    for (let t = 0; t < 20; t += 1 / 30) {
      const { lights } = sky.update(1 / 30, frame);
      for (const l of lights) { expect(l.intensity).toBeGreaterThanOrEqual(0); expect(l.reach).toBeGreaterThan(0); }
      most = Math.max(most, lights.length);
    }
    expect(most).toBeGreaterThan(0);
    sky.dispose();
  });
});
