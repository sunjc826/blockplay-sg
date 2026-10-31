import type { FocusEvent, MouseEvent, PointerEvent } from 'react';
import type { ArmoryStore } from '../game/use-armory';
import menu from '../audio/menu/manifest.json';
import manifest from '../audio/store/manifest.json';

export type StoreSound = 'hover' | 'select' | 'equip' | 'purchase' | 'blocked';
let tracks: Record<StoreSound, HTMLAudioElement> | null = null;
let foreground: HTMLAudioElement | null = null;
let lastHover = -Infinity;

/** Only mounted stores preload these clips; navigation reuses the approved glass pair. */
export function prepareStoreAudio() {
  if (tracks || typeof Audio === 'undefined') return;
  const make = (directory: string, file: string, volume: number) => {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${directory}/${file}`);
    audio.preload = 'auto'; audio.volume = volume; audio.load();
    return audio;
  };
  tracks = {
    hover: make('menu', menu.clips.hover.file, .5),
    select: make('menu', menu.clips.click.file, .55),
    equip: make('store', manifest.clips.equip.file, .65),
    purchase: make('store', manifest.clips.purchase.file, .65),
    blocked: make('store', manifest.clips.blocked.file, .45),
  };
}

export function stopStoreHover() { tracks?.hover.pause(); }
export function stopStoreAudio() {
  if (tracks) Object.values(tracks).forEach(audio => audio.pause());
  foreground = null;
}

/** One voice at a time. Missing/blocked audio never holds up the store action. */
export function playStoreSound(sound: StoreSound) {
  if (document.hidden) return;
  prepareStoreAudio();
  if (!tracks) return;
  const audio = tracks[sound], now = performance.now();
  if (audio.readyState < 2) return;
  if (sound === 'hover' && (now - lastHover < 80 || (foreground && !foreground.paused))) return;
  if (sound === 'hover') lastHover = now;
  stopStoreAudio();
  if (sound !== 'hover') foreground = audio;
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}

/** Feedback comes from the actual state mutation, including stale/double-click rejection. */
export function storeWithAudio(store: ArmoryStore, play: (sound: StoreSound) => void = playStoreSound): ArmoryStore {
  const outcome = <Args extends unknown[]>(run: (...args: Args) => boolean, sound: 'purchase' | 'equip') => (...args: Args) => {
    const changed = run(...args);
    play(changed ? sound : 'blocked');
    return changed;
  };
  return { ...store,
    buy: outcome(store.buy, 'purchase'), buyLevel: outcome(store.buyLevel, 'purchase'),
    equipItem: outcome(store.equipItem, 'equip'), selectCarrySlot: outcome(store.selectCarrySlot, 'equip'),
    demoTopUp: outcome(store.demoTopUp, 'purchase'),
  };
}

function control(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('button, a[href], select');
  return element && !element.matches(':disabled, [aria-disabled="true"]') ? element : null;
}

/** Scoped to the shop and its portalled guide, never the document or gameplay canvas. */
export const storeSoundEvents = {
  onPointerOver(event: PointerEvent<HTMLElement>) {
    const element = control(event.target);
    if (event.pointerType !== 'mouse' || !element || (event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) return;
    playStoreSound('hover');
  },
  onFocus(event: FocusEvent<HTMLElement>) {
    if (control(event.target)?.matches(':focus-visible')) playStoreSound('hover');
  },
  onClick(event: MouseEvent<HTMLElement>) {
    const element = control(event.target);
    if (!element || element.tagName === 'SELECT' || element.hasAttribute('data-store-outcome') || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    playStoreSound('select');
  },
};
