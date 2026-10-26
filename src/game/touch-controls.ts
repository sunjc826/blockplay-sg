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
/** A run already going holds until the stick eases back past this, so a thumb wobbling at the rim does not flicker it. */
export const STICK_SPRINT_RELEASE = 0.8;
/** Whether a stick this far over runs, given whether it was running a moment ago. */
export const stickSprints = (magnitude: number, running = false) => magnitude >= (running ? STICK_SPRINT_RELEASE : STICK_SPRINT);
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
 * `running` is whether the stick was running last frame (see `stickSprints`).
 */
export function resolveMovement(keys: ReadonlySet<string>, stick?: StickVector | null, running = false) {
  if (stick && stick.magnitude > 0) {
    return { forward: stick.y, side: stick.x, sprint: stickSprints(stick.magnitude, running) || keys.has('shift') };
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
 * Touch look is a drag across the scene, not a stick: the glass under the right
 * thumb is the look surface, the way every phone shooter does it.
 *
 * A dragged pixel has to be worth several mouse pixels or the camera crawls.
 * `turnFpsLook` reads .0023 radians per pixel, so an unscaled drag would need
 * about 1370px — three full swipes of a portrait phone — for a half turn. At
 * this gain a thumb that crosses half a landscape screen comes round roughly
 * 140°, which is the reach phone shooters settle on. The vertical gain keeps
 * the sticks' own X:Y ratio, so a thumb that wanders while turning does not
 * fling the pitch, and aiming down the sights still halves both inside
 * `turnFpsLook`.
 */
export const TOUCH_LOOK_GAIN_X = 2.6;
export const TOUCH_LOOK_GAIN_Y = (TOUCH_LOOK_GAIN_X * LOOK_RATE_Y) / LOOK_RATE_X;

/** Mouse-pixel look travel for a thumb that dragged (dx, dy) across the glass. */
export function dragLook(dx: number, dy: number) {
  return { dx: finite(dx) * TOUCH_LOOK_GAIN_X, dy: finite(dy) * TOUCH_LOOK_GAIN_Y };
}

/**
 * Where each right-thumb action sits, laid out the way the big mobile shooters
 * lay theirs (Call of Duty: Mobile, PUBG Mobile) so a player's hands already
 * know it. The trigger is raised off the corner, where the thumb rests; aim and
 * jump climb the screen edge beside it, crouch and prone sit along the bottom
 * corner, and reload is a short reach to its left:
 *
 *   beside-high                    edge-high   (vision · aim / boost)
 *   beside        (  FIRE  )       edge-low    (reload / seat · jump / climb)
 *                  corner-left     corner      (crouch · prone / descend)
 *
 * The stylesheet owns the geometry; this owns which action goes where, so the
 * same slots draw smaller on a short screen and a vehicle reuses them.
 */
export type PadSlot = 'corner' | 'corner-left' | 'edge-low' | 'edge-high' | 'beside' | 'beside-high';
const PAD_SLOTS: Readonly<Record<string, PadSlot>> = {
  prone: 'corner', crouch: 'corner-left', jump: 'edge-low', aim: 'edge-high', reload: 'beside', vision: 'beside-high',
  // Mounted: the thumb that jumps climbs or brakes, the one that aims boosts.
  descend: 'corner', altitude: 'edge-low', boost: 'edge-high', seat: 'beside',
};
export const padSlot = (action: string): PadSlot | undefined => PAD_SLOTS[action];

/**
 * A prompt with its keyboard hint dropped. The HUD writes "E · Drive Utility 01"
 * for a keyboard; a thumb has no E to press, so the button says what it does.
 */
export function promptLabel(prompt: string | null | undefined): string {
  return String(prompt ?? '').replace(/^\s*\S+\s*·\s*/, '').trim();
}

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
