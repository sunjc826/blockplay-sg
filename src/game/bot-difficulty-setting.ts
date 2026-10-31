import { normalizeBotDifficulty, type BotDifficulty } from './bot-difficulty';

const KEY = 'blockplay-sg-bot-difficulty-v1';
let current: BotDifficulty | undefined;
const listeners = new Set<() => void>();

export function getBotDifficulty(): BotDifficulty {
  if (current === undefined) {
    try { current = normalizeBotDifficulty(localStorage.getItem(KEY)); }
    catch { current = 'normal'; }
  }
  return current;
}

export function setBotDifficulty(value: BotDifficulty) {
  current = normalizeBotDifficulty(value);
  try { localStorage.setItem(KEY, current); } catch { /* Keep the session preference when storage is blocked. */ }
  listeners.forEach(listener => listener());
}

export function subscribeBotDifficulty(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
