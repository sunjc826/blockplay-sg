/** Host-owned grenade flight and deterministic effect timelines; no rendering dependencies. */
import { itemById } from './armory-catalog';
import { combatRandom, type CombatPayload, type CombatVector, type BlastSpec } from './combat-events';
import { grenadeBlast, grenadeDangerRadius, type GrenadeEffect } from './grenade-catalog';
import { launchGrenade, predictGrenadeLanding, stepGrenadeFlight, type GrenadeFlight, type GrenadeTrace } from './grenade-flight';
import type { GrenadeCondition } from './grenade-effects';
export const MAX_GRENADES = 24, MAX_GRENADE_EVENTS = 48;
export interface ThrowGrenade { id: string; origin: CombatVector; direction: CombatVector; under: boolean; cooked: number }
export interface LiveGrenade extends GrenadeFlight { serial: number; id: string; caller: string; landing: CombatVector }
export interface GrenadeEvent { serial: number; id: string; caller: string; point: CombatVector; heading: number; start: number; seed: number }
export type DamageCause = { kind: 'grenade'; caller: string; item: string } | { kind: 'event'; name: string };
export interface GrenadeBurst { cause: Extract<DamageCause, { kind: 'grenade' }>; point: CombatVector; blast?: BlastSpec; shred: number; conditions: GrenadeCondition[]; radius?: number; facing?: boolean; caller: string; id: string }
export interface GrenadeArea { event: GrenadeEvent; effect: GrenadeEffect; point: CombatVector }
export const finiteGrenadePoint = (p: unknown): p is CombatVector => !!p && typeof p === 'object' && ['x', 'y', 'z'].every(k => typeof (p as Record<string, unknown>)[k] === 'number' && Number.isFinite((p as Record<string, number>)[k]) && Math.abs((p as Record<string, number>)[k]) <= 6000);
export function validThrowGrenade(v: unknown): v is ThrowGrenade {
  if (!v || typeof v !== 'object') return false;
  const t = v as ThrowGrenade, spec = itemById(t.id)?.grenade;
  return !!spec && finiteGrenadePoint(t.origin) && finiteGrenadePoint(t.direction) && Math.abs(Math.hypot(t.direction.x, t.direction.y, t.direction.z) - 1) < .05 && typeof t.under === 'boolean' && Number.isFinite(t.cooked) && t.cooked >= 0 && t.cooked <= spec.fuse;
}
export function validLiveGrenade(v: unknown): v is LiveGrenade {
  const g = v as LiveGrenade;
  return !!g && !!itemById(g.id)?.grenade && Number.isSafeInteger(g.serial) && g.serial > 0 && typeof g.caller === 'string' && g.caller.length <= 100 &&
    finiteGrenadePoint(g.position) && finiteGrenadePoint(g.velocity) && Math.hypot(g.velocity.x, g.velocity.y, g.velocity.z) <= 100 && finiteGrenadePoint(g.landing) &&
    [g.age, g.remaining, g.restTime].every(n => Number.isFinite(n) && n >= 0 && n <= 16) && typeof g.rested === 'boolean' && typeof g.launched === 'boolean';
}
export function validGrenadeEvent(v: unknown, now: number): v is GrenadeEvent {
  const e = v as GrenadeEvent;
  return !!e && !!itemById(e.id)?.grenade && Number.isSafeInteger(e.serial) && e.serial > 0 && typeof e.caller === 'string' && e.caller.length <= 100 && finiteGrenadePoint(e.point) &&
    Number.isFinite(e.start) && e.start >= 0 && e.start <= now && now - e.start <= 70 && Number.isFinite(e.heading) && Number.isInteger(e.seed) && e.seed >= 0 && e.seed <= 0xffffffff;
}
/** Existing combat vocabulary, also used to draw warning rings, smoke and spotter reveals. */
export function grenadePayloads(event: GrenadeEvent): CombatPayload[] {
  const spec = itemById(event.id)?.grenade; if (!spec) return [];
  const payloads: CombatPayload[] = []; let id = 0;
  for (const e of spec.effects) {
    if (e.kind === 'cloud') payloads.push({ type: 'cloud', id: id++, center: event.point, radius: e.radius, from: 0, until: e.seconds, colour: e.colour, dps: e.dps });
    if (e.kind === 'repel') payloads.push({ type: 'marker', id: id++, center: event.point, radius: e.radius, from: 0, until: e.seconds, colour: '#cb9b51' });
    if (e.kind === 'reveal') payloads.push({ type: 'reveal', id: id++, center: event.point, radius: e.radius, from: 0, until: e.seconds, caller: event.caller });
    if (e.kind === 'mission') {
      payloads.push({ type: 'marker', id: id++, center: event.point, radius: e.spread + 6, from: 0, until: e.delay + e.count, colour: '#e75444' });
      const random = combatRandom(event.seed);
      for (let i = 0; i < e.count; i++) { const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * e.spread;
        payloads.push({ type: 'munition', id: id++, kind: 'mortar', impact: { x: event.point.x + Math.cos(angle) * r, z: event.point.z + Math.sin(angle) * r }, time: e.delay + i, flight: 2, descent: { x: 0, y: -1, z: 0 }, blast: grenadeBlast(110, 6), caller: event.caller }); }
    }
  }
  return payloads;
}
function duration(event: GrenadeEvent) {
  return Math.max(1, ...grenadePops(event).map(p => p.time + .5), ...itemById(event.id)!.grenade!.effects.map(e => 'seconds' in e ? e.seconds ?? 1 : e.kind === 'mission' ? e.delay + e.count + 1 : 1));
}
export function grenadePops(event: GrenadeEvent): { time: number; point: CombatVector; blast: BlastSpec; shred: number; pop: boolean }[] {
  const spec = itemById(event.id)!.grenade!, random = combatRandom(event.seed), result = [];
  for (const e of spec.effects) {
    if (e.kind === 'blast') result.push({ time: 0, point: event.point, blast: e.blast, shred: e.shred ?? 0, pop: false });
    if (e.kind === 'bomblets') for (let i = 0; i < e.count; i++) {
      const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * e.spread, along = (i / (e.count - 1) - .5) * e.spread;
      // Oranges fall from the split, rather than exploding harmlessly overhead.
      const delay = e.line ? i / (e.count - 1) * (e.seconds ?? 4) : Math.sqrt(Math.max(0, event.point.y) * 2 / 9.8);
      result.push({ time: delay, point: { x: event.point.x + (e.line ? Math.sin(event.heading) * along : Math.cos(angle) * r), y: e.line ? event.point.y : .15, z: event.point.z + (e.line ? Math.cos(event.heading) * along : Math.sin(angle) * r) }, blast: grenadeBlast(e.damage, e.radius), shred: 0, pop: true });
    }
  }
  for (const p of grenadePayloads(event)) if (p.type === 'munition' && p.blast) result.push({ time: p.time, point: { ...p.impact, y: event.point.y }, blast: p.blast, shred: 0, pop: false });
  return result;
}
export function createGrenadeSystem(trace: GrenadeTrace, burst: (burst: GrenadeBurst) => void) {
  const live: LiveGrenade[] = [], events: GrenadeEvent[] = [], resolved = new Map<number, Set<number>>(); let serial = 0, clock = 0;
  function throwGrenade(caller: string, input: ThrowGrenade) {
    if (!validThrowGrenade(input) || live.length >= MAX_GRENADES) return false;
    const spec = itemById(input.id)!.grenade!, flight = launchGrenade(input.origin, input.direction, spec, input.under, input.cooked);
    const g: LiveGrenade = { ...flight, serial: ++serial, id: input.id, caller, landing: predictGrenadeLanding(flight, spec, trace) };
    live.push(g); return true;
  }
  function step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    clock += dt;
    for (let i = live.length - 1; i >= 0; i--) {
      const g = live[i], spec = itemById(g.id)!.grenade!;
      if (!stepGrenadeFlight(g, spec, dt, trace)) continue;
      const point = { ...g.position };
      if (g.launched) point.y -= 60; // Ember footprint stays at the launch site.
      const event = { serial: g.serial, id: g.id, caller: g.caller, point, heading: Math.atan2(g.velocity.x, g.velocity.z), start: clock, seed: (g.serial * 2654435761) >>> 0 };
      if (events.length >= MAX_GRENADE_EVENTS) resolved.delete(events.shift()!.serial);
      events.push(event); live.splice(i, 1);
    }
    for (const event of events) {
      const done = resolved.get(event.serial) ?? new Set<number>(); resolved.set(event.serial, done);
      const spec = itemById(event.id)!.grenade!, age = clock - event.start;
      for (const [i, pop] of grenadePops(event).entries()) if (!done.has(i) && age >= pop.time) {
        done.add(i); const conditions = spec.effects.filter((e): e is Extract<GrenadeEffect, { kind: 'condition' }> => e.kind === 'condition' && !e.lingering && (pop.pop || e.condition !== 'dazed'));
        burst({ ...pop, cause: { kind: 'grenade', caller: event.caller, item: event.id }, caller: event.caller, id: event.id, conditions: conditions.filter(e => e.condition === 'dazed').map(e => ({ kind: e.condition, strength: e.strength, seconds: e.seconds })) });
      }
      if (!done.has(-1)) {
        done.add(-1);
        for (const e of spec.effects) if (e.kind === 'condition' && !e.lingering && !(event.id === 'grenade-firecrackers' && e.condition === 'dazed'))
          burst({ cause: { kind: 'grenade', caller: event.caller, item: event.id }, point: event.point, shred: 0, caller: event.caller, id: event.id, conditions: [{ kind: e.condition, strength: e.strength, seconds: e.seconds }], radius: e.radius, facing: e.facing });
      }
    }
    for (let i = events.length - 1; i >= 0; i--) if (clock - events[i].start > duration(events[i]) + 1) { resolved.delete(events[i].serial); events.splice(i, 1); }
  }
  function areas(): GrenadeArea[] { return events.flatMap(event => itemById(event.id)!.grenade!.effects.flatMap<GrenadeArea>(effect => {
    const seconds = 'seconds' in effect ? effect.seconds : 0;
    if ((effect.kind === 'cloud' || effect.kind === 'repel' || effect.kind === 'reveal') && clock - event.start <= seconds!) return [{ event, effect, point: event.point }];
    if (effect.kind === 'condition' && effect.lingering && clock - event.start <= (event.id === 'grenade-durian' ? 40 : 35)) return [{ event, effect, point: event.point }];
    if (effect.kind === 'rally' && clock - event.start < .3) return [{ event, effect, point: event.point }];
    return [];
  })); }
  function dangers() { return [
    ...live.map(g => ({ point: g.landing, radius: grenadeDangerRadius(itemById(g.id)!.grenade!) + 2 })),
    ...events.flatMap(e => grenadePayloads(e).flatMap(p => p.type === 'marker' && clock - e.start <= p.until ? [{ point: { ...p.center, y: e.point.y }, radius: p.radius }] : [])),
  ]; }
  return { throwGrenade, step, areas, dangers, removeCaller(caller: string) {
    for (let i = live.length - 1; i >= 0; i--) if (live[i].caller === caller) live.splice(i, 1);
    for (let i = events.length - 1; i >= 0; i--) if (events[i].caller === caller) { resolved.delete(events[i].serial); events.splice(i, 1); }
  }, get live() { return live; }, get events() { return events; }, get clock() { return clock; },
    reset() { live.length = events.length = 0; resolved.clear(); clock = 0; } };
}

/** Dense clouds block each sight segment, including a pilot's public sensor. */
export function grenadeSmokeBetween(events: readonly GrenadeEvent[], now: number, a: CombatVector, b: CombatVector) {
  return events.some(event => itemById(event.id)?.grenade?.effects.some(e => {
    if (e.kind !== 'cloud' || e.blocksSight === false || now < event.start || now - event.start > e.seconds) return false;
    const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((event.point.x - a.x) * dx + (event.point.z - a.z) * dz) / length)) : 0;
    const y = a.y + (b.y - a.y) * t;
    return y >= event.point.y - .5 && y <= event.point.y + 6 && Math.hypot(a.x + dx * t - event.point.x, a.z + dz * t - event.point.z) <= e.radius;
  }));
}
