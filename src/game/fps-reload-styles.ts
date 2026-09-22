/** Cosmetic choreography only: gameplay and server reload durations remain authoritative. */
export const RELOAD_STYLES = ['rookie', 'standard', 'tactical', 'fast', 'dual-mag'] as const;
export type ReloadStyle = typeof RELOAD_STYLES[number];
export const RELOAD_STYLE_LABELS: Record<ReloadStyle, string> = {
  rookie: 'Rookie', standard: 'Standard', tactical: 'Tactical', fast: 'Fast', 'dual-mag': 'Dual mag',
};
export function normalizeReloadStyle(value: unknown): ReloadStyle {
  return RELOAD_STYLES.includes(value as ReloadStyle) ? value as ReloadStyle : 'standard';
}
export function weaponReloadStyle(style: ReloadStyle, weapon: number): ReloadStyle {
  return style === 'dual-mag' && weapon !== 0 ? 'standard' : style;
}
// Map real progress to choreography phases: reach, extract, replace, seat, action, settle.
// The Fast style finishes the manipulation early, but never grants early ammunition.
const TIMINGS: Record<ReloadStyle, readonly number[]> = {
  standard: [0, .16, .34, .48, .68, .74, .84, 1],
  rookie: [0, .20, .37, .56, .73, .83, .92, 1],
  tactical: [0, .13, .29, .50, .69, .77, .87, 1],
  fast: [0, .09, .21, .30, .47, .54, .68, 1],
  'dual-mag': [0, .12, .28, .40, .57, .65, .80, 1],
};
export function reloadPhase(progress: number, style: ReloadStyle = 'standard') {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const times = TIMINGS[style], phases = TIMINGS.standard;
  const i = Math.max(0, times.findIndex((_, index) => index < times.length - 1 && p <= times[index + 1]));
  return phases[i] + (phases[i + 1] - phases[i]) * (p - times[i]) / (times[i + 1] - times[i]);
}
export const RELOAD_STYLE_STORAGE = 'blockplay-reload-style';
export function readReloadStyle(): ReloadStyle {
  try { return normalizeReloadStyle(localStorage.getItem(RELOAD_STYLE_STORAGE)); } catch { return 'standard'; }
}
export function saveReloadStyle(style: ReloadStyle) {
  try { localStorage.setItem(RELOAD_STYLE_STORAGE, style); } catch { /* Storage is optional. */ }
}
