import * as THREE from 'three';
import { primaryWaterSurface, waterSurfaceLevel, waterSurfaceMaterials } from './water';
import { createWaterCaustics } from './water-caustics';

/** Ultra's opaque snapshot. Each material is drawn once; only colour/depth are
 * copied, never sampled while attached to the framebuffer being written.
 * Refraction and caustics need something under the surface, so the snapshot is
 * taken only for water over a modelled bed. A district's solid slabs get the
 * Ultra wave detail and report when they are in view, and nothing more here. */
export function createWaterSurfacePass(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const bay = primaryWaterSurface(scene);
  const material = bay?.material;
  const caustics=createWaterCaustics(renderer,camera,material);
  const surfaces = [...waterSurfaceMaterials(scene)].filter(m => m.uniforms.uUltra);
  let visible = false;
  const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4(), eye = new THREE.Vector3();
  const opaque = new Set<THREE.Material>(), transparent = new Set<THREE.Material>();
  let snapshot: THREE.WebGLRenderTarget | undefined;
  let active = false;
  let rendered = false;
  function release() {
    caustics.release();
    snapshot?.depthTexture?.dispose(); snapshot?.dispose(); snapshot = undefined;
    if (material?.uniforms.uRefractionReady) {
      material.uniforms.uRefractionReady.value = 0;
      material.uniforms.uSceneColor.value = null; material.uniforms.uSceneDepth.value = null;
    }
  }
  return {
    get enabled() { return rendered; },
    /** Whether the primary surface is on screen at Ultra, with or without a snapshot. */
    get visible() { return visible; },
    get caustics() { return caustics; },
    prepare(enabled: boolean) {
      active = false; rendered = false; visible = false;
      for (const m of surfaces) m.uniforms.uUltra.value = enabled ? 1 : 0;
      if (!bay || !material?.uniforms.uUltra) return false;
      material.uniforms.uRefractionReady.value = 0;
      material.uniforms.uUltra.value = enabled ? 1 : 0;
      if (!enabled) { release(); return false; }
      camera.getWorldPosition(eye); bay.updateWorldMatrix(true, false);
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      visible = bay.visible && eye.y > waterSurfaceLevel(bay).height + .05 && frustum.intersectsObject(bay);
      active = visible && material.transparent;
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
        renderer.resetState();
        renderer.initRenderTarget(snapshot);
        renderer.copyTextureToTexture(target.texture, snapshot.texture);
        renderer.copyTextureToTexture(target.depthTexture, snapshot.depthTexture!);
        // Copying binds read/draw framebuffers internally; explicitly restore our target.
        renderer.setRenderTarget(target);
        if(caustics.render(snapshot,target)) {
          // Refraction sees the same lit receivers as the above-water view.
          // r180 can leave another texture unit active when the destination
          // is already cached on unit zero after the receiver pass.
          renderer.resetState();
          renderer.copyTextureToTexture(target.texture,snapshot.texture);
          renderer.setRenderTarget(target);
        }
        const u = material.uniforms;
        u.uSceneColor.value = snapshot.texture; u.uSceneDepth.value = snapshot.depthTexture;
        u.uViewport.value.set(target.width, target.height);
        u.uCameraRange.value.set(camera.near, camera.far);
        u.uInverseViewProjection.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
        u.uRefractionHeight.value = waterSurfaceLevel(bay).height;
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
    dispose() { active = false; rendered = false; visible = false; release(); for (const m of surfaces) m.uniforms.uUltra.value = 0; if (material?.uniforms.uUltra) material.uniforms.uUltra.value = 0; },
  };
}
