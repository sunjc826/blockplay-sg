import { describe, expect, it } from 'vitest';
import './combat-event-catalog';
import { ARTILLERY_SHELL, TRANSPORT } from './combat-event-catalog';
import { combatCues, combatPhase, combatRandom, combatTimeline, getCombatEvent, listCombatEvents, registerCombatEvent, transportPose, validCombatEvent,
  COMBAT_AFTERMATH, type CombatEventDescriptor, type CombatPayload, type InsertPayload, type MunitionPayload, type TransportPayload } from './combat-events';
import { blastDamage, resolveBlast, BLAST_STANCE } from './combat-blast';
import { createCombatDirector, edgeDistance, planTransport, COMBAT_BRACKET, COMBAT_PACE, MIN_LAND_REACH, TRANSPORT_DROP_RANGE } from './combat-director';

const event = (over: Partial<CombatEventDescriptor> = {}): CombatEventDescriptor =>
  ({ id: 'e1', kind: 'artillery', seed: 1234, start: 10, target: { x: 0, z: 0 }, heading: .7, intensity: 1, ...over });
const munitions = (payloads: CombatPayload[]) => payloads.filter((p): p is MunitionPayload => p.type === 'munition');
const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };

describe('combat event registry', () => {
  it('ships artillery and both transports', () => {
    expect(listCombatEvents().map(e => e.id)).toEqual(expect.arrayContaining(['artillery', 'transport-land', 'transport-air']));
  });
  it('rejects bad ids, duplicates and timelines that hurt before their warning', () => {
    const base = { name: 'Test', description: '', warning: 3, duration: 10, hazard: true, banner: { warning: 'a', active: 'b' } };
    expect(() => registerCombatEvent({ ...base, id: 'Bad Id', timeline: () => [] })).toThrow();
    expect(() => registerCombatEvent({ ...base, id: 'artillery', timeline: () => [] })).toThrow();
    const early: MunitionPayload = { type: 'munition', id: 0, impact: { x: 0, z: 0 }, time: 2, flight: 1, descent: { x: 0, y: -1, z: 0 }, blast: { ...ARTILLERY_SHELL } };
    expect(() => registerCombatEvent({ ...base, id: 'sneak-attack', timeline: () => [early] })).toThrow(/invalid timeline/);
    // The same round as a spotting round, with no blast, is allowed that early.
    registerCombatEvent({ ...base, id: 'early-smoke', timeline: () => [{ ...early, blast: null }] });
    expect(getCombatEvent('early-smoke')).toBeTruthy();
  });
  it('never lets any shipped event hurt before it is announced, over many seeds', () => {
    for (const plugin of listCombatEvents()) for (let seed = 0; seed < 300; seed++) for (const intensity of [.5, 1, 2]) {
      const payloads = combatTimeline(event({ id: `s${seed}-${intensity}`, kind: plugin.id, seed, intensity, troops: 1 + seed % 6, reach: 20 + seed % 240 }));
      for (const p of munitions(payloads)) if (p.blast) expect(p.time).toBeGreaterThanOrEqual(plugin.warning);
      for (const p of payloads) if (p.type === 'insert') expect(p.time).toBeGreaterThanOrEqual(plugin.warning);
    }
  });
});

describe('artillery timeline', () => {
  it('is a pure function of its descriptor, across a JSON round trip', () => {
    const a = event(), b = JSON.parse(JSON.stringify(a)) as CombatEventDescriptor;
    expect(combatTimeline(b)).toEqual(combatTimeline(a));
    expect(combatTimeline(event({ seed: 99 }))).not.toEqual(combatTimeline(a));
  });
  it('walks two harmless spotting rounds in, then fires 6 to 12 shells by intensity', () => {
    const counts = [.5, 1, 2].map(intensity => {
      const rounds = munitions(combatTimeline(event({ id: `i${intensity}`, intensity })));
      expect(rounds.slice(0, 2).every(r => r.blast === null && r.smoke)).toBe(true);
      const [far, near] = rounds.slice(0, 2).map(r => Math.hypot(r.impact.x, r.impact.z));
      expect(far).toBeGreaterThanOrEqual(30); expect(near).toBeLessThan(far);
      return rounds.filter(r => r.blast).length;
    });
    expect(counts).toEqual([6, 8, 12]);
  });
  it('keeps every shell inside the danger ring it draws', () => {
    for (let seed = 0; seed < 200; seed++) {
      const payloads = combatTimeline(event({ id: `r${seed}`, seed })), ring = payloads.find(p => p.type === 'marker')!;
      if (ring.type !== 'marker') throw new Error('marker missing');
      for (const shell of munitions(payloads).filter(r => r.blast)) expect(Math.hypot(shell.impact.x - ring.center.x, shell.impact.z - ring.center.z)).toBeLessThanOrEqual(ring.radius);
    }
  });
  it('moves through warning, active, aftermath and done', () => {
    const e = event(), plugin = getCombatEvent('artillery')!;
    const last = Math.max(...munitions(combatTimeline(e)).map(r => r.time));
    expect(combatPhase(e, e.start + 1)).toBe('warning');
    expect(combatPhase(e, e.start + plugin.warning + .1)).toBe('active');
    expect(combatPhase(e, e.start + last + .1)).toBe('aftermath');
    expect(combatPhase(e, e.start + plugin.duration + COMBAT_AFTERMATH + .1)).toBe('done');
  });
  it('cues each whistle and impact exactly once across frames', () => {
    const e = event(), cues = [];
    for (let t = 0; t < 40; t += 1 / 30) cues.push(...combatCues([e], e.start + t, e.start + t + 1 / 30));
    const rounds = munitions(combatTimeline(e));
    expect(cues.filter(c => c.kind === 'impact')).toHaveLength(rounds.length);
    expect(cues.filter(c => c.kind === 'whistle')).toHaveLength(rounds.filter(r => r.blast).length);
  });
});

describe('troop transports', () => {
  for (const kind of ['transport-land', 'transport-air'] as const) it(`${kind} delivers each troop at the drop while it waits there`, () => {
    const e = event({ kind, troops: 4, reach: 150, heading: 2.2, target: { x: 30, z: -40 } });
    const payloads = combatTimeline(e), ride = payloads.find((p): p is TransportPayload => p.type === 'transport')!;
    const inserts = payloads.filter((p): p is InsertPayload => p.type === 'insert');
    expect(inserts.map(i => i.slot)).toEqual([0, 1, 2, 3]);
    for (const insert of inserts) {
      expect(insert.time).toBeGreaterThan(ride.arrive); expect(insert.time).toBeLessThan(ride.depart);
      expect(Math.hypot(insert.at.x - 30, insert.at.z + 40)).toBeLessThan(5);
    }
    expect(Math.hypot(ride.entry.x - 30, ride.entry.z + 40)).toBeCloseTo(150, 5);
    expect(transportPose(ride, ride.enter - .1).visible).toBe(false);
    expect(transportPose(ride, ride.leave + .1).visible).toBe(false);
    const arrived = transportPose(ride, ride.arrive + .01);
    expect(Math.hypot(arrived.x - 30, arrived.z + 40)).toBeLessThan(.5);
    if (kind === 'transport-air') { expect(arrived.y).toBeCloseTo(TRANSPORT.air.hover, 0); expect(transportPose(ride, ride.enter + .1).y).toBe(TRANSPORT.air.cruise); }
    else { expect(ride.exit).toEqual(ride.entry); expect(arrived.y).toBe(0); }
    // No jumps: a 60 Hz walk along the whole ride never moves more than a fast vehicle could.
    let previous = transportPose(ride, ride.enter);
    for (let t = ride.enter; t <= ride.leave; t += 1 / 60) {
      const pose = transportPose(ride, t);
      expect(Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z)).toBeLessThan(1.5);
      previous = pose;
    }
  });
});

describe('combat event validation', () => {
  it('accepts a live descriptor and rejects unknown, stale, future or out-of-bounds ones', () => {
    expect(validCombatEvent(event(), 15, bounds)).toBe(true);
    expect(validCombatEvent(event({ kind: 'nuke' }), 15, bounds)).toBe(false);
    expect(validCombatEvent(event({ start: 20 }), 15, bounds)).toBe(false);
    expect(validCombatEvent(event(), 200, bounds)).toBe(false);
    expect(validCombatEvent(event({ target: { x: 500, z: 0 } }), 15, bounds)).toBe(false);
    expect(validCombatEvent(event({ intensity: 9 }), 15, bounds)).toBe(false);
    expect(validCombatEvent(event({ troops: 40 }), 15, bounds)).toBe(false);
    expect(validCombatEvent({ ...event(), seed: 1.5 }, 15, bounds)).toBe(false);
  });
});

describe('blast resolver', () => {
  const spec = { ...ARTILLERY_SHELL };
  it('falls off to minScale at the edge and to nothing beyond it', () => {
    expect(blastDamage(spec, 0, {})).toBe(140);
    expect(blastDamage(spec, 8, {})).toBeCloseTo(28);
    expect(blastDamage(spec, 8.01, {})).toBe(0);
  });
  it('relieves crouched and prone bodies only when the blast asks, and scales hulls', () => {
    expect(blastDamage(spec, 0, { stance: 'prone' })).toBe(140 * BLAST_STANCE.prone);
    expect(blastDamage(spec, 0, { stance: 'crouch' })).toBe(140 * BLAST_STANCE.crouch);
    expect(blastDamage({ ...spec, stance: false }, 0, { stance: 'prone' })).toBe(140);
    expect(blastDamage(spec, 0, { vehicle: true, stance: 'prone' })).toBe(210);
  });
  it('spares what cover hides and keeps the caller order', () => {
    const hits = resolveBlast({ x: 0, y: 0, z: 0 }, spec, [
      { item: 'hull', point: { x: 1, y: 0, z: 0 }, vehicle: true },
      { item: 'hidden', point: { x: 0, y: 0, z: 2 } },
      { item: 'open', point: { x: -3, y: 0, z: 0 } },
      { item: 'far', point: { x: 30, y: 0, z: 0 } },
    ], (_from, to) => to.z === 0);
    expect(hits.map(h => h.item)).toEqual(['hull', 'open']);
  });
});

describe('combat director', () => {
  const view = (now: number, humans = [{ x: 0, z: 0 }]) => ({ now, active: [], humans, bounds });
  it('waits out the opening window, then schedules within range of a human and never on top of one', () => {
    const director = createCombatDirector({ risk: 'medium', seed: 5 });
    expect(director.step(view(COMBAT_PACE.medium.first[0] - 1))).toBeNull();
    let directive = null;
    for (let t = COMBAT_PACE.medium.first[0]; !directive && t < 200; t += .5) directive = director.step(view(t));
    expect(directive).not.toBeNull();
    const reach = Math.hypot(directive!.target.x, directive!.target.z);
    expect(reach).toBeGreaterThanOrEqual(25); expect(reach).toBeLessThanOrEqual(80);
    expect(directive!.intensity).toBe(COMBAT_PACE.medium.intensity);
    const rounds = munitions(combatTimeline({ ...directive!, id: 'x', start: 0 })).filter(r => r.blast);
    for (const round of rounds) expect(Math.hypot(round.impact.x, round.impact.z)).toBeGreaterThanOrEqual(COMBAT_BRACKET);
  });
  it('spaces events by the risk gap, holds while one is landing, and waits for someone to aim at', () => {
    const director = createCombatDirector({ risk: 'high', seed: 9 });
    const times: number[] = [];
    let running: CombatEventDescriptor | null = null;
    for (let t = 0; t < 900; t += .5) {
      const directive = director.step({ ...view(t, t > 400 && t < 500 ? [] : [{ x: 0, z: 0 }]), active: running ? [running] : [] });
      if (directive) { times.push(t); running = { ...directive, id: `e${t}`, start: t }; }
    }
    expect(times.length).toBeGreaterThan(5);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(COMBAT_PACE.high.gap[0]);
    // Nobody playing between 400 and 500 s: nothing starts then.
    expect(times.some(t => t > 400 && t < 500)).toBe(false);
  });
  it('keeps targets inside the bounds and clear of protected points', () => {
    for (let seed = 0; seed < 40; seed++) {
      const director = createCombatDirector({ risk: 'high', seed });
      for (let t = 0; t < 60; t += 1) {
        const directive = director.step({ ...view(t, [{ x: 185, z: 185 }]), avoid: [{ x: 150, z: 150 }] });
        if (!directive) continue;
        expect(directive.target.x).toBeLessThanOrEqual(192); expect(directive.target.z).toBeLessThanOrEqual(192);
        expect(Math.hypot(directive.target.x - 150, directive.target.z - 150)).toBeGreaterThanOrEqual(15);
      }
    }
  });
});

describe('transport planner', () => {
  const human = [{ x: 0, z: 0 }];
  const drops = [{ x: 10, z: 0 }, { x: 80, z: 0 }, { x: 0, z: 150 }];
  it('drops away from humans, by road when a street is clear and the sky is not', () => {
    const plan = planTransport({ drops, humans: human, bounds, clearRun: (_f, _d, limit) => limit, openSky: () => false }, combatRandom(1))!;
    expect(plan.kind).toBe('transport-land');
    expect(Math.hypot(plan.target.x, plan.target.z)).toBeGreaterThanOrEqual(TRANSPORT_DROP_RANGE[0]);
    expect(plan.reach).toBeGreaterThanOrEqual(MIN_LAND_REACH);
  });
  it('flies when no street is long enough, and gives up when no transport can reach any drop', () => {
    expect(planTransport({ drops, humans: human, bounds, clearRun: () => 10, openSky: () => true }, combatRandom(2))!.kind).toBe('transport-air');
    expect(planTransport({ drops, humans: human, bounds, clearRun: () => 10, openSky: () => false }, combatRandom(3))).toBeNull();
    expect(planTransport({ drops: [{ x: 10, z: 0 }], humans: human, bounds, clearRun: (_f, _d, l) => l, openSky: () => true }, combatRandom(4))).toBeNull();
  });
  it('measures the run to the edge along a direction', () => {
    expect(edgeDistance({ x: 0, z: 0 }, { x: 1, z: 0 }, bounds)).toBe(200);
    expect(edgeDistance({ x: 100, z: 0 }, { x: -Math.SQRT1_2, z: Math.SQRT1_2 }, bounds)).toBeCloseTo(200 * Math.SQRT2);
  });
});
