import { ARMORY_CATALOG, type ShopItem } from './armory-catalog';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { findTrait, hitDamage } from './fps-rules';
import { xpForLevel } from './progression';

/**
 * Breakpoint analysis for the weapon ladder. Damage alone does not tell you
 * whether a purchase is felt: only crossing a shots-to-kill threshold does. A
 * tier that removes no shot at any range is a dead buy, and one that removes
 * none inside the drill is invisible to most players, who never leave it.
 *
 * Everything here resolves through the same catalog and `hitDamage` the engine
 * fires through, so the analysis cannot drift from the game.
 */
/** Drill targets alternate these two pools; see the target build in fps-engine.ts. */
export const DRILL_POOLS = [100, 115] as const;
/** Drill targets sit 12.0-30.3 units out; the rest is expedition and arena range. */
export const ANALYSIS_RANGES = [12, 20, 30, 45, 60, 90, 120] as const;
export const inDrill = (range: number) => range <= 30;

export const shotsToKill = (pool: number, damage: number) => Math.ceil(pool / Math.max(1, damage));
/** First shot to the killing one landing; the cycle after it is never waited on. */
export const timeToKill = (shots: number, interval: number) => (shots - 1) * interval;

export interface RangeRow { range: number; body: number; head: number; stk: number[]; headStk: number[] }
export interface BreakpointRow {
  id: string; name: string; family: number; tier: ShopItem['tier']; level: number;
  price: string; xpToUnlock: number; interval: number;
  band: { near: number; far: number; floor: number } | null; precision: number;
  ranges: RangeRow[];
  /** The tier this one is measured against, or null for a family's baseline. */
  previous: string | null;
  /** Thresholds this tier removes, and the drill ranges among them. */
  gains: string[] | null; drillGains: number[];
}

/** Resolves a variant exactly as the shop and the engine would. */
function configure(variant: ShopItem) {
  const base = createProfile();
  return resolveLoadout(equip({ ...base, owned: [...base.owned, variant.id] }, variant.id, variant.family!)).weapons[variant.family!];
}

export function analyseBreakpoints(): BreakpointRow[] {
  const rows: BreakpointRow[] = ARMORY_CATALOG
    .filter(item => item.category === 'weapon')
    .map(item => ({ item, weapon: configure(item), level: item.requiredLevel || 1 }))
    .sort((a, b) => a.item.family! - b.item.family! || a.level - b.level)
    .map(({ item, weapon, level }) => {
      const falloff = findTrait(weapon.traits, 'falloff'), precision = findTrait(weapon.traits, 'precision');
      return {
        id: item.id, name: item.name, family: item.family!, tier: item.tier, level,
        price: `${item.price}${item.currency === 'tokens' ? 'TK' : 'CR'}`,
        xpToUnlock: xpForLevel(level), interval: weapon.interval,
        band: falloff ? { near: falloff.near, far: falloff.far, floor: falloff.minScale } : null,
        precision: precision?.multiplier ?? 1,
        ranges: ANALYSIS_RANGES.map(range => ({
          range,
          body: hitDamage(weapon, range), head: hitDamage(weapon, range, 'head'),
          stk: DRILL_POOLS.map(pool => shotsToKill(pool, hitDamage(weapon, range))),
          headStk: DRILL_POOLS.map(pool => shotsToKill(pool, hitDamage(weapon, range, 'head'))),
        })),
        previous: null, gains: null, drillGains: [],
      };
    });

  for (const row of rows) {
    const previous = rows.filter(other => other.family === row.family && other.level < row.level).pop();
    if (!previous) continue;
    row.previous = previous.name; row.gains = [];
    row.ranges.forEach((here, i) => {
      const before = previous.ranges[i];
      DRILL_POOLS.forEach((pool, p) => {
        if (here.stk[p] < before.stk[p]) row.gains!.push(`${here.range}m body ${pool}hp ${before.stk[p]}->${here.stk[p]}`);
        if (here.headStk[p] < before.headStk[p]) row.gains!.push(`${here.range}m head ${pool}hp ${before.headStk[p]}->${here.headStk[p]}`);
      });
      if (inDrill(here.range) && DRILL_POOLS.some((_, p) => here.stk[p] < before.stk[p] || here.headStk[p] < before.headStk[p]))
        row.drillGains.push(here.range);
    });
  }
  return rows;
}
/** Paid tiers that remove no threshold at all, at any range. */
export const deadBuys = (rows = analyseBreakpoints()) => rows.filter(row => row.gains && !row.gains.length).map(row => row.name);
/** Paid tiers a player never feels without leaving the drill. */
export const unfeltInDrill = (rows = analyseBreakpoints()) => rows.filter(row => row.gains?.length && !row.drillGains.length).map(row => row.name);
