import { describe, expect, it } from 'vitest';
import { FACTIONS, factionOf, hostile, isFactionId } from './factions';
import { arenaCharacterLook } from './character-looks';

describe('factions', () => {
  it('sides players with the forces and bots with the contractors unless told otherwise', () => {
    expect(factionOf({ bot: false })).toBe('forces');
    expect(factionOf({ bot: true })).toBe('mercenaries');
    expect(factionOf({ bot: true, faction: 'forces' })).toBe('forces');
    expect(isFactionId('mercenaries')).toBe(true);
    expect(isFactionId('constructor')).toBe(false);
  });
  it('makes contractors allies of each other, enemies of the forces, and keeps players fighting players', () => {
    const player = { bot: false }, bot = { bot: true };
    expect(hostile(bot, player)).toBe(true);
    expect(hostile(player, bot)).toBe(true);
    expect(hostile(bot, bot)).toBe(false);
    expect(hostile(player, player)).toBe(true);
  });
  it('dresses each side in its own fabric, camouflage and badges', () => {
    const forces = arenaCharacterLook({ bot: false, role: 'player', id: 'p' }), contractor = arenaCharacterLook({ bot: true, role: 'assault', id: 'bot-1' });
    expect(forces).toMatchObject({ top: FACTIONS.forces.uniform.top, camo: { pattern: { style: 'digital' }, on: 'all', headwear: true }, headwear: 'helmet', patches: FACTIONS.forces.uniform.patches });
    expect(contractor).toMatchObject({ top: FACTIONS.mercenaries.uniform.top, bottom: FACTIONS.mercenaries.uniform.bottom, camo: { pattern: { style: 'blotch' }, on: 'top' }, headwear: 'cap', patches: FACTIONS.mercenaries.uniform.patches });
    expect(contractor.eyewear).toBeTruthy();
    expect(forces.shoes).not.toBe(contractor.shoes);
    // Role still shapes the silhouette inside a side.
    expect(arenaCharacterLook({ bot: true, role: 'tank' })).toMatchObject({ headwear: 'helmet', plates: true, weapon: 'lmg' });
    expect(arenaCharacterLook({ bot: true, role: 'sniper' })).toMatchObject({ headwear: 'boonie', camo: { headwear: true } });
  });
});
