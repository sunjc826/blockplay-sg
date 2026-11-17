import { expect, it } from 'vitest';
import { compassBearing, compassTicks } from './compass';
import { minimapHeading } from './minimap';

it('reads north at zero yaw and turns clockwise as the minimap arrow does', () => {
  expect(compassBearing(0)).toBe(0);
  expect(compassBearing(-Math.PI / 2)).toBe(90);
  expect(compassBearing(Math.PI / 2)).toBe(270);
  expect(compassBearing(Math.PI)).toBe(180);
  for (const yaw of [-7, -1.2, .4, 3, 9.5]) expect(compassBearing(yaw)).toBe(((Math.round(minimapHeading(yaw)) % 360) + 360) % 360);
});
it('stays inside 0-359 for any yaw, including wound-up and broken ones', () => {
  for (const yaw of [-100, -2 * Math.PI, 2 * Math.PI, 50, -.001, .001]) { const b = compassBearing(yaw); expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThan(360); }
  expect(compassBearing(NaN)).toBe(0);
});
it('lays ticks either side of the heading and names the eight points across north', () => {
  const ticks = compassTicks(350);
  expect(ticks.map(t => t.offset)).toEqual([-50, -35, -20, -5, 10, 25, 40, 55]);
  expect(ticks.find(t => t.bearing === 0)).toMatchObject({ offset: 10, label: 'N' });
  expect(ticks.find(t => t.bearing === 315)?.label).toBe('NW');
  expect(ticks.find(t => t.bearing === 45)?.label).toBe('NE');
  expect(ticks.filter(t => t.label).length).toBe(3);
  expect(compassTicks(90).find(t => t.offset === 0)?.label).toBe('E');
});
