/**
 * The flare at the muzzle, as numbers. The renderer owns the meshes; this owns
 * how bright they are, how long they last and how much they vary shot to shot.
 *
 * A flash is not a fade-out: it is an attack of a couple of milliseconds and a
 * fall that is steeper than linear, which is why a single `visible = true` for
 * a fixed 45 ms reads as a blinking sphere rather than as ignition. The roll
 * and the petal length are re-rolled per shot for the same reason — a flare
 * that is the exact same shape every round reads as a decal.
 *
 * Barrel heat is carried across shots. It does nothing to accuracy; it only
 * decides how often the barrel gives off smoke, so sustained fire looks worked
 * and a single aimed shot does not.
 */
export interface MuzzleState {
  age: number; life: number;
  /** Re-rolled per shot: flare roll about the bore, and its core/petal sizes. */
  roll: number; core: number; petal: number;
  /** Scales the flare and the light with the weapon's recoil rating. */
  power: number;
  /** 0..1 barrel heat, and the countdown to the next wisp of smoke. */
  heat: number; smokeIn: number;
}

export const FLASH_LIFE = 0.075;
/** Fraction of the life spent rising; the rest falls. */
const ATTACK = 0.18;
const HEAT_PER_SHOT = 0.1, HEAT_DECAY = 0.42, SMOKE_FROM = 0.3;

export const createMuzzle = (): MuzzleState => ({ age: FLASH_LIFE, life: FLASH_LIFE, roll: 0, core: 1, petal: 1, power: 1, heat: 0, smokeIn: 0 });
export function resetMuzzle(state: MuzzleState) {
  state.age = state.life = FLASH_LIFE; state.roll = 0; state.core = state.petal = state.power = 1; state.heat = 0; state.smokeIn = 0;
}

/** `recoil` is the resolved spec's rating; a heavier weapon flares harder. */
export function igniteMuzzle(state: MuzzleState, recoil: number, random: () => number = Math.random) {
  state.age = 0; state.life = FLASH_LIFE;
  state.roll = random() * Math.PI * 2;
  state.core = 0.82 + random() * 0.4;
  state.petal = 0.6 + random() * 0.85;
  state.power = Math.max(0.6, Math.min(1.6, 0.75 + Math.max(0, recoil) * 18));
  state.heat = Math.min(1, state.heat + HEAT_PER_SHOT);
}

/** Steps the flare and the barrel, returning true on the steps that should emit smoke. */
export function advanceMuzzle(state: MuzzleState, dt: number): boolean {
  const step = Math.max(0, Math.min(dt, 0.25));
  state.age = Math.min(state.life, state.age + step);
  state.heat = Math.max(0, state.heat - HEAT_DECAY * step);
  if (state.heat < SMOKE_FROM) { state.smokeIn = 0; return false; }
  state.smokeIn -= step;
  if (state.smokeIn > 0) return false;
  // Hotter barrels smoke more often, from one wisp every 200 ms up to every 60.
  state.smokeIn = 0.2 - 0.14 * state.heat;
  return true;
}

/** 0 at rest, 1 at ignition. Fast attack, steeper-than-linear fall. */
export function flashEnvelope(age: number, life = FLASH_LIFE) {
  const t = Math.max(0, Math.min(1, age / Math.max(1e-6, life)));
  if (t >= 1) return 0;
  if (t < ATTACK) return t / ATTACK;
  const fall = 1 - (t - ATTACK) / (1 - ATTACK);
  return fall * fall;
}

/**
 * What to draw this frame. `light` is a multiplier on the point light the
 * engine keeps at the muzzle, not an intensity, so the engine still owns how
 * far a flash reaches into the map.
 */
export function muzzleShape(state: MuzzleState) {
  const envelope = flashEnvelope(state.age, state.life);
  return {
    live: envelope > 0,
    roll: state.roll,
    core: envelope * state.core * state.power,
    // The star collapses faster than the core, so the flare closes to a point.
    petal: envelope * envelope * state.petal * state.power,
    glow: Math.sqrt(envelope) * state.power,
    light: envelope * state.power,
  };
}
