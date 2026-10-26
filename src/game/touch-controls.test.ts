import { describe, expect, it } from 'vitest';
import {
  LOOK_RATE_X, NEUTRAL_STICK, STICK_DEAD_ZONE, STICK_RADIUS, STICK_SPRINT,
  TOUCH_LOOK_GAIN_X, TOUCH_LOOK_GAIN_Y,
  dragLook, lookDelta, promptLabel, resolveMovement, stickKeys, stickOffset, stickVector, padSlot,
} from './touch-controls';
import { movementInput } from './fps-rules';
import { turnFpsLook } from './fps-pointer';

describe('stickVector', () => {
  it('reads a resting thumb as centred and full travel as one', () => {
    expect(stickVector(100, 100, 100, 100)).toEqual(NEUTRAL_STICK);
    expect(stickVector(100, 100, 100 + STICK_RADIUS * STICK_DEAD_ZONE * 0.9, 100)).toEqual(NEUTRAL_STICK);
    const forward = stickVector(100, 100, 100, 100 - STICK_RADIUS);
    expect(forward.y).toBeCloseTo(1, 5);
    expect(forward.x).toBeCloseTo(0, 5);
    expect(forward.magnitude).toBeCloseTo(1, 5);
  });

  it('flips the screen axis so up is forward and right is right', () => {
    expect(stickVector(0, 0, 0, -STICK_RADIUS).y).toBeGreaterThan(0);
    expect(stickVector(0, 0, 0, STICK_RADIUS).y).toBeLessThan(0);
    expect(stickVector(0, 0, STICK_RADIUS, 0).x).toBeGreaterThan(0);
    expect(stickVector(0, 0, -STICK_RADIUS, 0).x).toBeLessThan(0);
  });

  it('never exceeds full deflection however far the thumb slides', () => {
    for (const [x, y] of [[900, 900], [-900, 40], [0, -4000]] as const) {
      expect(stickVector(0, 0, x, y).magnitude).toBeLessThanOrEqual(1);
    }
  });

  it('rescales the dead zone so speed rises from zero rather than jumping', () => {
    const justPast = stickVector(0, 0, STICK_RADIUS * (STICK_DEAD_ZONE + 0.01), 0);
    expect(justPast.magnitude).toBeGreaterThan(0);
    expect(justPast.magnitude).toBeLessThan(0.05);
    const half = stickVector(0, 0, STICK_RADIUS * (STICK_DEAD_ZONE + (1 - STICK_DEAD_ZONE) / 2), 0);
    expect(half.magnitude).toBeCloseTo(0.5, 5);
  });

  it('survives a pointer event with no usable coordinates', () => {
    // A non-finite coordinate reads as the base's own position, never as NaN
    // deflection, which would poison yaw and position for the rest of the round.
    const broken = stickVector(NaN, 0, 10, Infinity);
    expect(Number.isFinite(broken.x) && Number.isFinite(broken.y) && Number.isFinite(broken.magnitude)).toBe(true);
    expect(broken.y).toBe(0);
    expect(stickVector(NaN, NaN, NaN, NaN)).toEqual(NEUTRAL_STICK);
    // A zero radius would divide by zero; the default travel stands in instead.
    expect(stickVector(0, 0, 10, 0, 0).magnitude).toBeGreaterThan(0);
  });

  it('places the drawn thumb on the same side as the touch', () => {
    const offset = stickOffset(stickVector(0, 0, STICK_RADIUS, -STICK_RADIUS));
    expect(offset.x).toBeGreaterThan(0);
    // Screen coordinates again: pushing forward draws the thumb upwards.
    expect(offset.y).toBeLessThan(0);
  });
});

describe('resolveMovement', () => {
  it('reads held keys when no stick is pushed', () => {
    expect(resolveMovement(new Set(['w', 'd', 'shift']))).toEqual({ forward: 1, side: 1, sprint: true });
    expect(resolveMovement(new Set(['arrowdown', 'arrowleft']))).toEqual({ forward: -1, side: -1, sprint: false });
    expect(resolveMovement(new Set(), NEUTRAL_STICK)).toEqual({ forward: 0, side: 0, sprint: false });
  });

  it('lets a pushed stick override keys rather than adding to them', () => {
    const stick = stickVector(0, 0, 0, -STICK_RADIUS);
    // A key left stuck down by a lost keyup must not steer a touch player.
    expect(resolveMovement(new Set(['a', 's']), stick).side).toBeCloseTo(0, 5);
    expect(resolveMovement(new Set(['a', 's']), stick).forward).toBeCloseTo(1, 5);
  });

  it('starts the run only at the far edge of the stick', () => {
    const walk = stickVector(0, 0, 0, -STICK_RADIUS * 0.7), run = stickVector(0, 0, 0, -STICK_RADIUS);
    expect(walk.magnitude).toBeLessThan(STICK_SPRINT);
    expect(resolveMovement(new Set(), walk).sprint).toBe(false);
    expect(resolveMovement(new Set(), run).sprint).toBe(true);
  });

  it('keeps analog magnitude: a half-pushed stick walks at half pace', () => {
    const half = stickVector(0, 0, 0, -STICK_RADIUS * (STICK_DEAD_ZONE + (1 - STICK_DEAD_ZONE) / 2));
    const move = resolveMovement(new Set(), half);
    const slow = movementInput(move.forward, move.side, 0, 10, 1);
    const full = movementInput(1, 0, 0, 10, 1);
    expect(Math.hypot(slow.x, slow.z)).toBeCloseTo(Math.hypot(full.x, full.z) / 2, 5);
  });

  it('never outruns a keyboard diagonal', () => {
    const diagonal = stickVector(0, 0, STICK_RADIUS, -STICK_RADIUS);
    const move = resolveMovement(new Set(), diagonal);
    const stick = movementInput(move.forward, move.side, 0, 10, 1);
    const keyboard = movementInput(1, 1, 0, 10, 1);
    expect(Math.hypot(stick.x, stick.z)).toBeLessThanOrEqual(Math.hypot(keyboard.x, keyboard.z) + 1e-9);
  });
});

describe('stickKeys', () => {
  it('maps the stick onto the eight directions a vehicle understands', () => {
    expect(stickKeys(null)).toEqual([]);
    expect(stickKeys(NEUTRAL_STICK)).toEqual([]);
    expect(stickKeys(stickVector(0, 0, 0, -STICK_RADIUS))).toEqual(['w', 'shift']);
    expect(stickKeys(stickVector(0, 0, 0, STICK_RADIUS * 0.6))).toEqual(['s']);
    expect(stickKeys(stickVector(0, 0, STICK_RADIUS * 0.6, -STICK_RADIUS * 0.6)).sort()).toEqual(['d', 'w']);
    expect(stickKeys(stickVector(0, 0, -STICK_RADIUS * 0.6, 0))).toEqual(['a']);
  });

  it('does not claim a direction the thumb only brushed', () => {
    expect(stickKeys(stickVector(0, 0, STICK_RADIUS * 0.5, -STICK_RADIUS * 0.02))).toEqual(['d']);
  });
});

describe('lookDelta', () => {
  it('stays still when centred, and on a stalled or reversed clock', () => {
    expect(lookDelta(NEUTRAL_STICK, 0.016)).toEqual({ dx: 0, dy: 0 });
    expect(lookDelta(stickVector(0, 0, STICK_RADIUS, 0), 0)).toEqual({ dx: 0, dy: 0 });
    expect(lookDelta(stickVector(0, 0, STICK_RADIUS, 0), -1)).toEqual({ dx: 0, dy: 0 });
  });

  it('turns the camera the way the thumb points', () => {
    const right = lookDelta(stickVector(0, 0, STICK_RADIUS, 0), 0.1);
    expect(turnFpsLook(0, 0, right.dx, right.dy, false).yaw).toBeLessThan(0);
    const up = lookDelta(stickVector(0, 0, 0, -STICK_RADIUS), 0.1);
    expect(turnFpsLook(0, 0, up.dx, up.dy, false).pitch).toBeGreaterThan(0);
  });

  it('squares the response so small pushes aim and full pushes spin', () => {
    const half = lookDelta(stickVector(0, 0, STICK_RADIUS * (STICK_DEAD_ZONE + (1 - STICK_DEAD_ZONE) / 2), 0), 0.1);
    const full = lookDelta(stickVector(0, 0, STICK_RADIUS, 0), 0.1);
    expect(full.dx).toBeCloseTo(LOOK_RATE_X * 0.1, 5);
    expect(half.dx).toBeCloseTo(LOOK_RATE_X * 0.1 / 4, 5);
  });

  it('trims the rate for worlds that look around at a different sensitivity', () => {
    const stick = stickVector(0, 0, STICK_RADIUS, 0);
    expect(lookDelta(stick, 0.1, 0.5).dx).toBeCloseTo(lookDelta(stick, 0.1).dx / 2, 5);
    expect(lookDelta(stick, 0.1, NaN)).toEqual(lookDelta(stick, 0.1));
  });

  it('caps a long frame so a stall does not throw the view across the map', () => {
    const stick = stickVector(0, 0, STICK_RADIUS, 0);
    expect(lookDelta(stick, 5)).toEqual(lookDelta(stick, 0.1));
  });
});

describe('dragLook', () => {
  it('turns a thumb-sized swipe into a useful part of a turn', () => {
    // The whole point of the gain: an unscaled drag needs about 1370px for a
    // half turn, which is three swipes of a portrait phone.
    const bare = turnFpsLook(0, 0, 200, 0, false);
    expect(Math.abs(bare.yaw)).toBeLessThan(0.5);
    const swipe = dragLook(200, 0);
    const turned = turnFpsLook(0, 0, swipe.dx, swipe.dy, false);
    expect(Math.abs(turned.yaw)).toBeGreaterThan(1);
    // Half a landscape screen comes round far enough to face someone behind you.
    const across = dragLook(422, 0);
    expect(Math.abs(turnFpsLook(0, 0, across.dx, across.dy, false).yaw)).toBeGreaterThan(2);
  });

  it('keeps the sticks\' own ratio, so turning never flings the pitch', () => {
    expect(TOUCH_LOOK_GAIN_Y).toBeLessThan(TOUCH_LOOK_GAIN_X);
    const square = dragLook(100, 100);
    expect(Math.abs(square.dy)).toBeLessThan(Math.abs(square.dx));
    // Aiming down the sights still halves both, inside `turnFpsLook`.
    const hip = turnFpsLook(0, 0, square.dx, square.dy, false);
    const aimed = turnFpsLook(0, 0, square.dx, square.dy, true);
    expect(Math.abs(aimed.yaw)).toBeLessThan(Math.abs(hip.yaw));
  });

  it('survives a pointer event with nothing useful in it', () => {
    expect(dragLook(NaN, Infinity)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('padSlot', () => {
  it('gives every action its own place, on foot and in each vehicle seat', () => {
    const layouts = [
      ['aim', 'reload', 'jump', 'crouch', 'prone', 'vision'],
      ['seat', 'boost', 'altitude', 'descend', 'vision'],
    ];
    for (const actions of layouts) {
      const slots = actions.map(padSlot);
      expect(slots.every(Boolean)).toBe(true);
      expect(new Set(slots).size).toBe(actions.length);
    }
  });
  it('puts the stance in the bottom corner and aim on the edge above jump, as the big shooters do', () => {
    expect(padSlot('prone')).toBe('corner');
    expect(padSlot('crouch')).toBe('corner-left');
    expect(padSlot('jump')).toBe('edge-low');
    expect(padSlot('aim')).toBe('edge-high');
    expect(padSlot('reload')).toBe('beside');
    expect(padSlot('menu')).toBeUndefined();
  });
});

describe('promptLabel', () => {
  it('drops the key a thumb cannot press', () => {
    expect(promptLabel('E · Drive Utility 01')).toBe('Drive Utility 01');
    expect(promptLabel('T · Travel to Raffles Place')).toBe('Travel to Raffles Place');
    expect(promptLabel('E · rare Combat stim')).toBe('rare Combat stim');
  });

  it('leaves a prompt that never had one alone', () => {
    expect(promptLabel('Pick up')).toBe('Pick up');
    expect(promptLabel('')).toBe('');
    expect(promptLabel(null)).toBe('');
  });
});
