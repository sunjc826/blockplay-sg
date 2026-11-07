import { useEffect, useRef, useSyncExternalStore } from 'react';

type Prompt = { title: string; detail: string; confirmLabel?: string; action: () => void };
type Guard = Omit<Prompt, 'action'> & { onRequest?: () => void };
let guard: Guard | null = null;
let prompt: Prompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export const hasNavigationGuard = () => guard !== null;
export function registerNavigationGuard(next: Guard) {
  guard = next;
  return () => { if (guard === next) guard = null; };
}
export function confirmAction(next: Prompt) { if (!prompt) { prompt = next; emit(); } }
export function resolveConfirmation(accept: boolean) {
  const previous = prompt; prompt = null; emit();
  if (accept) previous?.action();
}
export function requestLeave(action: () => void): boolean {
  if (prompt) return false;
  if (!guard) { action(); return true; }
  guard.onRequest?.();
  confirmAction({ ...guard, action });
  return false;
}
export function useConfirmation() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => prompt, () => null);
}
export function useNavigationGuard(enabled: boolean, options: Guard) {
  const latest = useRef(options); latest.current = options;
  useEffect(() => {
    if (!enabled) return;
    const registration: Guard = { ...latest.current, onRequest: () => latest.current.onRequest?.() };
    const unregister = registerNavigationGuard(registration);
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', unload);
    return () => { unregister(); window.removeEventListener('beforeunload', unload); };
  }, [enabled, options.title, options.detail]);
}
