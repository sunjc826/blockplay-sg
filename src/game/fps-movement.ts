/** Infantry feel. World collision and authoritative stance remain owned by the engine. */
/** On-foot speeds in metres/second, before equipment and food modifiers. */
export const INFANTRY_SPEED = { walk: 5.46, sprint: 9.1, crouch: 2.73, prone: 1.105, aim: 3.25 } as const;
/** Consume ordinary slow frames completely, with small collision steps. Long
 * suspensions are bounded to avoid teleporting on tab resume. */
export function movementFrameSteps(elapsed: number): number[] {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return [];
  const time = Math.min(elapsed, .25), count = Math.ceil(time / (1 / 60));
  return Array.from({ length: count }, () => time / count);
}

export type MovementStance = 'stand' | 'crouch' | 'prone';
export const INFANTRY_GRAVITY = { rise: 18, fall: 24 };
/** About 1.05 m unladen: a hop over a kerb, a hurdle or a low crate. Chest-high cover is climbed (see fps-mantle). */
export const INFANTRY_JUMP_SPEED = 6.2;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);
export function createMovementMotion() {
  return { x: 0, z: 0, eye: 1.75, eyeVelocity: 0, compression: 0, compressionVelocity: 0,
    gait: 0, gaitWeight: 0, sprint: 0, lean: 0, surge: 0,
    jumpBuffer: 0, coyote: 0, jumpCooldown: 0, stepDistance: 0 };
}
export type MovementMotion = ReturnType<typeof createMovementMotion>;
export function resetMovementMotion(state: MovementMotion, eye = 1.75) {
  Object.assign(state, createMovementMotion(), { eye });
}
export function bufferJump(state: MovementMotion) { state.jumpBuffer = .14; }
export function consumeJump(state: MovementMotion, grounded: boolean, canJump: boolean, dt: number) {
  state.jumpCooldown = Math.max(0, state.jumpCooldown - dt);
  state.coyote = grounded ? .085 : Math.max(0, state.coyote - dt);
  const jump = state.jumpBuffer > 0 && state.coyote > 0 && state.jumpCooldown === 0 && canJump;
  state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
  if (jump) {
    state.jumpBuffer = state.coyote = 0; state.jumpCooldown = .22;
    state.compressionVelocity -= .45;
  }
  return jump;
}
/** Per second, towards the wanted velocity. Air control bends a jump without turning it round. */
export const GROUND_ACCELERATION = 11, GROUND_STOP = 16, AIR_CONTROL = 3;
/** Accelerate in world space: looking around in midair cannot rotate momentum. */
export function advanceGroundMotion(state: MovementMotion, targetX: number, targetZ: number,
  grounded: boolean, mobility: number, stance: MovementStance, locked: boolean, dt: number) {
  if (locked) { state.x = state.z = 0; return { x: 0, z: 0 }; }
  const input = Math.hypot(targetX, targetZ) > .001;
  // Pushing against the way the body is going brakes as hard as letting go, so a strafe reverses rather than drifts.
  const against = stance !== 'prone' && state.x * targetX + state.z * targetZ < 0;
  const rate = grounded ? (input ? (stance === 'prone' ? 5 : against ? GROUND_STOP : GROUND_ACCELERATION) * (.65 + .35 * mobility) : GROUND_STOP) : input ? AIR_CONTROL : .12;
  // Integrate the exponential exactly so travel distance is independent of frame rate.
  const blend = 1 - Math.exp(-rate * dt);
  const x = targetX * dt + (state.x - targetX) * blend / rate;
  const z = targetZ * dt + (state.z - targetZ) * blend / rate;
  state.x += (targetX - state.x) * blend; state.z += (targetZ - state.z) * blend;
  return { x, z };
}
export function landMovement(state: MovementMotion, speed: number) {
  if (speed < 1.5) return;
  state.compressionVelocity -= clamp((speed - 1) * .22, 0, 2.5);
}
/** Critically damped stance changes and a short, bounded landing suspension. */
export function advanceBodyMotion(state: MovementMotion, eye: number, stance: MovementStance,
  speed: number, grounded: boolean, sprinting: boolean, sideSpeed: number, forwardSpeed: number, dt: number) {
  const rate = stance === 'prone' || state.eye < 1.05 ? 9 : 16;
  const offset = state.eye - eye, c = state.eyeVelocity + rate * offset, decay = Math.exp(-rate * dt);
  state.eye = eye + (offset + c * dt) * decay;
  state.eyeVelocity = (state.eyeVelocity - rate * c * dt) * decay;
  const steps = Math.max(1, Math.ceil(dt * 120)), tick = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.compressionVelocity += (-170 * state.compression - 20 * state.compressionVelocity) * tick;
    state.compression = clamp(state.compression + state.compressionVelocity * tick, -.16, .035);
  }
  state.sprint = damp(state.sprint, sprinting && grounded ? 1 : 0, 8, dt);
  state.gaitWeight = damp(state.gaitWeight, grounded ? clamp(speed / (stance === 'prone' ? .7 : 3.8), 0, 1) : 0, 14, dt);
  const stride = stance === 'prone' ? .8 : stance === 'crouch' ? 1.35 : sprinting ? 2.2 : 1.85;
  // One half cycle per footfall: faster travel lengthens cadence without vibrating the hands.
  state.gait += grounded ? speed * dt * Math.PI / stride : 0;
  state.lean = damp(state.lean, clamp(sideSpeed * -.003, -.016, .016), 9, dt);
  state.surge = damp(state.surge, clamp(forwardSpeed * .004, -.018, .028), 8, dt);
  state.stepDistance += grounded ? speed * dt : 0;
  const step = grounded && speed > .2 && state.stepDistance >= stride;
  if (step) state.stepDistance %= stride;
  if (!grounded || speed < .1) state.stepDistance = 0;
  return step;
}
