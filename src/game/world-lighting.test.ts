import { describe, expect, it } from 'vitest';
import { dayLighting, resolveHour, singaporeHour, sunDirection, TIMES_OF_DAY } from './world-lighting';

describe('Singapore sun path', () => {
  it('rises in the east after 7, stands near overhead after 1 pm, sets in the west after 7 pm', () => {
    const morning = sunDirection(7.5, 80), noon = sunDirection(13.05, 80), evening = sunDirection(18.8, 80);
    expect(morning.elevation).toBeGreaterThan(0); expect(morning.elevation).toBeLessThan(15); expect(morning.x).toBeGreaterThan(.9);
    expect(noon.elevation).toBeGreaterThan(85);
    expect(evening.x).toBeLessThan(-.9);
    expect(sunDirection(23, 80).elevation).toBeLessThan(-30);
  });
  it('stands to the south at noon in December and to the north in June', () => {
    expect(sunDirection(13.05, 355).z).toBeGreaterThan(0);
    expect(sunDirection(13.05, 172).z).toBeLessThan(0);
  });
  it('reads the clock in Singapore time whatever the device timezone', () => {
    expect(singaporeHour(Date.parse('2026-10-25T04:30:00Z'))).toBeCloseTo(12.5);
    expect(resolveHour('auto', Date.parse('2026-10-25T16:00:00Z'))).toBeCloseTo(0);
    expect(resolveHour('dusk', 0)).toBe(TIMES_OF_DAY.dusk.hour);
  });
});

describe('time-of-day light', () => {
  it('keeps the key light well above the fill by day, so surfaces turned away read darker', () => {
    const noon = dayLighting(TIMES_OF_DAY.noon.hour);
    expect(noon.keyScale / noon.ambientScale).toBeGreaterThan(1.7);
    expect(noon.shift).toBe(0); expect(noon.skyWeight).toBe(0);
  });
  it('warms and lowers the sun at dawn and dusk, and hands over to a dim blue moon at night', () => {
    const dusk = dayLighting(TIMES_OF_DAY.dusk.hour), night = dayLighting(TIMES_OF_DAY.night.hour), noon = dayLighting(TIMES_OF_DAY.noon.hour);
    expect(dusk.key.y).toBeLessThan(.35); expect(dusk.skyWeight).toBeGreaterThan(.3);
    const [r, , b] = [1, 3, 5].map(i => parseInt(dusk.keyColor.slice(i, i + 2), 16)); expect(r).toBeGreaterThan(b + 40);
    expect(night.keyScale).toBeLessThan(noon.keyScale * .3); expect(night.key.y).toBeGreaterThan(.5);
    expect(night.exposure).toBeGreaterThan(noon.exposure); expect(night.shift).toBe(1);
    const [nr, , nb] = [1, 3, 5].map(i => parseInt(night.keyColor.slice(i, i + 2), 16)); expect(nb).toBeGreaterThan(nr);
  });
  it('changes continuously through the day', () => {
    let previous = dayLighting(0);
    for (let hour = 1 / 12; hour <= 24; hour += 1 / 12) {
      const next = dayLighting(hour);
      expect(Math.abs(next.keyScale - previous.keyScale)).toBeLessThan(.2);
      expect(Math.abs(next.exposure - previous.exposure)).toBeLessThan(.1);
      previous = next;
    }
  });
});
