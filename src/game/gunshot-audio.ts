import { effectsOutput } from '../lib/effects-volume';
import { distanceGain, soundDelay } from './combat-event-audio';
import type { SfxBank, SfxGroup } from './sfx-bank';
import { muzzleSignature, type MuzzleDevice } from './weapon-accessories';
import type { GunshotAcoustics } from './gunshot-acoustics';

/**
 * Gunshots. Once the recorded takes have loaded (see sfx-bank), a shot uses its calibre's reference take,
 * crossfading into a distant take with range and dulled by a lowpass as it travels. Until then, or if
 * they never load, it is synthesised in the engine's own AudioContext from four layers: the crack of the muzzle and the bullet, a burst of
 * noise for its body, a falling sine for the thump felt in the chest, and a
 * tail that is the shot coming back off the buildings. Every shot goes through
 * one bus with gentle saturation and compression, so a burst stays loud without
 * clipping and the thump's harmonics carry its bass on small speakers.
 */
export interface GunshotTone {
  /** Overall loudness after distance; 0 is out of earshot. */
  level: number;
  /** Seconds the sound takes to arrive. */
  delay: number;
  crack: number; crackCutoff: number;
  body: number; bodyCutoff: number; bodyLength: number;
  thump: number; thumpFrom: number; thumpTo: number; thumpLength: number;
  tail: number; tailCutoff: number; tailLength: number;
  /** How far apart the echoes come back: 1 beside the shooter, wider for a distant shot. */
  tailSpread: number;
  /** The recorded takes for this gun up close and from afar, how much of the close one is heard, and the cutoff distance leaves. */
  sample: SfxGroup; distantSample: SfxGroup; nearMix: number; sampleCutoff: number; sampleGain: number;
  /** Low-shelf weight and reflected copies of the actual heavy-gun recording. */
  sampleBassDb: number; sampleEcho: number;
  acoustics?: GunshotAcoustics;
}
/** The recorded group for a calibre: 9 mm is the pistol, 5.56 the rifles, 7.62 the GPMGs, 12.7 the heavy guns. */
export function gunshotSample(calibre: number): { near: SfxGroup; far: SfxGroup } {
  if (calibre === 10.36) return { near: 'proxy-intervention-shot', far: 'distant-heavy' };
  if (calibre === 20) return { near: 'proxy-launcher-shot', far: 'distant-heavy' };
  if (calibre >= 12) return { near: 'hmg-127', far: 'distant-heavy' };
  if (calibre >= 8.5) return { near: 'pistol-9', far: 'distant-rifle' };
  if (calibre >= 7) return { near: 'mg-762', far: 'distant-rifle' };
  return { near: 'rifle-556', far: 'distant-rifle' };
}
/** Gain on a recorded take (loudest 50 ms at -12 dBFS RMS) that sits it a little above the synthesised layers. */
const SAMPLE_GAIN = 1.1;
/** Loudness of the player's own gun, at their ear, against another's at 15 m or nearer. */
const OWN_LEVEL = .3, OTHER_LEVEL = .26;

/**
 * The shot of a gun with this bore (mm) and damage, heard `distance` away.
 * Punch sizes the thump and the tail, bore lowers the body. Distance takes the
 * crack first and the rumble last, and lengthens the echo, as it does outdoors.
 */
export function gunshotTone(calibre: number, power: number, distance = 0, own = false, muzzle?: MuzzleDevice, acoustics?: GunshotAcoustics): GunshotTone {
  const weight = Math.min(4.5, Math.max(.6, power / 36)), bore = Math.min(2.4, Math.max(.8, calibre / 5.56));
  const report = muzzleSignature(muzzle).report;
  // A can is heard as if from further off than it is, so it fades out of earshot sooner.
  const d = Math.max(0, distance) / (muzzle === 'suppressor' ? report : 1), far = Math.min(1, d / 400), punch = Math.sqrt(weight);
  const sample = gunshotSample(calibre), across = Math.min(1, Math.max(0, (d - 30) / 190));
  const heavy = muzzle === 'suppressor' ? 0 : calibre >= 12 || calibre === 10.36 ? 1 : calibre >= 7 && calibre < 8.5 ? .5 : 0;
  const tone: GunshotTone = {
    ...(acoustics ? { acoustics } : {}),
    sample: muzzle === 'suppressor' ? 'suppressed' : sample.near, distantSample: sample.far,
    nearMix: 1 - across * across * (3 - 2 * across), sampleCutoff: 16000 * .12 ** far,
    // Takes are loudness-matched, so a heavier gun's weight is put back here; a can keeps a suppressed shot well below an open one.
    sampleGain: SAMPLE_GAIN * punch ** .6 * (muzzle === 'suppressor' ? .35 : 1),
    sampleBassDb: heavy * (6 - 2 * far), sampleEcho: heavy * .3 * (muzzle === 'compensator' ? 1.2 : 1),
    level: (own ? OWN_LEVEL : OTHER_LEVEL * distanceGain(d)) * (.75 + .25 * punch) * Math.min(1.15, report),
    delay: own ? 0 : soundDelay(d),
    crack: .55 * (1 - far) ** 2, crackCutoff: 2600 - 900 * far,
    body: .65 * punch * (1 - .5 * far), bodyCutoff: Math.max(280, 3200 / Math.sqrt(bore) * (1 - .85 * far)), bodyLength: .06 + .035 * weight + .12 * far,
    thump: .95 * punch * (1 - .3 * far) * (1 + heavy * .2), thumpFrom: 150 / weight ** .15, thumpTo: 52 / weight ** .2, thumpLength: (.1 + .045 * weight) * (1 + heavy * .15),
    tail: .2 * punch * (.6 + far) * (1 + heavy * .35), tailCutoff: 1400 - 900 * far, tailLength: .3 + .12 * weight + .7 * far + heavy * .15, tailSpread: 1 + 1.5 * far,
  };
  if (calibre === 20) Object.assign(tone, { crack: 0, body: .25, tail: .12, tailLength: .4, sampleEcho: .08 });
  if (muzzle === 'suppressor') {
    // What a can leaves: the action cycling, a dull cough, and little for the walls to send back.
    Object.assign(tone, { crack: tone.crack * .3, body: tone.body * .55, bodyCutoff: tone.bodyCutoff * .45, bodyLength: tone.bodyLength * .7,
      thump: tone.thump * .35, tail: tone.tail * .25, tailLength: tone.tailLength * .5 });
  } else if (muzzle === 'compensator') {
    // Gas thrown sideways: a sharper crack and a harder slap off whatever is beside the shooter.
    Object.assign(tone, { crack: tone.crack * 1.35, crackCutoff: tone.crackCutoff * 1.2, tail: tone.tail * 1.3 });
  }
  return tone;
}

/** The bus every shot plays into: soft saturation for weight, then a compressor so bursts don't clip. */
export function createGunBus(context: BaseAudioContext, destination: AudioNode = effectsOutput(context)) {
  const input = context.createGain(), shaper = context.createWaveShaper(), compressor = context.createDynamicsCompressor(), output = context.createGain();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(1.25 * x) / Math.tanh(1.25); }
  shaper.curve = curve; shaper.oversample = '2x';
  compressor.threshold.value = -10; compressor.knee.value = 6; compressor.ratio.value = 2.5; compressor.attack.value = .001; compressor.release.value = .055;
  output.gain.value = .95;
  input.connect(shaper).connect(compressor).connect(output).connect(destination);
  return { input, dispose() { [input, shaper, compressor, output].forEach(n => n.disconnect()); } };
}
export function whiteNoise(context: BaseAudioContext, seconds = 1) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}
/** Echoes off nearby walls: seconds after the shot, loudness against the tail, and how much of the top each keeps. */
const ECHOES: [number, number, number][] = [[.065, 1.1, .9], [.145, .75, .7], [.26, .5, .55]];
/** One coherent report per calibre; only a ±0.4% pitch variation between rounds. */
const REFERENCE_TAKES: Partial<Record<SfxGroup, number>> = { 'rifle-556': 2, 'pistol-9': 1, 'hmg-127': 1 };
const roomImpulses = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
/** Deterministic DSP room response, applied to the ElevenLabs shot. No new
 * sound generation request: a short, damped stereo impulse creates the dense
 * tail that separate early wall/ceiling reflections cannot supply alone. */
function roomImpulse(context: BaseAudioContext, space: GunshotAcoustics) {
  let cache = roomImpulses.get(context);
  if (!cache) { cache = new Map(); roomImpulses.set(context, cache); }
  const decay = Math.max(.1, Math.min(1.2, Math.round(space.decay * 20) / 20));
  const cutoff = Math.max(800, Math.min(6000, Math.round(space.cutoff / 200) * 200));
  const key = `${decay}:${cutoff}`, previous = cache.get(key); if (previous) return previous;
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * decay), context.sampleRate);
  const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const pcm = buffer.getChannelData(channel); let seed = 9187 + channel * 491, low = 0;
    for (let i = 0; i < pcm.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      low += alpha * (seed / 2147483648 - 1 - low);
      const t = i / context.sampleRate;
      pcm[i] = t < .012 ? 0 : low * Math.exp(-6.9 * t / decay) * Math.min(1, (t - .012) / .008);
    }
  }
  cache.set(key, buffer); return buffer;
}
export interface GunshotVoice { start: number; end: number; fade: (at: number) => void; stop: () => void }
/** Schedules one shot at context time `at` (before its travel delay), panned -1 (left) to 1 (right). */
export function playGunshot(context: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, tone: GunshotTone, at: number, pan = 0, samples?: Pick<SfxBank, 'get'>, onEnd?: () => void): GunshotVoice | undefined {
  if (tone.level < .002) return;
  const t = at + tone.delay, out = context.createGain(), panner = context.createStereoPanner(), nodes: AudioNode[] = [out, panner];
  out.gain.setValueAtTime(tone.level, t); panner.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(panner).connect(bus);
  const sources: AudioScheduledSourceNode[] = [];
  let released = false;
  const release = () => { if (released) return; released = true; nodes.forEach(n => n.disconnect()); onEnd?.(); };
  const stop = () => { if (released) return; sources.forEach(s => { s.onended = null; s.stop(); }); release(); };
  const voice = (end: number): GunshotVoice => ({ start: t, end, stop,
    fade(at) {
      if (released || at >= end) return;
      // Ease the previous echo under the new attack; the final round keeps its natural tail.
      const from = Math.max(t, at);
      out.gain.cancelScheduledValues(from); out.gain.setValueAtTime(tone.level, from);
      out.gain.linearRampToValueAtTime(tone.level * .18, from + .012);
      out.gain.linearRampToValueAtTime(0, from + .06);
      sources.forEach(s => s.stop(from + .065));
    },
  });
  const near = samples?.get(tone.sample, REFERENCE_TAKES[tone.sample] ?? 0) ?? null;
  const distant = near && tone.nearMix < .98 ? samples!.get(tone.distantSample) : null;
  if (near) {
    // Preserve the same report, with variation small enough to keep the weapon recognisable.
    const rate = .996 + Math.random() * .008, takes: [AudioBuffer, number][] = distant ? [[near, tone.nearMix], [distant, 1 - tone.nearMix]] : [[near, 1]];
    const space = tone.acoustics, roomStrength = tone.sample === 'suppressed' ? .14 : .65 + tone.sampleEcho * .6;
    let reverb: ConvolverNode | undefined;
    if (space && space.wet > 0 && tone.nearMix > .02) {
      reverb = context.createConvolver(); reverb.normalize = true; reverb.buffer = roomImpulse(context, space);
      const filter = context.createBiquadFilter(), gain = context.createGain();
      filter.type = 'lowpass'; filter.frequency.value = space.cutoff;
      gain.gain.value = space.wet * roomStrength;
      reverb.connect(filter).connect(gain).connect(out); nodes.push(reverb, filter, gain);
    }
    const ends = takes.filter(([, mix]) => mix > .02).map(([buffer, mix]) => {
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = buffer; source.playbackRate.value = rate; filter.type = 'lowpass'; filter.frequency.value = tone.sampleCutoff; filter.Q.value = .5;
      gain.gain.value = mix * tone.sampleGain; source.connect(filter); gain.connect(out); nodes.push(source, filter, gain); sources.push(source);
      if (buffer === near && space) {
        // Keep the immediate report; lower the recording's fixed outdoor tail
        // so the actual surroundings determine what follows it.
        const level = mix * tone.sampleGain;
        gain.gain.setValueAtTime(level, t); gain.gain.setValueAtTime(level, t + .055);
        gain.gain.linearRampToValueAtTime(level * space.directTail, t + .11);
        if (reverb) gain.connect(reverb);
      }
      if (tone.sampleBassDb > 0) {
        // Put weight below the crack, before the existing saturator/compressor.
        const bass = context.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 180; bass.gain.value = tone.sampleBassDb;
        filter.connect(bass).connect(gain); nodes.push(bass);
      } else filter.connect(gain);
      source.start(t); return [source, buffer.duration / rate] as const;
    });
    const reflections = space ? space.reflections.map(reflection => ({ ...reflection, gain: reflection.gain * roomStrength }))
      : [[.085, .8, 850], [.19, .5, 650], [.32, .3, 420]].map(([delay, gain, cutoff]) => ({ delay: delay * tone.tailSpread, gain: gain * tone.sampleEcho, cutoff }));
    if (tone.nearMix > .02) {
      // Dull reflections rather than extra muzzle cracks. Only the close take
      // is reflected: the far take already contains its own outdoor echo.
      for (const reflection of reflections) {
        if (reflection.gain < .01) continue;
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        const start = t + reflection.delay, length = Math.min(.3, near.duration / rate);
        source.buffer = near; source.playbackRate.value = rate;
        filter.type = 'lowpass'; filter.frequency.value = Math.min(reflection.cutoff, tone.sampleCutoff); filter.Q.value = .5;
        const level = tone.sampleGain * tone.nearMix * reflection.gain;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(level, start + .003);
        gain.gain.setValueAtTime(level, start + Math.max(.003, length - .02)); gain.gain.linearRampToValueAtTime(0, start + length);
        source.connect(filter).connect(gain).connect(out); nodes.push(source, filter, gain); sources.push(source);
        source.start(start); source.stop(start + length); ends.push([source, start - t + length]);
      }
    }
    if (!ends.length) { nodes.forEach(n => n.disconnect()); return; }
    if (reverb && space) {
      // A silent scheduled source owns cleanup through the convolution tail.
      // It also makes pause/mute and the existing burst handoff cancel it.
      const clock = context.createBufferSource(), silent = context.createGain();
      clock.buffer = noise; silent.gain.value = 0; clock.connect(silent).connect(out);
      const end = near.duration / rate + space.decay + .04;
      clock.start(t + end, 0, .001); nodes.push(clock, silent); sources.push(clock); ends.push([clock, end + .001]);
    }
    const longest = ends.reduce((a, b) => b[1] > a[1] ? b : a);
    longest[0].onended = release;
    return voice(t + longest[1]);
  }
  /** One layer: a source through a filter into an envelope that rises over `attack` and dies over `length`. */
  const layer = (source: AudioScheduledSourceNode, filter: BiquadFilterNode | null, peak: number, start: number, attack: number, length: number) => {
    const gain = context.createGain(); nodes.push(source, gain); sources.push(source);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(peak, start + attack); gain.gain.exponentialRampToValueAtTime(.0001, start + attack + length);
    (filter ? source.connect(filter).connect(gain) : source.connect(gain)).connect(out);
    if (source instanceof AudioBufferSourceNode) source.start(start, Math.random() * .6); else source.start(start);
    source.stop(start + attack + length + .02);
    return source;
  };
  const noiseLayer = (type: BiquadFilterType, cutoff: number) => {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(); source.buffer = noise; source.loop = true;
    filter.type = type; filter.frequency.value = cutoff; filter.Q.value = .7; nodes.push(filter); return { source, filter };
  };
  if (tone.crack > .01) { const { source, filter } = noiseLayer('highpass', tone.crackCutoff); layer(source, filter, tone.crack, t, .0008, .011); }
  const body = noiseLayer('lowpass', tone.bodyCutoff);
  body.filter.frequency.setValueAtTime(tone.bodyCutoff, t); body.filter.frequency.exponentialRampToValueAtTime(Math.max(120, tone.bodyCutoff * .35), t + tone.bodyLength);
  layer(body.source, body.filter, tone.body, t, .002, tone.bodyLength);
  const thump = context.createOscillator(); thump.type = 'sine';
  thump.frequency.setValueAtTime(tone.thumpFrom, t); thump.frequency.exponentialRampToValueAtTime(tone.thumpTo, t + tone.thumpLength * .6);
  layer(thump, null, tone.thump, t, .003, tone.thumpLength);
  // The tail: the body coming back off the nearest walls as a few separate, duller slaps, further apart for a
  // distant shot, over a rumble that loses its top as it dies. Steady noise here would hiss instead.
  const tail: [AudioScheduledSourceNode, number][] = [];
  const reflections = tone.acoustics ? tone.acoustics.reflections.map(r => [r.delay, r.gain, r.cutoff / tone.tailCutoff]) : ECHOES;
  reflections.forEach(([after, gain, dull]) => {
    const echo = noiseLayer('lowpass', tone.tailCutoff * dull), start = t + after * (tone.acoustics ? 1 : tone.tailSpread), length = tone.bodyLength * 1.4;
    echo.filter.frequency.setValueAtTime(tone.tailCutoff * dull, start); echo.filter.frequency.exponentialRampToValueAtTime(Math.max(120, tone.tailCutoff * dull * .4), start + length);
    tail.push([layer(echo.source, echo.filter, tone.tail * gain, start, .003, length), start + length]);
  });
  const rumble = noiseLayer('lowpass', tone.tailCutoff * .65), from = t + .03;
  const tailLength = tone.acoustics?.decay ?? tone.tailLength, tailLevel = tone.acoustics ? .05 + tone.acoustics.wet * 2 : .55;
  rumble.filter.frequency.setValueAtTime(tone.tailCutoff * .65, from); rumble.filter.frequency.exponentialRampToValueAtTime(Math.min(200, tone.tailCutoff * .3), from + tailLength);
  tail.push([layer(rumble.source, rumble.filter, tone.tail * tailLevel, from, .012, tailLength), from + tailLength]);
  // Whichever of them ends last takes the whole shot's nodes down with it.
  const longest = tail.reduce((a, b) => b[1] > a[1] ? b : a);
  longest[0].onended = release;
  return voice(longest[1] + .021);
}

/** Other people's shots sounding at once; past this, the quietest gives way to a louder one, and a quieter one is not played. */
export const MAX_REMOTE_GUNSHOTS = 12;
/** Shots for one engine, with independent echo handoffs for each shooter. */
export function createGunshotAudio(getContext: () => AudioContext | null, muted: () => boolean, samples?: Pick<SfxBank, 'get'>, destination?: (context: BaseAudioContext) => AudioNode) {
  let bus: ReturnType<typeof createGunBus> | null = null, noise: AudioBuffer | null = null, owner: AudioContext | null = null;
  const active = new Set<GunshotVoice>(), streams = new Map<string, Set<GunshotVoice>>();
  /** Other people's shots still sounding, with their loudness; a faded-out one leaves this at once. */
  const remote = new Map<GunshotVoice, number>();
  function clear() { for (const voice of [...active]) voice.stop(); active.clear(); streams.clear(); remote.clear(); }
  return {
    /** A shot `after` seconds from now, plus its own travel time. */
    fire(tone: GunshotTone, pan = 0, after = 0, emitter = 'own') {
      const context = getContext(); if (!context || context.state !== 'running' || muted()) return;
      if (owner !== context) { clear(); bus?.dispose(); bus = createGunBus(context, destination?.(context)); noise = whiteNoise(context); owner = context; }
      if (tone.level < .002) return;
      // Bound busy firefights, retaining the player's immediate feedback.
      if (active.size >= 48) { if (emitter !== 'own') return; active.values().next().value?.stop(); }
      if (emitter !== 'own' && remote.size >= MAX_REMOTE_GUNSHOTS) {
        // A distant crackle under a dozen nearer shots is not heard; building its voice costs a frame on a phone.
        let quietest: GunshotVoice | undefined, low = Infinity;
        for (const [voice, level] of remote) if (level < low) { low = level; quietest = voice; }
        if (!quietest || tone.level <= low) return;
        quietest.fade(context.currentTime); remote.delete(quietest);
      }
      let shot: GunshotVoice | undefined;
      shot = playGunshot(context, bus!.input, noise!, tone, context.currentTime + Math.max(0, after), pan, samples, () => {
        if (shot) {
          active.delete(shot); remote.delete(shot);
          const stream = streams.get(emitter); stream?.delete(shot);
          if (!stream?.size) streams.delete(emitter);
        }
      });
      if (shot) {
        const stream = streams.get(emitter) ?? new Set<GunshotVoice>();
        const ordered = [...stream].sort((a, b) => a.start - b.start);
        // Snapshots may insert a nearer shot ahead of one already queued.
        const previous = ordered.filter(v => v.start <= shot!.start).at(-1);
        const next = ordered.find(v => v.start > shot!.start);
        previous?.fade(shot.start); if (next) shot.fade(next.start);
        stream.add(shot); streams.set(emitter, stream); active.add(shot);
        if (emitter !== 'own') remote.set(shot, tone.level);
      }
    },
    clear,
    update() { if (muted() || getContext()?.state !== 'running') clear(); },
    dispose() { clear(); bus?.dispose(); bus = null; noise = null; owner = null; },
  };
}
