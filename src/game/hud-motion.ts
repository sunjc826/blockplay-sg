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
