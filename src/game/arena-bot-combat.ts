import type { WeaponSpec } from './fps-rules';

/**
 * How a bot handles its own weapon and its own wounds. The arena owns when a
 * bot sees someone; this owns what its hands do about it, from the figures of
 * the variant it was issued, so a G36 burst and an MG4 burst differ the way the
 * guns do.
 */
export const BOT_HEAL = {
  /** Seconds to apply a field dressing, kneeling, weapon lowered. */
  seconds: 3.2,
  /** Share of maximum health a dressing restores. */
  restore: .55,
  /** Below this share of health a bot carrying a dressing wants to use it. */
  threshold: .5,
  /** Seconds without a hit before a bot out of sight starts patching up. */
  quiet: .8,
  /** Below this share a bot will patch up even with an enemy in view, once the hits stop. */
  desperate: .25,
  /** Seconds without a hit before a desperate bot patches up in view. */
  desperateQuiet: 2.5,
  /** Kneeling eye height while applying it. */
  kneelEye: 1.15,
} as const;

export interface BotHealContext { health: number; healthMax: number; medkits: number; sinceHurt: number; visible: boolean; danger: boolean }
/**
 * `heal` starts a dressing now; `retreat` backs off to break line of sight
 * first; `false` fights on.
 */
export function botWantsHeal({ health, healthMax, medkits, sinceHurt, visible, danger }: BotHealContext): 'heal' | 'retreat' | false {
  if (medkits <= 0 || danger || !(healthMax > 0) || health <= 0 || health >= healthMax * BOT_HEAL.threshold) return false;
  if (!visible) return sinceHurt >= BOT_HEAL.quiet ? 'heal' : 'retreat';
  return health < healthMax * BOT_HEAL.desperate && sinceHurt >= BOT_HEAL.desperateQuiet ? 'heal' : 'retreat';
}

/**
 * Time between rounds inside a burst: the weapon's own cycle, plus the slack of
 * a trigger finger and a muzzle being brought back onto the target.
 */
export const botFireCadence = (spec: Pick<WeaponSpec, 'interval' | 'recoil'>) => spec.interval * (1.2 + Math.min(.6, spec.recoil * 6));

/**
 * The cone of one round in a burst: the role's base aim error, opened by every
 * round already fired at the weapon's own recoil, and tightened by a magnified
 * sight on the opening round.
 */
export function botShotSpread(base: number, spec: Pick<WeaponSpec, 'recoil' | 'optic'>, fired: number) {
  const optic = spec.optic === 'integrated' || spec.optic === 'precision' ? .85 : 1;
  return base * optic * (1 + Math.max(0, fired) * spec.recoil * 9);
}
