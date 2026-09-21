/**
 * Recoil in two stages. A shot adds an impulse to a *target* offset; what the
 * camera and the viewmodel actually use chases that target fast, while the
 * target itself decays back to rest slowly. The gap between those two rates is
 * the whole effect — the muzzle snaps up as the round leaves and then settles —
 * where a single damped scalar can only ever slide back down from an instant
 * jump.
 *
 * Horizontal travel comes from a fixed per-weapon pattern rather than noise, so
 * a burst walks the same way every time and can be learned and held against;
 * only a small jitter is random.
 *
 * Units are the engine's previous `kick` scalar, and the view still couples
 * through `VIEW_SCALE`, so a burst costs the same aim displacement it always
 * did. Shot spread stays owned by `fps-accuracy`; nothing here widens a cone.
 */
export interface RecoilState {
  /** Where the recoil is pushing, in kick units. Impulses land here. */
  pitchTarget: number; yawTarget: number; punchTarget: number; rollTarget: number;
  /** What the camera and viewmodel read; chases the target above. */
  pitch: number; yaw: number; punch: number; roll: number;
  /** Shots fired since the last pause, which indexes the pattern. */
  shot: number;
  /** Seconds since the last shot; past `BURST_RESET` the pattern restarts. */
  idle: number;
}

/** Radians of camera rotation per unit of kick, unchanged from the old coupling. */
export const VIEW_SCALE = 0.22;
/** Ceilings on accumulated recoil, so a long burst settles instead of climbing away. */
export const PITCH_CEILING = 0.10, YAW_CEILING = 0.055;
/** Seconds of held fire before the horizontal pattern starts over. */
export const BURST_RESET = 0.32;
const RISE = 30, RECOVER = 8.5, PUNCH_RISE = 26, PUNCH_RECOVER = 11.5;

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

export const createRecoil = (): RecoilState => ({ pitchTarget: 0, yawTarget: 0, punchTarget: 0, rollTarget: 0, pitch: 0, yaw: 0, punch: 0, roll: 0, shot: 0, idle: BURST_RESET });

export function resetRecoil(state: RecoilState) {
  state.pitchTarget = state.yawTarget = state.punchTarget = state.rollTarget = 0;
  state.pitch = state.yaw = state.punch = state.roll = 0;
  state.shot = 0; state.idle = BURST_RESET;
}

/** `recoil` is the resolved weapon spec's rating, so armoury parts carry straight through. */
export function recordRecoilShot(state: RecoilState, recoil: number, weapon: number, random: () => number = Math.random) {
  const rating = Math.max(0, recoil);
  const pattern = PATTERNS[weapon] ?? PATTERNS[0];
  const lateral = pattern[state.shot % pattern.length] * 1.15 + (random() * 2 - 1) * 0.3;
  state.pitchTarget = Math.min(PITCH_CEILING, state.pitchTarget + rating * verticalProfile(state.shot));
  state.yawTarget = Math.max(-YAW_CEILING, Math.min(YAW_CEILING, state.yawTarget + rating * lateral));
  state.punchTarget = Math.min(PITCH_CEILING, state.punchTarget + rating * 1.25);
  // The weapon rolls away from the side it is being pushed towards.
  state.rollTarget = Math.max(-YAW_CEILING, Math.min(YAW_CEILING, state.rollTarget - rating * lateral * 1.6));
  state.shot++; state.idle = 0;
}

export function advanceRecoil(state: RecoilState, dt: number) {
  const step = Math.max(0, Math.min(dt, 0.25));
  state.idle += step;
  if (state.idle >= BURST_RESET) state.shot = 0;
  const settle = Math.exp(-RECOVER * step), punchSettle = Math.exp(-PUNCH_RECOVER * step);
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
