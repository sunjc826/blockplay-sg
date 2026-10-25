import { describe, expect, it } from 'vitest';
import { advanceImpacts, clearImpactField, createImpactField, debrisScale, impactDust, impactRing, MAX_DEBRIS, MAX_IMPACTS, MAX_SCORCHES, MAX_SPARKS, recordDecal, recordImpact, RING_LIFE, scorchAlpha, scorchRelief, sparkHeat, sparkStreak, SPARKS_PER_IMPACT, IMPACT_VISIBILITY, visibility } from './fps-impacts';
import { DEFAULT_IMPACT_PROFILE, impactProfile } from './fps-impact-profile';

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

it('throws different debris and leaves a different mark for each material', () => {
  const struck = (surface: Parameters<typeof recordImpact>[8]) => {
    const field = createImpactField();
    recordImpact(field, wall, out, 'surface', 1, Math.random, undefined, DEFAULT_IMPACT_PROFILE, surface);
    return field;
  };
  const metal = struck('metal'), concrete = struck('concrete'), wood = struck('wood'), glass = struck('glass'), flesh = struck('flesh'), leaves = struck('foliage');
  expect(metal.sparks.length).toBeGreaterThan(concrete.sparks.length);
  expect(wood.sparks).toHaveLength(0); expect(flesh.sparks).toHaveLength(0);
  expect(concrete.scorches[0].decal).toBe('crater'); expect(metal.scorches[0].decal).toBe('dent');
  expect(wood.scorches[0].decal).toBe('splinter'); expect(glass.scorches[0].decal).toBe('crack');
  // A body and a tree crown hold no mark; the body bleeds instead of chipping.
  expect(flesh.scorches).toHaveLength(0); expect(leaves.scorches).toHaveLength(0);
  expect(flesh.debris.length).toBeGreaterThan(0);
  expect(flesh.debris.every(piece => /^#[4-8]/.test(piece.colour))).toBe(true);
  expect(impactRing(flesh.impacts[0]).brightness).toBe(0);
  // Splinters are long and thin; glass shards and leaves are flat.
  const [splinter] = wood.debris, [shard] = glass.debris;
  expect(splinter.sz).toBeGreaterThan(splinter.sx * 5);
  expect(shard.sy).toBeLessThan(shard.sx * .2);
  // Every fragment leaves the struck face on its outward side.
  [...wood.debris, ...glass.debris, ...flesh.debris].forEach(piece => expect(piece.vz).toBeGreaterThan(0));
});

it('flutters leaves down slowly, shrinks fragments out and caps the pool', () => {
  const field = createImpactField();
  recordImpact(field, wall, out, 'surface', 1, () => .5, undefined, DEFAULT_IMPACT_PROFILE, 'foliage');
  recordImpact(field, wall, out, 'surface', 1, () => .5, undefined, DEFAULT_IMPACT_PROFILE, 'concrete');
  const leaf = field.debris.find(piece => piece.gravity < 5)!, chip = field.debris.find(piece => piece.gravity > 5)!;
  const leafY = leaf.vy, chipY = chip.vy;
  run(field, .2);
  expect(leafY - leaf.vy).toBeLessThan(chipY - chip.vy);
  expect(debrisScale(chip)).toBe(1);
  chip.age = chip.life * .9; expect(debrisScale(chip)).toBeGreaterThan(0); expect(debrisScale(chip)).toBeLessThan(1);
  for (let i = 0; i < 60; i++) recordImpact(field, wall, out, 'surface', 1, Math.random, undefined, DEFAULT_IMPACT_PROFILE, 'glass');
  expect(field.debris.length).toBeLessThanOrEqual(MAX_DEBRIS);
  run(field, 2);
  expect(field.debris).toHaveLength(0);
});

it('lays a flat, bounded blood decal on its own', () => {
  const field = createImpactField();
  const splat = recordDecal(field, wall, { x: 0, y: 0, z: 5 }, 'blood', 9, () => .5);
  expect(splat).toMatchObject({ decal: 'blood', depth: 0, nz: 1 });
  expect(splat.radius).toBeLessThanOrEqual(.6);
  expect(field.impacts).toHaveLength(0); expect(field.sparks).toHaveLength(0);
});

it('gives the issued rifle\'s hole the atlas\'s full relief and keeps every calibre readable', () => {
  const relief = (caliberMm: number, damage: number) => {
    const field = createImpactField();
    recordImpact(field, wall, out, 'surface', 1, () => .5, undefined, impactProfile(caliberMm, damage));
    return scorchRelief(field.scorches.at(-1)!);
  };
  // Tied to the default profile, so a change to the hole formula cannot quietly flatten the map again.
  expect(relief(5.56, 36)).toBeCloseTo(1, 1);
  const pistol = relief(9, 28), gpmg = relief(7.62, 60), heavy = relief(12.7, 160);
  expect(pistol).toBeLessThan(1); expect(pistol).toBeGreaterThan(.5);
  expect(gpmg).toBeGreaterThan(1); expect(heavy).toBeGreaterThan(gpmg); expect(heavy).toBeLessThanOrEqual(4);
  expect(scorchRelief(recordDecal(createImpactField(), wall, out, 'blood', .2))).toBe(0);
});

describe('impact visibility', () => {
  it('gives a rifle strike the whole boost and a heavier one less, never shrinking either', () => {
    expect(visibility(1, IMPACT_VISIBILITY.smokeSize)).toBeCloseTo(IMPACT_VISIBILITY.smokeSize);
    expect(visibility(.8, 2)).toBeCloseTo(1.6);
    const heavy = visibility(8, IMPACT_VISIBILITY.smokeSize) / 8;
    expect(heavy).toBeGreaterThan(1); expect(heavy).toBeLessThan(IMPACT_VISIBILITY.smokeSize);
    expect(visibility(8, 2)).toBeGreaterThan(visibility(2, 2));
  });
  it('draws a rifle strike\'s smoke and debris larger than its calibre profile alone', () => {
    const field = createImpactField();
    const impact = recordImpact(field, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 'surface', 1, () => .5, undefined, DEFAULT_IMPACT_PROFILE, 'concrete');
    expect(impact.profile.smokeSize).toBeCloseTo(DEFAULT_IMPACT_PROFILE.smokeSize * IMPACT_VISIBILITY.smokeSize);
    expect(impact.life).toBeGreaterThan(DEFAULT_IMPACT_PROFILE.smokeLifetime);
    expect(field.debris.length).toBeGreaterThan(0);
  });
});
