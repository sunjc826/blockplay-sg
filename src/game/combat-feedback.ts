import { effectsOutput } from '../lib/effects-volume';
import type { LiveGrenade } from './grenade-system';
import type { SfxGroup } from './sfx-bank';
import type { SurfaceKind } from './fps-surfaces';
import { healthBand } from './vitals';

/** Automatic fire lands faster than a tick can be told apart: closer than this and the second is dropped, unless it says more. */
export const HIT_CONFIRM_GAP = .055;
/** What to play for a hit you landed. A headshot is heard on top of a kill, so both pieces of news arrive. */
export function hitConfirmGroups(kind: 'hit' | 'kill', head: boolean): SfxGroup[] {
  if (kind === 'kill') return head ? ['combat-kill', 'combat-headshot'] : ['combat-kill'];
  return [head ? 'combat-headshot' : 'combat-hit'];
}

export interface Vitals { health: number; armor: number }
export interface DamageCue { group: SfxGroup; level: number }
/** A gas cloud or fire takes a sliver per tick; the bar and the cough tell that story, not a thump per frame. */
const MINOR_DAMAGE = 2;
/** At or below this share of health a wound lands as a heavy one, however small the number. */
const HEAVY_SHARE = .3;
/**
 * What a hit sounds like depends on what it hit. With plates up it is the plate;
 * the blow that breaks them is the break, not the body behind it; with none left
 * it is the body, and once you are nearly gone every wound lands heavy.
 */
export function damageCues(before: Vitals, after: Vitals, maxHealth: number): DamageCue[] {
  const lostHealth = Math.max(0, before.health - after.health), lostArmor = Math.max(0, before.armor - after.armor), lost = lostHealth + lostArmor;
  if (lost < MINOR_DAMAGE) return [];
  const size = .65 + .35 * Math.min(1, lost / (Math.max(1, maxHealth) * .3)), cues: DamageCue[] = [];
  const shareLeft = maxHealth > 0 ? after.health / maxHealth : 0, broke = before.armor > 0 && after.armor <= 0;
  if (broke) cues.push({ group: 'combat-hurt-break', level: 1 });
  else if (lostArmor > 0) cues.push({ group: 'combat-hurt-armor', level: size });
  if (lostHealth > 0 && shareLeft <= HEAVY_SHARE) cues.push({ group: 'combat-hurt-heavy', level: after.health <= 0 ? 1 : size });
  else if (lostHealth > 0 && !broke && lostArmor <= 0) cues.push({ group: 'combat-hurt-body', level: size });
  return cues;
}

/** The body's alarm: nothing while steady, a heartbeat when low, faster with ragged breath when critical. */
export function lowHealthPulse(health: number, maxHealth: number) {
  const band = healthBand(health, maxHealth);
  if (health <= 0 || band === 'steady') return null;
  const critical = band === 'critical';
  return { beat: critical ? .68 : 1.02, level: critical ? 1 : .6, breath: critical ? 3.1 : null };
}

/** Grit under a slide: filtered noise, brightest on hard ground, fading with the speed. Nothing runs between slides. */
const SCRAPE_PITCH: Partial<Record<SurfaceKind, number>> = { metal: 3100, glass: 2800, wood: 1800, dirt: 950, foliage: 850 };
export const SLIDE_SCRAPE_LEVEL = .075;
export function createSlideScrape(getContext: () => AudioContext | null, muted: () => boolean) {
  let voice: { context: AudioContext; source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  const release = (fade: number) => {
    if (!voice) return;
    const { context, source, filter, gain } = voice; voice = null;
    gain.gain.setTargetAtTime(0, context.currentTime, fade);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.stop(context.currentTime + fade * 5);
  };
  return {
    /** `share` is how much of the slide's speed is left; 0 is no slide. */
    update(share: number, surface: SurfaceKind) {
      const context = getContext(); if (!context) return;
      if (voice && voice.context !== context) release(.01);
      if (share <= 0 || muted() || context.state !== 'running') { release(.07); return; }
      if (!voice) {
        const noise = context.createBuffer(1, context.sampleRate, context.sampleRate), data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        source.buffer = noise; source.loop = true;
        filter.type = 'bandpass'; filter.Q.value = .7; filter.frequency.value = SCRAPE_PITCH[surface] ?? 1500;
        gain.gain.value = 0;
        source.connect(filter).connect(gain).connect(effectsOutput(context)); source.start();
        voice = { context, source, filter, gain };
      }
      voice.gain.gain.setTargetAtTime(SLIDE_SCRAPE_LEVEL * Math.min(1, share), context.currentTime, .025);
    },
    dispose() { release(.01); },
  };
}

/** Falling this fast and then not: slower than that is rolling, not a bounce you would hear. */
const BOUNCE_SPEED = 1.5;
/**
 * Bounces are not reported, so they are read from the velocity: a grenade that was
 * falling and now is not has hit something. `seen` keeps each one between calls.
 */
export function grenadeBounces(live: readonly LiveGrenade[], seen: Map<number, { y: number; speed: number; rested: boolean }>) {
  const bounces: { serial: number; position: LiveGrenade['position']; strength: number }[] = [], present = new Set<number>();
  for (const grenade of live) {
    present.add(grenade.serial);
    const { x, y, z } = grenade.velocity, speed = Math.hypot(x, y, z), was = seen.get(grenade.serial);
    if (was && !was.rested && was.speed >= BOUNCE_SPEED && was.y < 0 && (grenade.rested || y > 0)) bounces.push({ serial: grenade.serial, position: grenade.position, strength: Math.min(1, was.speed / 10) });
    seen.set(grenade.serial, { y, speed, rested: grenade.rested });
  }
  for (const serial of seen.keys()) if (!present.has(serial)) seen.delete(serial);
  return bounces;
}

/** Concrete keeps the original boots; glass and bodies underfoot are not worth a recording of their own. */
export function stepGroup(surface: SurfaceKind, running: boolean): SfxGroup {
  if (surface === 'metal') return 'combat-step-metal';
  if (surface === 'wood') return 'combat-step-wood';
  if (surface === 'dirt' || surface === 'foliage') return 'combat-step-dirt';
  return running ? 'run' : 'walk';
}

/** Ringing ears while deafened: a pure tone, so synthesised, beating slowly against a near neighbour and fading as it passes. */
export function createEarRing(getContext: () => AudioContext | null, muted: () => boolean) {
  let voice: { context: AudioContext; gain: GainNode; tones: OscillatorNode[] } | null = null;
  const dispose = () => { voice?.tones.forEach(tone => { tone.stop(); tone.disconnect(); }); voice?.gain.disconnect(); voice = null; };
  return {
    update(deafened: { remaining: number; strength: number } | undefined) {
      const context = getContext(); if (!context) return;
      if (!deafened && !voice) return;
      if (voice && voice.context !== context) dispose();
      if (!voice) {
        const gain = context.createGain(); gain.gain.value = 0; gain.connect(effectsOutput(context));
        const tones = [3120, 3127].map(frequency => { const tone = context.createOscillator(); tone.frequency.value = frequency; tone.connect(gain); tone.start(); return tone; });
        voice = { context, gain, tones };
      }
      const level = deafened && !muted() && context.state === 'running' ? .022 * Math.min(1, Math.max(.5, deafened.strength)) * Math.min(1, deafened.remaining / 1.5) : 0;
      voice.gain.gain.setTargetAtTime(level, context.currentTime, deafened ? .08 : .25);
    },
    dispose,
  };
}
