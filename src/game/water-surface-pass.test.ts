import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createWaterMaterial } from './water';
import { createWaterSurfacePass } from './water-surface-pass';

function setup(failCopy = false, name = 'marina-bay-water') {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1.5, .08, 400);
  const water = createWaterMaterial({ deep: '#123456', shallow: '#456789', sky: '#abcdef', horizon: '#888888', sun: new THREE.Vector3(0, 1, 0) });
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), water);
  bay.name = name; if (name !== 'marina-bay-water') scene.userData.primaryWater = name; bay.rotation.x = -Math.PI / 2; scene.add(bay);
  const solid = new THREE.MeshBasicMaterial(), glass = new THREE.MeshBasicMaterial({ transparent: true });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  // A transparent child of an opaque mesh must still be rendered in phase two.
  const parent = new THREE.Mesh(new THREE.BoxGeometry(), solid);
  parent.add(new THREE.Mesh(parent.geometry, glass)); scene.add(parent, new THREE.Mesh(parent.geometry, hidden));
  camera.position.set(0, 2, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const frames: boolean[][] = [];
  const renderer = { autoClear: false, shadowMap: { autoUpdate: true }, initRenderTarget: vi.fn(), setRenderTarget: vi.fn(),
    copyTextureToTexture: vi.fn(() => { if (failCopy) throw new Error('copy failed'); }),
    render: vi.fn(() => frames.push([solid.visible, glass.visible, water.visible, hidden.visible])),
  } as unknown as THREE.WebGLRenderer;
  const target = new THREE.WebGLRenderTarget(600, 400, { depthTexture: new THREE.DepthTexture(600, 400) });
  const pass = createWaterSurfacePass(renderer, scene, camera);
  return { pass, renderer, frames, water, target, camera, solid, glass, hidden, bay, scene,
    dispose() { pass.dispose(); target.depthTexture!.dispose(); target.dispose(); bay.geometry.dispose(); parent.geometry.dispose(); [water, solid, glass, hidden].forEach(m => m.dispose()); } };
}

it.each(['marina-bay-water', 'sentosa-beach-water'])('%s: snapshots opaque colour/depth, restores state and releases buffers when disabled', name => {
  const s = setup(false, name);
  try {
    expect(s.pass.prepare(true)).toBe(true); s.pass.render(s.target);
    expect(s.frames).toEqual([[true, false, false, false], [false, true, true, false]]);
    const u = s.water.uniforms;
    expect(s.renderer.copyTextureToTexture).toHaveBeenNthCalledWith(1, s.target.texture, u.uSceneColor.value);
    expect(s.renderer.copyTextureToTexture).toHaveBeenNthCalledWith(2, s.target.depthTexture, u.uSceneDepth.value);
    expect(u.uSceneColor.value).not.toBe(s.target.texture);
    expect(s.pass.enabled).toBe(true);
    expect(u.uRefractionReady.value).toBe(0); // Secondary cameras cannot reuse the main viewport's snapshot.
    expect(u.uViewport.value.toArray()).toEqual([600, 400]);
    expect(s.water.depthWrite).toBe(false); expect(s.solid.visible && s.glass.visible).toBe(true); expect(s.hidden.visible).toBe(false);
    expect(s.renderer.shadowMap.autoUpdate).toBe(true);
    s.target.setSize(390, 844); s.pass.prepare(true); s.pass.render(s.target);
    expect(u.uViewport.value.toArray()).toEqual([390, 844]);
    expect(u.uSceneColor.value.image).toMatchObject({ width: 390, height: 844 });
    const dispose = vi.fn(); u.uSceneDepth.value.addEventListener('dispose', dispose);
    expect(s.pass.prepare(false)).toBe(false); expect(dispose).toHaveBeenCalledOnce();
    expect(u.uRefractionReady.value).toBe(0); expect(u.uSceneDepth.value).toBeNull(); expect(u.uUltra.value).toBe(0);
  } finally { s.dispose(); }
});

it('skips the snapshot underwater and when the bay is hidden or offscreen', () => {
  const s = setup();
  try {
    s.camera.position.y = -.1; s.camera.updateMatrixWorld(); expect(s.pass.prepare(true)).toBe(false);
    s.camera.position.set(0, 2, 200); s.camera.lookAt(0, 2, 300); s.camera.updateMatrixWorld(); expect(s.pass.prepare(true)).toBe(false);
    s.camera.lookAt(0, 0, 0); s.camera.updateMatrixWorld(); s.bay.visible = false; expect(s.pass.prepare(true)).toBe(false);
    s.pass.render(s.target); expect(s.renderer.copyTextureToTexture).not.toHaveBeenCalled();
  } finally { s.dispose(); }
});

it('restores all material visibility and renderer state if a snapshot fails', () => {
  const s = setup(true);
  try {
    s.pass.prepare(true); expect(() => s.pass.render(s.target)).toThrow('copy failed');
    expect(s.solid.visible && s.glass.visible && s.water.visible).toBe(true); expect(s.hidden.visible).toBe(false);
    expect(s.renderer.autoClear).toBe(false); expect(s.renderer.shadowMap.autoUpdate).toBe(true); expect(s.water.depthWrite).toBe(false);
    expect(s.water.uniforms.uRefractionReady.value).toBe(0);
  } finally { s.dispose(); }
});
