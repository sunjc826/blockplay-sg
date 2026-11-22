import { describe, expect, it } from 'vitest';
import { createLensRain, waterSplashExposure, dustStrength, LENS_DROP_LIMIT, rainExposure, SLIDING_RADIUS, sunFlareStrength, heavyRain } from './fps-lens';

/** A repeatable stand-in for Math.random. */
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const run = (rain: ReturnType<typeof createLensRain>, seconds: number, air: Parameters<ReturnType<typeof createLensRain>['step']>[1]) => {
  for (let t = 0; t < seconds; t += 1 / 60) rain.step(1 / 60, air);
};
const shower = { rain: .7, exposure: rainExposure(0), sheltered: false, aspect: 16 / 9 };

describe('rain on the lens', () => {
  it('collects drops in the rain, more looking up, within its bound', () => {
    const ahead = createLensRain(seeded()), up = createLensRain(seeded());
    run(ahead, 1.5, shower); run(up, 1.5, { ...shower, exposure: rainExposure(.9) });
    expect(ahead.drops.length).toBeGreaterThan(4);
    expect(up.drops.length).toBeGreaterThan(ahead.drops.length);
    const storm = createLensRain(seeded());
    run(storm, 30, { ...shower, rain: 1, exposure: 1 });
    expect(storm.drops.length).toBeLessThanOrEqual(LENS_DROP_LIMIT);
    expect(rainExposure(-1)).toBeLessThan(rainExposure(0));
  });
  it('lands nothing under a roof, and dries off once out of the rain', () => {
    const roofed = createLensRain(seeded());
    run(roofed, 3, { ...shower, sheltered: true });
    expect(roofed.drops).toHaveLength(0);
    const lens = createLensRain(seeded());
    run(lens, 2, shower); expect(lens.drops.length).toBeGreaterThan(0);
    run(lens, 3.5, { ...shower, sheltered: true });
    expect(lens.drops).toHaveLength(0);
  });
  it('runs big drops down the lens, leaving beads, while small ones cling', () => {
    const lens = createLensRain(seeded());
    run(lens, 3, { ...shower, rain: 1, exposure: 1 });
    const runners = lens.drops.filter(d => d.speed > 0), clinging = lens.drops.filter(d => d.radius < SLIDING_RADIUS * .9 && d.stick < 50);
    expect(runners.length).toBeGreaterThan(0);
    expect(clinging.every(d => d.speed === 0)).toBe(true);
    // Trail beads never slide themselves.
    expect(lens.drops.some(d => d.stick === 99)).toBe(true);
  });
});

describe('sun flare and haze dust', () => {
  it('flares only with the sun up and the sky clear enough', () => {
    expect(sunFlareStrength(30, 1)).toBe(1);
    expect(sunFlareStrength(-8, 1)).toBe(0);
    expect(sunFlareStrength(30, .5)).toBeLessThan(.05);
    expect(sunFlareStrength(30, .25)).toBe(0);
    expect(sunFlareStrength(30, .6)).toBeGreaterThan(0);
  });
  it('shows dust in haze, faintly at night and indoors, and none in clear air', () => {
    expect(dustStrength(0, 1, false)).toBe(0);
    expect(dustStrength(1, 1, false)).toBe(1);
    expect(dustStrength(1, 0, false)).toBeLessThan(.25);
    expect(dustStrength(1, 1, true)).toBeLessThan(.5);
  });
});

it('nearby water splashes leave draining streaks, while swimming repeatedly wets the lens',()=>{
  const lens=createLensRain(seeded());lens.splash(.6,16/9);
  expect(lens.drops.length).toBeGreaterThan(10);expect(lens.drops.some(d=>d.splash&&d.speed>0)).toBe(true);
  run(lens,.3,{...shower,rain:0});expect(lens.drops.some(d=>d.travelled>0||d.stick===99)).toBe(true);
  const single=lens.drops.length;
  run(lens,1.5,{...shower,rain:0,swimming:true,swimSpeed:1.25});expect(lens.drops.length).toBeGreaterThan(single);
  expect(lens.drops.length).toBeLessThanOrEqual(LENS_DROP_LIMIT);
  run(lens,7,{...shower,rain:0});expect(lens.drops).toHaveLength(0);
});

it('only nearby, forward water impacts can reach the player’s eyes',()=>{
 expect(waterSplashExposure(2,.8,1.7)).toBeGreaterThan(0);
 expect(waterSplashExposure(8,1,1)).toBe(0);expect(waterSplashExposure(2,-1,1)).toBe(0);expect(waterSplashExposure(2,1,4)).toBe(0);
});

describe('water on the lens by how it got there', () => {
  const air = { rain: 0, exposure: 1, sheltered: false, aspect: 16 / 9 };
  it('light rain leaves only beads; heavy rain lands more, bigger, splatting, with a few soft smudges that never run', () => {
    expect(heavyRain(.4)).toBe(0); expect(heavyRain(.7)).toBeGreaterThan(.1); expect(heavyRain(.85)).toBeGreaterThan(.85); expect(heavyRain(1)).toBe(1);
    const light = createLensRain(seeded()), heavy = createLensRain(seeded());
    let lightSeen = 0, heavySeen = 0, smears = 0;
    for (let i = 0; i < 400; i++) {
      light.step(1 / 30, { ...air, rain: .4 }); heavy.step(1 / 30, { ...air, rain: 1 });
      lightSeen += light.drops.length; heavySeen += heavy.drops.length; smears = Math.max(smears, heavy.drops.filter(d => d.kind === 'smear').length);
      for (const d of heavy.drops) if (d.kind === 'smear') { expect(d.speed).toBe(0); expect(d.radius).toBeGreaterThan(.03); }
    }
    expect(light.drops.every(d => d.kind === 'bead' && !d.impact)).toBe(true);
    expect(heavySeen).toBeGreaterThan(lightSeen * 1.5); expect(smears).toBeGreaterThan(0); expect(smears).toBeLessThanOrEqual(5);
    expect(heavy.drops.some(d => d.impact)).toBe(true); expect(heavy.film).toBe(0);
    for (let i = 0; i < 300; i++) heavy.step(1 / 30, air);
    expect(heavy.drops).toHaveLength(0);
  });
  it('going under and coming up each sheet the lens, which drains into runners; strokes slop the lower half', () => {
    const lens = createLensRain(seeded());
    lens.step(1 / 30, { ...air, swimming: true, swimSpeed: 0 });
    expect(lens.film).toBeGreaterThan(.95); expect(lens.drops.filter(d => d.kind === 'runner').length).toBeGreaterThan(10);
    expect(lens.drops.every(d => d.y >= .5)).toBe(true);
    for (let i = 0; i < 90; i++) lens.step(1 / 30, { ...air, swimming: true, swimSpeed: 1.5 });
    expect(lens.film).toBeGreaterThan(0); expect(lens.film).toBeLessThanOrEqual(.3);
    expect(lens.drops.some(d => d.kind === 'bead' && d.splash && d.y < .45)).toBe(true);
    lens.step(1 / 30, air); expect(lens.film).toBeGreaterThan(.95);
    for (let i = 0; i < 80; i++) lens.step(1 / 30, air);
    expect(lens.film).toBe(0);
    lens.clear(); expect(lens.film).toBe(0);
  });
  it('a round into water nearby throws fine spray from that side, drawn out away from it, and it is soon gone', () => {
    const lens = createLensRain(seeded()); lens.splash(1, 16 / 9, false, .2);
    const spray = lens.drops.filter(d => d.kind === 'spray');
    expect(spray.length).toBeGreaterThan(25); expect(lens.film).toBe(0);
    expect(spray.reduce((n, d) => n + d.x, 0) / spray.length).toBeLessThan(.35);
    for (const d of spray) {
      expect(d.radius).toBeLessThan(.0125); expect(d.stretch).toBeGreaterThan(.5);
      // The tail (local up, turned by the angle) points back at where the round went in.
      const tail = [-Math.sin(d.angle!), Math.cos(d.angle!)], back = [(.2 - d.x) * 16 / 9, .3 - d.y], length = Math.hypot(back[0], back[1]);
      if (length > .02) expect((tail[0] * back[0] + tail[1] * back[1]) / length).toBeGreaterThan(.99);
    }
    const other = createLensRain(seeded()); other.splash(1, 16 / 9, false, .8);
    expect(other.drops.filter(d => d.kind === 'spray').reduce((n, d) => n + d.x, 0) / spray.length).toBeGreaterThan(.65);
    for (let i = 0; i < 75; i++) lens.step(1 / 30, air);
    expect(lens.drops.some(d => d.kind === 'spray')).toBe(false);
    const few = createLensRain(seeded()); few.splash(1, 16 / 9, true, .5); expect(few.drops.length).toBeLessThan(lens.drops.length + spray.length);
  });
});
