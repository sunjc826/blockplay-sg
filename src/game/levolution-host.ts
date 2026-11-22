import type { Obstacle } from './region-collision';
import { applyStageObstacles } from './stage-parts';
import { levolutionMarkers, stageReach, stageStates, stagedParts, type LevolutionDescriptor, type LevolutionSnapshot, type ResolvedLevolution } from './levolution';

/**
 * The host's side of Levolution: decides when an event starts, owns the
 * obstacle list's stage parts, and tells the simulation what changed so it can
 * rebuild what it derived from the old map and deal with whoever was underneath.
 */
export interface LevolutionHostOptions {
  events: readonly ResolvedLevolution[];
  /** The world's live obstacle list; stage parts are swapped in and out of it. */
  obstacles: Obstacle[];
  /** Match length in seconds, for clock triggers. */
  duration: number;
  /**
   * Called once whenever colliders change. `crush` is set when the change is an
   * event's (not a reset): hurt whoever is inside `added` and move the survivors.
   */
  restage(change: { added: readonly Obstacle[]; removed: readonly Obstacle[]; crush?: { damage: number; cause: string } }): void;
  announce?(text: string): void;
  /** Raise a sight-blocking dust cloud. */
  dust?(center: { x: number; z: number }, heading: number, reach: number): void;
}

export function createLevolutionHost(options: LevolutionHostOptions) {
  const { events, obstacles } = options, parts = stagedParts(events);
  let running: LevolutionDescriptor[] = [], serial = 0, enabled = true;
  const health = new Map<string, number>();
  const arm = () => { health.clear(); for (const e of events) for (const t of e.binding.triggers) if (t.kind === 'blast') health.set(e.binding.id, t.health); };
  arm();
  const started = (binding: string) => running.some(d => d.binding === binding);

  function start(binding: string, elapsed: number, cause?: string) {
    const event = events.find(e => e.binding.id === binding);
    if (!event || started(binding)) return null;
    const descriptor: LevolutionDescriptor = { id: `stage-${++serial}`, binding, seed: (serial * 2654435761) >>> 0, start: elapsed, ...(cause ? { cause } : {}) };
    running.push(descriptor);
    options.announce?.(cause ? `${cause} set off the ${event.binding.name.toLowerCase()}` : `${event.binding.name} giving way`);
    return descriptor;
  }

  /** Bring the obstacle list to what the running events say it is at `elapsed`. */
  function sync(elapsed: number, previous: number) {
    for (const descriptor of running) for (const step of events.find(e => e.binding.id === descriptor.binding)?.steps ?? [])
      if (step.type === 'dust' && elapsed - descriptor.start >= step.at && previous - descriptor.start < step.at) options.dust?.(step.center, step.heading, step.reach);
    const { added, removed } = applyStageObstacles(obstacles, parts, stageStates(events, running, elapsed));
    if (!added.length && !removed.length) return;
    // The crush belongs to whichever event's step just came due.
    let crush: { damage: number; cause: string } | undefined;
    for (const descriptor of running) {
      const event = events.find(e => e.binding.id === descriptor.binding)!;
      for (const step of event.steps) if (step.type === 'crush' && elapsed - descriptor.start >= step.at && previous - descriptor.start < step.at && (!crush || step.damage > crush.damage)) crush = { damage: step.damage, cause: event.cause };
    }
    options.restage({ added, removed, crush });
  }

  let last = 0;
  /**
   * `score` is how far the leader is towards the mode's score limit, 0 to 1. A match can end on
   * score long before its clock runs out, so a clock trigger goes by whichever is further along.
   */
  function step(elapsed: number, score = 0) {
    if (enabled) for (const event of events) for (const trigger of event.binding.triggers)
      if (trigger.kind === 'clock' && (elapsed >= trigger.at * options.duration - event.warning || score >= trigger.at) && !started(event.binding.id)) start(event.binding.id, elapsed);
    sync(elapsed, last); last = elapsed;
  }

  /** A blast at `point`: wears down any armed event whose part it reaches. Returns the event it set off. */
  function blast(point: { x: number; z: number }, radius: number, damage: number, elapsed: number, by?: string) {
    if (!enabled) return null;
    for (const event of events) for (const trigger of event.binding.triggers) {
      if (trigger.kind !== 'blast' || started(event.binding.id)) continue;
      const reach = stageReach(event.parts[trigger.role], ['base']); if (!reach) continue;
      const dx = Math.max(reach.minX - point.x, 0, point.x - reach.maxX), dz = Math.max(reach.minZ - point.z, 0, point.z - reach.maxZ), d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      const left = (health.get(event.binding.id) ?? trigger.health) - damage * (1 - d / radius);
      health.set(event.binding.id, left);
      if (left <= 0) return start(event.binding.id, elapsed, by);
    }
    return null;
  }

  return {
    events, step, blast,
    /** Debug and scripted starts. */
    trigger: (binding: string, elapsed: number, cause?: string) => start(binding, elapsed, cause),
    setEnabled(value: boolean) { enabled = value; },
    markers: (elapsed: number) => levolutionMarkers(events, running, elapsed),
    snapshot: (): LevolutionSnapshot | undefined => running.length ? { events: running.map(d => ({ ...d })) } : undefined,
    reset() {
      running = []; serial = 0; last = 0; arm();
      const { added, removed } = applyStageObstacles(obstacles, parts, new Map());
      if (added.length || removed.length) options.restage({ added, removed });
    },
  };
}
export type LevolutionHost = ReturnType<typeof createLevolutionHost>;
