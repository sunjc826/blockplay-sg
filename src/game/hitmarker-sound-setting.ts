import { useSyncExternalStore } from 'react';

/** Whether a hit you land plays its hitmarker sound (tick, headshot ting, kill thunk). On by default; the engine reads it live. */
const KEY = 'blockplay-sg-hitmarker-sound-v1';
let current: boolean | undefined;
const listeners = new Set<() => void>();

export function getHitmarkerSound(): boolean {
  if (current === undefined) {
    try { current = localStorage.getItem(KEY) !== 'off'; }
    catch { current = true; }
  }
  return current;
}

export function setHitmarkerSound(enabled: boolean) {
  current = enabled;
  try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* Play works without storage. */ }
  listeners.forEach(listener => listener());
}

export function subscribeHitmarkerSound(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useHitmarkerSound = () => useSyncExternalStore(subscribeHitmarkerSound, getHitmarkerSound, getHitmarkerSound);
