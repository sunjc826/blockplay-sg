import { distanceGain, soundDelay } from './combat-event-audio';
import type { SfxBank, SfxGroup } from './sfx-bank';
import { muzzleSignature, type MuzzleDevice } from './weapon-accessories';

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
}
/** The recorded group for a calibre: 9 mm is the pistol, 5.56 the rifles, 7.62 the GPMGs, 12.7 the heavy guns. */
export function gunshotSample(calibre: number): { near: SfxGroup; far: SfxGroup } {
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
export function gunshotTone(calibre: number, power: number, distance = 0, own = false, muzzle?: MuzzleDevice): GunshotTone {
  const weight = Math.min(4.5, Math.max(.6, power / 36)), bore = Math.min(2.4, Math.max(.8, calibre / 5.56));
  const report = muzzleSignature(muzzle).report;
  // A can is heard as if from further off than it is, so it fades out of earshot sooner.
  const d = Math.max(0, distance) / (muzzle === 'suppressor' ? report : 1), far = Math.min(1, d / 400), punch = Math.sqrt(weight);
  const sample = gunshotSample(calibre), across = Math.min(1, Math.max(0, (d - 30) / 190));
  const tone: GunshotTone = {
    sample: muzzle === 'suppressor' ? 'suppressed' : sample.near, distantSample: sample.far,
    nearMix: 1 - across * across * (3 - 2 * across), sampleCutoff: 16000 * .12 ** far,
    // Takes are loudness-matched, so a heavier gun's weight is put back here; a can keeps a suppressed shot well below an open one.
    sampleGain: SAMPLE_GAIN * punch ** .6 * (muzzle === 'suppressor' ? .35 : 1),
    level: (own ? OWN_LEVEL : OTHER_LEVEL * distanceGain(d)) * (.75 + .25 * punch) * Math.min(1.15, report),
    delay: own ? 0 : soundDelay(d),
    crack: .55 * (1 - far) ** 2, crackCutoff: 2600 - 900 * far,
    body: .65 * punch * (1 - .5 * far), bodyCutoff: Math.max(280, 3200 / Math.sqrt(bore) * (1 - .85 * far)), bodyLength: .06 + .035 * weight + .12 * far,
    thump: .95 * punch * (1 - .3 * far), thumpFrom: 150 / weight ** .15, thumpTo: 52 / weight ** .2, thumpLength: .1 + .045 * weight,
    tail: .2 * punch * (.6 + far), tailCutoff: 1400 - 900 * far, tailLength: .3 + .12 * weight + .7 * far, tailSpread: 1 + 1.5 * far,
  };
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
export function createGunBus(context: BaseAudioContext, destination: AudioNode = context.destination) {
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
    const ends = takes.filter(([, mix]) => mix > .02).map(([buffer, mix]) => {
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = buffer; source.playbackRate.value = rate; filter.type = 'lowpass'; filter.frequency.value = tone.sampleCutoff; filter.Q.value = .5;
      gain.gain.value = mix * tone.sampleGain; source.connect(filter).connect(gain).connect(out); nodes.push(source, filter, gain); sources.push(source);
      source.start(t); return [source, buffer.duration / rate] as const;
    });
    if (!ends.length) { nodes.forEach(n => n.disconnect()); return; }
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
  ECHOES.forEach(([after, gain, dull]) => {
    const echo = noiseLayer('lowpass', tone.tailCutoff * dull), start = t + after * tone.tailSpread, length = tone.bodyLength * 1.4;
    echo.filter.frequency.setValueAtTime(tone.tailCutoff * dull, start); echo.filter.frequency.exponentialRampToValueAtTime(Math.max(120, tone.tailCutoff * dull * .4), start + length);
    tail.push([layer(echo.source, echo.filter, tone.tail * gain, start, .003, length), start + length]);
  });
  const rumble = noiseLayer('lowpass', tone.tailCutoff * .65), from = t + .03;
  rumble.filter.frequency.setValueAtTime(tone.tailCutoff * .65, from); rumble.filter.frequency.exponentialRampToValueAtTime(Math.min(200, tone.tailCutoff * .3), from + tone.tailLength);
  tail.push([layer(rumble.source, rumble.filter, tone.tail * .55, from, .012, tone.tailLength), from + tone.tailLength]);
  // Whichever of them ends last takes the whole shot's nodes down with it.
  const longest = tail.reduce((a, b) => b[1] > a[1] ? b : a);
  longest[0].onended = release;
  return voice(longest[1] + .021);
}

/** Shots for one engine, with independent echo handoffs for each shooter. */
export function createGunshotAudio(getContext: () => AudioContext | null, muted: () => boolean, samples?: Pick<SfxBank, 'get'>) {
  let bus: ReturnType<typeof createGunBus> | null = null, noise: AudioBuffer | null = null, owner: AudioContext | null = null;
  const active = new Set<GunshotVoice>(), streams = new Map<string, Set<GunshotVoice>>();
  function clear() { for (const voice of [...active]) voice.stop(); active.clear(); streams.clear(); }
  return {
    /** A shot `after` seconds from now, plus its own travel time. */
    fire(tone: GunshotTone, pan = 0, after = 0, emitter = 'own') {
      const context = getContext(); if (!context || context.state !== 'running' || muted()) return;
      if (owner !== context) { clear(); bus?.dispose(); bus = createGunBus(context); noise = whiteNoise(context); owner = context; }
      if (tone.level < .002) return;
      // Bound busy firefights, retaining the player's immediate feedback.
      if (active.size >= 48) { if (emitter !== 'own') return; active.values().next().value?.stop(); }
      let shot: GunshotVoice | undefined;
      shot = playGunshot(context, bus!.input, noise!, tone, context.currentTime + Math.max(0, after), pan, samples, () => {
        if (shot) {
          active.delete(shot);
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
      }
    },
    clear,
    update() { if (muted() || getContext()?.state !== 'running') clear(); },
    dispose() { clear(); bus?.dispose(); bus = null; noise = null; owner = null; },
  };
}
