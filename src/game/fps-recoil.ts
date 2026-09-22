/**
 * Recoil in two stages. A shot adds an impulse to a *target* offset; what the
 * camera and the viewmodel actually use chases that target fast, while the
 * target itself decays back to rest slowly. The gap between those two rates is
 * the whole effect — the muzzle snaps up as the round leaves and then settles —
 * where a single damped scalar can only ever slide back down from an instant
 * jump.
 *
 * Two ratings drive it, which is the split STALKER makes and the reason a kick
 * is answerable rather than merely large:
 *
 * - **`recoil`** is how hard one round throws the muzzle. It sets the size of
 *   every impulse below, so it is felt on the first shot of a burst.
 * - **`recoilRecovery`** is how fast the weapon comes back down, as a multiple
 *   of the baseline rate. It does nothing to a single shot and everything to a
 *   held trigger: the decay between rounds is what decides whether a burst
 *   converges low or stacks towards the ceiling.
 *
 * A heavy weapon can therefore kick hard and still be controllable, and a light
 * one can kick softly and still wander, which one number could not express.
 *
 * Horizontal travel comes from a fixed per-weapon pattern rather than noise, so
 * a burst walks the same way every time and can be learned and held against;
 * only a small jitter is random.
 *
 * Shot spread stays owned by `fps-accuracy`; nothing here widens a cone.
 */
/** What the weapon contributes. `WeaponSpec` satisfies this structurally. */
export interface RecoilRating { recoil: number; recoilRecovery?: number }
export interface RecoilState {
  /** Where the recoil is pushing, in kick units. Impulses land here. */
  pitchTarget: number; yawTarget: number; punchTarget: number; rollTarget: number;
  /** What the camera and viewmodel read; chases the target above. */
  pitch: number; yaw: number; punch: number; roll: number;
  /** Shots fired since the last pause, which indexes the pattern. */
  shot: number;
  /** Seconds since the last shot; past `BURST_RESET` the pattern restarts. */
  idle: number;
  /**
   * Recovery rating of the weapon whose kick is currently settling, so a swap
   * mid-settle finishes on the rate that put the muzzle up there.
   */
  recovery: number;
}

/** Radians of camera rotation per unit of kick. */
export const VIEW_SCALE = 0.22;
/**
 * Kick units a point of recoil rating buys, per axis. These are the knob for
 * how hard the game kicks: the ratings themselves stay the armoury's currency,
 * so raising a gain moves every weapon and every catalog delta together rather
 * than needing the catalog rewritten underneath it.
 */
const PITCH_GAIN = 3.2, YAW_GAIN = 3.2, PUNCH_GAIN = 2.2, ROLL_GAIN = 1.5;
/**
 * Ceilings on accumulated recoil, so a long burst settles instead of climbing
 * away. Sited above where the issued weapons converge, so they bound the worst
 * case rather than flattening the climb every weapon is meant to have.
 */
export const PITCH_CEILING = 0.34, YAW_CEILING = 0.15, PUNCH_CEILING = 0.22, ROLL_CEILING = 0.06;
/** Seconds of held fire before the horizontal pattern starts over. */
export const BURST_RESET = 0.32;
const RISE = 30, RECOVER = 4.2, PUNCH_RISE = 26, PUNCH_RECOVER = 11.5;
/** A rating outside this cannot stall the settle or snap it back instantly. */
export const RECOVERY_LIMITS = { min: 0.3, max: 3 };
export const recoveryRate = (rating: number) =>
  Number.isFinite(rating) ? Math.max(RECOVERY_LIMITS.min, Math.min(RECOVERY_LIMITS.max, rating)) : 1;

/**
 * Horizontal pattern per weapon, in multiples of the weapon's recoil rating.
 * The rifle climbs almost straight for three rounds then walks right and back
 * left; the support weapon wanders wider and sooner. Both repeat, which is what
 * makes a long burst answerable rather than merely noisy.
 */
const PATTERNS: readonly (readonly number[])[] = [
  [0, .08, -.05, .22, .34, .16, -.18, -.36, -.26, .06, .28, .30],
  [0, -.12, .18, .30, .14, -.20, -.34, -.22, .10, .32, .24, -.10],
];
/** The first round of a burst snaps hardest; the rest of the magazine settles lower. */
const verticalProfile = (shot: number) => 1.35 - 0.5 * Math.min(1, shot / 4);

export const createRecoil = (): RecoilState => ({ pitchTarget: 0, yawTarget: 0, punchTarget: 0, rollTarget: 0, pitch: 0, yaw: 0, punch: 0, roll: 0, shot: 0, idle: BURST_RESET, recovery: 1 });

export function resetRecoil(state: RecoilState) {
  state.pitchTarget = state.yawTarget = state.punchTarget = state.rollTarget = 0;
  state.pitch = state.yaw = state.punch = state.roll = 0;
  state.shot = 0; state.idle = BURST_RESET; state.recovery = 1;
}

/** The resolved weapon spec, so armoury parts and grips carry straight through. */
export function recordRecoilShot(state: RecoilState, spec: RecoilRating, weapon: number, random: () => number = Math.random) {
  const rating = Math.max(0, spec.recoil);
  state.recovery = recoveryRate(spec.recoilRecovery ?? 1);
  const pattern = PATTERNS[weapon] ?? PATTERNS[0];
  const lateral = pattern[state.shot % pattern.length] * 1.15 + (random() * 2 - 1) * 0.3;
  state.pitchTarget = Math.min(PITCH_CEILING, state.pitchTarget + rating * PITCH_GAIN * verticalProfile(state.shot));
  state.yawTarget = Math.max(-YAW_CEILING, Math.min(YAW_CEILING, state.yawTarget + rating * YAW_GAIN * lateral));
  state.punchTarget = Math.min(PUNCH_CEILING, state.punchTarget + rating * PUNCH_GAIN);
  // The weapon rolls away from the side it is being pushed towards.
  state.rollTarget = Math.max(-ROLL_CEILING, Math.min(ROLL_CEILING, state.rollTarget - rating * ROLL_GAIN * lateral));
  state.shot++; state.idle = 0;
}

export function advanceRecoil(state: RecoilState, dt: number) {
  const step = Math.max(0, Math.min(dt, 0.25));
  state.idle += step;
  if (state.idle >= BURST_RESET) state.shot = 0;
  // Recovery scales the decay of the target only. The chase towards it is how
  // fast the muzzle snaps up, which belongs to the impulse, not to the settle.
  const recovery = recoveryRate(state.recovery);
  const settle = Math.exp(-RECOVER * recovery * step), punchSettle = Math.exp(-PUNCH_RECOVER * recovery * step);
  state.pitchTarget *= settle; state.yawTarget *= settle;
  state.punchTarget *= punchSettle; state.rollTarget *= punchSettle;
  const chase = 1 - Math.exp(-RISE * step), punchChase = 1 - Math.exp(-PUNCH_RISE * step);
  state.pitch += (state.pitchTarget - state.pitch) * chase;
  state.yaw += (state.yawTarget - state.yaw) * chase;
  state.punch += (state.punchTarget - state.punch) * punchChase;
  state.roll += (state.rollTarget - state.roll) * punchChase;
}

/** Camera offsets in radians. Pitch is negated by the caller's convention, not here. */
export const recoilView = (state: RecoilState) => ({ pitch: state.pitch * VIEW_SCALE, yaw: state.yaw * VIEW_SCALE });
/**
 * What the weapon does in the hands, before the camera takes its share. The
 * viewmodel carries the buck and the sideways half of the pattern; the engine
 * only decides how much of it aiming down the sights damps away.
 */
export const recoilPose = (state: RecoilState) => ({
  /** Metres the weapon travels back towards the shoulder. */
  push: state.punch * 0.6,
  pitch: state.punch, yaw: state.yaw * 0.5, roll: state.roll * 2.2,
});
