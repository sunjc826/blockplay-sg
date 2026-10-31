/** The optional browser API; only request the key needed for Ctrl+W movement. */
export interface FpsKeyboard {
  lock(keys: string[]): Promise<void>;
  unlock(): void;
}

/** Owned by one native-fullscreen session. Escape remains a browser escape hatch. */
export function createFpsKeyboardLock(keyboard?: FpsKeyboard) {
  let active = false, generation = 0;
  return {
    async enter(): Promise<boolean | null> {
      const ticket = ++generation;
      if (!keyboard?.lock) return false;
      active = true;
      try {
        await keyboard.lock(['KeyW']);
        // Permission can settle after fullscreen exits or the component unmounts.
        // Do not release a newer session's lock when an older request settles.
        if (!active) keyboard.unlock();
        return ticket === generation ? true : null;
      } catch { return ticket === generation ? false : null; }
    },
    exit() {
      generation++;
      if (active) { active = false; keyboard?.unlock(); }
    },
  };
}
