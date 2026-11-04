import { expect, it } from 'vitest';
import { briefingGlyph, briefingLineDelay, createBriefingClock } from './deployment-briefing';

const at = (elapsed: number, decayAt: number | null = null) => ({ elapsed, decayAt });
const start = briefingLineDelay(1);

it('types through a scrambled, flashing front and then locks onto the real letter', () => {
  expect(briefingGlyph('Q', 1, 0, at(start - .01), false).opacity).toBe(0);
  const front = briefingGlyph('Q', 1, 0, at(start + .02), false);
  expect(front).toMatchObject({ opacity: 1, glow: 1 });
  expect(front.text).toMatch(/^[A-Z0-9/#%&*+=<>]$/);
  const locked = briefingGlyph('Q', 1, 0, at(start + .15), false);
  expect(locked.text).toBe('Q');
  expect(locked.glow).toBeGreaterThan(.5);
  expect(briefingGlyph('Q', 1, 0, at(start + 1), false)).toEqual({ text: 'Q', opacity: 1, glow: 0 });
});

it('re-encrypts every letter at full strength before fading it, and leaves spaces blank', () => {
  const landing = 3.8, line = 'LOCATION  QUEENSTOWN';
  const glyphs = (elapsed: number) => [...line].map((char, i) => briefingGlyph(char, 1, i, at(elapsed, landing), false));
  expect(glyphs(landing - .01).map(g => g.text).join('')).toBe(line);
  expect(glyphs(landing + 1.3).every(g => g.opacity === 0)).toBe(true);
  [...line].forEach((char, i) => {
    if (char === ' ') return;
    const frames = Array.from({ length: 80 }, (_, f) => briefingGlyph(char, 1, i, at(landing + f / 60, landing), false));
    const scrambled = frames.find(g => g.text !== char);
    expect(scrambled?.opacity).toBe(1);
  });
  expect(briefingGlyph(' ', 1, 8, at(landing + .6, landing), false).text).toBe(' ');
  // Letters leave on their own beats, not as one block.
  const midway = glyphs(landing + .45).map(g => g.opacity);
  expect(new Set(midway.filter((_, i) => line[i] !== ' ')).size).toBeGreaterThan(3);
});

it('holds the same frame when the clock holds, so a pause never reshuffles', () => {
  expect(briefingGlyph('Q', 1, 3, at(4.21, 3.8), false)).toEqual(briefingGlyph('Q', 1, 3, at(4.21, 3.8), false));
});

it('never reveals letters that were not typed before a skip', () => {
  expect(briefingGlyph('W', 3, 20, at(.9, .5), false).opacity).toBe(0);
  expect(briefingGlyph('W', 3, 20, at(1.2, .5), false).opacity).toBe(0);
  expect(briefingGlyph('E', 0, 0, at(.6, .5), false).opacity).toBeGreaterThan(0);
});

it('shows reduced motion as a plain fade with no scrambling', () => {
  const clock = createBriefingClock();
  clock.begin({ respawn: false, time: '06:30', weather: 'Rain', reduced: true });
  clock.advance(1.65); clock.land(false);
  expect(clock.time).toEqual({ elapsed: 1.65, decayAt: 3.2 });
  expect(briefingGlyph('Q', 1, 0, at(0), true).opacity).toBe(0);
  expect(briefingGlyph('Q', 1, 0, at(1.65, 3.2), true)).toEqual({ text: 'Q', opacity: 1, glow: 0 });
  const leaving = briefingGlyph('Q', 1, 0, at(3.5, 3.2), true);
  expect(leaving.text).toBe('Q');
  expect(leaving.opacity).toBeCloseTo(.5);
});

it('outlives the landing, then ends itself, and restarts for a respawn', () => {
  const clock = createBriefingClock(), info = { respawn: false, time: '06:30', weather: 'Rain', reduced: false };
  expect(clock.info).toBeNull();
  clock.begin(info); clock.advance(3.8); clock.land(false);
  expect(clock.time).toEqual({ elapsed: 3.8, decayAt: 3.8 });
  clock.land(true);
  expect(clock.time?.decayAt).toBe(3.8);
  clock.advance(1.2);
  expect(clock.info).toBe(info);
  clock.advance(.1);
  expect(clock.info).toBeNull();
  expect(clock.time).toBeNull();
  clock.begin({ ...info, respawn: true });
  expect(clock.time).toEqual({ elapsed: 0, decayAt: null });
  expect(clock.info?.respawn).toBe(true);
  clock.clear();
  expect(clock.info).toBeNull();
});
