/** Metres and seconds. Courant number c*dt/dx = .587 < 1/sqrt(2). */
export const WATER_WAVES = { size: 512, span: 32, segments: 256, step: 1 / 60, speed: 2.2, damping: .48, maxSteps: 4, maxImpulses: 32, maxImpulseHeight: .24, anchor: 2 } as const;
export interface WaterImpulse { x: number; z: number; radius: number; height: number; foam?: number }
export interface WaterSwimmer { x: number; z: number; active: boolean }

/** Preserve the rifle's 8.5 cm impulse and give heavy rounds headroom below the
 * solver's 25 cm displacement limit. A wider cavity carries a stronger wave. */
export function waterImpactPulse(strength: number) {
  const power = Number.isFinite(strength) ? Math.max(0,Math.min(3,strength)) : 0;
  return { height: -Math.min(WATER_WAVES.maxImpulseHeight,.085*power), radius: .215*Math.sqrt(Math.max(.3,power)) };
}

/** Align scrolling to whole simulation texels so existing waves stay in world space. */
export function waterWaveOrigin(x: number, z: number) {
  return { x: Math.round(x / WATER_WAVES.anchor) * WATER_WAVES.anchor - WATER_WAVES.span / 2,
    z: Math.round(z / WATER_WAVES.anchor) * WATER_WAVES.anchor - WATER_WAVES.span / 2 };
}

/** Fixed steps, bounded after a stalled tab; never use a large unstable time step. */
export function waterWaveSteps(elapsed: number, remainder: number) {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > .5) return { reset: true, steps: 0, remainder: 0 };
  const accumulated = Math.min(WATER_WAVES.step * WATER_WAVES.maxSteps, elapsed + remainder);
  const steps = Math.floor((accumulated + 1e-8) / WATER_WAVES.step);
  return { reset: false, steps, remainder: Math.max(0, accumulated - steps * WATER_WAVES.step) };
}

/** Distance-spaced paired disturbances, independent of the render frame rate.
 * Teleports, dry movement and pause/resume never draw a trail across the bay. */
export function createSwimmerWake() {
  let previous: WaterSwimmer | undefined, carry = 0, idle = 0;
  return {
    reset() { previous = undefined; carry = idle = 0; },
    update(source: WaterSwimmer | undefined, dt: number, emit: (impulse: WaterImpulse) => void) {
      if (dt <= 0) return;
      if (!source?.active) { previous = undefined; carry = idle = 0; return; }
      if (!previous) { emit({ x: source.x, z: source.z, radius: .48, height: -.035 }); previous = { ...source }; return; }
      const dx = source.x - previous.x, dz = source.z - previous.z, distance = Math.hypot(dx, dz);
      if (dt > .5 || distance > Math.max(1.5, dt * 4)) { previous = { ...source }; carry = idle = 0; return; }
      if (distance > .001) {
        const nx = -dz / distance, nz = dx / distance;
        for (let along = .18 - carry, count = 0; along <= distance && count < 8; along += .18, count++) {
          const x = previous.x + dx * along / distance, z = previous.z + dz * along / distance;
          for (const side of [-1, 1]) emit({ x: x + nx * side * .27, z: z + nz * side * .27, radius: .24, height: -.018 });
        }
        carry = (carry + distance) % .18; idle = 0;
      } else {
        idle += dt;
        if (idle >= 1.1) { idle %= 1.1; emit({ x: source.x, z: source.z, radius: .32, height: -.008 }); }
      }
      previous = { ...source };
    },
  };
}
