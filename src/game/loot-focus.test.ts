import { describe, expect, it } from 'vitest';
import { CONSUMABLE_LIMIT, itemById } from './armory-catalog';
import { variantSpec } from './armory-state';
import type { FieldLoot } from './expedition-loot';
import { FPS_WEAPONS } from './fps-rules';
import { ammoTarget, beltRoom, focusLoot, lookLimit, lootCard, LOOT_REACH, MAX_RESERVE, type CarriedGun, type LootCardContext } from './loot-focus';

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

const gun = (family: number, reserve: number): CarriedGun => ({ family, spec: FPS_WEAPONS[family], reserve });

describe('the loot card', () => {
  const sar = FPS_WEAPONS[0], context = (patch: Partial<LootCardContext> = {}): LootCardContext => ({
    weapons: FPS_WEAPONS, belt: {}, plate: itemById('plate-soft'), armor: 20, replaces: family => family, variantOf: () => 'sar-issued',
    carried: [gun(0, 120), gun(2, 60)], inHand: 0,
    variantSpec: item => variantSpec(item), ...patch,
  });
  it('compares a found weapon with the one it puts down', () => {
    const garang = itemById('sar-vanguard')!;
    const card = lootCard(loot('gun', 0, 0, { kind: 'weapon', catalogId: garang.id, name: garang.name, tier: garang.tier, amount: 1 }), context());
    expect(card.action).toBe('Swap'); expect(card.detail).toContain(sar.name);
    expect(card.stats.find(stat => stat.label === 'DMG')).toMatchObject({ trend: 'up' });
    expect(card.description).toBe(garang.flavorText);
  });
  it('says a found gun brings only its magazine, and keeps a same-calibre reserve', () => {
    const route = itemById('ult-issued')!, mag = itemById('mag-tumpang')!;
    const ultimax = lootCard(loot('gun', 0, 0, { kind: 'weapon', catalogId: route.id, name: route.name, amount: 1 }), context({ replaces: () => 0 }));
    expect(ultimax.type).toContain('5.56 mm'); expect(ultimax.note).toBe('Magazine loaded · keeps your 120 × 5.56 mm');
    const gpmg = lootCard(loot('gun', 0, 0, { kind: 'weapon', catalogId: mag.id, name: mag.name, amount: 1 }), context({ replaces: () => 0 }));
    expect(gpmg.note).toBe('Magazine loaded · no 7.62 mm in reserve');
  });
  it('offers the rounds of a weapon already in hand', () => {
    const card = lootCard(loot('gun', 0, 0, { kind: 'weapon', catalogId: 'sar-issued', name: 'SAR 21 · BMT', amount: 1 }), context());
    expect(card.action).toBe('Take ammo'); expect(card.stats.every(stat => !stat.trend)).toBe(true);
  });
  it('previews collecting separately from deliberately swapping inserts', () => {
    const card = lootCard(loot('plates', 0, 0, { kind: 'armor', catalogId: 'plate-ceramic', name: 'Ceramic plate set', tier: 'Field', amount: 1 }), context());
    expect(card.action).toBe('Collect'); expect(card.detail).toBe('+15 armor · keeps Soft armor inserts');
    expect(card.stats).toEqual([{ label: 'ARMOR', value: '20 → 35 / 35', trend: 'up' }]);
    expect(card.swap?.detail).toBe('Replaces Soft armor inserts');
    expect(card.swap?.stats.find(stat => stat.label === 'ARMOR')).toMatchObject({ value: '20 → 75', trend: 'up' });
    expect(card.swap?.stats.find(stat => stat.label === 'WEIGHT')).toMatchObject({ trend: 'down' });
  });
  it('blocks collecting at full armor while still previewing a deliberate downgrade', () => {
    const card = lootCard(loot('plates', 0, 0, { kind: 'armor', catalogId: 'plate-soft' }), context({ plate: itemById('plate-elite'), armor: 100 }));
    expect(card.blocked).toBe('Armor full');
    expect(card.swap?.stats.find(stat => stat.label === 'ARMOR')).toMatchObject({ value: '100 → 35', trend: 'down' });
    expect(card.swap?.stats.find(stat => stat.label === 'ABSORB')).toMatchObject({ value: '45%', trend: 'down' });
  });
  it('equips an empty vest and does not offer redundant swaps for the same inserts', () => {
    const plates = loot('plates', 0, 0, { kind: 'armor', catalogId: 'plate-soft' });
    const emptyVest = lootCard(plates, context({ plate: itemById('plate-none'), armor: 0 }));
    expect(emptyVest).toMatchObject({ action: 'Equip', detail: 'Fits the empty vest' });
    expect(emptyVest.swap).toBeUndefined();
    expect(lootCard(plates, context()).swap).toBeUndefined();
  });
  it('shows special traits and movement costs before a swap', () => {
    const plates = loot('plates', 0, 0, { kind: 'armor', catalogId: 'plate-durian' });
    expect(lootCard(plates, context()).swap?.note).toBe('Rated for GPMG rounds · 7% movement cost · Scent reveals you to enemies');
    expect(lootCard({ ...plates, catalogId: 'plate-pineapple' }, context()).swap?.note).toContain('20% deflect chance');
  });
  it('sends supplies to their belt slot, and says when the slot is full', () => {
    const bandage = loot('bandage', 0, 0);
    expect(lootCard(bandage, context())).toMatchObject({ action: 'Pick up', detail: 'To belt slot 5 · Bandage', type: 'Medical' });
    expect(lootCard(bandage, context({ belt: { 'kit-bandage': CONSUMABLE_LIMIT } })).blocked).toBe('Bandage slot full');
    expect(lootCard(loot('food', 0, 0, { catalogId: 'food-curry-puff', name: 'Curry puff' }), context()).detail).toBe('To belt slot 4 · Food');
  });
  it('sends loose rounds to a carried gun of their calibre, and refuses the rest', () => {
    const rifle = loot('ammo', 0, 0, { kind: 'ammo', catalogId: undefined, name: '5.56 mm rounds', caliberMm: 5.56, amount: 60 });
    expect(lootCard(rifle, context())).toMatchObject({ type: 'Ammunition', detail: `Into ${FPS_WEAPONS[0].name}`, stats: [{ value: '+60' }, { value: '120 → 180' }] });
    const link = { ...rifle, name: '7.62 mm link', caliberMm: 7.62 };
    expect(lootCard(link, context()).blocked).toBe('No 7.62 mm gun carried');
    expect(lootCard(rifle, context({ carried: [gun(0, MAX_RESERVE)] })).blocked).toBe('Reserve full');
    expect(lootCard({ ...rifle, caliberMm: 9 }, context()).detail).toBe(`Into ${FPS_WEAPONS[2].name}`);
  });
  it('fills the gun in hand first when two carried guns share a calibre', () => {
    const carried = [gun(0, 50), gun(1, 80), gun(2, 30)];
    expect(ammoTarget(5.56, carried, 1)?.family).toBe(1);
    expect(ammoTarget(5.56, carried, 2)?.family).toBe(0);
    expect(ammoTarget(5.56, [gun(0, MAX_RESERVE), gun(1, 80)], 0)?.family).toBe(1);
    expect(ammoTarget(12.7, carried, 0)).toBeNull();
    expect(beltRoom({ 'kit-bandage': CONSUMABLE_LIMIT - 1 }, 'kit-bandage')).toBe(1);
  });
});
