import type React from 'react';

/** When each control last acted on a touch, so the click a browser may send after it is not a second press. */
const touchedAt = new WeakMap<Element, number>();
/** Longer than any browser's delay between a touch and the click it synthesises. */
const FOLLOW_UP_MS = 800;

/**
 * Press handlers for an on-screen control that must answer every finger.
 *
 * A phone only turns the first finger on the screen into a `click`: with the
 * left thumb already steering the stick, a right-thumb tap on Reload produced
 * pointer events and nothing else, so an `onClick` control simply ignored it.
 * Acting on touch-down answers any finger (and answers sooner, as the trigger
 * already does); `onClick` stays for the mouse and the keyboard, and skips the
 * click that follows a touch it has already acted on.
 */
export function tapProps(action: () => void) {
  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' || (event.currentTarget as HTMLButtonElement).disabled) return;
      touchedAt.set(event.currentTarget, performance.now());
      action();
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      const at = touchedAt.get(event.currentTarget);
      if (at !== undefined && performance.now() - at < FOLLOW_UP_MS) return;
      action();
    },
  };
}
