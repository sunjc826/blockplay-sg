/**
 * Thumb-stick maths, shared by every mode that can be played without a keyboard.
 *
 * The sticks are floating: the base is planted wherever the thumb lands inside
 * its zone, so a player never has to look down to find it. Everything here is
 * pure so the feel can be tuned and tested without a browser — the components
 * only turn pointer events into these vectors and hand them to an engine.
 */
export interface StickVector {
  /** Right is positive, in the range -1..1. */
  x: number;
  /** Forward (screen up) is positive, in the range -1..1. */
  y: number;
  /** Length of (x, y), already dead-zoned and clamped to 1. */
  magnitude: number;
}

export const NEUTRAL_STICK: StickVector = { x: 0, y: 0, magnitude: 0 };
/** Travel in CSS pixels from the planted base to full deflection. */
export const STICK_RADIUS = 46;
/** Thumbs rest crooked; below this the stick reads as centred. */
export const STICK_DEAD_ZONE = 0.16;
/** Push past this and the run starts, so sprinting needs no second button. */
export const STICK_SPRINT = 0.92;
/** Pixels-per-second of equivalent mouse travel at full look deflection. */
export const LOOK_RATE_X = 900;
export const LOOK_RATE_Y = 620;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

/**
 * Deflection of a stick whose base sits at (originX, originY) and whose thumb is
 * at (pointX, pointY), in client pixels. The dead zone is rescaled rather than
 * subtracted, so the first millimetre past it moves at a crawl instead of
 * snapping to 16% speed.
 */
export function stickVector(originX: number, originY: number, pointX: number, pointY: number, radius = STICK_RADIUS): StickVector {
  const reach = radius > 0 ? radius : STICK_RADIUS;
  // Screen y grows downwards; forward is up, so the vertical axis is flipped here.
  const dx = clamp(finite(pointX) - finite(originX), reach) / reach;
  const dy = clamp(finite(originY) - finite(pointY), reach) / reach;
  const raw = Math.hypot(dx, dy);
  if (raw <= STICK_DEAD_ZONE) return NEUTRAL_STICK;
  const magnitude = Math.min(1, (raw - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE));
  return { x: (dx / raw) * magnitude, y: (dy / raw) * magnitude, magnitude };
}

/** Where to draw the thumb, in pixels from the base. */
export function stickOffset(stick: StickVector, radius = STICK_RADIUS) {
  return { x: stick.x * radius, y: -stick.y * radius };
}

const FORWARD_KEYS = ['w', 'arrowup'], BACK_KEYS = ['s', 'arrowdown'], LEFT_KEYS = ['a', 'arrowleft'], RIGHT_KEYS = ['d', 'arrowright'];
const held = (keys: ReadonlySet<string>, group: readonly string[]) => group.some(key => keys.has(key));

/**
 * One movement intent from both input paths. The stick wins while it is off
 * centre — a held key and a pushed stick are never summed, so a stuck key
 * cannot drag a touch player sideways — and analog magnitude survives into the
 * result, because `movementInput` only normalises vectors longer than one.
 */
export function resolveMovement(keys: ReadonlySet<string>, stick?: StickVector | null) {
  if (stick && stick.magnitude > 0) {
    return { forward: stick.y, side: stick.x, sprint: stick.magnitude >= STICK_SPRINT || keys.has('shift') };
  }
  return {
    forward: Number(held(keys, FORWARD_KEYS)) - Number(held(keys, BACK_KEYS)),
    side: Number(held(keys, RIGHT_KEYS)) - Number(held(keys, LEFT_KEYS)),
    sprint: keys.has('shift'),
  };
}

/**
 * The same stick expressed as keys, for the vehicle model and the region worlds,
 * which read a held-key set rather than an axis. Eight-way, because a car that
 * steers proportionally from a thumb is harder to place than one that does not.
 */
export function stickKeys(stick?: StickVector | null): string[] {
  if (!stick || stick.magnitude === 0) return [];
  const keys: string[] = [];
  // A quarter of the deflection on an axis is enough to count as pressed, so
  // diagonals are reachable without the thumb having to bisect the circle.
  if (stick.y > 0.25) keys.push('w'); else if (stick.y < -0.25) keys.push('s');
  if (stick.x > 0.25) keys.push('d'); else if (stick.x < -0.25) keys.push('a');
  if (stick.magnitude >= STICK_SPRINT) keys.push('shift');
  return keys;
}

/**
 * Look travel for one frame, as the mouse-pixel deltas `turnFpsLook` expects, so
 * touch and mouse share a single sensitivity curve. The response is squared:
 * small pushes creep for aiming, a full push whips the camera around. `scale`
 * trims the rate for a world whose own look sensitivity differs from the range's.
 */
export function lookDelta(stick: StickVector | null | undefined, dt: number, scale = 1) {
  if (!stick || stick.magnitude === 0 || !Number.isFinite(dt) || dt <= 0) return { dx: 0, dy: 0 };
  const step = Math.min(dt, 0.1) * (Number.isFinite(scale) ? scale : 1);
  const curve = (value: number) => value * Math.abs(value);
  // A positive y is up, and `turnFpsLook` pitches up on a negative delta.
  return { dx: curve(stick.x) * LOOK_RATE_X * step, dy: -curve(stick.y) * LOOK_RATE_Y * step };
}

/**
 * The walk/drive worlds turn with a per-pixel constant close to twice the
 * range's, so a stick pushed the same distance would whip the camera around.
 * This is the factor that lands both on a similar radians-per-second.
 */
export const REGION_LOOK_SCALE = 0.55;

/**
 * Whether this device wants the thumb layer. Media queries describe the primary
 * pointer, so a touch laptop reports `fine` and keeps the mouse layout until it
 * actually sees a touch — which the engine reports back through the HUD.
 */
export function prefersTouchControls(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  } catch { /* Old engines throw on unknown media features. */ }
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && !window.matchMedia?.('(pointer: fine)').matches;
}
