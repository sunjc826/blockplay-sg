import * as THREE from 'three';
import { expect, it } from 'vitest';
import { withWarmRenderObjects } from './warm-render-objects';

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
