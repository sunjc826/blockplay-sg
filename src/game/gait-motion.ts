/**
 * Pure gait and secondary-motion maths for the procedural character rig
 * (character-rig.ts). Presentation only: nothing here feeds movement, collision
 * or the network, and everything is a deterministic function of its inputs.
 *
 * The walk cycle is a stance/swing cycle rather than a sine. In stance the foot
 * moves back under the body in a straight line at exactly the body's speed, so
 * it stays planted on the ground; in swing it is carried forward on an eased
 * arc. That only works if the step fits the leg, so cadence rises with speed
 * (short legs take quick steps) instead of strides growing past the leg's reach.
 */

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const smoothstep = (edge0: number, edge1: number, x: number) => { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const GAIT = {
  /** Fraction of the cycle a foot is on the ground: a walk always has one down, a run has a flight phase. */
  walkDuty: .6, runDuty: .27,
  /** Ground a planted foot covers, hip-relative, limited by the .88 m leg. */
  walkStance: .62, runStance: .82,
  /** Speeds over which the walk turns into a run (m/s). */
  jogFrom: 1.6, runFrom: 4.2,
  /** Full left-right cycles per second: the cadence never drops to a crawl or rises to a blur. */
  minCadence: .7, maxCadence: 2.3,
  /** Half-length of the planted stretch no leg can exceed; past it, cadence is capped and feet slip. */
  maxReach: .45,
} as const;

export interface GaitShape {
  /** 0 walking, 1 running: blends duty, bob shape and posture. */
  blend: number;
  /** Fraction of the cycle in stance. */
  duty: number;
  /** Metres travelled per full left-right cycle. */
  stride: number;
  /** Foot travel either side of the hip during stance (m); the planted foot covers 2 × reach. */
  reach: number;
}

/** Cycle shape for a ground speed (m/s) and crouch (0..1). Crouched steps are shorter and quicker. */
export function gaitShape(speed: number, crouch = 0, out: GaitShape = { blend: 0, duty: 0, stride: 0, reach: 0 }): GaitShape {
  const v = Math.max(0, speed);
  const blend = smoothstep(GAIT.jogFrom, GAIT.runFrom, v);
  const duty = lerp(GAIT.walkDuty, GAIT.runDuty, blend);
  const stance = lerp(GAIT.walkStance, GAIT.runStance, blend) * (1 - clamp(crouch, 0, 1) * .25);
  // The stride a planted foot allows, held between the slowest and quickest cadence.
  const stride = clamp(stance / duty, v / GAIT.maxCadence, Math.max(v / GAIT.minCadence, .05));
  out.blend = blend; out.duty = duty; out.stride = stride;
  out.reach = Math.min(GAIT.maxReach, duty * stride / 2);
  return out;
}

export interface FootSample {
  /** -1 (behind the hip) to 1 (ahead), along the direction of travel. */
  along: number;
  /** 0 on the ground to 1 at the top of the swing. */
  lift: number;
  /** Progress through stance, 0 at heel strike to 1 at toe-off; -1 in swing. */
  stance: number;
  /** Heel raised for toe-off, 0..1: the ankle rises while the toe stays down. */
  heel: number;
  /** Toes raised ahead of heel strike, 0..1. */
  toe: number;
}

export const footSample = (): FootSample => ({ along: 0, lift: 0, stance: 0, heel: 0, toe: 0 });

/**
 * One foot's place in the cycle. `phase` advances 2π per stride; the foot is at
 * mid-stance (under the hip) at phase π, as the rig's left foot always was.
 * Stance is linear in time, so a planted foot moves at a constant speed.
 */
export function footCycle(phase: number, duty: number, out: FootSample = footSample(), kick = 0): FootSample {
  const d = clamp(duty, .05, .95);
  let u = ((phase - Math.PI) / TAU + d / 2) % 1; if (u < 0) u += 1;
  if (u < d) {
    const s = u / d;
    out.along = 1 - 2 * s; out.lift = 0; out.stance = s;
    out.heel = smoothstep(.6, 1, s); out.toe = 1 - smoothstep(0, .25, s);
  } else {
    const s = (u - d) / (1 - d);
    // A Hermite arc that leaves and meets the ground moving back at the
    // planted speed (capped for runs, where it would overshoot the leg), so
    // the foot does not skid forward on lift-off or touchdown.
    const slope = -Math.min(3, 2 * (1 - d) / d), s2 = s * s, s3 = s2 * s;
    out.along = -(2 * s3 - 3 * s2 + 1) + (s3 - 2 * s2 + s) * slope + (-2 * s3 + 3 * s2) + (s3 - s2) * slope;
    // Clearance peaks a little before mid-swing; running (`kick` → 1), earlier
    // still, the heel flicking up behind before the knee drives through.
    out.lift = Math.sin(Math.PI * Math.pow(s, .8 - clamp(kick, 0, 1) * .35)); out.stance = -1;
    out.heel = 1 - smoothstep(0, .3, s); out.toe = smoothstep(.7, 1, s);
  }
  return out;
}

/**
 * Hips from both feet: `drop` (m, ≥ 0) lowers them, `shift` (−1 left … 1 right)
 * moves them over the supporting foot, `roll` (−1 … 1) lifts the supporting
 * hip so the swing side drops. A walk vaults over each planted leg (lowest in
 * double support); a run compresses into it (lowest at mid-stance).
 */
export function hipsFromFeet(left: FootSample, right: FootSample, blend: number, walkBob: number, runBob: number) {
  const supportL = left.stance >= 0 ? Math.sin(Math.PI * left.stance) : 0;
  const supportR = right.stance >= 0 ? Math.sin(Math.PI * right.stance) : 0;
  const height = Math.max(supportL, supportR);
  return {
    drop: lerp((1 - height) * walkBob, height * runBob, blend),
    shift: supportR - supportL,
    roll: supportR - supportL,
  };
}

/** A damped spring, stepped in fixed slices so it is stable at any frame time. */
export interface Spring { value: number; velocity: number }
export const spring = (value = 0): Spring => ({ value, velocity: 0 });
export function stepSpring(state: Spring, target: number, frequency: number, damping: number, dt: number) {
  const steps = Math.min(12, Math.ceil(Math.max(0, dt) * 120));
  const h = steps ? dt / steps : 0, k = frequency * frequency, c = 2 * damping * frequency;
  for (let i = 0; i < steps; i++) {
    state.velocity += (k * (target - state.value) - c * state.velocity) * h;
    state.value += state.velocity * h;
  }
  return state.value;
}

/**
 * Slow, irregular weight shifting while standing (−1 on the left leg, 1 on the
 * right). Two incommensurate waves never quite repeat, and a figure lingers on
 * one leg before changing over rather than swaying like a metronome.
 */
export function idleWeight(time: number) {
  const wave = Math.sin(time * .29) * .65 + Math.sin(time * .53 + 1.7) * .35;
  return Math.tanh(wave * 2.2) / Math.tanh(2.2);
}
