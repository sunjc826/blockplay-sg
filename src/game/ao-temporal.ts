import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Keeps ambient occlusion still while the view moves. GTAO works at half
 * resolution from an aliased depth buffer with a fixed noise pattern, so a
 * thin edge or a centimetre step in the paving reads differently each frame
 * and its shade crawls. Here each frame's AO is blended with the last, carried
 * to where the same surface now is from the depth buffer and both cameras'
 * matrices (the world is static; the camera is what moves).
 *
 * A carried value is used only where the depth it was stored with matches
 * the surface's depth from the previous camera, so newly revealed ground starts
 * fresh, and it is held within the range of this frame's neighbouring AO, so a
 * car or a walker that moves leaves no trail. It is also brought back to full
 * resolution by depth: of the four nearest half-resolution values, those at
 * the pixel's own depth count most, so a dark crease does not bleed over a
 * silhouette in front of it.
 */

/** Weight of the carried history: about an eight-frame average. */
export const AO_HISTORY_WEIGHT = .88;

const VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const VIEW_DEPTH = /* glsl */`
float viewDepthAt(vec2 uv, float depth) {
  vec4 view = projectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
  return -view.z / view.w;
}`;

/** Half resolution: r = this frame's resolved AO, a = view depth of the surface it belongs to (0 for sky). */
const RESOLVE = /* glsl */`
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform sampler2D tHistory;
uniform mat4 projectionInverse;
uniform mat4 cameraWorld;
uniform mat4 previousView;
uniform mat4 previousProjection;
uniform vec2 texel;
uniform float historyWeight;
varying vec2 vUv;
void main() {
  float depth = textureLod(tDepth, vUv, 0.0).x;
  if (depth >= 1.0) { gl_FragColor = vec4(1.0, 1.0, 1.0, 0.0); return; }
  float ao = textureLod(tAO, vUv, 0.0).r;
  vec4 view = projectionInverse * vec4(vec3(vUv, depth) * 2.0 - 1.0, 1.0);
  view /= view.w;
  float result = ao;
  if (historyWeight > 0.0) {
    vec4 previous = previousView * (cameraWorld * view);
    vec4 clip = previousProjection * previous;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (clip.w > 0.0 && uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) {
      vec4 history = textureLod(tHistory, uv, 0.0);
      float expected = -previous.z;
      if (history.a > 0.0 && abs(history.a - expected) < 0.015 * expected + 0.03) {
        float lo = ao, hi = ao;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          float n = textureLod(tAO, vUv + vec2(x, y) * texel, 0.0).r;
          lo = min(lo, n); hi = max(hi, n);
        }
        result = mix(ao, clamp(history.r, lo, hi), historyWeight);
      }
    }
  }
  gl_FragColor = vec4(vec3(result), -view.z);
}`;

/** Full resolution: the scene picture darkened by the resolved AO, upsampled by depth. */
const COMPOSITE = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform mat4 projectionInverse;
uniform float intensity;
varying vec2 vUv;
${VIEW_DEPTH}
void main() {
  vec4 scene = textureLod(tScene, vUv, 0.0);
  float depth = textureLod(tDepth, vUv, 0.0).x;
  float ao = 1.0;
  if (depth < 1.0) {
    float z = viewDepthAt(vUv, depth);
    ivec2 size = textureSize(tAO, 0);
    vec2 p = vUv * vec2(size) - 0.5, f = fract(p);
    ivec2 base = ivec2(floor(p));
    float sum = 0.0, total = 0.0;
    for (int i = 0; i < 4; i++) {
      ivec2 o = ivec2(i & 1, i >> 1);
      vec4 s = texelFetch(tAO, clamp(base + o, ivec2(0), size - 1), 0);
      float bilinear = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
      // Sky texels (depth 0) and surfaces well in front or behind barely count.
      float similar = s.a > 0.0 ? 1.0 / (1.0 + abs(s.a - z) / max(z, 1e-3) * 40.0) : 0.0;
      float w = bilinear * similar * similar + 1e-5 * bilinear;
      sum += w * (s.a > 0.0 ? s.r : 1.0); total += w;
    }
    ao = sum / total;
  }
  gl_FragColor = vec4(scene.rgb * mix(1.0, ao, intensity), scene.a);
}`;

export function createAoTemporal() {
  const targets = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
  const resolve = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: RESOLVE, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: { tAO: { value: null }, tDepth: { value: null }, tHistory: { value: null }, projectionInverse: { value: new THREE.Matrix4() },
      cameraWorld: { value: new THREE.Matrix4() }, previousView: { value: new THREE.Matrix4() }, previousProjection: { value: new THREE.Matrix4() },
      texel: { value: new THREE.Vector2() }, historyWeight: { value: 0 } } });
  const composite = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: { tScene: { value: null }, tAO: { value: null }, tDepth: { value: null }, projectionInverse: { value: new THREE.Matrix4() }, intensity: { value: 1 } } });
  const quad = new FullScreenQuad();
  let current = 0, valid = false;
  const previousView = new THREE.Matrix4(), previousProjection = new THREE.Matrix4();
  return {
    /** Forget the history (a cut, a resize, AO switched back on). */
    reset() { valid = false; },
    /**
     * Blends `ao` (half resolution, from GTAO) with the carried history and
     * writes `scene` darkened by the result into `output`.
     */
    render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, ao: THREE.WebGLRenderTarget, depth: THREE.Texture,
      scene: THREE.Texture, output: THREE.WebGLRenderTarget, intensity: number, historyWeight = AO_HISTORY_WEIGHT) {
      if (targets[0].width !== ao.width || targets[0].height !== ao.height) { targets.forEach(t => t.setSize(ao.width, ao.height)); valid = false; }
      const read = targets[current], write = targets[1 - current];
      const r = resolve.uniforms;
      r.tAO.value = ao.texture; r.tDepth.value = depth; r.tHistory.value = read.texture;
      r.projectionInverse.value.copy(camera.projectionMatrixInverse); r.cameraWorld.value.copy(camera.matrixWorld);
      r.previousView.value.copy(previousView); r.previousProjection.value.copy(previousProjection);
      r.texel.value.set(1 / ao.width, 1 / ao.height); r.historyWeight.value = valid ? historyWeight : 0;
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(write); quad.material = resolve; quad.render(renderer);
      const c = composite.uniforms;
      c.tScene.value = scene; c.tAO.value = write.texture; c.tDepth.value = depth;
      c.projectionInverse.value.copy(camera.projectionMatrixInverse); c.intensity.value = intensity;
      renderer.setRenderTarget(output); quad.material = composite; quad.render(renderer);
      renderer.setRenderTarget(previousTarget);
      previousView.copy(camera.matrixWorldInverse); previousProjection.copy(camera.projectionMatrix);
      current = 1 - current; valid = true;
    },
    dispose() { targets.forEach(t => t.dispose()); resolve.dispose(); composite.dispose(); quad.dispose(); },
  };
}
