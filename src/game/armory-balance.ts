import { ARMORY_CATALOG, itemById, type ShopItem } from './armory-catalog';
import { applyArmorDamage, createProfile, equip, resolveLoadout } from './armory-state';
import { listArenaRoles } from './arena-roles';
import { findTrait, FPS_WEAPONS, hitDamage, type WeaponSpec } from './fps-rules';
import { advanceRecoil, CLIMB_EASE_ROUNDS, createRecoil, recordRecoilShot, takeAimPush } from './fps-recoil';
import { skipCostToLevel, xpForLevel } from './progression';

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
  /** Tokens to buy the levels up to this tier's gate, earning no XP at all. */
  tokensToUnlock: number;
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
        xpToUnlock: xpForLevel(level), tokensToUnlock: skipCostToLevel(level), interval: weapon.interval,
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

/** The shop's reference opponent: an unarmored standard target. */
export const STOCK_OPPONENT: Opponent = { id: 'stock-100', name: 'Stock 100hp target', health: 100, armor: 0, absorption: 0 };
export const CURVE_MAX_RANGE = 130;
/** Sampled finely enough that a falloff band's corners read as corners. */
export const curveRanges = (max = CURVE_MAX_RANGE, step = 2) =>
  Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);

export interface CurvePoint { range: number; damage: number; shots: number }
export const falloffCurve = (weapon: WeaponSpec, opponent: Opponent = STOCK_OPPONENT, ranges = curveRanges()): CurvePoint[] =>
  ranges.map(range => {
    const damage = hitDamage(weapon, range);
    return { range, damage, shots: shotsToKillOpponent(opponent, damage) };
  });

export interface ShotBand { shots: number; from: number; to: number }
/**
 * Damage ranges that share a shots-to-kill count, found by scanning rather than
 * by dividing health, so the bands stay correct for an armored opponent whose
 * plates absorb part of each hit.
 */
export function shotBands(opponent: Opponent = STOCK_OPPONENT, maxDamage = 100): ShotBand[] {
  const bands: ShotBand[] = [];
  for (let damage = 1; damage <= Math.max(1, Math.round(maxDamage)); damage++) {
    const shots = shotsToKillOpponent(opponent, damage);
    const last = bands[bands.length - 1];
    if (last && last.shots === shots) last.to = damage;
    else bands.push({ shots, from: damage, to: damage });
  }
  return bands;
}

/**
 * Where a held trigger puts the sights, round by round, in degrees off the
 * point of aim.
 *
 * Stepped through the engine's own recoil rather than a formula, at the
 * weapon's own cadence, so the shop cannot advertise a climb the range does not
 * produce — the same reason the falloff curve runs through `hitDamage`. The
 * jitter is stilled (a fixed 0.5 draw is the zero of the pattern's random
 * term), because a dossier figure that moved every render would be unreadable
 * and unfalsifiable; the vertical climb is deterministic regardless.
 */
export interface RecoilPoint { round: number; climb: number }
/**
 * A fixed window rather than the magazine, so two weapons are always drawn on
 * the same scale. Twenty rounds covers the eased opening, the ramp and the
 * approach to the ceiling on every weapon in the catalog.
 */
export const RECOIL_ROUNDS = 20;
/** Sub-steps per second of the simulation; fine enough that the cadence lands cleanly. */
const RECOIL_TICK = 240;
export function recoilCurve(weapon: WeaponSpec, rounds = RECOIL_ROUNDS): RecoilPoint[] {
  const state = createRecoil(), points: RecoilPoint[] = [{ round: 0, climb: 0 }];
  // The pattern index only steers the horizontal walk, but it costs nothing to
  // simulate the weapon that is actually in hand.
  const family = Math.max(0, FPS_WEAPONS.findIndex(entry => entry.id === weapon.id));
  const between = Math.max(1, Math.round(weapon.interval * RECOIL_TICK));
  let aim = 0;
  for (let round = 1; round <= Math.max(1, rounds); round++) {
    recordRecoilShot(state, weapon, family, () => .5);
    aim += takeAimPush(state).pitch;
    for (let tick = 0; tick < between; tick++) { advanceRecoil(state, 1 / RECOIL_TICK); aim += takeAimPush(state).pitch; }
    points.push({ round, climb: aim * 180 / Math.PI });
  }
  return points;
}
/** Rounds a burst may run before the climb leaves the eased opening. */
export const RECOIL_BURST = CLIMB_EASE_ROUNDS;
/**
 * How wide a drill target stands, in degrees, at a nominal engagement range.
 * The climb chart is unreadable as bare degrees — this is the line that says
 * whether a burst is still on the thing it was aimed at. Radius and ranges come
 * from the targets the engine builds; 20 units sits mid-way down the drill.
 */
export const TARGET_RADIUS = 0.24, TARGET_RANGE = 20;
export const targetArc = (radius = TARGET_RADIUS, range = TARGET_RANGE) =>
  2 * Math.atan(radius / range) * 180 / Math.PI;
