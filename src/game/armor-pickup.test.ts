import { describe, expect, it } from 'vitest';
import { itemById } from './armory-catalog';
import { armorPickup } from './armor-pickup';

const soft = itemById('plate-soft')!, aegis = itemById('plate-elite')!;

describe('armor pickups', () => {
  it('adds the dropped plate value without replacing the equipped inserts', () => {
    expect(armorPickup(20, aegis, soft)).toEqual({ armor: 55, restored: 35, equip: false });
    expect(armorPickup(90, aegis, soft)).toEqual({ armor: 100, restored: 10, equip: false });
  });
  it('keeps full armor and leaves the pickup available', () => {
    expect(armorPickup(100, aegis, soft)).toMatchObject({ armor: 100, equip: false, blocked: 'Armor full' });
    expect(armorPickup(100, aegis, aegis)).toMatchObject({ armor: 100, blocked: 'Armor full' });
  });
  it('repairs depleted inserts and caps even a stronger pickup at their capacity', () => {
    expect(armorPickup(0, soft, aegis)).toEqual({ armor: 35, restored: 35, equip: false });
    expect(armorPickup(10, soft, soft)).toEqual({ armor: 35, restored: 25, equip: false });
  });
  it('equips a full set when there are no inserts', () => {
    for (const worn of [undefined, itemById('plate-none')]) {
      expect(armorPickup(0, worn, soft)).toEqual({ armor: 35, restored: 35, equip: true });
    }
  });
  it('allows an intentional upgrade or downgrade, including at full armor', () => {
    expect(armorPickup(35, soft, aegis, 'swap')).toEqual({ armor: 100, restored: 65, equip: true });
    expect(armorPickup(100, aegis, soft, 'swap')).toEqual({ armor: 35, restored: 0, equip: true });
  });
  it('does not bypass the cap by swapping the same inserts', () => {
    expect(armorPickup(100, aegis, aegis, 'swap')).toMatchObject({ armor: 100, equip: false, blocked: 'Armor full' });
  });
});
