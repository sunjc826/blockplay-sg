import { describe, expect, it, vi } from 'vitest';
import { SCORE_EVENTS, assistPoints, createMatchScore, popupTotal, validScoreSnapshot, type ScoreKind } from './match-score';
import type { ArenaActor } from './arena-rules';
import type { StreakMode } from './match-streaks';

function setup(mode: StreakMode = 'team-deathmatch') {
  const actor = (id: string, team: 'alpha' | 'bravo'): ArenaActor => ({ id, name: id, bot: false, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: 0, shots: 0, role: 'player', faction: team, team });
  const a = actor('a', 'alpha'), ally = actor('ally', 'alpha'), b = actor('b', 'bravo'), c = actor('c', 'bravo'), actors = [a, ally, b, c];
  const charge = vi.fn();
  const score = createMatchScore(mode, { actors: () => actors, enemy: (x, y) => x.id !== y.id && (mode === 'free-for-all' || x.team !== y.team), charge });
  const kinds = (id: string, now: number) => score.snapshot(now).events.filter(e => e.actor === id).at(-1)?.parts.map(p => p[0]) as ScoreKind[] | undefined;
  return { a, ally, b, c, actors, score, charge, kinds };
}

describe('match score', () => {
  it('pays the elimination and stacks what made it notable into one award', () => {
    const { a, b, c, score, charge, kinds } = setup();
    score.kill(a, b, { now: 10, headshot: true, range: 55 });
    expect(kinds('a', 10)).toEqual(['kill', 'headshot', 'longshot', 'first-blood']);
    expect(score.state('a')).toEqual({ score: 200, assists: 0 });
    // The streaks charge the kill themselves; only the extras are passed on.
    expect(charge).toHaveBeenLastCalledWith('a', 100);
    score.kill(a, c, { now: 12, range: 2 });
    expect(kinds('a', 12)).toEqual(['kill', 'point-blank', 'double']);
    expect(popupTotal(score.snapshot(12).events.at(-1)!)).toBe(150);
  });
  it('shares a kill with whoever hurt the victim, by how much they took off', () => {
    const { a, ally, b, score, charge } = setup();
    score.damage(ally, b, 60, 1); score.damage(a, b, 40, 2); score.kill(a, b, { now: 2 });
    expect(score.state('ally')).toEqual({ score: assistPoints(60), assists: 1 });
    expect(assistPoints(60)).toBe(45); expect(assistPoints(5)).toBe(20); expect(assistPoints(400)).toBe(75);
    expect(charge).toHaveBeenCalledWith('ally', 45);
    // Stale damage, damage from an earlier life and the killer's own do not count.
    score.damage(ally, b, 90, 3); score.kill(a, b, { now: 30 });
    expect(score.state('ally').assists).toBe(1);
    expect(score.state('a').assists).toBe(0);
  });
  it('gives a recon owner an assist for a marked enemy, once, and never the killer', () => {
    const { a, ally, b, score } = setup();
    score.damage(ally, b, 30, 1);
    score.kill(a, b, { now: 2, spotters: ['ally', 'a', 'b'] });
    expect(score.state('ally')).toEqual({ score: assistPoints(30), assists: 1 });
    score.kill(a, b, { now: 20, spotters: ['ally'] });
    expect(score.state('ally')).toEqual({ score: assistPoints(30) + 20, assists: 2 });
  });
  it('recognises revenge, avenger, savior, shutdown, buzzkill, comeback and survivor', () => {
    const { a, ally, b, c, score, kinds } = setup();
    score.kill(b, a, { now: 1 }); score.kill(a, b, { now: 20 });
    expect(kinds('a', 20)).toEqual(['kill', 'revenge']);
    score.kill(a, b, { now: 40 }); expect(kinds('a', 40)).toEqual(['kill']);
    score.kill(c, ally, { now: 50 }); score.kill(a, c, { now: 52 });
    expect(kinds('a', 52)).toContain('avenger');
    score.kill(a, c, { now: 60 });
    score.damage(b, ally, 20, 70); score.kill(a, b, { now: 71, buzzkill: true });
    expect(kinds('a', 71)).toEqual(['kill', 'savior', 'buzzkill', 'bloodthirsty']);
    score.kill(c, a, { now: 80 });
    expect(kinds('c', 80)).toEqual(['kill', 'revenge', 'shutdown']);
    score.death('a'); score.death('a'); a.health = 20; score.kill(a, c, { now: 100 });
    expect(kinds('a', 100)).toEqual(['kill', 'revenge', 'comeback', 'survivor']);
  });
  it('chains multikills, pays streak kills flat, and has no teammates in free-for-all', () => {
    const { a, ally, b, c, score, charge, kinds } = setup('free-for-all');
    for (const now of [1, 2, 3, 4]) score.kill(a, now % 2 ? b : c, { now });
    expect(kinds('a', 4)).toEqual(['kill', 'fury']);
    charge.mockClear(); score.kill(a, b, { now: 5, fromStreak: true, headshot: true });
    expect(kinds('a', 5)).toEqual(['streak-kill']); expect(charge).not.toHaveBeenCalled();
    score.kill(b, ally, { now: 6 }); score.kill(a, b, { now: 7 });
    expect(kinds('a', 7)).not.toContain('avenger');
    score.kill(a, ally, { now: 30, spotters: ['c'] }); expect(score.state('c').score).toBe(0);
  });
  it('pays hardpoint zone kills and hold time in whole steps', () => {
    const { a, b, score, charge, kinds } = setup('hardpoint');
    score.kill(a, b, { now: 1, objective: 'defend' });
    expect(kinds('a', 1)).toEqual(['kill', 'first-blood', 'defend']);
    expect(charge).toHaveBeenLastCalledWith('a', SCORE_EVENTS['first-blood'].points);
    for (let i = 0; i < 24; i++) score.hold('a', .5, 2 + i / 2);
    expect(score.state('a').score).toBe(175 + 100);
    const tdm = setup(); tdm.score.hold('a', 60, 1); expect(tdm.score.state('a').score).toBe(0);
  });
  it('scores equipment, drops awards after four seconds and forgets a leaver', () => {
    const { a, ally, b, actors, score } = setup();
    score.destroy('a', 1); score.intercept('a', 2); score.damage(ally, b, 50, 2);
    expect(score.state('a').score).toBe(65);
    expect(score.snapshot(3).events).toHaveLength(2);
    expect(score.snapshot(5.5).events.map(e => e.parts[0][0])).toEqual(['intercept']);
    actors.splice(actors.indexOf(ally), 1); score.removePlayer('ally'); score.kill(a, b, { now: 6 });
    expect(Object.keys(score.snapshot(6).players)).toEqual(['a', 'b', 'c']);
    score.reset(); expect(score.snapshot(0)).toEqual({ players: { a: { score: 0, assists: 0 }, b: { score: 0, assists: 0 }, c: { score: 0, assists: 0 } }, events: [] });
  });
  it('rejects snapshots a host could not have produced', () => {
    const { a, b, actors, score } = setup();
    score.kill(a, b, { now: 3, headshot: true });
    const good = score.snapshot(3);
    expect(validScoreSnapshot(good, actors, 3)).toBe(true);
    const bad = (edit: (s: typeof good) => void) => { const s = structuredClone(good); edit(s); return validScoreSnapshot(s, actors, 3); };
    expect(bad(s => { s.players.a.score = -1; })).toBe(false);
    expect(bad(s => { s.players.a.score = 1.5; })).toBe(false);
    expect(bad(s => { delete s.players.b; })).toBe(false);
    expect(bad(s => { s.players.ghost = { score: 0, assists: 0 }; })).toBe(false);
    expect(bad(s => { s.events[0].actor = 'ghost'; })).toBe(false);
    expect(bad(s => { s.events[0].at = 9; })).toBe(false);
    expect(bad(s => { s.events[0].parts[0] = ['kill', 5000]; })).toBe(false);
    expect(bad(s => { s.events[0].parts[0] = ['__proto__' as ScoreKind, 1]; })).toBe(false);
    expect(bad(s => { s.events.push(structuredClone(s.events[0])); })).toBe(false);
    expect(validScoreSnapshot(null, actors, 3)).toBe(false);
  });
});
