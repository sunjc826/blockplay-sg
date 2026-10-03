/** Infantry feel. World collision and authoritative stance remain owned by the engine. */
export type MovementStance = 'stand' | 'crouch' | 'prone';
export const INFANTRY_GRAVITY = { rise: 18, fall: 24 };
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
/** Accelerate in world space: looking around in midair cannot rotate momentum. */
export function advanceGroundMotion(state: MovementMotion, targetX: number, targetZ: number,
  grounded: boolean, mobility: number, stance: MovementStance, locked: boolean, dt: number) {
  if (locked) { state.x = state.z = 0; return { x: 0, z: 0 }; }
  const input = Math.hypot(targetX, targetZ) > .001;
  const rate = grounded ? (input ? (stance === 'prone' ? 5 : 9) * (.65 + .35 * mobility) : 16) : input ? 1.35 : .12;
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
  state.gait += grounded ? speed * dt * (stance === 'prone' ? 7 : 3.1) : 0;
  state.lean = damp(state.lean, clamp(sideSpeed * -.003, -.016, .016), 9, dt);
  state.surge = damp(state.surge, clamp(forwardSpeed * .004, -.018, .028), 8, dt);
  state.stepDistance += grounded ? speed * dt : 0;
  const stride = stance === 'prone' ? .8 : stance === 'crouch' ? 1.35 : sprinting ? 2.2 : 1.85;
  const step = grounded && speed > .2 && state.stepDistance >= stride;
  if (step) state.stepDistance %= stride;
  if (!grounded || speed < .1) state.stepDistance = 0;
  return step;
}
