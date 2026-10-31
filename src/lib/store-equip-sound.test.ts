import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG } from '../game/armory-catalog';
import { storeEquipSound } from './store-equip-sound';
import manifest from '../audio/store/manifest.json';
import reload from '../audio/reload/manifest.json';

describe('equipment-dependent store cues', () => {
  it.each([
    ['sar-issued', 'equip-gun-bullpup'], ['ult-issued', 'equip-gun-drum'],
    ['ult-kongsi', 'equip-gun-drum-box'], ['p30-issued', 'equip-gun-pistol'],
    ['mag-issued', 'equip-gun-belt'], ['cis50-issued', 'equip-gun-heavy-belt'],
    ['xm8-carbine', 'equip-gun-carbine'], ['g36-rifle', 'equip-gun-rifle'],
    ['mg4-standard', 'equip-gun-light-belt'], ['kit-bandage', 'equip-medical'],
    ['kit-first-aid', 'equip-medical'], ['grenade-frag', 'equip-grenade'],
    ['paint-issued', 'equip'], ['skin-issued', 'equip'], ['kit-ammo', 'equip'],
    ['does-not-exist', 'equip'],
  ])('%s selects %s', (id, expected) => expect(storeEquipSound(id)).toBe(expected));

  it('covers every food and weapon variant with a longer published cue', () => {
    for (const item of ARMORY_CATALOG.filter(item => item.category === 'weapon' || item.supplyType === 'food')) {
      const sound = storeEquipSound(item.id);
      expect(sound, item.id).not.toBe('equip');
      expect(manifest.clips[sound].seconds, item.id).toBeGreaterThan(.8);
      if (item.supplyType === 'food') expect(sound).toBe('equip-food');
    }
  });

  it('keeps source timing and distinct feeds in lock-and-load sequences', () => {
    for (const [id, cue] of Object.entries(manifest.clips)) {
      if (!id.startsWith('equip-gun-') || !('sources' in cue)) continue;
      const sources = cue.sources as { group: keyof typeof reload.groups; at: number }[];
      expect(sources).toHaveLength(4);
      for (let i = 1; i < sources.length; i++) {
        const previous = sources[i - 1];
        expect(sources[i].at - previous.at).toBeGreaterThanOrEqual(reload.groups[previous.group][0].seconds + .095);
      }
    }
    const kongsi = manifest.clips['equip-gun-drum-box'];
    expect(kongsi.sources.map(s => s.group)).toEqual(['reload-rifle-in', 'reload-rifle-seat', 'reload-drum-back', 'reload-drum-release']);
  });
});
