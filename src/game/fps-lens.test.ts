import { describe, expect, it } from 'vitest';
import { createLensRain, dustStrength, LENS_DROP_LIMIT, rainExposure, SLIDING_RADIUS, sunFlareStrength } from './fps-lens';

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
