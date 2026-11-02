import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCombatEventVisuals } from './combat-event-visuals';

function setup(reduced = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const visuals = createCombatEventVisuals(scene, origin => new THREE.Vector3(origin.x, 0, origin.z), { reduced: () => reduced });
  const step = (seconds: number) => { for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) visuals.update(1 / 60, [], elapsed, camera); };
  const mesh = (name: string) => scene.getObjectByName(name) as THREE.InstancedMesh;
  return { scene, visuals, step, mesh };
}

describe('explosion particles without arena events', () => {
  it.each([false, true])('draws every blast layer and lets it expire (reduced=%s)', reduced => {
    const { visuals, step, mesh } = setup(reduced);
    visuals.blast(new THREE.Vector3(0, .15, 0)); step(.05);
    for (const layer of ['fire', 'smoke', 'debris', 'sparks', 'craters']) expect(mesh(`combat-${layer}`).count, layer).toBeGreaterThan(0);
    expect(mesh('combat-smoke').geometry.getAttribute('effectOpacity').getX(0)).toBeGreaterThan(0);
    step(1);
    expect(visuals.counts.fire).toBe(0); expect(visuals.counts.sparks).toBe(0);
    expect(visuals.counts.smoke).toBeGreaterThan(0);
    step(5);
    expect(visuals.counts).toMatchObject({ fire: 0, smoke: 0, debris: 0, sparks: 0, craters: 1 });
    step(60); expect(visuals.counts.craters).toBe(0);
    visuals.dispose();
  });
  it('keeps airburst debris falling and places no floating scorch or ground dust', () => {
    const { visuals, step, mesh } = setup();
    visuals.blast(new THREE.Vector3(0, 12, 0));
    expect(visuals.counts.craters).toBe(0); expect(visuals.counts.smoke).toBe(14);
    step(1.8);
    const matrix = new THREE.Matrix4(), heights: number[] = [];
    for (let i = 0; i < mesh('combat-debris').count; i++) { mesh('combat-debris').getMatrixAt(i, matrix); heights.push(matrix.elements[13]); }
    expect(heights.some(y => y < 11)).toBe(true);
    visuals.dispose();
  });
  it('bounds overlapping explosions and clears their draw counts on reset', () => {
    const { scene, visuals, step, mesh } = setup();
    for (let i = 0; i < 40; i++) visuals.blast(new THREE.Vector3(i, .15, 0));
    step(.05);
    expect(visuals.counts).toMatchObject({ fire: 96, smoke: 256, debris: 96, sparks: 128, craters: 40 });
    visuals.reset();
    for (const layer of ['fire', 'smoke', 'debris', 'sparks', 'craters']) expect(mesh(`combat-${layer}`).count).toBe(0);
    visuals.dispose(); expect(scene.getObjectByName('combat-events')).toBeUndefined();
  });
});
