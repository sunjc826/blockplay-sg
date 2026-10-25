import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { softwareRenderer } from './fps-sun-shadows';

/**
 * Ambient occlusion for the world view: corners, gaps under ledges and the
 * feet of walls darken, so shade has shape instead of one flat fill. Three's
 * GTAO, fed the scene pass's own depth and rebuilding normals from it, so the
 * district is drawn once, not twice. AO runs at half resolution and is blended
 * over the full-resolution, multisampled scene; the output pass then applies
 * tone mapping and sRGB, as rendering straight to the canvas would. A plain
 * colour sky is left out of that and cleared on the canvas instead, as a
 * direct render does, so tone mapping does not grey it.
 *
 * Off (one plain render to the canvas) when not wanted, or on software
 * renderers (SwiftShader, llvmpipe).
 */
/** Metres: about a storey, so the feet of walls and the undersides of decks darken, not whole streets. */
export const OCCLUSION_RADIUS = 3;

export function createWorldOcclusion(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const supported = !softwareRenderer(renderer) && renderer.capabilities.isWebGL2;
  let sceneTarget: THREE.WebGLRenderTarget | null = null, aoTarget: THREE.WebGLRenderTarget | null = null;
  let gtao: GTAOPass | null = null, output: OutputPass | null = null;
  const size = new THREE.Vector2();
  function build() {
    renderer.getDrawingBufferSize(size);
    const width = Math.max(1, size.x), height = Math.max(1, size.y);
    sceneTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(width, height) });
    aoTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
    gtao = new GTAOPass(scene, camera, Math.ceil(width / 2), Math.ceil(height / 2));
    // Set after construction: r180's constructor reads a normal target it only makes for its own G-buffer.
    gtao.setGBuffer(sceneTarget.depthTexture!);
    gtao.updateGtaoMaterial({ radius: OCCLUSION_RADIUS, distanceExponent: 1.2, thickness: 5, distanceFallOff: 1, scale: 1.8, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = .9;
    output = new OutputPass(); output.renderToScreen = true;
    // The scene arrives premultiplied over a transparent sky, which is already on the canvas.
    Object.assign(output.material, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  }
  const clearColor = new THREE.Color();
  return {
    get supported() { return supported; },
    /** The GTAO pass once built, for review pages that show its buffers. */
    get pass() { return gtao; },
    /** Call when the canvas's size or pixel ratio changes. */
    setSize() {
      if (!sceneTarget || !aoTarget || !gtao) return;
      renderer.getDrawingBufferSize(size);
      sceneTarget.setSize(size.x, size.y); aoTarget.setSize(size.x, size.y);
      gtao.setSize(Math.ceil(size.x / 2), Math.ceil(size.y / 2));
    },
    /** Draws the world to the canvas, with occlusion when `want` and the GPU allow. Returns whether it was applied. */
    render(want: boolean) {
      if (!supported || !want) {
        renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
        return false;
      }
      if (!sceneTarget) build();
      const sky = scene.background instanceof THREE.Color ? scene.background : null;
      renderer.getClearColor(clearColor); const clearAlpha = renderer.getClearAlpha();
      if (sky) { scene.background = null; renderer.setClearColor(0x000000, 0); }
      renderer.setRenderTarget(sceneTarget); renderer.clear(); renderer.render(scene, camera);
      scene.background = sky ?? scene.background;
      gtao!.render(renderer, aoTarget!, sceneTarget!, 0, false);
      renderer.setRenderTarget(null);
      if (sky) renderer.setClearColor(sky, 1);
      renderer.clear();
      renderer.setClearColor(clearColor, clearAlpha);
      // Writes to the canvas (renderToScreen ignores the write buffer) without auto-clearing the sky just put there.
      const autoClear = renderer.autoClear; renderer.autoClear = false;
      output!.render(renderer, aoTarget!, aoTarget!, 0, false);
      renderer.autoClear = autoClear;
      return true;
    },
    dispose() { sceneTarget?.depthTexture?.dispose(); sceneTarget?.dispose(); aoTarget?.dispose(); gtao?.dispose(); output?.dispose(); },
  };
}
