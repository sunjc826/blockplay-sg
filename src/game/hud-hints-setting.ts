import { useSyncExternalStore } from 'react';

const KEY = 'blockplay-sg-hud-hints-v1';
let current: boolean | undefined;
const listeners = new Set<() => void>();

export function getHudHints(): boolean {
  if (current === undefined) {
    try { current = localStorage.getItem(KEY) !== 'off'; }
    catch { current = true; }
  }
  return current;
}

export function setHudHints(enabled: boolean) {
  current = enabled;
  try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* Settings still work without storage. */ }
  listeners.forEach(listener => listener());
}

export function subscribeHudHints(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useHudHints = () => useSyncExternalStore(subscribeHudHints, getHudHints, getHudHints);
