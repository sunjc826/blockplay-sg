import { createExpeditionLoot } from './expedition-loot';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GRENADE_CATALOG, grenadeEffectLines, grenadeWhistleLine } from './grenade-catalog';
import { itemById, consumableLimit } from './armory-catalog';
import { launchGrenade, stepGrenadeFlight, type GrenadeTrace } from './grenade-flight';
import { createGrenadeSystem, grenadePayloads, grenadePops, grenadeSmokeBetween, validThrowGrenade } from './grenade-system';
import { applyGrenadeConditions, advanceGrenadeConditions, arenaConditionModifiers, validGrenadeConditions, type ActiveGrenadeConditions } from './grenade-effects';
import { createProfile, restoreProfile, purchase } from './armory-state';
import { heldSupplies, pickUtility, grenadeOptions, beltWeightKg } from './utility-belt';
import { buildGrenadeModel } from './grenade-models';
import { supplyWeightKg } from './fps-encumbrance';
const spec = (id = 'frag') => itemById(`grenade-${id}`)!.grenade!;
const ground: GrenadeTrace = (a, b) => b.y <= .08 ? { point: { x: a.x + (b.x - a.x) * (a.y - .08) / (a.y - b.y), y: .08, z: a.z + (b.z - a.z) * (a.y - .08) / (a.y - b.y) }, normal: { x: 0, y: 1, z: 0 } } : null;
const throwInput = (id = 'frag', cooked = 0) => ({ id: `grenade-${id}`, origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: Math.SQRT1_2, z: -Math.SQRT1_2 }, under: false, cooked });
describe('grenade catalogue and belt', () => {
  it('sells every planned item with its own limits, weight and effect lines', () => {
    expect(GRENADE_CATALOG).toHaveLength(13);
    for (const i of GRENADE_CATALOG) { expect(i.supplyType).toBe('grenade'); expect(grenadeEffectLines(i.grenade).length).toBeGreaterThan(0); expect(consumableLimit(i)).toBe(['Legendary', 'Mythic'].includes(i.tier) ? 2 : 4); }
    expect(beltWeightKg({ 'grenade-durian': 2 }, supplyWeightKg)).toBe(3.2);
  });
  it('clamps saved and incoming counts and enforces shop caps', () => {
    const p = createProfile(); p.consumables = { 'grenade-frag': 99, 'grenade-whistle': 99 }; p.credits = 10000;
    expect(restoreProfile(JSON.stringify(p)).consumables).toEqual({ 'grenade-frag': 4, 'grenade-whistle': 2 });
    expect(heldSupplies(p.consumables)).toEqual({ 'grenade-frag': 4, 'grenade-whistle': 2 });
    p.consumables['grenade-frag'] = 4; expect(purchase(p, 'grenade-frag').profile).toBe(p);
  });
  it('uses catalogue order in Auto, keeps a pinned pick and falls back when spent', () => {
    const held = { 'grenade-durian': 1, 'grenade-smoke': 1, 'grenade-frag': 1 };
    expect(pickUtility('grenade', held)?.id).toBe('grenade-frag');
    expect(pickUtility('grenade', held, undefined, null, 'grenade-durian')?.id).toBe('grenade-durian');
    expect(pickUtility('grenade', { 'grenade-frag': 1 }, undefined, null, 'grenade-durian')?.id).toBe('grenade-frag');
    expect(grenadeOptions(held).map(o => o.id)).toEqual([null, 'grenade-frag', 'grenade-smoke', 'grenade-durian']);
  });
  it('keeps every shared effect at least as strong and as long up the ladder', () => {
    const blast = ['frag', 'chilli', 'durian'].map(id => spec(id).effects.find(e => e.kind === 'blast')!);
    expect(blast.map(e => e.kind === 'blast' && e.blast.damage)).toEqual([100, 115, 135]);
    const max: Record<string, number> = {};
    for (const tier of ['Issued', 'Field', 'Elite', 'Ultra', 'Legendary', 'Mythic']) {
      const rung: Record<string, number> = {};
      for (const item of GRENADE_CATALOG.filter(i => i.tier === tier)) for (const e of item.grenade!.effects) {
        let values: Record<string, number> = {};
        if (e.kind === 'blast') values = { blast: e.blast.damage, blastRadius: e.blast.radius, ...(e.shred ? { shred: e.shred } : {}) };
        if (e.kind === 'cloud') values = { ...(e.blocksSight !== false ? { smokeRadius: e.radius, smokeTime: e.seconds } : {}), ...(e.dps ? { gas: e.dps } : {}) };
        if (e.kind === 'condition' && !e.lingering) values = { [e.condition]: e.seconds };
        if (e.kind === 'repel' || e.kind === 'reveal') values = { [`${e.kind}Radius`]: e.radius, [`${e.kind}Time`]: e.seconds };
        if (e.kind === 'bomblets') values = { count: e.count, bomblet: e.damage };
        for (const [k, v] of Object.entries(values)) { expect(v, `${item.id}: ${k}`).toBeGreaterThanOrEqual(max[k] ?? 0); rung[k] = Math.max(rung[k] ?? 0, v); }
      }
      Object.assign(max, rung);
    }
  });
  it.each(GRENADE_CATALOG)('builds and disposes the physical $name', item => {
    const model = buildGrenadeModel(item.id)!;
    expect(new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3()).length()).toBeLessThan(.8);
    expect(model.root.children.length).toBeGreaterThan(2); model.dispose();
  });
});
describe('grenade flight', () => {
  it('integrates gravity consistently across frame sizes', () => {
    const a = launchGrenade({ x: 0, y: 20, z: 0 }, { x: 1, y: 0, z: 0 }, spec()), b = structuredClone(a);
    for (let i = 0; i < 10; i++) stepGrenadeFlight(a, spec(), .1, () => null);
    for (let i = 0; i < 100; i++) stepGrenadeFlight(b, spec(), .01, () => null);
    expect(a.position.x).toBeCloseTo(14); expect(a.position.y).toBeCloseTo(15.1); expect(a.position).toEqual(b.position);
  });
  it('lobs at half speed, and reduces the fuse by the cook time', () => {
    const a = launchGrenade({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, spec(), true, 3);
    expect(a.velocity.x).toBe(7); expect(a.remaining).toBe(.5);
    expect(stepGrenadeFlight(a, spec(), .5, ground)).toBe(true);
  });
  it('bounces off walls with the catalogue restitution', () => {
    const a = launchGrenade({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, spec());
    stepGrenadeFlight(a, spec(), .1, (_a, b) => b.x >= 1 ? { point: { ...b, x: 1 }, normal: { x: -1, y: 0, z: 0 } } : null);
    expect(a.velocity.x).toBeCloseTo(-4.2); expect(a.position.x).toBeLessThan(1);
  });
  it('lands chope flat without bouncing', () => {
    const a = launchGrenade({ x: 0, y: .1, z: 0 }, { x: 1, y: 0, z: 0 }, spec('chope'));
    expect(stepGrenadeFlight(a, spec('chope'), .25, ground)).toBe(true); expect(a.rested).toBe(true); expect(a.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('splits oranges at the apex and launches the finale only after resting for 2 s', () => {
    const orange = launchGrenade({ x: 0, y: 1, z: 0 }, { x: 0, y: .6, z: -.8 }, spec('oranges'));
    expect(stepGrenadeFlight(orange, spec('oranges'), .5, ground)).toBe(false); expect(stepGrenadeFlight(orange, spec('oranges'), .5, ground)).toBe(true);
    const finale = launchGrenade({ x: 0, y: .1, z: 0 }, { x: 1, y: 0, z: 0 }, spec('finale'));
    for (let i = 0; i < 20; i++) stepGrenadeFlight(finale, spec('finale'), .1, ground);
    expect(finale.launched).toBe(false);
    for (let i = 0; i < 10; i++) stepGrenadeFlight(finale, spec('finale'), .1, ground);
    expect(finale.launched).toBe(true);
  });
});
describe('grenade conditions and timelines', () => {
  it('refreshes without stacking; halves only human loss-of-control time', () => {
    const active: ActiveGrenadeConditions = {};
    applyGrenadeConditions(active, [{ kind: 'at-attention', strength: 1, seconds: 3.5 }], true);
    expect(active['at-attention']?.remaining).toBe(1.75); expect(arenaConditionModifiers(active).frozen).toBe(true);
    advanceGrenadeConditions(active, 1); applyGrenadeConditions(active, [{ kind: 'at-attention', strength: .5, seconds: 1 }]);
    expect(active['at-attention']).toMatchObject({ strength: 1, remaining: 1 });
    expect(validGrenadeConditions(active)).toBe(true); advanceGrenadeConditions(active, 2); expect(active).toEqual({});
    expect(validGrenadeConditions({ invulnerable: { strength: 1, remaining: 1, seconds: 1 } })).toBe(false);
  });
  it('applies the reverse of wired and steady to reloads, aim and recoil', () => {
    const active: ActiveGrenadeConditions = {}; applyGrenadeConditions(active, [{ kind: 'retching', strength: .25, seconds: 5 }, { kind: 'streaming-eyes', strength: .3, seconds: 6 }]);
    expect(arenaConditionModifiers(active)).toMatchObject({ reload: .8, recoil: 1.3 });
    expect(arenaConditionModifiers(active).aim).toBeCloseTo(1 / 1.3);
  });
  it('enforces the flight cap and rejects invented or non-finite throws', () => {
    const system = createGrenadeSystem(ground, () => {});
    expect(validThrowGrenade({ ...throwInput(), cooked: NaN })).toBe(false);
    expect(validThrowGrenade({ ...throwInput(), id: 'grenade-invented' })).toBe(false);
    for (let i = 0; i < 24; i++) expect(system.throwGrenade('a', throwInput())).toBe(true);
    expect(system.throwGrenade('a', throwInput())).toBe(false); system.reset(); expect(system.live).toHaveLength(0);
  });
  it('detonates a fully cooked grenade in the hand and resolves a burst once', () => {
    const bursts: unknown[] = [], system = createGrenadeSystem(ground, b => bursts.push(b));
    system.throwGrenade('a', throwInput('frag', 3.5)); system.step(.02);
    expect(system.live).toHaveLength(0); expect(system.events[0].point).toEqual(throwInput().origin); expect(bursts).toHaveLength(1);
    system.step(.02); expect(bursts).toHaveLength(1);
  });
  it('keeps the red ring up before all four credited mortar rounds', () => {
    const system = createGrenadeSystem(ground, () => {}); system.throwGrenade('a', throwInput('red-smoke', 1.5)); system.step(.02);
    const payloads = grenadePayloads(system.events[0]);
    const rounds = payloads.filter(p => p.type === 'munition'); expect(rounds).toHaveLength(4);
    expect(rounds.every(p => p.caller === 'a' && p.time >= 8 && p.blast?.damage === 110)).toBe(true);
    expect(payloads.some(p => p.type === 'marker' && p.from === 0)).toBe(true);
    expect(payloads.some(p => p.type === 'reveal' && p.until === 20)).toBe(true);
  });
  it('scatters eight oranges, and lays sixteen pops along a line over four seconds', () => {
    const event = { serial: 1, id: 'grenade-oranges', caller: 'a', point: { x: 0, y: 5, z: 0 }, heading: 0, start: 0, seed: 1 };
    expect(grenadePops(event)).toHaveLength(8); expect(grenadePops(event).every(p => p.point.y === .15 && p.blast.damage === 50)).toBe(true);
    const pops = grenadePops({ ...event, id: 'grenade-firecrackers' }); expect(pops).toHaveLength(16);
    expect(pops.at(-1)?.time).toBe(4); expect(pops.every(p => p.point.x === 0)).toBe(true);
  });
});

it('blocks every sight segment through smoke, but not above it or through durian smell', () => {
 const event = { serial: 1, id: 'grenade-smoke', caller: 'a', point: { x: 0, y: 0, z: 0 }, heading: 0, start: 0, seed: 1 };
 expect(grenadeSmokeBetween([event], 1, { x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 })).toBe(true);
 expect(grenadeSmokeBetween([event], 1, { x: -10, y: 8, z: 0 }, { x: 10, y: 8, z: 0 })).toBe(false);
 expect(grenadeSmokeBetween([{ ...event, id: 'grenade-durian' }], 1, { x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 })).toBe(false);
 expect(grenadeSmokeBetween([event], 26, { x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 })).toBe(false);
});
it('changes the whistle line with the player register', () => {
 expect(grenadeWhistleLine({ level: 1, rank: 'Recruit' })).toBe('FALL IN!');
 expect(grenadeWhistleLine({ level: 20, rank: 'Captain' })).toBe('Fall in, Captain.');
 expect(grenadeWhistleLine({ level: 35, rank: 'Colonel' })).toBe('Sorry sir, fall in please.');
 expect(grenadeWhistleLine({ level: 35, rank: 'Colonel', tone: 'recruit' })).toBe('FALL IN!');
});

it('keeps unthrown enemy grenades as expedition pickups and never drops outlandish or friendly kit', () => {
 const loot = createExpeditionLoot('grenade-drop'), at = { x: 0, y: 0, z: 0 };
 const frag = loot.fallen('marina-bay', { key: 'one:1', side: 'opposition', grenade: 'grenade-frag' }, at).loot.find(i => i.catalogId === 'grenade-frag');
 expect(frag).toMatchObject({ dropped: true, kind: 'medical', amount: 1 });
 expect(loot.remaining('marina-bay').some(i => i.id === frag!.id)).toBe(true);
 expect(loot.fallen('marina-bay', { key: 'two:1', side: 'opposition', grenade: 'grenade-durian' }, at).loot.some(i => i.catalogId === 'grenade-durian')).toBe(false);
 expect(loot.fallen('marina-bay', { key: 'three:1', side: 'forces', grenade: 'grenade-frag' }, at).loot.some(i => i.catalogId === 'grenade-frag')).toBe(false);
});
