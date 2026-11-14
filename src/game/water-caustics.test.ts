import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createWaterCaustics, CAUSTIC_HEIGHTS } from './water-caustics';
import { createWaterMaterial } from './water';

it('lazily captures shared surface normals, restores renderer state on failure, and releases its atlas', () => {
  const water = createWaterMaterial({ deep: '#123456', shallow: '#456789', sky: '#abcdef', horizon: '#888888', sun: new THREE.Vector3(0, 1, 0) });
  const camera = new THREE.PerspectiveCamera(), target = new THREE.WebGLRenderTarget(600, 400);
  const snapshot = new THREE.WebGLRenderTarget(600, 400, { depthTexture: new THREE.DepthTexture(600, 400) });
  let bound: THREE.WebGLRenderTarget | null = target;
  const viewport = new THREE.Vector4(2, 3, 600, 400), color = new THREE.Color('#123456');
  let alpha = .7, scissor = true, fail = false;
  const draws: THREE.ShaderMaterial[] = [];
  const renderer = {
    autoClear: true, xr: { enabled: true },
    getRenderTarget: () => bound, setRenderTarget: (value: THREE.WebGLRenderTarget) => { bound = value; },
    getViewport: (value: THREE.Vector4) => value.copy(viewport),
    setViewport: (value: THREE.Vector4 | number, y?: number, w?: number, h?: number) => typeof value === 'number' ? viewport.set(value, y!, w!, h!) : viewport.copy(value),
    getClearColor: (value: THREE.Color) => value.copy(color), getClearAlpha: () => alpha,
    setClearColor: (value: THREE.ColorRepresentation, opacity: number) => { color.set(value); alpha = opacity; },
    getScissorTest: () => scissor, setScissorTest: (value: boolean) => { scissor = value; }, clear: vi.fn(),
    render: (object: THREE.Scene | THREE.Mesh) => {
      if (fail) throw new Error('GPU failure');
      draws.push((object instanceof THREE.Scene ? (object.children[0] as THREE.Mesh).material : object.material) as THREE.ShaderMaterial);
    },
  } as unknown as THREE.WebGLRenderer;
  const pass = createWaterCaustics(renderer, camera, water);
  try {
    expect(pass.render(snapshot, target)).toBe(false); expect(pass.target).toBeUndefined();
    water.uniforms.uWaveReady.value = 1;
    expect(pass.render(snapshot, target)).toBe(true);
    expect(draws).toHaveLength(CAUSTIC_HEIGHTS.length + 1);
    expect(draws[0].uniforms.uWaveMap).toBe(water.uniforms.uWaveMap);
    expect(draws[0].uniforms.uWaveOrigin).toBe(water.uniforms.uWaveOrigin);
    expect(draws.at(-1)!.uniforms.sceneDepth.value).toBe(snapshot.depthTexture);
    const atlas = pass.target!; expect(atlas.width).toBe(1024); expect(atlas.height).toBe(1536);
    water.uniforms.uCausticLight.value = 0;
    expect(pass.render(snapshot, target)).toBe(false); expect(pass.enabled).toBe(false);
    water.uniforms.uCausticLight.value = 1; fail = true;
    expect(() => pass.render(snapshot, target)).toThrow('GPU failure');
    expect(bound).toBe(target); expect(renderer.autoClear && renderer.xr.enabled && scissor).toBe(true);
    expect(viewport.toArray()).toEqual([2, 3, 600, 400]); expect(color.getHexString()).toBe('123456'); expect(alpha).toBe(.7);
    const dispose = vi.fn(); atlas.addEventListener('dispose', dispose); pass.release();
    expect(dispose).toHaveBeenCalledOnce(); expect(pass.target).toBeUndefined(); expect(pass.enabled).toBe(false);
  } finally { pass.dispose(); water.dispose(); snapshot.depthTexture!.dispose(); snapshot.dispose(); target.dispose(); }
});
