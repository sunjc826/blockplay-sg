/**
 * What the trigger does to a run. Fire beats sprint: while the trigger is held,
 * and for `SPRINT_RESUME` after it is let go, a player asking to sprint runs
 * instead, so a tap-fire burst does not flicker between the two. A pull that
 * breaks a sprint fires once the gun has come up, `SPRINT_OUT` later. Nothing
 * has to be let go for the run to come back, which matters on touch, where the
 * sprint is a stick pushed to the rim rather than a key the thumb can lift.
 */
export const SPRINT_RESUME = 0.25;
/** Shorter than the engine's trigger buffer, so a tap that breaks a sprint still fires. */
export const SPRINT_OUT = 0.12;
/** A pistol comes up sooner and a machine gun later, but never past the trigger buffer. */
export const SPRINT_OUT_RANGE = { min: .08, max: .16 } as const;

export interface SprintBreak { hold: number; raise: number }
export const createSprintBreak = (): SprintBreak => ({ hold: 0, raise: 0 });

/** `wasSprinting` is whether the player was sprinting last frame: only a pull from a sprint has a gun to raise. */
/** `raise` is how long this gun takes to come up out of the run: `SPRINT_OUT` for a rifle. */
export function advanceSprintBreak(state: SprintBreak, wantsSprint: boolean, trigger: boolean, wasSprinting: boolean, dt: number, raise = SPRINT_OUT) {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  state.raise = Math.max(0, state.raise - step);
  if (trigger) {
    if (wasSprinting) state.raise = raise;
    state.hold = SPRINT_RESUME;
  } else state.hold = Math.max(0, state.hold - step);
  return { sprint: wantsSprint && state.hold === 0, fire: trigger && state.raise === 0 };
}
