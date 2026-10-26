import type { ShopItem } from './armory-catalog';
import type { ArenaSide } from './arena-factions';

/**
 * A bot's grade, drawn again at every spawn like its rifle: a respawn is a
 * fresh soldier off the transport. The role says what job they do; the rank
 * says how well they do it and what the quartermaster gave them for it. It
 * shows as the title before their name, chevrons on the label and the right
 * sleeve, and the kit they wear: recruits go without plates or a pack,
 * veterans wear plates, a pack and shades.
 */
export type BotRankId = 'recruit' | 'regular' | 'veteran';
export interface BotRank {
  id: BotRankId;
  /** 1 to 3, also the chevrons shown. */
  grade: 1 | 2 | 3;
  /** Before the name on the label and in the feed. Forces titles follow SAF ranks. */
  title: Readonly<Record<ArenaSide, string>>;
  /** Multiplier on the role's aim error. */
  aim: number;
  /** Seconds added to the role's reaction on first sight of a target. */
  reaction: number;
  /** Share of a moving target's travel during the round's flight the bot aims ahead by. */
  lead: number;
  /** Multiplier on the role's armour. */
  armor: number;
  /** Field dressings carried beyond the role's own. */
  medkits: number;
  /** Multiplier on each armament choice's weight, by the variant's catalog tier. */
  /** Weights by rarity. Enemy issue goes no higher than Elite; the kitted tiers above it are shop-only. */
  kit: Readonly<Record<Extract<ShopItem['tier'], 'Issued' | 'Field' | 'Elite'>, number>>;
}

export const BOT_RANKS: readonly BotRank[] = [
  { id: 'recruit', grade: 1, title: { forces: 'Pte', opposition: 'Recruit' }, aim: 1.4, reaction: .25, lead: .3, armor: .6, medkits: 0, kit: { Issued: 2, Field: 1, Elite: .25 } },
  { id: 'regular', grade: 2, title: { forces: 'Cpl', opposition: 'Operator' }, aim: 1, reaction: 0, lead: .6, armor: 1, medkits: 0, kit: { Issued: 1, Field: 1, Elite: 1 } },
  { id: 'veteran', grade: 3, title: { forces: 'Sgt', opposition: 'Veteran' }, aim: .75, reaction: -.15, lead: .85, armor: 1.4, medkits: 1, kit: { Issued: .5, Field: 1, Elite: 3 } },
];
export const getBotRank = (grade: number) => BOT_RANKS.find(rank => rank.grade === grade);

/**
 * Share of recruits, regulars and veterans at a side's strength (0–1, see
 * faction-heat): a quiet district is mostly recruits, a surging side sends
 * its veterans. Without heat a side is taken to be at half strength.
 */
export function rankMix(strength = .5): readonly [number, number, number] {
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : .5));
  return [.45 - .3 * s, .4, .15 + .3 * s];
}
export function drawRank(strength: number | undefined, random: () => number): BotRank {
  const mix = rankMix(strength);
  let roll = random();
  return BOT_RANKS.find((_, i) => (roll -= mix[i]) <= 0) ?? BOT_RANKS[BOT_RANKS.length - 1];
}
