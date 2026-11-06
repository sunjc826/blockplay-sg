/**
 * Flinch: being shot throws your aim. Two parts, as with recoil (fps-recoil):
 *
 * 1. **A view snap** the camera shows and then settles from, render-only like
 *    the firing rattle (firearm-camera-shake), so gameplay rays never see it.
 *    Off under reduced motion.
 * 2. **An aim nudge**: a hit moves the player's real pitch and yaw a little,
 *    and nothing hands it back. That is the part that costs something: a
 *    duel you are losing pulls your sights off the other person, so staying
 *    in the open under fire is worse than the damage alone.
 *
 * The nudge is mostly up, with a sideways part pushed away from the side the
 * round came from (hit from the right, the view turns left) and a little
 * random yaw so a hit from straight ahead still wanders. Its size follows the
 * damage: a rifle round is about half a degree, a hit for half a health bar
 * or a blast the full figure below.
 */
export const FLINCH = {
  /** Radians of real aim at full strength: about 1.15 degrees up, .6 sideways. */
  aimPitch: .02,
  aimYaw: .0105,
  /** Radians the view snaps at full strength on top of that, and settles back. */
  viewPitch: .03,
  viewYaw: .016,
  viewRoll: .035,
  /** The snap peaks here, in seconds, and is gone by `seconds`. */
  peak: .045,
  seconds: .4,
  /** Hits for less than this, in health and armor lost, do not flinch (gas, a graze). */
  minimumDamage: 3,
} as const;

export interface FlinchPose { pitch: number; yaw: number; roll: number }
const ZERO: FlinchPose = { pitch: 0, yaw: 0, roll: 0 };

/**
 * How hard a hit flinches, 0 to 1: zero under `minimumDamage`, then rising to
 * full at half a health bar. A blast always flinches fully.
 */
export function flinchStrength(damage: number, maxHealth = 100, blast = false) {
  if (!Number.isFinite(damage) || damage < FLINCH.minimumDamage) return 0;
  if (blast) return 1;
  return Math.max(.2, Math.min(1, damage / Math.max(1, maxHealth) * 2));
}

/**
 * Where a hit pushes the aim. `bearing` is where it came from, clockwise from
 * straight ahead (fps-hit-direction's `hitBearing`), or undefined when unknown.
 * `random` is in [0, 1). Positive yaw turns left, positive pitch looks up.
 */
export function flinchAim(strength: number, bearing: number | undefined, random: number): FlinchPose {
  if (!(strength > 0)) return ZERO;
  const s = Math.min(1, strength), jitter = (random - .5) * 2;
  const away = bearing === undefined || !Number.isFinite(bearing) ? 0 : Math.sin(bearing);
  return {
    pitch: FLINCH.aimPitch * s * (.75 + .25 * Math.abs(jitter)),
    yaw: FLINCH.aimYaw * s * (away * .7 + jitter * (1 - .7 * Math.abs(away))),
    roll: 0,
  };
}

/** The view snap: rises to `peak`, then eases out until `seconds`. */
export function flinchEnvelope(age: number) {
  if (!(age >= 0) || age >= FLINCH.seconds) return 0;
  if (age < FLINCH.peak) return Math.sin(age / FLINCH.peak * Math.PI / 2);
  const t = (age - FLINCH.peak) / (FLINCH.seconds - FLINCH.peak);
  return (1 - t) ** 2;
}

export function createFlinch() {
  let age: number = FLINCH.seconds, strength = 0;
  let direction: FlinchPose = ZERO, push: FlinchPose = ZERO;
  return {
    reset() { age = FLINCH.seconds; strength = 0; direction = ZERO; push = ZERO; },
    /** A hit landed; see `flinchAim` for `bearing` and `random`. Returns the aim it adds. */
    hit(value: number, bearing?: number, random = Math.random()): FlinchPose {
      if (!(value > 0)) return ZERO;
      const aim = flinchAim(value, bearing, random);
      // A hit during the snap refreshes it rather than stacking a second one.
      const remaining = flinchEnvelope(age);
      strength = Math.max(strength * remaining, Math.min(1, value));
      const sideways = aim.yaw / FLINCH.aimYaw / Math.max(.01, Math.min(1, value));
      direction = { pitch: 1, yaw: sideways, roll: -Math.sign(sideways || (random < .5 ? -1 : 1)) };
      age = 0;
      push = { pitch: push.pitch + aim.pitch, yaw: push.yaw + aim.yaw, roll: 0 };
      return aim;
    },
    advance(dt: number) { if (Number.isFinite(dt) && dt > 0) age = Math.min(FLINCH.seconds, age + dt); },
    /** Aim owed to the engine since the last call, which then owns it for good. */
    takeAim(): FlinchPose { const owed = push; push = ZERO; return owed; },
    /** The render-only snap. Smaller through a magnified sight, so a scope does not swing off the screen. */
    sample(magnification = 1, reducedMotion = false): FlinchPose {
      const amount = strength * flinchEnvelope(age);
      if (reducedMotion || !(amount > 0)) return ZERO;
      const zoom = Number.isFinite(magnification) ? Math.max(1, magnification) : 1, scale = amount / Math.sqrt(zoom);
      return { pitch: FLINCH.viewPitch * scale * direction.pitch, yaw: FLINCH.viewYaw * scale * direction.yaw, roll: FLINCH.viewRoll * scale * direction.roll };
    },
  };
}

export const addPoses = (a: FlinchPose, b: FlinchPose): FlinchPose => ({ pitch: a.pitch + b.pitch, yaw: a.yaw + b.yaw, roll: a.roll + b.roll });
