import { expect, it } from 'vitest';
import { localMinimapBounds, minimapContactRange, minimapHeading, minimapProjection } from './minimap';
import { movementInput } from './fps-rules';
import { dayLighting, TIMES_OF_DAY } from './world-lighting';
import { WEATHER, type WeatherId } from './world-events';

it('reduces contact range at night and through every weather preset', () => {
  const day = dayLighting(TIMES_OF_DAY.noon.hour).shift, night = dayLighting(TIMES_OF_DAY.night.hour).shift;
  const expected: Record<WeatherId, number> = { sunny: 60, cloudy: 54, showers: 45, thunderstorm: 33, monsoon: 36, squall: 30, haze: 27 };
  for (const weather of Object.keys(WEATHER) as WeatherId[]) {
    expect(minimapContactRange(day, weather)).toBe(expected[weather]);
    expect(minimapContactRange(night, weather)).toBe(Math.round(expected[weather] / 2));
  }
});

it('blends twilight range between day and night, independent of midnight rollover', () => {
  for (const time of ['dawn', 'dusk'] as const) {
    const range = minimapContactRange(dayLighting(TIMES_OF_DAY[time].hour).shift, 'sunny');
    expect(range).toBeGreaterThan(30);
    expect(range).toBeLessThan(60);
  }
  expect(minimapContactRange(dayLighting(23.99).shift, 'sunny')).toBe(minimapContactRange(dayLighting(.01).shift, 'sunny'));
});

it('fits expanded region bounds inside the minimap with uniform scale', () => {
  const bounds = { minX: -300, maxX: 320, minZ: -270, maxZ: 200 };
  const map = minimapProjection(bounds);
  expect(map.x(bounds.minX)).toBeGreaterThanOrEqual(8);
  expect(map.x(bounds.maxX)).toBeLessThanOrEqual(192);
  expect(map.y(bounds.minZ)).toBeGreaterThanOrEqual(8);
  expect(map.y(bounds.maxZ)).toBeLessThanOrEqual(152);
  expect(map.x(10) - map.x(0)).toBeCloseTo(map.y(10) - map.y(0));
});

it('rejects empty bounds', () => {
  expect(() => minimapProjection({ minX: 0, maxX: 0, minZ: 0, maxZ: 10 })).toThrow();
});

it('follows the player without scrolling outside a district or changing scale at the edge', () => {
  const bounds = { minX: -290, maxX: 290, minZ: -134, maxZ: 265 };
  for (const player of [{ x: 0, z: 0 }, { x: -290, z: -134 }, { x: 290, z: 265 }]) {
    const local = localMinimapBounds(bounds, player), map = minimapProjection(local);
    expect(local.minX).toBeGreaterThanOrEqual(bounds.minX);
    expect(local.maxX).toBeLessThanOrEqual(bounds.maxX);
    expect(local.minZ).toBeGreaterThanOrEqual(bounds.minZ);
    expect(local.maxZ).toBeLessThanOrEqual(bounds.maxZ);
    expect(map.x(player.x)).toBeGreaterThanOrEqual(8);
    expect(map.x(player.x)).toBeLessThanOrEqual(192);
    expect(map.y(player.z)).toBeGreaterThanOrEqual(8);
    expect(map.y(player.z)).toBeLessThanOrEqual(152);
    expect(map.scale).toBeCloseTo(184 / 180);
  }
});

it('points in the actual forward movement direction after turns and multiple revolutions', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 5 * Math.PI]) {
    const radians = minimapHeading(yaw) * Math.PI / 180;
    const forward = movementInput(1, 0, yaw, 1, 1);
    expect(Math.sin(radians)).toBeCloseTo(forward.x);
    expect(-Math.cos(radians)).toBeCloseTo(forward.z);
  }
});
