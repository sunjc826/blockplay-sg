import { describe, expect, it } from 'vitest';
import { createHeatField, DISTRICT_HEAT, FACTION_SCALE, HEAT_TUNING, heatCurve, type HeatSector } from './faction-heat';

const box = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });
const sectors: HeatSector[] = [
  { id: 'wharf', bounds: box(0, 100, 0, 100), weight: 2, heat: { mercenaries: { min: .6, max: 1, curve: 'slow-burn' } } },
  { id: 'gate', parent: 'wharf', bounds: box(40, 60, 40, 60), weight: 0 },
  { id: 'quay', bounds: box(-100, 0, 0, 100), weight: 1, heat: { 'armed-forces': { min: .3, max: .8 }, mercenaries: { min: .05, max: .4 } } },
];
const field = () => createHeatField({ sectors, defaults: DISTRICT_HEAT.medium });

describe('faction heat', () => {
  it('rests each side at its band floor, with sub-sectors inheriting their parent', () => {
    const heat = field();
    expect(heat.level('mercenaries', 'wharf')).toBe(.6);
    expect(heat.level('mercenaries', 'gate')).toBe(.6);
    expect(heat.band('mercenaries', 'gate').curve).toBe('slow-burn');
    expect(heat.level('armed-forces', 'quay')).toBe(.3);
    expect(heat.level('armed-forces', 'wharf')).toBe(DISTRICT_HEAT.medium['armed-forces'].min);
    expect(heat.level('mercenaries', null)).toBe(DISTRICT_HEAT.medium.mercenaries.min);
  });
  it('finds the most specific sector at a point', () => {
    const heat = field();
    expect(heat.sectorAt(50, 50)?.id).toBe('gate');
    expect(heat.sectorAt(10, 10)?.id).toBe('wharf');
    expect(heat.sectorAt(500, 500)).toBeNull();
  });
  it('heats the side that takes losses, spills up to the parent and leaks, damped, to the other side', () => {
    const heat = field();
    heat.casualty('mercenaries', 'gate');
    expect(heat.level('mercenaries', 'gate')).toBeCloseTo(.6 + HEAT_TUNING.casualty);
    expect(heat.level('mercenaries', 'wharf')).toBeCloseTo(.6 + HEAT_TUNING.casualty * HEAT_TUNING.spill);
    const forces = heat.level('armed-forces', 'gate') - DISTRICT_HEAT.medium['armed-forces'].min;
    expect(forces).toBeGreaterThan(0);
    expect(forces).toBeLessThanOrEqual(HEAT_TUNING.casualty * HEAT_TUNING.leak + 1e-12);
    // The other side's leaked rise never leaks back.
    expect(heat.level('mercenaries', 'gate')).toBeCloseTo(.6 + HEAT_TUNING.casualty);
  });
  it('holds heat inside the band however hard a sector is fought over, and drains it back to the floor', () => {
    const heat = field();
    for (let i = 0; i < 60; i++) { heat.casualty('mercenaries', 'quay'); heat.casualty('armed-forces', 'quay'); }
    expect(heat.level('mercenaries', 'quay')).toBe(.4);
    expect(heat.level('armed-forces', 'quay')).toBe(.8);
    heat.step(1000);
    expect(heat.level('mercenaries', 'quay')).toBe(.05);
    expect(heat.level('armed-forces', 'quay')).toBe(.3);
  });
  it('dampens the leak as the other side nears its ceiling, so contested ground cannot run away', () => {
    const contested = createHeatField({ sectors: [{ id: 'c', bounds: box(0, 1, 0, 1), weight: 1 }], defaults: { 'armed-forces': { min: 0, max: 1 }, mercenaries: { min: 0, max: 1 } } });
    const rises: number[] = [];
    for (let i = 0; i < 6; i++) { const before = contested.level('armed-forces', 'c'); contested.casualty('mercenaries', 'c'); rises.push(contested.level('armed-forces', 'c') - before); }
    for (let i = 1; i < rises.length; i++) expect(rises[i]).toBeLessThanOrEqual(rises[i - 1] + 1e-12);
  });
  it('turns heat into troops, pace and the neediest sector, with the forces scaled down', () => {
    const heat = field();
    const cold = heat.troops('mercenaries'), slow = heat.topUpInterval('mercenaries');
    for (let i = 0; i < 20; i++) heat.casualty('mercenaries', 'wharf');
    expect(heat.troops('mercenaries')).toBeGreaterThan(cold);
    expect(heat.topUpInterval('mercenaries')).toBeLessThan(slow);
    expect(heat.troops('armed-forces')).toBeLessThanOrEqual(FACTION_SCALE['armed-forces'].troops[1]);
    expect(FACTION_SCALE['armed-forces'].troops[1]).toBeLessThan(FACTION_SCALE.mercenaries.troops[1] / 2);
    // Losses on the wharf leaked forces heat there too, so the forces now want it more than the quay.
    expect(heat.neediest('mercenaries', () => 0)?.id).toBe('wharf');
    expect(heat.neediest('armed-forces', () => 0)?.id).toBe('wharf');
    expect(field().neediest('armed-forces', () => 0)?.id).toBe('quay');
    // Troops already there count against a sector.
    expect(field().neediest('mercenaries', s => s.id === 'wharf' ? 20 : 0)?.id).toBe('quay');
  });
  it('shapes each curve as named', () => {
    expect(heatCurve(.5, 'linear')).toBe(.5);
    expect(heatCurve(.5, 'slow-burn')).toBeLessThan(.25);
    expect(heatCurve(.5, 'hair-trigger')).toBeGreaterThan(.75);
    expect([0, .3, .6, .9, 1].map(h => heatCurve(h, 'tiers'))).toEqual([0, 1 / 3, 2 / 3, 1, 1]);
  });
});
