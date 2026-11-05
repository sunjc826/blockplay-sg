import { describe, expect, it } from 'vitest';
import { SLIDE_AIR_GRACE, SLIDE_BOOST, SLIDE_COOLDOWN, SLIDE_SECONDS, advanceSlide, coolSlide, createSlide, endSlide, looksLikeSlide, resolveSlideContact, startSlide } from './fps-slide';

const run = (fps: number, input: [number, number] = [0, 0]) => {
  const state = createSlide(); startSlide(state, 7, 0, 7, 2.1);
  let x = 0, z = 0, frames = 0;
  while (state.active && frames < 1000) { const step = advanceSlide(state, input[0], input[1], true, 1 / fps); x += step.x; z += step.z; frames++; }
  return { state, x, z, frames };
};
describe('combat slide', () => {
  it('starts only from a real run, with a kick along the run', () => {
    expect(startSlide(createSlide(), 2, 0, 7, 2.1)).toBe(false);
    expect(startSlide(createSlide(), 0, 0, 7, 2.1)).toBe(false);
    const state = createSlide();
    expect(startSlide(state, 0, -7, 7, 2.1)).toBe(true);
    expect(state).toMatchObject({ active: true, x: 0, z: -1 });
    expect(state.speed).toBeCloseTo(7 * SLIDE_BOOST);
  });
  it('a loaded runner can still slide, at their own slower speeds', () => {
    const state = createSlide();
    expect(startSlide(state, 3.5, 0, 3.5, 1.05)).toBe(true);
    expect(state.speed).toBeLessThan(5);
  });
  it('covers about five metres and hands over above a crouch walk', () => {
    const { state, x } = run(60);
    expect(x).toBeGreaterThan(4.3); expect(x).toBeLessThan(5.3);
    expect(state.active).toBe(false);
    expect(state.speed).toBeGreaterThan(2.1);
    const fading = createSlide(); startSlide(fading, 7, 0, 7, 2.1);
    advanceSlide(fading, 0, 0, true, SLIDE_SECONDS * .99);
    expect(fading.speed).toBeGreaterThan(2.1); expect(fading.speed).toBeLessThan(3.5);
  });
  it('travels the same distance at any frame rate', () => {
    // Carried on at its final speed to a common moment, as walking would pick it up.
    const [a, b, c] = [30, 60, 144].map(fps => { const { x, frames, state } = run(fps); return x + state.speed * (1.25 - frames / fps); });
    expect(a).toBeCloseTo(c, 8); expect(b).toBeCloseTo(c, 8);
  });
  it('the stick leans the line but cannot turn it round', () => {
    const leaned = run(60, [0, 1]);
    expect(leaned.z).toBeGreaterThan(.5); expect(leaned.z).toBeLessThan(leaned.x);
    const back = run(60, [-1, 0]);
    expect(back.x).toBeCloseTo(run(60).x, 8); expect(back.z).toBe(0);
  });
  it('rides out a kerb but ends off a real drop', () => {
    const state = createSlide(); startSlide(state, 7, 0, 7, 2.1);
    advanceSlide(state, 0, 0, false, SLIDE_AIR_GRACE * .9); expect(state.active).toBe(true);
    advanceSlide(state, 0, 0, true, .01); advanceSlide(state, 0, 0, false, SLIDE_AIR_GRACE * .9); expect(state.active).toBe(true);
    advanceSlide(state, 0, 0, false, SLIDE_AIR_GRACE * .2); expect(state.active).toBe(false);
  });
  it('runs along a wall and stops against one it hits square', () => {
    const along = createSlide(); startSlide(along, 7, 0, 7, 2.1); const before = along.speed;
    resolveSlideContact(along, .1, 0, .06, .02);
    expect(along.active).toBe(true); expect(along.speed).toBeLessThan(before); expect(Math.hypot(along.x, along.z)).toBeCloseTo(1);
    const square = createSlide(); startSlide(square, 7, 0, 7, 2.1);
    resolveSlideContact(square, .1, 0, .01, 0);
    expect(square.active).toBe(false); expect(square.speed).toBe(0);
    const clear = createSlide(); startSlide(clear, 7, 0, 7, 2.1); const speed = clear.speed;
    resolveSlideContact(clear, .1, 0, .1, 0);
    expect(clear.speed).toBe(speed);
  });
  it('cools down from its end, and only then can start again', () => {
    const state = createSlide(); startSlide(state, 7, 0, 7, 2.1);
    coolSlide(state, 5); endSlide(state);
    expect(state.cooldown).toBe(SLIDE_COOLDOWN);
    expect(startSlide(state, 7, 0, 7, 2.1)).toBe(false);
    coolSlide(state, SLIDE_COOLDOWN);
    expect(startSlide(state, 7, 0, 7, 2.1)).toBe(true);
  });
  it('slide then sprint does not outrun just sprinting', () => {
    const cycle = SLIDE_SECONDS + SLIDE_COOLDOWN;
    expect(run(60).x + 7 * SLIDE_COOLDOWN).toBeLessThan(7 * cycle);
  });
  it('tells a remote slide from a crouch walk by speed', () => {
    expect(looksLikeSlide(1, 2.1)).toBe(false);
    expect(looksLikeSlide(0, 7)).toBe(false);
    expect(looksLikeSlide(1, 7)).toBe(true);
  });
});
