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

/** Continuous sounds, one voice each, faded in and out by distance every frame. */
export type CombatLoop = 'engine' | 'jet' | 'raid' | 'drone' | 'siren';
interface LoopVoice { source: AudioScheduledSourceNode; filter: BiquadFilterNode; gain: GainNode; extra: AudioNode[]; tone?: OscillatorNode }

export function createCombatAudio(getContext: () => AudioContext | null, muted: () => boolean) {
  let noise: AudioBuffer | null = null;
  const loops = new Map<CombatLoop, LoopVoice>();
  /** Builds a loop's voice the first time it is wanted: a tone for engines and rotors, noise for jets. */
  function voice(context: AudioContext, name: CombatLoop): LoopVoice {
    let entry = loops.get(name);
    if (entry) return entry;
    const filter = context.createBiquadFilter(), gain = context.createGain(), extra: AudioNode[] = [];
    gain.gain.value = 0;
    if (name === 'jet') {
      const source = context.createBufferSource(); source.buffer = noiseBuffer(context); source.loop = true;
      filter.type = 'lowpass'; filter.frequency.value = 700; source.connect(filter).connect(gain).connect(context.destination); source.start();
      entry = { source, filter, gain, extra };
    } else {
      const tone = context.createOscillator();
      tone.type = name === 'siren' ? 'sine' : 'sawtooth';
      filter.type = name === 'drone' ? 'bandpass' : 'lowpass';
      filter.frequency.value = name === 'drone' ? 900 : name === 'siren' ? 2400 : 260;
      if (name === 'siren') {
        // The wail: a slow wobble swings the pitch between about 450 and 850 Hz.
        const wobble = context.createOscillator(), depth = context.createGain();
        wobble.frequency.value = .22; depth.gain.value = 200; tone.frequency.value = 650;
        wobble.connect(depth).connect(tone.frequency); wobble.start(); extra.push(wobble, depth);
      }
      tone.connect(filter).connect(gain).connect(context.destination); tone.start();
      entry = { source: tone, tone, filter, gain, extra };
    }
    loops.set(name, entry);
    return entry;
  }
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
      const engine = voice(context, 'engine');
      const level = mode && !muted() && context.state === 'running' ? distanceGain(distance) * .09 * (.5 + effort * .5) : 0;
      engine.gain.gain.setTargetAtTime(level, context.currentTime, .15);
      // A rotor chops at a steady low rate; a diesel climbs with effort.
      engine.tone?.frequency.setTargetAtTime(mode === 'air' ? 21 : 38 + effort * 26, context.currentTime, .2);
      engine.filter.frequency.setTargetAtTime(mode === 'air' ? 180 : 320, context.currentTime, .2);
    },
    /**
     * A jet's roar, a raid helicopter's heavier rotor, a drone's whine or the
     * air-raid siren. `distance` Infinity silences it; the siren ignores distance.
     */
    loop(name: Exclude<CombatLoop, 'engine'>, distance: number) {
      const context = getContext(); if (!context || (!loops.has(name) && !Number.isFinite(distance))) return;
      const sound = voice(context, name), audible = !muted() && context.state === 'running';
      const level = !audible ? 0 : name === 'siren' ? (Number.isFinite(distance) ? .035 : 0)
        : distanceGain(distance) * (name === 'jet' ? .5 : name === 'raid' ? .12 : .05);
      sound.gain.gain.setTargetAtTime(level, context.currentTime, name === 'jet' ? .08 : .15);
      if (name === 'raid') { sound.tone?.frequency.setTargetAtTime(17, context.currentTime, .2); sound.filter.frequency.setTargetAtTime(150, context.currentTime, .2); }
      // A drone's motors rise in pitch as it closes in.
      if (name === 'drone') sound.tone?.frequency.setTargetAtTime(150 + Math.max(0, 60 - distance) * 2, context.currentTime, .1);
    },
    /** A mortar bomb leaving its tube: a hollow thump from wherever the pit is. */
    thunk(distance: number) {
      const context = ready(); const level = distanceGain(distance) * .3; if (!context || level < .002) return;
      const at = context.currentTime + soundDelay(distance), tone = context.createOscillator(), gain = context.createGain();
      tone.type = 'sine'; tone.frequency.setValueAtTime(120, at); tone.frequency.exponentialRampToValueAtTime(45, at + .25);
      gain.gain.setValueAtTime(level, at); gain.gain.exponentialRampToValueAtTime(.0001, at + .32);
      tone.connect(gain).connect(context.destination); tone.start(at); tone.stop(at + .34); disconnectAfter(tone, gain);
    },
    /** One short high tone: a drone has locked on to you. */
    beep() {
      const context = ready(); if (!context) return;
      const tone = context.createOscillator(), gain = context.createGain(), at = context.currentTime;
      tone.type = 'square'; tone.frequency.value = 1450;
      gain.gain.setValueAtTime(.035, at); gain.gain.exponentialRampToValueAtTime(.0005, at + .07);
      tone.connect(gain).connect(context.destination); tone.start(at); tone.stop(at + .08); disconnectAfter(tone, gain);
    },
    dispose() {
      for (const sound of loops.values()) {
        for (const node of [sound.source, ...sound.extra]) { if ("stop" in node) try { (node as AudioScheduledSourceNode).stop(); } catch { /* already stopped with the context */ } node.disconnect(); }
        sound.filter.disconnect(); sound.gain.disconnect();
      }
      loops.clear();
    },
  };
}
export type CombatAudio = ReturnType<typeof createCombatAudio>;
