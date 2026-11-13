import * as THREE from 'three';
import { primaryWaterSurface } from './water';

/** Ultra's opaque snapshot. Each material is drawn once; only colour/depth are
 * copied, never sampled while attached to the framebuffer being written. */
export function createWaterSurfacePass(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const bay = primaryWaterSurface(scene);
  const material = bay?.material;
  const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4(), eye = new THREE.Vector3(), bayPosition = new THREE.Vector3();
  const opaque = new Set<THREE.Material>(), transparent = new Set<THREE.Material>();
  let snapshot: THREE.WebGLRenderTarget | undefined;
  let active = false;
  let rendered = false;
  function release() {
    snapshot?.depthTexture?.dispose(); snapshot?.dispose(); snapshot = undefined;
    if (material?.uniforms.uRefractionReady) {
      material.uniforms.uRefractionReady.value = 0;
      material.uniforms.uSceneColor.value = null; material.uniforms.uSceneDepth.value = null;
    }
  }
  return {
    get enabled() { return rendered; },
    prepare(enabled: boolean) {
      active = false; rendered = false;
      if (!bay || !material?.uniforms.uUltra) return false;
      material.uniforms.uRefractionReady.value = 0;
      material.uniforms.uUltra.value = enabled ? 1 : 0;
      if (!enabled) { release(); return false; }
      camera.getWorldPosition(eye); bay.updateWorldMatrix(true, false);
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      active = bay.visible && eye.y > bay.getWorldPosition(bayPosition).y + .05 && frustum.intersectsObject(bay);
      return active;
    },
    render(target: THREE.WebGLRenderTarget) {
      if (!active || !material || !bay || !target.depthTexture) {
        renderer.render(scene, camera); return;
      }
      if (!snapshot) snapshot = new THREE.WebGLRenderTarget(target.width, target.height, {
        type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(target.width, target.height),
      });
      if (snapshot.width !== target.width || snapshot.height !== target.height) snapshot.setSize(target.width, target.height);
      opaque.clear(); transparent.clear();
      scene.traverseVisible(object => {
        const m = (object as THREE.Mesh).material;
        for (const entry of Array.isArray(m) ? m : m ? [m] : []) {
          if (entry.visible) (entry.transparent ? transparent : opaque).add(entry);
        }
      });
      const background = scene.background, autoClear = renderer.autoClear;
      const shadowUpdate = renderer.shadowMap.autoUpdate, depthWrite = material.depthWrite;
      try {
        transparent.forEach(m => { m.visible = false; });
        renderer.render(scene, camera); // Resolves the multisampled opaque colour and depth.
        renderer.initRenderTarget(snapshot);
        renderer.copyTextureToTexture(target.texture, snapshot.texture);
        renderer.copyTextureToTexture(target.depthTexture, snapshot.depthTexture!);
        // Copying binds read/draw framebuffers internally; explicitly restore our target.
        renderer.setRenderTarget(target);
        const u = material.uniforms;
        u.uSceneColor.value = snapshot.texture; u.uSceneDepth.value = snapshot.depthTexture;
        u.uViewport.value.set(target.width, target.height);
        u.uCameraRange.value.set(camera.near, camera.far);
        u.uInverseViewProjection.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
        u.uRefractionHeight.value = bay.getWorldPosition(eye).y;
        u.uRefractionReady.value = 1;
        opaque.forEach(m => { m.visible = false; });
        transparent.forEach(m => { m.visible = true; });
        // Retain opaque depth testing and write the water depth for subsequent world effects.
        material.depthWrite = true;
        scene.background = null; renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
        renderer.render(scene, camera);
        rendered = true;
      } finally {
        // A later scope/optic camera must not sample this camera's screen buffers.
        material.uniforms.uRefractionReady.value = 0;
        opaque.forEach(m => { m.visible = true; }); transparent.forEach(m => { m.visible = true; });
        scene.background = background; renderer.autoClear = autoClear;
        renderer.shadowMap.autoUpdate = shadowUpdate; material.depthWrite = depthWrite;
      }
    },
    dispose() { active = false; rendered = false; release(); if (material?.uniforms.uUltra) material.uniforms.uUltra.value = 0; },
  };
}
