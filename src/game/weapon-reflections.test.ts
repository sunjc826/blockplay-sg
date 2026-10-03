import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createOpticReflectionRenderer } from './weapon-reflections';
import { fitWeaponOptic, getWeaponSight } from './weapon-optics';
import { FPS_WEAPONS } from './fps-rules';

function fixture() {
  const original = new THREE.WebGLRenderTarget(8, 8);
  const renderer = { getRenderTarget: () => original, setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn(), shadowMap: { autoUpdate: true }, xr: { enabled: true } };
  const reflections = createOpticReflectionRenderer(renderer as unknown as THREE.WebGLRenderer);
  const model = new THREE.Group(), remove = fitWeaponOptic(model, FPS_WEAPONS[1]), sight = getWeaponSight(model)!;
  model.position.set(0, -sight.aimHeight, sight.aimDepth);
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(65, 1, .01, 800), view = camera.clone();
  return { original, renderer, reflections, model, sight, world, camera, view, dispose() { remove(); reflections.dispose(); original.dispose(); } };
}

it('captures actual scenery behind the lens, throttles it, and reprojects between captures', () => {
  const f = fixture(), glass = f.sight.reflection!;
  expect(f.reflections.render(f.world, f.camera, f.view, glass, false, 0)).toBe(false);
  expect(f.renderer.render).not.toHaveBeenCalled();
  expect(f.reflections.render(f.world, f.camera, f.view, glass, true, 0)).toBe(true);
  const [world, capture] = f.renderer.render.mock.calls[0] as [THREE.Scene, THREE.PerspectiveCamera];
  expect(world).toBe(f.world);
  expect(capture.getWorldDirection(new THREE.Vector3()).z).toBeCloseTo(1);
  expect(glass.uniforms.reflectionMap.value).toBeInstanceOf(THREE.Texture);
  expect(glass.uniforms.reflectionReady.value).toBe(1);
  expect(f.renderer.setRenderTarget).toHaveBeenLastCalledWith(f.original);
  expect(f.renderer.shadowMap.autoUpdate).toBe(true); expect(f.renderer.xr.enabled).toBe(true);
  const matrix = glass.uniforms.reflectionViewToCapture.value.clone();
  f.camera.rotation.y = .2;
  expect(f.reflections.render(f.world, f.camera, f.view, glass, true, .05)).toBe(false);
  expect(glass.uniforms.reflectionViewToCapture.value.equals(matrix)).toBe(false);
  expect(f.reflections.render(f.world, f.camera, f.view, glass, true, .125)).toBe(true);
  expect(f.renderer.render).toHaveBeenCalledTimes(2);
  f.dispose();
});

it('captures hip-position glass but skips offscreen and absent optics', () => {
  const f = fixture();
  f.model.position.set(.2, -.32, -.78);
  expect(f.reflections.render(f.world, f.camera, f.view, f.sight.reflection, true, 0)).toBe(true);
  f.model.position.x = 5;
  expect(f.reflections.render(f.world, f.camera, f.view, f.sight.reflection, true, 1)).toBe(false);
  expect(f.reflections.render(f.world, f.camera, f.view, undefined, true, 2)).toBe(false);
  expect(f.renderer.render).toHaveBeenCalledOnce();
  f.dispose();
});

it('restores renderer state after a failed capture', () => {
  const f = fixture();
  f.renderer.render.mockImplementation(() => { throw new Error('render failed'); });
  expect(() => f.reflections.render(f.world, f.camera, f.view, f.sight.reflection, true, 0)).toThrow('render failed');
  expect(f.renderer.setRenderTarget).toHaveBeenLastCalledWith(f.original);
  expect(f.renderer.shadowMap.autoUpdate).toBe(true); expect(f.renderer.xr.enabled).toBe(true);
  expect(f.sight.reflection!.uniforms.reflectionReady.value).toBe(0);
  f.dispose();
});
