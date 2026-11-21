import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Direction } from './world-lighting';

export type SunRayQuality = 'off' | 'low' | 'high';
export interface SunRayLight {
  direction: Direction; color: string; elevation: number; sunlight: number; reduced: boolean;
  /** Once the sun is down: how far the moon has taken over as the key light, 0–1. `direction` and `color` are then the moon's. */
  moon?: number;
}
/** Display-space light added over unobstructed sky, for lens visibility tests. */
export interface SunRayOverlay { texture: THREE.Texture; color: THREE.Color }
export const SUN_RAY_BUDGET = { low: { scale: .25, samples: 32 }, high: { scale: .5, samples: 48 } } as const;
/** Screen heights: the sun's disc and halo radii, the halo's share of the disc's brightness, and how fast the light fades
 * with distance from the sun: `glow` (at `glowLevel`) when the source is in clear sky, `falloff` for the beams once something
 * partly hides it. Beams start `hollow` out from the sun: the sky and the lens flare already draw its glare, and more light there only hides them. */
const SOURCE = { core: .07, halo: .5, haloLevel: .5, falloff: 1.9, glow: 6, glowLevel: .35, hollow: .08 } as const;
/** The hidden share of the source over which the long beams take over from the tight glow. */
const BEAMS = { from: .04, full: .3 } as const;
const glsl = (value: number) => value.toFixed(4);
/** Display-space strength of a fully lit shaft before its falloff, and before the hour and weather scale it. */
const RAY_GAIN = .6;
/** A full moon's shafts as a share of the sun's: enough to read against a night sky without lighting it. */
const MOON_SHARE = .5;
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

/** Moon shafts fade in as the moon takes over the key light (sun below −4°) and are full by −10°. */
export const moonRayAmount = (sunElevation: number) => Math.max(0, Math.min(1, (-4 - sunElevation) / 6));
/** A direction, not a world position: walking must not move the sun on screen. */
export function projectSunRays(camera: THREE.PerspectiveCamera, light: SunRayLight | undefined, uv: THREE.Vector2) {
  if (!light || light.reduced || light.sunlight <= .05) return 0;
  // By day the sun's height sets the strength; after dark only a risen moon throws shafts.
  const height = light.elevation > 0 ? smooth(0, 3, light.elevation) : Math.max(0, Math.min(1, light.moon ?? 0)) * MOON_SHARE;
  if (height <= 0) return 0;
  const d = light.direction, m = camera.matrixWorldInverse.elements;
  const x = m[0] * d.x + m[4] * d.y + m[8] * d.z;
  const y = m[1] * d.x + m[5] * d.y + m[9] * d.z;
  const z = m[2] * d.x + m[6] * d.y + m[10] * d.z;
  if (z >= -.01) return 0;
  const p = camera.projectionMatrix.elements;
  uv.set((p[0] * x / -z - p[8]) * .5 + .5, (p[5] * y / -z - p[9]) * .5 + .5);
  // A sun just outside the image still throws shafts across it (the scatter pass only counts the
  // part of its glow that is on screen); never clamp a hidden sun to a screen edge.
  const edge = Math.max(Math.abs(uv.x - .5), Math.abs(uv.y - .5));
  return (1 - smooth(.46, .9, edge)) * height * light.sunlight * light.sunlight * .8;
}
const vertexShader = /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
const inside = /* glsl */`float inside(vec2 p){return step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);}`;
/** What throws the shafts, by distance from the sun in screen heights: a small hot disc that cuts
 * crisp streaks when something crosses it, and a wide dim halo so foliage beside the sun streaks too. */
const source = /* glsl */`float source(float r){float halo=max(0.0,1.0-r/${glsl(SOURCE.halo)});return max(1.0-smoothstep(${glsl(SOURCE.core * .5)},${glsl(SOURCE.core)},r),${glsl(SOURCE.haloLevel)}*halo*halo);}`;

/** Depth-mask radial scattering. Two reduced-resolution buffers and a single pixel, three fullscreen
 * draws and one one-pixel draw, and no extra scene render. Composites after tone mapping, before the
 * weapon/HUD, so the separately cleared sky cannot be overexposed.
 * Technique: GPU Gems 3, chapter 13; the source mask comes from existing depth.
 * Unlike the original, each pixel's march is normalised by the same march over open sky, so a
 * shaft's brightness is (share of the source it can see, sharpened) × (an authored falloff with distance),
 * instead of thinning with the share of the march that happens to cross the source.
 * The falloff is short while the whole source is in clear sky, where there are no beams to show and a
 * long one only reads as a second, larger lens flare; it lengthens as scenery covers part of the source.
 */
export function createSunRays(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const mask = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const rays = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const cover = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const uniforms = {
    tDepth: { value: null as THREE.DepthTexture | null }, tMask: { value: mask.texture }, tRays: { value: rays.texture }, tCover: { value: cover.texture },
    sunUv: { value: new THREE.Vector2() }, aspect: { value: 1 }, texel: { value: new THREE.Vector2() },
    rayColor: { value: new THREE.Color() }, samples: { value: 32 },
    near: { value: camera.near }, far: { value: camera.far },
  };
  const material = (fragmentShader: string) => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
  const maskMaterial = material(/* glsl */`
    varying vec2 vUv; uniform sampler2D tDepth; uniform vec2 texel;
    void main(){
      // Open sky only. Conservative depth taps retain thin silhouettes when downsampling.
      float d=min(min(texture2D(tDepth,vUv+texel*vec2(-.5,-.5)).r,texture2D(tDepth,vUv+texel*vec2(.5,-.5)).r),
                  min(texture2D(tDepth,vUv+texel*vec2(-.5,.5)).r,texture2D(tDepth,vUv+texel*vec2(.5,.5)).r));
      gl_FragColor=vec4(vec3(step(.999999,d)),1.0);
    }`);
  const coverMaterial = material(/* glsl */`
    uniform sampler2D tMask; uniform vec2 sunUv; uniform float aspect;
    ${inside}
    ${source}
    void main(){
      // One pixel: the share of the source on screen that is open sky, over a spiral across the disc and halo.
      float seen=0.0,whole=0.0;
      for(int i=0;i<64;i++){
        float r=${glsl(SOURCE.halo)}*(float(i)+.5)/64.0,a=float(i)*2.39996323;
        vec2 p=sunUv+vec2(cos(a)/aspect,sin(a))*r; float w=source(r)*inside(p);
        seen+=texture2D(tMask,p).r*w;whole+=w;
      }
      gl_FragColor=vec4(vec3(whole>0.0?seen/whole:1.0),1.0);
    }`);
  const scatterMaterial = material(/* glsl */`
    varying vec2 vUv; uniform sampler2D tMask,tCover; uniform vec2 sunUv; uniform float samples,aspect;
    ${inside}
    ${source}
    void main(){
      vec2 fromSun=vUv-sunUv; float reach=length(fromSun*vec2(aspect,1.0));
      // Stable subpixel staggering breaks radial bands without temporal noise.
      float jitter=fract(dot(gl_FragCoord.xy,vec2(.75487766,.56984029)));
      float seen=0.0,whole=0.0;
      for(int i=0;i<48;i++){
        if(float(i)>=samples)break;
        // Squared spacing puts most taps on the source, next to the sun; the weight u restores an even measure along the line.
        float u=(float(i)+jitter)/samples,t=u*u; vec2 p=sunUv+fromSun*t;
        float w=u*source(reach*t);
        // Source beyond the image edge counts as hidden: a sun leaving the view dims instead of shining through whatever is there.
        seen+=texture2D(tMask,p).r*inside(p)*w;whole+=w;
      }
      // Squared, so a partly hidden source reads as distinct beams and gaps; open sky stays at one.
      float lit=seen/max(whole,1e-4);
      float beams=smoothstep(${glsl(BEAMS.from)},${glsl(BEAMS.full)},1.0-texture2D(tCover,vec2(.5)).r);
      float glow=${glsl(SOURCE.glowLevel)}*exp(-reach*${glsl(SOURCE.glow)});
      float shafts=reach/(reach+${glsl(SOURCE.hollow)})*exp(-reach*${glsl(SOURCE.falloff)});
      gl_FragColor=vec4(vec3(lit*lit*mix(glow,shafts,beams)),1.0);
    }`);
  const blendMaterial = material(/* glsl */`
    #include <packing>
    varying vec2 vUv; uniform sampler2D tDepth,tRays; uniform vec3 rayColor; uniform float near,far;
    void main(){
      float d=texture2D(tDepth,vUv).r;
      float distanceToSurface=-perspectiveDepthToViewZ(d,near,far);
      // Only the first few metres of air are too short to scatter: shafts still fall across ground and trunks nearby,
      // at a reduced strength that keeps close scenery from washing out; a long view carries them in full.
      float air=smoothstep(.5,10.0,distanceToSurface)*(.45+.55*smoothstep(10.0,80.0,distanceToSurface));
      float ray=texture2D(tRays,vUv).r*air;
      gl_FragColor=vec4(rayColor*ray,0.0);
    }`);
  // Add a bounded display-space glow without changing canvas coverage.
  Object.assign(blendMaterial, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  maskMaterial.name = 'Sun ray mask'; coverMaterial.name = 'Sun ray cover'; scatterMaterial.name = 'Sun ray scatter'; blendMaterial.name = 'Sun ray composite';
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
      uniforms.rayColor.value.set(light.color).convertLinearToSRGB().multiplyScalar(strength * RAY_GAIN);
      uniforms.near.value = camera.near; uniforms.far.value = camera.far;
      const auto = renderer.autoClear; renderer.autoClear = false;
      try {
        quad.material = maskMaterial; renderer.setRenderTarget(mask); quad.render(renderer);
        quad.material = coverMaterial; renderer.setRenderTarget(cover); quad.render(renderer);
        quad.material = scatterMaterial; renderer.setRenderTarget(rays); quad.render(renderer);
        quad.material = blendMaterial; renderer.setRenderTarget(null); quad.render(renderer);
      } finally { renderer.autoClear = auto; }
    },
    dispose() { mask.dispose(); rays.dispose(); cover.dispose(); coverMaterial.dispose(); maskMaterial.dispose(); scatterMaterial.dispose(); blendMaterial.dispose(); quad.dispose(); },
  };
}
