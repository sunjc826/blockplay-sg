import { useLayoutEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]';
/** Works for body portals and fullscreen portals; restores every prior inert value. */
export function useModalFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const changed: [HTMLElement, boolean][] = [];
    let branch: HTMLElement = panel;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) { changed.push([sibling, sibling.inert]); sibling.inert = true; }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    const controls = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0);
    (controls()[0] ?? panel).focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = controls(), at = items.indexOf(document.activeElement as HTMLElement);
      event.preventDefault(); event.stopImmediatePropagation();
      (items[(at + (event.shiftKey ? -1 : 1) + items.length) % items.length] ?? panel).focus();
    };
    const contain = (event: FocusEvent) => { if (!panel.contains(event.target as Node)) (controls()[0] ?? panel).focus({ preventScroll: true }); };
    window.addEventListener('keydown', key, true); document.addEventListener('focusin', contain);
    return () => {
      window.removeEventListener('keydown', key, true); document.removeEventListener('focusin', contain);
      changed.forEach(([element, inert]) => { element.inert = inert; });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref, open]);
}
