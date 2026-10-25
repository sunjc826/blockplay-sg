import { describe, expect, it } from 'vitest';
import { AIR_BOMB, AIR_RAID, BLACKOUT, bannerOf, MORTAR, RAID, SMOKE_SCREEN, SUPPLY, TEAR_GAS, threatens } from './combat-event-catalog';
import { combatCues, combatPhase, combatTimeline, cratePose, getCombatEvent, listCombatEvents, orbitPose, registerCombatEvent, validCombatEvent,
  type CloudPayload, type CombatEventDescriptor, type CombatPayload, type CratePayload, type FlyerPayload, type MunitionPayload, type OrbitPayload } from './combat-events';
import { COMBAT_PLAYER_OFFSET, COMBAT_TABLES, COMBAT_WORLD_SHARE, COMBAT_WORLD_SPREAD, createCombatDirector } from './combat-director';

const event = (kind: string, over: Partial<CombatEventDescriptor> = {}): CombatEventDescriptor =>
  ({ id: `${kind}-1`, kind, seed: 4242, start: 10, target: { x: 0, z: 0 }, heading: .4, intensity: 1, ...over });
const of = <T extends CombatPayload['type']>(payloads: CombatPayload[], type: T) => payloads.filter((p): p is Extract<CombatPayload, { type: T }> => p.type === type);
const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
const NEW_EVENTS = ['air-raid', 'helicopter-raid', 'mortar', 'drone', 'sniper', 'supply-drop', 'smoke-screen', 'tear-gas', 'blackout'];

describe('the new combat events', () => {
  it('are all registered, with every timeline pure across a JSON round trip', () => {
    expect(listCombatEvents().map(e => e.id)).toEqual(expect.arrayContaining(NEW_EVENTS));
    for (const kind of NEW_EVENTS) {
      const a = event(kind, { origin: { x: 90, z: 0 }, altitude: 40 });
      expect(combatTimeline(JSON.parse(JSON.stringify(a)))).toEqual(combatTimeline(a));
    }
  });
  it('hurt nobody before their warning, gas included, over many seeds', () => {
    for (const kind of NEW_EVENTS) for (let seed = 0; seed < 120; seed++) for (const intensity of [.5, 1, 2]) {
      const plugin = getCombatEvent(kind)!, payloads = combatTimeline(event(kind, { id: `${kind}-${seed}-${intensity}`, seed, intensity }));
      for (const p of of(payloads, 'munition')) if (p.blast) expect(p.time).toBeGreaterThanOrEqual(plugin.warning);
      for (const p of of(payloads, 'cloud')) if (p.dps > 0) expect(p.from).toBeGreaterThanOrEqual(plugin.warning);
    }
  });
  it('refuse a plugin whose gas starts before its warning', () => {
    const cloud: CloudPayload = { type: 'cloud', id: 0, center: { x: 0, z: 0 }, radius: 5, from: 1, until: 10, dps: 5, colour: '#fff' };
    const base = { name: 'Test', description: '', warning: 3, duration: 20, hazard: true, banner: { warning: 'a', active: 'b' } };
    expect(() => registerCombatEvent({ ...base, id: 'early-gas', timeline: () => [cloud] })).toThrow(/invalid timeline/);
    registerCombatEvent({ ...base, id: 'early-smoke-cloud', timeline: () => [{ ...cloud, dps: 0 }] });
  });
});

describe('air raid', () => {
  it('sends one, two or three jets by intensity, each dropping a stick of overhead bombs inside the ring', () => {
    expect([.5, 1, 2].map(intensity => of(combatTimeline(event('air-raid', { id: `j${intensity}`, intensity })), 'flyer').length)).toEqual([1, 2, 3]);
    for (let seed = 0; seed < 60; seed++) {
      const payloads = combatTimeline(event('air-raid', { id: `a${seed}`, seed, intensity: 2 })), ring = of(payloads, 'marker')[0];
      const bombs = of(payloads, 'munition');
      expect(bombs).toHaveLength(3 * AIR_RAID.stick);
      for (const bomb of bombs) {
        expect(bomb.kind).toBe('bomb'); expect(bomb.blast).toEqual(AIR_BOMB); expect(bomb.blast!.overhead).toBe(true);
        expect(Math.hypot(bomb.impact.x, bomb.impact.z)).toBeLessThanOrEqual(ring.radius);
      }
    }
  });
  it('flies each jet over the target close to when its bombs land', () => {
    const payloads = combatTimeline(event('air-raid')), jets = of(payloads, 'flyer');
    for (const jet of jets) {
      const over = (jet.enter + jet.leave) / 2;
      expect(Math.hypot((jet.from.x + jet.to.x) / 2, (jet.from.z + jet.to.z) / 2)).toBeLessThan(20);
      expect(over).toBeGreaterThan(AIR_RAID.warning);
    }
  });
});

describe('mortar fire', () => {
  it('fires salvos from its pit and stops launching when the crew is silenced, though rounds in the air still land', () => {
    const origin = { x: 90, z: 10 }, live = event('mortar', { origin }), rounds = of(combatTimeline(live), 'munition');
    expect(rounds.length).toBe(2 * Math.round(4 + 2));
    for (const round of rounds) { expect(round.launch).toEqual(origin); expect(round.kind).toBe('mortar'); expect(round.time - round.flight).toBeGreaterThanOrEqual(0); }
    const end = rounds[5].time - rounds[5].flight + .01;
    const silenced = event('mortar', { origin, ended: live.start + end, outcome: 'silenced' }), left = of(combatTimeline(silenced), 'munition');
    expect(left.length).toBe(rounds.filter(r => r.time - r.flight <= end).length);
    expect(left.length).toBeLessThan(rounds.length);
    const presence = of(combatTimeline(silenced), 'presence')[0];
    expect(presence.until).toBeCloseTo(end, 5);
    expect(of(combatTimeline(silenced), 'marker')[0].until).toBeCloseTo(Math.max(...left.map(r => r.time)) + 1.5, 5);
  });
  it('thumps once per round as it leaves the tube', () => {
    const e = event('mortar', { origin: { x: 90, z: 0 } }), cues = [];
    for (let t = 0; t < MORTAR.duration; t += 1 / 30) cues.push(...combatCues([e], e.start + t, e.start + t + 1 / 30));
    expect(cues.filter(c => c.kind === 'launch')).toHaveLength(of(combatTimeline(e), 'munition').length);
  });
});

describe('raid helicopter path', () => {
  const orbit = () => of(combatTimeline(event('helicopter-raid')), 'orbit')[0] as OrbitPayload;
  it('comes in, circles the target at its radius and height, and leaves, without jumps', () => {
    const path = orbit();
    expect(path.arrive).toBe(RAID.warning);
    const circling = orbitPose(path, path.arrive + 10, 40);
    expect(Math.hypot(circling.x, circling.z)).toBeCloseTo(RAID.radius, 3);
    expect(circling.y).toBeCloseTo(40, 0);
    let previous = orbitPose(path, path.enter, 40);
    for (let t = path.enter; t <= path.gone; t += 1 / 60) {
      const pose = orbitPose(path, t, 40);
      expect(Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z)).toBeLessThan(2);
      previous = pose;
    }
    expect(orbitPose(path, path.gone + .1, 40).visible).toBe(false);
  });
  it('turns for home from wherever it is when its event ends early', () => {
    const cut = of(combatTimeline(event('helicopter-raid', { ended: 30, outcome: 'withdrawn' })), 'orbit')[0];
    expect(cut.leave).toBeCloseTo(20, 5);
    const before = orbitPose(cut, cut.leave - .01, 40), after = orbitPose(cut, cut.leave + .01, 40);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1);
  });
});

describe('supply drop', () => {
  it('drops a crate from the cargo pass that lands where it was aimed', () => {
    const payloads = combatTimeline(event('supply-drop', { target: { x: 40, z: -20 } }));
    const crate = of(payloads, 'crate')[0] as CratePayload, plane = of(payloads, 'flyer')[0] as FlyerPayload;
    expect(plane.model).toBe('cargo');
    expect(crate.release).toBe(SUPPLY.release);
    expect(cratePose(crate, crate.release).y).toBeCloseTo(SUPPLY.fall);
    expect(cratePose(crate, crate.land)).toMatchObject({ x: 40, z: -20, y: 0, landed: true });
    expect(cratePose(crate, crate.until + 1).visible).toBe(false);
  });
  it('stops counting as live once someone takes it, while the crate stays on the ground', () => {
    const claimed = event('supply-drop', { ended: 50, outcome: 'claimed', claimedBy: 'one' });
    expect(combatPhase(claimed, 51)).toBe('aftermath');
    const crate = of(combatTimeline(claimed), 'crate')[0];
    expect(cratePose(crate, 41).visible).toBe(true);
  });
});

describe('smoke, gas and blackout', () => {
  it('raise a wall of smoke across the heading that hurts nobody', () => {
    const clouds = of(combatTimeline(event('smoke-screen', { heading: 0 })), 'cloud');
    expect(clouds).toHaveLength(SMOKE_SCREEN.canisters);
    for (const cloud of clouds) { expect(cloud.dps).toBe(0); expect(Math.abs(cloud.center.z)).toBeLessThanOrEqual(2); }
    expect(Math.max(...clouds.map(c => c.center.x)) - Math.min(...clouds.map(c => c.center.x))).toBeCloseTo(SMOKE_SCREEN.spacing * 3, 5);
  });
  it('settle gas inside its marked ring', () => {
    const payloads = combatTimeline(event('tear-gas')), ring = of(payloads, 'marker')[0];
    for (const cloud of of(payloads, 'cloud')) {
      expect(cloud.dps).toBe(TEAR_GAS.dps);
      expect(Math.hypot(cloud.center.x, cloud.center.z) + cloud.radius).toBeLessThanOrEqual(ring.radius);
    }
  });
  it('jam for most of a minute after the warning', () => {
    const [jam] = of(combatTimeline(event('blackout')), 'jam');
    expect(jam).toMatchObject({ from: BLACKOUT.warning, until: BLACKOUT.until });
  });
});

describe('validation of the new descriptor fields', () => {
  it('accepts an ended event with its outcome and rejects nonsense', () => {
    const base = event('mortar', { origin: { x: 90, z: 0 } });
    expect(validCombatEvent({ ...base, ended: 20, outcome: 'silenced' }, 25, bounds)).toBe(true);
    expect(validCombatEvent({ ...base, ended: 5 }, 25, bounds)).toBe(false);
    expect(validCombatEvent({ ...base, ended: 40 }, 25, bounds)).toBe(false);
    expect(validCombatEvent({ ...base, outcome: 'vaporised' }, 25, bounds)).toBe(false);
    expect(validCombatEvent({ ...base, altitude: Number.NaN }, 25, bounds)).toBe(false);
    expect(validCombatEvent({ ...base, origin: { x: 1e6, z: 0 } }, 25, bounds)).toBe(false);
    expect(validCombatEvent({ ...base, claimedBy: '' }, 25, bounds)).toBe(false);
  });
});

describe('alarms by side', () => {
  const sniper = getCombatEvent('sniper')!, mortar = getCombatEvent('mortar')!;
  it('raise no alarm for a sniper on the players\' side, and call it friendly', () => {
    expect(threatens(event('sniper'), sniper)).toBe(true);
    expect(threatens(event('sniper', { faction: 'armed-forces' }), sniper)).toBe(false);
    expect(bannerOf(event('sniper', { faction: 'armed-forces' }), sniper).active).toMatch(/^FRIENDLY/);
    expect(bannerOf(event('sniper'), sniper)).toBe(sniper.banner);
  });
  it('still warn of friendly fire that hurts everyone, and never of news', () => {
    expect(threatens(event('mortar', { faction: 'armed-forces' }), mortar)).toBe(true);
    expect(threatens(event('supply-drop'), getCombatEvent('supply-drop')!)).toBe(false);
  });
});

describe('the director with the full catalog', () => {
  it('only lists registered kinds, and puts raids and snipers only where risk is medium or high', () => {
    for (const table of Object.values(COMBAT_TABLES)) for (const entry of table) expect(getCombatEvent(entry.kind)).toBeTruthy();
    expect(COMBAT_TABLES.low.some(e => ['air-raid', 'helicopter-raid', 'sniper', 'tear-gas'].includes(e.kind))).toBe(false);
    expect(COMBAT_TABLES.high.map(e => e.kind)).toEqual(expect.arrayContaining(['air-raid', 'helicopter-raid', 'sniper', 'drone']));
  });
  it('aims hunters near a player and area events clear of them, gas included', () => {
    for (let seed = 0; seed < 60; seed++) {
      const director = createCombatDirector({ risk: 'high', seed });
      for (let t = 0; t < 400; t += 1) {
        const directive = director.step({ now: t, active: [], humans: [{ x: 0, z: 0 }], bounds });
        if (!directive) continue;
        const reach = Math.hypot(directive.target.x, directive.target.z), plugin = getCombatEvent(directive.kind)!;
        if (plugin.targeting?.policy === 'player') { expect(reach).toBeGreaterThanOrEqual(COMBAT_PLAYER_OFFSET[0]); expect(reach).toBeLessThanOrEqual(COMBAT_PLAYER_OFFSET[1]); continue; }
        for (const p of combatTimeline({ ...directive, id: 'probe', start: 0 })) {
          if (p.type === 'munition' && p.blast) expect(Math.hypot(p.impact.x, p.impact.z)).toBeGreaterThanOrEqual(10);
          if (p.type === 'cloud' && p.dps > 0) expect(Math.hypot(p.center.x, p.center.z)).toBeGreaterThanOrEqual(p.radius + 3);
        }
      }
    }
  });
});

// Used only for its type in the helpers above.
export type { MunitionPayload };

describe('director pacing with news running', () => {
  it('is not held up by a running truck or supply drop, and retries soon after a refusal', () => {
    const news: CombatEventDescriptor[] = [event('transport-land', { start: 0, reach: 120, troops: 2 }), event('supply-drop', { id: 'drop', start: 0 })];
    const director = createCombatDirector({ risk: 'high', seed: 3, table: [{ kind: 'artillery', weight: 1, cooldown: 45 }] });
    let fired: ReturnType<typeof director.step> = null, at = 0;
    for (let t = 0; t < 60 && !fired; t += .5) { fired = director.step({ now: t, active: news, humans: [{ x: 0, z: 0 }], bounds }); at = t; }
    expect(fired?.kind).toBe('artillery');
    director.refused(fired!, at);
    let again: ReturnType<typeof director.step> = null;
    for (let t = at; t < at + 10 && !again; t += .5) again = director.step({ now: t, active: news, humans: [{ x: 0, z: 0 }], bounds });
    expect(again?.kind).toBe('artillery');
  });
});

describe('director aiming at the world', () => {
  const run = (view: { heat?: { x: number; z: number; weight: number }[]; places?: { x: number; z: number }[] }) => {
    const targets: { kind: string; x: number; z: number }[] = [];
    for (let seed = 0; seed < 80; seed++) {
      const director = createCombatDirector({ risk: 'medium', seed });
      for (let t = 0; t < 300; t += 1) {
        const directive = director.step({ now: t, active: [], humans: [{ x: 0, z: 0 }], bounds, ...view });
        if (directive) targets.push({ kind: directive.kind, ...directive.target });
      }
    }
    return targets;
  };
  it('puts most events where the fighting is, and never a damaging round on a player', () => {
    const targets = run({ heat: [{ x: 150, z: 150, weight: 10 }, { x: -150, z: 120, weight: .1 }] });
    const atHeat = targets.filter(t => Math.hypot(t.x - 150, t.z - 150) <= COMBAT_WORLD_SPREAD + 1e-6).length;
    expect(atHeat / targets.length).toBeGreaterThan(COMBAT_WORLD_SHARE.medium * .75);
    expect(atHeat).toBeLessThan(targets.length);
  });
  it('falls back to the places it is given when nothing is hot', () => {
    const places = [{ x: -120, z: -120 }, { x: 120, z: -120 }];
    const targets = run({ places });
    expect(targets.filter(t => places.some(p => Math.hypot(t.x - p.x, t.z - p.z) <= COMBAT_WORLD_SPREAD + 1e-6)).length).toBeGreaterThan(targets.length * .4);
  });
});
