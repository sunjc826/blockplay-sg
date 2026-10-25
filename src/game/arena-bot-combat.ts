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

/**
 * How a bot's aim settles on someone. Rounds are hitscan and the bot tracks
 * its target's present position, so without these a strafing player is as
 * easy to hit as a standing one and the first round is as good as the tenth.
 */
export const BOT_AIM = {
  /** Settled aim error, as a multiple of the role's own `spread`. */
  settled: 1.5,
  /** Aim error on first sighting a target, as a multiple of the settled error. */
  opening: 4,
  /** Seconds of unbroken sight for the error to narrow to settled. */
  settle: 1.6,
  /** Extra error per m/s of the target's own speed: a walk (4.2) adds about 60%, a sprint (7) doubles it. */
  targetMotion: .15,
  /** Extra error while the bot is itself moving at its full stride. */
  ownMotion: .5,
  /** Most bots that may fire on one player at a time; the rest hold fire and keep moving. */
  shooters: 2,
  /** Seconds a bot keeps its turn on a player after it last had a shot. */
  shooterHold: .5,
} as const;

/**
 * Multiplier on a bot's base aim error: wide on first sight and narrowing over
 * `settle`, opened further by the target's speed and the bot's own.
 */
export function botAimScale(focus: number, targetSpeed: number, ownStride: number) {
  const settling = Math.max(0, 1 - Math.max(0, focus) / BOT_AIM.settle);
  return BOT_AIM.settled * (1 + (BOT_AIM.opening - 1) * settling) * (1 + BOT_AIM.targetMotion * Math.min(7, Math.max(0, targetSpeed))) * (1 + BOT_AIM.ownMotion * Math.min(1, Math.max(0, ownStride)));
}
