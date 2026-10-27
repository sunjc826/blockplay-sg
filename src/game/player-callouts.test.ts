import { describe, expect, it } from 'vitest';
import { CALLOUT_PAGES, getPlayerCallout, wheelSlot, WHEEL_SLOTS } from './player-callouts';

describe('player callouts', () => {
  it('fill every page of the wheel with unique, short callouts', () => {
    const ids = CALLOUT_PAGES.flatMap(page => page.callouts.map(callout => callout.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const page of CALLOUT_PAGES) {
      expect(page.callouts).toHaveLength(WHEEL_SLOTS);
      for (const callout of page.callouts) {
        expect(callout.label.length).toBeLessThanOrEqual(14);
        expect(callout.lines.length).toBeGreaterThan(0);
        for (const line of callout.lines) expect(line.length).toBeLessThanOrEqual(100);
      }
    }
  });
  it('are found by id only', () => {
    expect(getPlayerCallout('knn')?.reply).toBe('taunt');
    expect(getPlayerCallout('contact')?.ping).toBe(true);
    expect(getPlayerCallout('Knn, who shoot me sia?!')).toBeUndefined();
    expect(getPlayerCallout(7)).toBeUndefined();
  });
  it('point the wheel by direction, clockwise from the top, with a dead zone', () => {
    expect(wheelSlot(0, -60)).toBe(0);
    expect(wheelSlot(60, -60)).toBe(1);
    expect(wheelSlot(60, 0)).toBe(2);
    expect(wheelSlot(0, 60)).toBe(4);
    expect(wheelSlot(-60, 0)).toBe(6);
    expect(wheelSlot(-60, -60)).toBe(7);
    expect(wheelSlot(5, -10)).toBeNull();
    expect(wheelSlot(Number.NaN, 40)).toBeNull();
  });
});
