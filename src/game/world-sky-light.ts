import * as THREE from 'three';

/**
 * Sky light: the hour's sky as an environment map, in place of the districts'
 * hemisphere light. A hemisphere light only knows up from down, so every wall
 * in shade gets the same flat colour whichever way it faces. The sky here has a
 * bluer zenith, a paler horizon, a glow round the sun, and sunlit ground below
 * that bounces warm light back up, so a shaded face turned towards the sun or
 * the street reads differently from one turned to the open sky.
 *
 * The sky part is scaled so walls receive on average what the hemisphere
 * light gave them: shade is redistributed between faces, not brightened. The
 * ground is lit by the actual sun, so bounce rises and falls with the key.
 * Colours are linear RGB.
 */
export type Rgb = readonly [number, number, number];
export interface SkyLightInput {
  /** The hemisphere's sky colour this frame: what an upward face should receive. */
  sky: Rgb;
  /** Fog/background colour, which the horizon leans towards. */
  horizon: Rgb;
  /** The hemisphere's ground colour, standing in for the ground's albedo. */
  ground: Rgb;
  /** Key light colour and the unit vector towards it. */
  key: Rgb; keyDirection: { x: number; y: number; z: number };
  /** Key intensity over fill intensity, as the scene's lights have them. */
  keyRatio: number;
}

export const SKY_WIDTH = 128, SKY_HEIGHT = 64;
/** Share of the ground in view that is in sun rather than in some building's shadow. */
const SUNLIT_GROUND = .5;
const ZENITH_TINT: Rgb = [.62, .78, 1.2], HORIZON_TINT: Rgb = [1.3, 1.24, 1.12];
const luminance = (c: Rgb) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
const WALLS = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i * Math.PI / 4), y: 0, z: Math.sin(i * Math.PI / 4) }));
const wallLuminance = (data: Float32Array, width: number, height: number) =>
  WALLS.reduce((sum, n) => sum + luminance(skyIrradiance(data, n, width, height)), 0) / WALLS.length;

/**
 * The sky as an equirectangular RGBA float image, rows from straight down to
 * straight up, in the layout three's equirectangular mapping samples.
 */
export function skyRadiance(input: SkyLightInput, width = SKY_WIDTH, height = SKY_HEIGHT) {
  const sky = new Float32Array(width * height * 4), ground = new Float32Array(width * height * 4);
  const { horizon, key, keyDirection: d } = input;
  const zenith = input.sky.map((v, i) => v * ZENITH_TINT[i]);
  const rim = input.sky.map((v, i) => (v + horizon[i]) * .5 * HORIZON_TINT[i]);
  const ratio = Math.max(0, Math.min(6, input.keyRatio));
  const bounce = input.ground.map((v, i) => v * (ratio * Math.max(0, d.y) * key[i] * SUNLIT_GROUND + input.sky[i]));
  const glowScale = .3 * ratio;
  for (let j = 0; j < height; j++) {
    const lat = ((j + .5) / height - .5) * Math.PI, y = Math.sin(lat), cos = Math.cos(lat);
    for (let i = 0; i < width; i++) {
      const lon = ((i + .5) / width - .5) * 2 * Math.PI, x = cos * Math.cos(lon), z = cos * Math.sin(lon);
      const k = (j * width + i) * 4;
      if (y >= 0) {
        const t = Math.sqrt(y), facing = Math.max(0, x * d.x + y * d.y + z * d.z);
        const glow = glowScale * (facing ** 8 * .7 + facing ** 2 * .5);
        for (let c = 0; c < 3; c++) sky[k + c] = rim[c] + (zenith[c] - rim[c]) * t + key[c] * glow;
      } else {
        // Just below the horizon the ground fades in from the sky's rim, so there is no seam.
        const fade = Math.min(1, -y / .08);
        for (let c = 0; c < 3; c++) { sky[k + c] = rim[c] * (1 - fade); ground[k + c] = bounce[c] * fade; }
      }
    }
  }
  const target = (luminance(input.sky) + luminance(input.ground)) / 2;
  const fromSky = wallLuminance(sky, width, height), fromGround = wallLuminance(ground, width, height);
  // Never so dim that open sky stops reading as the brighter half.
  const scale = fromSky > 1e-6 ? Math.max(.35, (target - fromGround) / fromSky) : 0;
  for (let k = 0; k < sky.length; k += 4) {
    for (let c = 0; c < 3; c++) sky[k + c] = sky[k + c] * scale + ground[k + c];
    sky[k + 3] = 1;
  }
  return sky;
}

/** Cosine-weighted irradiance on a face with normal `n`, from an image `skyRadiance` made: for tests and checks. */
export function skyIrradiance(data: Float32Array, n: { x: number; y: number; z: number }, width = SKY_WIDTH, height = SKY_HEIGHT): Rgb {
  const out = [0, 0, 0], texelSolidAngle = (2 * Math.PI / width) * (Math.PI / height);
  for (let j = 0; j < height; j++) {
    const lat = ((j + .5) / height - .5) * Math.PI, y = Math.sin(lat), cos = Math.cos(lat);
    for (let i = 0; i < width; i++) {
      const lon = ((i + .5) / width - .5) * 2 * Math.PI, facing = cos * Math.cos(lon) * n.x + y * n.y + cos * Math.sin(lon) * n.z;
      if (facing <= 0) continue;
      const k = (j * width + i) * 4, w = facing * cos * texelSolidAngle / Math.PI;
      for (let c = 0; c < 3; c++) out[c] += data[k + c] * w;
    }
  }
  return out as unknown as Rgb;
}

/** Quantised so the sky is rebuilt when the light visibly changes, not on every frame of a slow blend. */
function signature(input: SkyLightInput) {
  const q = (v: number) => Math.round(v * 48);
  return [...input.sky, ...input.horizon, ...input.ground, ...input.key].map(q).join(',') +
    `|${q(input.keyDirection.x)},${q(input.keyDirection.y)},${q(input.keyDirection.z)}|${Math.round(input.keyRatio * 20)}`;
}

const REBUILD_SECONDS = .3;

export function createSkyLight(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const half = new Uint16Array(SKY_WIDTH * SKY_HEIGHT * 4);
  const image = new THREE.DataTexture(half, SKY_WIDTH, SKY_HEIGHT, THREE.RGBAFormat, THREE.HalfFloatType);
  image.mapping = THREE.EquirectangularReflectionMapping; image.colorSpace = THREE.LinearSRGBColorSpace;
  image.magFilter = image.minFilter = THREE.LinearFilter; image.generateMipmaps = false;
  const original = scene.environment, originalIntensity = scene.environmentIntensity;
  let target: THREE.WebGLRenderTarget | null = null, last = '', wait = 0, disposed = false;
  return {
    /** Rebuilds the sky when the light has moved on, and sets how bright it lights the scene. */
    update(input: SkyLightInput, fillIntensity: number, dt: number) {
      if (disposed) return;
      // Matches three's hemisphere light, whose irradiance is its colour times its intensity over π.
      scene.environmentIntensity = fillIntensity / Math.PI;
      wait -= dt;
      const next = signature(input);
      if (next === last || (target && wait > 0)) return;
      last = next; wait = REBUILD_SECONDS;
      const radiance = skyRadiance(input);
      for (let i = 0; i < radiance.length; i++) half[i] = THREE.DataUtils.toHalfFloat(radiance[i]);
      image.needsUpdate = true;
      target = pmrem.fromEquirectangular(image, target ?? undefined);
      scene.environment = target.texture;
    },
    dispose() {
      if (disposed) return; disposed = true;
      scene.environment = original; scene.environmentIntensity = originalIntensity;
      target?.dispose(); image.dispose(); pmrem.dispose();
    },
  };
}
