/** What the scope is doing this frame, in the shooter's own frame. */
export type ScopeMotion = {
  /** Metres a second to the shooter's right. */
  lateralSpeed: number;
  /** Metres a second upward: jumps, landings, stance changes. */
  verticalSpeed?: number;
  /** Radians a second turning right. */
  turnRate?: number;
  /** Radians a second looking up; recoil climb arrives here. */
  pitchRate?: number;
};

const AMPLITUDE = .18;
/** Share of the full offset a steady strafe or turn keeps holding. */
const SUSTAIN = .25;
/** Peak swing for a unit change of motion, before the spring's own loss. */
const KICK = 1.7;
const FREQUENCY = 14, DAMPING = .5;
const DECAY = FREQUENCY * DAMPING, RING = FREQUENCY * Math.sqrt(1 - DAMPING * DAMPING);
const STRAFE_SPEED = 2, VERTICAL_SPEED = 5, LOOK_RATE = 3;

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
 * sprung mass behind the scope: starts, stops, reversals, flicks, landings and
 * recoil swing the shadow in and it rings back out, leaving only a slight lean
 * while the motion continues. Only the shadow moves, never the aim. */
export function createScopeShadow() {
  const x = createAxis(), y = createAxis(), value = { x: 0, y: 0 };
  return {
    reset() { x.reset(); y.reset(); value.x = value.y = 0; },
    update(dt: number, motion: ScopeMotion, enabled: boolean) {
      if (!enabled) { this.reset(); return value; }
      const step = Math.min(Math.max(dt, 0), .1);
      value.x = x.update(step, unit(unit(motion.lateralSpeed / STRAFE_SPEED) + unit((motion.turnRate ?? 0) / LOOK_RATE)));
      value.y = y.update(step, unit(unit((motion.verticalSpeed ?? 0) / VERTICAL_SPEED) + unit((motion.pitchRate ?? 0) / LOOK_RATE)));
      return value;
    },
  };
}
