import { describe, expect, it } from 'vitest';
import { ARENA_DURATION, ARENA_KILL_LIMIT, type ArenaActor, type ArenaSnapshot } from './arena-rules';
import { TDM_RULES } from './arena-match';
import { HARDPOINT_RULES, SMITH_CONTROL_SITES, type HardpointSnapshot } from './hardpoint';
import { STREAKS, type StreakEffect, type StreakId } from './match-streaks';
import { createMatchAnnouncer, createMatchCallQueue, MATCH_LINES, matchCallPriority, matchMode, matchResultEvent, type MatchCallEvent } from './match-callouts';
import { createEncikRadio } from './fps-callouts';

const actor = (id: string, extra: Partial<ArenaActor> = {}) => ({ id, name: id, kills: 0, deaths: 0, alive: true, ...extra }) as ArenaActor;
const streakPlayers = (actors: ArenaActor[], ready: Record<string, StreakId[]> = {}) =>
  Object.fromEntries(actors.map(a => [a.id, { loadout: ['recon', 'hunter', 'strike'], charge: 0, heldCharge: 0, ready: ready[a.id] ?? [], earned: [] }]));
const effect = (id: string, kind: StreakId, owner: string, extra: Partial<StreakEffect> = {}): StreakEffect =>
  ({ id, kind, owner, x: 0, y: 0, z: 0, start: 0, until: 100, yaw: 0, health: STREAKS[kind].health, contacts: [], pulse: 0, remaining: kind === 'interceptor' ? 3 : 0, shots: 0, ...extra });
function tdm(tick: number, scores: { alpha: number; bravo: number }, opts: { elapsed?: number; actors?: ArenaActor[]; effects?: StreakEffect[]; ready?: Record<string, StreakId[]>; finished?: boolean; winner?: string } = {}) {
  const actors = opts.actors ?? [actor('me', { team: 'alpha' }), actor('mate', { team: 'alpha' }), actor('foe', { team: 'bravo' })];
  return { type: 'arena-snapshot', tick, elapsed: opts.elapsed ?? tick, actors, feed: [], finished: !!opts.finished, winner: opts.winner ?? '',
    teamDeathmatch: { area: 'smith-street', scores }, streaks: { players: streakPlayers(actors, opts.ready), effects: opts.effects ?? [] } } as unknown as ArenaSnapshot;
}
function hardpoint(tick: number, hp: Partial<HardpointSnapshot>, scores = { alpha: 0, bravo: 0 }) {
  const actors = [actor('me', { team: 'alpha' }), actor('foe', { team: 'bravo' })];
  return { type: 'arena-snapshot', tick, elapsed: tick, actors, feed: [], finished: false, winner: '',
    hardpoint: { area: 'smith-street', active: 'market', next: null, remaining: 60, owner: null, contested: false, occupants: { alpha: 0, bravo: 0 }, scores, ...hp },
    streaks: { players: streakPlayers(actors), effects: [] } } as unknown as ArenaSnapshot;
}

describe('match announcer lines', () => {
  it('covers every streak, every control site and the rules the lines quote', () => {
    for (const id of Object.keys(STREAKS)) for (const kind of ['ready', 'up', 'enemy']) expect(MATCH_LINES[`streak-${kind}-${id}` as MatchCallEvent]?.length).toBeGreaterThanOrEqual(2);
    for (const site of SMITH_CONTROL_SITES) expect(MATCH_LINES[`hp-next-${site.id}` as MatchCallEvent]?.length).toBeGreaterThanOrEqual(2);
    // Recorded wording quotes these numbers: changing a rule means re-recording the line.
    expect([TDM_RULES.scoreLimit, TDM_RULES.duration, ARENA_KILL_LIMIT, STREAKS.strike.seconds]).toEqual([30, 300, 15, 3]);
    expect(MATCH_LINES['tdm-start'][0]).toContain('Thirty kills or five minutes');
    expect(MATCH_LINES['ffa-start'][0]).toContain('Fifteen kills');
    for (const site of SMITH_CONTROL_SITES) expect(MATCH_LINES[`hp-next-${site.id}` as MatchCallEvent].join(' ')).toContain(site.name.replace(/^./, c => c.toUpperCase()));
    const all = Object.values(MATCH_LINES).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const line of all) { expect(line).not.toContain('{rank}'); expect(line.length).toBeLessThan(80); }
  });
  it('ranks results above starts above routine score talk', () => {
    expect(matchCallPriority('win')).toBeGreaterThan(matchCallPriority('tdm-start'));
    expect(matchCallPriority('streak-enemy-strike')).toBeGreaterThan(matchCallPriority('hp-captured'));
    expect(matchCallPriority('hp-captured')).toBeGreaterThan(matchCallPriority('team-lead'));
  });
});

describe('createMatchAnnouncer', () => {
  it('stays quiet outside a match and on the first snapshot it sees', () => {
    const a = createMatchAnnouncer();
    expect(matchMode({} as ArenaSnapshot)).toBeNull();
    expect(a.update({ ...tdm(1, { alpha: 0, bravo: 0 }), teamDeathmatch: undefined, streaks: undefined } as ArenaSnapshot, 'me')).toEqual([]);
    expect(a.update(tdm(1, { alpha: 3, bravo: 0 }), 'me')).toEqual([]);
  });
  it('calls lead changes, the last minute and the run-in once each', () => {
    const a = createMatchAnnouncer();
    a.update(tdm(1, { alpha: 0, bravo: 0 }), 'me');
    expect(a.update(tdm(2, { alpha: 0, bravo: 1 }), 'me')).toEqual(['team-behind']);
    expect(a.update(tdm(3, { alpha: 2, bravo: 1 }), 'me')).toEqual(['team-lead']);
    expect(a.update(tdm(4, { alpha: 3, bravo: 1 }), 'me')).toEqual([]);
    expect(a.update(tdm(5, { alpha: 25, bravo: 1 }, { elapsed: TDM_RULES.duration - 59 }), 'me')).toEqual(['near-win', 'one-minute']);
    expect(a.update(tdm(6, { alpha: 26, bravo: 1 }, { elapsed: TDM_RULES.duration - 50 }), 'me')).toEqual([]);
  });
  it('speaks from the listener’s own team', () => {
    const a = createMatchAnnouncer(), foe = 'foe';
    a.update(tdm(1, { alpha: 0, bravo: 0 }), foe);
    expect(a.update(tdm(2, { alpha: 0, bravo: 26 }), foe)).toEqual(['near-win', 'team-lead']);
  });
  it('restarts with a rematch', () => {
    const a = createMatchAnnouncer();
    a.update(tdm(1, { alpha: 0, bravo: 0 }), 'me');
    a.update(tdm(400, { alpha: 25, bravo: 0 }, { elapsed: 299 }), 'me');
    a.update(tdm(401, { alpha: 30, bravo: 0 }, { finished: true, winner: 'Alpha' }), 'me');
    a.update(tdm(1, { alpha: 0, bravo: 0 }), 'me');
    expect(a.update(tdm(2, { alpha: 25, bravo: 0 }, { elapsed: 250 }), 'me')).toEqual(['near-win', 'one-minute', 'team-lead']);
  });
  it('tracks free-for-all lead by personal kills', () => {
    const a = createMatchAnnouncer(), ffa = (tick: number, me: number, rival: number) =>
      ({ ...tdm(tick, { alpha: 0, bravo: 0 }, { actors: [actor('me', { kills: me }), actor('bot', { kills: rival })] }), teamDeathmatch: undefined }) as ArenaSnapshot;
    a.update(ffa(1, 0, 0), 'me');
    expect(a.update(ffa(2, 0, 1), 'me')).toEqual([]);
    expect(a.update(ffa(3, 2, 1), 'me')).toEqual(['ffa-lead']);
    expect(a.update(ffa(4, 2, 3), 'me')).toEqual(['ffa-lead-lost']);
    expect(a.update(ffa(5, 2, ARENA_KILL_LIMIT - 2), 'me')).toEqual(['near-loss']);
    expect(ARENA_DURATION).toBeGreaterThan(60);
  });
  it('follows the hardpoint: preview, rotation, capture, contest and loss', () => {
    const a = createMatchAnnouncer();
    a.update(hardpoint(1, {}), 'me');
    expect(a.update(hardpoint(2, { owner: 'alpha' }), 'me')).toEqual(['hp-captured']);
    expect(a.update(hardpoint(3, { owner: null, contested: true }), 'me')).toEqual(['hp-contested']);
    expect(a.update(hardpoint(4, { owner: 'bravo' }), 'me')).toEqual(['hp-lost']);
    expect(a.update(hardpoint(5, { owner: 'bravo', next: 'east' }), 'me')).toEqual(['hp-next-east']);
    expect(a.update(hardpoint(6, { active: 'east', owner: null }), 'me')).toEqual(['hp-online']);
    expect(HARDPOINT_RULES.previewSeconds).toBeGreaterThan(0);
  });
  it('announces own readiness and deployments, enemy deployments, and destroyed kit', () => {
    const a = createMatchAnnouncer();
    a.update(tdm(1, { alpha: 0, bravo: 0 }), 'me');
    expect(a.update(tdm(2, { alpha: 0, bravo: 0 }, { ready: { me: ['recon'], foe: ['strike'] } }), 'me')).toEqual(['streak-ready-recon']);
    const mine = effect('streak-1', 'recon', 'me'), mates = effect('streak-2', 'jammer', 'mate'), theirs = effect('streak-3', 'strike', 'foe');
    expect(a.update(tdm(3, { alpha: 0, bravo: 0 }, { effects: [mine, mates, theirs] }), 'me')).toEqual(['streak-enemy-strike', 'streak-up-recon']);
    const sentry = effect('streak-4', 'sentry', 'foe');
    a.update(tdm(4, { alpha: 0, bravo: 0 }, { effects: [{ ...mine, health: 10 }, sentry] }), 'me');
    expect(a.update(tdm(5, { alpha: 0, bravo: 0 }, { effects: [{ ...sentry, health: 40 }] }), 'me')).toContain('streak-destroyed');
    expect(a.update(tdm(6, { alpha: 0, bravo: 0 }), 'me')).toEqual(['streak-killed']);
  });
  it('does not call a streak that simply ran out destroyed', () => {
    const a = createMatchAnnouncer(), recon = effect('streak-1', 'recon', 'me', { until: 2.2 });
    a.update(tdm(1, { alpha: 0, bravo: 0 }), 'me');
    a.update(tdm(2, { alpha: 0, bravo: 0 }, { effects: [recon] }), 'me');
    expect(a.update(tdm(2.5, { alpha: 0, bravo: 0 }, { elapsed: 2.5 }), 'me')).toEqual([]);
  });
});

describe('matchResultEvent', () => {
  it('reads the result from the listener’s side', () => {
    const done = (winner: string) => tdm(9, { alpha: 30, bravo: 2 }, { finished: true, winner });
    expect(matchResultEvent(done('Alpha'), 'me')).toBe('win');
    expect(matchResultEvent(done('Alpha'), 'foe')).toBe('loss');
    expect(matchResultEvent(done('Draw'), 'me')).toBe('draw');
    const ffa = (kills: number[]) => ({ ...tdm(9, { alpha: 0, bravo: 0 }, { finished: true, winner: 'x', actors: kills.map((k, i) => actor(`p${i}`, { kills: k })) }), teamDeathmatch: undefined }) as ArenaSnapshot;
    expect(matchResultEvent(ffa([15, 3, 2, 1]), 'p0')).toBe('ffa-win');
    expect(matchResultEvent(ffa([15, 3, 2, 1]), 'p2')).toBe('ffa-podium');
    expect(matchResultEvent(ffa([15, 3, 2, 1]), 'p3')).toBe('ffa-loss');
    expect(matchResultEvent(tdm(9, { alpha: 1, bravo: 0 }), 'me')).toBeNull();
  });
});

describe('match calls on the Encik radio', () => {
  it('cuts in over lower chatter, waits behind higher, and queues the rest', () => {
    const radio = createEncikRadio(() => 0);
    expect(radio.emit('kill', 0)).not.toBeNull();
    expect(radio.match('streak-ready-recon', 6, .1)?.text).toBe(MATCH_LINES['streak-ready-recon'][0]);
    expect(radio.match('team-lead', 4, .2)).toBeNull();
    const said: MatchCallEvent[] = [], queue = createMatchCallQueue((event, now) => { const ok = !!radio.match(event, matchCallPriority(event), now); if (ok) said.push(event); return ok; });
    queue.push(['team-lead', 'one-minute'], .3);
    // The streak line (41 characters) is still playing at 3.2 s.
    queue.step(.3); queue.step(3.2);
    expect(said).toEqual([]);
    queue.step(4.5);
    expect(said).toEqual(['one-minute']);
    queue.step(8);
    expect(said).toEqual(['one-minute', 'team-lead']);
    // Lead calls have a cooldown, so a flip-flopping score stays quiet.
    queue.push(['team-lead'], 10); queue.step(20);
    expect(said).toEqual(['one-minute', 'team-lead']);
    // A call that waited too long lapses.
    queue.push(['hp-captured'], 30); radio.match('win', 10, 30); queue.step(31); queue.step(41);
    expect(said).toEqual(['one-minute', 'team-lead']);
  });
});
