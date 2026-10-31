import { soundDelay } from './combat-event-audio';
import type { SurfaceKind } from './fps-surfaces';
import type { SfxBank, SfxGroup } from './sfx-bank';

export type ImpactSurface = SurfaceKind | 'water';
export const MAX_IMPACT_VOICES = 24;
export const IMPACT_SOUND_RANGE = 140;
const MATERIALS: Record<ImpactSurface, { level: number; pitch: number; ring: number; decay: number }> = {
  concrete: { level: 1, pitch: 1300, ring: 0, decay: .035 },
  metal: { level: 1.15, pitch: 3100, ring: .6, decay: .11 },
  wood: { level: .85, pitch: 580, ring: .3, decay: .045 },
  glass: { level: .9, pitch: 5200, ring: .18, decay: .07 },
  foliage: { level: .45, pitch: 2200, ring: 0, decay: .028 },
  dirt: { level: .65, pitch: 300, ring: 0, decay: .04 },
  flesh: { level: .7, pitch: 190, ring: .25, decay: .035 },
  water: { level: .8, pitch: 850, ring: .2, decay: .06 },
};

/** A shorter-range sound than a muzzle report, heard from the struck point. */
export function impactTone(surface: ImpactSurface, distance = 0, energy = 1) {
  const d = Number.isFinite(distance) ? Math.max(0, distance) : IMPACT_SOUND_RANGE;
  const strength = Number.isFinite(energy) ? Math.min(2, Math.max(0, energy)) : 1;
  return {
    sample: `impact-${surface}` as SfxGroup,
    // The old 8 m reference plus range fade buried even 25–50 m hits under
    // the muzzle report. Keep the recorded transient clear at fighting range;
    // softer materials, spent rounds and distant hits still stay quieter.
    level: .42 * MATERIALS[surface].level * Math.sqrt(strength) * Math.min(1, 24 / Math.max(24, d)) * Math.max(0, 1 - d / IMPACT_SOUND_RANGE),
    delay: soundDelay(d), cutoff: 15000 * .15 ** Math.min(1, d / IMPACT_SOUND_RANGE),
    rate: 1.08 - .08 * Math.sqrt(strength),
  };
}

/** Small material-specific fallback while the recorded clips load or when offline. */
function synthesize(context: AudioContext, surface: ImpactSurface) {
  const material = MATERIALS[surface], length = material.decay * 5;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate);
  const data = buffer.getChannelData(0);
  let low = 0;
  const alpha = 1 - Math.exp(-2 * Math.PI * material.pitch / context.sampleRate);
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate;
    low += alpha * (Math.random() * 2 - 1 - low);
    const ring = Math.sin(2 * Math.PI * material.pitch * t) * material.ring;
    data[i] = (low * .8 + ring * .35) * Math.exp(-t / material.decay) * Math.min(1, t / .001);
  }
  return buffer;
}

/** One engine's bounded impact voices, sharing its AudioContext and master mute. */
export function createImpactAudio(getContext: () => AudioContext | null, muted: () => boolean, samples: Pick<SfxBank, 'pick'>) {
  const active = new Set<() => void>(), fallback = new Map<ImpactSurface, AudioBuffer>();
  let owner: AudioContext | null = null;
  function clear() { for (const stop of [...active]) stop(); }
  return {
    hit(surface: ImpactSurface, distance: number, pan = 0, energy = 1) {
      const context = getContext();
      if (!context || context.state !== 'running' || muted()) return;
      if (owner !== context) { clear(); fallback.clear(); owner = context; }
      const tone = impactTone(surface, distance, energy);
      if (tone.level < .002 || active.size >= MAX_IMPACT_VOICES) return;
      let buffer = samples.pick(tone.sample);
      if (!buffer) {
        if (!fallback.has(surface)) fallback.set(surface, synthesize(context, surface));
        buffer = fallback.get(surface)!;
      }
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain(), panner = context.createStereoPanner();
      source.buffer = buffer; source.playbackRate.value = tone.rate * (.96 + Math.random() * .08);
      filter.type = 'lowpass'; filter.frequency.value = tone.cutoff; filter.Q.value = .5;
      gain.gain.value = tone.level; panner.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
      source.connect(filter).connect(gain).connect(panner).connect(context.destination);
      const release = () => { active.delete(stop); source.onended = null; [source, filter, gain, panner].forEach(node => node.disconnect()); };
      const stop = () => { source.stop(); release(); };
      active.add(stop); source.onended = release;
      source.start(context.currentTime + tone.delay);
    },
    /** Cancel even scheduled sounds when play is interrupted or audio is muted. */
    update() { if (muted() || getContext()?.state !== 'running') clear(); },
    clear,
    dispose() { clear(); fallback.clear(); owner = null; },
  };
}
