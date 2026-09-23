import { describe, expect, it } from 'vitest';
import { analyseBreakpoints, deadBuys, DRILL_OPPONENTS, DRILL_POOLS, namedOpponents, plateOpponent, shotsToKill, shotsToKillOpponent, SPRAY_ROUNDS, sprayAccuracy, sprayPattern, TARGET_RADIUS, targetAngle, timeToKill, TTK_MARGIN, unfeltInDrill } from './armory-balance';
import { itemById } from './armory-catalog';
import { createProfile, equip, resolveLoadout } from './armory-state';

describe('weapon ladder breakpoints', () => {
  const rows = analyseBreakpoints();
  it('measures each paid tier against the one below it on its own platform', () => {
    expect(rows.filter(row => row.previous === null).map(row => row.name)).toEqual(['SAR 21 · BMT', 'Ultimax · Sai Kang', 'P30 · Provost', 'FN MAG · Carry On', 'CIS 50MG · Big Encik']);
    for (const row of rows.filter(r => r.previous)) expect(row.gains).not.toBeNull();
  });
  it('requires shot-count improvements except for the already one-shot heavy platform', () => {
    // Heavy upgrades buy belt capacity, cadence and recovery; base already kills unarmored.
    expect(deadBuys(rows.filter(row => row.family !== 4))).toEqual([]);
    for (const row of rows.filter(row => row.family === 4)) {
      for (const range of row.ranges) expect(range.body).toBeGreaterThanOrEqual(115);
    }
  });
  it('leaves no tier that a player cannot feel without leaving the drill', () => {
    // Most play never leaves 12-30m, so a tier that is identical to the one below
    // it in that band is a purchase nobody can perceive. Adding one fails here.
    expect(unfeltInDrill(rows)).toEqual([]);
  });
  it('counts a faster kill as felt even when the shot count is unchanged', () => {
    // Time to kill is what a player experiences, not the number of trigger pulls.
    const quicker = timeToKill(3, .105), slower = timeToKill(3, .126);
    expect((slower - quicker) / slower).toBeGreaterThanOrEqual(TTK_MARGIN);
    expect(timeToKill(3, .12)).toBeCloseTo(.24, 10);
  });
  it('shortens time to kill at drill range with every step up a platform', () => {
    for (const family of [0, 1]) {
      const ladder = rows.filter(row => row.family === family);
      const drillTtk = (row: typeof ladder[number]) => {
        const at = row.ranges.find(range => range.range === 20)!;
        return DRILL_POOLS.map((_, p) => timeToKill(at.stk[p], row.interval));
      };
      ladder.slice(1).forEach((row, i) => {
        const here = drillTtk(row), before = drillTtk(ladder[i]);
        here.forEach((ttk, p) => expect(ttk).toBeLessThanOrEqual(before[p]));
        expect(here.some((ttk, p) => ttk < before[p])).toBe(true);
      });
    }
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

describe('hypothetical opponents', () => {
  const bare = { id: 'bare', name: 'bare', health: 100, armor: 0, absorption: 0 };
  it('matches plain division when there is no armor to absorb anything', () => {
    expect(shotsToKillOpponent(bare, 36)).toBe(shotsToKill(100, 36));
    expect(shotsToKillOpponent({ ...bare, health: 115 }, 36)).toBe(shotsToKill(115, 36));
  });
  it('costs more shots through inserts, and more again as absorption rises', () => {
    const soft = plateOpponent('plate-soft')!, aegis = plateOpponent('plate-elite')!;
    expect(shotsToKillOpponent(soft, 36)).toBeGreaterThan(shotsToKillOpponent(bare, 36));
    expect(shotsToKillOpponent(aegis, 36)).toBeGreaterThan(shotsToKillOpponent(soft, 36));
  });
  it('is not health divided by damage once plates are involved', () => {
    // The whole reason the model steps the engine's own armor maths.
    const aegis = plateOpponent('plate-elite')!;
    expect(shotsToKillOpponent(aegis, 50)).not.toBe(shotsToKill(aegis.health, 50));
  });
  it('refuses a non-plate and terminates on a harmless weapon', () => {
    expect(plateOpponent('sar-issued')).toBeNull();
    expect(plateOpponent('not-an-item')).toBeNull();
    expect(shotsToKillOpponent(bare, 0)).toBe(Infinity);
    expect(shotsToKillOpponent(bare, -12)).toBe(Infinity);
  });
  it('offers the drill targets, the bot roles and every insert as opponents', () => {
    const ids = namedOpponents().map(foe => foe.id);
    expect(ids).toEqual(expect.arrayContaining([...DRILL_OPPONENTS.map(f => f.id), 'assault', 'tank', 'sniper', 'plate-elite']));
    expect(namedOpponents().every(foe => foe.health > 0 && foe.absorption >= 0 && foe.absorption <= 1)).toBe(true);
  });
  it('measures the ladder against whichever opponent is asked for', () => {
    const tank = namedOpponents().find(foe => foe.id === 'tank')!;
    const [issued] = analyseBreakpoints([tank]);
    const [drillIssued] = analyseBreakpoints();
    // The same rifle needs far more hits through 100 armor points at 65%.
    expect(issued.ranges[0].stk[0]).toBeGreaterThan(drillIssued.ranges[0].stk[0]);
    expect(analyseBreakpoints([tank], [20]).every(row => row.ranges.length === 1)).toBe(true);
  });
});

describe('the spray pattern the shop draws', () => {
  /** Resolved exactly as the shop resolves it, so the pattern is the one drawn. */
  const configured = (id: string) => {
    const item = itemById(id)!, base = createProfile();
    return resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, item.family!)).weapons[item.family!];
  };
  const sar = configured('sar-issued'), marksman = configured('sar-marksman');
  it('puts the first round on the point of aim and walks up from there', () => {
    const { mean } = sprayPattern(sar);
    expect(mean).toHaveLength(SPRAY_ROUNDS);
    expect(Math.hypot(mean[0].x, mean[0].y)).toBeCloseTo(0, 10);
    for (let i = 1; i < mean.length; i++) expect(mean[i].y).toBeGreaterThan(mean[i - 1].y);
  });
  it('draws the same pattern twice, so a dossier figure does not move between renders', () => {
    expect(sprayPattern(sar)).toEqual(sprayPattern(sar));
  });
  it('scatters the cloud around the pattern rather than on top of it', () => {
    // The jitter and the shot cone are real; a pattern drawn without them would
    // advertise a precision the weapon does not have.
    const { mean, cloud } = sprayPattern(sar);
    expect(cloud.length).toBeGreaterThan(mean.length);
    const late = cloud.filter(shot => shot.round === SPRAY_ROUNDS).map(shot => shot.x);
    expect(Math.max(...late) - Math.min(...late)).toBeGreaterThan(.5);
  });
  it('lands fewer rounds as the target moves away', () => {
    // Measured on the steady weapon, because the issued rifle's second round
    // already clears a 12 m target: for it every range reads the same, which is
    // a fact about the tuning rather than about the chart.
    const { cloud } = sprayPattern(marksman);
    expect(sprayAccuracy(cloud, 12)).toBeGreaterThan(sprayAccuracy(cloud, 30));
    expect(sprayAccuracy(cloud, 20)).toBeGreaterThanOrEqual(sprayAccuracy(cloud, 30));
  });
  it('keeps more of the burst on target for a steadier weapon', () => {
    // The ladder has to be visible in the drawing, not only in the stat rows.
    expect(sprayAccuracy(sprayPattern(marksman).cloud, 12, 5))
      .toBeGreaterThan(sprayAccuracy(sprayPattern(sar).cloud, 12, 5));
  });
  it('measures a target against the collider the engine actually builds', () => {
    expect(TARGET_RADIUS).toBe(.265);
    expect(targetAngle(12)).toBeGreaterThan(targetAngle(30));
  });
});
