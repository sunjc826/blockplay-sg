import { effectsOutput } from '../lib/effects-volume';

/**
 * Sound for the Levolution timeline on the review board: the warning's two
 * tones and a thump for each thing that lands. Synthesised here because the
 * board runs no game and so has none of its audio; it follows the same cues and
 * the player's effects volume.
 */
export function createStageReviewAudio() {
  let context: AudioContext | null = null, noise: AudioBuffer | null = null;
  /** Browsers only start audio from a gesture: call this from the click that plays or unmutes. */
  const wake = () => {
    try { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume(); } catch { context = null; }
    return context;
  };
  const live = () => context && context.state === 'running' ? context : null;
  return {
    wake,
    alert() {
      const c = live(); if (!c) return;
      for (const [delay, pitch] of [[0, 880], [.28, 660]] as const) {
        const tone = c.createOscillator(), gain = c.createGain(), at = c.currentTime + delay;
        tone.type = 'square'; tone.frequency.value = pitch; gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.09, at + .02); gain.gain.exponentialRampToValueAtTime(.001, at + .24);
        tone.connect(gain).connect(effectsOutput(c)); tone.start(at); tone.stop(at + .26); tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      }
    },
    /** `size` about 0.7 for a container, nearer 2 for a gantry. */
    thump(size: number) {
      const c = live(); if (!c) return;
      if (!noise || noise.sampleRate !== c.sampleRate) { noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const data = noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; }
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(), at = c.currentTime, length = .35 + size * .35;
      source.buffer = noise; filter.type = 'lowpass'; filter.frequency.setValueAtTime(900 / size, at); filter.frequency.exponentialRampToValueAtTime(70, at + length);
      gain.gain.setValueAtTime(Math.min(.9, .28 * size), at); gain.gain.exponentialRampToValueAtTime(.001, at + length);
      source.connect(filter).connect(gain).connect(effectsOutput(c)); source.start(at); source.stop(at + length); source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    },
    dispose() { void context?.close().catch(() => {}); context = null; },
  };
}
