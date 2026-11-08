import { getArenaRole } from './arena-roles';
import { applyArmorDamage } from './armory-state';
import { insertTraits, type ThreatClass } from './armor-inserts';

export const RANGE_DAMAGE_IDLE_SECONDS = 8;
export interface RangeArmorTier { label: string; health: number; armor: number; absorption: number; stops?: ThreatClass; color: string }
/** Base enemy equipment: rank and sector heat can further change live enemies. */
export const RANGE_ARMOR_TIERS: readonly RangeArmorTier[] = [
  { label: 'Tier 0 · Unarmored', health: 100, armor: 0, absorption: 0, color: '#d6e3e8' },
  ...([
    ['sniper', 'Tier 1 · Light', '#87d5ab'],
    ['assault', 'Tier 2 · Assault', '#78caff'],
    ['tank', 'Tier 3 · Heavy', '#e7bb70'],
    ['elite-commander', 'Tier 4 · Commander', '#e49ae0'],
  ] as const).map(([id, label, color]) => {
    const { health, armor, absorption, stops } = getArenaRole(id)!;
    return { label, color, health, armor, absorption, stops };
  }),
];
export interface RangeDamageMeter { last: number; total: number; lastArmor: number; totalArmor: number; firstHitAt: number | null; lastHitAt: number | null }
export const createRangeDamageMeter = (): RangeDamageMeter => ({ last: 0, total: 0, lastArmor: 0, totalArmor: 0, firstHitAt: null, lastHitAt: null });
/** Average health damage per active-play second in this burst, including time between hits.
 * A one-second minimum avoids infinite/huge rates on the opening hit. */
export function rangeDamageDps(meter: RangeDamageMeter, now: number) {
  if (meter.firstHitAt === null || meter.lastHitAt === null || now - meter.lastHitAt >= RANGE_DAMAGE_IDLE_SECONDS) return 0;
  return meter.total / Math.max(1, now - meter.firstHitAt);
}
export function expireRangeDamage(meter: RangeDamageMeter, now: number) {
  if (meter.lastHitAt === null || now - meter.lastHitAt < RANGE_DAMAGE_IDLE_SECONDS) return false;
  Object.assign(meter, createRangeDamageMeter());
  return true;
}
export function damageRangeDummy(meter: RangeDamageMeter, tier: RangeArmorTier, health: number, armor: number, amount: number, now: number, caliberMm?: number, shred = 0) {
  expireRangeDamage(meter, now);
  const result = applyArmorDamage(health, armor, amount * (1 - shred), tier.absorption, { insert: insertTraits(tier), caliberMm });
  result.health = Math.max(0, result.health - amount * shred);
  meter.firstHitAt ??= now;
  meter.last = health - result.health; meter.total += meter.last;
  meter.lastArmor = armor - result.armor; meter.totalArmor += meter.lastArmor; meter.lastHitAt = now;
  return result;
}
export const rangeDamageNumber = (value: number) => Number(value.toFixed(1)).toString();
