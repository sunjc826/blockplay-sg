import type { WeaponSpec } from './fps-rules';
import type { SfxBank, SfxGroup } from './sfx-bank';

type ReloadWeapon = Pick<WeaponSpec, 'id' | 'feed' | 'caliberMm'>;
type Stage = 'MAG OUT' | 'MAG IN' | 'SEAT MAG' | 'BOLT BACK' | 'CHAMBER';
type Mechanism = 'pistol' | 'bullpup' | 'carbine' | 'rifle' | 'drum' | 'light-belt' | 'belt' | 'heavy-belt';
interface Material { body: number; metal: number; decay: number; scrape: number; level: number }
const MATERIALS: Record<Mechanism, Material> = {
  pistol: { body: 1150, metal: 3600, decay: .012, scrape: .045, level: .22 },
  bullpup: { body: 430, metal: 2150, decay: .018, scrape: .075, level: .26 },
  carbine: { body: 670, metal: 2800, decay: .014, scrape: .055, level: .24 },
  rifle: { body: 520, metal: 2500, decay: .016, scrape: .065, level: .25 },
  drum: { body: 270, metal: 1700, decay: .028, scrape: .095, level: .29 },
  'light-belt': { body: 390, metal: 2400, decay: .022, scrape: .09, level: .29 },
  belt: { body: 240, metal: 1850, decay: .03, scrape: .105, level: .32 },
  'heavy-belt': { body: 145, metal: 1250, decay: .038, scrape: .125, level: .36 },
};
const STAGES: Stage[] = ['MAG OUT', 'MAG IN', 'SEAT MAG', 'BOLT BACK', 'CHAMBER'];
const ACTION: Record<Stage, string> = { 'MAG OUT': 'out', 'MAG IN': 'in', 'SEAT MAG': 'seat', 'BOLT BACK': 'back', CHAMBER: 'release' };

/** Feed hardware determines the sound, including equipped variants and future belt-fed guns. */
export function reloadMechanism(weapon: ReloadWeapon): Mechanism {
  if (weapon.feed === 'belt') return weapon.caliberMm >= 12 ? 'heavy-belt' : weapon.caliberMm < 7 ? 'light-belt' : 'belt';
  if (weapon.feed === 'drum') return 'drum';
  if (weapon.id === 'p30-inspired') return 'pistol';
  if (weapon.id === 'sar21-inspired') return 'bullpup';
  return weapon.id === 'xm8-inspired' ? 'carbine' : 'rifle';
}

function actionMechanism(weapon: ReloadWeapon, stage: Stage) {
  // Kongsi swaps the drum for rifle magazines but keeps the Ultimax action.
  return weapon.id === 'ultimax-inspired' && (stage === 'BOLT BACK' || stage === 'CHAMBER') ? 'drum' : reloadMechanism(weapon);
}

export function reloadSample(weapon: ReloadWeapon, stage: Stage): SfxGroup {
  return `reload-${actionMechanism(weapon, stage)}-${ACTION[stage]}` as SfxGroup;
}

/**
 * Dry mechanical foley: a short excitation into damped body/steel resonances,
 * sliding friction and separate cartridge/link ticks. Durations describe the
 * action itself; the animation controls the gaps, never the playback speed.
 * Kept as PCM authoring so the exact game sounds can also be rendered offline.
 */
export function reloadFoley(weapon: ReloadWeapon, stage: Stage, sampleRate: number, variation = 0): Float32Array {
  const mechanism = actionMechanism(weapon, stage), m = MATERIALS[mechanism];
  const belt = mechanism.endsWith('belt'), drum = mechanism === 'drum';
  const data = new Float32Array(Math.ceil(sampleRate * .34));
  let seed = 19 + STAGES.indexOf(stage) * 7919 + variation * 101;
  for (const ch of mechanism) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 * 2 - 1; };
  function knock(at: number, strength: number, pitch = 1, steel = .35, decay = m.decay) {
    const begin = Math.round(at * sampleRate), length = Math.min(data.length - begin, Math.ceil(decay * 7 * sampleRate));
    let low = 0;
    const alpha = 1 - Math.exp(-2 * Math.PI * m.metal * pitch / sampleRate);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate, attack = Math.min(1, t / .0007);
      low += alpha * (random() - low);
      // Inharmonic, strongly damped modes keep these small clacks rather than musical notes.
      const body = (Math.sin(2 * Math.PI * m.body * pitch * t) + .45 * Math.sin(2 * Math.PI * m.body * pitch * 1.73 * t)) * Math.exp(-t / decay);
      const ring = Math.sin(2 * Math.PI * m.metal * pitch * t) * Math.exp(-t / (decay * .32));
      data[begin + i] += strength * attack * (body * .42 + ring * steel * .3 + low * Math.exp(-t / (decay * .45)) * .85);
    }
  }
  function slide(at: number, seconds: number, strength: number) {
    const begin = Math.round(at * sampleRate), length = Math.min(data.length - begin, Math.round(seconds * sampleRate));
    let low = 0, slow = 0;
    for (let i = 0; i < length; i++) {
      low += .32 * (random() - low); slow += .045 * (low - slow);
      const p = i / length;
      data[begin + i] += (low - slow) * Math.sin(Math.PI * p) * strength * (.65 + .35 * Math.sin(p * Math.PI * 13) ** 2);
    }
  }
  function links(at: number, count: number, strength: number) {
    for (let i = 0; i < count; i++) knock(at + i * .022 + random() * .002, strength * (.8 + random() * .2), 1.3 + random() * .22, .85, .008);
  }
  switch (stage) {
    case 'MAG OUT':
      knock(.002, belt ? .8 : .45, 1.3, .65);
      slide(.015, m.scrape, .6);
      if (belt) { knock(.07, .75, .75, .65); links(.105, 6, .23); }
      else if (drum) { knock(.075, .65, .7); links(.10, 3, .12); }
      else knock(.055, .28, .9);
      break;
    case 'MAG IN':
      slide(.003, m.scrape, .85);
      if (belt) { knock(.025, .65, .8); links(.06, 8, .32); }
      else { knock(m.scrape, .75, drum ? .65 : 1); if (drum) links(.13, 4, .18); }
      break;
    case 'SEAT MAG':
      // A feed cover closes over the belt; a drum gives a hollow latch and rattle.
      knock(.002, 1, belt ? .7 : drum ? .65 : .85, belt ? .8 : .25);
      knock(belt ? .055 : .022, belt ? .7 : .35, 1.45, .75, .012);
      if (belt || drum) links(.075, belt ? 4 : 3, .18);
      break;
    case 'BOLT BACK':
      knock(.002, .5, 1.2, .6);
      slide(.009, m.scrape * 1.3, 1);
      knock(.012 + m.scrape * 1.3, .8, .85, .65);
      break;
    case 'CHAMBER':
      slide(.001, .018, .6);
      knock(.02, 1, .85, .7);
      knock(.04, .4, 1.6, .8, .009);
      if (belt) links(.06, 3, .17);
      break;
  }
  // Fixed headroom; relative weight comes from the mechanism's playback gain.
  let peak = 0;
  for (const value of data) peak = Math.max(peak, Math.abs(value));
  const scale = .85 / Math.max(1, peak);
  for (let i = 0; i < data.length; i++) data[i] *= scale * Math.min(1, (data.length - 1 - i) / (sampleRate * .012));
  return data;
}

export const MAX_RELOAD_VOICES = 6;
/** Short, bounded voices sharing the engine's mute and interruption lifecycle. */
export function createReloadAudio(getContext: () => AudioContext | null, muted: () => boolean, samples: Pick<SfxBank, 'pick'>) {
  const active = new Set<() => void>(), buffers = new Map<string, AudioBuffer>();
  let owner: AudioContext | null = null, take = 0;
  const clear = () => { for (const stop of [...active]) stop(); };
  return {
    play(weapon: ReloadWeapon, label: string) {
      const context = getContext();
      if (!context || context.state !== 'running' || muted() || !STAGES.includes(label as Stage)) return;
      if (owner !== context) { clear(); buffers.clear(); owner = context; }
      if (active.size >= MAX_RELOAD_VOICES) return;
      const stage = label as Stage, mechanism = actionMechanism(weapon, stage), material = MATERIALS[mechanism];
      const variation = take++ % 2, key = `${mechanism}:${stage}:${variation}`;
      let buffer = samples.pick(reloadSample(weapon, stage)) ?? buffers.get(key);
      if (!buffer) {
        const pcm = reloadFoley(weapon, stage, context.sampleRate, variation);
        buffer = context.createBuffer(1, pcm.length, context.sampleRate);
        buffer.getChannelData(0).set(pcm); buffers.set(key, buffer);
      }
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.playbackRate.value = 1; gain.gain.value = material.level;
      source.connect(gain).connect(context.destination);
      const release = () => { active.delete(stop); source.onended = null; source.disconnect(); gain.disconnect(); };
      const stop = () => { source.stop(); release(); };
      active.add(stop);
      source.onended = release;
      source.start(context.currentTime);
    },
    update() { if (muted() || getContext()?.state !== 'running') clear(); },
    clear,
    dispose() { clear(); buffers.clear(); owner = null; },
  };
}
