import { describe, expect, it } from 'vitest';
import { planRoof, roofCoverage, ROOF, type Roof } from './roof-detail';

const roof: Roof = { x: 40, z: -20, top: 30, width: 30, depth: 14, yaw: 0, height: 30 };
const bare = () => false;

describe('roof detail', () => {
  it('rings a bare roof with a parapet that stays inside its footprint', () => {
    const parts = planRoof(roof, bare), parapet = parts.filter(p => p.kind === 'parapet');
    expect(parapet).toHaveLength(4);
    for (const p of parapet) {
      expect(p.y - p.h / 2).toBeCloseTo(roof.top, 6);
      expect(Math.abs(p.x - roof.x) + p.w / 2).toBeLessThanOrEqual(roof.width / 2 + 1e-6);
      expect(Math.abs(p.z - roof.z) + p.d / 2).toBeLessThanOrEqual(roof.depth / 2 + 1e-6);
    }
  });
  it('stands plant on the roof, inside the margin, apart from each other, the same every time', () => {
    const parts = planRoof(roof, bare), plant = parts.filter(p => p.kind !== 'parapet');
    expect(plant.some(p => p.kind === 'overrun')).toBe(true);
    expect(plant.filter(p => p.kind === 'condenser').length).toBeGreaterThan(1);
    for (const p of plant) {
      expect(p.y - p.h / 2).toBeCloseTo(roof.top, 6);
      expect(Math.abs(p.x - roof.x) + p.w / 2).toBeLessThanOrEqual(roof.width / 2 - ROOF.margin + 1e-6);
      expect(Math.abs(p.z - roof.z) + p.d / 2).toBeLessThanOrEqual(roof.depth / 2 - ROOF.margin + 1e-6);
    }
    for (const a of plant) for (const b of plant) if (a !== b) expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2).toBe(true);
    expect(planRoof(roof, bare)).toEqual(parts);
  });
  it('leaves alone a roof that is small, or already built on', () => {
    expect(planRoof({ ...roof, width: 5 }, bare)).toEqual([]);
    expect(roofCoverage(roof, () => true)).toBe(1);
    expect(planRoof(roof, () => true)).toEqual([]);
    // A tower on half of a podium: over the limit, so the podium stays as authored.
    expect(planRoof(roof, x => x > roof.x)).toEqual([]);
  });
  it('drops the parapet on a side that meets a taller neighbour and keeps plant off what stands there', () => {
    const neighbour = (x: number) => x > roof.x + roof.width / 2;
    const parts = planRoof(roof, neighbour);
    expect(parts.filter(p => p.kind === 'parapet')).toHaveLength(3);
    const penthouse = (x: number, _y: number, z: number) => Math.abs(x - roof.x) < 2 && Math.abs(z - roof.z) < 2;
    for (const p of planRoof(roof, penthouse).filter(p => p.kind !== 'parapet')) expect(Math.abs(p.x - roof.x) < 2 && Math.abs(p.z - roof.z) < 2).toBe(false);
  });
  it('gives an authored roof slab plant but no second parapet', () => {
    const parts = planRoof({ ...roof, capped: true }, bare);
    expect(parts.some(p => p.kind === 'parapet')).toBe(false);
    expect(parts.length).toBeGreaterThan(1);
  });
  it('turns with the building and gives a low block no lift overrun or tank', () => {
    const turned = planRoof({ ...roof, yaw: Math.PI / 2 }, bare).filter(p => p.kind === 'parapet');
    expect(turned.every(p => p.yaw === Math.PI / 2)).toBe(true);
    // The long sides now run along Z.
    expect(turned.filter(p => Math.abs(Math.abs(p.x - roof.x) - (roof.depth - ROOF.parapet.thickness) / 2) < 1e-6)).toHaveLength(2);
    const low = planRoof({ ...roof, height: 8 }, bare);
    expect(low.some(p => p.kind === 'overrun' || p.kind === 'tank')).toBe(false);
  });
});

describe('ground storey bays', () => {
  it('splits bays into blank wall, doors and shopfronts in the documented shares', async () => {
    const { storefrontBay, STOREFRONT, GROUND_STOREY } = await import('./world-night-lights');
    const counts = { blank: 0, door: 0, shopfront: 0 };
    for (let i = 0; i < 1000; i++) counts[storefrontBay((i + .5) / 1000)]++;
    expect(counts.blank / 1000).toBeCloseTo(STOREFRONT.blank, 2);
    expect(counts.door / 1000).toBeCloseTo(STOREFRONT.door, 2);
    expect(counts.shopfront).toBeGreaterThan(counts.door);
    // The opening and its fascia fit under the first row of windows.
    expect(STOREFRONT.head).toBeLessThan(GROUND_STOREY);
    expect(STOREFRONT.riser).toBeLessThan(STOREFRONT.head);
  });
});

describe('wall streaks', () => {
  it('runs each streak a different length inside the stated range', async () => {
    const { streakLength, STREAKS } = await import('./world-night-lights');
    expect(streakLength(0)).toBe(STREAKS.shortest);
    expect(streakLength(1)).toBe(STREAKS.longest);
    expect(streakLength(.5)).toBeLessThan((STREAKS.shortest + STREAKS.longest) / 2);
    expect(STREAKS.darken).toBeLessThan(.2);
  });
});
