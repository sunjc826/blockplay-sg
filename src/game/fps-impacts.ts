import { DEFAULT_IMPACT_PROFILE, sanitizeImpactProfile, type ImpactProfile } from './fps-impact-profile';
import { SURFACE_LOOKS, type DecalKind, type SurfaceKind } from './fps-surfaces';
/**
 * What a round leaves where it stops: a flash ring on the surface, a spray of
 * cooling sparks, a dust puff and a scorch that outlives all three.
 *
 * Every pool is a plain array with a hard ceiling, because the renderer draws
 * each pool as one instanced or batched object and its size is fixed at
 * construction. Nothing here touches the scene, so the arcs and the lifetimes
 * are testable on their own; the engine only reads them into matrices.
 *
 * A round that stops on a range target reads differently from one that stops on
 * concrete: brighter, shorter sparks, no dust and no scorch, so a hit on a
 * target cannot be mistaken for a miss behind it.
 *
 * A surface hit can also say what it struck (see fps-surfaces): metal throws
 * more sparks and a dent, wood splinters, glass shards and a crack star, a body
 * a red mist and droplets with no mark on it. Without one, a hit keeps the
 * original generic look: sparks, dust and a crater.
 */
export interface ImpactVector { x: number; y: number; z: number }
export type ImpactKind = 'surface' | 'target';

/**
 * `style` on each record is an opaque tag naming the look the round that made
 * it was fired with. Nothing in this module reads it: it is here so the
 * renderer can go on drawing a mark in the colours of the weapon that left it
 * once the player has switched to another one.
 */
export interface Impact { x: number; y: number; z: number; nx: number; ny: number; nz: number; age: number; life: number; kind: ImpactKind; profile: ImpactProfile; spin: number; style?: string; surface?: SurfaceKind }
export interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; style?: string }
export interface Scorch { x: number; y: number; z: number; nx: number; ny: number; nz: number; radius: number; depth: number; spin: number; age: number; life: number; style?: string; decal: DecalKind }
/** A solid fragment: a chip, splinter, shard, leaf or droplet. It tumbles and shrinks away. */
export interface Debris {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  ax: number; ay: number; az: number; angle: number; spin: number;
  sx: number; sy: number; sz: number; gravity: number; drag: number;
  age: number; life: number; colour: string; flutter: number;
}
export interface ImpactField { impacts: Impact[]; sparks: Spark[]; scorches: Scorch[]; debris: Debris[] }

export const MAX_IMPACTS = 14, MAX_SPARKS = 120, MAX_SCORCHES = 48, MAX_DEBRIS = 160;
export const IMPACT_LIFE = DEFAULT_IMPACT_PROFILE.smokeLifetime, TARGET_IMPACT_LIFE = 0.24;
export const RING_LIFE = 0.11, SCORCH_LIFE = 6;
/** Sparks per impact, and how far a spark's streak trails behind it per unit of speed. */
export const SPARKS_PER_IMPACT = 7, SPARK_TRAIL = 0.024;
const SPARK_GRAVITY = 14, SPARK_DRAG = 2.4;

export const createImpactField = (): ImpactField => ({ impacts: [], sparks: [], scorches: [], debris: [] });
export function clearImpactField(field: ImpactField) { field.impacts.length = 0; field.sparks.length = 0; field.scorches.length = 0; field.debris.length = 0; }

const unit = (v: ImpactVector): ImpactVector => {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 1e-6 ? { x: v.x / length, y: v.y / length, z: v.z / length } : { x: 0, y: 1, z: 0 };
};
/** Any unit vector perpendicular to `n`; the axis furthest from it makes a stable one. */
const tangent = (n: ImpactVector): ImpactVector => {
  const away = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return unit({ x: n.y * away.z - n.z * away.y, y: n.z * away.x - n.x * away.z, z: n.x * away.y - n.y * away.x });
};
const push = <T>(list: T[], item: T, ceiling: number) => {
  if (list.length >= ceiling) list.shift();
  list.push(item);
  return item;
};

/** A direction inside a cone of half-angle `atan(width)` about `n`. */
function coneDirection(n: ImpactVector, u: ImpactVector, v: ImpactVector, width: number, random: () => number) {
  const spread = Math.tan(width * random()), theta = random() * Math.PI * 2;
  return unit({
    x: n.x + (u.x * Math.cos(theta) + v.x * Math.sin(theta)) * spread,
    y: n.y + (u.y * Math.cos(theta) + v.y * Math.sin(theta)) * spread,
    z: n.z + (u.z * Math.cos(theta) + v.z * Math.sin(theta)) * spread,
  });
}

/**
 * Records one impact and everything it throws off. `energy` scales the spray —
 * the engine passes the damage scale a round has left, so a shot that has
 * already punched through a wall lands visibly weaker on the far side.
 * `surface` names what was struck; a target ignores it.
 */
export function recordImpact(field: ImpactField, point: ImpactVector, normal: ImpactVector, kind: ImpactKind = 'surface',
  energy = 1, random: () => number = Math.random, style?: string, profile: ImpactProfile = DEFAULT_IMPACT_PROFILE, surface?: SurfaceKind): Impact {
  const n = unit(normal), scale = Math.max(0.05, Math.min(1.5, Number.isFinite(energy) ? energy : 1));
  const look = kind === 'surface' && surface ? SURFACE_LOOKS[surface] : undefined;
  const authored = sanitizeImpactProfile(profile);
  const dustLife = look?.dust.life ?? 1;
  const resolved = { ...authored, holeDepth: authored.holeDepth * scale,
    smokeSize: authored.smokeSize * Math.sqrt(scale), smokeOpacity: authored.smokeOpacity * Math.sqrt(scale),
    smokeLifetime: authored.smokeLifetime * Math.sqrt(scale) * dustLife };
  const impact = push(field.impacts, {
    x: point.x, y: point.y, z: point.z, nx: n.x, ny: n.y, nz: n.z,
    age: 0, life: kind === 'target' ? TARGET_IMPACT_LIFE : resolved.smokeLifetime, kind, profile: resolved, spin: random() * Math.PI * 2, style,
    ...(look ? { surface } : {}),
  }, MAX_IMPACTS);
  const u = tangent(n), v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
  const sparkCount = Math.round(authored.sparkCount * (look?.sparks ?? 1));
  for (let i = 0; i < sparkCount; i++) {
    // A cone about the surface normal: sparks come back off the wall, never into it.
    const spread = Math.tan((kind === 'target' ? 0.55 : 0.85) * random());
    const theta = random() * Math.PI * 2, speed = (kind === 'target' ? 3.4 : 2.6) * (0.55 + random()) * scale;
    const dx = n.x + (u.x * Math.cos(theta) + v.x * Math.sin(theta)) * spread;
    const dy = n.y + (u.y * Math.cos(theta) + v.y * Math.sin(theta)) * spread;
    const dz = n.z + (u.z * Math.cos(theta) + v.z * Math.sin(theta)) * spread;
    const d = unit({ x: dx, y: dy, z: dz });
    push(field.sparks, {
      x: point.x, y: point.y, z: point.z, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed,
      age: 0, life: (kind === 'target' ? 0.12 : 0.18) + random() * 0.2, style,
    }, MAX_SPARKS);
  }
  if (look) {
    const debris = look.debris, bore = Math.sqrt(authored.holeRadius / DEFAULT_IMPACT_PROFILE.holeRadius);
    const count = Math.round(debris.count * Math.min(1.6, Math.sqrt(scale) * bore));
    for (let i = 0; i < count; i++) {
      const d = coneDirection(n, u, v, debris.spread, random), speed = debris.speed * (.45 + random() * .9) * Math.sqrt(scale);
      const size = debris.size * (.6 + random() * .8) * Math.min(1.8, bore), axis = unit({ x: random() - .5, y: random() - .5, z: random() - .5 });
      push(field.debris, {
        x: point.x + n.x * .01, y: point.y + n.y * .01, z: point.z + n.z * .01, vx: d.x * speed, vy: d.y * speed + debris.speed * .25, vz: d.z * speed,
        ax: axis.x, ay: axis.y, az: axis.z, angle: random() * Math.PI * 2, spin: (6 + random() * 18) * (random() < .5 ? -1 : 1),
        sx: size * debris.shape[0], sy: size * debris.shape[1], sz: size * debris.shape[2], gravity: debris.gravity, drag: debris.drag,
        age: 0, life: debris.life * (.6 + random() * .7), colour: debris.colours[Math.floor(random() * debris.colours.length) % debris.colours.length],
        flutter: debris.gravity < 5 ? .8 + random() * .8 : 0,
      }, MAX_DEBRIS);
    }
  }
  const decal = look ? look.decal : 'crater';
  if (kind === 'surface' && decal) push(field.scorches, {
    x: point.x, y: point.y, z: point.z, nx: n.x, ny: n.y, nz: n.z,
    radius: authored.holeRadius * (look?.decalScale ?? 1) * (.85 + random() * .3) * (.8 + .2 * Math.sqrt(scale)), depth: resolved.holeDepth, spin: random() * Math.PI * 2, age: 0, life: SCORCH_LIFE, style, decal,
  }, MAX_SCORCHES);
  return impact;
}

/**
 * A mark with no round of its own behind it: the blood thrown onto whatever
 * stood just behind a body that was hit. Flat, so it has no cavity depth.
 */
export function recordDecal(field: ImpactField, point: ImpactVector, normal: ImpactVector, decal: DecalKind, radius: number, random: () => number = Math.random): Scorch {
  const n = unit(normal);
  return push(field.scorches, {
    x: point.x, y: point.y, z: point.z, nx: n.x, ny: n.y, nz: n.z,
    radius: Math.max(.01, Math.min(.6, Number.isFinite(radius) ? radius : .1)), depth: 0, spin: random() * Math.PI * 2, age: 0, life: SCORCH_LIFE, decal,
  }, MAX_SCORCHES);
}

export function advanceImpacts(field: ImpactField, dt: number) {
  const step = Math.max(0, Math.min(dt, 0.25));
  for (let i = field.impacts.length - 1; i >= 0; i--) if ((field.impacts[i].age += step) >= field.impacts[i].life) field.impacts.splice(i, 1);
  for (let i = field.scorches.length - 1; i >= 0; i--) if ((field.scorches[i].age += step) >= field.scorches[i].life) field.scorches.splice(i, 1);
  // Exponential drag rather than a per-frame multiplier, so the arc is the same
  // shape whether the frame took 4 ms or 40.
  const drag = Math.exp(-SPARK_DRAG * step);
  for (let i = field.debris.length - 1; i >= 0; i--) {
    const piece = field.debris[i];
    piece.age += step;
    if (piece.age >= piece.life) { field.debris.splice(i, 1); continue; }
    const slow = Math.exp(-piece.drag * step);
    piece.vy -= piece.gravity * step;
    piece.vx *= slow; piece.vy *= slow; piece.vz *= slow;
    // A leaf rocks side to side on its way down instead of dropping straight.
    const sway = piece.flutter * Math.sin(piece.age * 9 + piece.angle) * step;
    piece.x += piece.vx * step + sway; piece.y += piece.vy * step; piece.z += piece.vz * step + sway * .6;
    piece.angle += piece.spin * step;
  }
  for (let i = field.sparks.length - 1; i >= 0; i--) {
    const spark = field.sparks[i];
    spark.age += step;
    if (spark.age >= spark.life) { field.sparks.splice(i, 1); continue; }
    spark.vy -= SPARK_GRAVITY * step;
    spark.vx *= drag; spark.vy *= drag; spark.vz *= drag;
    spark.x += spark.vx * step; spark.y += spark.vy * step; spark.z += spark.vz * step;
  }
}

const eased = (t: number) => { const c = Math.max(0, Math.min(1, t)); return 1 - (1 - c) * (1 - c); };
/** The bright disc on the surface: opens fast, gone well before the dust is. */
export const impactRing = (impact: Impact) => {
  const t = eased(impact.age / RING_LIFE), fade = Math.max(0, 1 - impact.age / RING_LIFE);
  const caliberScale = Math.sqrt(impact.profile.holeRadius / DEFAULT_IMPACT_PROFILE.holeRadius);
  const flash = impact.surface ? SURFACE_LOOKS[impact.surface].flash : 1;
  return { scale: (0.05 + t * (impact.kind === 'target' ? 0.26 : 0.34)) * caliberScale, brightness: fade * fade * (impact.kind === 'target' ? 1.4 : flash) };
};
/** Dust lifted off a struck surface; a target throws none. */
export const impactDust = (impact: Impact) => {
  if (impact.kind === 'target') return { scale: 0, rise: 0, brightness: 0 };
  const t = Math.max(0, Math.min(1, impact.age / impact.life));
  const dust = impact.surface ? SURFACE_LOOKS[impact.surface].dust : undefined, size = impact.profile.smokeSize * (dust?.scale ?? 1);
  return { scale: (0.08 + t * 0.5) * size, rise: t * 0.3 * Math.sqrt(size), brightness: Math.min(.95, impact.profile.smokeOpacity * (dust?.opacity ?? 1)) * Math.min(1, t / 0.12) * Math.pow(1 - t, 1.6) };
};
/** Fragments hold their size, then shrink out over the last part of their life. */
export const debrisScale = (piece: Debris) => {
  const t = Math.max(0, Math.min(1, piece.age / piece.life));
  return t < .6 ? 1 : 1 - (t - .6) / .4;
};
/** White-hot at birth, ember by the end; the renderer lerps its colour on this. */
export const sparkHeat = (spark: Spark) => Math.max(0, 1 - spark.age / spark.life);
/** How far behind itself a spark is drawn, so speed reads as a streak. */
export const sparkStreak = (spark: Spark) =>
  Math.min(0.16, Math.max(0.015, Math.hypot(spark.vx, spark.vy, spark.vz) * SPARK_TRAIL));
/** A scorch holds, then fades; it is the only mark left once the shot is over. */
export const scorchAlpha = (scorch: Scorch) => {
  const t = Math.max(0, Math.min(1, scorch.age / scorch.life));
  return t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
};
