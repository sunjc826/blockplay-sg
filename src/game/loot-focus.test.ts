import { describe, expect, it } from 'vitest';
import { CONSUMABLE_LIMIT, itemById } from './armory-catalog';
import { variantSpec } from './armory-state';
import type { FieldLoot } from './expedition-loot';
import { FPS_WEAPONS } from './fps-rules';
import { beltRoom, focusLoot, lookLimit, lootCard, lootUnits, LOOT_REACH, type LootCardContext } from './loot-focus';

const loot = (id: string, x: number, z: number, patch: Partial<FieldLoot> = {}): FieldLoot =>
  ({ id, zoneId: 'marina-bay', kind: 'medical', catalogId: 'kit-bandage', name: 'Elastic bandage', tier: 'Issued', x, z, amount: 25, ...patch });
const feet = { x: 0, y: 0, z: 0 }, eye = { x: 0, y: 1.75, z: 0 };
/** A unit view from the eye towards a point. */
const toward = (x: number, y: number, z: number) => { const d = Math.hypot(x - eye.x, y - eye.y, z - eye.z); return { x: (x - eye.x) / d, y: (y - eye.y) / d, z: (z - eye.z) / d }; };

describe('looking at loot', () => {
  it('shows nothing for an item in reach that the player is not looking at', () => {
    const crate = loot('crate', 0, -2);
    expect(focusLoot([crate], feet, eye, toward(0, .25, -2))?.id).toBe('crate');
    // Looking level, over it, or turned away: no card.
    expect(focusLoot([crate], feet, eye, { x: 0, y: 0, z: -1 })).toBeNull();
    expect(focusLoot([crate], feet, eye, toward(2, .25, 0))).toBeNull();
    expect(focusLoot([crate], feet, eye, { x: 0, y: 0, z: 1 })).toBeNull();
  });
  it('shows nothing for an item looked at from beyond reach or from another floor', () => {
    const far = loot('far', 0, -(LOOT_REACH + .3)), above = loot('above', 0, -1.5, { y: 3.4 });
    expect(focusLoot([far], feet, eye, toward(far.x, .25, far.z))).toBeNull();
    expect(focusLoot([above], feet, eye, toward(0, 3.65, -1.5))).toBeNull();
    expect(focusLoot([above], { ...feet, y: 3.4 }, { ...eye, y: 3.4 + 1.75 }, { x: 0, y: -1.5, z: -1.5 })?.id).toBe('above');
  });
  it('tells two items side by side apart by where the player looks', () => {
    const left = loot('left', -.7, -2), right = loot('right', .7, -2);
    expect(focusLoot([left, right], feet, eye, toward(-.7, .25, -2))?.id).toBe('left');
    expect(focusLoot([left, right], feet, eye, toward(.7, .25, -2))?.id).toBe('right');
  });
  it('is more forgiving close up than at arm\'s length', () => {
    expect(lookLimit(.8)).toBeGreaterThan(lookLimit(2.8));
    expect(lookLimit(.01)).toBeLessThanOrEqual(36 * Math.PI / 180);
  });
  it('ignores a view it cannot read', () => {
    expect(focusLoot([loot('crate', 0, -2)], feet, eye, { x: 0, y: 0, z: 0 })).toBeNull();
    expect(focusLoot([loot('crate', 0, -2)], { ...feet, x: NaN }, eye, toward(0, .25, -2))).toBeNull();
  });
});

describe('the loot card', () => {
  const sar = FPS_WEAPONS[0], context = (patch: Partial<LootCardContext> = {}): LootCardContext => ({
    weapons: FPS_WEAPONS, belt: {}, plate: itemById('plate-soft'), replaces: family => family, variantOf: () => 'sar-issued',
    variantSpec: item => variantSpec(item), ...patch,
  });
  it('compares a found weapon with the one it puts down', () => {
    const garang = itemById('sar-vanguard')!;
    const card = lootCard(loot('gun', 0, 0, { kind: 'weapon', catalogId: garang.id, name: garang.name, tier: garang.tier, amount: 1 }), context());
    expect(card.action).toBe('Swap'); expect(card.detail).toContain(sar.name);
    expect(card.stats.find(stat => stat.label === 'DMG')).toMatchObject({ trend: 'up' });
    expect(card.description).toBe(garang.flavorText);
  });
  it('offers the rounds of a weapon already in hand', () => {
    const card = lootCard(loot('gun', 0, 0, { kind: 'weapon', catalogId: 'sar-issued', name: 'SAR 21 · BMT', amount: 1 }), context());
    expect(card.action).toBe('Take ammo'); expect(card.stats.every(stat => !stat.trend)).toBe(true);
  });
  it('rates inserts against the ones worn', () => {
    const card = lootCard(loot('plates', 0, 0, { kind: 'armor', catalogId: 'plate-ceramic', name: 'Ceramic plate set', tier: 'Field', amount: 1 }), context());
    expect(card.action).toBe('Equip'); expect(card.detail).toBe('Replaces Soft armor inserts');
    expect(card.stats.find(stat => stat.label === 'ARMOR')).toMatchObject({ value: '75', trend: 'up' });
    expect(card.stats.find(stat => stat.label === 'WEIGHT')).toMatchObject({ trend: 'down' });
  });
  it('sends supplies to their belt slot, and says when the slot is full', () => {
    const bandage = loot('bandage', 0, 0);
    expect(lootCard(bandage, context())).toMatchObject({ action: 'Pick up', detail: 'To belt slot 5 · Bandage', type: 'Medical' });
    expect(lootCard(bandage, context({ belt: { 'kit-bandage': CONSUMABLE_LIMIT } })).blocked).toBe('Bandage slot full');
    expect(lootCard(loot('food', 0, 0, { catalogId: 'food-curry-puff', name: 'Curry puff' }), context()).detail).toBe('To belt slot 4 · Food');
  });
  it('counts an ammunition crate in pouches', () => {
    const pouch = itemById('kit-ammo')!, crate = loot('ammo', 0, 0, { kind: 'ammo', catalogId: 'kit-ammo', name: pouch.name, amount: 180 });
    expect(lootUnits(crate, pouch)).toBe(2); expect(lootUnits({ ...crate, amount: 30 }, pouch)).toBe(1);
    expect(lootCard(crate, context()).name).toBe(`${pouch.name} ×2`);
    expect(beltRoom({ 'kit-ammo': CONSUMABLE_LIMIT - 1 }, 'kit-ammo')).toBe(1);
  });
});
