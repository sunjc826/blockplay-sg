import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SWIM_PULL_AT, SWIM_STROKE_SECONDS, advanceSwim, createSwim, createSwimHands, swimMotion } from './fps-swim-hands';

const run = (state: ReturnType<typeof createSwim>, seconds: number, speed: number, swimming = true, hands = true) => {
  let pulls = 0;
  for (let t = 0; t < seconds; t += 1 / 60) if (advanceSwim(state, swimming, hands, speed, 1 / 60)) pulls++;
  return pulls;
};

describe('the swimming stroke', () => {
  it('pulls once a stroke while moving, and not while treading', () => {
    const state = createSwim();
    expect(run(state, SWIM_STROKE_SECONDS * 4, 1.25)).toBe(4);
    expect(state.stroke).toBeGreaterThan(.95);
    expect(run(state, 3, 0)).toBeLessThanOrEqual(1);
    // The stroke under way is finished, then the hands scull.
    expect(state.phase).toBe(0);
    expect(state.stroke).toBeLessThan(.05);
  });
  it('lifts the head on the pull and leaves it down in the glide', () => {
    const state = { ...createSwim(), stroke: 1 };
    const glide = swimMotion({ ...state, phase: SWIM_PULL_AT / 2 }), pull = swimMotion({ ...state, phase: SWIM_PULL_AT + .25 });
    expect(pull.bob).toBeGreaterThan(glide.bob + .03);
    expect(pull.pitch).toBeGreaterThan(0);
    expect(glide.pitch).toBe(0);
  });
  it('puts the hands away out of the water and when a sidearm is held', () => {
    const state = createSwim();
    run(state, 1, 1.25);
    expect(state.afloat).toBeGreaterThan(.95);
    run(state, 1, 0, true, false);
    expect(state.afloat).toBeLessThan(.01);
    run(state, 1, 1.25);
    run(state, 1, 0, false);
    expect(state.afloat).toBeLessThan(.01);
    expect(state.phase).toBe(0);
  });
});

describe('the swimming hands', () => {
  it('mirror each other, stay ahead of the eye, and loop without a jump', () => {
    const parent = new THREE.Group(), hands = createSwimHands(parent), [left, right] = hands.root.children;
    hands.update(null);
    expect(hands.root.visible).toBe(false);
    let last: THREE.Vector3 | null = null;
    for (let i = 0; i <= 200; i++) {
      hands.update({ ...createSwim(), afloat: 1, stroke: 1, phase: (i / 200) % 1 });
      expect(hands.root.visible).toBe(true);
      expect(left.position.x).toBeCloseTo(-right.position.x, 6);
      expect(right.position.x).toBeGreaterThan(0);
      expect(right.position.z).toBeLessThan(-.25);
      if (last) expect(right.position.distanceTo(last)).toBeLessThan(.02);
      last = right.position.clone();
    }
    // A narrow screen brings them in.
    hands.update({ ...createSwim(), afloat: 1, stroke: 1, phase: .55 });
    const wide = right.position.x;
    hands.update({ ...createSwim(), afloat: 1, stroke: 1, phase: .55 }, .6);
    expect(right.position.x).toBeLessThan(wide * .6);
    hands.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
