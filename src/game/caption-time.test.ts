import { expect, test } from 'vitest';
import { captionSeconds, CAPTION_TIME } from './caption-time';

test('a caption stays longer the more there is to read, within bounds', () => {
  expect(captionSeconds('Nice.')).toBe(CAPTION_TIME.min);
  expect(captionSeconds(Array(12).fill('word').join(' '))).toBeCloseTo(6.3);
  expect(captionSeconds(Array(20).fill('word').join(' '))).toBeCloseTo(9.5);
  expect(captionSeconds(Array(200).fill('word').join(' '))).toBe(CAPTION_TIME.max);
});

test('a spoken caption outlasts its audio', () => {
  expect(captionSeconds('Nice.', 7)).toBe(8);
  expect(captionSeconds(Array(20).fill('word').join(' '), 3)).toBeCloseTo(9.5);
});

test('holdCaption waits out the reading time, then the audio, then a beat', async () => {
  const { vi } = await import('vitest'); const { holdCaption } = await import('./caption-time');
  vi.useFakeTimers();
  try {
    const dismiss = vi.fn(); let finish = () => {};
    holdCaption('one two three four five six seven eight nine ten', () => new Promise<void>(resolve => { finish = resolve; }), dismiss);
    await vi.advanceTimersByTimeAsync(5400); expect(dismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200); expect(dismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000); finish();
    await vi.advanceTimersByTimeAsync(900); expect(dismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200); expect(dismiss).toHaveBeenCalledOnce();
    const silent = vi.fn(), cancelled = vi.fn();
    holdCaption('Nice.', () => Promise.resolve(), silent);
    holdCaption('Nice.', () => Promise.resolve(), cancelled)();
    await vi.advanceTimersByTimeAsync(4100); expect(silent).toHaveBeenCalledOnce(); expect(cancelled).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
