/**
 * The combat slide: crouch during a sprint and the body drops and carries on
 * along the line it was running, faster for a moment, while friction bleeds the
 * speed down to a crouch walk. Direction lives in world space, so the view can
 * look anywhere during a slide, and the stick only leans the line a little.
 * The engine owns when a slide may start and what stance it leaves behind.
 */
export const SLIDE_EYE_HEIGHT = .95;
/** The kick on entry, over the speed the run had reached. */
export const SLIDE_BOOST = 1.18;
export const SLIDE_SECONDS = 1;
/** Per second, towards the crouch walk: about 4.8 m from a 7 m/s sprint. */
export const SLIDE_FRICTION = 2;
/** Starts count from a slide's end, so chaining them cannot outrun a sprint. */
export const SLIDE_COOLDOWN = .7;
/** A jog is not a run: the sprint has to have got this share of the way to full speed. */
export const SLIDE_ENTRY_SHARE = .6;
/** Rad/s the stick can lean the line. */
export const SLIDE_STEER = .7;
/** A strafe counts as steering; a stick pulled back past this does not. */
const SLIDE_STEER_REACH = 2;
/** A stair or kerb is not a fall: the slide survives this long off the ground. */
export const SLIDE_AIR_GRACE = .12;
/** Below this share of the wanted travel the slide has run into something rather than along it. */
const SLIDE_STOPPED_SHARE = .35;
/** Harder to hit from than a run, and it never earns a crouch's steadiness. */
export const SLIDE_SPREAD = 1.35;

export interface SlideState { active: boolean; x: number; z: number; speed: number; floor: number; elapsed: number; cooldown: number; air: number }
export const createSlide = (): SlideState => ({ active: false, x: 0, z: 0, speed: 0, floor: 0, elapsed: 0, cooldown: 0, air: 0 });

/** `sprintSpeed` and `floor` are this player's, after what they carry. */
export function startSlide(state: SlideState, velocityX: number, velocityZ: number, sprintSpeed: number, floor: number) {
  const speed = Math.hypot(velocityX, velocityZ);
  if (state.active || state.cooldown > 0 || speed <= 0 || speed < sprintSpeed * SLIDE_ENTRY_SHARE) return false;
  Object.assign(state, { active: true, x: velocityX / speed, z: velocityZ / speed, speed: speed * SLIDE_BOOST, floor, elapsed: 0, air: 0 });
  return true;
}
export function endSlide(state: SlideState) {
  if (!state.active) return;
  state.active = false; state.cooldown = SLIDE_COOLDOWN;
}
export function coolSlide(state: SlideState, dt: number) {
  if (!state.active) state.cooldown = Math.max(0, state.cooldown - dt);
}
/** This frame's travel. The exponential is integrated exactly, so distance does not depend on frame rate. `speed` stays readable after the last frame, for what takes over. */
export function advanceSlide(state: SlideState, inputX: number, inputZ: number, grounded: boolean, dt: number) {
  if (!state.active || !(dt > 0)) return { x: 0, z: 0 };
  const step = Math.min(dt, SLIDE_SECONDS - state.elapsed);
  if (Math.hypot(inputX, inputZ) > .001) {
    const off = Math.atan2(state.x * inputZ - state.z * inputX, state.x * inputX + state.z * inputZ);
    // Pulling back on the stick does not turn a slide round.
    if (Math.abs(off) < SLIDE_STEER_REACH) {
      const turn = Math.sign(off) * Math.min(Math.abs(off), SLIDE_STEER * step), cos = Math.cos(turn), sin = Math.sin(turn), x = state.x;
      state.x = x * cos - state.z * sin; state.z = x * sin + state.z * cos;
    }
  }
  const excess = state.speed - state.floor, decay = Math.exp(-SLIDE_FRICTION * step);
  state.speed = state.floor + excess * decay;
  // The frame that ends a slide finishes at the speed it ended on, so it does not stutter.
  const distance = state.floor * step + excess * (1 - decay) / SLIDE_FRICTION + state.speed * (dt - step);
  state.elapsed += step;
  state.air = grounded ? 0 : state.air + step;
  const travel = { x: state.x * distance, z: state.z * distance };
  if (state.elapsed >= SLIDE_SECONDS - 1e-9 || state.air > SLIDE_AIR_GRACE) endSlide(state);
  return travel;
}
/** A slide runs along a wall, losing what the wall took, and stops dead against one it hits square. */
export function resolveSlideContact(state: SlideState, wantedX: number, wantedZ: number, movedX: number, movedZ: number) {
  const wanted = Math.hypot(wantedX, wantedZ), moved = Math.hypot(movedX, movedZ);
  if (!state.active || wanted < 1e-6 || moved >= wanted - .001) return;
  if (moved < wanted * SLIDE_STOPPED_SHARE) { endSlide(state); state.speed = 0; return; }
  state.x = movedX / moved; state.z = movedZ / moved;
  state.speed = Math.max(state.floor, state.speed * moved / wanted);
}
/** Only a slide moves a crouching figure this fast, so a remote body can be read without another field on the wire. */
export const SLIDE_READ_SPEED = 3.4;
export const looksLikeSlide = (crouch: number, speed: number) => crouch > .5 && speed > SLIDE_READ_SPEED;
