import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { compileSettled, withWarmRenderObjects } from './warm-render-objects';

it.each([false, true])('submits dormant renderables and restores state, including on error: %s', fail => {
  const root = new THREE.Group(); root.visible = false;
  const geometry = new THREE.PlaneGeometry(); geometry.setDrawRange(4, 0);
  const pool = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 3);
  pool.count = 0; pool.visible = false;
  const other = new THREE.Mesh(geometry, pool.material);
  const light = new THREE.PointLight(); light.visible = false;
  root.add(pool, other, light);
  const before = Array.from(pool.instanceMatrix.array);
  const run = () => withWarmRenderObjects([root, pool], () => {
    expect(root.visible && pool.visible && other.visible).toBe(true);
    expect(pool.count).toBe(1); expect(pool.frustumCulled).toBe(false);
    expect(geometry.drawRange).toEqual({ start: 0, count: Infinity });
    expect(light.visible).toBe(false);
    if (fail) throw new Error('render failed');
  });
  if (fail) expect(run).toThrow('render failed'); else run();
  expect(root.visible || pool.visible).toBe(false);
  expect(other.visible).toBe(true); expect(light.visible).toBe(false);
  expect(pool.count).toBe(0); expect(pool.frustumCulled).toBe(true);
  expect(geometry.drawRange).toEqual({ start: 4, count: 0 });
  expect(Array.from(pool.instanceMatrix.array)).toEqual(before);
});

describe('compileSettled', () => {
  const fake = (programs: Map<object, { isReady(): boolean } | undefined>) => ({
    compile: () => new Set(programs.keys()), extensions: { get: () => ({}) },
    properties: { get: (material: object) => ({ currentProgram: programs.get(material) }) },
  }) as unknown as THREE.WebGLRenderer;
  it('waits for each program, and no longer for a material disposed meanwhile', async () => {
    vi.useFakeTimers();
    try {
      let ready = false; const kept = {}, disposed = {};
      const programs = new Map<object, { isReady(): boolean } | undefined>([[kept, { isReady: () => ready }], [disposed, { isReady: () => false }]]);
      let settled = false; void compileSettled(fake(programs), new THREE.Scene(), new THREE.PerspectiveCamera()).then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(50); expect(settled).toBe(false);
      // Three drops a disposed material's properties; its own compileAsync throws here and never settles.
      programs.set(disposed, undefined); await vi.advanceTimersByTimeAsync(50); expect(settled).toBe(false);
      ready = true; await vi.advanceTimersByTimeAsync(50); expect(settled).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('gives up on a program that never reports ready', async () => {
    vi.useFakeTimers();
    try {
      let settled = false; void compileSettled(fake(new Map([[{}, { isReady: () => false }]])), new THREE.Scene(), new THREE.PerspectiveCamera(), 500).then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(400); expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(200); expect(settled).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
