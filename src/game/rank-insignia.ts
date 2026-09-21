import { MAX_LEVEL } from './progression';

/**
 * What a level is *called* and what it *looks like*, as data. Nothing here
 * draws: `RankBadge` renders whatever it is handed, exactly as `fps-effects`
 * draws whatever `fps-effect-styles` resolves, so a new set of ranks is a
 * declaration rather than a change to a component.
 *
 * A set is a list of bands over the 50 levels, and a band carries a title, an
 * emblem and an accent. Two decisions make fifty badges cheap:
 *
 *  1. **The emblem is a vocabulary, not a drawing.** Chevrons, bars, diamonds,
 *     stars, a numeral and a weapon shadow, each with a count and an optional
 *     wreath. Twelve ranks are twelve lines, and a set that wants a mark the
 *     vocabulary cannot spell is the one case that needs new drawing code.
 *  2. **Grades come from the band, not from more bands.** A band spanning
 *     levels 10-13 has four grades, so "Corporal II" needs no entry of its
 *     own. `grade` picks how that reads: roman, arabic, the level number
 *     itself, or nothing at all for a set whose titles stand alone.
 *
 * `registerRankSet` adds one at runtime, so a set can ship from anywhere —
 * including code that knows nothing about this module beyond its shape.
 */
export type WeaponShadow = 'sidearm' | 'rifle' | 'support' | 'marksman' | 'crossed';
export interface Emblem {
  kind: 'numeral' | 'chevron' | 'bar' | 'diamond' | 'star' | 'weapon';
  /** Repeats of the mark: three chevrons, two bars, four stars. Defaults to 1. */
  count?: number;
  /** Chevrons point down — a rocker rather than a stripe. */
  inverted?: boolean;
  /** Which silhouette, for `weapon`. */
  shadow?: WeaponShadow;
  /** A half-wreath under the mark, for the ranks that have earned one. */
  wreath?: boolean;
}
export interface RankBand {
  /** First level in the band; the next band's `from` ends it. */
  from: number;
  /** Title without any grade: "Corporal". Empty for a set that shows only a number. */
  label: string;
  emblem: Emblem;
  /** Drives the badge's metal and the glow behind it. */
  accent: string;
}
/** How a level's position inside its band is written, if at all. */
export type GradeStyle = 'none' | 'roman' | 'arabic' | 'level';
export interface RankSet {
  id: string; name: string; description: string;
  grade: GradeStyle;
  bands: readonly RankBand[];
}

export const DEFAULT_RANK_SET = 'field';

const NUMERALS: readonly (readonly [number, string])[] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(value: number) {
  let left = Math.max(1, Math.min(MAX_LEVEL, Math.floor(value))), out = '';
  for (const [size, mark] of NUMERALS) while (left >= size) { out += mark; left -= size; }
  return out;
}

/**
 * The titles blockplay has always used. Kept first and kept unnumbered so the
 * default reads exactly as it did before ranks became pluggable.
 */
const FIELD: RankSet = {
  id: 'field', name: 'Field', description: 'Six unnumbered steps, Recruit to Legend. What the range has always called you.',
  grade: 'none',
  bands: [
    { from: 1, label: 'Recruit', emblem: { kind: 'chevron', count: 1 }, accent: '#9fae9f' },
    { from: 3, label: 'Operator', emblem: { kind: 'chevron', count: 2 }, accent: '#b3c4a4' },
    { from: 6, label: 'Specialist', emblem: { kind: 'chevron', count: 3 }, accent: '#c6d09a' },
    { from: 12, label: 'Veteran', emblem: { kind: 'star', count: 1 }, accent: '#d8c78d' },
    { from: 20, label: 'Elite', emblem: { kind: 'star', count: 2 }, accent: '#e6c67c' },
    { from: 35, label: 'Legend', emblem: { kind: 'star', count: 3, wreath: true }, accent: '#f2d78d' },
  ],
};
/** No titles at all: the level number, in a badge that deepens every ten levels. */
const NUMERAL_SET: RankSet = {
  id: 'numerals', name: 'Numerals', description: 'No titles. The level number alone, in a badge that deepens every ten levels.',
  grade: 'level',
  bands: [
    { from: 1, label: '', emblem: { kind: 'numeral' }, accent: '#9aa89c' },
    { from: 11, label: '', emblem: { kind: 'numeral' }, accent: '#a9bda0' },
    { from: 21, label: '', emblem: { kind: 'numeral' }, accent: '#c3cf98' },
    { from: 31, label: '', emblem: { kind: 'numeral' }, accent: '#dcc684' },
    { from: 41, label: '', emblem: { kind: 'numeral', wreath: true }, accent: '#f2d78d' },
  ],
};
/**
 * A twelve-step ladder with graded ranks. The marks climb in kind rather than
 * only in number — chevrons, then bars, then diamonds, then stars — so two
 * ranks are told apart at badge size without counting anything. Generic titles:
 * blockplay's range is not anybody's army.
 */
const MILITARY: RankSet = {
  id: 'military', name: 'Service', description: 'Twelve graded ranks. Chevrons to bars to diamonds to stars, numbered inside each.',
  grade: 'roman',
  bands: [
    { from: 1, label: 'Recruit', emblem: { kind: 'chevron', count: 1 }, accent: '#93a394' },
    { from: 3, label: 'Private', emblem: { kind: 'chevron', count: 2 }, accent: '#9dae9b' },
    { from: 6, label: 'Lance Corporal', emblem: { kind: 'chevron', count: 3 }, accent: '#a8b9a1' },
    { from: 10, label: 'Corporal', emblem: { kind: 'chevron', count: 3, wreath: true }, accent: '#b4c4a6' },
    { from: 14, label: 'Sergeant', emblem: { kind: 'bar', count: 1 }, accent: '#c0cba4' },
    { from: 18, label: 'Staff Sergeant', emblem: { kind: 'bar', count: 2 }, accent: '#cbd0a0' },
    { from: 22, label: 'Warrant Officer', emblem: { kind: 'bar', count: 3 }, accent: '#d5cf98' },
    { from: 27, label: 'Lieutenant', emblem: { kind: 'diamond', count: 1 }, accent: '#dcc98d' },
    { from: 32, label: 'Captain', emblem: { kind: 'diamond', count: 2 }, accent: '#e3c684' },
    { from: 37, label: 'Major', emblem: { kind: 'diamond', count: 3 }, accent: '#e9c47c' },
    { from: 43, label: 'Colonel', emblem: { kind: 'star', count: 1, wreath: true }, accent: '#efcd83' },
    { from: 48, label: 'General', emblem: { kind: 'star', count: 3, wreath: true }, accent: '#f5d98f' },
  ],
};
/** Gun shadows: the badge is the silhouette of what the rank is trusted with. */
const WEAPONS: RankSet = {
  id: 'weapons', name: 'Shadows', description: 'Gun shadows. Sidearm to crossed rifles, graded inside each silhouette.',
  grade: 'roman',
  bands: [
    { from: 1, label: 'Sidearm', emblem: { kind: 'weapon', shadow: 'sidearm' }, accent: '#9ba99e' },
    { from: 8, label: 'Rifleman', emblem: { kind: 'weapon', shadow: 'rifle' }, accent: '#b2c2a3' },
    { from: 18, label: 'Gunner', emblem: { kind: 'weapon', shadow: 'support' }, accent: '#c8d09a' },
    { from: 30, label: 'Marksman', emblem: { kind: 'weapon', shadow: 'marksman' }, accent: '#ddc88b' },
    { from: 42, label: 'Armourer', emblem: { kind: 'weapon', shadow: 'crossed', wreath: true }, accent: '#f0d78e' },
  ],
};

const registry = new Map<string, RankSet>();
/**
 * Adds or replaces a set. Bands are sorted on the way in, so a caller may
 * declare them in any order, and a set that does not cover level 1 is refused
 * rather than left to resolve to nothing on a new player's first badge.
 */
export function registerRankSet(set: RankSet) {
  if (!set.id) throw new Error('A rank set needs an id.');
  if (!set.bands.length) throw new Error(`Rank set "${set.id}" has no bands.`);
  const bands = [...set.bands].sort((a, b) => a.from - b.from);
  if (bands[0].from !== 1) throw new Error(`Rank set "${set.id}" must start at level 1.`);
  if (bands.some((band, i) => i > 0 && band.from === bands[i - 1].from)) throw new Error(`Rank set "${set.id}" has two bands at the same level.`);
  registry.set(set.id, { ...set, bands });
  return set.id;
}
export function unregisterRankSet(id: string) { if (id !== DEFAULT_RANK_SET) registry.delete(id); }
for (const set of [FIELD, NUMERAL_SET, MILITARY, WEAPONS]) registerRankSet(set);

export const rankSets = (): RankSet[] => [...registry.values()];
export const isRankSet = (id: unknown): id is string => typeof id === 'string' && registry.has(id);
export const getRankSet = (id: string = DEFAULT_RANK_SET): RankSet => registry.get(id) ?? registry.get(DEFAULT_RANK_SET)!;

export interface RankInsignia {
  set: string; setName: string; level: number;
  /** The band's own title, without a grade: "Corporal". */
  title: string;
  /** What to show: "Corporal III", "Legend", or "7". */
  label: string;
  /** 1-based place within the band, and how many levels the band spans. */
  grade: number; grades: number;
  emblem: Emblem; accent: string;
  /** True on a band's first level: the promotion worth announcing. */
  promoted: boolean;
}
/**
 * Resolves a level's insignia in a set. An unknown set falls back to the
 * default rather than throwing, because this runs from a saved profile whose
 * chosen set may have been registered by code that is no longer loaded.
 */
export function rankInsignia(level: number, setId: string = DEFAULT_RANK_SET): RankInsignia {
  const set = getRankSet(setId);
  const at = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
  let index = 0;
  for (let i = 0; i < set.bands.length; i++) if (set.bands[i].from <= at) index = i;
  const band = set.bands[index], ends = set.bands[index + 1]?.from ?? MAX_LEVEL + 1;
  const grade = at - band.from + 1, grades = ends - band.from;
  const numeral = set.grade === 'level' ? String(at) : set.grade === 'roman' ? roman(grade) : set.grade === 'arabic' ? String(grade) : '';
  // A band holding a single level has nothing to grade, so it keeps its bare title.
  const shown = set.grade === 'level' || grades > 1 ? numeral : '';
  return {
    set: set.id, setName: set.name, level: at, title: band.label,
    label: [band.label, shown].filter(Boolean).join(' ') || String(at),
    grade, grades, emblem: band.emblem, accent: band.accent, promoted: at === band.from,
  };
}
/** Every band of a set at the level it starts, for a picker that shows the ladder. */
export const rankLadder = (setId: string = DEFAULT_RANK_SET): RankInsignia[] =>
  getRankSet(setId).bands.map(band => rankInsignia(band.from, setId));
