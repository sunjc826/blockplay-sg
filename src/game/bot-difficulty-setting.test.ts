import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let saved: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); saved = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('defaults to Normal and persists every preset across reloads', async () => {
  expect((await import('./bot-difficulty-setting')).getBotDifficulty()).toBe('normal');
  for (const difficulty of ['hard', 'easy', 'normal'] as const) {
    (await import('./bot-difficulty-setting')).setBotDifficulty(difficulty);
    vi.resetModules();
    expect((await import('./bot-difficulty-setting')).getBotDifficulty()).toBe(difficulty);
  }
});

it('falls back to Normal for invalid saved values', async () => {
  saved.set('blockplay-sg-bot-difficulty-v1', 'impossible');
  expect((await import('./bot-difficulty-setting')).getBotDifficulty()).toBe('normal');
});

it('updates subscribers and still works with blocked storage', async () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } });
  const setting = await import('./bot-difficulty-setting');
  expect(setting.getBotDifficulty()).toBe('normal');
  const listener = vi.fn(() => setting.getBotDifficulty()), unsubscribe = setting.subscribeBotDifficulty(listener);
  setting.setBotDifficulty('easy'); expect(listener).toHaveReturnedWith('easy');
  unsubscribe(); setting.setBotDifficulty('hard');
  expect(listener).toHaveBeenCalledTimes(1); expect(setting.getBotDifficulty()).toBe('hard');
});
