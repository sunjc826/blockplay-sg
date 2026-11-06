/**
 * The HUD animates without ever lying about the numbers a player acts on: the
 * magazine and health digits are the engine's own, and the motion is carried
 * by bars that trail them.
 *
 * A reload is the single exception, while its fresh magazine goes in: from
 * `start` to `commit` the count climbs to what the reload will transfer and
 * lands on it exactly when the engine does. Nothing can be fired on the
 * climbing digits: a trigger pull interrupts the reload first, and stopped
 * short of its commit point the reload transferred nothing, so the digits
 * snap back to the true count the shot is taken from.
 */

/**
 * What the magazine reads mid-reload. It climbs to what the reload will really
 * transfer, which is the capacity or whatever the reserve can spare, so the
 * count lands on the engine's number rather than snapping to it. `start` and
 * `commit` are the shares of the reload where the climb begins and lands.
 */
export function magazineDisplay(magazine: number, capacity: number, reserve: number, reloading: number, start = 0, commit = 1) {
  if (!(reloading > 0)) return magazine;
  const transfer = Math.min(Math.max(0, capacity - magazine), Math.max(0, reserve));
  // `reloading` is the share of the reload still to run, so progress is its complement.
  const progress = 1 - Math.min(1, reloading), climb = commit > start ? (progress - start) / (commit - start) : 1;
  // Landed: the engine's count is the true one from here, even as a round moves into the chamber.
  if (climb >= 1) return magazine;
  return Math.round(magazine + transfer * Math.max(0, climb));
}

/** Bars are scaled with a transform rather than a width, so they need 0..1. */
export const fillFraction = (value: number, max: number) => max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

export type HitWeight = 'light' | 'hard' | 'heavy';
export type HitPulse = { weight: HitWeight; health: boolean; armor: boolean };
/** What the vitals last answered: values at the last pulse (or the last rise), and when it played. */
export type HitTracker = { health: number; armor: number; at: number };

/** A light pulse waits this long after the last pulse, so a gas cloud's steady drain pulses rather than buzzes. */
export const HIT_PULSE_GAP_MS = 320;

export const hitTracker = (health: number, armor: number): HitTracker => ({ health, armor, at: -Infinity });

/** How hard a loss reads, as a share of full health: armor soaking a hit still counts, as it is still a hit. */
export function hitWeight(lost: number, maxHealth: number): HitWeight {
  const share = maxHealth > 0 ? lost / maxHealth : 1;
  return share >= .2 ? 'heavy' : share >= .06 ? 'hard' : 'light';
}

/**
 * Decides whether the vitals should play a hit. Loss is measured from the last
 * pulse, so a drain of fractions per frame still adds up to a point and pulses.
 * Only a light loss waits for the last pulse to finish; every real hit replays
 * at once, so a burst reads as a burst and a rifle hit inside a gas cloud
 * still lands as one. Healing or a respawn moves the baseline up silently.
 */
export function nextHitPulse(tracker: HitTracker, health: number, armor: number, maxHealth: number, now: number): { tracker: HitTracker; pulse: HitPulse | null } {
  // Anything that went up moves its baseline up, so regeneration never banks a later "loss".
  const baseHealth = Math.max(tracker.health, health), baseArmor = Math.max(tracker.armor, armor);
  const healthLost = baseHealth - health, armorLost = baseArmor - armor, lost = healthLost + armorLost;
  const settled = { ...tracker, health: baseHealth, armor: baseArmor };
  if (lost < 1) return { tracker: settled, pulse: null };
  const weight = hitWeight(lost, maxHealth);
  if (weight === 'light' && now - tracker.at < HIT_PULSE_GAP_MS) return { tracker: settled, pulse: null };
  return { tracker: { health, armor, at: now }, pulse: { weight, health: healthLost >= .5, armor: armorLost >= .5 } };
}
