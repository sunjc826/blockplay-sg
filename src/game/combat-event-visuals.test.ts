import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCombatEventVisuals } from './combat-event-visuals';
import type { ArenaRaider } from './arena-rules';

function setup(reduced = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const visuals = createCombatEventVisuals(scene, origin => new THREE.Vector3(origin.x, 0, origin.z), { reduced: () => reduced });
  const step = (seconds: number) => { for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) visuals.update(1 / 60, [], elapsed, camera); };
  const mesh = (name: string) => scene.getObjectByName(name) as THREE.InstancedMesh;
  return { scene, visuals, step, mesh };
}

describe('things that blow up when they die', () => {
  const raider = (kind: ArenaRaider['kind'], state: ArenaRaider['state'], y = 30): ArenaRaider => ({ event: 'e', kind, x: 0, y, z: 0, yaw: 0, health: state === 'cruise' || state === 'orbit' ? 30 : 0, maxHealth: 30, state, shots: 0, aim: null });
  it('explodes a downed drone where it hits the ground, once', () => {
    const { visuals } = setup(), camera = new THREE.PerspectiveCamera();
    const frame = (r: ArenaRaider) => visuals.update(1 / 60, [], 0, camera, [r]).blasts;
    expect(frame(raider('drone', 'cruise'))).toHaveLength(0);
    expect(frame(raider('drone', 'down')).map(b => b.size)).toEqual([.2]); // the pop when it is hit
    expect(frame(raider('drone', 'down'))).toHaveLength(0);
    expect(frame(raider('drone', 'wreck', .2)).map(b => b.size)).toEqual([.75]);
    expect(visuals.counts.craters).toBe(1);
    expect(frame(raider('drone', 'wreck', .2))).toHaveLength(0);
    visuals.dispose();
  });
  it('blows a gunship up when it is hit and again when it lands', () => {
    const { visuals } = setup(), camera = new THREE.PerspectiveCamera();
    const frame = (r: ArenaRaider) => visuals.update(1 / 60, [], 0, camera, [r]).blasts;
    frame(raider('gunship', 'orbit'));
    expect(frame(raider('gunship', 'down')).map(b => b.size)).toEqual([1]);
    expect(frame(raider('gunship', 'wreck', .5)).map(b => b.size)).toEqual([1.4]);
    visuals.dispose();
  });
  it('carries a hull blast along on its momentum, with a bigger payload than a shell', () => {
    const { visuals, mesh } = setup();
    visuals.blast(new THREE.Vector3(0, .15, 0));
    const shell = { ...visuals.counts };
    visuals.reset();
    visuals.hullBlast(new THREE.Vector3(0, .15, 0), 1, new THREE.Vector3(0, 0, -20));
    expect(visuals.counts.fire).toBeGreaterThan(shell.fire); expect(visuals.counts.smoke).toBeGreaterThan(shell.smoke); expect(visuals.counts.debris).toBeGreaterThan(shell.debris);
    visuals.update(1 / 60, [], 0, new THREE.PerspectiveCamera());
    const m = new THREE.Matrix4(), at = new THREE.Vector3(); let sum = 0;
    const debris = mesh('combat-debris');
    for (let i = 0; i < debris.count; i++) { debris.getMatrixAt(i, m); sum += at.setFromMatrixPosition(m).z; }
    expect(sum / debris.count).toBeLessThan(-.1);
    // The next explosion is not dragged along by the last one.
    visuals.reset(); visuals.blast(new THREE.Vector3(0, .15, 0)); visuals.update(1 / 60, [], 0, new THREE.PerspectiveCamera());
    sum = 0; for (let i = 0; i < debris.count; i++) { debris.getMatrixAt(i, m); sum += at.setFromMatrixPosition(m).z; }
    expect(Math.abs(sum / debris.count)).toBeLessThan(.1);
    visuals.dispose();
  });
});

describe('explosion particles without arena events', () => {
  it('shows a newly arrived burst even after a long frame', () => {
    const { scene, visuals, step, mesh } = setup();
    visuals.blast(new THREE.Vector3(0, .15, 0));
    visuals.update(1, [], 1, new THREE.PerspectiveCamera());
    for (const layer of ['fire', 'smoke', 'debris', 'sparks']) expect(mesh(`combat-${layer}`).count, layer).toBeGreaterThan(0);
    expect((scene.getObjectByProperty('type', 'PointLight') as THREE.PointLight).intensity).toBeGreaterThan(0);
    step(1); expect(visuals.counts.fire).toBe(0); expect(visuals.counts.sparks).toBe(0);
    visuals.dispose();
  });
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
