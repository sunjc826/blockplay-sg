import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Direction } from './world-lighting';

export type SunRayQuality = 'off' | 'low' | 'high';
export interface SunRayLight { direction: Direction; color: string; elevation: number; sunlight: number; reduced: boolean }
/** Display-space light added over unobstructed sky, for lens visibility tests. */
export interface SunRayOverlay { texture: THREE.Texture; color: THREE.Color }
export const SUN_RAY_BUDGET = { low: { scale: .25, samples: 32 }, high: { scale: .5, samples: 48 } } as const;
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

/** A direction, not a world position: walking must not move the sun on screen. */
export function projectSunRays(camera: THREE.PerspectiveCamera, light: SunRayLight | undefined, uv: THREE.Vector2) {
  if (!light || light.reduced || light.elevation <= 0 || light.sunlight <= .05) return 0;
  const d = light.direction, m = camera.matrixWorldInverse.elements;
  const x = m[0] * d.x + m[4] * d.y + m[8] * d.z;
  const y = m[1] * d.x + m[5] * d.y + m[9] * d.z;
  const z = m[2] * d.x + m[6] * d.y + m[10] * d.z;
  if (z >= -.01) return 0;
  const p = camera.projectionMatrix.elements;
  uv.set((p[0] * x / -z - p[8]) * .5 + .5, (p[5] * y / -z - p[9]) * .5 + .5);
  // Fade before leaving the image; never clamp a hidden sun to a screen edge.
  const edge = Math.max(Math.abs(uv.x - .5), Math.abs(uv.y - .5));
  return (1 - smooth(.42, .62, edge)) * smooth(0, 6, light.elevation) * light.sunlight * light.sunlight * .8;
}
const vertexShader = /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
const inside = /* glsl */`float inside(vec2 p){return step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);}`;

/** Depth-mask radial scattering. Two reduced-resolution buffers, three fullscreen
 * draws, and no extra scene render. Composites after tone mapping, before the
 * weapon/HUD, so the separately cleared sky cannot be overexposed.
 * Technique: GPU Gems 3, chapter 13; the source mask comes from existing depth.
 */
export function createSunRays(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const mask = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const rays = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const uniforms = {
    tDepth: { value: null as THREE.DepthTexture | null }, tMask: { value: mask.texture }, tRays: { value: rays.texture },
    sunUv: { value: new THREE.Vector2() }, aspect: { value: 1 }, texel: { value: new THREE.Vector2() },
    rayColor: { value: new THREE.Color() }, samples: { value: 32 },
    near: { value: camera.near }, far: { value: camera.far },
  };
  const material = (fragmentShader: string) => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
  const maskMaterial = material(/* glsl */`
    varying vec2 vUv; uniform sampler2D tDepth; uniform vec2 sunUv,texel; uniform float aspect;
    void main(){
      // Conservative depth taps retain thin silhouettes when downsampling.
      float d=min(min(texture2D(tDepth,vUv+texel*vec2(-.5,-.5)).r,texture2D(tDepth,vUv+texel*vec2(.5,-.5)).r),
                  min(texture2D(tDepth,vUv+texel*vec2(-.5,.5)).r,texture2D(tDepth,vUv+texel*vec2(.5,.5)).r));
      float glow=pow(max(0.0,1.0-length((vUv-sunUv)*vec2(aspect,1.0))/.32),2.0);
      gl_FragColor=vec4(vec3(step(.999999,d)*glow),1.0);
    }`);
  const scatterMaterial = material(/* glsl */`
    varying vec2 vUv; uniform sampler2D tMask; uniform vec2 sunUv; uniform float samples;
    ${inside}
    void main(){
      vec2 delta=(sunUv-vUv)*.96/samples;
      // Stable subpixel staggering breaks radial bands without temporal noise.
      float jitter=fract(dot(gl_FragCoord.xy,vec2(.75487766,.56984029)));
      vec2 p=vUv+delta*jitter; float sum=0.0,weight=1.0,total=0.0;
      for(int i=0;i<48;i++){
        if(float(i)>=samples)break;
        sum+=texture2D(tMask,p).r*weight*inside(p);total+=weight;
        p+=delta;weight*=.985;
      }
      gl_FragColor=vec4(vec3(sum/total),1.0);
    }`);
  const blendMaterial = material(/* glsl */`
    #include <packing>
    varying vec2 vUv; uniform sampler2D tDepth,tRays; uniform vec3 rayColor; uniform float near,far;
    void main(){
      float d=texture2D(tDepth,vUv).r;
      float distanceToSurface=-perspectiveDepthToViewZ(d,near,far);
      // Short air paths in front of nearby walls receive very little scattering.
      float air=smoothstep(1.0,35.0,distanceToSurface);
      float ray=texture2D(tRays,vUv).r*air;
      gl_FragColor=vec4(rayColor*ray,0.0);
    }`);
  // Add a bounded display-space glow without changing canvas coverage.
  Object.assign(blendMaterial, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  maskMaterial.name = 'Sun ray mask'; scatterMaterial.name = 'Sun ray scatter'; blendMaterial.name = 'Sun ray composite';
  const quad = new FullScreenQuad(maskMaterial);
  const overlay: SunRayOverlay = { texture: rays.texture, color: uniforms.rayColor.value };
  return {
    overlay,
    get size() { return { width: mask.width, height: mask.height }; },
    render(picture: THREE.WebGLRenderTarget, depth: THREE.DepthTexture, quality: Exclude<SunRayQuality, 'off'>, light: SunRayLight, uv: THREE.Vector2, strength: number) {
      const budget = SUN_RAY_BUDGET[quality], w = Math.max(1, Math.ceil(picture.width * budget.scale)), h = Math.max(1, Math.ceil(picture.height * budget.scale));
      if (mask.width !== w || mask.height !== h) { mask.setSize(w, h); rays.setSize(w, h); }
      uniforms.tDepth.value = depth; uniforms.texel.value.set(1 / picture.width, 1 / picture.height);
      uniforms.sunUv.value.copy(uv); uniforms.aspect.value = camera.aspect; uniforms.samples.value = budget.samples;
      uniforms.rayColor.value.set(light.color).convertLinearToSRGB().multiplyScalar(strength * .35);
      uniforms.near.value = camera.near; uniforms.far.value = camera.far;
      const auto = renderer.autoClear; renderer.autoClear = false;
      try {
        quad.material = maskMaterial; renderer.setRenderTarget(mask); quad.render(renderer);
        quad.material = scatterMaterial; renderer.setRenderTarget(rays); quad.render(renderer);
        quad.material = blendMaterial; renderer.setRenderTarget(null); quad.render(renderer);
      } finally { renderer.autoClear = auto; }
    },
    dispose() { mask.dispose(); rays.dispose(); maskMaterial.dispose(); scatterMaterial.dispose(); blendMaterial.dispose(); quad.dispose(); },
  };
}
