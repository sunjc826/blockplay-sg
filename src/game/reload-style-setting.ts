import { useSyncExternalStore } from 'react';
import type { ReloadStyle } from './fps-weapon-motion';

/** Which reload animation to play. Purely a look; the engine reads it live, so a pause-card change applies on resume. */
export const RELOAD_STYLES: readonly { id: ReloadStyle; name: string; description: string }[] = [
  { id: 'improved', name: 'Improved', description: 'The empty magazine is ripped out and thrown clear.' },
  { id: 'original', name: 'Original', description: 'The empty magazine is pulled straight down and dropped.' },
];
const KEY = 'blockplay-sg-reload-style-v1';
let current: ReloadStyle | undefined;
const listeners = new Set<() => void>();

export function getReloadStyle(): ReloadStyle {
  if (current === undefined) {
    try { current = localStorage.getItem(KEY) === 'original' ? 'original' : 'improved'; }
    catch { current = 'improved'; }
  }
  return current;
}

export function setReloadStyle(style: ReloadStyle) {
  current = style;
  try { localStorage.setItem(KEY, style); } catch { /* Play works without storage. */ }
  listeners.forEach(listener => listener());
}

export function subscribeReloadStyle(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useReloadStyle = () => useSyncExternalStore(subscribeReloadStyle, getReloadStyle, getReloadStyle);
