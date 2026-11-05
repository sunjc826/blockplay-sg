import manifest from '../audio/menu/manifest.json';
import { getEffectsVolume } from './effects-volume';

type MenuSound = 'hover' | 'click';
let tracks: Record<MenuSound, HTMLAudioElement> | null = null;
let lastHover = -Infinity;
const LEVEL = .65;

/** Two small recordings shared across menu visits; no game engine or API calls. */
export function prepareMenuAudio() {
  if (tracks || typeof Audio === 'undefined') return;
  const make = (sound: MenuSound) => {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/menu/${manifest.clips[sound].file}`);
    audio.preload = 'auto';
    audio.volume = LEVEL;
    audio.load();
    return audio;
  };
  tracks = { hover: make('hover'), click: make('click') };
}

/** Never queue an unloaded hover or stack ticks when the pointer crosses items quickly. */
export function playMenuSound(sound: MenuSound) {
  const volume = getEffectsVolume();
  // Checked here as well as set below, as iOS Safari ignores an element's volume.
  if (document.hidden || volume === 0) return;
  prepareMenuAudio();
  if (!tracks) return;
  const now = performance.now();
  if (sound === 'hover' && (tracks.hover.readyState < 2 || !tracks.click.paused || now - lastHover < 75)) return;
  if (sound === 'hover') lastHover = now;
  stopMenuHover();
  const audio = tracks[sound];
  audio.pause();
  audio.currentTime = 0;
  audio.volume = LEVEL * volume;
  // Browsers can require a click or keypress before the first hover is audible.
  // A blocked attempt stays silent; navigation never waits for audio permission.
  void audio.play().catch(() => {});
}

/** Leaving the menu cancels hover; the short confirmation may finish over the next screen. */
export function stopMenuHover() {
  tracks?.hover.pause();
}
