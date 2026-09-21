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
 */
export interface ImpactVector { x: number; y: number; z: number }
export type ImpactKind = 'surface' | 'target';

export interface Impact { x: number; y: number; z: number; nx: number; ny: number; nz: number; age: number; life: number; kind: ImpactKind; spin: number }
export interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number }
export interface Scorch { x: number; y: number; z: number; nx: number; ny: number; nz: number; radius: number; spin: number; age: number; life: number }
export interface ImpactField { impacts: Impact[]; sparks: Spark[]; scorches: Scorch[] }

export const MAX_IMPACTS = 14, MAX_SPARKS = 120, MAX_SCORCHES = 48;
export const IMPACT_LIFE = 0.42, TARGET_IMPACT_LIFE = 0.24;
export const RING_LIFE = 0.11, SCORCH_LIFE = 6;
/** Sparks per impact, and how far a spark's streak trails behind it per unit of speed. */
export const SPARKS_PER_IMPACT = 7, SPARK_TRAIL = 0.024;
const SPARK_GRAVITY = 14, SPARK_DRAG = 2.4;

export const createImpactField = (): ImpactField => ({ impacts: [], sparks: [], scorches: [] });
export function clearImpactField(field: ImpactField) { field.impacts.length = 0; field.sparks.length = 0; field.scorches.length = 0; }

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

/**
 * Records one impact and everything it throws off. `energy` scales the spray —
 * the engine passes the damage scale a round has left, so a shot that has
 * already punched through a wall lands visibly weaker on the far side.
 */
export function recordImpact(field: ImpactField, point: ImpactVector, normal: ImpactVector, kind: ImpactKind = 'surface',
  energy = 1, random: () => number = Math.random): Impact {
  const n = unit(normal), scale = Math.max(0.25, Math.min(1.5, energy));
  const impact = push(field.impacts, {
    x: point.x, y: point.y, z: point.z, nx: n.x, ny: n.y, nz: n.z,
    age: 0, life: kind === 'target' ? TARGET_IMPACT_LIFE : IMPACT_LIFE, kind, spin: random() * Math.PI * 2,
  }, MAX_IMPACTS);
  const u = tangent(n), v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
  for (let i = 0; i < SPARKS_PER_IMPACT; i++) {
    // A cone about the surface normal: sparks come back off the wall, never into it.
    const spread = Math.tan((kind === 'target' ? 0.55 : 0.85) * random());
    const theta = random() * Math.PI * 2, speed = (kind === 'target' ? 3.4 : 2.6) * (0.55 + random()) * scale;
    const dx = n.x + (u.x * Math.cos(theta) + v.x * Math.sin(theta)) * spread;
    const dy = n.y + (u.y * Math.cos(theta) + v.y * Math.sin(theta)) * spread;
    const dz = n.z + (u.z * Math.cos(theta) + v.z * Math.sin(theta)) * spread;
    const d = unit({ x: dx, y: dy, z: dz });
    push(field.sparks, {
      x: point.x, y: point.y, z: point.z, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed,
      age: 0, life: (kind === 'target' ? 0.12 : 0.18) + random() * 0.2,
    }, MAX_SPARKS);
  }
  if (kind === 'surface') push(field.scorches, {
    x: point.x, y: point.y, z: point.z, nx: n.x, ny: n.y, nz: n.z,
    radius: (0.03 + random() * 0.022) * scale, spin: random() * Math.PI * 2, age: 0, life: SCORCH_LIFE,
  }, MAX_SCORCHES);
  return impact;
}

export function advanceImpacts(field: ImpactField, dt: number) {
  const step = Math.max(0, Math.min(dt, 0.25));
  for (let i = field.impacts.length - 1; i >= 0; i--) if ((field.impacts[i].age += step) >= field.impacts[i].life) field.impacts.splice(i, 1);
  for (let i = field.scorches.length - 1; i >= 0; i--) if ((field.scorches[i].age += step) >= field.scorches[i].life) field.scorches.splice(i, 1);
  // Exponential drag rather than a per-frame multiplier, so the arc is the same
  // shape whether the frame took 4 ms or 40.
  const drag = Math.exp(-SPARK_DRAG * step);
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
  return { scale: 0.05 + t * (impact.kind === 'target' ? 0.26 : 0.34), brightness: fade * fade * (impact.kind === 'target' ? 1.4 : 1) };
};
/** Dust lifted off a struck surface; a target throws none. */
export const impactDust = (impact: Impact) => {
  if (impact.kind === 'target') return { scale: 0, rise: 0, brightness: 0 };
  const t = Math.max(0, Math.min(1, impact.age / impact.life));
  return { scale: 0.08 + t * 0.5, rise: t * 0.3, brightness: 0.5 * Math.min(1, t / 0.12) * Math.pow(1 - t, 1.6) };
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
