import type { Obstacle } from './region-collision';
import { STAGE_BASE, stageObstacles, type StagePartData, type StageState, type StageZone } from './stage-parts';

/**
 * Levolution: events that change the map partway through a match
 * (docs/LEVOLUTION.md). Three layers, and only the last knows a map:
 *
 * - stage steps (below): the small vocabulary of things that can happen to a part;
 * - archetypes (`LevolutionPlugin`, levolution-catalog.ts): what happens and in
 *   what order, written against part *roles*;
 * - bindings (levolution-bindings.ts): which named parts of which arena fill
 *   those roles. A binding holds no coordinates.
 *
 * Like a combat event, a running event is a small descriptor and everything
 * else is a pure function of it, so the host sends guests a few numbers and
 * both sides arrive at the same map.
 */

export type StageStep =
  /**
   * The part takes this state (`null` removes it) `at` seconds after the event starts. With `lead` the
   * state is *drawn* that many seconds sooner, so something can be seen falling and become solid, and
   * lethal, only when it lands.
   */
  | { type: 'set'; at: number; part: string; state: StageState; lead?: number }
  /** The part's `zones` go under water: everyone on foot in them moves at `pace` of their speed from then on. */
  | { type: 'wade'; at: number; zones: readonly StageZone[]; pace: number }
  /** The district's lamps and windows go to `level` dark (1 is out) and stay there. */
  | { type: 'light'; at: number; level: number }
  /** Whoever stands inside colliders this event adds at `at` takes `damage`, through armour. */
  | { type: 'crush'; at: number; damage: number }
  /**
   * Dust nobody sees through for a while: a row of clouds through `center` out to `reach` either side,
   * then more out along `heading` (radians, x = sin, z = cos) as whatever fell that way lands.
   */
  | { type: 'dust'; at: number; center: { x: number; z: number }; heading: number; reach: number }
  /** A ring on the ground and the map; bots leave it. */
  | { type: 'marker'; from: number; until: number; center: { x: number; z: number }; radius: number };

export interface LevolutionDescriptor {
  /** Unique within the match. */
  id: string;
  /** Binding id. */
  binding: string;
  seed: number;
  /** Simulation `elapsed` when the warning began. */
  start: number;
  /** Who set it off, for the feed; absent when the clock did. */
  cause?: string;
}

export type LevolutionTrigger =
  /** Starts by itself once this fraction of the match has run, by the clock or by the leader's score towards the limit, so most matches see it. */
  | { kind: 'clock'; at: number }
  /** Blast damage near the part in this role, pooled on the host. */
  | { kind: 'blast'; role: string; health: number };

export interface LevolutionBinding {
  id: string;
  /** Arena id (arena-catalog.json). */
  arena: string;
  archetype: string;
  /** Shown in the banner and the feed, e.g. "Container stack". */
  name: string;
  /** Role → stage part id. */
  parts: Readonly<Record<string, string>>;
  triggers: readonly LevolutionTrigger[];
  /** Seconds of warning; defaults to the archetype's, and may not go below it. */
  warning?: number;
  /** What the banner says and what the feed blames, where the archetype's own words do not fit this map's piece. */
  banner?: string;
  cause?: string;
}

export interface LevolutionPlugin {
  id: string;
  name: string;
  /** Least seconds between the announcement and the first change. Enforced, not advisory. */
  warning: number;
  /** Seconds the transition goes on being drawn after the warning. */
  settle: number;
  /** What the banner says during the warning. */
  banner: string;
  /** What the feed says a victim was killed by. */
  cause: string;
  /** The roles a binding must fill, and the states each part must offer. */
  roles: Readonly<Record<string, { states: readonly string[] }>>;
  /** Pure: the same parts in, the same steps out, on host and guest alike. Times are seconds after the warning ends. */
  steps(parts: Readonly<Record<string, StagePartData>>): StageStep[];
}

const plugins = new Map<string, LevolutionPlugin>();
const ID = /^[a-z][a-z0-9-]{0,39}$/;
export function registerLevolution(plugin: LevolutionPlugin) {
  if (!ID.test(plugin.id) || plugins.has(plugin.id)) throw new Error(`Invalid or duplicate Levolution archetype "${plugin.id}"`);
  if (!(plugin.warning >= 3) || !(plugin.settle >= 0) || !Number.isFinite(plugin.warning + plugin.settle)) throw new Error(`Levolution archetype "${plugin.id}" must warn for at least 3 s`);
  plugins.set(plugin.id, Object.freeze({ ...plugin }));
}
export const getLevolution = (id: string) => plugins.get(id);
export const levolutionArchetypes = () => [...plugins.values()];

/** At most this many events on one map, so a map has four states at most to check. */
export const MAX_LEVOLUTION_EVENTS = 2;

/** A binding with its parts found and its steps worked out against them. */
export interface ResolvedLevolution {
  binding: LevolutionBinding;
  plugin: LevolutionPlugin;
  parts: Readonly<Record<string, StagePartData>>;
  /** Seconds from the start of the event. */
  steps: readonly StageStep[];
  /** The banner during the warning, and what the feed says a victim was killed by: the binding's words, or the archetype's. */
  banner: string;
  cause: string;
  warning: number;
  /** Seconds from start to settled. */
  duration: number;
}

/**
 * Bind an arena's events to the parts its scene actually has. `problems` lists
 * every binding that cannot run and why; a match drops those and plays on, and
 * levolution-bindings.test.ts fails on any of them.
 */
export function resolveLevolution(bindings: readonly LevolutionBinding[], arena: string, parts: readonly StagePartData[]) {
  const events: ResolvedLevolution[] = [], problems: string[] = [];
  for (const binding of bindings) {
    if (binding.arena !== arena) continue;
    const fail = (why: string) => { problems.push(`${binding.id}: ${why}`); };
    const plugin = plugins.get(binding.archetype);
    if (!plugin) { fail(`unknown archetype "${binding.archetype}"`); continue; }
    if (events.length >= MAX_LEVOLUTION_EVENTS) { fail(`more than ${MAX_LEVOLUTION_EVENTS} events on one map`); continue; }
    const found: Record<string, StagePartData> = {}; let ok = true;
    for (const [role, need] of Object.entries(plugin.roles)) {
      const part = parts.find(p => p.id === binding.parts[role]);
      if (!part) { fail(`no stage part "${binding.parts[role]}" for role "${role}"`); ok = false; continue; }
      for (const state of need.states) if (!(state in part.states)) { fail(`stage part "${part.id}" has no "${state}" state`); ok = false; }
      found[role] = part;
    }
    if (!ok) continue;
    for (const trigger of binding.triggers) {
      if (trigger.kind === 'clock' && !(trigger.at > 0 && trigger.at < 1)) { fail('clock trigger must be a fraction of the match'); ok = false; }
      if (trigger.kind === 'blast' && (!found[trigger.role] || !(trigger.health > 0))) { fail(`blast trigger names no part or health`); ok = false; }
    }
    const warning = Math.max(plugin.warning, binding.warning ?? 0);
    const steps = plugin.steps(found).map(step => step.type === 'marker' ? { ...step, until: step.until + warning } : { ...step, at: step.at + warning });
    if (steps.some(step => step.type !== 'marker' && !(step.at >= warning - 1e-9))) { fail('changes the map before its warning has run'); ok = false; }
    if (steps.some(step => step.type === 'set' && !((step.lead ?? 0) >= 0 && (step.lead ?? 0) <= step.at))) { fail('draws a change before the event has begun'); ok = false; }
    if (ok) events.push({ binding, plugin, parts: found, steps, banner: binding.banner ?? plugin.banner, cause: binding.cause ?? plugin.cause, warning, duration: warning + plugin.settle });
  }
  return { events, problems };
}

export type LevolutionPhase = 'warning' | 'transition' | 'settled';
export const levolutionPhase = (event: ResolvedLevolution, descriptor: Readonly<LevolutionDescriptor>, elapsed: number): LevolutionPhase => {
  const age = elapsed - descriptor.start;
  return age < event.warning ? 'warning' : age < event.duration ? 'transition' : 'settled';
};

/** Each acted-on part's state at `elapsed`. Events do not undo, so a later event's word on a part is final. */
export function stageStates(events: readonly ResolvedLevolution[], running: readonly Readonly<LevolutionDescriptor>[], elapsed: number, drawn = false) {
  const states = new Map<string, StageState>();
  for (const descriptor of running) {
    const event = events.find(e => e.binding.id === descriptor.binding); if (!event) continue;
    const age = elapsed - descriptor.start;
    // `drawn`: what is shown, which a step's `lead` brings forward of what is solid.
    for (const step of event.steps) if (step.type === 'set' && age >= step.at - (drawn ? step.lead ?? 0 : 0)) states.set(step.part, step.state);
  }
  return states;
}
/** How fast someone on foot at (x, z) moves at `elapsed`, as a share of their speed: under 1 in flood water. */
export function stagePace(events: readonly ResolvedLevolution[], running: readonly Readonly<LevolutionDescriptor>[], elapsed: number, x: number, z: number) {
  let pace = 1;
  for (const descriptor of running) for (const step of events.find(e => e.binding.id === descriptor.binding)?.steps ?? [])
    if (step.type === 'wade' && elapsed - descriptor.start >= step.at && step.zones.some(zone => x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ)) pace = Math.min(pace, step.pace);
  return pace;
}
/** How dark the running events have made the district at `elapsed`, 0 to 1. */
export function stageDarkness(events: readonly ResolvedLevolution[], running: readonly Readonly<LevolutionDescriptor>[], elapsed: number) {
  let level = 0;
  for (const descriptor of running) for (const step of events.find(e => e.binding.id === descriptor.binding)?.steps ?? []) if (step.type === 'light' && elapsed - descriptor.start >= step.at) level = Math.max(level, step.level);
  return Math.max(0, Math.min(1, level));
}

/** Every part any event of this arena may touch. */
export const stagedParts = (events: readonly ResolvedLevolution[]) => [...new Set(events.flatMap(e => Object.values(e.parts)))];

/** The box round a part's colliders in every state the event gives it, for warning rings. */
export function stageReach(part: StagePartData, states: readonly StageState[] = [STAGE_BASE, ...Object.keys(part.states)]) {
  const all: readonly Obstacle[] = states.flatMap(state => [...stageObstacles(part, state)]);
  if (!all.length) return null;
  const minX = Math.min(...all.map(o => o.minX)), maxX = Math.max(...all.map(o => o.maxX)), minZ = Math.min(...all.map(o => o.minZ)), maxZ = Math.max(...all.map(o => o.maxZ));
  return { minX, maxX, minZ, maxZ, center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 };
}

/** Live warning rings at `elapsed`, for bots and the map. */
export function levolutionMarkers(events: readonly ResolvedLevolution[], running: readonly Readonly<LevolutionDescriptor>[], elapsed: number) {
  return running.flatMap(descriptor => {
    const event = events.find(e => e.binding.id === descriptor.binding), age = elapsed - descriptor.start;
    return event ? event.steps.flatMap(step => step.type === 'marker' && age >= step.from && age <= step.until ? [{ ...step, event: descriptor.id }] : []) : [];
  });
}

export interface LevolutionSnapshot { events: LevolutionDescriptor[] }
/** Guest-side check of the host's word: known bindings, each at most once, finite and not from the future. */
export function validLevolutionSnapshot(value: unknown, events: readonly ResolvedLevolution[], elapsed: number): value is LevolutionSnapshot {
  if (!value || typeof value !== 'object' || !Array.isArray((value as LevolutionSnapshot).events)) return false;
  const list = (value as LevolutionSnapshot).events, seen = new Set<string>();
  if (list.length > MAX_LEVOLUTION_EVENTS) return false;
  return list.every(d => !!d && typeof d === 'object' && typeof d.id === 'string' && d.id.length <= 60 && typeof d.binding === 'string'
    && events.some(e => e.binding.id === d.binding) && !seen.has(d.binding) && !!seen.add(d.binding)
    && Number.isFinite(d.seed) && Number.isFinite(d.start) && d.start >= 0 && d.start <= elapsed + 1
    && (d.cause === undefined || typeof d.cause === 'string' && d.cause.length <= 60));
}
