import { CAST_MIX, mixLevel, onCastSpeaking, rampLevel } from './cast-mix';
import { useSyncExternalStore } from 'react';

// Full volume is the mix the game has always had.
const DEFAULT_VOLUME = 1;

/** A saved volume and, for Web Audio, one gain per context that follows it. */
export function createVolumeSetting(key: string, bus?: 'effects') {
  let volume: number | undefined;
  const listeners = new Set<() => void>();
  const outputs = new Map<BaseAudioContext, GainNode>();

  function get(): number {
    if (volume === undefined) {
      let saved: string | null = null;
      try { saved = localStorage.getItem(key); } catch { /* Private window: the default applies. */ }
      const parsed = saved === null ? NaN : Number(saved);
      volume = parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_VOLUME;
    }
    return volume;
  }
  function forgetClosed() {
    for (const context of outputs.keys()) if (context.state === 'closed') outputs.delete(context);
  }
  const rampUntil = new WeakMap<BaseAudioContext,number>();
  const level = () => bus ? mixLevel(bus,get()) : get();
  if (bus) onCastSpeaking(active => {
    forgetClosed();
    const seconds = active ? CAST_MIX.attack : CAST_MIX.release;
    for (const [context, output] of outputs) {
      rampLevel(output, context.currentTime, level(), seconds);
      rampUntil.set(context,context.currentTime + seconds);
    }
  });
  return {
    get,
    set(next: number) {
      volume = Math.min(1, Math.max(0, next));
      try { localStorage.setItem(key, String(volume)); } catch { /* The setting still applies to this visit. */ }
      forgetClosed();
      for (const [context, output] of outputs) {
        if ((rampUntil.get(context) ?? 0) > context.currentTime) output.gain.cancelScheduledValues(context.currentTime);
        output.gain.setTargetAtTime(level(), context.currentTime, .02);
      }
      listeners.forEach(listener => listener());
    },
    use() {
      return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, get, () => DEFAULT_VOLUME);
    },
    output(context: BaseAudioContext): AudioNode {
      let output = outputs.get(context);
      if (!output) {
        forgetClosed();
        output = context.createGain();
        output.gain.value = level();
        output.connect(context.destination);
        outputs.set(context, output);
      }
      return output;
    },
  };
}
