import * as THREE from 'three';
import { LIGHT_BLENDING } from './light-blending';

/**
 * Marina Bay after dark: the Supertrees' light programmes, the Flyer's rims,
 * and the bay show's fountains and lasers. district-set-pieces drives them
 * from the world clock; this module holds what they look like.
 *
 * Every light here adds to what is behind it and leaves the sky's alpha alone
 * (LIGHT_BLENDING), so none of it shows a dark fringe against the night sky.
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/** Colour pairs the shows step through: a main colour and the one it plays against. Neighbours, not clashes. */
export const SHOW_PALETTE = ([
  ['#ffb347', '#ff5f9e'], ['#3fc8ff', '#8a6bff'], ['#ffe2b0', '#ffaa3c'],
  ['#4ff0c0', '#3f86ff'], ['#ff6b5a', '#ffd45a'], ['#c27dff', '#ff8fcf'],
] as const).map(([a, b]) => [new THREE.Color(a), new THREE.Color(b)] as const);
/** Laser colours: mostly the green a show laser is, with cyan, white and violet between. */
const LASER_COLOURS = ['#36ff74', '#43e0ff', '#36ff74', '#e4fff4', '#9a6bff'].map(c => new THREE.Color(c));

/**
 * Which step of a sequence that moves on every `period` seconds `time` falls
 * in, and how far it has crossfaded into the next: the last `fade` seconds of
 * each step blend into the one after, so nothing ever cuts.
 */
export function showStep(time: number, period: number, fade: number) {
  const index = Math.floor(time / period);
  return { index, blend: smooth((time - index * period - (period - fade)) / fade) };
}
/** Palette pair `index` crossfaded `blend` of the way to the next, written into `a` and `b`. */
export function paletteAt(index: number, blend: number, a: THREE.Color, b: THREE.Color) {
  const n = SHOW_PALETTE.length, from = SHOW_PALETTE[((index % n) + n) % n], to = SHOW_PALETTE[(((index + 1) % n) + n) % n];
  a.copy(from[0]).lerp(to[0], blend); b.copy(from[1]).lerp(to[1], blend);
}

const NOISE = `float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
const DITHER = `(fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255.0`;

/** Pixels per metre at one metre away, for the camera drawing `target` (or the canvas). */
function pixelScale(renderer: THREE.WebGLRenderer, camera: THREE.Camera, size: THREE.Vector2) {
  const height = renderer.getRenderTarget()?.height ?? renderer.getDrawingBufferSize(size).y;
  const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 60;
  return height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
}

// ---------------------------------------------------------------- Light strings

export interface StringLight { x: number; y: number; z: number; size: number }
/**
 * Many small lamps along a frame, drawn as soft points that run together into
 * a lit line. Points too small to see at a distance are dimmed rather than
 * held at a minimum size, so a far tree glows evenly instead of sparkling.
 * `setColour` takes linear RGB already scaled by brightness.
 */
export function createLightString(lights: readonly StringLight[]) {
  const geometry = new THREE.BufferGeometry(), colours = new Float32Array(lights.length * 3);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lights.flatMap(l => [l.x, l.y, l.z]), 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(lights.map(l => l.size), 1));
  geometry.setAttribute('colour', new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 600 }, level: { value: 1 } },
    vertexShader: `uniform float scale, level; attribute float size; attribute vec3 colour; varying vec3 vColour;
      void main() { vec4 view = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * view;
        float wanted = scale * size / max(1.0, -view.z), shown = clamp(wanted, 3.0, 90.0);
        gl_PointSize = shown; vColour = colour * level * max(.3, wanted / shown); }`,
    fragmentShader: `varying vec3 vColour;
      void main() { float r = length(gl_PointCoord - .5) * 2.0; if (r > 1.0) discard;
        float glow = exp(-r * r * 9.0) + pow(1.0 - r, 2.0) * .25;
        gl_FragColor = vec4(vColour * glow + ${DITHER}, 1.0); }`,
    ...LIGHT_BLENDING,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; points.raycast = () => {}; points.renderOrder = 2;
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer, _scene, camera) => { material.uniforms.scale.value = pixelScale(renderer, camera, size); };
  const attribute = geometry.getAttribute('colour') as THREE.BufferAttribute;
  return {
    points, geometry, material,
    setColour(i: number, colour: THREE.Color) { colours[i * 3] = colour.r; colours[i * 3 + 1] = colour.g; colours[i * 3 + 2] = colour.b; },
    commit() { attribute.needsUpdate = true; },
  };
}

/** A lamp on a Supertree, and where on the tree it sits, for the programmes to work from. */
export interface TreeLight extends StringLight {
  tree: number;
  /** 0 at the foot of the trunk, 1 at the canopy's rim. */
  rise: number;
  /** Round the trunk, radians. */
  angle: number;
  seed: number;
}
/**
 * Lamps along each Supertree's frame as marina-scene builds it: the twelve ribs
 * up the trunk, the branches out to the canopy, their forks, and the rim.
 */
export function supertreeLights(trees: readonly (readonly [number, number, number])[]): TreeLight[] {
  const lights: TreeLight[] = [];
  let seed = 0;
  const run = (tree: number, a: THREE.Vector3, b: THREE.Vector3, step: number, size: number, rise: (t: number) => number, angle: number) => {
    const n = Math.max(1, Math.round(a.distanceTo(b) / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      lights.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, size, tree, rise: rise(t), angle, seed: (seed++ * .6180339) % 1 });
    }
  };
  trees.forEach(([x, z, r], tree) => {
    const at = (radius: number, y: number, angle: number) => new THREE.Vector3(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      run(tree, at(2.1, 1, a), at(2.5, 17, a), .8, .7, t => t * .55, a);
      run(tree, at(2.5, 17.4, a), at(r * .58, 22, a), .7, .8, t => .55 + t * .2, a);
      run(tree, at(r * .58, 22, a), at(r, 25, a), .7, .8, t => .75 + t * .25, a);
      for (const fork of [-.16, .16]) run(tree, at(r * .7, 22, a), at(r + 2, 26, a + fork), .75, .75, t => .8 + t * .2, a + fork);
    }
    const around = Math.round(Math.PI * 2 * r / .7);
    for (let i = 0; i < around; i++) { const a = i / around * Math.PI * 2, p = at(r, 25.1, a); lights.push({ x: p.x, y: p.y, z: p.z, size: .9, tree, rise: 1, angle: a, seed: (seed++ * .6180339) % 1 }); }
  });
  return lights;
}

/**
 * How one Supertree lamp shows under programme `programme` at `time`: `mix`
 * from the main colour (0) to its partner (1), and brightness `level`. Slow
 * washes and climbs, the way the gardens' show runs, not a disco chase.
 */
export function supertreeProgramme(programme: number, light: TreeLight, time: number) {
  switch (((programme % 4) + 4) % 4) {
    // One colour breathing over the whole tree, the partner gathering at the rim.
    case 0: return { mix: smooth((light.rise - .7) / .3) * (.5 + .5 * Math.sin(time * .5 + light.tree)), level: .75 + .25 * Math.sin(time * .8 + light.tree * 1.3) };
    // A colour climbs the trunk and spills out over the canopy; the next climb brings the other one back up.
    case 1: {
      const cycle = time * .18 + light.tree * .2, n = Math.floor(cycle / 1.5), front = cycle - n * 1.5 - .25, filled = smooth((front - light.rise) / .18 + .5);
      return { mix: n % 2 ? 1 - filled : filled, level: .65 + .35 * smooth(1 - Math.abs(front - light.rise) / .25) };
    }
    // Three slices of colour turning slowly round the canopy; the trunk holds still.
    case 2: return { mix: light.rise < .55 ? 0 : .5 + .5 * Math.sin(light.angle * 3 - time * .7 + light.tree), level: .8 };
    // A soft shimmer: each lamp swells now and then over a second or so, never a strobe.
    default: return { mix: light.rise * .4, level: .55 + .45 * Math.pow(Math.max(0, Math.sin(time * 1.1 + light.seed * 40)), 8) };
  }
}

// ---------------------------------------------------------------- Fountains

/**
 * A row of fountain jets lit from below: each a billboard turned to face the
 * camera round its own upright, drawn as a narrow jet opening into spray,
 * a sheath of water falling back round it, mist at the crown and foam where
 * it leaves the water. Scale an instance by (width, height); colour it with
 * the light it is lit by.
 */
export function createFountainJets(count: number) {
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, level: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vLight; varying float vHeight, vSeed;
      void main() {
        mat4 world = modelMatrix * instanceMatrix;
        vec3 base = (world * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float width = length((world * vec4(1.0, 0.0, 0.0, 0.0)).xyz), height = length((world * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        vec3 toCamera = cameraPosition - base; toCamera.y = 0.0;
        vec3 across = normalize(vec3(toCamera.z, 0.0, -toCamera.x) + vec3(1e-5, 0.0, 0.0));
        vec3 p = base + across * position.x * width + vec3(0.0, position.y * height, 0.0);
        vUv = vec2(position.x * 2.0, position.y); vHeight = height; vSeed = base.x * .37 + base.z * .11;
        #ifdef USE_INSTANCING_COLOR
          vLight = instanceColor;
        #else
          vLight = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float time, level; varying vec2 vUv; varying vec3 vLight; varying float vHeight, vSeed;
      ${NOISE}
      void main() {
        float x = vUv.x, y = vUv.y, metres = y * vHeight;
        // The crown is rounded: the spray stops lower the further it is from the jet, and fades well inside the quad.
        float crown = 1.0 - smoothstep(.62, .9, y + .3 * x * x);
        // The jet leaves the nozzle narrow and opens into spray as it slows near the top.
        float spread = mix(.05, .42, pow(max(y, 0.0), 1.7));
        float jet = exp(-2.5 * (x / spread) * (x / spread));
        float rising = .5 + .6 * noise(vec3(x / spread * 4.0 + vSeed, metres * .5 - time * 7.0, vSeed));
        // Water falling back round the jet, widest under the crown.
        float shell = mix(.2, .6, smoothstep(0.0, 1.0, y)), sheathWidth = .1 + .16 * y;
        float off = (abs(x) - shell) / sheathWidth, sheath = exp(-off * off) * smoothstep(.1, .8, y);
        float falling = .3 + .7 * noise(vec3(x * 11.0 + vSeed * 3.0, metres * .7 + time * 5.0, 2.0));
        // Mist at the crown, and white water churned up where the jet leaves the bay.
        float mist = exp(-2.5 * x * x) * smoothstep(.45, .75, y) * (.6 + .4 * noise(vec3(x * 3.0, metres * .3 - time, vSeed)));
        float foam = exp(-3.0 * (x / .35) * (x / .35)) * exp(-metres / 1.4);
        // Lit from the nozzle: brightest low down, the crown catching only what reaches it.
        float lit = mix(1.3, .5, y);
        float water = (jet * rising + sheath * falling * .3 + mist * .28) * lit * crown + foam * .7;
        gl_FragColor = vec4(mix(vec3(1.0), vLight, .6) * water * level + ${DITHER}, 1.0);
      }`,
    ...LIGHT_BLENDING,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.raycast = () => {};
  mesh.setColorAt(0, new THREE.Color()); mesh.renderOrder = 2;
  return { mesh, geometry, material };
}

/**
 * Jet `i` of `count`, in metres, under choreography `pattern`: a wave running
 * down the line, a swell from the middle outwards, alternate jets answering
 * each other, and an irregular dance.
 */
export function fountainHeight(pattern: number, i: number, count: number, time: number) {
  const middle = (count - 1) / 2;
  const swing = [
    Math.sin(time * 1.1 - i * .6),
    Math.sin(time * .9 - Math.abs(i - middle) * .9),
    Math.sin(time * .8 + (i % 2) * Math.PI),
    Math.sin(time * .9 + i * .55 + Math.sin(time * .2) * 2),
  ][((pattern % 4) + 4) % 4];
  return 5 + 25 * (.5 + .5 * swing);
}

// ---------------------------------------------------------------- Lasers

/**
 * A laser in haze: a thin bright line with a faint glow of scattered light
 * round it, drawn on a ribbon that turns to face the camera along the beam.
 * Too thin to cover a pixel, it is drawn a pixel wide and dimmed by as much,
 * so a distant beam stays a steady line instead of breaking into dashes.
 * The mesh's position is the emitter, its +Y the beam, its Y scale the length.
 */
export function createLaserBeams() {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 48).translate(0, .5, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      colour: { value: new THREE.Color('#36ff74') }, strength: { value: 0 }, time: { value: 0 },
      pixel: { value: .002 }, core: { value: .04 }, glow: { value: .6 }, fogNear: { value: 150 }, fogFar: { value: 750 },
    },
    vertexShader: `uniform float pixel, core, glow; varying float vAcross, vCore, vGlow, vAlong, vSine, vDistance; varying vec3 vWorld;
      void main() {
        vec3 start = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, span = (modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
        vec3 axis = normalize(span), p = start + span * position.y, toCamera = cameraPosition - p;
        float distance = length(toCamera); toCamera /= max(distance, 1e-3);
        vec3 side = cross(axis, toCamera); float sine = length(side);
        side = sine > 1e-4 ? side / sine : normalize(cross(axis, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
        vCore = max(core, pixel * distance); vGlow = max(glow, pixel * distance * 4.0);
        float halfWidth = vGlow * 2.2;
        p += side * position.x * 2.0 * halfWidth;
        vAcross = position.x * 2.0 * halfWidth; vAlong = position.y; vSine = sine; vDistance = distance; vWorld = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 colour; uniform float strength, time, core, glow, fogNear, fogFar;
      varying float vAcross, vCore, vGlow, vAlong, vSine, vDistance; varying vec3 vWorld;
      ${NOISE}
      void main() {
        float line = core / vCore * exp(-2.0 * (vAcross / vCore) * (vAcross / vCore));
        float scatter = .06 * min(1.0, glow / vGlow) * exp(-2.0 * (vAcross / vGlow) * (vAcross / vGlow));
        // Looking down a beam you see more of the haze it lights.
        float path = min(1.0 / max(vSine, .06), 5.0);
        float reach = (1.0 - smoothstep(.45, 1.0, vAlong)) * (.65 + .35 * exp(-vAlong * 8.0));
        float dust = .7 + .45 * noise(vWorld * .06 + vec3(0.0, -time * .4, time * .2));
        float fogged = clamp((vDistance - fogNear) / max(1.0, fogFar * 1.6 - fogNear), 0.0, 1.0), haze = 1.0 - .7 * fogged * fogged * (3.0 - 2.0 * fogged);
        gl_FragColor = vec4(colour * strength * (line + scatter * dust) * path * reach * haze + ${DITHER}, 1.0);
      }`,
    ...LIGHT_BLENDING,
  });
  const size = new THREE.Vector2();
  const beam = () => {
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.raycast = () => {}; mesh.renderOrder = 2;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      material.uniforms.pixel.value = 1 / pixelScale(renderer, camera, size);
      if (scene.fog instanceof THREE.Fog) { material.uniforms.fogNear.value = scene.fog.near; material.uniforms.fogFar.value = scene.fog.far; }
    };
    return mesh;
  };
  return { geometry, material, beam };
}

/** Laser colour for show segment `index`, crossfaded `blend` into the next. */
export function laserColour(index: number, blend: number, into: THREE.Color) {
  const n = LASER_COLOURS.length;
  return into.copy(LASER_COLOURS[index % n]).lerp(LASER_COLOURS[(index + 1) % n], blend);
}

/**
 * Where beam `k` of an emitter's four points under `pattern`, as yaw and pitch
 * in radians: yaw 0 is due west over the bay, pitch 0 level. A fan opening and
 * closing, a sweep together, a cone turning, and the two emitters crossing.
 */
export function laserAim(pattern: number, emitter: number, k: number, time: number) {
  const offset = k - 1.5, side = emitter ? -1 : 1;
  switch (((pattern % 4) + 4) % 4) {
    case 0: { const spread = .12 + .09 * Math.sin(time * .7); return { yaw: offset * spread + side * .12, pitch: -.1 + .05 * Math.sin(time * .9 + k) }; }
    case 1: return { yaw: .4 * Math.sin(time * .55) + offset * .045, pitch: -.06 + .16 * (.5 + .5 * Math.sin(time * .35 + emitter)) };
    case 2: { const a = k * Math.PI / 2 + time * 1.1 + emitter * Math.PI / 4; return { yaw: side * .1 + .2 * Math.cos(a), pitch: .06 + .16 * Math.sin(a) }; }
    default: return { yaw: side * (.26 + .14 * Math.sin(time * .5)) + offset * .06, pitch: -.13 + .07 * Math.sin(time * .8 + k) };
  }
}
/** A yaw and pitch from laserAim as a unit direction. */
export function aimDirection(aim: { yaw: number; pitch: number }, into: THREE.Vector3) {
  const flat = Math.cos(aim.pitch);
  return into.set(-flat * Math.cos(aim.yaw), Math.sin(aim.pitch), -flat * Math.sin(aim.yaw));
}
