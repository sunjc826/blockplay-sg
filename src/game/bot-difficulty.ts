export type BotDifficulty = 'easy' | 'normal' | 'hard';

/** Accuracy only: health, damage, spotting and the two-shooter limit stay shared. */
export const BOT_DIFFICULTIES = {
  easy: { name: 'Easy', description: 'More time to react and more forgiving enemy aim.', opening: 6.5, tracking: .95, settled: .35, acquire: 2.5, settle: 5 },
  normal: { name: 'Normal', description: 'Forgiving opening shots; accurate fire after sustained exposure.', opening: 6, tracking: .6, settled: .12, acquire: 2, settle: 4 },
  hard: { name: 'Hard', description: 'Enemies tighten their aim faster and shoot more precisely.', opening: 5.5, tracking: .35, settled: .075, acquire: 1.5, settle: 3 },
} as const;

export const normalizeBotDifficulty = (value: unknown): BotDifficulty =>
  value === 'easy' || value === 'hard' ? value : 'normal';
