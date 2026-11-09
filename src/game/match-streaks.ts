import type { ArenaActor, ArenaPoint } from './arena-rules';
import { hostile } from './arena-factions';

export type StreakMode = 'team-deathmatch' | 'free-for-all' | 'hardpoint';
export const STREAKS = {
  recon: { name: 'Kestrel Recon', cost: 300, seconds: 15, health: 40, description: 'Shootable drone. Last-known enemy positions pulse every 3s. 10s in FFA.' },
  jammer: { name: 'Signal Jammer', cost: 400, seconds: 15, health: 70, description: 'Blocks enemy recon within 20m. Objective markers remain visible.' },
  interceptor: { name: 'Guardian Interceptor', cost: 400, seconds: 20, health: 60, description: 'Intercepts three enemy thrown grenades within 6m and line of sight.' },
  hunter: { name: 'Hunter Drone', cost: 500, seconds: 30, health: 30, description: 'Launch along your aim. Autonomously searches, locks and dives at enemies.' },
  strike: { name: 'Precision Strike', cost: 600, seconds: 3, health: 0, description: 'One blast in a 5m zone after a 3s warning. Solid roofs protect.' },
  sentry: { name: 'Sentry Turret', cost: 700, seconds: 18, health: 100, description: 'Fixed 90° arc, 25m reach. Smoke and cover break targeting.' },
} as const;
export type StreakId = keyof typeof STREAKS;
export const streakAvailable = (id: StreakId, mode: StreakMode) => mode !== 'free-for-all' || id !== 'interceptor' && id !== 'sentry';
export const defaultStreaks = (mode: StreakMode): StreakId[] => mode === 'hardpoint' ? ['recon', 'interceptor', 'strike'] : ['recon', 'hunter', 'strike'];
export const isStreakId = (id: unknown): id is StreakId => typeof id === 'string' && Object.hasOwn(STREAKS, id);
export function validStreakLoadout(value: unknown, mode: StreakMode): value is StreakId[] {
  return Array.isArray(value) && value.length === 3 && new Set(value).size === 3 && value.every(id => isStreakId(id) && streakAvailable(id, mode));
}
export interface StreakProgress { loadout: StreakId[]; charge: number; heldCharge: number; ready: StreakId[]; earned: StreakId[] }
export interface StreakContact { id: string; x: number; z: number }
export interface StreakEffect extends ArenaPoint {
  id: string; kind: StreakId; owner: string; start: number; until: number; yaw: number; health: number;
  event?: string; contacts: StreakContact[]; pulse: number; remaining: number; shots: number; aim?: ArenaPoint;
}
export interface StreakSnapshot { players: Record<string, StreakProgress>; effects: StreakEffect[] }
interface Hooks {
  actors: () => readonly ArenaActor[];
  protected: (actor: ArenaActor) => boolean;
  clear: (from: ArenaPoint, to: ArenaPoint) => boolean;
  damage: (effect: StreakEffect, victim: ArenaActor, damage: number) => void;
  strike: (effect: StreakEffect) => void;
  drone: (owner: ArenaActor, effect: StreakEffect) => string | null;
  droneAlive: (event: string) => boolean;
  removeDrone: (event: string) => void;
  notice: (text: string) => void;
}
export function createMatchStreaks(mode: StreakMode, hooks: Hooks) {
  const players = new Map<string, StreakProgress>(), effects: StreakEffect[] = [];
  const targeting = new Map<string, { victim: string; since: number; next: number }>();
  let serial = 0;
  const state = (id: string) => {
    let p = players.get(id);
    if (!p) { p = { loadout: defaultStreaks(mode), charge: 0, heldCharge: 0, ready: [], earned: [] }; players.set(id, p); }
    return p;
  };
  function award(id: string, amount: number) {
    const p = state(id); p.charge = Math.min(700, p.charge + amount);
    for (const reward of p.loadout) if (p.charge + 1e-6 >= STREAKS[reward].cost && !p.earned.includes(reward)) {
      p.earned.push(reward);
      if (!p.ready.includes(reward)) { p.ready.push(reward); hooks.notice(`${hooks.actors().find(a => a.id === id)?.name ?? 'Operator'} earned ${STREAKS[reward].name}`); }
    }
  }
  function remove(effect: StreakEffect) {
    if (effect.event) hooks.removeDrone(effect.event);
    targeting.delete(effect.id); const index = effects.indexOf(effect); if (index >= 0) effects.splice(index, 1);
  }
  function sameSide(a: ArenaActor, b: ArenaActor) { return a.id === b.id || mode !== 'free-for-all' && !hostile(a, b); }
  function enemy(a: ArenaActor, b: ArenaActor) { return a.id !== b.id && (mode === 'free-for-all' || hostile(a, b)); }
  function jammed(actor: ArenaActor) {
    return effects.some(e => e.kind === 'jammer' && e.health > 0 && Math.hypot(e.x - actor.x, e.z - actor.z) <= 20 && hooks.actors().some(a => a.id === e.owner && enemy(a, actor)));
  }
  return {
    mode, state, effects, enemy, jammed,
    configure(id: string, loadout: unknown) {
      if (!validStreakLoadout(loadout, mode)) return false;
      const p = state(id); if (p.charge || p.earned.length || p.ready.length) return false;
      p.loadout = [...loadout]; return true;
    },
    kill(killer: ArenaActor, victim: ArenaActor, objective: boolean, fromStreak: boolean) {
      if (!fromStreak && enemy(killer, victim)) award(killer.id, 100 + (mode === 'hardpoint' && objective ? 25 : 0));
    },
    hold(id: string, seconds: number) {
      if (mode !== 'hardpoint') return;
      const p = state(id), amount = Math.min(Math.max(0, seconds) * 10, 200 - p.heldCharge);
      p.heldCharge = Math.min(200, p.heldCharge + amount); award(id, amount);
    },
    death(id: string) { const p = state(id); p.charge = p.heldCharge = 0; p.earned = []; },
    activate(owner: ArenaActor, kind: StreakId, at: ArenaPoint, now: number) {
      const p = state(owner.id);
      if (!owner.alive || !p.loadout.includes(kind) || !p.ready.includes(kind) || effects.length >= 48 || effects.some(e => e.kind === kind && hooks.actors().some(a => a.id === e.owner && sameSide(a, owner)))) return false;
      const spec = STREAKS[kind];
      const effect: StreakEffect = { ...at, id: `streak-${++serial}`, kind, owner: owner.id, yaw: owner.yaw, start: now,
        until: now + (kind === 'recon' && mode === 'free-for-all' ? 10 : spec.seconds), health: spec.health, contacts: [], pulse: now, remaining: kind === 'interceptor' ? 3 : 0, shots: 0 };
      if (kind === 'hunter') { const event = hooks.drone(owner, effect); if (!event) return false; effect.event = event; }
      effects.push(effect); p.ready = p.ready.filter(id => id !== kind);
      hooks.notice(`${owner.name} deployed ${spec.name}`); return true;
    },
    hurt(effect: StreakEffect, damage: number, attacker: ArenaActor) {
      const owner = hooks.actors().find(a => a.id === effect.owner);
      if (!owner || !enemy(attacker, owner) || effect.kind === 'hunter' || effect.health <= 0) return 0;
      const taken = Math.min(effect.health, Math.max(0, damage)); effect.health -= taken;
      if (!effect.health) { hooks.notice(`${attacker.name} destroyed ${STREAKS[effect.kind].name}`); remove(effect); }
      return taken;
    },
    intercept(caller: string, point: ArenaPoint) {
      const attacker = hooks.actors().find(a => a.id === caller); if (!attacker) return false;
      const device = effects.find(e => e.kind === 'interceptor' && e.remaining > 0 && Math.hypot(e.x - point.x, e.y - point.y, e.z - point.z) <= 6 && hooks.clear(e, point) && hooks.actors().some(a => a.id === e.owner && enemy(a, attacker)));
      if (!device) return false;
      device.remaining--; device.shots++; device.aim = { ...point };
      if (!device.remaining) remove(device);
      return true;
    },
    step(now: number) {
      const actors = hooks.actors();
      for (const effect of [...effects]) {
        const owner = actors.find(a => a.id === effect.owner);
        if (!owner) { remove(effect); continue; }
        if (now >= effect.until) { if (effect.kind === 'strike') hooks.strike(effect); remove(effect); continue; }
        if (effect.event && !hooks.droneAlive(effect.event)) { remove(effect); continue; }
        if (effect.kind === 'recon' && now >= effect.pulse) {
          effect.pulse = now + 3;
          effect.contacts = actors.filter(a => a.alive && enemy(owner, a) && !hooks.protected(a) && !effects.some(j => j.kind === 'jammer' && actors.some(other => other.id === j.owner && enemy(owner, other)) && Math.hypot(j.x - a.x, j.z - a.z) <= 20)).map(a => ({ id: a.id, x: a.x, z: a.z }));
        }
        if (effect.kind !== 'sentry') continue;
        const candidates = actors.filter(a => a.alive && enemy(owner, a) && !hooks.protected(a) && Math.hypot(a.x - effect.x, a.z - effect.z) <= 25 && hooks.clear(effect, a)
          && (-Math.sin(effect.yaw) * (a.x - effect.x) - Math.cos(effect.yaw) * (a.z - effect.z)) / Math.max(.001, Math.hypot(a.x - effect.x, a.z - effect.z)) >= Math.SQRT1_2);
        let lock = targeting.get(effect.id), target = candidates.find(a => a.id === lock?.victim);
        if (!target) { target = candidates.sort((a, b) => Math.hypot(a.x - effect.x, a.z - effect.z) - Math.hypot(b.x - effect.x, b.z - effect.z))[0]; lock = target ? { victim: target.id, since: now, next: now + .75 } : undefined; }
        if (!target || !lock) { targeting.delete(effect.id); delete effect.aim; continue; }
        targeting.set(effect.id, lock); effect.aim = { x: target.x, y: target.y - .4, z: target.z };
        if (now >= lock.next) { effect.shots++; hooks.damage(effect, target, 18); lock.next = now + (effect.shots % 3 ? .16 : .65); }
      }
    },
    removePlayer(id: string) { players.delete(id); for (const e of effects) e.contacts = e.contacts.filter(c => c.id !== id); for (const e of [...effects]) if (e.owner === id) remove(e); },
    clearEffects() { for (const e of [...effects]) remove(e); },
    reset() { for (const e of [...effects]) remove(e); for (const p of players.values()) { p.charge = p.heldCharge = 0; p.ready = []; p.earned = []; } },
    snapshot(): StreakSnapshot {
      return structuredClone({ players: Object.fromEntries(hooks.actors().map(a => [a.id, state(a.id)])), effects });
    },
  };
}

/** Validate bounded network data before a guest renders or uses it. */
export function validStreakSnapshot(value: unknown, actors: readonly ArenaActor[], mode: StreakMode, now: number): value is StreakSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as StreakSnapshot;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const point = (p: ArenaPoint) => p && [p.x, p.y, p.z].every(finite) && Math.abs(p.x) <= 5000 && Math.abs(p.z) <= 5000 && p.y >= -50 && p.y <= 400;
  const ids = new Set(actors.map(a => a.id));
  if (!s.players || typeof s.players !== 'object' || Object.keys(s.players).length !== ids.size || Object.keys(s.players).some(id => !ids.has(id)) || !Array.isArray(s.effects) || s.effects.length > 48) return false;
  for (const p of Object.values(s.players)) if (!p || !validStreakLoadout(p.loadout, mode) || !finite(p.charge) || p.charge < 0 || p.charge > 700 || !finite(p.heldCharge) || p.heldCharge < 0 || p.heldCharge > 200 || (mode !== 'hardpoint' && p.heldCharge !== 0)
    || ![p.ready, p.earned].every(list => Array.isArray(list) && list.length <= 3 && new Set(list).size === list.length && list.every(id => p.loadout.includes(id)))) return false;
  return new Set(s.effects.map(e => e?.id)).size === s.effects.length && s.effects.every(e => e && typeof e.id === 'string' && /^streak-\d+$/.test(e.id) && ids.has(e.owner) && isStreakId(e.kind) && streakAvailable(e.kind, mode) && point(e) && finite(e.yaw)
    && finite(e.start) && e.start >= 0 && e.start <= now && finite(e.until) && e.until >= now && e.until - e.start <= STREAKS[e.kind].seconds + .001
    && finite(e.health) && e.health >= 0 && e.health <= STREAKS[e.kind].health && finite(e.pulse) && e.pulse >= 0 && e.pulse <= now + 3.001
    && Number.isInteger(e.remaining) && e.remaining >= 0 && e.remaining <= 3 && Number.isInteger(e.shots) && e.shots >= 0 && e.shots <= 200
    && (e.kind === 'hunter' ? typeof e.event === 'string' && /^event-\d+$/.test(e.event) : e.event === undefined)
    && (!e.aim || point(e.aim)) && Array.isArray(e.contacts) && e.contacts.length <= actors.length && e.contacts.every(c => c && ids.has(c.id) && finite(c.x) && finite(c.z) && Math.abs(c.x) <= 5000 && Math.abs(c.z) <= 5000) && new Set(e.contacts.map(c => c.id)).size === e.contacts.length);
}
