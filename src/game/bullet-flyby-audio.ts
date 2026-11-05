import { effectsOutput } from '../lib/effects-volume';
import { BALLISTIC_SCALE, type BallisticPoint } from './fps-ballistics';
import { SPEED_OF_SOUND, soundDelay } from './combat-event-audio';
import type { SfxBank } from './sfx-bank';
import type { ImpactProfile } from './fps-impact-profile';
import { impactSoundWeight } from './impact-audio';

export const BULLET_PASS_RANGE = 18;
export const MAX_BULLET_PASS_VOICES = 12;

/** Only the part of the flight actually traversed, clipped at cover by the caller.
 * Wait until the round crosses the listener's perpendicular plane: endpoints
 * clamped on an approaching segment would announce the same pass too early.
 * Arcade velocities are scaled; the crack depends on the real muzzle speed.
 */
export function bulletPass(from: BallisticPoint, to: BallisticPoint, ear: BallisticPoint, velocity: number, profile?: ImpactProfile) {
  if (![from.x, from.y, from.z, to.x, to.y, to.z, ear.x, ear.y, ear.z, velocity].every(Number.isFinite)
    || velocity / BALLISTIC_SCALE <= SPEED_OF_SOUND) return null;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length2 = dx * dx + dy * dy + dz * dz;
  if (length2 < 1e-10) return null;
  const fraction = ((ear.x - from.x) * dx + (ear.y - from.y) * dy + (ear.z - from.z) * dz) / length2;
  if (fraction < 0 || fraction > 1) return null;
  const point = { x: from.x + dx * fraction, y: from.y + dy * fraction, z: from.z + dz * fraction };
  const distance = Math.hypot(point.x - ear.x, point.y - ear.y, point.z - ear.z);
  if (distance >= BULLET_PASS_RANGE) return null;
  const proximity = 1 - distance / BULLET_PASS_RANGE;
  // Share impact/decal calibre and power weighting. Keep the rifle reference
  // unchanged and bound point-blank heavy cracks without changing sample speed.
  return { point, distance, fraction, level: Math.min(.8, .65 * impactSoundWeight(profile) * proximity ** 2 / Math.sqrt(Math.max(1, distance / 2))),
    cutoff: 16000 * .25 ** (distance / BULLET_PASS_RANGE), delay: soundDelay(distance) };
}

/** A short pressure snap, a faint slap-back and a separate unpitched air rush.
 * No pitch sweep or long tonal "whiz"; all takes play at their natural speed. */
export function createBulletFlybyAudio(getContext: () => AudioContext | null, muted: () => boolean, samples: Pick<SfxBank, 'pick'>, destination?: (context: BaseAudioContext) => AudioNode) {
  const active = new Set<() => void>();
  let heard = new WeakSet<object>(), owner: AudioContext | null = null, fallback: AudioBuffer | null = null;
  function clear() { for (const stop of [...active]) stop(); heard = new WeakSet(); }
  return {
    pass(round: object, from: BallisticPoint, to: BallisticPoint, ear: BallisticPoint, velocity: number,
      panAt: (point: BallisticPoint) => number, after = 0, profile?: ImpactProfile) {
      const context = getContext();
      if (!context || context.state !== 'running' || muted()) return;
      if (owner !== context) { clear(); fallback = null; owner = context; }
      if (heard.has(round)) return;
      const pass = bulletPass(from, to, ear, velocity, profile);
      if (!pass || pass.level < .002) return;
      heard.add(round);
      if (active.size >= MAX_BULLET_PASS_VOICES) return;
      let buffer = samples.pick('bullet-pass');
      if (!buffer) {
        if (!fallback) {
          fallback = context.createBuffer(1, Math.ceil(context.sampleRate * .12), context.sampleRate);
          const pcm = fallback.getChannelData(0);
          for (let i = 0; i < pcm.length; i++) pcm[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * .012)) * Math.min(1, i / 8);
        }
        buffer = fallback;
      }
      const nodes: AudioNode[] = [], sources: AudioBufferSourceNode[] = [];
      const ends: { source: AudioBufferSourceNode; after: number }[] = [];
      const pan = panAt(pass.point), at = context.currentTime + Math.max(0, after) + pass.delay;
      let released = false;
      const release = () => { if (released) return; released = true; active.delete(stop); sources.forEach(s => { s.onended = null; }); nodes.forEach(n => n.disconnect()); };
      const stop = () => { if (released) return; sources.forEach(s => s.stop()); release(); };
      for (const echo of [false, true]) {
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain(), panner = context.createStereoPanner();
        source.buffer = buffer; // Natural speed; no stretched gunshot or ricochet.
        filter.type = 'lowpass'; filter.frequency.value = echo ? Math.min(2000, pass.cutoff) : pass.cutoff; filter.Q.value = .5;
        gain.gain.value = pass.level * (echo ? .08 : 1);
        panner.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
        source.connect(filter).connect(gain).connect(panner).connect(destination?.(context) ?? effectsOutput(context));
        nodes.push(source, filter, gain, panner); sources.push(source);
        const after = echo ? .035 : 0;
        source.start(at + after); ends.push({ source, after: after + buffer.duration });
      }
      const air = samples.pick('bullet-air');
      if (air) {
        const source = context.createBufferSource(), highpass = context.createBiquadFilter(), lowpass = context.createBiquadFilter(), gain = context.createGain(), panner = context.createStereoPanner();
        source.buffer = air; highpass.type = 'highpass'; highpass.frequency.value = 1200; highpass.Q.value = .5;
        lowpass.type = 'lowpass'; lowpass.frequency.value = pass.cutoff; lowpass.Q.value = .5;
        gain.gain.value = pass.level * .1; panner.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
        source.connect(highpass).connect(lowpass).connect(gain).connect(panner).connect(destination?.(context) ?? effectsOutput(context));
        nodes.push(source, highpass, lowpass, gain, panner); sources.push(source);
        source.start(at + .003); ends.push({ source, after: .003 + air.duration });
      }
      ends.reduce((longest, end) => end.after > longest.after ? end : longest).source.onended = release;
      active.add(stop);
    },
    clear,
    update() { if (muted() || getContext()?.state !== 'running') clear(); },
    dispose() { clear(); fallback = null; owner = null; },
  };
}
