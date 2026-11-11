import { useSyncExternalStore } from 'react';

export type MenuDesign = 'classic' | 'next-gen';
export const MENU_DESIGNS = [
  { id: 'classic', name: 'Classic', description: 'The original compact menus.' },
  { id: 'next-gen', name: 'Next-gen', description: 'Cinematic panels with animated artwork and focus. Default.' },
] as const;
const KEY = 'blockplay-sg-menu-design-v1';
let current: MenuDesign | undefined;
const listeners = new Set<() => void>();

export function getMenuDesign(): MenuDesign {
  if (current === undefined) {
    try { current = localStorage.getItem(KEY) === 'classic' ? 'classic' : 'next-gen'; }
    catch { current = 'next-gen'; }
  }
  return current;
}

export function setMenuDesign(design: MenuDesign) {
  current = design;
  try { localStorage.setItem(KEY, design); } catch { /* A session choice still works. */ }
  listeners.forEach(listener => listener());
}

export function subscribeMenuDesign(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useMenuDesign = () => useSyncExternalStore(subscribeMenuDesign, getMenuDesign, () => 'next-gen' as const);
