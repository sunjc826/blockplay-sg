import { ARMORY_CATALOG, itemById, type ShopItem } from './armory-catalog';
import { applyArmorDamage, createProfile, equip, resolveLoadout } from './armory-state';
import { listArenaRoles } from './arena-roles';
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
/**
 * Someone on the receiving end. Armor matters: it absorbs a share of each hit
 * until it breaks, so shots-to-kill against a plated opponent is not health
 * divided by damage, and a tier that looks decisive against a bare target can
 * be ordinary against inserts.
 */
export interface Opponent { id: string; name: string; health: number; armor: number; absorption: number }
/** Drill targets alternate these two pools; see the target build in fps-engine.ts. */
export const DRILL_POOLS = [100, 115] as const;
export const DRILL_OPPONENTS: readonly Opponent[] = DRILL_POOLS.map(health => ({
  id: `drill-${health}`, name: `Drill target ${health}hp`, health, armor: 0, absorption: 0,
}));
/** The bot compositions a LAN match actually fields. */
export const roleOpponents = (): Opponent[] => listArenaRoles().map(role => ({
  id: role.id, name: role.name, health: role.health, armor: role.armor, absorption: role.absorption,
}));
/** An opponent wearing a catalog insert, for "what if they bought the plates". */
export function plateOpponent(plateId: string, health = 100): Opponent | null {
  const plate = itemById(plateId);
  if (plate?.category !== 'plate') return null;
  return { id: plateId, name: `${plate.name} at ${health}hp`, health, armor: plate.protection || 0, absorption: plate.absorption || 0 };
}
export const namedOpponents = () => [...DRILL_OPPONENTS, ...roleOpponents(),
  ...ARMORY_CATALOG.filter(item => item.category === 'plate').map(item => plateOpponent(item.id)!)];
/** Drill targets sit 12.0-30.3 units out; the rest is expedition and arena range. */
export const ANALYSIS_RANGES = [12, 20, 30, 45, 60, 90, 120] as const;
export const inDrill = (range: number) => range <= 30;

export const shotsToKill = (pool: number, damage: number) => Math.ceil(pool / Math.max(1, damage));
/**
 * Shots to drop an opponent, stepping the same armor model the engine uses so
 * absorption and the moment the plates break are accounted for rather than
 * approximated.
 */
export function shotsToKillOpponent(opponent: Opponent, damage: number) {
  if (!(damage > 0)) return Infinity;
  let health = opponent.health, armor = opponent.armor, shots = 0;
  while (health > 0 && shots < 200) {
    const hit = applyArmorDamage(health, armor, damage, opponent.absorption);
    health = hit.health; armor = hit.armor; shots++;
  }
  return shots;
}
/** First shot to the killing one landing; the cycle after it is never waited on. */
export const timeToKill = (shots: number, interval: number) => (shots - 1) * interval;
/**
 * How much faster a kill has to get before a player notices it without a
 * shot coming off the count. Below this a tier is a spreadsheet entry.
 */
export const TTK_MARGIN = 0.05;

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

export function analyseBreakpoints(opponents: readonly Opponent[] = DRILL_OPPONENTS, ranges: readonly number[] = ANALYSIS_RANGES): BreakpointRow[] {
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
        ranges: ranges.map(range => ({
          range,
          body: hitDamage(weapon, range), head: hitDamage(weapon, range, 'head'),
          stk: opponents.map(foe => shotsToKillOpponent(foe, hitDamage(weapon, range))),
          headStk: opponents.map(foe => shotsToKillOpponent(foe, hitDamage(weapon, range, 'head'))),
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
      let felt = false;
      opponents.forEach((foe, p) => {
        if (here.stk[p] < before.stk[p]) { felt = true; row.gains!.push(`${here.range}m body vs ${foe.name} ${before.stk[p]}->${here.stk[p]}`); }
        if (here.headStk[p] < before.headStk[p]) { felt = true; row.gains!.push(`${here.range}m head vs ${foe.name} ${before.headStk[p]}->${here.headStk[p]}`); }
        // A faster cycle is felt too, even when the shot count is unchanged: time
        // to kill is what a player experiences, not the number of trigger pulls.
        const was = timeToKill(before.stk[p], previous.interval), now = timeToKill(here.stk[p], row.interval);
        if (here.stk[p] === before.stk[p] && was > 0 && (was - now) / was >= TTK_MARGIN) {
          felt = true; row.gains!.push(`${here.range}m vs ${foe.name} TTK ${was.toFixed(2)}s->${now.toFixed(2)}s`);
        }
      });
      if (inDrill(here.range) && felt) row.drillGains.push(here.range);
    });
  }
  return rows;
}
/** Paid tiers that remove no threshold at all, at any range. */
export const deadBuys = (rows: BreakpointRow[] = analyseBreakpoints()) => rows.filter(row => row.gains && !row.gains.length).map(row => row.name);
/** Paid tiers a player never feels without leaving the drill. */
export const unfeltInDrill = (rows: BreakpointRow[] = analyseBreakpoints()) => rows.filter(row => row.gains?.length && !row.drillGains.length).map(row => row.name);
