import { DEFAULT_ENVIRONMENT, sanitizeEnvironment, type EnvironmentSettings } from './world-events';
const KEY = 'blockplay-sg-environment-v1';
let current: EnvironmentSettings | undefined;
const listeners = new Set<() => void>();
export function getEnvironmentSettings(): EnvironmentSettings {
  if (!current) {
    try { current = sanitizeEnvironment(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
    catch { current = { ...DEFAULT_ENVIRONMENT }; }
  }
  return current;
}
export function setEnvironmentSettings(patch: Partial<EnvironmentSettings>) {
  current = sanitizeEnvironment({ ...getEnvironmentSettings(), ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* Play works without storage. */ }
  listeners.forEach(listener => listener());
}
export function subscribeEnvironment(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
