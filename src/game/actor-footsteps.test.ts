import { describe, expect, it } from 'vitest';
import { ACTOR_STEPS, createActorFootsteps, stepGain, stepRange } from './actor-footsteps';
import type { ArenaActor } from './arena-rules';

const self = { id: 'me', bot: false, faction: 'armed-forces' };
const listener = { x: 0, y: 1.75, z: 0 };
const soldier = (id: string, x: number, z: number, extra: Partial<ArenaActor> = {}) => ({ id, name: id, bot: true, x, y: 1.75, z, alive: true, faction: 'mercenaries', ...extra }) as ArenaActor;
/** Everyone walks along +x at their speed for `seconds`; returns the steps heard at 20 samples a second. */
function run(actors: (t: number) => ArenaActor | ArenaActor[], seconds = 20, sampler = createActorFootsteps(), listen = listener) {
  const heard = []; sampler.advance([actors(0)].flat(), self, listen, 0);
  for (let t = .05; t <= seconds; t += .05) heard.push(...sampler.advance([actors(t)].flat(), self, listen, t).map(step => ({ ...step, t })));
  return heard;
}
const walking = (id: string, z: number, speed = 3.1, extra: Partial<ArenaActor> = {}) => (t: number) => soldier(id, -10 + speed * ((t + z * .17) % 6), z, extra);

describe('hearing other soldiers on foot', () => {
  it('stays sparse with thirty-two hostile soldiers all walking around you', () => {
    const crowd = (t: number) => Array.from({ length: 32 }, (_, i) => { const a = i / 32 * Math.PI * 2 + t * .4; return soldier(`bot${i}`, Math.cos(a) * (4 + i % 6), Math.sin(a) * (4 + i % 6)); });
    const heard = run(crowd, 30);
    const perSecond = Array.from({ length: 30 }, (_, s) => heard.filter(step => step.t >= s && step.t < s + 1).length);
    expect(Math.max(...perSecond)).toBeLessThanOrEqual(Math.ceil(1 / ACTOR_STEPS.gap));
    for (let i = 1; i < heard.length; i++) expect(heard[i].t - heard[i - 1].t).toBeGreaterThanOrEqual(ACTOR_STEPS.gap - 1e-6);
    expect(new Set(heard.map(step => step.id)).size).toBeLessThan(32);
  });
  it('hears only the nearest few, however many are in range', () => {
    const pacing = (id: string, z: number) => (t: number) => soldier(id, Math.abs(((t * 3.1 + z * .4) % 6) - 3) - 1.5, z);
    const heard = run(t => [pacing('near', 3)(t), pacing('mid', 4)(t), pacing('third', 5)(t), pacing('far', 9)(t), pacing('farther', 10)(t)], 20);
    // A soldier who stops at a turn leaves the moving list for a sample, so the next one can slip in. Rarely.
    const others = heard.filter(step => step.id === 'far' || step.id === 'farther').length;
    expect(others / heard.length).toBeLessThan(.1);
    expect(new Set(heard.map(step => step.id))).toContain('third');
  });
  it('does not hear allies, the dead, riders, parachutes, swimmers or anyone prone', () => {
    for (const extra of [{ faction: 'armed-forces' }, { alive: false }, { vehicle: 'car' }, { parachuting: true }, { swimming: true }, { prone: true }] as Partial<ArenaActor>[])
      expect(run(walking('one', 3, 3.1, extra), 10)).toHaveLength(0);
  });
  it('carries further the faster someone moves, and fades out at the edge', () => {
    expect(stepRange(1.6)).toBe(ACTOR_STEPS.range.near);
    expect(stepRange(3.1)).toBeLessThan(18);
    expect(stepRange(7)).toBe(ACTOR_STEPS.range.far);
    expect(stepGain(0, 12)).toBe(1); expect(stepGain(12, 12)).toBe(0);
    expect(stepGain(11, 12)).toBeLessThan(.05);
    expect(run(walking('out', stepRange(3.1) + 2), 10)).toHaveLength(0);
    expect(run(walking('sprinter', 22, 7), 10).length).toBeGreaterThan(0);
  });
  it('steps on a stride, so a slower soldier is heard less often', () => {
    const count = (speed: number) => run(t => soldier('one', -3 + speed * (t % 2), 3), 20).length;
    expect(count(1.6)).toBeLessThan(count(3.1));
    expect(count(3.1) / 20).toBeLessThan(2);
  });
  it('lets a human sneak, crouched or aiming on the move, but a slow bot is still a bot', () => {
    expect(run(t => soldier('person', -3 + 2.1 * (t % 3), 3, { bot: false }), 10)).toHaveLength(0);
    expect(run(t => soldier('person', -3 + 4.2 * (t % 2), 3, { bot: false }), 10).length).toBeGreaterThan(0);
    expect(run(t => soldier('gunner', -3 + 1.7 * (t % 3), 3), 10).length).toBeGreaterThan(0);
  });
  it('ignores teleports, other floors and repeated snapshots', () => {
    expect(run(t => soldier('jump', t % 1 < .05 ? 0 : 8, 3), 10)).toHaveLength(0);
    expect(run(walking('up', 3, 3.1, { y: 12 }), 10)).toHaveLength(0);
    const sampler = createActorFootsteps(), moved = [soldier('a', 3, 0)];
    sampler.advance([soldier('a', 0, 0)], self, listener, 1);
    expect(sampler.advance(moved, self, listener, 1)).toEqual([]);
  });
  it('starts over cleanly when a new match rewinds the clock', () => {
    const sampler = createActorFootsteps();
    run(walking('a', 3), 5, sampler);
    expect(() => run(walking('a', 3), 5, sampler)).not.toThrow();
    expect(run(walking('a', 3), 5, sampler).length).toBeGreaterThan(0);
  });
});
