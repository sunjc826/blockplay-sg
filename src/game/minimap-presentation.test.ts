import { expect, it } from 'vitest';
import { minimapColor, minimapLabels, minimapMarkerCategory } from './minimap-presentation';

it('keeps water blue and foliage green while adapting schematic colors to a dark map', () => {
  const rgb = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const water = rgb(minimapColor('#76a8b1')), park = rgb(minimapColor('#6f9457'));
  expect(water[2]).toBeGreaterThan(water[0]);
  expect(park[1]).toBeGreaterThan(park[0]);
  expect(minimapColor('#eee7ce')).not.toBe('#eee7ce');
});

it('prioritizes selected labels, moves collisions and omits labels once space is full', () => {
  const placed = minimapLabels(Array.from({ length: 20 }, (_, i) => ({ id: `label-${i}`, name: 'Overlapping landmark', x: 100, y: 80, priority: i })), 200, 160);
  expect(placed.has('label-19')).toBe(true);
  expect(placed.size).toBeLessThan(20);
  const ys = [...placed.values()].map(p => p.y);
  expect(new Set(ys).size).toBe(ys.length);
});

it('keeps long labels inside map edges and has deterministic layout', () => {
  const candidates = [{ id: 'a', name: 'A very long landmark name', x: -100, y: -100, priority: 1 }, { id: 'b', name: 'Other', x: 999, y: 999, priority: 1 }];
  expect(minimapLabels(candidates, 600, 440)).toEqual(minimapLabels([...candidates].reverse(), 600, 440));
  for (const p of minimapLabels(candidates, 600, 440).values()) { expect(p.x).toBeGreaterThan(24); expect(p.x).toBeLessThan(576); expect(p.y).toBeGreaterThanOrEqual(28); expect(p.y).toBeLessThan(400); }
});

it('describes equipment and infrastructure types without parsing their names', () => {
  const marker = { id: 'a', x: 0, z: 0, label: 'Local name' };
  expect(minimapMarkerCategory({ ...marker, kind: 'loot', lootType: 'food' })).toBe('Food');
  expect(minimapMarkerCategory({ ...marker, kind: 'facility', facilityType: 'helipad' })).toBe('Helipad');
  expect(minimapMarkerCategory({ ...marker, kind: 'landmark' })).toBe('Landmark');
});
