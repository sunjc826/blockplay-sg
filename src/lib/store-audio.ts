import type { FocusEvent, MouseEvent, PointerEvent } from 'react';
import type { ArmoryStore } from '../game/use-armory';
import menu from '../audio/menu/manifest.json';
import manifest from '../audio/store/manifest.json';
import { storeEquipSound } from './store-equip-sound';

export type StoreSound = 'hover' | 'select' | keyof typeof manifest.clips;
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
    ...Object.fromEntries(Object.entries(manifest.clips).map(([sound, clip]) =>
      [sound, make('store', clip.file, sound === 'blocked' ? .45 : .65)])),
  } as Record<StoreSound, HTMLAudioElement>;
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
  const outcome = <Args extends unknown[]>(run: (...args: Args) => boolean, sound: StoreSound | ((...args: Args) => StoreSound)) => (...args: Args) => {
    const changed = run(...args);
    play(changed ? typeof sound === 'function' ? sound(...args) : sound : 'blocked');
    return changed;
  };
  return { ...store,
    buy: outcome(store.buy, 'purchase'), buyLevel: outcome(store.buyLevel, 'purchase'),
    equipItem: outcome(store.equipItem, id => storeEquipSound(id)),
    selectCarrySlot: outcome(store.selectCarrySlot, (_slot, family) =>
      family === null ? 'equip' : storeEquipSound(store.profile.guns[family]?.variant)),
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
