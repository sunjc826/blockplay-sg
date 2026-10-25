import { describe, expect, it } from 'vitest';
import { factionIdOf, getArenaFaction, hostile, listArenaFactions } from './arena-factions';
import { arenaCharacterLook } from './character-looks';

describe('arena factions', () => {
  it('sides players with the forces and bots with their role\'s faction unless the host says otherwise', () => {
    expect(factionIdOf({ bot: false })).toBe('armed-forces');
    expect(factionIdOf({ bot: true })).toBe('mercenaries');
    expect(factionIdOf({ bot: true, faction: 'armed-forces' })).toBe('armed-forces');
    expect(getArenaFaction('constructor')).toBeUndefined();
  });
  it('sets the mercenaries against the forces, and keeps players fighting players', () => {
    const player = { bot: false }, merc = { bot: true, faction: 'mercenaries' }, friend = { bot: true, faction: 'armed-forces' };
    expect(hostile(merc, player)).toBe(true);
    expect(hostile(merc, friend)).toBe(true);
    expect(hostile(merc, merc)).toBe(false);
    expect(hostile(friend, player)).toBe(false);
    expect(hostile(player, player)).toBe(true);
  });
  it('gives every faction its own camouflage, and each squad faction its own badges', () => {
    const styles = listArenaFactions().map(f => `${f.camo.pattern.style}:${f.camo.pattern.colors.join()}`);
    expect(new Set(styles).size).toBe(listArenaFactions().length);
    expect(getArenaFaction('armed-forces')!.patches.left!.design).toBe('flag');
    expect(getArenaFaction('mercenaries')!.patches.left!.design).toBe('diamond');
  });
  it('dresses each side in its own fabric, camouflage and badges, with role still shaping the silhouette', () => {
    const forces = arenaCharacterLook({ bot: false, role: 'player', id: 'p' }), merc = arenaCharacterLook({ bot: true, role: 'assault', id: 'bot-1' });
    const friend = arenaCharacterLook({ bot: true, role: 'assault', id: 'bot-9', faction: 'armed-forces' });
    expect(forces).toMatchObject({ camo: { pattern: { style: 'digital' }, on: 'all', headwear: true }, headwear: 'helmet', patches: getArenaFaction('armed-forces')!.patches });
    expect(merc).toMatchObject({ camo: { pattern: { style: 'blotch' }, on: 'top' }, headwear: 'cap', patches: getArenaFaction('mercenaries')!.patches });
    expect(merc.eyewear).toBeTruthy();
    // A friendly squad wears the players' uniform, not its role's default faction.
    expect(friend).toMatchObject({ headwear: 'helmet', patches: getArenaFaction('armed-forces')!.patches });
    expect(arenaCharacterLook({ bot: true, role: 'tank' })).toMatchObject({ headwear: 'helmet', plates: true, weapon: 'lmg' });
    expect(arenaCharacterLook({ bot: true, role: 'sniper' })).toMatchObject({ headwear: 'boonie', camo: { headwear: true } });
    // Either side can crew a mortar; the crew wears its side's uniform.
    expect(arenaCharacterLook({ bot: true, role: 'mortar-crew', faction: 'armed-forces' })).toMatchObject({ headwear: 'helmet', patches: getArenaFaction('armed-forces')!.patches });
    expect(arenaCharacterLook({ bot: true, role: 'mortar-crew' })).toMatchObject({ patches: getArenaFaction('mercenaries')!.patches });
  });
});
