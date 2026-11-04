import { useSyncExternalStore } from 'react';
import manifest from '../audio/music/manifest.json';

const KEY = 'blockplay-sg-menu-music-volume-v1';
// The track's average level stays below the peaks of the quiet glass hover and click sounds.
const DEFAULT_VOLUME = .4;
const FADE_SECONDS = .5;
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

/** The screens the theme plays over. Everything else has its own sound, or the game's. */
const MUSIC_ROUTES: ReadonlySet<string> = new Set(['menu', 'inventory', 'settings']);
export const hasMenuMusic = (route: string) => MUSIC_ROUTES.has(route);

let wanted = false;
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let loading = false;
let closing: ReturnType<typeof setTimeout> | undefined;
let volume: number | undefined;
const listeners = new Set<() => void>();

export function getMenuMusicVolume(): number {
  if (volume === undefined) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* Private window: the default applies. */ }
    const parsed = saved === null ? NaN : Number(saved);
    volume = parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_VOLUME;
  }
  return volume;
}

function ramp(target: number, seconds: number) {
  if (!ctx || !gain) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + seconds);
}

export function setMenuMusicVolume(next: number) {
  volume = Math.min(1, Math.max(0, next));
  try { localStorage.setItem(KEY, String(volume)); } catch { /* The setting still applies to this visit. */ }
  listeners.forEach(listener => listener());
  ramp(volume, .08);
  start();
}

export function useMenuMusicVolume() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getMenuMusicVolume, () => DEFAULT_VOLUME);
}

async function load(context: AudioContext) {
  if (loading || source) return;
  loading = true;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}audio/music/${manifest.tracks.menu.file}`);
    if (!response.ok) return;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    // The player may have left, and this context closed, while the track loaded.
    if (!wanted || context !== ctx || !gain) return;
    source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = manifest.tracks.menu.loopStart;
    source.loopEnd = manifest.tracks.menu.loopEnd;
    source.connect(gain);
    source.start(0, manifest.tracks.menu.loopStart);
    ramp(getMenuMusicVolume(), FADE_SECONDS);
  } catch { /* Music is decoration: a failed load or decode stays silent and blocks nothing. */ }
  finally { loading = false; }
}

/** Safe to call repeatedly: every gesture retries, as a browser may hold audio until one arrives. */
function start() {
  if (!wanted || document.hidden || getMenuMusicVolume() === 0) return;
  if (!ctx) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    ctx = new Context();
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
  }
  void ctx.resume().catch(() => {});
  void load(ctx);
}

const onVisibility = () => {
  if (document.hidden) void ctx?.suspend().catch(() => {});
  else start();
};
const onGesture = () => start();

/** Drops the decoded track, about 20 MB, rather than holding it under a 3D game. */
function release() {
  closing = undefined;
  source?.stop();
  void ctx?.close().catch(() => {});
  ctx = null; gain = null; source = null;
}

/** Fades in once audio is allowed, and fades out and frees everything on leaving. */
export function setMenuMusicWanted(next: boolean) {
  if (next === wanted) return;
  wanted = next;
  if (next) {
    clearTimeout(closing); closing = undefined;
    document.addEventListener('visibilitychange', onVisibility);
    GESTURES.forEach(type => window.addEventListener(type, onGesture, true));
    // Nothing is fetched before the player's first gesture: most first clicks leave the menu anyway.
    if (source) { ramp(getMenuMusicVolume(), FADE_SECONDS); return; }
    if (navigator.userActivation?.hasBeenActive) start();
    return;
  }
  document.removeEventListener('visibilitychange', onVisibility);
  GESTURES.forEach(type => window.removeEventListener(type, onGesture, true));
  ramp(0, FADE_SECONDS);
  clearTimeout(closing);
  closing = setTimeout(release, FADE_SECONDS * 1000);
}
