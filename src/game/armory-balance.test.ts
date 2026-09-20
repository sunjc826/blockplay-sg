import { describe, expect, it } from 'vitest';
import { analyseBreakpoints, deadBuys, shotsToKill, timeToKill, unfeltInDrill } from './armory-balance';

describe('weapon ladder breakpoints', () => {
  const rows = analyseBreakpoints();
  it('measures each paid tier against the one below it on its own platform', () => {
    expect(rows.filter(row => row.previous === null).map(row => row.name)).toEqual(['SAR 21 · Issued', 'Ultimax · Issued']);
    for (const row of rows.filter(r => r.previous)) expect(row.gains).not.toBeNull();
  });
  it('never lets a paid tier remove no shot at all', () => {
    // A tier that crosses no threshold anywhere is damage the player cannot feel.
    expect(deadBuys(rows)).toEqual([]);
  });
  it('pins which tiers are only felt outside the drill', () => {
    // A ratchet, not an endorsement: these three are identical to the tier below
    // at 12-30m and only pay off further out. Changing the list should be a
    // deliberate balance decision, so adding to it fails here first.
    expect(unfeltInDrill(rows)).toEqual(['SAR 21 · Vanguard', 'SAR 21 · Marksman', 'Ultimax · Patrol']);
  });
  it('keeps damage monotonic with tier at every sampled range', () => {
    for (const family of [0, 1]) {
      const ladder = rows.filter(row => row.family === family);
      ladder.slice(1).forEach((row, i) => {
        row.ranges.forEach((here, r) => expect(here.body).toBeGreaterThanOrEqual(ladder[i].ranges[r].body));
      });
    }
  });
  it('counts whole shots and the gaps between them', () => {
    expect(shotsToKill(100, 36)).toBe(3); expect(shotsToKill(115, 36)).toBe(4);
    expect(shotsToKill(100, 0)).toBe(100); expect(shotsToKill(100, -5)).toBe(100);
    expect(timeToKill(3, .12)).toBeCloseTo(.24, 10); expect(timeToKill(1, .12)).toBe(0);
  });
});
