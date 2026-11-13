import { createSunRays, projectSunRays, type SunRayLight, type SunRayQuality } from './sun-rays';
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { softwareRenderer } from './fps-sun-shadows';
import { getGraphicsSettings } from './graphics-settings';
import { createWaterReflections } from './water-reflections';
import { createWaterSurfacePass } from './water-surface-pass';
import { getEnvironmentSettings } from './environment-settings';
import { createRainReflections, type WetGround } from './rain-reflections';
import { createGradeUniforms, GRADE_GLSL, type ColorGrade, type SkyDome } from './district-look';
import { stabilizeGtao } from './gtao-stability';
import { createAoTemporal } from './ao-temporal';

/**
 * Ambient occlusion for the world view: corners, gaps under ledges and the
 * feet of walls darken, so shade has shape instead of one flat fill. Three's
 * GTAO, fed the scene pass's own depth and rebuilding normals from it, so the
 * district is drawn once, not twice. Its normals step over one-pixel strips
 * (gtao-stability) and each frame is blended with the last, reprojected
 * (ao-temporal), so the shade holds still while the view moves.
 * AO runs at half resolution and is blended
 * over the full-resolution, multisampled scene; the output pass then applies
 * tone mapping and sRGB, as rendering straight to the canvas would. A plain
 * colour sky is left out of that and cleared on the canvas instead, as a
 * direct render does, so tone mapping does not grey it.
 *
 * Bloom shares this HDR scene target, before tone mapping. A high threshold
 * selects bright light sources; the plain sky never enters the extraction.
 * The weapon, scope image and reticle are drawn afterwards and stay crisp.
 * Ultra wet-ground reflections also reuse this scene colour and depth.
 * A district look's colour grade (`scene.userData.colorGrade`) runs in the
 * output pass, after tone mapping; the plain one-render path has no grade.
 * Its gradient sky (`scene.userData.skyDome`) takes the plain sky's place:
 * left out of the HDR picture and drawn on the canvas under it.
 * Off (one plain render to the canvas) when no effect is wanted, or on software
 * renderers (SwiftShader, llvmpipe).
 */
/** Metres: about a storey, so the feet of walls and the undersides of decks darken, not whole streets. */
export const OCCLUSION_RADIUS = 3;

export function createWorldOcclusion(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const supported = !softwareRenderer(renderer) && renderer.capabilities.isWebGL2;
  let sceneTarget: THREE.WebGLRenderTarget | null = null, aoTarget: THREE.WebGLRenderTarget | null = null;
  let gtao: GTAOPass | null = null, output: OutputPass | null = null, aoTemporal: ReturnType<typeof createAoTemporal> | null = null;
  let smaa: SMAAPass | null = null, smaaTarget: THREE.WebGLRenderTarget | null = null, smaaEnabled = false;
  let bloom: UnrealBloomPass | null = null, bloomEnabled = false;
  let rain: ReturnType<typeof createRainReflections> | null = null, rainReflectionsEnabled = false;
  const water = createWaterReflections(renderer,scene,camera);
  const waterSurface = createWaterSurfacePass(renderer,scene,camera);
  let waterReflectionsEnabled = false;
  let sunRays: ReturnType<typeof createSunRays> | null = null, godRaysEnabled = false;
  const sunUv = new THREE.Vector2();
  const grade = createGradeUniforms();
  let gradeApplied = false;
  const size = new THREE.Vector2();
  function build() {
    renderer.getDrawingBufferSize(size);
    const width = Math.max(1, size.x), height = Math.max(1, size.y);
    sceneTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(width, height) });
    output = new OutputPass(); output.renderToScreen = true;
    Object.assign(output.material.uniforms, grade.uniforms);
    output.material.fragmentShader = output.material.fragmentShader.replace('varying vec2 vUv;', `varying vec2 vUv;\n${GRADE_GLSL}`)
      .replace('#ifdef SRGB_TRANSFER', 'if (gradeAmount > 0.0) gl_FragColor.rgb = lookGrade(gl_FragColor.rgb);\n#ifdef SRGB_TRANSFER');
    // The scene arrives premultiplied over a transparent sky, which is already on the canvas.
    Object.assign(output.material, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  }
  function buildOcclusion() {
    const { width, height } = sceneTarget!;
    aoTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
    gtao = new GTAOPass(scene, camera, Math.ceil(width / 2), Math.ceil(height / 2));
    // Set after construction: r180's constructor reads a normal target it only makes for its own G-buffer.
    gtao.setGBuffer(sceneTarget!.depthTexture!);
    gtao.updateGtaoMaterial({ radius: OCCLUSION_RADIUS, distanceExponent: 1.2, thickness: 5, distanceFallOff: 1, scale: 1.8, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = .9;
    // AO and denoise only; the temporal resolve below darkens the picture.
    gtao.output = GTAOPass.OUTPUT.Off;
    stabilizeGtao(gtao);
    aoTemporal = createAoTemporal();
  }
  function buildBloom() {
    // The pass halves this again: its largest blur target is quarter resolution.
    bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(32, Math.ceil(sceneTarget!.width / 2)), Math.max(32, Math.ceil(sceneTarget!.height / 2))), .12, 0, 1.4);
    bloom.materialHighPassFilter.uniforms.smoothWidth.value = .3;
    // Add light without overwriting scene coverage: otherwise transparent sky
    // pixels become opaque black and lose the separately drawn sky colour.
    Object.assign(bloom.blendMaterial, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  }
  const clearColor = new THREE.Color();
  return {
    get smaaEnabled() { return smaaEnabled; },
    get supported() { return supported; },
    /** The GTAO pass once built, for review pages that show its buffers. */
    get pass() { return gtao; },
    get godRaysEnabled() { return godRaysEnabled; },
    get sunRayOverlay() { return godRaysEnabled ? sunRays?.overlay ?? null : null; },
    get godRaysSize() { return sunRays?.size ?? null; },
    get bloomEnabled() { return bloomEnabled; },
    /** Whether the last frame went out with the scene's colour grade. */
    get gradeApplied() { return gradeApplied; },
    get waterReflectionsEnabled() { return waterReflectionsEnabled; },
    get waterRefractionEnabled() { return waterSurface.enabled; },
    get rainReflectionsEnabled() { return rainReflectionsEnabled; },
    /** Call when the canvas's size or pixel ratio changes. */
    setSize() {
      if (!sceneTarget) return;
      renderer.getDrawingBufferSize(size);
      sceneTarget.setSize(size.x, size.y); aoTarget?.setSize(size.x, size.y);
      smaaTarget?.setSize(size.x, size.y); smaa?.setSize(size.x, size.y);
      gtao?.setSize(Math.ceil(size.x / 2), Math.ceil(size.y / 2));
      bloom?.setSize(Math.max(32, Math.ceil(size.x / 2)), Math.max(32, Math.ceil(size.y / 2)));
    },
    /** Draws the world to the canvas, with occlusion when `want` and the GPU allow. Returns whether it was applied. */
    render(want: boolean, wantBloom = getGraphicsSettings().bloom, wantRainReflections = getGraphicsSettings().rainReflections, wantWaterReflections = getGraphicsSettings().waterReflections, wantGodRays: SunRayQuality = getGraphicsSettings().godRays, wantWaterSurface = true) {
      smaaEnabled = supported && getGraphicsSettings().smaa;
      // Release optional full-resolution buffers when the player switches back to a light preset.
      if (!smaaEnabled && smaa) { smaa.dispose(); smaaTarget!.dispose(); smaa = null; smaaTarget = null; }
      camera.updateMatrixWorld();
      const ultraWater = supported && wantWaterSurface && getGraphicsSettings().waterDetail === 'ultra' && !getEnvironmentSettings().reducedEffects;
      const waterSurfaceEnabled = waterSurface.prepare(ultraWater);
      const sun = scene.userData.sunRays as SunRayLight | undefined;
      const rayStrength = supported && wantGodRays !== 'off' ? projectSunRays(camera, sun, sunUv) : 0;
      godRaysEnabled = rayStrength > .002;
      waterReflectionsEnabled = water.render(supported && wantWaterReflections, ultraWater);
      bloomEnabled = supported && wantBloom;
      const ground = scene.userData.wetGround as WetGround | undefined;
      rainReflectionsEnabled = supported && wantRainReflections && !!ground?.surface && ground.wetness > .03;
      gradeApplied = false;
      const dome = scene.userData.skyDome as SkyDome | undefined;
      if (!supported || (!want && !bloomEnabled && !rainReflectionsEnabled && !godRaysEnabled && !smaaEnabled && !waterSurfaceEnabled)) {
        dome?.setGrade(null);
        renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
        return false;
      }
      if (!sceneTarget) build();
      if (want && !gtao) buildOcclusion();
      if (godRaysEnabled && !sunRays) sunRays = createSunRays(renderer, camera);
      if (bloomEnabled && !bloom) buildBloom();
      if (rainReflectionsEnabled && !rain) rain = createRainReflections(renderer, camera, ground!);
      const sky = scene.background instanceof THREE.Color ? scene.background : null;
      renderer.getClearColor(clearColor); const clearAlpha = renderer.getClearAlpha();
      if (sky) { scene.background = null; renderer.setClearColor(0x000000, 0); }
      if (dome) dome.mesh.visible = false;
      renderer.setRenderTarget(sceneTarget); renderer.clear(); waterSurface.render(sceneTarget!);
      if (dome) dome.mesh.visible = true;
      scene.background = sky ?? scene.background;
      if (want) {
        gtao!.render(renderer, aoTarget!, sceneTarget!, 0, false);
        aoTemporal!.render(renderer, camera, gtao!.pdRenderTarget, sceneTarget!.depthTexture!, sceneTarget!.texture, aoTarget!, gtao!.blendIntensity);
      } else aoTemporal?.reset();
      let picture = want ? aoTarget! : sceneTarget!;
      if (rainReflectionsEnabled) rain!.render(picture, sceneTarget!.depthTexture!);
      if (bloomEnabled) bloom!.render(renderer, picture, picture, 0, false);
      if (smaaEnabled) {
        if (!smaa) {
          smaa = new SMAAPass(); smaa.clear = true; // Edge detection discards non-edges; never retain last frame's edges.
          smaa.setSize(sceneTarget!.width, sceneTarget!.height);
          smaaTarget = new THREE.WebGLRenderTarget(sceneTarget!.width, sceneTarget!.height, { type: THREE.HalfFloatType, depthBuffer: false });
        }
        // Linear HDR colour + coverage, after world effects and before tone mapping.
        // Clear scratch buffers to transparent black, independent of the world's sky colour.
        renderer.setClearColor(0, 0);
        smaa.render(renderer, smaaTarget!, picture, 0, false);
        renderer.setClearColor(clearColor, clearAlpha);
        picture = smaaTarget!;
      }
      renderer.setRenderTarget(null);
      if (sky) renderer.setClearColor(sky, 1);
      renderer.clear();
      renderer.setClearColor(clearColor, clearAlpha);
      // Writes to the canvas (renderToScreen ignores the write buffer) without auto-clearing the sky just put there.
      const autoClear = renderer.autoClear; renderer.autoClear = false;
      const colorGrade = scene.userData.colorGrade as ColorGrade | undefined;
      gradeApplied = grade.set(colorGrade);
      dome?.draw(renderer, camera, gradeApplied ? colorGrade! : null);
      output!.render(renderer, picture, picture, 0, false);
      if (godRaysEnabled) sunRays!.render(picture, sceneTarget!.depthTexture!, wantGodRays as Exclude<SunRayQuality, 'off'>, sun!, sunUv, rayStrength);
      renderer.autoClear = autoClear;
      return want;
    },
    dispose() {
      sceneTarget?.depthTexture?.dispose(); sceneTarget?.dispose(); aoTarget?.dispose(); gtao?.dispose(); aoTemporal?.dispose(); output?.dispose();
      smaa?.dispose(); smaaTarget?.dispose();
      bloom?.dispose(); sunRays?.dispose();
      rain?.dispose(); water.dispose(); waterSurface.dispose();
      // Three r180's pass disposes its blur/composite materials, but not this one.
      bloom?.materialHighPassFilter.dispose();
    },
  };
}
