/**
 * Aim assist for the thumb, and only for the thumb.
 *
 * A drag across glass cannot make the half-degree corrections a mouse can, so a
 * phone shooter without help loses most fights to the input rather than to the
 * other player. The help here is deliberately small, and it has one rule that
 * keeps recoil meaningful: **it only bends the thumb's own movement.** With the
 * thumb still, the assist does nothing at all, so a burst climbs off a target
 * exactly as far as it would without it and still has to be pulled back down.
 *
 * Inside a small cone around a visible target the thumb's travel is reshaped:
 *
 * - **Slowdown.** Movement carrying the sights *away* from the target, or
 *   across it, is damped. A thumb that overshoots, or wobbles while holding a
 *   torso, stays nearer to it. This is also the only part that touches a burst:
 *   pulling down *past* the target is resisted a little, which is the
 *   over-correction a thumb makes, not the climb itself.
 * - **Pull.** Movement *towards* the target is lengthened slightly, never past
 *   the target, so a flick lands closer. It is switched off while the trigger is
 *   held: dragging the sights back down against a climb is entirely the
 *   player's work, which is what the recoil model is asking of them.
 *
 * Both fade from full strength on the target to nothing at the cone's edge, so
 * there is no ledge to feel, and the cone scales with the target's size on
 * screen — a distant figure gets a narrow cone rather than a free hit.
 *
 * All angles are radians in screen space: x is right, y is up.
 */
export interface AssistContact {
  /** Angle from the aim to the target, positive left (the engine's yaw sense). */
  yawError: number;
  /** Angle from the aim to the target, positive up. */
  pitchError: number;
  /** Half-width the target subtends, so near figures get a wider cone. */
  angularRadius: number;
}

/** How many of the target's own radii the cone reaches out to. */
export const ASSIST_CONE_RADII = 2.5;
/** The cone never shrinks below this, so a distant figure is still helped a little. */
export const ASSIST_CONE_MIN = 0.021; // ~1.2°
/** Nor grows past this, so a figure at arm's length does not grab the whole screen. */
export const ASSIST_CONE_MAX = 0.087; // ~5°
/** Share of away-and-across travel removed at the centre of the cone. */
export const ASSIST_SLOWDOWN = 0.3;
/** Share of towards travel added at the centre of the cone, off the trigger only. */
export const ASSIST_PULL = 0.2;
/** Past this the assist ignores a target outright. */
export const ASSIST_RANGE = 90;

export const assistCone = (angularRadius: number) =>
  Math.max(ASSIST_CONE_MIN, Math.min(ASSIST_CONE_MAX, (Number.isFinite(angularRadius) ? angularRadius : 0) * ASSIST_CONE_RADII));

/** 1 on the target, 0 at the cone's edge and beyond, eased so the edge has no step. */
export function assistStrength(contact: AssistContact | null | undefined) {
  if (!contact) return 0;
  const error = Math.hypot(contact.yawError, contact.pitchError);
  if (!Number.isFinite(error)) return 0;
  const t = Math.max(0, 1 - error / assistCone(contact.angularRadius));
  return t * t * (3 - 2 * t);
}

/**
 * The thumb's look travel after the assist, both in the engine's yaw/pitch
 * radians. `pitch` is the current pitch, because a step of yaw sweeps less of
 * the screen the further the sights are tilted from the horizon.
 */
export function assistLook(dYaw: number, dPitch: number, pitch: number, contact: AssistContact | null | undefined, firing: boolean) {
  const strength = assistStrength(contact);
  if (!contact || strength === 0 || !Number.isFinite(dYaw) || !Number.isFinite(dPitch)) return { yaw: dYaw, pitch: dPitch };
  // Into screen space. The look limit stops short of the poles, so this cosine never reaches zero.
  const cos = Math.max(0.2, Math.cos(pitch));
  const x = -dYaw * cos, y = dPitch;
  const ex = -contact.yawError, ey = contact.pitchError, error = Math.hypot(ex, ey);
  let nx: number, ny: number;
  if (error < 1e-6) {
    // Dead on: every direction leads off the target.
    nx = x * (1 - ASSIST_SLOWDOWN * strength); ny = y * (1 - ASSIST_SLOWDOWN * strength);
  } else {
    const ux = ex / error, uy = ey / error;
    const along = x * ux + y * uy, acrossX = x - along * ux, acrossY = y - along * uy;
    const damp = 1 - ASSIST_SLOWDOWN * strength;
    // Never carry the sights past the target on the assist's account.
    const toward = along > 0
      ? along + (firing ? 0 : Math.min(along * ASSIST_PULL * strength, Math.max(0, error - along)))
      : along * damp;
    nx = ux * toward + acrossX * damp; ny = uy * toward + acrossY * damp;
  }
  return { yaw: -nx / cos, pitch: ny };
}
