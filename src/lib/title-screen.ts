let seen = false;

/**
 * Browsers hold sound until a gesture, so a page that has had none opens on the
 * title screen. Later visits to the menu in this page load skip it.
 */
export function needsTitleScreen(): boolean {
  return !seen && typeof navigator !== 'undefined' && !navigator.userActivation?.hasBeenActive;
}

export function markTitleScreenSeen() { seen = true; }

// Keys that do something else, or that a browser does not count as a gesture.
const IGNORED_KEYS = new Set(['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'FnLock', 'NumLock', 'ScrollLock', 'ContextMenu']);

/** A browser shortcut such as reload or a held key must not pass the title screen. */
export function startsFromTitleScreen(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  return !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey
    && !IGNORED_KEYS.has(event.key) && !/^F\d+$/.test(event.key);
}

/** Where a box at its natural place must go to sit large and centred, as CSS translate and scale values. */
export function titleLogoPlacement(box: { left: number; top: number; width: number; height: number }, viewport: { width: number; height: number }) {
  const scale = Math.max(1, Math.min(3.2, viewport.width * .72 / box.width, viewport.height * .3 / box.height));
  return {
    x: (viewport.width - box.width * scale) / 2 - box.left,
    y: viewport.height * .44 - box.height * scale / 2 - box.top,
    scale,
  };
}
