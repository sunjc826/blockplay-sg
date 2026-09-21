import { expect, it } from 'vitest';
import { advanceImpacts, clearImpactField, createImpactField, impactDust, impactRing, MAX_IMPACTS, MAX_SCORCHES, MAX_SPARKS, recordImpact, RING_LIFE, scorchAlpha, sparkHeat, sparkStreak, SPARKS_PER_IMPACT } from './fps-impacts';

const wall = { x: 2, y: 1.5, z: -3 }, out = { x: 0, y: 0, z: 1 };
const run = (field: ReturnType<typeof createImpactField>, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) advanceImpacts(field, 1 / 60); };

it('sprays sparks back off the surface, never into it', () => {
  const field = createImpactField();
  recordImpact(field, wall, out, 'surface', 1, Math.random);
  expect(field.sparks).toHaveLength(SPARKS_PER_IMPACT);
  // Every spark leaves on the outward side of the wall it struck.
  field.sparks.forEach(spark => expect(spark.vx * out.x + spark.vy * out.y + spark.vz * out.z).toBeGreaterThan(0));
  advanceImpacts(field, 1 / 60);
  field.sparks.forEach(spark => expect((spark.z - wall.z) * out.z).toBeGreaterThan(0));
});

it('normalizes a scruffy normal instead of scaling the spray by it', () => {
  const field = createImpactField();
  recordImpact(field, wall, { x: 0, y: 0, z: 40 }, 'surface', 1, () => .5);
  expect(Math.hypot(field.impacts[0].nx, field.impacts[0].ny, field.impacts[0].nz)).toBeCloseTo(1, 10);
});

it('marks concrete and leaves a target clean', () => {
  const field = createImpactField();
  recordImpact(field, wall, out, 'surface', 1, () => .5);
  expect(field.scorches).toHaveLength(1);
  expect(impactDust(field.impacts[0]).scale).toBeGreaterThan(0);
  clearImpactField(field);
  recordImpact(field, wall, out, 'target', 1, () => .5);
  expect(field.scorches).toHaveLength(0);
  expect(impactDust(field.impacts[0])).toEqual({ scale: 0, rise: 0, brightness: 0 });
  // A target hit reads brighter and shorter than the wall behind it.
  expect(impactRing(field.impacts[0]).brightness).toBeGreaterThan(1);
  expect(field.impacts[0].life).toBeLessThan(.42);
});

it('spends a round\'s remaining energy on the spray', () => {
  const full = createImpactField(), spent = createImpactField();
  recordImpact(full, wall, out, 'surface', 1, () => .5);
  recordImpact(spent, wall, out, 'surface', .3, () => .5);
  const speed = (f: typeof full) => Math.hypot(f.sparks[0].vx, f.sparks[0].vy, f.sparks[0].vz);
  expect(speed(spent)).toBeLessThan(speed(full));
  expect(spent.scorches[0].radius).toBeLessThan(full.scorches[0].radius);
});

it('caps every pool and expires what it holds', () => {
  const field = createImpactField();
  for (let i = 0; i < 60; i++) recordImpact(field, wall, out, 'surface', 1, Math.random);
  expect(field.impacts.length).toBeLessThanOrEqual(MAX_IMPACTS);
  expect(field.sparks.length).toBeLessThanOrEqual(MAX_SPARKS);
  expect(field.scorches.length).toBeLessThanOrEqual(MAX_SCORCHES);
  run(field, 1);
  expect(field.impacts).toHaveLength(0);
  expect(field.sparks).toHaveLength(0);
  // The scorch is the only mark that outlives the shot.
  expect(field.scorches.length).toBeGreaterThan(0);
  run(field, 6);
  expect(field.scorches).toHaveLength(0);
});

it('opens the ring fast and cools the sparks as they fall', () => {
  const field = createImpactField();
  const impact = recordImpact(field, wall, out, 'surface', 1, () => .5);
  const spark = field.sparks[0], opening = impactRing(impact);
  impact.age = RING_LIFE * .6;
  expect(impactRing(impact).scale).toBeGreaterThan(opening.scale);
  expect(impactRing(impact).brightness).toBeLessThan(opening.brightness);
  impact.age = RING_LIFE;
  expect(impactRing(impact).brightness).toBe(0);
  expect(sparkHeat(spark)).toBe(1);
  const streak = sparkStreak(spark);
  run(field, .08);
  expect(sparkHeat(spark)).toBeLessThan(1);
  // Drag and gravity both bleed speed, so the streak shortens as it cools.
  expect(sparkStreak(spark)).toBeLessThanOrEqual(streak);
});

it('holds a scorch before fading it, and stays finite through absurd frames', () => {
  const field = createImpactField();
  recordImpact(field, wall, out, 'surface', 1, Math.random);
  const scorch = field.scorches[0];
  expect(scorchAlpha(scorch)).toBe(1);
  scorch.age = scorch.life * .78;
  expect(scorchAlpha(scorch)).toBeGreaterThan(0);
  expect(scorchAlpha(scorch)).toBeLessThan(1);
  advanceImpacts(field, 0); advanceImpacts(field, -1); advanceImpacts(field, 9);
  // `style` is an opaque tag rather than a number; every other field is one.
  field.sparks.forEach(spark => Object.values(spark).forEach(v => expect(typeof v === 'number' ? Number.isFinite(v) : true).toBe(true)));
});
