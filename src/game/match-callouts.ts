/**
 * Encik as match announcer for Team Deathmatch, Free-for-all and Hardpoint,
 * including killstreaks. He speaks to the whole section here, so the lines are
 * gruff but never aimed at the player, and they read the same at every rank
 * register (the personal kill/death/respawn calls still follow the register).
 *
 * Wording lives in match-callout-lines.ts, which is recorded.
 */
import { ARENA_DURATION, ARENA_KILL_LIMIT, type ArenaActor, type ArenaSnapshot } from './arena-rules';
import { TDM_RULES, TEAM_NAMES, type ArenaTeam } from './arena-match';
import { HARDPOINT_RULES, SMITH_CONTROL_SITES } from './hardpoint';
import { STREAKS, type StreakId } from './match-streaks';
import { MATCH_LINES, type MatchCallEvent } from './match-callout-lines';

export { MATCH_LINES, type MatchCallEvent };
export type MatchMode = 'tdm' | 'ffa' | 'hardpoint';

const PRIORITY: Partial<Record<MatchCallEvent, number>> = {
  'win': 10, 'loss': 10, 'draw': 10, 'ffa-win': 10, 'ffa-podium': 10, 'ffa-loss': 10,
  'tdm-start': 8, 'ffa-start': 8, 'hp-start': 8, 'streak-enemy-strike': 8, 'streak-enemy-hunter': 8,
  'hp-lost': 7, 'near-loss': 7,
  'hp-online': 6, 'one-minute': 6, 'near-win': 6, 'hp-next-market': 6, 'hp-next-east': 6, 'hp-next-south': 6,
  'team-lead': 4, 'ffa-lead': 4, 'streak-killed': 4,
};
/** Above Encik's own kill chatter (2–5), so the match picture cuts through a firefight. */
export const matchCallPriority = (event: MatchCallEvent) =>
  PRIORITY[event] ?? (event.startsWith('streak-ready') ? 6 : 5);
/** Seconds before the same event may be said again; flip-flopping leads and points stay quiet. */
const COOLDOWN: Partial<Record<MatchCallEvent, number>> = {
  'team-lead': 20, 'team-behind': 20, 'ffa-lead': 20, 'ffa-lead-lost': 20,
  'hp-captured': 10, 'hp-lost': 10, 'hp-contested': 15, 'streak-killed': 8, 'streak-destroyed': 8,
};
const matchCooldown = (event: MatchCallEvent) => COOLDOWN[event] ?? (event.startsWith('streak-enemy') ? 10 : 0);

export function matchMode(snapshot: Pick<ArenaSnapshot, 'hardpoint' | 'teamDeathmatch' | 'streaks'> | null | undefined): MatchMode | null {
  if (!snapshot) return null;
  return snapshot.hardpoint ? 'hardpoint' : snapshot.teamDeathmatch ? 'tdm' : snapshot.streaks ? 'ffa' : null;
}
export const matchStartEvent = (mode: MatchMode): MatchCallEvent => mode === 'tdm' ? 'tdm-start' : mode === 'ffa' ? 'ffa-start' : 'hp-start';

const MATCH_DURATION: Record<MatchMode, number> = { tdm: TDM_RULES.duration, ffa: ARENA_DURATION, hardpoint: HARDPOINT_RULES.duration };
const MATCH_LIMIT: Record<MatchMode, number> = { tdm: TDM_RULES.scoreLimit, ffa: ARENA_KILL_LIMIT, hardpoint: HARDPOINT_RULES.scoreLimit };
/** How close to the limit counts as "nearly there": a few kills, or 25 seconds of control. */
const NEAR: Record<MatchMode, number> = { tdm: 5, ffa: 3, hardpoint: 25 };
const DESTRUCTIBLE = new Set<StreakId>(['recon', 'jammer', 'interceptor', 'sentry']);
const SITE_IDS = new Set(SMITH_CONTROL_SITES.map(site => site.id));
const other = (team: ArenaTeam): ArenaTeam => team === 'alpha' ? 'bravo' : 'alpha';
/** Same order the host ranks a free-for-all by. */
const ranked = (actors: readonly ArenaActor[]) => [...actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

/** The final call for a finished match, from the listener's side. */
export function matchResultEvent(snapshot: ArenaSnapshot, selfId: string): MatchCallEvent | null {
  const mode = matchMode(snapshot), self = snapshot.actors.find(a => a.id === selfId);
  if (!mode || !self || !snapshot.finished) return null;
  if (snapshot.winner === 'Draw') return 'draw';
  if (mode === 'ffa') {
    const place = ranked(snapshot.actors).findIndex(a => a.id === selfId);
    return place === 0 ? 'ffa-win' : place >= 0 && place < 3 ? 'ffa-podium' : 'ffa-loss';
  }
  if (!self.team) return null;
  return snapshot.winner === TEAM_NAMES[self.team] ? 'win' : 'loss';
}

type Lead = 'us' | 'them' | 'tied';
/**
 * Turns successive snapshots into announcer events for one listener. It works
 * the same on host and guests because it reads only the snapshot: scores, the
 * hardpoint state and the streak snapshot.
 */
export function createMatchAnnouncer() {
  let tick = -1, finished = false, lead: Lead = 'tied', oneMinute = false, nearWin = false, nearLoss = false;
  let hpActive: string | null = null, hpNext: string | null = null, hpOwner: ArenaTeam | null = null, hpContested = false;
  let ready = new Set<StreakId>(), effects = new Map<string, NonNullable<ArenaSnapshot['streaks']>['effects'][number]>();
  let primed = false;
  function reset() {
    tick = -1; finished = false; lead = 'tied'; oneMinute = nearWin = nearLoss = false;
    hpActive = hpNext = null; hpOwner = null; hpContested = false; ready = new Set(); effects = new Map(); primed = false;
  }
  return {
    reset,
    /** Events this snapshot raises for `selfId`, most important first. Results are left to the caller. */
    update(snapshot: ArenaSnapshot | null | undefined, selfId: string | undefined): MatchCallEvent[] {
      const mode = matchMode(snapshot);
      if (!snapshot || !mode || !selfId) return [];
      // A rematch restarts the tick and elapsed clock.
      if (snapshot.tick < tick || finished && !snapshot.finished) reset();
      tick = snapshot.tick;
      const self = snapshot.actors.find(a => a.id === selfId);
      if (!self || (mode !== 'ffa' && !self.team)) return [];
      const out: MatchCallEvent[] = [];
      const say = (event: MatchCallEvent) => { if (primed) out.push(event); };
      if (snapshot.finished) { finished = true; return []; }

      // Score race: who leads, and whether anyone is about to hit the limit.
      let ours: number, theirs: number;
      if (mode === 'ffa') {
        ours = self.kills; theirs = Math.max(0, ...snapshot.actors.filter(a => a.id !== selfId).map(a => a.kills));
      } else {
        const scores = mode === 'tdm' ? snapshot.teamDeathmatch!.scores : snapshot.hardpoint!.scores;
        ours = scores[self.team!]; theirs = scores[other(self.team!)];
      }
      const now: Lead = ours > theirs ? 'us' : theirs > ours ? 'them' : 'tied';
      if (now !== lead) {
        if (now === 'us') say(mode === 'ffa' ? 'ffa-lead' : 'team-lead');
        else if (now === 'them' && (mode !== 'ffa' || lead === 'us')) say(mode === 'ffa' ? 'ffa-lead-lost' : 'team-behind');
        lead = now;
      }
      const limit = MATCH_LIMIT[mode];
      if (!nearWin && ours >= limit - NEAR[mode]) { nearWin = true; say('near-win'); }
      if (!nearLoss && theirs >= limit - NEAR[mode] && theirs > ours) { nearLoss = true; say('near-loss'); }
      if (!oneMinute && MATCH_DURATION[mode] - snapshot.elapsed <= 60) { oneMinute = true; say('one-minute'); }

      const hp = snapshot.hardpoint;
      if (hp && self.team) {
        if (hpActive !== null && hp.active !== hpActive) say('hp-online');
        if (hp.next && hp.next !== hpNext && SITE_IDS.has(hp.next)) say(`hp-next-${hp.next}` as MatchCallEvent);
        if (hp.active === hpActive) {
          if (hp.owner !== hpOwner && hp.owner === self.team) say('hp-captured');
          else if (hp.owner !== hpOwner && hp.owner) say('hp-lost');
          else if (hp.contested && !hpContested) say('hp-contested');
        }
        hpActive = hp.active; hpNext = hp.next; hpOwner = hp.owner; hpContested = hp.contested;
      }

      const streaks = snapshot.streaks;
      if (streaks) {
        const mine = new Set(streaks.players[selfId]?.ready ?? []);
        for (const id of mine) if (!ready.has(id)) say(`streak-ready-${id}` as MatchCallEvent);
        ready = mine;
        const owners = new Map(snapshot.actors.map(a => [a.id, a]));
        const hostile = (owner: string) => owner !== selfId && (mode === 'ffa' || owners.get(owner)?.team !== self.team);
        const current = new Map(streaks.effects.map(e => [e.id, e]));
        for (const effect of streaks.effects) if (!effects.has(effect.id)) {
          if (effect.owner === selfId) say(`streak-up-${effect.kind}` as MatchCallEvent);
          else if (owners.has(effect.owner) && hostile(effect.owner)) say(`streak-enemy-${effect.kind}` as MatchCallEvent);
        }
        // Gone early, after taking damage, while its owner is still here: shot down.
        for (const [id, was] of effects) if (!current.has(id) && DESTRUCTIBLE.has(was.kind) && owners.has(was.owner)
          && was.health < STREAKS[was.kind].health && was.until - snapshot.elapsed > .5 && (was.kind !== 'interceptor' || was.remaining > 1)) {
          if (was.owner === selfId) say('streak-destroyed');
          else if (hostile(was.owner)) say('streak-killed');
        }
        effects = current;
      }
      // The first snapshot only records where things stand; nothing has changed yet.
      primed = true;
      return out.sort((a, b) => matchCallPriority(b) - matchCallPriority(a));
    },
  };
}

/**
 * Holds announcer events briefly so two at once both get said, one after the
 * other, instead of the second being lost. Stale ones lapse.
 */
export function createMatchCallQueue(say: (event: MatchCallEvent, now: number) => boolean, hold = 10) {
  let pending: { event: MatchCallEvent; at: number }[] = [];
  const said = new Map<MatchCallEvent, number>();
  return {
    push(events: readonly MatchCallEvent[], now: number) {
      for (const event of events) {
        if (now - (said.get(event) ?? -Infinity) < matchCooldown(event)) continue;
        pending = pending.filter(p => p.event !== event); pending.push({ event, at: now });
      }
    },
    step(now: number) {
      pending = pending.filter(p => now - p.at <= hold);
      pending.sort((a, b) => matchCallPriority(b.event) - matchCallPriority(a.event) || a.at - b.at);
      const next = pending[0];
      if (next && say(next.event, now)) { pending.shift(); said.set(next.event, now); }
    },
    clear() { pending = []; said.clear(); },
  };
}
