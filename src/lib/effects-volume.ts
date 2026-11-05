import { useSyncExternalStore } from 'react';

const KEY = 'blockplay-sg-effects-volume-v1';
// Full volume is the mix the game has always had.
const DEFAULT_VOLUME = 1;

let volume: number | undefined;
const listeners = new Set<() => void>();
const outputs = new Map<BaseAudioContext, GainNode>();

export function getEffectsVolume(): number {
  if (volume === undefined) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* Private window: the default applies. */ }
    const parsed = saved === null ? NaN : Number(saved);
    volume = parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_VOLUME;
  }
  return volume;
}

function forgetClosed() {
  for (const context of outputs.keys()) if (context.state === 'closed') outputs.delete(context);
}

export function setEffectsVolume(next: number) {
  volume = Math.min(1, Math.max(0, next));
  try { localStorage.setItem(KEY, String(volume)); } catch { /* The setting still applies to this visit. */ }
  forgetClosed();
  for (const [context, output] of outputs) output.gain.setTargetAtTime(volume, context.currentTime, .02);
  listeners.forEach(listener => listener());
}

export function useEffectsVolume() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getEffectsVolume, () => DEFAULT_VOLUME);
}

/** Where every sound except music connects, in place of `context.destination`, so the slider reaches it. */
export function effectsOutput(context: BaseAudioContext): AudioNode {
  let output = outputs.get(context);
  if (!output) {
    forgetClosed();
    output = context.createGain();
    output.gain.value = getEffectsVolume();
    output.connect(context.destination);
    outputs.set(context, output);
  }
  return output;
}
