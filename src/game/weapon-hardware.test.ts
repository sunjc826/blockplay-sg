import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { hardwareByPart, weaponHardware, type HardwareKind } from './weapon-hardware';

const kinds = (id: string) => weaponHardware(id).map(entry => entry.kind);
const of = (id: string, kind: HardwareKind) => weaponHardware(id).find(entry => entry.kind === kind);

describe('what a variant wears', () => {
  it('leaves the issued platforms bare, because they are built from nothing', () => {
    expect(weaponHardware('sar-issued')).toEqual([]);
    expect(weaponHardware('ult-issued')).toEqual([]);
  });
  it('ignores anything that is not a weapon', () => {
    expect(weaponHardware('skin-gold')).toEqual([]);
    expect(weaponHardware('mag-extended')).toEqual([]);
    expect(weaponHardware('not-a-real-id')).toEqual([]);
  });
  it('reads a part by what it does, not by the weapon it belongs to', () => {
    // Ranger: a barrel that adds damage, and a gas port that shortens the cycle.
    expect(kinds('sar-ranger')).toEqual(['barrel', 'gas']);
    expect(kinds('sar-vanguard')).toEqual(['barrel', 'magazine', 'gas', 'buffer']);
    expect(kinds('sar-marksman')).toEqual(['barrel', 'magazine', 'gas', 'freefloat']);
    expect(kinds('ult-patrol')).toEqual(['barrel', 'magazine']);
    expect(kinds('ult-bastion')).toEqual(['barrel', 'magazine', 'gas', 'bipod']);
  });
  it('gives every paid variant something to see', () => {
    for (const weapon of ARMORY_CATALOG.filter(item => item.category === 'weapon' && item.price > 0)) {
      expect(weaponHardware(weapon.id).length, weapon.id).toBeGreaterThan(0);
    }
  });
});

describe('how pronounced each fitting is', () => {
  it('scales a barrel with the damage its part is credited for', () => {
    const [ranger, vanguard, marksman] = ['sar-ranger', 'sar-vanguard', 'sar-marksman'].map(id => of(id, 'barrel')!.weight);
    expect(ranger).toBeLessThan(vanguard);
    expect(vanguard).toBeLessThan(marksman);
    expect(marksman).toBeLessThanOrEqual(1);
  });
  it('ports a barrel that carries its own muzzle velocity, and only that one', () => {
    expect(of('sar-marksman', 'barrel')!.extended).toBe(true);
    expect(of('ult-bastion', 'barrel')!.extended).toBe(true);
    expect(of('sar-vanguard', 'barrel')!.extended).toBe(false);
  });
  it('vents the one barrel that was lightened rather than thickened', () => {
    // The Patrol barrel is the only part in the catalog that adds movement.
    expect(of('ult-patrol', 'barrel')!.lightened).toBe(true);
    expect(of('ult-patrol', 'barrel')!.label).toBe('Vented barrel');
    expect(ARMORY_CATALOG.flatMap(item => item.build ?? []).filter(part => (part.mobility ?? 1) > 1)).toHaveLength(1);
  });
  it('shrinks a drum that gave rounds up and deepens one that took them on', () => {
    expect(of('ult-patrol', 'magazine')!.weight).toBeLessThan(0);
    expect(of('ult-patrol', 'magazine')!.label).toBe('Lighter drum');
    expect(of('ult-centurion', 'magazine')!.weight).toBeGreaterThan(0);
    expect(of('ult-bastion', 'magazine')!.weight).toBeGreaterThan(of('ult-centurion', 'magazine')!.weight);
  });
  it('reads a rifle magazine as a magazine and a support drum as a drum', () => {
    expect(of('sar-vanguard', 'magazine')!.label).toBe('Extended magazine');
    expect(of('ult-centurion', 'magazine')!.label).toBe('Deeper drum');
  });
  it('names fitted handling hardware after what the armoury installed', () => {
    expect(of('ult-bastion', 'bipod')!.name).toContain('Bipod');
    expect(of('sar-marksman', 'freefloat')!.name).toContain('Free-floated');
    // Anything else fitted to that slot is a buffer at the butt.
    expect(of('sar-vanguard', 'buffer')!.name).toBe('Match trigger group');
    expect(of('ult-centurion', 'buffer')).toBeTruthy();
  });
});

describe('what the shop says about it', () => {
  it('credits each fitting to the part the dossier lists it under', () => {
    const byPart = hardwareByPart('sar-marksman');
    expect(byPart.get('sar-heavy-match-barrel')?.kind).toBe('barrel');
    expect(byPart.get('sar-extended-well')?.kind).toBe('magazine');
    expect(byPart.get('fitted:handling')?.kind).toBe('freefloat');
    // Every entry points at a part the dossier actually prints.
    const printed = new Set([...(itemById('sar-marksman')!.build ?? []).map(part => part.id), 'fitted:optic', 'fitted:handling']);
    for (const key of byPart.keys()) expect(printed.has(key), key).toBe(true);
  });
  it('gives every fitting a chip and a sentence', () => {
    for (const weapon of ARMORY_CATALOG.filter(item => item.category === 'weapon')) {
      for (const entry of weaponHardware(weapon.id)) {
        expect(entry.label.length, entry.part).toBeGreaterThan(2);
        expect(entry.visual.length, entry.part).toBeGreaterThan(10);
      }
    }
  });
});
