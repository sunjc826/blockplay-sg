import { describe, expect, it } from 'vitest';
import { DEFAULT_RANK_SET, getRankSet, isRankSet, rankInsignia, rankLadder, rankSets, registerRankSet, roman, unregisterRankSet, type RankSet } from './rank-insignia';
import { MAX_LEVEL } from './progression';
import { chooseRankSet, createProfile, restoreProfile } from './armory-state';

describe('rank insignia', () => {
  it('keeps the shipped titles as the default, unnumbered and unchanged', () => {
    // These are the labels the range used before ranks became pluggable; the
    // default set exists to keep them, so a drift here is a regression.
    const titles = [1, 2, 3, 5, 6, 11, 12, 19, 20, 34, 35, 50].map(level => rankInsignia(level).label);
    expect(titles).toEqual(['Recruit', 'Recruit', 'Operator', 'Operator', 'Specialist', 'Specialist',
      'Veteran', 'Veteran', 'Elite', 'Elite', 'Legend', 'Legend']);
    expect(getRankSet().id).toBe(DEFAULT_RANK_SET);
  });
  it('covers every level in every registered set, with a band that starts at 1', () => {
    for (const set of rankSets()) {
      expect(set.bands[0].from).toBe(1);
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const at = rankInsignia(level, set.id);
        expect(at.label).toBeTruthy();
        expect(at.level).toBe(level);
        // A level always sits inside its band rather than past the end of it.
        expect(at.grade).toBeGreaterThanOrEqual(1);
        expect(at.grade).toBeLessThanOrEqual(at.grades);
      }
    }
  });
  it('grades a level by its place in the band rather than by another band', () => {
    // Service bands Corporal over levels 10-13, so level 12 is its third grade.
    const corporal = rankInsignia(12, 'military');
    expect(corporal.title).toBe('Corporal'); expect(corporal.label).toBe('Corporal III');
    expect(corporal.grade).toBe(3); expect(corporal.grades).toBe(4); expect(corporal.promoted).toBe(false);
    expect(rankInsignia(10, 'military').promoted).toBe(true);
    expect(roman(4)).toBe('IV'); expect(roman(14)).toBe('XIV');
  });
  it('shows the level itself where a set has no titles', () => {
    expect(rankInsignia(7, 'numerals').label).toBe('7');
    expect(rankInsignia(44, 'numerals').label).toBe('44');
    // The bands still change the badge, they just do not change the words.
    expect(rankInsignia(7, 'numerals').accent).not.toBe(rankInsignia(44, 'numerals').accent);
  });
  it('hands the badge a mark for every level rather than a drawing', () => {
    for (const set of rankSets()) for (const step of rankLadder(set.id)) {
      expect(step.emblem.kind).toBeTruthy();
      if (step.emblem.kind === 'weapon') expect(step.emblem.shadow).toBeTruthy();
      if (step.emblem.count !== undefined) expect(step.emblem.count).toBeGreaterThan(0);
    }
    expect(rankLadder('weapons').map(step => step.title)).toEqual(['Sidearm', 'Rifleman', 'Gunner', 'Marksman', 'Armourer']);
  });
  it('registers a set from outside and resolves against it', () => {
    const custom: RankSet = { id: 'test-colours', name: 'Colours', description: 'Two bands.', grade: 'arabic',
      // Declared out of order on purpose: registration sorts them.
      bands: [{ from: 20, label: 'Gold', emblem: { kind: 'star', count: 2 }, accent: '#fc0' },
        { from: 1, label: 'Green', emblem: { kind: 'bar', count: 1 }, accent: '#0f0' }] };
    registerRankSet(custom);
    expect(isRankSet('test-colours')).toBe(true);
    expect(rankInsignia(1, 'test-colours').label).toBe('Green 1');
    expect(rankInsignia(21, 'test-colours').label).toBe('Gold 2');
    expect(rankInsignia(19, 'test-colours').title).toBe('Green');
    unregisterRankSet('test-colours');
    expect(isRankSet('test-colours')).toBe(false);
    // An unknown set falls back rather than throwing: a saved profile may name
    // a set whose code is no longer loaded.
    expect(rankInsignia(3, 'test-colours').label).toBe('Operator');
  });
  it('refuses a set that would leave a level without a rank', () => {
    const bands = [{ from: 4, label: 'Late', emblem: { kind: 'bar' as const }, accent: '#fff' }];
    expect(() => registerRankSet({ id: 'test-late', name: 'Late', description: '', grade: 'none', bands })).toThrow(/level 1/);
    expect(() => registerRankSet({ id: 'test-empty', name: 'Empty', description: '', grade: 'none', bands: [] })).toThrow(/no bands/);
    expect(isRankSet('test-late')).toBe(false);
  });
  it('is never dropped from the default set by a bad level', () => {
    for (const level of [0, -4, NaN, Infinity, 999, 1.7]) expect(rankInsignia(level).label).toBeTruthy();
    expect(rankInsignia(999).level).toBe(MAX_LEVEL); expect(rankInsignia(0).level).toBe(1);
  });
  it('saves the chosen set and rejects one that does not exist', () => {
    const base = createProfile();
    expect(base.rankSet).toBe(DEFAULT_RANK_SET);
    const worn = chooseRankSet(base, 'weapons');
    expect(worn.rankSet).toBe('weapons'); expect(base.rankSet).toBe(DEFAULT_RANK_SET);
    expect(chooseRankSet(worn, 'nonsense')).toBe(worn);
    expect(restoreProfile(JSON.stringify(worn)).rankSet).toBe('weapons');
    expect(restoreProfile(JSON.stringify({ ...worn, rankSet: 'nonsense' })).rankSet).toBe(DEFAULT_RANK_SET);
  });
});
