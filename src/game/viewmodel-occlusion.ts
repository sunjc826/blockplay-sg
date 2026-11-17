import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Screen-space ambient occlusion for the first-person scene.
 *
 * The world's occlusion pass never sees the carried gun, which is drawn afterwards over the finished
 * picture, and the gun's own lights cast no shadows. So a part standing on another (an optic on its
 * rail, a hand round a grip) met it with no darkening. Each frame this draws the opaque parts' depth
 * at reduced size, works occlusion out from that depth alone, and a full-screen plate in the scene
 * multiplies it over the gun after the opaque parts and before glass, reticles and effects. */
export const VIEW_OCCLUSION = {
  /** Depth and occlusion buffers, as a share of the drawing buffer's width and height. */
  scale: .5,
  /** Metres within which one surface darkens another. */
  radius: .06,
  intensity: 1.7,
  /** Cosine below which a neighbour is treated as the same surface, which keeps flat faces clean. */
  bias: .08,
  /** Largest sampling reach in screen heights, for surfaces almost touching the camera. */
  reach: .12,
  samples: 12,
} as const;

type Drawable = THREE.Object3D & { material?: THREE.Material | THREE.Material[]; isMesh?: boolean };
/** Hide everything that must not darken or be darkened: glass, reticles, flashes, lines and sprites.
 * Returns what it hid so the caller can show it again. Hidden branches are left alone. */
export function hideNonOccluders(root: THREE.Object3D, hidden: THREE.Object3D[] = []) {
  if (!root.visible) return hidden;
  const drawable = root as Drawable, material = Array.isArray(drawable.material) ? drawable.material[0] : drawable.material;
  if (material && (!drawable.isMesh || material.transparent || !material.depthWrite || !material.depthTest)) { root.visible = false; hidden.push(root); return hidden; }
  for (const child of root.children) hideNonOccluders(child, hidden);
  return hidden;
}

const fullScreenVertex = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 1., 1.); }';
const occlusionFragment = `
uniform sampler2D tDepth;
uniform mat4 projection;
uniform mat4 inverseProjection;
uniform vec2 texel;
uniform vec4 tuning; // radius, intensity, bias, reach
varying vec2 vUv;
vec3 viewAt(vec2 uv, float depth) { vec4 v = inverseProjection * vec4(uv * 2. - 1., depth * 2. - 1., 1.); return v.xyz / v.w; }
vec3 viewAt(vec2 uv) { return viewAt(uv, texture2D(tDepth, uv).x); }
void main() {
  float depth = texture2D(tDepth, vUv).x;
  if (depth >= 1.) { gl_FragColor = vec4(1., 0., 0., 1.); return; }
  vec3 p = viewAt(vUv, depth);
  // The surface normal from depth alone, taking each axis from the neighbour on the same surface.
  vec3 right = viewAt(vUv + vec2(texel.x, 0.)) - p, left = p - viewAt(vUv - vec2(texel.x, 0.));
  vec3 up = viewAt(vUv + vec2(0., texel.y)) - p, down = p - viewAt(vUv - vec2(0., texel.y));
  vec3 n = normalize(cross(abs(right.z) < abs(left.z) ? right : left, abs(up.z) < abs(down.z) ? up : down));
  vec2 reach = tuning.x * vec2(projection[0][0], projection[1][1]) * .5 / -p.z;
  reach *= min(1., tuning.w / reach.y);
  float turn = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  float shade = 0.;
  for (int i = 0; i < SAMPLES; i++) {
    float angle = turn + float(i) * 2.3999632;
    vec2 uv = vUv + vec2(cos(angle), sin(angle)) * sqrt((float(i) + .5) / float(SAMPLES)) * reach;
    float sampleDepth = texture2D(tDepth, uv).x;
    if (sampleDepth >= 1.) continue;
    vec3 v = viewAt(uv, sampleDepth) - p;
    float distance2 = dot(v, v);
    shade += max(0., dot(n, v) * inversesqrt(distance2 + 1e-9) - tuning.z) * max(0., 1. - distance2 / (tuning.x * tuning.x));
  }
  gl_FragColor = vec4(clamp(1. - tuning.y * shade * 2. / float(SAMPLES), 0., 1.), -p.z, 0., 1.);
}`;
// A 4×4 blur that only mixes texels at a similar depth, so the per-pixel sampling noise goes and edges stay.
const plateFragment = `
uniform sampler2D tOcclusion;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  float centre = texture2D(tOcclusion, vUv).y, sum = 0., weight = 0.;
  for (int x = 0; x < 4; x++) for (int y = 0; y < 4; y++) {
    vec2 tap = texture2D(tOcclusion, vUv + (vec2(float(x), float(y)) - 1.5) * texel).xy;
    float w = max(0., 1. - abs(tap.y - centre) * 80.) + 1e-4;
    sum += tap.x * w; weight += w;
  }
  gl_FragColor = vec4(vec3(sum / weight), 1.);
}`;

export function createViewmodelOcclusion(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const occlusionMaterial = new THREE.ShaderMaterial({
    defines: { SAMPLES: VIEW_OCCLUSION.samples }, depthTest: false, depthWrite: false,
    uniforms: { tDepth: { value: null }, projection: { value: new THREE.Matrix4() }, inverseProjection: { value: new THREE.Matrix4() }, texel: { value: new THREE.Vector2() },
      tuning: { value: new THREE.Vector4(VIEW_OCCLUSION.radius, VIEW_OCCLUSION.intensity, VIEW_OCCLUSION.bias, VIEW_OCCLUSION.reach) } },
    vertexShader: fullScreenVertex, fragmentShader: occlusionFragment,
  });
  const quad = new FullScreenQuad(occlusionMaterial);
  // Drawn at the far plane and kept only where something nearer was drawn: the gun and hands, never the world.
  // Transparent with the lowest order, so it lands after every opaque part and before any glass or effect.
  const plateMaterial = new THREE.ShaderMaterial({
    uniforms: { tOcclusion: { value: null }, texel: { value: new THREE.Vector2() } }, vertexShader: fullScreenVertex, fragmentShader: plateFragment,
    transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), plateMaterial);
  plate.name = 'viewmodel-occlusion'; plate.frustumCulled = false; plate.renderOrder = -1e6; plate.visible = false; plate.matrixAutoUpdate = false;
  scene.add(plate);
  let depthTarget: THREE.WebGLRenderTarget | null = null, occlusionTarget: THREE.WebGLRenderTarget | null = null;
  const size = new THREE.Vector2(), hidden: THREE.Object3D[] = [];
  function release() { depthTarget?.depthTexture?.dispose(); depthTarget?.dispose(); occlusionTarget?.dispose(); depthTarget = occlusionTarget = null; }
  function build(width: number, height: number) {
    release();
    depthTarget = new THREE.WebGLRenderTarget(width, height, { depthTexture: new THREE.DepthTexture(width, height) });
    occlusionTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
    occlusionMaterial.uniforms.tDepth.value = depthTarget.depthTexture; plateMaterial.uniforms.tOcclusion.value = occlusionTarget.texture;
    occlusionMaterial.uniforms.texel.value.set(1 / width, 1 / height); plateMaterial.uniforms.texel.value.set(1 / width, 1 / height);
  }
  return {
    /** Call just before the scene is drawn. Leaves the render target as it found it and reports whether the gun will be shaded. */
    prepare(enabled: boolean) {
      plate.visible = false;
      if (!enabled) return false;
      renderer.getDrawingBufferSize(size);
      const width = Math.max(1, Math.round(size.x * VIEW_OCCLUSION.scale)), height = Math.max(1, Math.round(size.y * VIEW_OCCLUSION.scale));
      if (depthTarget?.width !== width || depthTarget.height !== height) build(width, height);
      const target = renderer.getRenderTarget(), override = scene.overrideMaterial;
      hideNonOccluders(scene, hidden);
      scene.overrideMaterial = depthOnly;
      renderer.setRenderTarget(depthTarget); renderer.clear(); renderer.render(scene, camera);
      scene.overrideMaterial = override;
      for (const object of hidden) object.visible = true; hidden.length = 0;
      occlusionMaterial.uniforms.projection.value.copy(camera.projectionMatrix); occlusionMaterial.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      renderer.setRenderTarget(occlusionTarget); quad.render(renderer);
      renderer.setRenderTarget(target);
      return plate.visible = true;
    },
    dispose() { release(); plate.removeFromParent(); plate.geometry.dispose(); plateMaterial.dispose(); occlusionMaterial.dispose(); depthOnly.dispose(); quad.dispose(); },
  };
}
