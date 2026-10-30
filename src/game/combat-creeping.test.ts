import { describe, expect, it } from 'vitest';
import { CREEPING_ARTILLERY } from './combat-event-catalog';
import { combatCues, combatTimeline, getCombatEvent, type CombatEventDescriptor, type MunitionPayload } from './combat-events';
import { COMBAT_BRACKET, COMBAT_SPAWN_CLEAR, COMBAT_TABLES, createCombatDirector } from './combat-director';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';

const event = (over: Partial<CombatEventDescriptor> = {}): CombatEventDescriptor => ({ id: 'moving', kind: 'artillery-creeping', seed: 42, start: 0, target: { x: 0, z: 0 }, heading: 0, intensity: 1, ...over });
const shells = (e: CombatEventDescriptor) => combatTimeline(e).filter((p): p is MunitionPayload => p.type === 'munition' && !!p.blast);
const rings = (e: CombatEventDescriptor) => combatTimeline(e).filter(p => p.type === 'marker');
const bounds = { minX: -110, maxX: 110, minZ: -110, maxZ: 110 };

describe('moving artillery', () => {
  it('survives JSON snapshots and keeps the same ammunition budget as stationary artillery', () => {
    for (const intensity of [.5, 1, 2]) {
      const e = event({ intensity });
      expect(combatTimeline(JSON.parse(JSON.stringify(e)))).toEqual(combatTimeline(e));
      expect(shells(e)).toHaveLength(shells(event({ kind: 'artillery', intensity })).length);
      expect(combatTimeline(e).filter(p => p.type === 'munition' && !p.blast)).toHaveLength(2);
    }
    expect(getCombatEvent('artillery')).toBeTruthy();
  });
  it('advances along its bearing in three timed salvos, with every blast inside its warned ring', () => {
    for (let seed = 0; seed < 150; seed++) for (const heading of [0, Math.PI / 2, 2.3]) {
      const e = event({ seed, heading, intensity: 2 }), danger = rings(e).filter(p => p.colour === '#ff4a3a');
      expect(danger).toHaveLength(3);
      danger.forEach((ring, index) => {
        expect(ring.center.x).toBeCloseTo(-Math.sin(heading) * index * CREEPING_ARTILLERY.step);
        expect(ring.center.z).toBeCloseTo(-Math.cos(heading) * index * CREEPING_ARTILLERY.step);
        const first = CREEPING_ARTILLERY.first + index * CREEPING_ARTILLERY.interval;
        const salvo = shells(e).filter(p => p.time >= first && p.time < first + CREEPING_ARTILLERY.interval);
        expect(salvo).toHaveLength(4);
        for (const shell of salvo) {
          expect(shell.time - ring.from).toBeGreaterThanOrEqual(5);
          expect(shell.time).toBeLessThan(ring.until);
          expect(Math.hypot(shell.impact.x - ring.center.x, shell.impact.z - ring.center.z) + shell.blast!.radius).toBeLessThan(ring.radius);
        }
      });
    }
  });
  it('previews the whole route immediately and retires cleared sections as the danger advances', () => {
    const e = event(), at = (age: number) => rings(e).filter(r => age >= r.from && age <= r.until);
    expect(at(0)).toHaveLength(3);
    expect(at(0).map(r => r.colour)).toEqual(['#ff4a3a', '#f2b84b', '#f2b84b']);
    expect(at(14.5).every(r => r.center.z < 0)).toBe(true);
    expect(at(18).map(r => r.center.z)).toEqual([-36]);
    expect(at(24)).toHaveLength(0);
    const cues = combatCues([e], 0, 30);
    expect(cues.filter(c => c.kind === 'impact')).toHaveLength(shells(e).length + 2);
    expect(new Set(cues.map(c => `${c.kind}/${c.payload.id}`)).size).toBe(cues.length);
  });
});

describe('mixed barrage director', () => {
  it('splits the previous artillery weight between both kinds in every district risk', () => {
    for (const table of Object.values(COMBAT_TABLES)) {
      const barrages = table.filter(e => e.kind.startsWith('artillery'));
      expect(barrages.map(e => e.kind)).toEqual(['artillery', 'artillery-creeping']);
      expect(barrages.reduce((sum, e) => sum + e.weight, 0)).toBe(3);
    }
    for (const risk of ['low', 'medium', 'high'] as const) {
      const seen = new Set<string>();
      for (let seed = 0; seed < 80; seed++) {
        const director = createCombatDirector({ risk, seed });
        for (let now = 0; now < 300; now += 5) {
          const d = director.step({ now, active: [], humans: [{ x: 0, z: 0 }], bounds });
          if (d) seen.add(d.kind);
        }
      }
      expect(seen.has('artillery')).toBe(true); expect(seen.has('artillery-creeping')).toBe(true);
    }
  });
  it('checks every later section against district edges, arrivals and humans before scheduling', () => {
    const avoid = [{ x: -40, z: 25 }], humans = [{ x: 85, z: 85 }]; let scheduled = 0;
    for (let seed = 0; seed < 80; seed++) {
      const director = createCombatDirector({ risk: 'high', seed, table: [{ kind: 'artillery-creeping', weight: 1, cooldown: 45 }] });
      const d = director.step({ now: 60, active: [], humans, bounds, avoid }); if (!d) continue;
      scheduled++;
      const e = event(d);
      for (const ring of rings(e)) {
        expect(ring.center.x - ring.radius).toBeGreaterThanOrEqual(bounds.minX);
        expect(ring.center.x + ring.radius).toBeLessThanOrEqual(bounds.maxX);
        expect(ring.center.z - ring.radius).toBeGreaterThanOrEqual(bounds.minZ);
        expect(ring.center.z + ring.radius).toBeLessThanOrEqual(bounds.maxZ);
        expect(Math.hypot(ring.center.x - avoid[0].x, ring.center.z - avoid[0].z)).toBeGreaterThanOrEqual(ring.radius + COMBAT_SPAWN_CLEAR);
      }
      for (const shell of shells(e)) expect(Math.hypot(shell.impact.x - humans[0].x, shell.impact.z - humans[0].z)).toBeGreaterThanOrEqual(COMBAT_BRACKET);
    }
    expect(scheduled).toBeGreaterThan(5);
  });
});

const environment = (z = 0): ArenaEnvironment => ({ bounds, spawns: [{ x: 0, z }], playerSpawn: { x: 0, z }, endless: true, move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }) });
const advance = (arena: ReturnType<typeof createArena>, seconds: number) => { for (let t = 0; t < seconds - 1e-8; t += .1) arena.step(Math.min(.1, seconds - t)); };
describe('moving barrage authority', () => {
  it('damages both the start and the far end of its path on the host, then cleans up', () => {
    for (const z of [0, -36]) {
      const env = environment(z), arena = createArena([], 0, 'mixed', env);
      arena.addPlayer('you', 'Alpha', 0, 0, undefined, undefined, true);
      arena.triggerEvent('artillery-creeping', { x: 0, z: 0 }, 0);
      advance(arena, 5); expect(arena.snapshot().actors[0].health).toBe(100);
      expect(validArenaSnapshot(arena.snapshot(), env)).toBe(true);
      advance(arena, 18);
      expect(arena.snapshot().actors[0].health < 100 || arena.snapshot().actors[0].deaths > 0).toBe(true);
      expect(arena.snapshot().actors[0].kills).toBe(0); expect(arena.snapshot().finished).toBe(false);
      advance(arena, 20); expect(arena.snapshot().events).toBeUndefined();
    }
  });
  it('has bots escape across the corridor rather than running into its later salvos', () => {
    const env = { ...environment(-18), playerSpawn: { x: 95, z: 95 } }, arena = createArena([], 1, 'assault', env);
    arena.addPlayer('you', 'Alpha', 0, 0, undefined, undefined, true);
    arena.triggerEvent('artillery-creeping', { x: 0, z: 0 }, 0);
    advance(arena, 3);
    const bot = arena.snapshot().actors.find(a => a.bot)!;
    expect(Math.abs(bot.x)).toBeGreaterThan(5);
    expect(bot.z).toBeCloseTo(-18);
  });
});
