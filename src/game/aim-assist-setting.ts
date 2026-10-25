/** Whether the thumb gets aim assist. On by default; the engine reads it live, so a pause-card toggle applies on resume. */
const KEY = 'blockplay-sg-aim-assist-v1';
let current: boolean | undefined;
const listeners = new Set<() => void>();
export function getAimAssist(): boolean {
  if (current === undefined) {
    try { current = localStorage.getItem(KEY) !== 'off'; }
    catch { current = true; }
  }
  return current;
}
export function setAimAssist(enabled: boolean) {
  current = enabled;
  try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* Play works without storage. */ }
  listeners.forEach(listener => listener());
}
export function subscribeAimAssist(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
