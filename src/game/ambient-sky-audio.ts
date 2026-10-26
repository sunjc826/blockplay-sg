import { SPEED_OF_SOUND } from './ambient-sky';

/**
 * Far-off sound for the ambient sky, synthesised like the combat events'.
 * Combat sound is silent past 600 m; this carries further and much quieter,
 * so a fight on the skyline is a low rumble that arrives well after its flash.
 */
/** Loudness with distance for far sound: inverse-distance past 200 m under a fade that reaches silence at 1.5 km. */
export function farGain(distance: number) {
  const d = Math.max(0, distance), fade = Math.max(0, 1 - d / 1500);
  return fade * fade * Math.min(1, 200 / Math.max(200, d));
}
export const farDelay = (distance: number) => Math.max(0, distance) / SPEED_OF_SOUND;

export function createAmbientSkyAudio(getContext: () => AudioContext | null, muted: () => boolean) {
  let noise: AudioBuffer | null = null;
  const ready = () => { const context = getContext(); return context && context.state === 'running' && !muted() ? context : null; };
  function noiseBuffer(context: AudioContext) {
    if (!noise || noise.sampleRate !== context.sampleRate) {
      noise = context.createBuffer(1, Math.floor(context.sampleRate * 3), context.sampleRate);
      const samples = noise.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    return noise;
  }
  /** Filtered noise, `delay` seconds from now, panned, shaped by `envelope`. */
  function burst(context: AudioContext, delay: number, pan: number, filterType: BiquadFilterType, frequency: [number, number], level: number, attack: number, decay: number) {
    const at = context.currentTime + delay, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain(), panner = context.createStereoPanner();
    source.buffer = noiseBuffer(context); filter.type = filterType;
    filter.frequency.setValueAtTime(frequency[0], at); filter.frequency.exponentialRampToValueAtTime(frequency[1], at + attack + decay);
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(level, at + attack); gain.gain.exponentialRampToValueAtTime(.0001, at + attack + decay);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    // Start somewhere random in the buffer so repeats do not sound identical.
    source.connect(filter).connect(gain).connect(panner).connect(context.destination); source.start(at, Math.random() * 2); source.stop(at + attack + decay + .05);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); };
  }
  return {
    /** A far blast: a long, low roll, bigger with `size` (1 a heavy gun, 2 the big one). */
    rumble(distance: number, size: number, pan = 0) {
      const context = ready(), level = farGain(distance) * .14 * Math.min(2.2, size); if (!context || level < .001) return;
      burst(context, farDelay(distance), pan * .6, 'lowpass', [Math.max(120, 520 - distance * .6), 45], level, .05, 1.6 + size * .9);
    },
    /** A distant burst of automatic fire: a few dry pops a beat apart. */
    crackle(distance: number, rounds: number, pan = 0) {
      const context = ready(), level = farGain(distance) * .045; if (!context || level < .001) return;
      for (let i = 0; i < Math.min(8, rounds); i++) burst(context, farDelay(distance) + i * (.08 + Math.random() * .03), pan * .6, 'bandpass', [900, 500], level, .004, .09);
    },
    /** A rocket leaving its rail: a rising roar that tails off. */
    whoosh(distance: number, pan = 0) {
      const context = ready(), level = farGain(distance) * .08; if (!context || level < .001) return;
      burst(context, farDelay(distance), pan * .6, 'bandpass', [300, 1100], level, .25, 1.8);
    },
  };
}
export type AmbientSkyAudio = ReturnType<typeof createAmbientSkyAudio>;
