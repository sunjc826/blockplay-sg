/**
 * Combat event sound, synthesised in the engine's own AudioContext: no files
 * to load. Far blasts are heard after they are seen, and everything fades
 * with distance so a barrage across the district is a rumble, not a slap.
 */
export const SPEED_OF_SOUND = 343;
/** Loudness with distance: full within 15 m, then inverse-distance, silent past 600 m. */
export function distanceGain(distance: number) {
  const d = Math.max(0, distance);
  return d >= 600 ? 0 : Math.min(1, 15 / Math.max(15, d)) * (1 - d / 600);
}
export function soundDelay(distance: number) { return Math.max(0, distance) / SPEED_OF_SOUND; }

export function createCombatAudio(getContext: () => AudioContext | null, muted: () => boolean) {
  let noise: AudioBuffer | null = null;
  let engines: { oscillator: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  const ready = () => { const context = getContext(); return context && context.state === 'running' && !muted() ? context : null; };
  function noiseBuffer(context: AudioContext) {
    if (!noise || noise.sampleRate !== context.sampleRate) {
      noise = context.createBuffer(1, Math.floor(context.sampleRate * 2.5), context.sampleRate);
      const samples = noise.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    return noise;
  }
  function disconnectAfter(source: AudioScheduledSourceNode, ...nodes: AudioNode[]) { source.onended = () => { source.disconnect(); nodes.forEach(n => n.disconnect()); }; }
  return {
    /** A falling shell, `lead` seconds before it lands. */
    whistle(distance: number, lead: number) {
      const context = ready(); const level = distanceGain(distance) * .11; if (!context || level < .002) return;
      const tone = context.createOscillator(), gain = context.createGain(), at = context.currentTime;
      tone.type = 'sine'; tone.frequency.setValueAtTime(1500, at); tone.frequency.exponentialRampToValueAtTime(420, at + lead);
      gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(level, at + lead * .85); gain.gain.exponentialRampToValueAtTime(.0001, at + lead);
      tone.connect(gain).connect(context.destination); tone.start(at); tone.stop(at + lead + .02); disconnectAfter(tone, gain);
    },
    /** A blast `distance` away: a low thump with a crack on top when close. */
    boom(distance: number, size = 1) {
      const context = ready(); const level = distanceGain(distance) * .55 * size; if (!context || level < .002) return;
      const at = context.currentTime + soundDelay(distance), source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = noiseBuffer(context); filter.type = 'lowpass';
      // Distance takes the top off a blast first.
      filter.frequency.setValueAtTime(Math.max(160, 1400 - distance * 6), at); filter.frequency.exponentialRampToValueAtTime(70, at + 1.6);
      gain.gain.setValueAtTime(level, at); gain.gain.exponentialRampToValueAtTime(.0001, at + 2.2);
      source.connect(filter).connect(gain).connect(context.destination); source.start(at); source.stop(at + 2.3); disconnectAfter(source, filter, gain);
    },
    /** Two short tones when a hazard is announced. */
    alert() {
      const context = ready(); if (!context) return;
      [0, .22].forEach((offset, i) => {
        const tone = context.createOscillator(), gain = context.createGain(), at = context.currentTime + offset;
        tone.type = 'square'; tone.frequency.value = i ? 660 : 880;
        gain.gain.setValueAtTime(.05, at); gain.gain.exponentialRampToValueAtTime(.0005, at + .18);
        tone.connect(gain).connect(context.destination); tone.start(at); tone.stop(at + .2); disconnectAfter(tone, gain);
      });
    },
    /** The nearest transport's engine or rotor; `distance` Infinity silences it. */
    transport(mode: 'land' | 'air' | null, distance: number, effort: number) {
      const context = getContext(); if (!context) return;
      if (!engines) {
        const oscillator = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain();
        oscillator.type = 'sawtooth'; filter.type = 'lowpass'; filter.frequency.value = 260; gain.gain.value = 0;
        oscillator.connect(filter).connect(gain).connect(context.destination); oscillator.start(); engines = { oscillator, gain, filter };
      }
      const level = mode && !muted() && context.state === 'running' ? distanceGain(distance) * .09 * (.5 + effort * .5) : 0;
      engines.gain.gain.setTargetAtTime(level, context.currentTime, .15);
      // A rotor chops at a steady low rate; a diesel climbs with effort.
      engines.oscillator.frequency.setTargetAtTime(mode === 'air' ? 21 : 38 + effort * 26, context.currentTime, .2);
      engines.filter.frequency.setTargetAtTime(mode === 'air' ? 180 : 320, context.currentTime, .2);
    },
    dispose() { if (engines) { try { engines.oscillator.stop(); } catch { /* already stopped with the context */ } engines.oscillator.disconnect(); engines.filter.disconnect(); engines.gain.disconnect(); engines = null; } },
  };
}
export type CombatAudio = ReturnType<typeof createCombatAudio>;
