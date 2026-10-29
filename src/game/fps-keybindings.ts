/** Physical positions keep movement and number slots usable with Shift and non-US layouts. */
export function fpsControlKey(event: Pick<KeyboardEvent, 'code' | 'key' | 'altKey' | 'metaKey'>, release = false): string | null {
  if (!release && (event.altKey || event.metaKey)) return null;
  const code = event.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Control(Left|Right)$/.test(code)) return 'control';
  if (/^Shift(Left|Right)$/.test(code)) return 'shift';
  if (code === 'Space') return ' ';
  if (['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) return code.toLowerCase();
  // Older synthetic inputs and accessibility tools may supply only a key.
  return !code || code === 'Unidentified' ? event.key.toLowerCase() : null;
}

const ACTIONS = {
  e: 'interact', n: 'vision', j: 'palette', l: 'light', b: 'laser',
  k: 'inspect', z: 'prone', x: 'cant', v: 'seat', control: 'crouch-hold',
} as const;
export type FpsKeyAction = typeof ACTIONS[keyof typeof ACTIONS] | 'crouch-toggle' | 'vehicle-camera';
export function fpsKeyAction(key: string, mounted: boolean): FpsKeyAction | undefined {
  if (key === 'c') return mounted ? 'vehicle-camera' : 'crouch-toggle';
  return ACTIONS[key as keyof typeof ACTIONS];
}

/** One contextual E target; a blocked loot pickup must not fall through to a vendor. */
export function fpsInteractionTarget(mounted: boolean, loot: boolean, npc: boolean) {
  return mounted ? 'vehicle' : loot ? 'loot' : npc ? 'npc' : 'vehicle';
}

/** Keyboard stance is independent of the semantic hold used by touch and the pilot. */
export function createKeyboardCrouch() {
  const held = new Set<string>();
  let toggled = false;
  return {
    get active() { return toggled || held.size > 0; },
    get holding() { return held.size > 0; },
    hold(code: string, down: boolean) { if (down) held.add(code); else held.delete(code); },
    toggle() { toggled = !toggled; },
    clear() { held.clear(); toggled = false; },
  };
}
