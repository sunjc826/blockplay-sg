import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSunShadows } from './fps-sun-shadows';

function fixture(limit = 8192) {
  const renderer = { capabilities: { maxTextureSize: limit }, shadowMap: { enabled: false, type: 0, autoUpdate: true, needsUpdate: false },
    getContext: () => ({ getExtension: () => null, getParameter: () => 'GPU', RENDERER: 1 }) };
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight(); scene.add(light);
  const shadows = createSunShadows(renderer as unknown as THREE.WebGLRenderer, scene);
  return { shadows, light, renderer, update: (size: number) => shadows.update(true, new THREE.PerspectiveCamera(), { x: 1, y: 1, z: 1 }, .016, size) };
}

it('resizes Ultra shadows once and disposes the previous target when changing quality', () => {
  const f = fixture();
  f.update(2048);
  const old = new THREE.WebGLRenderTarget(1, 1), dispose = vi.spyOn(old, 'dispose'); f.light.shadow.map = old;
  f.update(4096);
  expect(f.shadows.mapSize).toBe(4096); expect(f.light.shadow.mapSize.x).toBe(4096);
  expect(f.light.shadow.map).toBeNull(); expect(dispose).toHaveBeenCalledOnce();
  const ultra = new THREE.WebGLRenderTarget(1, 1); f.light.shadow.map = ultra;
  f.update(4096); expect(f.light.shadow.map).toBe(ultra);
  const disposeUltra = vi.spyOn(ultra, 'dispose'); f.update(1024);
  expect(disposeUltra).toHaveBeenCalledOnce(); expect(f.shadows.mapSize).toBe(1024);
  f.shadows.dispose();
});

it('caps Ultra shadow allocation at the device texture limit', () => {
  const f = fixture(2048); f.update(4096);
  expect(f.shadows.mapSize).toBe(2048); expect(f.renderer.shadowMap.needsUpdate).toBe(true);
  f.shadows.dispose();
});

it('releases the allocated shadow map when leaving a game', () => {
  const f = fixture(); f.update(4096);
  const target = new THREE.WebGLRenderTarget(1, 1), dispose = vi.spyOn(target, 'dispose');
  f.light.shadow.map = target; f.shadows.dispose();
  expect(dispose).toHaveBeenCalledOnce(); expect(f.light.shadow.map).toBeNull();
  expect(f.renderer.shadowMap.enabled).toBe(false);
});
