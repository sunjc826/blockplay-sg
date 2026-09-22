/**
 * Recoil in two stages. A shot adds an impulse to a *target* offset; what the
 * camera and the viewmodel actually use chases that target fast, while the
 * target itself decays back to rest slowly. The gap between those two rates is
 * the whole effect — the muzzle snaps up as the round leaves and then settles —
 * where a single damped scalar can only ever slide back down from an instant
 * jump.
 *
 * A kick has three parts here, and only the first two used to exist:
 *
 * 1. **The view kick**, below, which snaps and settles on its own.
 * 2. **The weapon's buck** in the hands, which `recoilPose` sizes.
 * 3. **The aim the weapon takes**, which is the part that makes recoil cost
 *    something. A shot moves the shooter's *actual* pitch and yaw, not just the
 *    rendered offset, so a burst has to be held down rather than watched. The
 *    weapon hands that aim back once the trigger is released — minus whatever
 *    the shooter already pulled down themselves, which `compensateRecoil`
 *    accounts for, so compensating a burst and then releasing does not drag the
 *    sights below the target by exactly what was pulled.
 *
 * Without part 3 recoil is decoration at any amplitude: it always returns to
 * precisely where you were aiming, so nothing is ever asked of the player.
 *
 * Two ratings drive all three, which is the split STALKER makes and the reason
 * a kick is answerable rather than merely large:
 *
 * - **`recoil`** is how hard one round throws the muzzle. It sets the size of
 *   every impulse below, so it is felt on the first shot of a burst.
 * - **`recoilRecovery`** is how fast the weapon comes back down, as a multiple
 *   of the baseline rate. It does nothing to a single shot and everything to a
 *   held trigger: the decay between rounds is what decides whether a burst
 *   converges low or stacks towards the ceiling, and it is also how quickly the
 *   weapon returns the aim it took.
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
  /** Radians of real aim the recoil has taken and not yet handed back. */
  climb: number; drift: number;
  /** Aim owed to the engine, in radians; `takeAimPush` drains it each frame. */
  pushPitch: number; pushYaw: number;
}

/** Radians of camera rotation per unit of kick. */
export const VIEW_SCALE = 0.22;
/**
 * Kick units a point of recoil rating buys, per axis. These are the knob for
 * how hard the game kicks: the ratings themselves stay the armoury's currency,
 * so raising a gain moves every weapon and every catalog delta together rather
 * than needing the catalog rewritten underneath it.
 */
const PITCH_GAIN = 4.5, YAW_GAIN = 4.5, PUNCH_GAIN = 3.2, ROLL_GAIN = 2;
/**
 * Radians of the shooter's own aim one point of recoil rating takes, before the
 * per-shot profile. This is the part that has to be answered with the mouse,
 * and `fps-recoil.test.ts` holds the figures it produces against what the genre
 * does, in degrees, because that is the only way to tell "a kick" from "a
 * number that moved". Roughly: a rifle round should displace the sights about
 * as far as a torso is wide at range, ten rounds should be unusable
 * uncompensated, and a magazine should end up pointing at the sky.
 */
const CLIMB_GAIN = 1.25;
/** The share of the horizontal pattern that moves the aim rather than the view. */
const DRIFT_SHARE = 0.6;
/**
 * How far the aim can be walked before the weapon stops taking more of it.
 * Spray patterns top out in every game that has them: past this the muzzle is
 * already pointing at the sky and further climb would only be unrecoverable.
 */
export const CLIMB_CEILING = 0.5, DRIFT_CEILING = 0.2;
/**
 * Seconds off the trigger before the weapon starts giving the aim back, and the
 * baseline rate it does so at. The delay sits above the slowest weapon's firing
 * interval, so sustained fire never recovers mid-burst while a released trigger
 * recovers almost at once.
 */
export const RECOVERY_DELAY = 0.25;
const AIM_RETURN = 2.4;
/**
 * Ceilings on accumulated recoil, so a long burst settles instead of climbing
 * away. Sited above where the issued weapons converge, so they bound the worst
 * case rather than flattening the climb every weapon is meant to have.
 */
export const PITCH_CEILING = 0.48, YAW_CEILING = 0.22, PUNCH_CEILING = 0.32, ROLL_CEILING = 0.085;
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

export const createRecoil = (): RecoilState => ({ pitchTarget: 0, yawTarget: 0, punchTarget: 0, rollTarget: 0, pitch: 0, yaw: 0, punch: 0, roll: 0, shot: 0, idle: BURST_RESET, recovery: 1, climb: 0, drift: 0, pushPitch: 0, pushYaw: 0 });

export function resetRecoil(state: RecoilState) {
  state.pitchTarget = state.yawTarget = state.punchTarget = state.rollTarget = 0;
  state.pitch = state.yaw = state.punch = state.roll = 0;
  state.shot = 0; state.idle = BURST_RESET; state.recovery = 1;
  state.climb = state.drift = state.pushPitch = state.pushYaw = 0;
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
  // And the part the shooter has to answer: the aim itself moves, up to the
  // ceiling, and is owed back to the engine on the next frame.
  const rise = Math.min(rating * CLIMB_GAIN * verticalProfile(state.shot), Math.max(0, CLIMB_CEILING - state.climb));
  state.climb += rise; state.pushPitch += rise;
  const drift = Math.max(-DRIFT_CEILING, Math.min(DRIFT_CEILING, state.drift + rating * CLIMB_GAIN * DRIFT_SHARE * lateral));
  state.pushYaw += drift - state.drift; state.drift = drift;
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
  // Off the trigger, the weapon gives the aim back at the rate its recovery
  // rating buys. Whatever the shooter already pulled down is no longer owed,
  // because `compensateRecoil` took it off the debt as they pulled.
  if (state.idle < RECOVERY_DELAY) return;
  const given = 1 - Math.exp(-AIM_RETURN * recovery * step);
  const back = state.climb * given, side = state.drift * given;
  state.climb -= back; state.pushPitch -= back;
  state.drift -= side; state.pushYaw -= side;
}

/**
 * The aim the recoil has taken or returned since the last frame, in radians,
 * handed over once. The engine owns `pitch` and `yaw`; this only ever tells it
 * how far to move them.
 */
export function takeAimPush(state: RecoilState) {
  const pitch = state.pushPitch, yaw = state.pushYaw;
  state.pushPitch = state.pushYaw = 0;
  return { pitch, yaw };
}
/**
 * The shooter's own look, offered back to the recoil so that pulling down pays
 * off the climb rather than banking it. Only movement *against* what the weapon
 * took counts: deliberately aiming higher mid-burst is not compensation, and
 * must not leave the weapon owing aim it never took.
 */
export function compensateRecoil(state: RecoilState, dPitch: number, dYaw: number) {
  if (dPitch < 0) state.climb = Math.max(0, state.climb + dPitch);
  if (state.drift > 0 && dYaw < 0) state.drift = Math.max(0, state.drift + dYaw);
  else if (state.drift < 0 && dYaw > 0) state.drift = Math.min(0, state.drift + dYaw);
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
