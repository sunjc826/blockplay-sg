import { describe, expect, it } from 'vitest';
import { BARK_EVENTS, BARK_TUNING, barkKey, barkLines, createBarkDirector, RANK_IDS } from './npc-barks';
import { listArenaRoles, getArenaRole } from './arena-roles';

const FACTIONS = ['armed-forces', 'mercenaries'] as const;
const ROLES = [...listArenaRoles().map(role => role.id), 'mortar-crew', 'overwatch'];
/** A stream that cycles through fixed draws, so a test can say what the director rolls. */
const rolls = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe('bark lines', () => {
  it('give every faction, rank and role something to say for every event', () => {
    for (const faction of FACTIONS) for (const rank of [1, 2, 3]) for (const role of ROLES) for (const event of BARK_EVENTS) {
      const lines = barkLines({ faction, role, rank }, event);
      expect(lines.length, `${faction} ${rank} ${role} ${event}`).toBeGreaterThan(0);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(120);
    }
  });
  it('change with faction, rank and role', () => {
    const forces = barkLines({ faction: 'armed-forces', role: 'assault', rank: 1 }, 'contact');
    const black = barkLines({ faction: 'mercenaries', role: 'assault', rank: 1 }, 'contact');
    const veteran = barkLines({ faction: 'mercenaries', role: 'assault', rank: 3 }, 'contact');
    expect(forces).not.toEqual(black); expect(black).not.toEqual(veteran);
    // A gunner talks about belts, on top of their rank's lines.
    const gunner = barkLines({ faction: 'mercenaries', role: 'tank', rank: 2 }, 'reloading');
    expect(gunner.some(line => /belt/i.test(line))).toBe(true);
    expect(gunner).toEqual(expect.arrayContaining([...barkLines({ faction: 'mercenaries', role: 'assault', rank: 2 }, 'reloading')]));
    expect(getArenaRole('tank')).toBeTruthy();
  });
  it('fall back to the side a faction fights on, and to a regular without a rank', () => {
    expect(barkLines({ faction: 'someone-new', side: 'forces', role: 'assault', rank: 1 }, 'idle')).toEqual(barkLines({ faction: 'armed-forces', role: 'assault', rank: 1 }, 'idle'));
    expect(barkLines({ faction: 'mercenaries', role: 'assault' }, 'kill')).toEqual(barkLines({ faction: 'mercenaries', role: 'assault', rank: 2 }, 'kill'));
  });
  it('have a stable key for every line, for recordings to find', () => {
    const keys = new Set<string>();
    for (const faction of FACTIONS) for (const rank of [1, 2, 3]) for (const role of ROLES) for (const event of BARK_EVENTS)
      for (const line of barkLines({ faction, role, rank }, event)) {
        const key = barkKey({ faction, role, rank }, event, line);
        expect(key, line).toMatch(new RegExp(`^${faction}\\.(${[...RANK_IDS, ...ROLES].join('|')})\\.${event}\\.\\d+$`));
        keys.add(key!);
      }
    expect(keys.size).toBeGreaterThan(200);
    expect(barkKey({ faction: 'mercenaries', role: 'assault', rank: 2 }, 'kill', 'Not a line')).toBeNull();
  });
});

describe('bark director', () => {
  const speaker = { faction: 'mercenaries', role: 'assault', rank: 2 };
  it('keeps a quiet gap between barks, except for urgent ones', () => {
    const director = createBarkDirector(rolls(0));
    expect(director.offer('a', speaker, 'contact', 0)).toBeTruthy();
    expect(director.offer('b', speaker, 'kill', .5)).toBeNull();
    expect(director.offer('b', speaker, 'man-down', .5)).toBeTruthy();
    expect(director.offer('c', speaker, 'kill', .5 + BARK_TUNING.gap)).toBeTruthy();
  });
  it('lets one soldier speak only so often, and one kind of bark from a faction', () => {
    const director = createBarkDirector(rolls(0));
    expect(director.offer('a', speaker, 'contact', 0)).toBeTruthy();
    expect(director.offer('a', speaker, 'kill', 2)).toBeNull();
    expect(director.offer('b', speaker, 'contact', 2)).toBeNull();
    expect(director.offer('a', speaker, 'kill', BARK_TUNING.speaker)).toBeTruthy();
    // The other side has a voice of its own.
    expect(director.offer('z', { ...speaker, faction: 'armed-forces' }, 'contact', BARK_TUNING.speaker + 2)).toBeTruthy();
  });
  it('voices only a share of the reasons, and never the same line twice running', () => {
    expect(createBarkDirector(rolls(.99)).offer('a', speaker, 'reloading', 0)).toBeNull();
    const director = createBarkDirector(rolls(0)), said = new Set<string>();
    let last = '';
    for (let i = 0; i < 6; i++) {
      const line = director.offer(`s${i}`, speaker, 'idle', i * BARK_TUNING.event.idle)!;
      expect(line).not.toBe(last); last = line; said.add(line);
    }
    expect(said.size).toBeGreaterThan(1);
  });
});
