import * as THREE from 'three';

/**
 * Lightning for the thunderstorm: a forked bolt from the cloud base to the ground some way off, a
 * glow in the cloud round its top, and the numbers the rest of the frame takes from it (the sky's
 * pulse, the thunder's delay).
 *
 * A strike is a first stroke and up to three restrikes down the same channel within a third of a
 * second; the forks light on the first stroke only. That flicker stays in the bolt and its cloud
 * glow. What the whole scene gets (`sky`) is one smooth pulse, so the screen never strobes.
 * Reduced effects draw none of it.
 */
export const LIGHTNING_PERIOD = 23;
/** Seconds into each period at which the strike starts; `crossedLightning` (world-audio) fires on the same moment. */
export const LIGHTNING_PHASE = 1;
const STRIKE_SECONDS = .9, CLOUD_BASE = 250, MAX_SEGMENTS = 176;

const hash = (n: number, salt: number) => { const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453; return v - Math.floor(v); };
/** Which strike the clock is in, and seconds since it began (negative before the first). */
export const strikeClock = (time: number) => {
  const index = Math.floor((time - LIGHTNING_PHASE) / LIGHTNING_PERIOD);
  return { index, since: time - LIGHTNING_PHASE - index * LIGHTNING_PERIOD };
};

export interface Strike {
  /** Seconds after the start of each stroke; the first is 0. */
  strokes: number[];
  /** Inside the cloud: a glow with no channel to the ground. About one in four. */
  sheet: boolean;
  /** How far off the storm cell is, metres: sets the thunder's delay and loudness. The bolt is drawn nearer, inside the view. */
  distance: number;
  /** Where it is drawn: an offset from straight ahead in radians, and metres from the eye. */
  bearing: number; range: number;
  seed: number;
}
export function lightningStrike(index: number): Strike {
  const seed = index * 7 + 3, strokes = [0];
  for (let i = 1; i < 4; i++) if (hash(seed, i) < .62) strokes.push(strokes[strokes.length - 1] + .06 + hash(seed, i + 4) * .07);
  return { strokes, sheet: hash(seed, 9) < .25, distance: 350 + hash(seed, 10) ** 2 * 1700,
    bearing: (hash(seed, 11) - .5) * 1.6, range: 420 + hash(seed, 12) * 260, seed };
}

/** A strike's light `since` seconds in: the channel, its forks (first stroke only), and the smooth pulse for the sky. */
export function strikeFlash(strike: Strike, since: number, out = { bolt: 0, forks: 0, sky: 0 }) {
  out.bolt = out.forks = out.sky = 0;
  if (since < 0 || since > STRIKE_SECONDS) return out;
  for (const [i, at] of strike.strokes.entries()) {
    if (since < at) break;
    const stroke = Math.exp(-(since - at) / .045) * (i ? .55 + .35 * hash(strike.seed, 20 + i) : 1);
    out.bolt = Math.max(out.bolt, stroke); if (!i) out.forks = stroke;
  }
  // A fading afterglow holds the channel between strokes.
  out.bolt = Math.max(out.bolt, .22 * Math.exp(-since / .25));
  out.sky = Math.min(1, since / .05) * Math.exp(-Math.max(0, since - .05) / .28) * (strike.sheet ? .7 : 1);
  return out;
}

export interface BoltSegment { ax: number; ay: number; az: number; bx: number; by: number; bz: number; bright: number; trunk: boolean }
/**
 * The channel as line segments about the origin: a jagged trunk from the cloud base to `ground`
 * (metres below the base's 250), and a few forks that leave it downwards and die out in the air.
 */
export function buildBolt(seed: number, ground = 0): BoltSegment[] {
  const segments: BoltSegment[] = [];
  let salt = 0; const random = () => hash(seed, 40 + salt++);
  function channel(from: THREE.Vector3, to: THREE.Vector3, levels: number, sway: number, bright: number, fade: number, trunk: boolean) {
    let points = [from, to];
    for (let level = 0; level < levels; level++) {
      const next: THREE.Vector3[] = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], reach = a.distanceTo(b) * sway;
        // Mostly sideways: a channel wanders far more across than it doubles back.
        next.push(new THREE.Vector3((a.x + b.x) / 2 + (random() - .5) * reach, (a.y + b.y) / 2 + (random() - .5) * reach * .3, (a.z + b.z) / 2 + (random() - .5) * reach), b);
      }
      points = next;
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      segments.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, bright: bright * (1 - fade * (i - 1) / (points.length - 1)), trunk });
    }
    return points;
  }
  const foot = new THREE.Vector3((random() - .5) * 150, ground, (random() - .5) * 60);
  const trunk = channel(new THREE.Vector3(0, CLOUD_BASE, 0), foot, 6, .34, 1, 0, true);
  const forks = 2 + Math.floor(random() * 3);
  for (let f = 0; f < forks; f++) {
    const at = trunk[Math.floor((.12 + random() * .55) * (trunk.length - 1))], drop = (at.y - ground) * (.3 + random() * .4), side = random() < .5 ? -1 : 1;
    const tip = new THREE.Vector3(at.x + side * drop * (.35 + random() * .5), at.y - drop, at.z + (random() - .5) * drop * .5);
    const fork = channel(at, tip, 4, .36, .5, .75, false);
    // Now and then a fork forks again.
    if (random() < .45) { const from = fork[8]; channel(from, new THREE.Vector3(from.x - side * drop * .25, from.y - drop * .35, from.z + (random() - .5) * 20), 3, .36, .28, .8, false); }
  }
  return segments.slice(0, MAX_SEGMENTS);
}

/** Adds light and covers the separately drawn sky behind it by its own brightness (as the lamp halos do). */
const GLOW = { transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor } as const;

/** The drawn bolt and cloud glow. `update` takes the storm's clock; nothing shows outside a strike. */
export function createLightning(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'lightning'; root.visible = false; parent.add(root);
  const positions = new Float32Array(MAX_SEGMENTS * 18), looks = new Float32Array(MAX_SEGMENTS * 18);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  // Across the ribbon (-1 to 1), brightness, and 1 on the trunk.
  geometry.setAttribute('look', new THREE.BufferAttribute(looks, 3).setUsage(THREE.DynamicDrawUsage));
  const uniforms = { flash: { value: 0 }, forks: { value: 0 }, color: { value: new THREE.Color(.78, .86, 1) } };
  const material = new THREE.ShaderMaterial({ name: 'lightning-bolt', uniforms, ...GLOW, side: THREE.DoubleSide,
    vertexShader: `attribute vec3 look; varying vec3 vLook; void main() { vLook = look; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float flash, forks; uniform vec3 color; varying vec3 vLook;
      void main() { float x = abs(vLook.x), lit = vLook.y * mix(forks, flash, vLook.z);
        // A white-hot core a fifth of the ribbon wide inside a soft blue sheath.
        vec3 c = (vec3(1.0) * exp(-x * x * 60.0) * 2.4 + color * pow(1.0 - x, 3.0) * .5) * lit;
        gl_FragColor = vec4(c, min(1.0, max(c.r, max(c.g, c.b)))); }` });
  const bolt = new THREE.Mesh(geometry, material); bolt.name = 'lightning-bolt'; bolt.frustumCulled = false; root.add(bolt);
  const glowMaterial = new THREE.ShaderMaterial({ name: 'lightning-glow', uniforms: { flash: { value: 0 }, color: uniforms.color }, ...GLOW, depthTest: true,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float flash; uniform vec3 color; varying vec2 vUv;
      void main() { float r = length(vUv); if (r > 1.0) discard;
        vec3 c = mix(color, vec3(1.0), .35) * pow(1.0 - r, 2.2) * flash; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }` });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial); glow.name = 'lightning-glow'; glow.frustumCulled = false; root.add(glow);
  root.traverse(o => { o.raycast = () => {}; o.userData.fpsEffect = true; });
  const flash = { bolt: 0, forks: 0, sky: 0 }, forward = new THREE.Vector3(), eye = new THREE.Vector3(), origin = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), side = new THREE.Vector3(), along = new THREE.Vector3(), toEye = new THREE.Vector3();
  let drawn = -1, strike: Strike | null = null, disposed = false;
  function place(camera: THREE.Camera, ground: number) {
    camera.getWorldPosition(eye); camera.getWorldDirection(forward);
    const angle = Math.atan2(forward.z, forward.x) + strike!.bearing;
    origin.set(eye.x + Math.cos(angle) * strike!.range, 0, eye.z + Math.sin(angle) * strike!.range);
    const segments = strike!.sheet ? [] : buildBolt(strike!.seed, ground);
    let v = 0;
    const corner = (p: THREE.Vector3, across: number, width: number, bright: number, trunk: boolean) => {
      positions[v * 3] = p.x + side.x * across * width; positions[v * 3 + 1] = p.y + side.y * across * width; positions[v * 3 + 2] = p.z + side.z * across * width;
      looks[v * 3] = across; looks[v * 3 + 1] = bright; looks[v * 3 + 2] = trunk ? 1 : 0; v++;
    };
    for (const s of segments) {
      a.set(s.ax + origin.x, s.ay, s.az + origin.z); b.set(s.bx + origin.x, s.by, s.bz + origin.z);
      // A ribbon facing the eye; each piece overruns its ends a little so the joints close.
      along.subVectors(b, a); toEye.subVectors(eye, a); side.crossVectors(along, toEye).normalize();
      const width = s.trunk ? 9 : 5.5; along.normalize().multiplyScalar(width * .25); a.sub(along); b.add(along);
      corner(a, -1, width, s.bright, s.trunk); corner(a, 1, width, s.bright, s.trunk); corner(b, 1, width, s.bright, s.trunk);
      corner(a, -1, width, s.bright, s.trunk); corner(b, 1, width, s.bright, s.trunk); corner(b, -1, width, s.bright, s.trunk);
    }
    geometry.setDrawRange(0, v); geometry.attributes.position.needsUpdate = geometry.attributes.look.needsUpdate = true;
    bolt.visible = v > 0;
    // The cloud lit from inside, round where the channel leaves it (or the whole of a sheet flash).
    const size = strike!.sheet ? 520 : 360;
    glow.position.set(origin.x, CLOUD_BASE + (strike!.sheet ? 20 : -10), origin.z); glow.scale.set(size * 1.5, size, 1); glow.lookAt(eye);
  }
  return {
    root,
    /** The strike showing, if any. */
    get strike() { return root.visible ? strike : null; },
    /**
     * `time` is the storm clock in seconds, `active` whether lightning is on (a thunderstorm, effects
     * not reduced), `ground` the ground's height thereabouts. Returns the sky's pulse, 0–1.
     */
    update(time: number, camera: THREE.Camera, active: boolean, ground = 0) {
      if (disposed) return 0;
      const { index, since } = strikeClock(time);
      if (!active || since < 0 || since > STRIKE_SECONDS) { root.visible = false; return 0; }
      if (drawn !== index || !strike) { strike = lightningStrike(index); drawn = index; place(camera, ground); }
      strikeFlash(strike, since, flash);
      uniforms.flash.value = flash.bolt; uniforms.forks.value = flash.forks;
      glowMaterial.uniforms.flash.value = (strike.sheet ? .5 : .32) * Math.max(flash.bolt, flash.sky * .6);
      root.visible = true;
      return flash.sky;
    },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); glow.geometry.dispose(); glowMaterial.dispose(); },
  };
}
