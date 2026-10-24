import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createOpticReflectionRenderer } from './weapon-reflections';
import { fitWeaponOptic, getWeaponSight } from './weapon-optics';
import { FPS_WEAPONS } from './fps-rules';

function fixture() {
  const original = new THREE.WebGLRenderTarget(8, 8);
  const renderer = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(1600, 900), getRenderTarget: () => original, setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn(), shadowMap: { autoUpdate: true }, xr: { enabled: true } };
  const reflections = createOpticReflectionRenderer(renderer as unknown as THREE.WebGLRenderer);
  const model = new THREE.Group(), remove = fitWeaponOptic(model, FPS_WEAPONS[1]), sight = getWeaponSight(model)!;
  model.position.set(0, -sight.aimHeight, sight.aimDepth);
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(65, 1, .01, 800), view = camera.clone();
  return { original, renderer, reflections, model, sight, world, camera, view, dispose() { remove(); reflections.dispose(); original.dispose(); } };
}

it('captures actual scenery behind the lens every frame, fitted to the reflected cone', () => {
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
  // The capture covers the cone the lens reflects, not a fixed 110° view.
  expect(capture.fov).toBeLessThan(80); expect(capture.fov).toBeGreaterThan(16);
  expect(glass.uniforms.reflectionTanHalfFov.value).toBeCloseTo(Math.tan(THREE.MathUtils.degToRad(capture.fov / 2)));
  // Every frame recaptures along the new reflected ray.
  const matrix = glass.uniforms.reflectionViewToCapture.value.clone();
  f.camera.rotation.y = .2;
  expect(f.reflections.render(f.world, f.camera, f.view, glass, true, .016)).toBe(true);
  expect(glass.uniforms.reflectionViewToCapture.value.equals(matrix)).toBe(false);
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

it('reflects only lights and scenery large in two dimensions, within a shortened, fogged far plane', () => {
  const f = fixture();
  const light = new THREE.DirectionalLight(), tower = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), bollard = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .9)), rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  tower.scale.set(20, 60, 20); rail.scale.set(30, 1.1, .2); f.world.add(rail);
  const trees = new THREE.InstancedMesh(new THREE.SphereGeometry(.5), undefined, 4), cones = new THREE.InstancedMesh(new THREE.ConeGeometry(.2, .5), undefined, 4), marker = new THREE.Sprite();
  trees.setMatrixAt(0, new THREE.Matrix4().makeScale(4, 4, 4));
  f.world.add(light, tower, bollard, trees, cones, marker);
  f.world.fog = new THREE.Fog('#b8cfdf', 290, 850);
  let fogDuringPass: [number, number] | undefined;
  f.renderer.render.mockImplementation((world: THREE.Scene) => { const fog = world.fog as THREE.Fog; fogDuringPass = [fog.near, fog.far]; });
  expect(f.reflections.render(f.world, f.camera, f.view, f.sight.reflection, true, 0)).toBe(true);
  const capture = f.renderer.render.mock.calls[0][1] as THREE.PerspectiveCamera;
  const seen = (o: THREE.Object3D) => o.layers.test(capture.layers);
  expect([light, tower, trees].map(seen)).toEqual([true, true, true]);
  expect([bollard, rail, cones, marker].map(seen)).toEqual([false, false, false, false]);
  // The main view and shadows still see everything on the default layer.
  expect([bollard, cones, tower].every(o => o.layers.isEnabled(0))).toBe(true);
  expect(capture.far).toBe(150);
  expect(fogDuringPass![1]).toBe(150); expect(fogDuringPass![0]).toBeLessThan(150);
  expect((f.world.fog as THREE.Fog).near).toBe(290); expect((f.world.fog as THREE.Fog).far).toBe(850);
  f.dispose();
});
