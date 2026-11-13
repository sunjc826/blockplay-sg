/** What the scope is doing this frame, in the shooter's own frame. */
export type ScopeMotion = {
  /** Metres a second to the shooter's right. */
  lateralSpeed: number;
  /** Metres a second upward: jumps, landings, stance changes. */
  verticalSpeed?: number;
  /** Shots fired since the last frame, as recoil strength where 1 is a heavy round. */
  jolt?: number;
};

/** The eye box in lens UVs: `radius` is where the shadow turns black, `soft` how far inside that it starts. */
export type ScopeEyeBox = { radius: number; soft: number; gain: number };

/** The aim point's clear disc: the shadow never enters this share of the lens UV, whatever throws it. */
export const SCOPE_CLEAR_CENTRE = .22;
const BOX_RADIUS = .51, TUNNEL = .09;

/** Higher power means a smaller exit pupil: a touchier eye box with a harder edge. */
export function scopeEyeBox(magnification: number, relief = 0): ScopeEyeBox {
  const power = Math.max(0, Math.min(1, (magnification - 2) / 6));
  return { radius: BOX_RADIUS - TUNNEL * Math.max(0, Math.min(1, relief)), soft: .15 - .07 * power, gain: .8 + .45 * power };
}

/** Eases an eye offset towards the furthest the box can travel while keeping
 * the clear centre, so the shadow slows into its limit rather than sticking. */
export function limitScopeEye(eye: { x: number; y: number }, box: ScopeEyeBox) {
  const limit = Math.max(.001, box.radius - box.soft - SCOPE_CLEAR_CENTRE), length = Math.hypot(eye.x, eye.y);
  if (length > 1e-6) { const scale = limit * Math.tanh(length / limit) / length; eye.x *= scale; eye.y *= scale; }
  return eye;
}

const AMPLITUDE = .18;
/** Share of the full offset a steady strafe or turn keeps holding. */
const SUSTAIN = .25;
/** Peak swing for a unit change of motion, before the spring's own loss. */
const KICK = 1.7;
const FREQUENCY = 14, DAMPING = .5;
const DECAY = FREQUENCY * DAMPING, RING = FREQUENCY * Math.sqrt(1 - DAMPING * DAMPING);
const STRAFE_SPEED = 2, VERTICAL_SPEED = 5;
/** Gravity changes vertical speed more gently than this; a jump or landing does not. */
const JOLT_RATE = 5;
const RELIEF_KICK = 1.8;

const unit = (value: number) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));

function createAxis() {
  let offset = 0, velocity = 0, drive: number | undefined;
  return {
    reset() { offset = velocity = 0; drive = undefined; },
    update(dt: number, next: number) {
      // The eye lags a change of motion, so the change is what throws the
      // shadow. A sight raised mid-strafe starts settled rather than kicked.
      velocity -= (next - (drive ?? next)) * AMPLITUDE * KICK * FREQUENCY;
      drive = next;
      // Closed-form underdamped spring: identical at any frame rate.
      const rest = -next * AMPLITUDE * SUSTAIN, y = offset - rest;
      const fade = Math.exp(-DECAY * dt), cos = Math.cos(RING * dt), sin = Math.sin(RING * dt);
      offset = rest + fade * (y * cos + (velocity + DECAY * y) / RING * sin);
      velocity = fade * (velocity * cos - (DECAY * velocity + FREQUENCY * FREQUENCY * y) / RING * sin);
      if (next === 0 && Math.abs(offset) < .0001 && Math.abs(velocity) < .001) offset = velocity = 0;
      return offset;
    },
  };
}

/** Visual eye-box lag in lens UVs. ADS damps the model's gait almost
 * completely, so the gun's own sway cannot supply a readable cue. The eye is a
 * sprung mass behind the scope: starts, stops, reversals, jumps and landings
 * swing the shadow in and it rings back out, leaving only a slight lean while
 * the motion continues. Turning is not modelled here: the aimed gun itself
 * trails a turn (`createAimedTurnLag`), and the lens reads that as real
 * misalignment. `relief` is the scope driven back at the eye by
 * a shot or a landing: 0 at rest, towards 1 as the picture tunnels in. Only
 * the shadow moves, never the aim. */
export function createScopeShadow() {
  const x = createAxis(), y = createAxis(), value = { x: 0, y: 0, relief: 0 };
  let relief = 0, reliefVelocity = 0, climb: number | undefined;
  return {
    reset() { x.reset(); y.reset(); value.x = value.y = value.relief = relief = reliefVelocity = 0; climb = undefined; },
    update(dt: number, motion: ScopeMotion, enabled: boolean) {
      if (!enabled) { this.reset(); return value; }
      const step = Math.min(Math.max(dt, 0), .1), vertical = unit((motion.verticalSpeed ?? 0) / VERTICAL_SPEED);
      value.x = x.update(step, unit(motion.lateralSpeed / STRAFE_SPEED));
      value.y = y.update(step, vertical);
      const landing = Math.max(0, Math.abs(vertical - (climb ?? vertical)) - JOLT_RATE * step);
      climb = vertical;
      reliefVelocity += (landing + Math.max(0, Math.min(1.5, motion.jolt ?? 0))) * RELIEF_KICK * FREQUENCY;
      const fade = Math.exp(-DECAY * step), cos = Math.cos(RING * step), sin = Math.sin(RING * step), from = relief;
      relief = fade * (from * cos + (reliefVelocity + DECAY * from) / RING * sin);
      reliefVelocity = fade * (reliefVelocity * cos - (DECAY * reliefVelocity + FREQUENCY * FREQUENCY * from) / RING * sin);
      if (Math.abs(relief) < .0001 && Math.abs(reliefVelocity) < .001) relief = reliefVelocity = 0;
      value.relief = Math.max(0, Math.min(1, relief));
      return value;
    },
  };
}

/** Furthest the aimed gun trails the view, in radians: about a degree and three quarters. */
export const AIMED_TURN_LAG_LIMIT = .03;
const TURN_SHARE = .12, TURN_RECOVERY = 5, TURN_FOLLOW = 8;

/** How far a scoped gun trails a turn, as a small yaw and pitch about its
 * eyepiece. The lens stays on the aim point, so the reticle never leaves the
 * shot; only the tube swings, which is what the shadow then shows. Two stages
 * keep it deliberate: the turn builds a trail that recovers slowly, and the gun
 * eases after that trail rather than snapping to each mouse movement. */
export function createAimedTurnLag() {
  let trailYaw = 0, trailPitch = 0;
  const value = { yaw: 0, pitch: 0 };
  const limit = (angle: number) => Math.max(-AIMED_TURN_LAG_LIMIT, Math.min(AIMED_TURN_LAG_LIMIT, Number.isFinite(angle) ? angle : 0));
  return {
    reset() { trailYaw = trailPitch = value.yaw = value.pitch = 0; },
    /** `yawDelta` and `pitchDelta` are how far the view turned this frame, in radians. */
    update(dt: number, yawDelta: number, pitchDelta: number, enabled: boolean) {
      if (!enabled) { this.reset(); return value; }
      const step = Math.min(Math.max(dt, 0), .1), recover = Math.exp(-TURN_RECOVERY * step), follow = 1 - Math.exp(-TURN_FOLLOW * step);
      trailYaw = limit(trailYaw - yawDelta * TURN_SHARE) * recover; trailPitch = limit(trailPitch - pitchDelta * TURN_SHARE) * recover;
      value.yaw += (trailYaw - value.yaw) * follow; value.pitch += (trailPitch - value.pitch) * follow;
      if (Math.abs(value.yaw) < 1e-6 && Math.abs(trailYaw) < 1e-6) value.yaw = trailYaw = 0;
      if (Math.abs(value.pitch) < 1e-6 && Math.abs(trailPitch) < 1e-6) value.pitch = trailPitch = 0;
      return value;
    },
  };
}
