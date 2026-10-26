import { distanceGain, soundDelay } from './combat-event-audio';
import { muzzleSignature, type MuzzleDevice } from './weapon-accessories';

/**
 * Gunshots, synthesised in the engine's own AudioContext: no files to load.
 * A shot is four layers: the crack of the muzzle and the bullet, a burst of
 * noise for its body, a falling sine for the thump felt in the chest, and a
 * tail that is the shot coming back off the buildings. Every shot goes through
 * one bus that saturates and compresses, so a burst stays loud without
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
}
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
  const tone: GunshotTone = {
    level: (own ? OWN_LEVEL : OTHER_LEVEL * distanceGain(d)) * (.75 + .25 * punch) * Math.min(1.15, report),
    delay: own ? 0 : soundDelay(d),
    crack: .55 * (1 - far) ** 2, crackCutoff: 2600 - 900 * far,
    body: .65 * punch * (1 - .5 * far), bodyCutoff: Math.max(280, 3200 / Math.sqrt(bore) * (1 - .85 * far)), bodyLength: .06 + .035 * weight + .12 * far,
    thump: .95 * punch * (1 - .3 * far), thumpFrom: 150 / weight ** .15, thumpTo: 52 / weight ** .2, thumpLength: .1 + .045 * weight,
    tail: .2 * punch * (.6 + far), tailCutoff: 1400 - 900 * far, tailLength: .3 + .12 * weight + .7 * far,
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
  for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
  shaper.curve = curve; shaper.oversample = '2x';
  compressor.threshold.value = -16; compressor.knee.value = 10; compressor.ratio.value = 4; compressor.attack.value = .002; compressor.release.value = .18;
  output.gain.value = .85;
  input.connect(shaper).connect(compressor).connect(output).connect(destination);
  return { input, dispose() { [input, shaper, compressor, output].forEach(n => n.disconnect()); } };
}
export function whiteNoise(context: BaseAudioContext, seconds = 1) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}
/** Schedules one shot at context time `at` (before its travel delay), panned -1 (left) to 1 (right). */
export function playGunshot(context: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, tone: GunshotTone, at: number, pan = 0) {
  if (tone.level < .002) return;
  const t = at + tone.delay, out = context.createGain(), panner = context.createStereoPanner(), nodes: AudioNode[] = [out, panner];
  out.gain.value = tone.level; panner.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(panner).connect(bus);
  /** One layer: a source through a filter into an envelope that rises over `attack` and dies over `length`. */
  const layer = (source: AudioScheduledSourceNode, filter: BiquadFilterNode | null, peak: number, start: number, attack: number, length: number) => {
    const gain = context.createGain(); nodes.push(gain);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(peak, start + attack); gain.gain.exponentialRampToValueAtTime(.0001, start + attack + length);
    (filter ? source.connect(filter).connect(gain) : source.connect(gain)).connect(out);
    if (source instanceof AudioBufferSourceNode) source.start(start, Math.random() * .6); else source.start(start);
    source.stop(start + attack + length + .02);
    return source;
  };
  const noiseLayer = (type: BiquadFilterType, cutoff: number) => {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(); source.buffer = noise;
    filter.type = type; filter.frequency.value = cutoff; filter.Q.value = .7; nodes.push(filter); return { source, filter };
  };
  if (tone.crack > .01) { const { source, filter } = noiseLayer('highpass', tone.crackCutoff); layer(source, filter, tone.crack, t, .0008, .011); }
  const body = noiseLayer('lowpass', tone.bodyCutoff);
  body.filter.frequency.setValueAtTime(tone.bodyCutoff, t); body.filter.frequency.exponentialRampToValueAtTime(Math.max(120, tone.bodyCutoff * .35), t + tone.bodyLength);
  layer(body.source, body.filter, tone.body, t, .002, tone.bodyLength);
  const thump = context.createOscillator(); thump.type = 'sine';
  thump.frequency.setValueAtTime(tone.thumpFrom, t); thump.frequency.exponentialRampToValueAtTime(tone.thumpTo, t + tone.thumpLength * .6);
  layer(thump, null, tone.thump, t, .003, tone.thumpLength);
  const tail = noiseLayer('lowpass', tone.tailCutoff);
  const last = layer(tail.source, tail.filter, tone.tail, t + .025, .04, tone.tailLength);
  last.onended = () => nodes.forEach(n => n.disconnect());
}

/** Shots for one engine: `fire` drops them while the context is suspended or the game is muted. */
export function createGunshotAudio(getContext: () => AudioContext | null, muted: () => boolean) {
  let bus: ReturnType<typeof createGunBus> | null = null, noise: AudioBuffer | null = null, owner: AudioContext | null = null;
  return {
    /** A shot `after` seconds from now, plus its own travel time. */
    fire(tone: GunshotTone, pan = 0, after = 0) {
      const context = getContext(); if (!context || context.state !== 'running' || muted()) return;
      if (owner !== context) { bus?.dispose(); bus = createGunBus(context); noise = whiteNoise(context); owner = context; }
      playGunshot(context, bus!.input, noise!, tone, context.currentTime + Math.max(0, after), pan);
    },
    dispose() { bus?.dispose(); bus = null; noise = null; owner = null; },
  };
}
