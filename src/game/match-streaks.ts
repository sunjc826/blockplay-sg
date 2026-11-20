import type { ArenaActor, ArenaPoint } from './arena-rules';
import { hostile } from './arena-factions';

export type StreakMode = 'team-deathmatch' | 'free-for-all' | 'hardpoint';
/** Cheapest first: the locker lists them in this order. */
export const STREAKS = {
  recon: { name: 'Kestrel Recon', cost: 300, seconds: 15, health: 40, description: 'Shootable drone. Last-known enemy positions pulse every 3s. 10s in FFA.' },
  jammer: { name: 'Signal Jammer', cost: 400, seconds: 15, health: 70, description: 'Blocks enemy recon within 20m. Objective markers remain visible.' },
  interceptor: { name: 'Guardian Interceptor', cost: 400, seconds: 20, health: 60, description: 'Intercepts three enemy thrown grenades within 6m and line of sight.' },
  supply: { name: 'Supply Drop', cost: 450, seconds: 30, health: 0, description: 'Mark ground within 8m. A crate lands after 3s. The first operator to reach it, friend or enemy, gets one of their other rewards ready.' },
  hunter: { name: 'Hunter Drone', cost: 500, seconds: 30, health: 30, description: 'Launch along your aim. Autonomously searches, locks and dives at enemies.' },
  strike: { name: 'Precision Strike', cost: 600, seconds: 3, health: 0, description: 'Designate up to 250m away. 8m blast radius with a powerful 4m core after a 3s warning. Solid roofs protect.' },
  sentry: { name: 'Sentry Turret', cost: 700, seconds: 18, health: 100, description: 'Fixed 90° arc, 25m reach. Smoke and cover break targeting.' },
  blackout: { name: 'Blackout', cost: 750, seconds: 12, health: 0, description: 'Knocks out every enemy reward in the field. For 12s the enemy has no recon picture and cannot deploy rewards.' },
  barrage: { name: 'Rolling Barrage', cost: 800, seconds: 6, health: 0, description: 'Designate up to 250m away. After a 3s warning five shells walk 28m along your line of aim. Solid roofs protect.' },
  gunship: { name: 'Warden Gunship', cost: 900, seconds: 25, health: 150, description: 'Armed drone hovers above you where it is called and fires on enemies in the open within 40m. Can be shot down. Needs open sky.' },
} as const;
/** No reward costs more, so no charge is worth keeping past it. */
export const STREAK_MAX_CHARGE = 900;
export const SUPPLY_DROP = { landing: 3, reach: 2 } as const;
export const BARRAGE = { warning: 3, shells: 5, interval: .6, spacing: 7, radius: 6, coreRadius: 3, damage: 200, edgeDamage: 50 } as const;
export const GUNSHIP = { range: 40, damage: 14, hover: 16, minimumSky: 8 } as const;
/** Where each shell of a barrage lands: from the marked point, away from the caller along their aim. */
export const barragePoints = (effect: { x: number; y: number; z: number; yaw: number }): ArenaPoint[] =>
  Array.from({ length: BARRAGE.shells }, (_, i) => ({ x: effect.x - Math.sin(effect.yaw) * BARRAGE.spacing * i, y: effect.y, z: effect.z - Math.cos(effect.yaw) * BARRAGE.spacing * i }));
export function barrageDamage(distance: number) {
  const { radius, coreRadius, damage, edgeDamage } = BARRAGE;
  if (!Number.isFinite(distance) || distance < 0 || distance > radius) return 0;
  return damage - (damage - edgeDamage) * Math.max(0, distance - coreRadius) / (radius - coreRadius);
}
export type StreakId = keyof typeof STREAKS;
export const streakAvailable = (id: StreakId, mode: StreakMode) => mode !== 'free-for-all' || id !== 'interceptor' && id !== 'sentry' && id !== 'gunship';
export const defaultStreaks = (mode: StreakMode): StreakId[] => mode === 'hardpoint' ? ['recon', 'interceptor', 'strike'] : ['recon', 'hunter', 'strike'];
export const isStreakId = (id: unknown): id is StreakId => typeof id === 'string' && Object.hasOwn(STREAKS, id);
const STREAK_IDS = Object.keys(STREAKS) as StreakId[];
/** Cheapest first, so the slot keys read in the order the rewards arrive. */
export const orderStreaks = (ids: readonly StreakId[]): StreakId[] => [...ids].sort((a, b) => STREAKS[a].cost - STREAKS[b].cost || STREAK_IDS.indexOf(a) - STREAK_IDS.indexOf(b));
/** Three different rewards the mode allows, drawn evenly: what a bot carries into a match. */
export function randomStreaks(mode: StreakMode, random: () => number): StreakId[] {
  const pool = STREAK_IDS.filter(id => streakAvailable(id, mode)), drawn: StreakId[] = [];
  while (drawn.length < 3) drawn.push(...pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1));
  return orderStreaks(drawn);
}
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
  /** One shell of a barrage lands. */
  shell?: (effect: StreakEffect, at: ArenaPoint) => void;
  drone: (owner: ArenaActor, effect: StreakEffect) => string | null;
  droneAlive: (event: string) => boolean;
  removeDrone: (event: string) => void;
  notice: (text: string) => void;
  /** Draws each bot's loadout. Without it bots carry the mode's default. */
  random?: () => number;
  /** An enemy broke a deployed reward, or an interceptor stopped a grenade: both are scored. */
  destroyed?: (attacker: ArenaActor, effect: StreakEffect) => void;
  intercepted?: (owner: string) => void;
}
export function createMatchStreaks(mode: StreakMode, hooks: Hooks) {
  const players = new Map<string, StreakProgress>(), effects: StreakEffect[] = [];
  const targeting = new Map<string, { victim: string; since: number; next: number }>();
  // Host-only life stamps prevent an old ping identifying a respawned actor.
  const reconLives = new Map<string, Map<string, number>>();
  let serial = 0;
  const state = (id: string) => {
    let p = players.get(id);
    if (!p) {
      const bot = hooks.random && hooks.actors().some(a => a.id === id && a.bot);
      p = { loadout: bot ? randomStreaks(mode, hooks.random!) : defaultStreaks(mode), charge: 0, heldCharge: 0, ready: [], earned: [] }; players.set(id, p);
    }
    return p;
  };
  function award(id: string, amount: number) {
    const p = state(id); p.charge = Math.min(STREAK_MAX_CHARGE, p.charge + amount);
    for (const reward of p.loadout) if (p.charge + 1e-6 >= STREAKS[reward].cost && !p.earned.includes(reward)) {
      p.earned.push(reward);
      if (!p.ready.includes(reward)) { p.ready.push(reward); hooks.notice(`${hooks.actors().find(a => a.id === id)?.name ?? 'Operator'} earned ${STREAKS[reward].name}`); }
    }
  }
  function remove(effect: StreakEffect) {
    reconLives.delete(effect.id);
    if (effect.event) hooks.removeDrone(effect.event);
    targeting.delete(effect.id); const index = effects.indexOf(effect); if (index >= 0) effects.splice(index, 1);
  }
  function sameSide(a: ArenaActor, b: ArenaActor) { return a.id === b.id || mode !== 'free-for-all' && !hostile(a, b); }
  function enemy(a: ArenaActor, b: ArenaActor) { return a.id !== b.id && (mode === 'free-for-all' || hostile(a, b)); }
  function jammed(actor: ArenaActor) {
    return blackedOut(actor) || effects.some(e => e.kind === 'jammer' && e.health > 0 && Math.hypot(e.x - actor.x, e.z - actor.z) <= 20 && hooks.actors().some(a => a.id === e.owner && enemy(a, actor)));
  }
  /** An enemy Blackout is running: no recon picture and no deploying, wherever they stand. */
  function blackedOut(actor: ArenaActor) {
    return effects.some(e => e.kind === 'blackout' && hooks.actors().some(a => a.id === e.owner && enemy(a, actor)));
  }
  /** A crate gives whoever reaches it one of their other rewards they do not already hold ready. */
  function collect(effect: StreakEffect, actor: ArenaActor) {
    const p = state(actor.id), open = p.loadout.filter(id => id !== 'supply' && !p.ready.includes(id));
    if (!open.length) return false;
    const reward = open[Math.min(open.length - 1, Math.floor((hooks.random?.() ?? .999) * open.length))];
    p.ready.push(reward); hooks.notice(`${actor.name} opened a Supply Drop: ${STREAKS[reward].name}`); remove(effect);
    return true;
  }
  return {
    mode, state, effects, enemy, jammed, blackedOut,
    /** Shared scan positions, never live coordinates. FFA intel belongs only to its caller. */
    reconContacts(viewer: ArenaActor, now: number): (StreakContact & { at: number })[] {
      if (!viewer.alive || jammed(viewer)) return [];
      const actors = hooks.actors(), contacts = new Map<string, StreakContact & { at: number }>();
      for (const effect of effects) {
        const owner = actors.find(a => a.id === effect.owner);
        if (effect.kind !== 'recon' || effect.health <= 0 || effect.until <= now || effect.pulse <= now || !owner || !sameSide(viewer, owner)) continue;
        for (const contact of effect.contacts) {
          const target = actors.find(a => a.id === contact.id);
          if (target?.alive && enemy(viewer, target) && !hooks.protected(target) && reconLives.get(effect.id)?.get(target.id) === target.deaths) contacts.set(contact.id, { ...contact, at: effect.pulse - 3 });
        }
      }
      return [...contacts.values()];
    },
    configure(id: string, loadout: unknown) {
      if (!validStreakLoadout(loadout, mode)) return false;
      const p = state(id); if (p.charge || p.earned.length || p.ready.length) return false;
      p.loadout = [...loadout]; return true;
    },
    kill(killer: ArenaActor, victim: ArenaActor, objective: boolean, fromStreak: boolean) {
      if (!fromStreak && enemy(killer, victim)) award(killer.id, 100 + (mode === 'hardpoint' && objective ? 25 : 0));
    },
    /** Score beyond the kill itself (assists, headshots, medals) charges rewards too. */
    bonus(id: string, amount: number) { if (amount > 0) award(id, amount); },
    hold(id: string, seconds: number) {
      if (mode !== 'hardpoint') return;
      const p = state(id), amount = Math.min(Math.max(0, seconds) * 10, 200 - p.heldCharge);
      p.heldCharge = Math.min(200, p.heldCharge + amount); award(id, amount);
    },
    death(id: string) { const p = state(id); p.charge = p.heldCharge = 0; p.earned = []; },
    activate(owner: ArenaActor, kind: StreakId, at: ArenaPoint, now: number) {
      const p = state(owner.id);
      if (!owner.alive || !p.loadout.includes(kind) || !p.ready.includes(kind) || effects.length >= 48 || blackedOut(owner) || effects.some(e => e.kind === kind && hooks.actors().some(a => a.id === e.owner && sameSide(a, owner)))) return false;
      const spec = STREAKS[kind];
      const effect: StreakEffect = { ...at, id: `streak-${++serial}`, kind, owner: owner.id, yaw: owner.yaw, start: now,
        until: now + (kind === 'recon' && mode === 'free-for-all' ? 10 : kind === 'barrage' ? BARRAGE.warning + (BARRAGE.shells - 1) * BARRAGE.interval + .5 : spec.seconds), health: spec.health, contacts: [], pulse: now, remaining: kind === 'interceptor' ? 3 : 0, shots: 0 };
      if (kind === 'hunter') { const event = hooks.drone(owner, effect); if (!event) return false; effect.event = event; }
      effects.push(effect); p.ready = p.ready.filter(id => id !== kind);
      hooks.notice(`${owner.name} deployed ${spec.name}`);
      // Ordnance already falling and crates on the ground are not electronics; everything else of theirs goes dark.
      if (kind === 'blackout') for (const other of [...effects]) {
        const theirs = hooks.actors().find(a => a.id === other.owner);
        if (theirs && enemy(owner, theirs) && !['strike', 'barrage', 'supply', 'blackout'].includes(other.kind)) { remove(other); hooks.destroyed?.(owner, other); }
      }
      return true;
    },
    hurt(effect: StreakEffect, damage: number, attacker: ArenaActor) {
      const owner = hooks.actors().find(a => a.id === effect.owner);
      if (!owner || !enemy(attacker, owner) || effect.kind === 'hunter' || effect.health <= 0) return 0;
      const taken = Math.min(effect.health, Math.max(0, damage)); effect.health -= taken;
      if (!effect.health) { hooks.notice(`${attacker.name} destroyed ${STREAKS[effect.kind].name}`); remove(effect); hooks.destroyed?.(attacker, effect); }
      return taken;
    },
    intercept(caller: string, point: ArenaPoint) {
      const attacker = hooks.actors().find(a => a.id === caller); if (!attacker) return false;
      const device = effects.find(e => e.kind === 'interceptor' && e.remaining > 0 && Math.hypot(e.x - point.x, e.y - point.y, e.z - point.z) <= 6 && hooks.clear(e, point) && hooks.actors().some(a => a.id === e.owner && enemy(a, attacker)));
      if (!device) return false;
      device.remaining--; device.shots++; device.aim = { ...point }; hooks.intercepted?.(device.owner);
      if (!device.remaining) remove(device);
      return true;
    },
    step(now: number) {
      const actors = hooks.actors();
      for (const effect of [...effects]) {
        const owner = actors.find(a => a.id === effect.owner);
        if (!owner) { remove(effect); continue; }
        if (effect.kind === 'barrage') {
          const points = barragePoints(effect);
          while (effect.shots < BARRAGE.shells && now >= effect.start + BARRAGE.warning + effect.shots * BARRAGE.interval) hooks.shell?.(effect, points[effect.shots++]);
        }
        if (now >= effect.until) { if (effect.kind === 'strike') hooks.strike(effect); remove(effect); continue; }
        if (effect.kind === 'supply' && now >= effect.start + SUPPLY_DROP.landing) {
          const taker = actors.filter(a => a.alive && !hooks.protected(a) && Math.hypot(a.x - effect.x, a.z - effect.z) <= SUPPLY_DROP.reach && Math.abs(a.y - effect.y) <= 3)
            .sort((a, b) => Math.hypot(a.x - effect.x, a.z - effect.z) - Math.hypot(b.x - effect.x, b.z - effect.z)).find(a => collect(effect, a));
          if (taker) continue;
        }
        if (effect.event && !hooks.droneAlive(effect.event)) { remove(effect); continue; }
        if (effect.kind === 'recon' && now >= effect.pulse) {
          effect.pulse = now + 3;
          effect.contacts = actors.filter(a => a.alive && enemy(owner, a) && !hooks.protected(a) && !effects.some(j => j.kind === 'jammer' && actors.some(other => other.id === j.owner && enemy(owner, other)) && Math.hypot(j.x - a.x, j.z - a.z) <= 20)).map(a => ({ id: a.id, x: a.x, z: a.z }));
          reconLives.set(effect.id, new Map(effect.contacts.map(c => [c.id, actors.find(a => a.id === c.id)!.deaths])));
        }
        if (effect.kind !== 'sentry' && effect.kind !== 'gunship') continue;
        // The turret watches a fixed arc from the ground; the gunship sees all round from above, so only a roof or a wall hides from it.
        const turret = effect.kind === 'sentry', reach = turret ? 25 : GUNSHIP.range;
        const candidates = actors.filter(a => a.alive && enemy(owner, a) && !hooks.protected(a) && Math.hypot(a.x - effect.x, a.z - effect.z) <= reach && hooks.clear(effect, a)
          && (!turret || (-Math.sin(effect.yaw) * (a.x - effect.x) - Math.cos(effect.yaw) * (a.z - effect.z)) / Math.max(.001, Math.hypot(a.x - effect.x, a.z - effect.z)) >= Math.SQRT1_2));
        let lock = targeting.get(effect.id), target = candidates.find(a => a.id === lock?.victim);
        if (!target) { target = candidates.sort((a, b) => Math.hypot(a.x - effect.x, a.z - effect.z) - Math.hypot(b.x - effect.x, b.z - effect.z))[0]; lock = target ? { victim: target.id, since: now, next: now + .75 } : undefined; }
        if (!target || !lock) { targeting.delete(effect.id); delete effect.aim; continue; }
        targeting.set(effect.id, lock); effect.aim = { x: target.x, y: target.y - .4, z: target.z };
        if (!turret) effect.yaw = Math.atan2(effect.x - target.x, effect.z - target.z);
        if (now >= lock.next) { effect.shots++; hooks.damage(effect, target, turret ? 18 : GUNSHIP.damage); lock.next = now + (effect.shots % 3 ? .16 : .65); }
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
  for (const p of Object.values(s.players)) if (!p || !validStreakLoadout(p.loadout, mode) || !finite(p.charge) || p.charge < 0 || p.charge > STREAK_MAX_CHARGE || !finite(p.heldCharge) || p.heldCharge < 0 || p.heldCharge > 200 || (mode !== 'hardpoint' && p.heldCharge !== 0)
    || ![p.ready, p.earned].every(list => Array.isArray(list) && list.length <= 3 && new Set(list).size === list.length && list.every(id => p.loadout.includes(id)))) return false;
  return new Set(s.effects.map(e => e?.id)).size === s.effects.length && s.effects.every(e => e && typeof e.id === 'string' && /^streak-\d+$/.test(e.id) && ids.has(e.owner) && isStreakId(e.kind) && streakAvailable(e.kind, mode) && point(e) && finite(e.yaw)
    && finite(e.start) && e.start >= 0 && e.start <= now && finite(e.until) && e.until >= now && e.until - e.start <= STREAKS[e.kind].seconds + .001
    && finite(e.health) && e.health >= 0 && e.health <= STREAKS[e.kind].health && finite(e.pulse) && e.pulse >= 0 && e.pulse <= now + 3.001
    && Number.isInteger(e.remaining) && e.remaining >= 0 && e.remaining <= 3 && Number.isInteger(e.shots) && e.shots >= 0 && e.shots <= 200
    && (e.kind === 'hunter' ? typeof e.event === 'string' && /^event-\d+$/.test(e.event) : e.event === undefined)
    && (!e.aim || point(e.aim)) && Array.isArray(e.contacts) && e.contacts.length <= actors.length && e.contacts.every(c => c && ids.has(c.id) && finite(c.x) && finite(c.z) && Math.abs(c.x) <= 5000 && Math.abs(c.z) <= 5000) && new Set(e.contacts.map(c => c.id)).size === e.contacts.length);
}
