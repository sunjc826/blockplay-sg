import { describe, expect, it } from 'vitest';
import type { ArenaActor, ArenaFeed, ArenaShot } from './arena-rules';
import { DEATH_CAM_SETTLED, actorWeaponName, createDeathCam, createDeathRecapTracker, formatDuration } from './death-recap';

const actor = (extra: Partial<ArenaActor>): ArenaActor => ({ id: 'me', name: 'Operator', bot: false, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, health: 100, armor: 20, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: 0, shots: 0, role: 'player', faction: 'armed-forces', ...extra });
const raider = (extra: Partial<ArenaActor> = {}) => actor({ id: 'raider', name: 'Sgt Kite', bot: true, x: 30, z: 40, faction: 'mercenaries', weapon: 1, health: 60, armor: 10, rank: 2, ...extra });
const frame = (elapsed: number, extra: { actors?: ArenaActor[]; hit?: ArenaShot | null; feed?: ArenaFeed[]; earned?: number } = {}) => ({ elapsed, earned: 0, actors: [], hit: null, feed: [], ...extra });
const kill: ArenaFeed = { id: '1', text: 'Sgt Kite eliminated Operator', killerId: 'raider', victimId: 'me' };

/** Plays one life that ends with a burst from the raider. */
function lifeEndingIn(tracker: ReturnType<typeof createDeathRecapTracker>, deaths: number, at: number, length: number, killer = raider()) {
  let self = actor({ deaths });
  tracker.observe(self, actor({ deaths, alive: false }), frame(at, { actors: [killer] }));
  const hurt = actor({ deaths, health: 40, armor: 0, hurtFrom: { x: killer.x, z: killer.z, serial: at * 10 + 1, by: killer.id } });
  tracker.observe(hurt, self, frame(at + length - 1, { actors: [killer] })); self = hurt;
  const dead = actor({ deaths: deaths + 1, health: 0, armor: 0, alive: false, hurtFrom: { x: killer.x, z: killer.z, serial: at * 10 + 2, by: killer.id } });
  const closing = frame(at + length, { actors: [killer], feed: [kill] });
  tracker.observe(dead, self, closing);
  return { recap: tracker.die(dead, closing), dead };
}

describe('death recap', () => {
  it('names the killer, their weapon, range and what they had left', () => {
    const { recap } = lifeEndingIn(createDeathRecapTracker(), 0, 10, 42);
    expect(recap.killer).toMatchObject({ id: 'raider', name: 'Sgt Kite', range: 50, health: 60, armor: 10, alive: true, friendly: false, weapon: 'Ultimax' });
    expect(recap.killer!.rank).toBeTruthy(); expect(recap.killer!.faction).toContain('Black Kite');
    expect(recap.selfInflicted).toBe(false);
    expect(recap.life.seconds).toBe(42);
    expect(recap.session).toEqual({ kills: 0, deaths: 1 });
  });

  it('splits damage taken by attacker and marks who finished it', () => {
    const tracker = createDeathRecapTracker(), other = actor({ id: 'pal', name: 'Cpl Lee', bot: true, faction: 'mercenaries' });
    const a = actor({}), actors = [raider(), other];
    tracker.observe(a, a, frame(0, { actors }));
    const b = actor({ health: 90, armor: 20, hurtFrom: { x: 1, z: 1, serial: 1, by: 'pal' } }); tracker.observe(b, a, frame(1, { actors }));
    const c = actor({ health: 30, armor: 0, hurtFrom: { x: 1, z: 1, serial: 2, by: 'raider' } }); tracker.observe(c, b, frame(2, { actors }));
    const d = actor({ health: 0, armor: 0, alive: false, deaths: 1, hurtFrom: { x: 1, z: 1, serial: 3, by: 'raider' } });
    const closing = frame(3, { actors, feed: [kill] }); tracker.observe(d, c, closing);
    expect(tracker.die(d, closing).attackers).toEqual([
      { name: 'Sgt Kite', damage: 110, hits: 2, killer: true },
      { name: 'Cpl Lee', damage: 10, hits: 1, killer: false },
    ]);
  });

  it('counts only this life in shots, kills, damage, distance and pay', () => {
    const tracker = createDeathRecapTracker(), target = raider({ id: 't', x: 90, z: 0, alive: false });
    const start = actor({ kills: 3, shots: 40, deaths: 2 });
    tracker.observe(start, start, frame(100, { earned: 500 }));
    const moved = actor({ kills: 4, shots: 50, deaths: 2, x: 20, z: 0 });
    tracker.observe(moved, start, frame(110, { earned: 700, actors: [target], hit: { hitId: 't', killed: true, damage: 34 }, feed: [{ id: '9', text: 'x', killerId: 'me', victimId: 't' }] }));
    const dead = actor({ kills: 4, shots: 50, deaths: 3, x: 20, z: 0, health: 0, armor: 0, alive: false });
    const closing = frame(120, { earned: 700, feed: [{ id: '10', text: 'Artillery killed Operator', victimId: 'me', cause: 'Artillery' }] });
    tracker.observe(dead, moved, closing);
    const recap = tracker.die(dead, closing);
    expect(recap.life).toMatchObject({ seconds: 20, kills: 1, shots: 10, hits: 1, accuracy: 10, damageDealt: 34, distance: 20, longestKill: 70, credits: 200 });
    expect(recap.session).toEqual({ kills: 4, deaths: 3 });
    expect(recap.killer).toBeNull(); expect(recap.cause).toBe('Artillery');
  });

  it('reports no accuracy until a round is fired', () => {
    expect(lifeEndingIn(createDeathRecapTracker(), 0, 0, 30).recap.life.accuracy).toBeNull();
  });

  it('owns up to a self-inflicted death', () => {
    const tracker = createDeathRecapTracker(), a = actor({}); tracker.observe(a, a, frame(0));
    const dead = actor({ health: 0, armor: 0, alive: false, deaths: 1 });
    const closing = frame(20, { feed: [{ id: '1', text: 'Operator eliminated Operator', killerId: 'me', victimId: 'me', cause: 'Frag grenade' }] });
    tracker.observe(dead, a, closing);
    expect(tracker.die(dead, closing)).toMatchObject({ killer: null, selfInflicted: true, cause: 'Frag grenade' });
  });

  it('does not blame the last shooter for what actually did it', () => {
    const tracker = createDeathRecapTracker(), a = actor({}); tracker.observe(a, a, frame(0, { actors: [raider()] }));
    const dead = actor({ health: 0, armor: 0, alive: false, deaths: 1, hurtFrom: { x: 3, z: 4, serial: 1, by: 'raider' } });
    const closing = frame(20, { actors: [raider()], feed: [{ id: '1', text: 'Artillery killed Operator', victimId: 'me', cause: 'Artillery' }] });
    tracker.observe(dead, a, closing);
    expect(tracker.die(dead, closing)).toMatchObject({ killer: null, cause: 'Artillery' });
  });

  it('survives the killer having already left the match', () => {
    const tracker = createDeathRecapTracker(), a = actor({}); tracker.observe(a, a, frame(0));
    const dead = actor({ health: 0, armor: 0, alive: false, deaths: 1 }), closing = frame(20, { feed: [kill] });
    tracker.observe(dead, a, closing);
    expect(tracker.die(dead, closing).killer).toMatchObject({ name: 'Sgt Kite', alive: false, range: null, weapon: 'Unknown weapon' });
  });

  it('falls back to the last hit if the feed line never arrives', () => {
    const tracker = createDeathRecapTracker(), a = actor({}); tracker.observe(a, a, frame(0, { actors: [raider()] }));
    const dead = actor({ health: 0, armor: 0, alive: false, deaths: 1, hurtFrom: { x: 3, z: 4, serial: 1, by: 'raider' } }), closing = frame(20, { actors: [raider()] });
    tracker.observe(dead, a, closing);
    expect(tracker.die(dead, closing).killer).toMatchObject({ id: 'raider', range: 5 });
  });

  it('calls out a nemesis, a close call and a personal best', () => {
    const tracker = createDeathRecapTracker();
    expect(lifeEndingIn(tracker, 0, 0, 30, raider({ health: 9, armor: 0 })).recap.notes).toEqual(['So close: they are down to 9 HP.']);
    const second = lifeEndingIn(tracker, 1, 40, 45).recap;
    expect(second.notes).toEqual(['Sgt Kite has killed you 2 times. Nemesis.', 'Your longest life this session.']);
  });

  it('notices a very short life but does not call the first life a record', () => {
    const { notes } = lifeEndingIn(createDeathRecapTracker(), 0, 0, 4).recap;
    expect(notes).toEqual(['Down within 4s of deploying.']);
  });

  it('starts over with a new match', () => {
    const tracker = createDeathRecapTracker();
    lifeEndingIn(tracker, 0, 50, 30);
    const { recap } = lifeEndingIn(tracker, 0, 0, 20);
    expect(recap.notes).toEqual([]); expect(recap.life.seconds).toBe(20);
  });

  it('formats durations and weapons', () => {
    expect(formatDuration(48)).toBe('48s'); expect(formatDuration(102.4)).toBe('1:42');
    expect(actorWeaponName(actor({ vehicle: 'helicopter' }))).toBe('Helicopter gun');
    expect(actorWeaponName(actor({ weapon: 0 }))).toBe('SAR 21');
  });
});

describe('death camera', () => {
  const start = { eye: { x: 0, y: 1.75, z: 0 }, yaw: .4, pitch: .1, feet: 0, body: { x: 0, z: 0 }, source: { x: 0, z: -40 } };
  const killer = { x: 0, y: 1.75, z: -40 };

  it('opens in the eye and falls to the ground, rolling', () => {
    const cam = createDeathCam(start), first = cam.shot(0, killer), fallen = cam.shot(.8, killer);
    expect(first).toMatchObject({ x: 0, y: 1.75, z: 0, roll: 0, clear: false, fov: 65 });
    expect(fallen.y).toBeCloseTo(.38); expect(Math.abs(fallen.roll)).toBeCloseTo(.55); expect(fallen.clear).toBe(false);
  });

  it('settles behind the body, facing the killer, with the roll gone', () => {
    const shot = createDeathCam(start).shot(DEATH_CAM_SETTLED, killer);
    expect(shot.roll).toBeCloseTo(0); expect(shot.clear).toBe(true);
    expect(shot.y).toBeCloseTo(2.1);
    expect(shot.z).toBeGreaterThan(2.5); // The far side of the body from z = -40.
    expect(shot.look.z).toBeCloseTo(-14);
  });

  it('keeps its side when the killer moves, tracking them only with the look', () => {
    const cam = createDeathCam(start), a = cam.shot(3, killer), b = cam.shot(3, { x: 30, y: 1.75, z: 0 });
    expect(b.x).toBeCloseTo(a.x); expect(b.z).toBeCloseTo(a.z);
    expect(b.look.x).toBeGreaterThan(a.look.x);
  });

  it('looks down at the body with nobody to follow', () => {
    const shot = createDeathCam({ ...start, source: null }).shot(3, null);
    expect(shot.look.x).toBeCloseTo(0); expect(shot.look.y).toBeCloseTo(.4); expect(shot.look.z).toBeCloseTo(0); expect(shot.fov).toBeCloseTo(60);
  });

  it('narrows the view for a distant killer', () => {
    expect(createDeathCam(start).shot(3, { x: 0, y: 2, z: -200 }).fov).toBeCloseTo(50);
  });

  it('holds the vantage still under reduced motion', () => {
    const cam = createDeathCam({ ...start, reduced: true });
    expect(cam.shot(0, killer)).toEqual(cam.shot(3, killer));
    expect(cam.shot(0, killer).roll).toBe(0);
  });
});
