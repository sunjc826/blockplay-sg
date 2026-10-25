import { combatPhase, combatRandom, combatTimeline, getCombatEvent, type CombatEventDescriptor, type CombatPlane } from './combat-events';

/**
 * Decides when a combat event starts and where it lands. Pure and seeded: the
 * host steps it with what it knows of the match and gets back the parts of a
 * descriptor, or nothing. It never sees actors beyond the points it is handed.
 */

export type CombatRisk = 'low' | 'medium' | 'high';
export interface CombatDirectorEntry { kind: string; weight: number; cooldown: number }
/** Seconds to the first event and between events, and how much each throws, by district risk. */
export const COMBAT_PACE: Readonly<Record<CombatRisk, { first: readonly [number, number]; gap: readonly [number, number]; intensity: number }>> = {
  low: { first: [45, 75], gap: [110, 190], intensity: .75 },
  medium: { first: [30, 55], gap: [75, 140], intensity: 1 },
  high: { first: [25, 40], gap: [50, 100], intensity: 1.4 },
};
/**
 * What the director picks from, by district risk: quiet districts see
 * barrages, smoke and supply drops; dangerous ones get raids and snipers too.
 * Cooldowns keep any one kind from coming round again too soon.
 */
export const COMBAT_TABLES: Readonly<Record<CombatRisk, readonly CombatDirectorEntry[]>> = {
  low: [
    { kind: 'artillery', weight: 3, cooldown: 45 }, { kind: 'mortar', weight: 2, cooldown: 90 }, { kind: 'smoke-screen', weight: 1, cooldown: 90 },
    { kind: 'supply-drop', weight: 2, cooldown: 150 }, { kind: 'blackout', weight: 1, cooldown: 240 }, { kind: 'drone', weight: 1, cooldown: 120 },
  ],
  medium: [
    { kind: 'artillery', weight: 3, cooldown: 45 }, { kind: 'mortar', weight: 2, cooldown: 90 }, { kind: 'drone', weight: 2, cooldown: 90 },
    { kind: 'sniper', weight: 2, cooldown: 120 }, { kind: 'smoke-screen', weight: 1, cooldown: 90 }, { kind: 'tear-gas', weight: 1, cooldown: 90 },
    { kind: 'supply-drop', weight: 2, cooldown: 150 }, { kind: 'blackout', weight: 1, cooldown: 240 },
    { kind: 'air-raid', weight: 1, cooldown: 180 }, { kind: 'helicopter-raid', weight: 1, cooldown: 180 },
  ],
  high: [
    { kind: 'artillery', weight: 3, cooldown: 45 }, { kind: 'mortar', weight: 2, cooldown: 75 }, { kind: 'drone', weight: 2, cooldown: 75 },
    { kind: 'sniper', weight: 2, cooldown: 100 }, { kind: 'air-raid', weight: 2, cooldown: 150 }, { kind: 'helicopter-raid', weight: 2, cooldown: 150 },
    { kind: 'tear-gas', weight: 1, cooldown: 90 }, { kind: 'smoke-screen', weight: 1, cooldown: 90 },
    { kind: 'supply-drop', weight: 1, cooldown: 150 }, { kind: 'blackout', weight: 1, cooldown: 240 },
  ],
};
/** Artillery alone: what tests and callers that want only the original barrage pass as `table`. */
export const DEFAULT_COMBAT_TABLE: readonly CombatDirectorEntry[] = [{ kind: 'artillery', weight: 1, cooldown: 45 }];
/** Targets land this far from the human they are chosen around. */
export const COMBAT_TARGET_RANGE = [25, 80] as const;
/** Events that hunt a player are centred this far from them, so the first pass is not straight overhead. */
export const COMBAT_PLAYER_OFFSET = [6, 16] as const;
/** No damaging round may be aimed closer than this to a human when the event is scheduled. */
export const COMBAT_BRACKET = 10;
/** Nor this close to a point the caller wants kept clear, such as an arrival spawn. */
export const COMBAT_SPAWN_CLEAR = 15;
/** When nothing can be scheduled (nobody playing, no clear ground), look again after this long. */
const RETRY = 5;

export interface CombatDirectorView {
  now: number;
  active: readonly CombatEventDescriptor[];
  /** Humans who are alive and playing; events are aimed around them. */
  humans: readonly CombatPlane[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  avoid?: readonly CombatPlane[];
}
export type CombatDirective = Pick<CombatEventDescriptor, 'kind' | 'seed' | 'target' | 'heading' | 'intensity'>;

export function createCombatDirector(options: { risk: CombatRisk; seed: number; table?: readonly CombatDirectorEntry[] }) {
  const pace = COMBAT_PACE[options.risk], table = (options.table ?? COMBAT_TABLES[options.risk]).filter(e => getCombatEvent(e.kind) && e.weight > 0);
  const random = combatRandom(options.seed);
  const between = ([low, high]: readonly [number, number]) => low + random() * (high - low);
  const lastFired = new Map<string, number>();
  let next = between(pace.first);

  function aim(kind: string, view: CombatDirectorView): CombatDirective | null {
    const margin = 8, { bounds } = view, targeting = getCombatEvent(kind)?.targeting;
    const hunts = targeting?.policy === 'player', range = hunts ? COMBAT_PLAYER_OFFSET : targeting?.range ?? COMBAT_TARGET_RANGE;
    for (let attempt = 0; attempt < 12; attempt++) {
      const around = view.humans[Math.floor(random() * view.humans.length)];
      const bearing = random() * Math.PI * 2, reach = between(range);
      const target = { x: around.x + Math.cos(bearing) * reach, z: around.z + Math.sin(bearing) * reach };
      if (target.x < bounds.minX + margin || target.x > bounds.maxX - margin || target.z < bounds.minZ + margin || target.z > bounds.maxZ - margin) continue;
      const directive: CombatDirective = { kind, seed: Math.floor(random() * 0xffffffff) >>> 0, target, heading: random() * Math.PI * 2, intensity: pace.intensity };
      // A hunter's warning is its approach; what it fires is aimed live, so there is nothing to bracket.
      if (hunts) return directive;
      if (view.avoid?.some(p => Math.hypot(p.x - target.x, p.z - target.z) < COMBAT_SPAWN_CLEAR)) continue;
      // Check the actual rounds and clouds, not just the aim point: dispersion reaches well past it.
      const probe = { ...directive, id: 'probe', start: view.now };
      const close = combatTimeline(probe).some(p => view.humans.some(h =>
        p.type === 'munition' ? !!p.blast && Math.hypot(h.x - p.impact.x, h.z - p.impact.z) < COMBAT_BRACKET
          : p.type === 'cloud' && p.dps > 0 && Math.hypot(h.x - p.center.x, h.z - p.center.z) < p.radius + 3));
      if (!close) return directive;
    }
    return null;
  }

  return {
    /** Seconds until the director next tries; for diagnostics and tests. */
    get next() { return next; },
    step(view: CombatDirectorView): CombatDirective | null {
      if (!table.length || view.now < next) return null;
      // One hazard at a time: the next one is timed from when the last finishes landing.
      // News (a reinforcement truck, a supply drop, a blackout) does not hold fire control up.
      if (view.active.some(e => getCombatEvent(e.kind)?.hazard && ['warning', 'active'].includes(combatPhase(e, view.now)))) { next = view.now + RETRY; return null; }
      const ready = table.filter(e => view.now - (lastFired.get(e.kind) ?? -Infinity) >= e.cooldown);
      if (!ready.length || !view.humans.length) { next = view.now + RETRY; return null; }
      let pick = random() * ready.reduce((sum, e) => sum + e.weight, 0), entry = ready[0];
      for (const candidate of ready) { pick -= candidate.weight; if (pick <= 0) { entry = candidate; break; } }
      const directive = aim(entry.kind, view);
      if (!directive) { next = view.now + RETRY; return null; }
      lastFired.set(entry.kind, view.now); next = view.now + between(pace.gap);
      return directive;
    },
    /** The host could not place what it was handed (no perch, no pit): forget it and look again soon. */
    refused(directive: CombatDirective, now: number) { lastFired.delete(directive.kind); next = now + RETRY; },
    reset() { lastFired.clear(); next = between(pace.first); },
  };
}
export type CombatDirector = ReturnType<typeof createCombatDirector>;

/** Reinforcements are dropped at least this far from every human, and preferably no further than the second figure. */
export const TRANSPORT_DROP_RANGE = [45, 120] as const;
/** A truck needs at least this much clear street to drive in on. */
export const MIN_LAND_REACH = 40;
export interface TransportPlanView {
  drops: readonly CombatPlane[];
  humans: readonly CombatPlane[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** How far a truck can drive from `from` along unit `direction` before something stops it, up to `limit`. */
  clearRun(from: CombatPlane, direction: CombatPlane, limit: number): number;
  /** Whether a helicopter can hover over `at` with nothing overhead. */
  openSky(at: CombatPlane): boolean;
}
export type TransportPlan = Pick<CombatEventDescriptor, 'kind' | 'target' | 'heading' | 'reach'>;
/** Distance from `from` to the edge of `bounds` along unit `direction`. */
export function edgeDistance(from: CombatPlane, direction: CombatPlane, bounds: TransportPlanView['bounds']) {
  const along = (p: number, d: number, low: number, high: number) => d > 1e-9 ? (high - p) / d : d < -1e-9 ? (low - p) / d : Infinity;
  return Math.max(0, Math.min(along(from.x, direction.x, bounds.minX, bounds.maxX), along(from.z, direction.z, bounds.minZ, bounds.maxZ)));
}
/**
 * Where reinforcements arrive and how. Drops are spawn points kept well away
 * from the players but close enough that the arrival can be seen; the ride is
 * a truck when a clear street leads in, a helicopter when the sky is open, and
 * a coin toss when both are.
 */
export function planTransport(view: TransportPlanView, random: () => number, only?: 'land' | 'air'): TransportPlan | null {
  const nearest = (p: CombatPlane) => Math.min(Infinity, ...view.humans.map(h => Math.hypot(h.x - p.x, h.z - p.z)));
  const [near, far] = TRANSPORT_DROP_RANGE;
  const clear = view.drops.filter(p => nearest(p) >= near);
  if (!clear.length) return null;
  const visible = clear.filter(p => nearest(p) <= far), pool = visible.length ? visible : clear;
  // A few candidates in random order; the first that some transport can reach wins.
  const order = [...pool].sort(() => random() - .5).slice(0, 6);
  for (const drop of order) {
    let land: TransportPlan | null = null;
    const start = random() * Math.PI * 2;
    for (let i = 0; i < (only === 'air' ? 0 : 16); i++) {
      const bearing = start + i * Math.PI / 8, back = { x: Math.sin(bearing), z: Math.cos(bearing) };
      const reach = view.clearRun(drop, back, Math.min(240, edgeDistance(drop, back, view.bounds)));
      // Travel runs opposite `back`: heading h moves along (-sin h, -cos h).
      if (reach >= MIN_LAND_REACH && (!land || reach > land.reach!)) land = { kind: 'transport-land', target: { ...drop }, heading: Math.atan2(back.x, back.z), reach: Math.floor(reach) };
    }
    const sky = only !== 'land' && view.openSky(drop);
    if (land && (!sky || random() < .5)) return land;
    if (sky) {
      const heading = random() * Math.PI * 2, back = { x: Math.sin(heading), z: Math.cos(heading) };
      return { kind: 'transport-air', target: { ...drop }, heading, reach: Math.floor(Math.max(60, Math.min(240, edgeDistance(drop, back, view.bounds) + 40))) };
    }
  }
  return null;
}
