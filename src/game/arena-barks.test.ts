import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { BARK_EVENTS, barkLines } from './npc-barks';
import { CALLOUT_COOLDOWN, getPlayerCallout } from './player-callouts';

/** A small yard where everyone is within earshot of everyone else. */
const yard = (): ArenaEnvironment => ({
  bounds: { minX: 0, maxX: 30, minZ: 0, maxZ: 30 },
  spawns: [{ x: 5, z: 5 }, { x: 25, z: 25 }, { x: 5, z: 25 }, { x: 25, z: 5 }],
  move: (p, dx, dz, radius) => ({ x: Math.max(radius, Math.min(30 - radius, p.x + dx)), z: Math.max(radius, Math.min(30 - radius, p.z + dz)) }),
  endless: true, playerSpawn: { x: 15, z: 15 },
});
const advance = (arena: ReturnType<typeof createArena>, seconds: number) => { for (let t = 0; t < seconds; t += .1) arena.step(.1); };

describe('barks in a match', () => {
  it('are said by bots in their own faction’s words, and carried by snapshots guests accept', () => {
    const arena = createArena([], 3, 'mixed', yard());
    arena.addPlayer('p', 'Player', 100, .5, undefined, undefined, true);
    const heard = new Map<string, { kind: string; text: string }>();
    for (let t = 0; t < 40; t += .1) {
      arena.step(.1);
      for (const said of arena.snapshot().barks ?? []) heard.set(said.id, said);
    }
    const snapshot = arena.snapshot();
    expect(heard.size).toBeGreaterThan(0);
    for (const said of heard.values()) expect(BARK_EVENTS).toContain(said.kind);
    // Black Kite talk like Black Kite.
    const said = [...heard.values()][0], speaker = snapshot.actors.find(actor => actor.bot)!;
    expect([1, 2, 3].flatMap(rank => ['assault', 'tank', 'sniper'].flatMap(role => barkLines({ faction: speaker.faction, role, rank }, said.kind as typeof BARK_EVENTS[number])))).toContain(said.text);
    expect(snapshot.barks!.length).toBeLessThanOrEqual(8);
    expect(validArenaSnapshot(snapshot, yard())).toBe(true);
  });
  it('take a player’s callout by id, at most once a cooldown, pointing where it was aimed', () => {
    const arena = createArena([], 0, 'mixed', yard());
    arena.addPlayer('p', 'Player', 0, 0, undefined, undefined, true);
    expect(arena.callout('p', 'not-a-callout')).toBeNull();
    expect(arena.callout('nobody', 'knn')).toBeNull();
    const said = arena.callout('p', 'contact', { x: 400, y: 2, z: -9 })!;
    expect(getPlayerCallout('contact')!.lines).toContain(said.text);
    expect(said).toMatchObject({ actor: 'p', kind: 'callout', callout: 'contact', at: { x: 30, y: 2, z: 0 } });
    expect(arena.callout('p', 'walao')).toBeNull();
    advance(arena, CALLOUT_COOLDOWN + .1);
    // A callout that points nowhere carries no mark.
    expect(arena.callout('p', 'walao', { x: 1, y: 1, z: 1 })).not.toHaveProperty('at');
    expect(arena.snapshot().barks?.map(b => b.callout)).toEqual(['contact', 'walao']);
    // Shot down, a player still has something to say, but nothing to point at.
    arena.setPlayerVitals('p', { health: 0 }); advance(arena, CALLOUT_COOLDOWN + .1);
    expect(arena.snapshot().actors.find(a => a.id === 'p')?.alive).toBe(false);
    expect(arena.callout('p', 'contact', { x: 5, y: 1, z: 5 })).not.toHaveProperty('at');
    expect(validArenaSnapshot(arena.snapshot(), yard())).toBe(true);
  });
  it('get an answer from an enemy who hears a taunt, and none from them for an order', () => {
    const arena = createArena([], 1, 'assault', yard());
    arena.addPlayer('p', 'Player', 100, .5, undefined, undefined, true);
    arena.setPlayerHealthMultiplier('p', 10);
    arena.callout('p', 'need-medic'); advance(arena, 2);
    expect(arena.snapshot().barks?.some(b => b.kind === 'ack')).toBeFalsy();
    advance(arena, CALLOUT_COOLDOWN);
    arena.callout('p', 'knn'); advance(arena, 2);
    const reply = arena.snapshot().barks?.find(b => b.kind === 'taunted');
    expect(reply?.actor).toBe('bot-1');
    expect(barkLines({ faction: 'mercenaries', role: 'assault', rank: arena.snapshot().actors.find(a => a.id === 'bot-1')!.rank }, 'taunted')).toContain(reply!.text);
  });
  it('are refused by guests when malformed', () => {
    const arena = createArena([], 0, 'mixed', yard());
    arena.addPlayer('p', 'Player', 0, 0, undefined, undefined, true);
    arena.callout('p', 'knn');
    const snapshot = arena.snapshot();
    expect(validArenaSnapshot({ ...snapshot, barks: [{ ...snapshot.barks![0], kind: 'callout', callout: 'free text' }] }, yard())).toBe(false);
    expect(validArenaSnapshot({ ...snapshot, barks: [{ ...snapshot.barks![0], kind: 'gossip' }] }, yard())).toBe(false);
    expect(validArenaSnapshot({ ...snapshot, barks: [{ ...snapshot.barks![0], text: 'x'.repeat(200) }] }, yard())).toBe(false);
  });
});
