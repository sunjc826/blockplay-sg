import { useSyncExternalStore } from 'react';
import manifest from '../audio/music/manifest.json';

const KEY = 'blockplay-sg-menu-music-volume-v1';
// The tracks' average level stays below the peaks of the quiet glass hover and click sounds.
const DEFAULT_VOLUME = .4;
const FADE_SECONDS = .5;
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

/** Loops that run until the next cue. */
export type MusicCue = 'menu' | 'map' | 'spawn';
/** One-shots that finish on their own, over or between loops. */
export type MusicStinger = 'descent' | 'win' | 'lose';

/** The screens with the menu theme. Training, Open World and Multiplayer choose their own cues as they go. */
const THEME_ROUTES: ReadonlySet<string> = new Set(['menu', 'play', 'training-menu', 'inventory', 'settings', 'store']);
export const hasMenuTheme = (route: string) => THEME_ROUTES.has(route);

interface Voice { cue: MusicCue; source: AudioBufferSourceNode; gain: GainNode; stopping?: ReturnType<typeof setTimeout> }

let wanted: MusicCue | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let loading: MusicCue | null = null;
let voices: Voice[] = [];
let stinger: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
let stingerRequest = 0;
let stingerLoads = 0;
let stingerBuffers = new Map<MusicStinger, Promise<AudioBuffer>>();
let closing: ReturnType<typeof setTimeout> | undefined;
let volume: number | undefined;
const listeners = new Set<() => void>();

export function getMusicVolume(): number {
  if (volume === undefined) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* Private window: the default applies. */ }
    const parsed = saved === null ? NaN : Number(saved);
    volume = parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_VOLUME;
  }
  return volume;
}

function ramp(gain: GainNode | null, target: number, seconds: number) {
  if (!ctx || !gain) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + seconds);
}

export function setMusicVolume(next: number) {
  volume = Math.min(1, Math.max(0, next));
  try { localStorage.setItem(KEY, String(volume)); } catch { /* The setting still applies to this visit. */ }
  listeners.forEach(listener => listener());
  ramp(master, volume, .08);
  start();
}

export function useMusicVolume() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getMusicVolume, () => DEFAULT_VOLUME);
}

const trackUrl = (track: MusicCue | MusicStinger) => `${import.meta.env.BASE_URL}audio/music/${manifest.tracks[track].file}`;

function context() {
  if (!ctx) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = getMusicVolume();
    master.connect(ctx.destination);
  }
  void ctx.resume().catch(() => {});
  return ctx;
}

async function loadCue(context: AudioContext, cue: MusicCue) {
  if (loading === cue) return;
  loading = cue;
  try {
    const response = await fetch(trackUrl(cue));
    if (!response.ok) return;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    // The player may have moved on, and this context closed, while the track loaded.
    if (wanted !== cue || context !== ctx || !master || voices.some(voice => voice.cue === cue)) return;
    const { loopStart, loopEnd } = manifest.tracks[cue];
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = loopStart;
    source.loopEnd = loopEnd;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(master);
    source.start(0, loopStart);
    voices.push({ cue, source, gain });
    ramp(gain, 1, FADE_SECONDS);
  } catch { /* Music is decoration: a failed load or decode stays silent and blocks nothing. */ }
  finally { if (loading === cue) loading = null; }
}

/** Safe to call repeatedly: every gesture retries, as a browser may hold audio until one arrives. */
function start() {
  if (!wanted || document.hidden || getMusicVolume() === 0) return;
  const current = context();
  if (current && !voices.some(voice => voice.cue === wanted)) void loadCue(current, wanted);
}

const onVisibility = () => {
  if (document.hidden) void ctx?.suspend().catch(() => {});
  else if (wanted || stinger) { void ctx?.resume().catch(() => {}); start(); }
};
const onGesture = () => start();

/** Drops every decoded track, about 20 MB each, rather than holding them under a 3D game. */
function release() {
  closing = undefined;
  if (wanted || voices.length || stinger || stingerLoads) return;
  void ctx?.close().catch(() => {});
  ctx = null; master = null; stingerBuffers = new Map();
}

function releaseSoon() {
  clearTimeout(closing);
  closing = setTimeout(release, FADE_SECONDS * 1000);
}

function fadeOut(voice: Voice) {
  if (voice.stopping) return;
  ramp(voice.gain, 0, FADE_SECONDS);
  voice.stopping = setTimeout(() => {
    voice.source.stop();
    voices = voices.filter(other => other !== voice);
    release();
  }, FADE_SECONDS * 1000);
}

/** Crossfades to a loop once audio is allowed, or with null fades out and frees everything. */
export function setMusicCue(next: MusicCue | null) {
  if (next === wanted) return;
  const had = wanted;
  wanted = next;
  for (const voice of voices) {
    if (voice.cue !== next) { fadeOut(voice); continue; }
    // Back during the fade: keep what is playing rather than restarting it.
    clearTimeout(voice.stopping); voice.stopping = undefined;
    ramp(voice.gain, 1, FADE_SECONDS);
  }
  if (next && !had) {
    clearTimeout(closing); closing = undefined;
    document.addEventListener('visibilitychange', onVisibility);
    GESTURES.forEach(type => window.addEventListener(type, onGesture, true));
  } else if (!next) {
    document.removeEventListener('visibilitychange', onVisibility);
    GESTURES.forEach(type => window.removeEventListener(type, onGesture, true));
    releaseSoon();
  }
  // Nothing is fetched before the player's first gesture: the browser would not play it anyway.
  if (next && (ctx || navigator.userActivation?.hasBeenActive)) start();
}

function stingerBuffer(current: AudioContext, name: MusicStinger) {
  let buffer = stingerBuffers.get(name);
  if (!buffer) {
    buffer = fetch(trackUrl(name)).then(response => {
      if (!response.ok) throw Error(`Music ${response.status}`);
      return response.arrayBuffer();
    }).then(data => current.decodeAudioData(data));
    buffer.catch(() => { stingerBuffers.delete(name); });
    stingerBuffers.set(name, buffer);
  }
  return buffer;
}

/** Decodes a stinger early, for one that has to land on a moment. */
export function prepareMusicStinger(name: MusicStinger) {
  if (getMusicVolume() === 0) return;
  const current = ctx ?? (navigator.userActivation?.hasBeenActive ? context() : null);
  if (current) void stingerBuffer(current, name).catch(() => {});
}

export async function playMusicStinger(name: MusicStinger) {
  if (document.hidden || getMusicVolume() === 0) return;
  const current = context();
  if (!current) return;
  stopMusicStinger();
  const request = ++stingerRequest;
  stingerLoads++;
  clearTimeout(closing); closing = undefined;
  try {
    const buffer = await stingerBuffer(current, name);
    if (request !== stingerRequest || current !== ctx || !master) return;
    const source = current.createBufferSource();
    source.buffer = buffer;
    const gain = current.createGain();
    source.connect(gain);
    gain.connect(master);
    const playing = { source, gain };
    source.onended = () => {
      if (stinger === playing) stinger = null;
      release();
    };
    stinger = playing;
    source.start();
  } catch { /* As with the loops, a stinger that cannot load stays silent. */ }
  finally { stingerLoads--; if (!stinger) release(); }
}

export function stopMusicStinger() {
  stingerRequest++;
  if (!stinger) return;
  const { source, gain } = stinger;
  ramp(gain, 0, .25);
  source.stop((ctx?.currentTime ?? 0) + .25);
}
