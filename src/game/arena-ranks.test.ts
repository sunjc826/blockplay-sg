import { describe, expect, it } from 'vitest';
import { BOT_RANKS, drawRank, getBotRank, rankMix } from './arena-ranks';
import { chooseArmament, getArenaRole } from './arena-roles';
import { itemById } from './armory-catalog';
import { createArena } from './arena-rules';
import { arenaCharacterLook } from './character-looks';

const seeded = (seed = 7) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const tally = (draw: () => string, n = 4000) => { const counts: Record<string, number> = {}; for (let i = 0; i < n; i++) { const id = draw(); counts[id] = (counts[id] ?? 0) + 1; } return counts; };

describe('bot ranks', () => {
  it('steady the aim, quicken the eye and heavy the kit grade by grade', () => {
    const [recruit, regular, veteran] = BOT_RANKS;
    expect(recruit.aim).toBeGreaterThan(regular.aim); expect(regular.aim).toBeGreaterThan(veteran.aim);
    expect(recruit.reaction).toBeGreaterThan(veteran.reaction);
    expect(recruit.armor).toBeLessThan(veteran.armor);
    expect(veteran.kit.Elite).toBeGreaterThan(recruit.kit.Elite);
    expect(getBotRank(3)).toBe(veteran);
  });
  it('field mostly recruits from a quiet side and more veterans from a surging one', () => {
    for (const s of [0, .5, 1]) expect(rankMix(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(rankMix(0)[0]).toBeGreaterThan(rankMix(0)[2]);
    expect(rankMix(1)[2]).toBeGreaterThan(rankMix(1)[0]);
    const random = seeded(), quiet = tally(() => drawRank(0, random).id), hot = tally(() => drawRank(1, random).id);
    expect(quiet.recruit).toBeGreaterThan(quiet.veteran * 2);
    expect(hot.veteran).toBeGreaterThan(hot.recruit * 2);
  });
  it('arm veterans with elite variants more often than recruits', () => {
    const tank = getArenaRole('tank')!, random = seeded(3);
    const elite = (kit: typeof BOT_RANKS[number]['kit']) => tally(() => chooseArmament(tank, random, kit).tier).Elite ?? 0;
    expect(elite(BOT_RANKS[2].kit)).toBeGreaterThan(elite(BOT_RANKS[0].kit) * 2);
  });
});

describe('ranked bots in the arena', () => {
  it('wear their rank in their name, armour, dressings and drawn variant', () => {
    const arena = createArena([], 6, 'mixed');
    for (const bot of arena.snapshot().actors) {
      const rank = getBotRank(bot.rank!)!, role = getArenaRole(bot.role)!;
      expect(bot.name.startsWith(`${rank.title.opposition} `)).toBe(true);
      expect(bot.armor).toBeCloseTo(role.armor * rank.armor);
      expect(itemById(bot.variant!)).toBeDefined();
    }
  });
  it('show rank on the figure: chevrons on the sleeve, a recruit bare of plates, a veteran in plates, pack and shades', () => {
    const base = { bot: true, role: 'assault', id: 'bot-1', faction: 'mercenaries' };
    const recruit = arenaCharacterLook({ ...base, rank: 1 }), veteran = arenaCharacterLook({ ...base, rank: 3 });
    expect(recruit.patches?.right).toMatchObject({ design: 'chevrons', count: 1 });
    expect(veteran.patches?.right).toMatchObject({ design: 'chevrons', count: 3 });
    expect(recruit).toMatchObject({ plates: false, backpack: undefined, eyewear: undefined, headwear: 'cap' });
    expect(veteran).toMatchObject({ plates: true, headwear: 'helmet' });
    expect(veteran.backpack).toBeDefined(); expect(veteran.eyewear).toBeDefined();
    // Players carry no rank and keep their faction's own badge.
    expect(arenaCharacterLook({ bot: false, role: 'player', id: 'you' }).patches?.right?.design).not.toBe('chevrons');
  });
});
