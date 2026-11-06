import type { WeaponSpec } from './fps-rules';
import { BOT_DIFFICULTIES, type BotDifficulty } from './bot-difficulty';

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

/** Aim error is angular, so a tighter settled cone also improves distant shots. */
export const BOT_AIM = {
  openingGrace: .5,
  targetMotion: .07,
  ownMotion: .35,
  memoryGrace: .3,
  memorySeconds: 1.5,
  controlledRange: 35,
  shooters: 2,
  shooterHold: .5,
} as const;

/** Absolute multipliers of role spread: rough opening, tracking, then fine aim. */
export function botAimScale(focus: number, transverseSpeed: number, ownStride: number, range = 35, difficulty: BotDifficulty = 'normal') {
  const profile = BOT_DIFFICULTIES[difficulty], time = Math.max(0, focus);
  const acquire = Math.max(0, Math.min(1, (time - BOT_AIM.openingGrace) / (profile.acquire - BOT_AIM.openingGrace)));
  // Ease out the large opening error quickly, then refine the final aim slowly.
  const opening = profile.tracking + (profile.opening - profile.tracking) * (1 - acquire) ** 2;
  const refine = Math.max(0, Math.min(1, (time - profile.acquire) / (profile.settle - profile.acquire)));
  const error = opening + (profile.settled - profile.tracking) * refine;
  const tracking = Math.min(7, Math.max(0, transverseSpeed)) * Math.min(1, 35 / Math.max(1, range));
  return error * (1 + BOT_AIM.targetMotion * tracking) * (1 + BOT_AIM.ownMotion * Math.min(1, Math.max(0, ownStride)));
}

export interface BotAimFocus { target: string; exposure: number; unseen: number }
/** No tracking through cover: retain a brief glimpse, then lose the accumulated aim. */
export function advanceBotAimFocus(previous: BotAimFocus | undefined, target: string | undefined, dt: number): BotAimFocus | undefined {
  const step = Math.max(0, dt);
  if (target) return previous?.target === target
    ? { target, exposure: Math.min(5, previous.exposure + step), unseen: 0 }
    : { target, exposure: 0, unseen: 0 };
  if (!previous) return undefined;
  const unseen = previous.unseen + step;
  if (unseen >= BOT_AIM.memorySeconds) return undefined;
  const decayTime = Math.max(0, unseen - BOT_AIM.memoryGrace) - Math.max(0, previous.unseen - BOT_AIM.memoryGrace);
  return { ...previous, unseen, exposure: Math.max(0, previous.exposure - decayTime * 5 / (BOT_AIM.memorySeconds - BOT_AIM.memoryGrace)) };
}

/** Sideways speed across the sightline; movement straight toward the bot is easier to track. */
export function botTransverseSpeed(direction: { x: number; z: number }, velocity?: { x: number; z: number }) {
  return velocity ? Math.abs(direction.x * velocity.z - direction.z * velocity.x) : 0;
}

/** Rifles use pairs at range; support weapons retain short suppressive bursts. */
export function botBurstLimit(role: string, range: number) {
  return range < BOT_AIM.controlledRange ? 12 : role === 'heavy' ? 8 : role === 'tank' ? 4 : 2;
}

/**
 * A bot that takes a hit flinches, as the player does (fps-flinch): its next
 * rounds go wide and its next shot comes a moment late, so winning the first
 * hit of a duel is worth something against a bot too. The body's flinch is
 * the character rig's; this is what it does to the aim.
 */
export const BOT_FLINCH = {
  /** Spread multiplier added at full strength, straight after the hit. */
  spread: 2.4,
  /** Seconds for the aim to come back. */
  seconds: .45,
  /** Seconds the next shot waits at full strength. Floors the wait rather than stacking, so fire never stops. */
  delay: .12,
  /** Hits for less than this, before armor, do not flinch (gas, a graze). */
  minimumDamage: 3,
} as const;

export interface BotFlinch { at: number; strength: number }
/** Strength of a hit for `damage` before armor: full at half a health bar, or for any blast. */
export function botFlinchStrength(damage: number, healthMax: number, blast = false) {
  if (!Number.isFinite(damage) || damage < BOT_FLINCH.minimumDamage) return 0;
  return blast ? 1 : Math.max(.2, Math.min(1, damage / Math.max(1, healthMax) * 2));
}
/** A new hit refreshes the flinch rather than stacking it. */
export function addBotFlinch(previous: BotFlinch | undefined, strength: number, now: number): BotFlinch | undefined {
  if (!(strength > 0)) return previous;
  return { at: now, strength: Math.max(Math.min(1, strength), botFlinchLeft(previous, now)) };
}
/** How much flinch is left `now`, 0 to 1, easing out over BOT_FLINCH.seconds. */
export function botFlinchLeft(flinch: BotFlinch | undefined, now: number) {
  if (!flinch) return 0;
  const t = (now - flinch.at) / BOT_FLINCH.seconds;
  return t < 0 || t >= 1 ? 0 : flinch.strength * (1 - t) ** 2;
}
/** Multiplier on a bot's shot spread while it flinches. */
export const botFlinchSpread = (flinch: BotFlinch | undefined, now: number) => 1 + BOT_FLINCH.spread * botFlinchLeft(flinch, now);
