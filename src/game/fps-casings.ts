/**
 * Ejected cases. Pure so the arc, the bounce and the recycling can be tested
 * without a renderer; the engine only copies the result into instance matrices.
 *
 * Each case leaves the ejection port on the weapon's own axes, so a case thrown
 * from a rifle held sideways still leaves the port sideways, and carries the
 * shooter's ground velocity so walking fire does not drop brass into a hovering
 * column behind you.
 */
export interface CasingVector { x: number; y: number; z: number }
export interface Casing {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Tumble axis (unit) and the angle it has turned through. */
  ax: number; ay: number; az: number; angle: number; spin: number;
  age: number; life: number; bounces: number; resting: boolean;
  /**
   * Opaque tag naming the look this case was thrown with. Nothing here reads
   * it; it exists so the renderer can keep drawing brass in the colour of the
   * weapon that ejected it after the player has switched to another one.
   */
  style?: string;
}

/** Brass on the ground at once. The oldest case is recycled past this. */
export const MAX_CASINGS = 36;
export const CASING_LIFE = 5;
/** Seconds a case that has stopped lies there before it starts to go. */
export const CASING_REST = 3.6;
/** Seconds of the tail spent fading out, so nothing pops off the floor. */
export const CASING_FADE = 0.6;
const GRAVITY = 16, RESTITUTION = 0.34, FRICTION = 0.62, SETTLE_SPEED = 0.45, MAX_BOUNCES = 3;

const unit = (v: CasingVector): CasingVector => {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 1e-6 ? { x: v.x / length, y: v.y / length, z: v.z / length } : { x: 0, y: 1, z: 0 };
};

/**
 * Pushes one case into `list`, recycling the oldest entry once the pool is
 * full so the array never grows and the instanced draw stays a fixed size.
 * `right`, `up` and `back` are the weapon's axes in world space.
 */
export function ejectCasing(list: Casing[], origin: CasingVector, right: CasingVector, up: CasingVector, back: CasingVector,
  carry: CasingVector = { x: 0, y: 0, z: 0 }, random: () => number = Math.random, style?: string): Casing {
  const r = unit(right), u = unit(up), b = unit(back);
  const side = 2.0 + random() * 1.3, lift = 1.5 + random() * 0.9, drift = (random() * 2 - 1) * 0.6;
  const axis = unit({ x: random() * 2 - 1, y: random() * 2 - 1, z: random() * 2 - 1 });
  const casing: Casing = {
    x: origin.x, y: origin.y, z: origin.z,
    vx: r.x * side + u.x * lift + b.x * drift + carry.x,
    vy: r.y * side + u.y * lift + b.y * drift + carry.y,
    vz: r.z * side + u.z * lift + b.z * drift + carry.z,
    ax: axis.x, ay: axis.y, az: axis.z, angle: random() * Math.PI * 2, spin: 14 + random() * 16,
    age: 0, life: CASING_LIFE, bounces: 0, resting: false, style,
  };
  if (list.length >= MAX_CASINGS) {
    // Oldest by age, which is the one that has least left to show.
    let oldest = 0;
    for (let i = 1; i < list.length; i++) if (list[i].age > list[oldest].age) oldest = i;
    list[oldest] = casing;
  } else list.push(casing);
  return casing;
}

/** Steps every case and drops the expired ones. `groundY` is the floor they land on. */
export function advanceCasings(list: Casing[], dt: number, groundY = 0) {
  const step = Math.max(0, Math.min(dt, 0.25));
  for (let i = list.length - 1; i >= 0; i--) {
    const casing = list[i];
    casing.age += step;
    if (casing.age >= casing.life) { list.splice(i, 1); continue; }
    if (casing.resting) continue;
    casing.vy -= GRAVITY * step;
    casing.x += casing.vx * step; casing.y += casing.vy * step; casing.z += casing.vz * step;
    casing.angle += casing.spin * step;
    if (casing.y > groundY) continue;
    casing.y = groundY; casing.bounces++;
    casing.vy = Math.abs(casing.vy) * RESTITUTION;
    casing.vx *= FRICTION; casing.vz *= FRICTION; casing.spin *= 0.45;
    // A case that has stopped keeps its pose and simply fades, rather than
    // jittering on the floor through the rest of its life.
    if (casing.bounces >= MAX_BOUNCES || casing.vy < SETTLE_SPEED) {
      casing.resting = true; casing.vx = casing.vy = casing.vz = casing.spin = 0;
      casing.life = Math.min(casing.life, casing.age + CASING_REST);
    }
  }
}

/** 1 while the case is live, easing to 0 over its last moments. */
export const casingFade = (casing: Casing) =>
  Math.max(0, Math.min(1, (casing.life - casing.age) / CASING_FADE));
