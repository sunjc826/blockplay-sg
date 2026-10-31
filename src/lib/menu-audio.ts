import manifest from '../audio/menu/manifest.json';

type MenuSound = 'hover' | 'click';
let tracks: Record<MenuSound, HTMLAudioElement> | null = null;
let lastHover = -Infinity;

/** Two small recordings shared across menu visits; no game engine or API calls. */
export function prepareMenuAudio() {
  if (tracks || typeof Audio === 'undefined') return;
  const make = (sound: MenuSound) => {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/menu/${manifest.clips[sound].file}`);
    audio.preload = 'auto';
    audio.volume = .65;
    audio.load();
    return audio;
  };
  tracks = { hover: make('hover'), click: make('click') };
}

/** Never queue an unloaded hover or stack ticks when the pointer crosses items quickly. */
export function playMenuSound(sound: MenuSound) {
  if (document.hidden) return;
  prepareMenuAudio();
  if (!tracks) return;
  const now = performance.now();
  if (sound === 'hover' && (tracks.hover.readyState < 2 || !tracks.click.paused || now - lastHover < 75)) return;
  if (sound === 'hover') lastHover = now;
  stopMenuHover();
  const audio = tracks[sound];
  audio.pause();
  audio.currentTime = 0;
  // Browsers can require a click or keypress before the first hover is audible.
  // A blocked attempt stays silent; navigation never waits for audio permission.
  void audio.play().catch(() => {});
}

/** Leaving the menu cancels hover; the short confirmation may finish over the wipe. */
export function stopMenuHover() {
  tracks?.hover.pause();
}
