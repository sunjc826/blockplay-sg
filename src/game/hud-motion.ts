/**
 * The HUD animates without ever lying about the numbers a player acts on: the
 * magazine and health digits are the engine's own, and the motion is carried
 * by bars that trail them.
 *
 * A reload is the single exception, and only because firing is blocked for its
 * whole duration — `weaponFire` refuses while `reloadRemaining > 0`, so no
 * decision rests on the digits during that window, and watching the magazine
 * refill is the point of it.
 */

/**
 * What the magazine reads mid-reload. It climbs to what the reload will really
 * transfer, which is the capacity or whatever the reserve can spare, so the
 * count lands on the engine's number rather than snapping to it.
 */
export function magazineDisplay(magazine: number, capacity: number, reserve: number, reloading: number) {
  if (!(reloading > 0)) return magazine;
  const transfer = Math.min(Math.max(0, capacity - magazine), Math.max(0, reserve));
  // `reloading` is the share of the reload still to run, so progress is its complement.
  return Math.round(magazine + transfer * (1 - Math.min(1, reloading)));
}

/** Bars are scaled with a transform rather than a width, so they need 0..1. */
export const fillFraction = (value: number, max: number) => max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
