import type { ArenaActor } from './arena-rules';
import type { StreakMode } from './match-streaks';

/**
 * What a match pays for besides the elimination itself. A kill is one award
 * made of several of these; support and objective play earn the rest.
 */
export const SCORE_EVENTS = {
  kill: { label: 'Elimination', points: 100 },
  'streak-kill': { label: 'Streak elimination', points: 50 },
  headshot: { label: 'Headshot', points: 25 },
  longshot: { label: 'Longshot', points: 25 },
  'point-blank': { label: 'Point blank', points: 25 },
  'first-blood': { label: 'First blood', points: 50 },
  revenge: { label: 'Revenge', points: 25 },
  avenger: { label: 'Avenger', points: 25 },
  savior: { label: 'Savior', points: 25 },
  buzzkill: { label: 'Buzzkill', points: 25 },
  shutdown: { label: 'Shutdown', points: 50 },
  comeback: { label: 'Comeback', points: 25 },
  survivor: { label: 'Survivor', points: 25 },
  double: { label: 'Double kill', points: 25 },
  triple: { label: 'Triple kill', points: 50 },
  fury: { label: 'Fury kill', points: 75 },
  bloodthirsty: { label: 'Bloodthirsty', points: 50 },
  merciless: { label: 'Merciless', points: 100 },
  defend: { label: 'Zone defence', points: 25 },
  assault: { label: 'Zone assault', points: 25 },
  hold: { label: 'Zone held', points: 50 },
  assist: { label: 'Assist', points: 75 },
  'recon-assist': { label: 'Recon assist', points: 20 },
  destroy: { label: 'Equipment destroyed', points: 50 },
  intercept: { label: 'Interception', points: 15 },
} as const;
export type ScoreKind = keyof typeof SCORE_EVENTS;
export const isScoreKind = (kind: unknown): kind is ScoreKind => typeof kind === 'string' && Object.hasOwn(SCORE_EVENTS, kind);

export const SCORE_RULES = {
  /** Damage counts toward an assist for this long after it lands. */
  assistSeconds: 10,
  assistMin: 20,
  longshotMetres: 40,
  pointBlankMetres: 3,
  /** Kills this close together chain into a double, triple and fury. */
  multikillSeconds: 4,
  avengerSeconds: 4,
  saviorSeconds: 2,
  survivorHealth: 25,
  comebackDeaths: 3,
  shutdownKills: 5,
  /** Seconds of uncontested hold behind each "Zone held" award. */
  holdSeconds: 5,
  /** How long an award stays in the snapshot for the HUD to show. */
  popupSeconds: 4,
  maxPopups: 48,
} as const;

/** An assist is worth the share of a full health bar the helper took off, never less than the floor. */
export const assistPoints = (damage: number) => Math.max(SCORE_RULES.assistMin, Math.min(SCORE_EVENTS.assist.points, Math.round(damage * .75 / 5) * 5));

export type ScorePart = [kind: ScoreKind, points: number];
export interface ScorePopup { id: number; actor: string; at: number; parts: ScorePart[] }
export interface ScoreLine { score: number; assists: number }
export interface ScoreSnapshot { players: Record<string, ScoreLine>; events: ScorePopup[] }
export const popupTotal = (popup: ScorePopup) => popup.parts.reduce((sum, [, points]) => sum + points, 0);

export interface ScoreKill {
  now: number;
  /** A streak reward did it: a flat award that chains nothing. */
  fromStreak?: boolean;
  headshot?: boolean;
  /** Metres the round flew; absent when no gun round did it. */
  range?: number;
  /** Hardpoint: the killer stood in the active zone, or the victim did. */
  objective?: 'defend' | 'assault';
  /** The victim was within one kill of a streak reward. */
  buzzkill?: boolean;
  /** Owners of recon scans that had the victim marked. */
  spotters?: readonly string[];
}
interface Hooks {
  actors: () => readonly ArenaActor[];
  enemy: (a: ArenaActor, b: ArenaActor) => boolean;
  /** Score that also charges streak rewards. The base kill, zone kills and hold time are charged by the streaks themselves. */
  charge?: (id: string, amount: number) => void;
}
interface Line extends ScoreLine {
  lifeKills: number; chain: number; lastKillAt: number; deathsSinceKill: number; lastKiller?: string;
  /** Who they last killed, and who they last hurt, for avenger and savior. */
  killed?: { id: string; at: number }; hit?: { id: string; at: number };
  held: number;
}

export function createMatchScore(mode: StreakMode, hooks: Hooks) {
  const players = new Map<string, Line>(), popups: ScorePopup[] = [];
  /** victim -> attacker -> damage since the victim last died. */
  const ledger = new Map<string, Map<string, { damage: number; at: number }>>();
  let serial = 0, firstBlood = false;
  const state = (id: string) => {
    let p = players.get(id);
    if (!p) { p = { score: 0, assists: 0, lifeKills: 0, chain: 0, lastKillAt: -Infinity, deathsSinceKill: 0, held: 0 }; players.set(id, p); }
    return p;
  };
  const actor = (id: string) => hooks.actors().find(a => a.id === id);
  const teammates = (a: ArenaActor, b: ArenaActor | undefined) => !!b && mode !== 'free-for-all' && a.id !== b.id && !hooks.enemy(a, b);
  function award(id: string, now: number, parts: ScorePart[], charge = 0) {
    if (!parts.length) return;
    state(id).score += parts.reduce((sum, [, points]) => sum + points, 0);
    popups.push({ id: ++serial, actor: id, at: now, parts });
    if (popups.length > SCORE_RULES.maxPopups) popups.shift();
    if (charge > 0) hooks.charge?.(id, charge);
  }
  const part = (kind: ScoreKind): ScorePart => [kind, SCORE_EVENTS[kind].points];
  function endLife(id: string) {
    const p = state(id); p.lifeKills = p.chain = 0; p.lastKillAt = -Infinity; p.deathsSinceKill++; p.hit = undefined;
    ledger.delete(id);
  }
  return {
    state: (id: string): ScoreLine => ({ score: state(id).score, assists: state(id).assists }),
    /** Health and armour an enemy took off, remembered for assists. */
    damage(attacker: ArenaActor, victim: ArenaActor, amount: number, now: number) {
      if (!(amount > 0) || !hooks.enemy(attacker, victim)) return;
      state(attacker.id).hit = { id: victim.id, at: now };
      let hits = ledger.get(victim.id); if (!hits) ledger.set(victim.id, hits = new Map());
      const entry = hits.get(attacker.id);
      hits.set(attacker.id, { damage: (entry && now - entry.at <= SCORE_RULES.assistSeconds ? entry.damage : 0) + amount, at: now });
    },
    kill(killer: ArenaActor, victim: ArenaActor, context: ScoreKill) {
      const { now } = context;
      if (!hooks.enemy(killer, victim)) { endLife(victim.id); return; }
      const k = state(killer.id), v = state(victim.id);
      if (context.fromStreak) award(killer.id, now, [part('streak-kill')]);
      else {
        const parts: ScorePart[] = [part('kill')], add = (kind: ScoreKind, when: unknown) => { if (when) parts.push(part(kind)); };
        add('headshot', context.headshot);
        add('longshot', context.range !== undefined && context.range >= SCORE_RULES.longshotMetres);
        add('point-blank', context.range !== undefined && context.range <= SCORE_RULES.pointBlankMetres);
        add('first-blood', !firstBlood);
        add('revenge', k.lastKiller === victim.id);
        add('avenger', v.killed && now - v.killed.at <= SCORE_RULES.avengerSeconds && teammates(killer, actor(v.killed.id)));
        const saved = v.hit && now - v.hit.at <= SCORE_RULES.saviorSeconds ? actor(v.hit.id) : undefined;
        add('savior', saved?.alive && teammates(killer, saved));
        add('buzzkill', context.buzzkill);
        add('shutdown', v.lifeKills >= SCORE_RULES.shutdownKills);
        add('comeback', k.deathsSinceKill >= SCORE_RULES.comebackDeaths);
        add('survivor', killer.alive && killer.health > 0 && killer.health <= SCORE_RULES.survivorHealth);
        k.chain = now - k.lastKillAt <= SCORE_RULES.multikillSeconds ? k.chain + 1 : 1; k.lastKillAt = now;
        add(k.chain === 2 ? 'double' : k.chain === 3 ? 'triple' : 'fury', k.chain >= 2);
        k.lifeKills++;
        add('bloodthirsty', k.lifeKills === 5); add('merciless', k.lifeKills === 10);
        if (context.objective) parts.push(part(context.objective));
        firstBlood = true; k.deathsSinceKill = 0; k.killed = { id: victim.id, at: now };
        if (k.lastKiller === victim.id) k.lastKiller = undefined;
        // The streaks already charge the kill and the zone bonus themselves.
        award(killer.id, now, parts, parts.reduce((sum, [kind, points]) => kind === 'kill' || kind === 'defend' || kind === 'assault' ? sum : sum + points, 0));
      }
      const helped = new Set<string>();
      for (const [id, hit] of ledger.get(victim.id) ?? []) {
        const helper = actor(id);
        if (id === killer.id || !helper || now - hit.at > SCORE_RULES.assistSeconds || !hooks.enemy(helper, victim)) continue;
        const points = assistPoints(hit.damage); helped.add(id); state(id).assists++;
        award(id, now, [['assist', points]], points);
      }
      for (const id of new Set(context.spotters ?? [])) {
        const spotter = actor(id);
        if (id === killer.id || helped.has(id) || !spotter || !teammates(killer, spotter)) continue;
        state(id).assists++; award(id, now, [part('recon-assist')], SCORE_EVENTS['recon-assist'].points);
      }
      v.lastKiller = killer.id; endLife(victim.id);
    },
    /** A death nobody is paid for: a fall, their own grenade, the sea. */
    death(id: string) { endLife(id); },
    /** Uncontested seconds in the active zone, paid in whole steps. */
    hold(id: string, seconds: number, now: number) {
      if (mode !== 'hardpoint' || !(seconds > 0)) return;
      const p = state(id); p.held += seconds;
      while (p.held >= SCORE_RULES.holdSeconds) { p.held -= SCORE_RULES.holdSeconds; award(id, now, [part('hold')]); }
    },
    destroy(id: string, now: number) { award(id, now, [part('destroy')], SCORE_EVENTS.destroy.points); },
    intercept(id: string, now: number) { award(id, now, [part('intercept')], SCORE_EVENTS.intercept.points); },
    removePlayer(id: string) {
      players.delete(id); ledger.delete(id);
      for (const hits of ledger.values()) hits.delete(id);
      for (let i = popups.length - 1; i >= 0; i--) if (popups[i].actor === id) popups.splice(i, 1);
    },
    reset() { players.clear(); ledger.clear(); popups.length = 0; firstBlood = false; },
    snapshot(now: number): ScoreSnapshot {
      while (popups.length && now - popups[0].at > SCORE_RULES.popupSeconds) popups.shift();
      return { players: Object.fromEntries(hooks.actors().map(a => [a.id, { score: state(a.id).score, assists: state(a.id).assists }])),
        events: popups.map(p => ({ ...p, parts: p.parts.map(([kind, points]) => [kind, points] as ScorePart) })) };
    },
  };
}
export type MatchScore = ReturnType<typeof createMatchScore>;

/** Validate bounded network data before a guest renders it. */
export function validScoreSnapshot(value: unknown, actors: readonly ArenaActor[], now: number): value is ScoreSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as ScoreSnapshot, ids = new Set(actors.map(a => a.id));
  const whole = (n: unknown, max: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;
  if (!s.players || typeof s.players !== 'object' || Object.keys(s.players).length !== ids.size || Object.keys(s.players).some(id => !ids.has(id))) return false;
  if (Object.values(s.players).some(p => !p || !whole(p.score, 1e6) || !whole(p.assists, 1e4))) return false;
  if (!Array.isArray(s.events) || s.events.length > SCORE_RULES.maxPopups || new Set(s.events.map(e => e?.id)).size !== s.events.length) return false;
  return s.events.every(e => e && whole(e.id, 1e9) && e.id > 0 && ids.has(e.actor) && typeof e.at === 'number' && Number.isFinite(e.at) && e.at >= 0 && e.at <= now + .001
    && Array.isArray(e.parts) && e.parts.length >= 1 && e.parts.length <= 12
    && e.parts.every(p => Array.isArray(p) && p.length === 2 && isScoreKind(p[0]) && whole(p[1], SCORE_EVENTS[p[0]].points) && p[1] > 0));
}
