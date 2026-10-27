import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { CALLOUT_COOLDOWN } from './player-callouts';
import { ORDER_TUNING } from './squad-orders';

/** Open ground, drops on a ring 60 m out, a player in the middle. */
const ring = Array.from({ length: 8 }, (_, i) => ({ x: Math.sin(i / 8 * Math.PI * 2) * 60, z: Math.cos(i / 8 * Math.PI * 2) * 60 }));
const open = (extra: Partial<ArenaEnvironment> = {}): ArenaEnvironment => ({
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, spawns: [{ x: 0, z: 0 }, ...ring, { x: 150, z: 150 }],
  move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), endless: true, playerSpawn: { x: 0, z: 0 }, ...extra,
});
function advance(arena: ArenaSimulation, seconds: number) { for (let t = 0; t < seconds; t += .1) arena.step(.1); }
const allies = (arena: ArenaSimulation) => arena.snapshot().actors.filter(a => a.bot && a.alive && a.faction === 'armed-forces');
const me = (arena: ArenaSimulation) => arena.snapshot().actors.find(a => a.id === 'p')!;
const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** Says an order once the callout cooldown allows. */
function order(arena: ArenaSimulation, id: string, at?: { x: number; y: number; z: number }) { advance(arena, CALLOUT_COOLDOWN + .1); return arena.callout('p', id, at)!; }
/** A district with transports and a fireteam called in and on the ground. */
function withFireteam(bots = 0, enemies = 'assault') {
  const arena = createArena([], bots, enemies, open({ reinforcements: true }));
  arena.addPlayer('p', 'Player', 100, .5, undefined, undefined, true);
  arena.setPlayerHealthMultiplier('p', 10);
  const called = arena.callout('p', 'reinforce')!;
  for (let t = 0; t < 120 && allies(arena).length < ORDER_TUNING.reinforce.squad; t += 1) advance(arena, 1);
  return { arena, called };
}

describe('orders', () => {
  it('bring in a fireteam that lands near the caller and comes to them, once a cooldown', () => {
    const { arena, called } = withFireteam();
    expect(called.order).toMatchObject({ allies: ORDER_TUNING.reinforce.squad });
    expect(called.order!.note).toMatch(/^HQ: (Truck|Helicopter) inbound with 4, landing \d+ m out/);
    expect(allies(arena)).toHaveLength(ORDER_TUNING.reinforce.squad);
    // Off the transport, they come looking for the caller and gather round them.
    advance(arena, 25);
    for (const ally of allies(arena)) expect(gap(ally, me(arena))).toBeLessThan(ORDER_TUNING.gather.ring + ORDER_TUNING.gather.slack + 1.5);
    expect(arena.snapshot().barks?.some(b => b.kind === 'ack' && allies(arena).some(a => a.id === b.actor))).toBe(true);
    // HQ will not send another straight away, and says when it will.
    expect(me(arena).reinforceIn).toBeGreaterThan(0);
    expect(order(arena, 'reinforce').order).toMatchObject({ allies: 0, note: expect.stringMatching(/Next transport in \d+ s/) });
    expect(validArenaSnapshot(arena.snapshot(), open())).toBe(false); // the 10× player is over a guest's health limit…
    const snapshot = arena.snapshot();
    expect(validArenaSnapshot({ ...snapshot, actors: snapshot.actors.filter(a => a.bot) }, open())).toBe(true); // …everything else passes.
  });
  it('move the allies in range: there, back to the caller, stand fast, and apart', () => {
    const { arena } = withFireteam();
    advance(arena, 20);
    const there = { x: 30, y: 1, z: -20 };
    expect(order(arena, 'move-there', there).order).toEqual({ allies: 4 });
    advance(arena, 20);
    for (const ally of allies(arena)) expect(gap(ally, there)).toBeLessThan(ORDER_TUNING.move.ring + ORDER_TUNING.move.slack + .5);
    expect(order(arena, 'gather').order).toEqual({ allies: 4 });
    advance(arena, 20);
    for (const ally of allies(arena)) expect(gap(ally, me(arena))).toBeLessThan(ORDER_TUNING.gather.ring + ORDER_TUNING.gather.slack + 1);
    order(arena, 'hold-position');
    const held = allies(arena).map(a => ({ x: a.x, z: a.z }));
    advance(arena, 10);
    allies(arena).forEach((ally, i) => expect(gap(ally, held[i])).toBeLessThan(ORDER_TUNING.hold.slack + .5));
    const before = allies(arena).map(a => gap(a, me(arena)));
    order(arena, 'scatter');
    advance(arena, 4);
    allies(arena).forEach((ally, i) => expect(gap(ally, me(arena))).toBeGreaterThan(before[i] + 8));
  });
  it('point the allies at the enemy nearest where the caller aimed', () => {
    const { arena } = withFireteam(1, 'tank');
    // The contractor may have shot the caller in the meantime: orders wait for the respawn.
    for (let t = 0; t < 10 && !me(arena).alive; t++) advance(arena, 1);
    const enemy = arena.snapshot().actors.find(a => a.bot && a.faction === 'mercenaries' && a.alive);
    expect(enemy).toBeTruthy();
    if (!enemy) return;
    const said = order(arena, 'focus-fire', { x: enemy.x + 3, y: 1, z: enemy.z });
    expect(said.order).toEqual({ allies: expect.any(Number), note: `Target: ${enemy.name}.` });
    expect(said.order!.allies).toBeGreaterThan(0);
    expect(order(arena, 'focus-fire', { x: -190, y: 1, z: -190 }).order).toEqual({ allies: 0, note: 'No enemy near where you pointed.' });
  });
  it('say why nothing happened: nobody in range, no transports, or a fallen caller', () => {
    const arena = createArena([], 0, 'mixed', open());
    arena.addPlayer('p', 'Player', 0, 0, undefined, undefined, true);
    expect(arena.callout('p', 'gather')!.order).toEqual({ allies: 0, note: `No allies within ${ORDER_TUNING.range} m.` });
    expect(order(arena, 'reinforce').order).toEqual({ allies: 0, note: 'HQ: No transports out here. Nobody is coming.' });
    arena.setPlayerVitals('p', { health: 0 });
    expect(order(arena, 'gather').order!.note).toMatch(/down/);
    // Talk carries no order at all.
    expect(order(arena, 'walao')).not.toHaveProperty('order');
  });
});
