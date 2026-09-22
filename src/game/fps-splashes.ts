/**
 * What a round does when it meets water, and what the water throws back.
 *
 * The physics this approximates, in the order a shot meets it:
 *
 * 1. **Skip or enter.** A bullet striking water at a grazing angle is turned
 *    by the pressure under its nose before it can bite, and skips off like a
 *    stone; steeper than a critical angle of a few degrees it goes in. Once in,
 *    a rifle round yaws and breaks up within about a metre, so for gameplay a
 *    round that enters the water stops there. `waterRicochet` decides which,
 *    and hands back the skipped direction: mirrored about the surface, with
 *    most of its climb bled off, because the water gives far less upward push
 *    than a hard floor would.
 *
 * 2. **The splash.** The round punches a cavity; the rim of that cavity rises
 *    as a crown of droplets thrown up and out, and when the cavity collapses it
 *    fires a narrow jet straight up the middle (a Worthington jet). A grazing
 *    shot does not dig a cavity so much as plough a furrow, so its spray is
 *    thrown forward along the direction of travel instead of symmetrically.
 *
 * 3. **The rings.** The disturbance leaves as ripples. Those are drawn twice:
 *    here as flat foam rings over the surface, which works on any water in any
 *    district; and, where the water has a shader surface, as real slope in the
 *    water itself (see `water.ts`).
 *
 * Droplets fly ballistically under gravity with a little air drag, and die when
 * they fall back through the surface they came from. Like `fps-impacts`, every
 * pool is a plain array with a hard ceiling and nothing here touches the scene.
 */
export interface SplashVector { x: number; y: number; z: number }

export interface Splash { x: number; y: number; z: number; age: number; life: number; size: number; spin: number }
export interface Droplet { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; floor: number; size: number }
export interface SplashField { splashes: Splash[]; droplets: Droplet[] }

export const MAX_SPLASHES = 12, MAX_DROPLETS = 180;
export const SPLASH_LIFE = 1.3, JET_LIFE = 0.5;
/** Crown droplets, plus the few that make up the jet up the middle. */
export const DROPLETS_PER_SPLASH = 18, JET_DROPLETS = 4;
/**
 * Grazing angle below which a round skips rather than enters, in radians.
 * Published figures for spitzer rifle bullets on calm water sit around 5–8°.
 */
export const WATER_CRITICAL_ANGLE = 6 * Math.PI / 180;
/** Fraction of a skipping round's climb that survives the bounce. */
export const SKIP_RESTITUTION = 0.3;
/** What a skip leaves of a round's damage. */
export const SKIP_ENERGY = 0.5;
/**
 * Drawn size of a droplet, in metres. Real spray is millimetres across and
 * would vanish below a pixel a few metres out; this is sized to be read at the
 * ranges shots land at, the way muzzle flash and sparks already are.
 */
export const DROPLET_SIZE = 0.07;
export const SPLASH_GRAVITY = 9.81;
const GRAVITY = SPLASH_GRAVITY, AIR_DRAG = 0.9;

export const createSplashField = (): SplashField => ({ splashes: [], droplets: [] });
export function clearSplashField(field: SplashField) { field.splashes.length = 0; field.droplets.length = 0; }

const unit = (v: SplashVector): SplashVector => {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 1e-9 ? { x: v.x / length, y: v.y / length, z: v.z / length } : { x: 0, y: -1, z: 0 };
};
const push = <T>(list: T[], item: T, ceiling: number) => {
  if (list.length >= ceiling) list.shift();
  list.push(item);
  return item;
};

/** Angle between a travelling round and the surface plane it meets, in radians. */
export function grazingAngle(direction: SplashVector, normal: SplashVector = { x: 0, y: 1, z: 0 }) {
  const d = unit(direction), n = unit(normal);
  return Math.asin(Math.min(1, Math.abs(d.x * n.x + d.y * n.y + d.z * n.z)));
}

/**
 * The direction a round leaves the water in, or null if it goes in. The part
 * of its motion along the surface is kept; the part into the surface is
 * mirrored and cut to `SKIP_RESTITUTION`, so a skip always climbs away shallower
 * than it arrived.
 */
export function waterRicochet(direction: SplashVector, normal: SplashVector = { x: 0, y: 1, z: 0 }, critical = WATER_CRITICAL_ANGLE): SplashVector | null {
  const d = unit(direction), n = unit(normal);
  const into = d.x * n.x + d.y * n.y + d.z * n.z;
  // Travelling away from the surface already: nothing to skip off.
  if (into >= 0) return null;
  if (Math.asin(Math.min(1, -into)) >= critical) return null;
  const along = { x: d.x - n.x * into, y: d.y - n.y * into, z: d.z - n.z * into };
  const lift = -into * SKIP_RESTITUTION;
  return unit({ x: along.x + n.x * lift, y: along.y + n.y * lift, z: along.z + n.z * lift });
}

/**
 * Records one splash at `point` on a surface whose height is `point.y`.
 * `direction` is the round's travel; `energy` scales the spray, as it does for
 * impacts, so a round weakened by cover splashes smaller.
 */
export function recordSplash(field: SplashField, point: SplashVector, direction: SplashVector, energy = 1,
  random: () => number = Math.random): Splash {
  const scale = Math.max(0.3, Math.min(1.5, energy));
  const splash = push(field.splashes, {
    x: point.x, y: point.y, z: point.z, age: 0, life: SPLASH_LIFE, size: scale, spin: random() * Math.PI * 2,
  }, MAX_SPLASHES);
  const d = unit(direction);
  // How much of the round's motion lies along the surface: 1 for a skim, 0 for
  // straight down. A skim throws its spray ahead; a plunge throws it all round.
  const horizontal = Math.hypot(d.x, d.z), skim = Math.min(1, horizontal) ** 4;
  const hx = horizontal > 1e-6 ? d.x / horizontal : 0, hz = horizontal > 1e-6 ? d.z / horizontal : 0;
  const lift = Math.sqrt(scale);
  for (let i = 0; i < DROPLETS_PER_SPLASH; i++) {
    // The crown: evenly round the rim with a little jitter, so it reads as a ring.
    const theta = (i + random() * 0.6) / DROPLETS_PER_SPLASH * Math.PI * 2;
    const out = (0.5 + random() * 1.1) * lift, up = (1.6 + random() * 2.2) * lift * (1 - skim * 0.45);
    const ahead = skim * (1.5 + random() * 2.5) * lift;
    push(field.droplets, {
      x: point.x, y: point.y + 0.01, z: point.z,
      vx: Math.cos(theta) * out * (1 - skim * 0.6) + hx * ahead, vy: up, vz: Math.sin(theta) * out * (1 - skim * 0.6) + hz * ahead,
      age: 0, life: 1.6, floor: point.y, size: DROPLET_SIZE * (0.7 + random() * 0.8),
    }, MAX_DROPLETS);
  }
  // The jet: a few fat drops fired nearly straight up, fastest first, so the
  // column stands for a moment before it falls back into itself. A skim has
  // no cavity to collapse, and so no jet.
  if (skim < 0.85) for (let i = 0; i < JET_DROPLETS; i++) {
    push(field.droplets, {
      x: point.x, y: point.y + 0.01, z: point.z,
      vx: (random() - 0.5) * 0.25, vy: (3.6 - i * 0.55) * lift * (1 - skim), vz: (random() - 0.5) * 0.25,
      age: 0, life: 1.6, floor: point.y, size: DROPLET_SIZE * (1.8 - i * 0.2),
    }, MAX_DROPLETS);
  }
  return splash;
}

/** Longest single integration step for a droplet, in seconds. */
export const SPLASH_SUBSTEP = 1 / 60;

export function advanceSplashes(field: SplashField, dt: number) {
  const step = Math.max(0, Math.min(dt, 0.25));
  for (let i = field.splashes.length - 1; i >= 0; i--) if ((field.splashes[i].age += step) >= field.splashes[i].life) field.splashes.splice(i, 1);
  // Fixed substeps, not one step of the whole frame: a spray droplet's arc
  // lasts a few tenths of a second, so on a renderer managing four frames a
  // second a single Euler step would carry it straight back through the
  // surface on the frame it was thrown, and no spray would ever be seen.
  const count = Math.max(1, Math.ceil(step / SPLASH_SUBSTEP)), h = step / count, drag = Math.exp(-AIR_DRAG * h);
  for (let i = field.droplets.length - 1; i >= 0; i--) {
    const drop = field.droplets[i];
    let landed = false;
    for (let k = 0; k < count && !landed; k++) {
      drop.age += h;
      drop.vy -= GRAVITY * h;
      drop.vx *= drag; drop.vy *= drag; drop.vz *= drag;
      drop.x += drop.vx * h; drop.y += drop.vy * h; drop.z += drop.vz * h;
      // Back through the surface it left: it has rejoined the water.
      landed = drop.age >= drop.life || (drop.vy < 0 && drop.y <= drop.floor);
    }
    if (landed) field.droplets.splice(i, 1);
  }
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/**
 * The two foam rings on the surface: a fast outer one and a slower inner one
 * that starts a beat later, as the collapsing cavity sends out its own wave.
 */
export function splashRings(splash: Splash) {
  const t = clamp01(splash.age / splash.life);
  const inner = clamp01((splash.age - 0.15) / (splash.life - 0.15));
  const ring = (u: number, reach: number) => ({
    radius: (0.08 + Math.pow(u, 0.55) * reach) * splash.size,
    brightness: u <= 0 ? 0 : Math.min(1, u * 12) * Math.pow(1 - u, 1.5),
  });
  return [ring(t, 2.2), ring(inner, 1.2)] as const;
}
/** The white column over the entry point: stands up fast, then slumps. */
export function splashColumn(splash: Splash) {
  const t = clamp01(splash.age / JET_LIFE);
  const rise = Math.sin(Math.min(1, t * 1.25) * Math.PI);
  return { height: (0.15 + rise * 1.25) * splash.size, width: (0.42 + t * 0.5) * splash.size, brightness: (1 - t) * (1 - t) };
}
/** Droplets shrink out as they age rather than popping, and never grow. */
export const dropletScale = (drop: Droplet) => drop.size * (1 - 0.5 * clamp01(drop.age / drop.life));
