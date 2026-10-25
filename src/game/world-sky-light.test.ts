import { describe, expect, it } from 'vitest';
import { skyIrradiance, skyRadiance, SKY_HEIGHT, SKY_WIDTH, type SkyLightInput } from './world-sky-light';

const luminance = (c: readonly number[]) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
const noon: SkyLightInput = { sky: [.78, .84, 1], horizon: [.5, .72, .82], ground: [.17, .17, .14], key: [1, .9, .8],
  keyDirection: { x: .6, y: .7, z: .39 }, keyRatio: 2.4 };
const texel = (data: Float32Array, y: number) => {
  const j = Math.min(SKY_HEIGHT - 1, Math.floor((Math.asin(y) / Math.PI + .5) * SKY_HEIGHT)), k = j * SKY_WIDTH * 4;
  return [data[k], data[k + 1], data[k + 2]];
};

describe('sky light', () => {
  it('gives walls on average what the hemisphere light gave them, and upward faces more than downward', () => {
    const data = skyRadiance(noon);
    const walls = Array.from({ length: 8 }, (_, i) => luminance(skyIrradiance(data, { x: Math.cos(i * Math.PI / 4), y: 0, z: Math.sin(i * Math.PI / 4) })));
    expect(walls.reduce((a, b) => a + b) / walls.length).toBeCloseTo((luminance(noon.sky) + luminance(noon.ground)) / 2, 2);
    expect(luminance(skyIrradiance(data, { x: 0, y: 1, z: 0 }))).toBeGreaterThan(luminance(skyIrradiance(data, { x: 0, y: -1, z: 0 })) * 1.5);
  });
  it('is bluer overhead than at the horizon', () => {
    const data = skyRadiance(noon), zenith = texel(data, .99), horizon = texel(data, .02);
    expect(zenith[2] / zenith[0]).toBeGreaterThan(horizon[2] / horizon[0]);
  });
  it('lights a shaded wall facing the sun more than one facing away', () => {
    const data = skyRadiance(noon), d = noon.keyDirection, flat = Math.hypot(d.x, d.z);
    const toward = skyIrradiance(data, { x: d.x / flat, y: 0, z: d.z / flat }), away = skyIrradiance(data, { x: -d.x / flat, y: 0, z: -d.z / flat });
    expect(luminance(toward)).toBeGreaterThan(luminance(away) * 1.1);
  });
  it('bounces more light up from the ground when the sun is strong and high', () => {
    const down = { x: 0, y: -1, z: 0 };
    const bright = skyIrradiance(skyRadiance(noon), down);
    const dim = skyIrradiance(skyRadiance({ ...noon, keyRatio: .2, keyDirection: { x: .99, y: .1, z: 0 } }), down);
    expect(luminance(bright)).toBeGreaterThan(luminance(dim) * 1.6);
    // More than the hemisphere's flat ground colour, which ignored the sun entirely.
    expect(luminance(bright)).toBeGreaterThan(luminance(noon.ground));
  });
});
