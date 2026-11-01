/** One short tuck, shoulder roll and recovery after a moving Humvee exit. */
export const BAILOUT_ROLL_SECONDS = .9;
export function bailoutRoll(age: number | undefined, reducedMotion = false) {
  const active = age !== undefined && Number.isFinite(age) && age >= 0 && age < BAILOUT_ROLL_SECONDS;
  const progress = active ? age / BAILOUT_ROLL_SECONDS : 0;
  const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
  const tuck = active ? smooth(progress / .18) * (1 - smooth((progress - .72) / .28)) : 0;
  const turn = smooth((progress - .15) / .6);
  const motion = reducedMotion ? 0 : tuck;
  return {
    active, tuck, angle: active && turn > 0 ? -Math.PI * 2 * turn : 0,
    // Keep the first person horizon readable while the world body completes the roll.
    eyeDrop: motion * .85, pitch: motion > 0 ? -motion * .55 : 0,
    bank: motion > 0 ? Math.sin(turn * Math.PI * 2) * motion * .32 : 0,
    weaponDrop: tuck * .65,
  };
}
