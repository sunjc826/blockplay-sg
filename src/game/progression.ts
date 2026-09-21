export const MAX_LEVEL = 50;
export const ELIMINATION_XP = 25;
export const xpForLevel = (level: number) => { const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) - 1; return 100 * n * (n + 2); };
export function progression(xp: number) {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1; while (level < MAX_LEVEL && total >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level), next = level === MAX_LEVEL ? floor : xpForLevel(level + 1);
  const rank = level < 3 ? 'Recruit' : level < 6 ? 'Operator' : level < 12 ? 'Specialist' : level < 20 ? 'Veteran' : level < 35 ? 'Elite' : 'Legend';
  return { level, rank, xp: total, floor, next, remaining: Math.max(0, next - total), progress: level === MAX_LEVEL ? 1 : (total - floor) / (next - floor) };
}
/**
 * Tokens buy XP at one flat rate, so what a level costs is the gap it closes
 * rather than a price written beside its number. Two things follow that a table
 * of prices would not give: standing halfway up a level halves what skipping
 * the rest of it costs, and a level costs more the higher it is, because the
 * gaps themselves grow (`100 x (2L + 1)` from level L to L+1). The floor keeps
 * the last few XP of a level from rounding down to free.
 */
export const XP_PER_TOKEN = 25;
export const MIN_SKIP_PRICE = 5;
export interface LevelSkip { level: number; next: number; remaining: number; price: number; atMax: boolean }
export function levelSkip(xp: number): LevelSkip {
  const { level, remaining } = progression(xp), atMax = level >= MAX_LEVEL;
  return { level, next: Math.min(MAX_LEVEL, level + 1), remaining, atMax, price: atMax ? 0 : Math.max(MIN_SKIP_PRICE, Math.ceil(remaining / XP_PER_TOKEN)) };
}
/**
 * Tokens to climb from an XP total to a level, buying every level on the way.
 * The first is discounted by whatever progress is already banked and the rest
 * are whole gaps, so this is what a gate in front of a player actually costs
 * rather than what it costs somebody starting over. Summed level by level
 * rather than divided out of the total, so the per-level floor counts.
 */
export function skipCostFrom(xp: number, level: number) {
  const target = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  let total = 0, at = xp;
  while (progression(at).level < target) { const skip = levelSkip(at); total += skip.price; at = xpForLevel(skip.next); }
  return total;
}
/** The same climb from a standing start: what a gate asks of someone who earns no XP at all. */
export const skipCostToLevel = (level: number) => skipCostFrom(0, level);
export const MULTIKILL_WINDOW = 3;
export interface KillChain { count: number; lastAt: number }
const CALLOUTS = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL', 'ULTRA KILL', 'MONSTER KILL', 'UNSTOPPABLE', 'RAMPAGE'];
export function registerElimination(chain: KillChain, at: number) {
  const count = chain.count > 0 && at >= chain.lastAt && at - chain.lastAt <= MULTIKILL_WINDOW ? chain.count + 1 : 1;
  return { count, lastAt: at, label: CALLOUTS[Math.min(count, 8)] };
}
