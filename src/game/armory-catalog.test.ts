import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, byUnlock, isEnemyIssue, tierRank, type ShopItem } from './armory-catalog';

const shelf = (family: number) => ARMORY_CATALOG.filter(item => item.category === 'weapon' && item.family === family && !isEnemyIssue(item)).sort(byUnlock);

describe('how the shop shelves weapons', () => {
  it('puts every platform in unlock order, rarity breaking ties', () => {
    for (const family of [0, 1, 2, 3, 4]) {
      const items = shelf(family);
      expect(items[0].tier, `family ${family}`).toBe('Issued');
      items.slice(1).forEach((item, i) => {
        const before = items[i], level = (entry: ShopItem) => entry.requiredLevel ?? 1;
        expect(level(item), item.id).toBeGreaterThanOrEqual(level(before));
        if (level(item) === level(before)) expect(tierRank(item.tier), item.id).toBeGreaterThanOrEqual(tierRank(before.tier));
      });
    }
  });
  it('shelves the sidearm from the issued pistol up to the Mythic one', () => {
    expect(shelf(2).map(item => item.id)).toEqual(['p30-issued', 'p30-sotong', 'p30-kopi', 'p30-silent', 'p30-chiong', 'p30-kiasu', 'p30-marksman', 'p30-atas']);
  });
  it('lets rarity decide between weapons unlocked at the same level', () => {
    const same = (tier: ShopItem['tier']) => ({ ...ARMORY_CATALOG[0], requiredLevel: 5, tier });
    expect(byUnlock(same('Mythic'), same('Elite'))).toBeGreaterThan(0);
    expect(byUnlock(same('Field'), same('Ultra'))).toBeLessThan(0);
  });
});
