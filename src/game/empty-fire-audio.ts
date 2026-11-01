import { roundReady, type WeaponSpec, type WeaponState } from './fps-rules';
import { reloadSample } from './reload-audio';
import type { SfxBank, SfxGroup } from './sfx-bank';

export function canDryFire(state: WeaponState, weapon: WeaponSpec, spent: boolean) {
  return !spent && state.reloadRemaining <= 0 && state.cooldown <= 0 && !roundReady(state, weapon);
}

/** The action stays with the receiver even when an equipped variant changes its feed. */
export function emptyFireSample(weapon: WeaponSpec): SfxGroup {
  return reloadSample(weapon, 'CHAMBER').replace(/^reload-/, 'empty-fire-').replace(/-release$/, '') as SfxGroup;
}

/** One compact recorded click at natural speed, replacing any previous click. */
export function createEmptyFireAudio(getContext: () => AudioContext | null, muted: () => boolean, samples: Pick<SfxBank, 'pick'>) {
  let stop: (() => void) | null = null;
  const clear = () => { stop?.(); };
  return {
    play(weapon: WeaponSpec) {
      const context = getContext();
      if (!context || context.state !== 'running' || muted()) return;
      const buffer = samples.pick(emptyFireSample(weapon));
      if (!buffer) return;
      clear();
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.playbackRate.value = 1; gain.gain.value = .65;
      source.connect(gain).connect(context.destination);
      const release = () => { stop = null; source.onended = null; source.disconnect(); gain.disconnect(); };
      stop = () => { source.stop(); release(); };
      source.onended = release;
      source.start(context.currentTime);
    },
    update() { if (muted() || getContext()?.state !== 'running') clear(); },
    clear,
    dispose: clear,
  };
}
