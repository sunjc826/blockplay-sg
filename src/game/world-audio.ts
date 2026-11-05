import { effectsOutput } from '../lib/effects-volume';
import worldManifest from '../audio/world/manifest.json';
import { isDragonBoat } from './marina-water';
import type { SfxBank, SfxGroup } from './sfx-bank';
import type { VehicleKind } from './vehicle-rules';

export const LOOP_PAD = worldManifest.loopPadSeconds;
export type WorldLoop = 'vehicle' | 'transport' | 'rain' | 'wind' | 'bed' | 'merlion' | 'lift' | 'chute';
export interface LoopTarget { group: SfxGroup; level: number; rate?: number; pan?: number }
const VEHICLE_LOOP: Partial<Record<VehicleKind, SfxGroup>> = { car: 'world-car-loop', helicopter: 'world-heli-loop' };

export interface WorldSoundState {
  playing: boolean; deafened: boolean;
  /** The vehicle you are in, and its speed in m/s. */
  vehicle: VehicleKind | null; speed: number;
  /** From the atmosphere: rain 0 to about .85, wind in its own units up to about 3. */
  rain: number; wind: number; sheltered: boolean;
  /** Districts on the water hear the sea under everything, the rest the city. */
  coastal: boolean;
  merlionFiring: boolean; inMovingLift: boolean; parachuting: boolean;
  /** The nearest working transport you are not in: how far, what kind and how hard it is working. */
  transport: { mode: 'land' | 'air' | 'sea'; gain: number; effort: number } | null;
}
/**
 * Everything continuous, by rule: none of it while paused or dead, and a deafened player only gets a trace of it.
 * The bed sits under footsteps on purpose: a step at mid range peaks around .1, and these must not mask it.
 */
export function worldLoopTargets(state: WorldSoundState): Partial<Record<WorldLoop, LoopTarget>> {
  if (!state.playing) return {};
  const ears = state.deafened ? .2 : 1, targets: Partial<Record<WorldLoop, LoopTarget>> = {};
  const group = state.vehicle ? VEHICLE_LOOP[state.vehicle] : undefined;
  if (group) targets.vehicle = state.vehicle === 'car'
    ? { group, level: .55 * ears, rate: .78 + Math.min(1, Math.abs(state.speed) / 30) * .62 }
    : { group, level: .6 * ears, rate: .96 + Math.min(1, Math.abs(state.speed) / 60) * .1 };
  if (state.transport) targets.transport = {
    group: state.transport.mode === 'air' ? 'world-heli-loop' : state.transport.mode === 'sea' ? 'world-boat-loop' : 'world-car-loop',
    level: state.transport.gain * .7 * ears, rate: .85 + state.transport.effort * .3,
  };
  const enclosed = state.vehicle === 'car' || state.vehicle === 'helicopter';
  if (state.rain > .02) targets.rain = { group: 'world-rain-loop', level: Math.min(1, state.rain * .8) * (state.sheltered ? .35 : enclosed ? .5 : 1) * ears };
  if (state.wind > .1) targets.wind = { group: 'world-wind-loop', level: Math.min(1, state.wind / 3) * (enclosed || state.sheltered ? .2 : .6) * ears };
  targets.bed = { group: state.coastal ? 'world-coast-loop' : 'world-city-loop', level: (enclosed ? .2 : .45) * ears };
  if (state.merlionFiring) targets.merlion = { group: 'world-merlion-jet', level: .85 * ears };
  if (state.inMovingLift) targets.lift = { group: 'world-lift-motor', level: .8 * ears };
  if (state.parachuting) targets.chute = { group: 'world-chute-wind', level: .85 * ears };
  return targets;
}

/** How often a dragon boat's drum and paddles sound, in seconds, or null when it is not moving. */
export function dragonBoatStroke(kind: VehicleKind | null, speed: number) {
  if (!kind || !isDragonBoat(kind) || Math.abs(speed) < .5) return null;
  return Math.max(.42, 1.05 - Math.abs(speed) * .07);
}
/** A sudden loss of this much speed in a frame is a crash, whichever way the vehicle's rules recorded it. */
export const CRASH_SPEED_LOSS = 5;
/** The lightning cycle in `world-atmosphere`: a flash when `time % 23` passes 1. Thunder follows after the distance's delay. */
export const crossedLightning = (from: number, to: number) => to > from && Math.floor((from + 22) / 23) !== Math.floor((to + 22) / 23);

/** One looping voice per name, faded to its target every frame. Silent until its recording has loaded; stops after fading out. */
export function createWorldLoops(getContext: () => AudioContext | null, samples: Pick<SfxBank, 'get'>) {
  interface Voice { context: AudioContext; group: SfxGroup; source: AudioBufferSourceNode; gain: GainNode; panner: StereoPannerNode; silentSince: number | null }
  const voices = new Map<WorldLoop, Voice>();
  function stop(name: WorldLoop) {
    const voice = voices.get(name); if (!voice) return;
    voices.delete(name); voice.source.stop(); voice.source.disconnect(); voice.gain.disconnect(); voice.panner.disconnect();
  }
  return {
    /** True when this voice is actually sounding, so a synthesised fallback can step aside. */
    playing: (name: WorldLoop) => voices.has(name),
    update(targets: Partial<Record<WorldLoop, LoopTarget>>, muted: boolean) {
      const context = getContext(); if (!context) return;
      for (const name of voices.keys()) if (voices.get(name)!.context !== context) stop(name);
      const live = !muted && context.state === 'running', now = context.currentTime;
      for (const name of Object.keys(targets) as WorldLoop[]) {
        const target = targets[name]!; let voice = voices.get(name);
        if (voice && voice.group !== target.group) { stop(name); voice = undefined; }
        if (!voice && live && target.level > 0) {
          const buffer = samples.get(target.group); if (!buffer) continue;
          const source = context.createBufferSource(), gain = context.createGain(), panner = context.createStereoPanner();
          source.buffer = buffer; source.loop = true; source.loopStart = LOOP_PAD; source.loopEnd = Math.max(LOOP_PAD + .1, buffer.duration - LOOP_PAD);
          gain.gain.value = 0; source.connect(gain).connect(panner).connect(effectsOutput(context)); source.start(0, LOOP_PAD);
          voice = { context, group: target.group, source, gain, panner, silentSince: null }; voices.set(name, voice);
        }
        if (!voice) continue;
        voice.silentSince = null;
        voice.gain.gain.setTargetAtTime(live ? target.level : 0, now, .18);
        voice.source.playbackRate.setTargetAtTime(target.rate ?? 1, now, .25);
        voice.panner.pan.setTargetAtTime(target.pan ?? 0, now, .1);
      }
      for (const [name, voice] of voices) {
        if (targets[name]) continue;
        voice.silentSince ??= now;
        voice.gain.gain.setTargetAtTime(0, now, .18);
        if (now - voice.silentSince > 1.2) stop(name);
      }
    },
    dispose() { for (const name of [...voices.keys()]) stop(name); },
  };
}
