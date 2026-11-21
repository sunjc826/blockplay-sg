import { describe, expect, it } from 'vitest';
import { ARENA_TEAMS, TDM_AREAS } from './arena-match';
import { createArena } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { HARDPOINT_ARENAS } from './hardpoint';
import { buildHardpointWorld } from './hardpoint-world';
import { buildTeamDeathmatchWorld } from './team-deathmatch-world';
import { MAX_LEVELUTION_EVENTS, getLevelution, levelutionArchetypes, levelutionPhase, resolveLevelution, stageStates, stagedParts, validLevelutionSnapshot } from './levelution';
import { LEVELUTION_BINDINGS } from './levelution-bindings';
import { createLevelutionHost } from './levelution-host';
import { STAGE_FALL_SECONDS, createStageView } from './levelution-stage';
import { applyStageObstacles, getStageParts, stageObstacles, stagePartData, type StagePartData } from './stage-parts';
import { createVerticalMovement } from './vertical-movement';
import { createVerticalNavigator } from './vertical-navigation';
import { getPhysicalWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createRegionMovement, type Obstacle } from './region-collision';

const box = (x: number, z: number, size = 2): Obstacle => ({ minX: x - size / 2, maxX: x + size / 2, minZ: z - size / 2, maxZ: z + size / 2, minY: 0, maxY: 3 });
const part = (): StagePartData => ({ id: 'stack', tags: [], obstacles: [box(0, 0), box(2, 0)], states: { toppled: { obstacles: [box(0, 0), box(0, 6)] } } });

describe('stage parts', () => {
  it('swaps a part\'s colliders by identity, idempotently, and puts them back', () => {
    const p = part(), other = box(40, 40), obstacles = [other, ...p.obstacles];
    expect(applyStageObstacles(obstacles, [p], new Map())).toEqual({ added: [], removed: [] });
    const toppled = applyStageObstacles(obstacles, [p], new Map([['stack', 'toppled']]));
    expect(toppled.removed).toHaveLength(2); expect(toppled.added).toEqual(p.states.toppled.obstacles);
    expect(obstacles).toEqual([other, ...p.states.toppled.obstacles]);
    expect(applyStageObstacles(obstacles, [p], new Map([['stack', 'toppled']]))).toEqual({ added: [], removed: [] });
    applyStageObstacles(obstacles, [p], new Map([['stack', null]]));
    expect(obstacles).toEqual([other]);
    applyStageObstacles(obstacles, [p], new Map());
    expect(new Set(obstacles)).toEqual(new Set([other, ...p.obstacles]));
  });
});

describe('archetypes and bindings', () => {
  it('registers archetypes that warn before they change anything', () => {
    expect(levelutionArchetypes().length).toBeGreaterThan(0);
    for (const plugin of levelutionArchetypes()) expect(plugin.warning, plugin.id).toBeGreaterThanOrEqual(3);
  });
  it('resolves against parts, and says why when it cannot', () => {
    const binding = { id: 'b', arena: 'yard', archetype: 'stack-topple', name: 'Stack', parts: { stack: 'stack' }, triggers: [{ kind: 'clock' as const, at: .5 }] };
    const good = resolveLevelution([binding], 'yard', [part()]);
    expect(good.problems).toEqual([]); expect(good.events).toHaveLength(1);
    const event = good.events[0];
    for (const step of event.steps) if (step.type !== 'marker') expect(step.at).toBeGreaterThanOrEqual(event.warning);
    expect(resolveLevelution([binding], 'elsewhere', [part()]).events).toEqual([]);
    expect(resolveLevelution([binding], 'yard', []).problems[0]).toContain('no stage part "stack"');
    expect(resolveLevelution([binding], 'yard', [{ ...part(), states: {} }]).problems[0]).toContain('no "toppled" state');
    expect(resolveLevelution([{ ...binding, archetype: 'nope' }], 'yard', [part()]).problems[0]).toContain('unknown archetype');
    expect(resolveLevelution([1, 2, 3].map(n => ({ ...binding, id: `b${n}` })), 'yard', [part()]).events).toHaveLength(MAX_LEVELUTION_EVENTS);
  });
  it('gives the same stage on host and guest from the descriptor alone', () => {
    const { events } = resolveLevelution([{ id: 'b', arena: 'yard', archetype: 'stack-topple', name: 'Stack', parts: { stack: 'stack' }, triggers: [] }], 'yard', [part()]);
    const descriptor = JSON.parse(JSON.stringify({ id: 'stage-1', binding: 'b', seed: 1, start: 10 }));
    expect(stageStates(events, [descriptor], 10 + events[0].warning - .01).size).toBe(0);
    expect(stageStates(events, [descriptor], 10 + events[0].warning).get('stack')).toBe('toppled');
    expect(levelutionPhase(events[0], descriptor, 11)).toBe('warning');
    expect(levelutionPhase(events[0], descriptor, 10 + events[0].duration)).toBe('settled');
    expect(validLevelutionSnapshot({ events: [descriptor] }, events, 20)).toBe(true);
    expect(validLevelutionSnapshot({ events: [descriptor, descriptor] }, events, 20)).toBe(false);
    expect(validLevelutionSnapshot({ events: [{ ...descriptor, binding: 'other' }] }, events, 20)).toBe(false);
    expect(validLevelutionSnapshot({ events: [{ ...descriptor, start: 99 }] }, events, 20)).toBe(false);
  });
});

describe('host', () => {
  const setup = (triggers: Parameters<typeof resolveLevelution>[0][number]['triggers']) => {
    const p = part(), obstacles = [...p.obstacles], changes: { added: number; crush?: number }[] = [];
    const { events } = resolveLevelution([{ id: 'b', arena: 'yard', archetype: 'stack-topple', name: 'Stack', parts: { stack: 'stack' }, triggers }], 'yard', [p]);
    const host = createLevelutionHost({ events, obstacles, duration: 100, restage: c => changes.push({ added: c.added.length, crush: c.crush?.damage }) });
    return { p, obstacles, changes, host, event: events[0] };
  };
  it('starts on the clock so the change lands at its mark, once', () => {
    const { host, obstacles, changes, p, event } = setup([{ kind: 'clock', at: .6 }]);
    for (let t = 0; t <= 59.9; t += .5) host.step(t);
    expect(host.snapshot()?.events[0].start).toBeCloseTo(60 - event.warning, 0);
    expect(obstacles).toEqual(p.obstacles); expect(changes).toEqual([]);
    for (let t = 60; t <= 100; t += .5) host.step(t);
    expect(obstacles).toEqual(p.states.toppled.obstacles);
    expect(changes).toEqual([{ added: 2, crush: 400 }]);
    expect(host.snapshot()?.events).toHaveLength(1);
    host.reset();
    expect(new Set(obstacles)).toEqual(new Set(p.obstacles)); expect(host.snapshot()).toBeUndefined();
    expect(changes[1]).toEqual({ added: 2, crush: undefined });
  });
  it('goes by the score when a match is ending early on it', () => {
    const { host, event } = setup([{ kind: 'clock', at: .6 }]);
    host.step(20, .5); expect(host.snapshot()).toBeUndefined();
    host.step(21, .6); expect(host.snapshot()?.events[0].start).toBe(21);
    expect(event.warning).toBeGreaterThan(0);
  });
  it('is set off by blasts near the part, not far from it', () => {
    const { host } = setup([{ kind: 'blast', role: 'stack', health: 250 }]);
    expect(host.blast({ x: 60, z: 0 }, 8, 900, 5, 'Far')).toBeNull();
    expect(host.blast({ x: 4, z: 0 }, 8, 150, 5, 'Near')).toBeNull();
    expect(host.blast({ x: 4, z: 0 }, 8, 150, 6, 'Near')?.cause).toBe('Near');
    expect(host.blast({ x: 4, z: 0 }, 8, 900, 7, 'Again')).toBeNull();
    expect(host.markers(7)).toHaveLength(1);
  });
});

describe('shipped bindings', () => {
  const arenas = [...new Set(LEVELUTION_BINDINGS.map(b => b.arena))];
  it('names real arenas and archetypes', () => {
    for (const b of LEVELUTION_BINDINGS) { expect(TDM_AREAS.some(a => a.id === b.arena), b.id).toBe(true); expect(getLevelution(b.archetype), b.id).toBeDefined(); }
    expect(new Set(LEVELUTION_BINDINGS.map(b => b.id)).size).toBe(LEVELUTION_BINDINGS.length);
  });
  it.each(arenas)('%s: every binding resolves against the built scene, and the map still works afterwards', arena => {
    const w = buildTeamDeathmatchWorld(arena), area = TDM_AREAS.find(a => a.id === arena)!, sites = HARDPOINT_ARENAS.find(a => a.area.id === arena)?.sites ?? [];
    try {
      const { events, problems } = resolveLevelution(LEVELUTION_BINDINGS, arena, stagePartData(getStageParts(w.scene)));
      expect(problems).toEqual([]);
      expect(w.environment.levelution?.events.map(e => e.binding.id)).toEqual(events.map(e => e.binding.id));
      // Every combination of settled events: at most four maps to check.
      for (let mask = 0; mask < 1 << events.length; mask++) {
        const running = events.flatMap((e, i) => mask & 1 << i ? [{ id: `s${i}`, binding: e.binding.id, seed: 1, start: 0 }] : []);
        applyStageObstacles(w.obstacles, stagedParts(events), stageStates(events, running, 1e6));
        const terrain = { bounds: w.bounds, obstacles: w.obstacles, surfaces: getPhysicalWalkSurfaces(w.scene), traversalObstacles: getTraversalObstacles(w.scene) };
        const move = createVerticalMovement(terrain), started = performance.now(), nav = createVerticalNavigator(terrain, w.environment.navigationAnchors);
        const ground = (p: { x: number; z: number }) => ({ ...p, y: w.bounds.groundHeight?.(p.x, p.z) ?? 0 });
        const spawns = ARENA_TEAMS.flatMap(team => area.spawns[team]);
        for (const p of [...spawns, ...area.patrols]) expect(move.canOccupy(p.x, ground(p).y, p.z, .5, 1.8), `state ${mask}: ${p.x},${p.z} is clear`).toBe(true);
        for (const p of spawns.slice(1)) expect(nav.route(ground(spawns[0]), ground(p)).length, `state ${mask}: spawn ${p.x},${p.z} connects`).toBeGreaterThan(0);
        for (const site of sites) {
          for (let i = 0; i < 16; i++) expect(move.canOccupy(site.x + Math.cos(i * Math.PI / 8) * site.radius, site.y, site.z + Math.sin(i * Math.PI / 8) * site.radius, .5, 1.8), `state ${mask}: ${site.id} ring`).toBe(true);
          for (const team of ARENA_TEAMS) expect(nav.route(ground(area.spawns[team][0]), { x: site.x, y: site.y, z: site.z }).length, `state ${mask}: ${team} reaches ${site.id}`).toBeGreaterThan(0);
        }
        const rebuilt = performance.now() - started; if (process.env.LEVELUTION_TIMING) console.log(`${arena} state ${mask}: navigator built and ${spawns.length + sites.length * 2} routes planned in ${rebuilt.toFixed(0)} ms`);
        expect(rebuilt, `state ${mask}: navigation rebuild`).toBeLessThan(4000);
      }
    } finally { w.dispose(); }
  });
});

describe('Tuas container stack', () => {
  it('opens a lane through the block, gives a climb to the second tier, and puts cover on the apron', () => {
    const w = buildTeamDeathmatchWorld('container-yard');
    try {
      const stack = getStageParts(w.scene).find(p => p.id === 'container-stack-b')!;
      expect(getStageParts(w.scene).map(p => p.id)).toEqual(['container-stack-a', 'container-stack-b', 'container-stack-c', 'container-stack-d']);
      expect(stack.object.parent).toBe(w.scene); expect(stack.states.toppled.object.parent).toBeNull();
      for (const o of stack.states.toppled.obstacles) expect(w.obstacles).not.toContain(o);
      const terrain = () => createVerticalMovement({ bounds: w.bounds, obstacles: w.obstacles, surfaces: getPhysicalWalkSurfaces(w.scene), traversalObstacles: getTraversalObstacles(w.scene) });
      const centre = { x: (Math.min(...stack.obstacles.map(o => o.minX)) + Math.max(...stack.obstacles.map(o => o.maxX))) / 2, z: (stack.obstacles[0].minZ + stack.obstacles[0].maxZ) / 2 };
      // Before: the block is solid from face to face.
      const lane = { x: centre.x + 1.6, z: centre.z };
      expect(terrain().canOccupy(lane.x, 0, lane.z, .4, 1.8)).toBe(false);
      applyStageObstacles(w.obstacles, [stack], new Map([[stack.id, 'toppled']]));
      const after = terrain();
      for (let dz = -8; dz <= 8; dz += 1) expect(after.canOccupy(lane.x + 1.2, 0, lane.z + dz, .4, 1.8), `lane at ${dz}`).toBe(true);
      // The climb: each step is a mantle (under 1.6 m), up to the second tier.
      const tops = stageObstacles(stack, 'toppled').filter(o => o.supportsTop).map(o => o.maxY!).sort((a, b) => a - b);
      expect(tops[0]).toBeCloseTo(1.35);
      const rises = [...new Set(tops.map(t => Math.round(t * 100) / 100))].filter(t => t <= 5.41);
      for (let i = 1; i < rises.length; i++) expect(rises[i] - rises[i - 1]).toBeLessThanOrEqual(1.6);
      expect(rises.at(-1)).toBeCloseTo(5.4);
      expect(after.supportHeight(centre.x - 6.4, centre.z, 5.6, .35, 1.8)).toBeCloseTo(5.4);
      // What fell stays inside the arena and clear of both teams' spawns.
      for (const o of stageObstacles(stack, 'toppled')) {
        expect(o.minX).toBeGreaterThan(w.bounds.minX + 2); expect(o.maxX).toBeLessThan(w.bounds.maxX - 2); expect(o.minZ).toBeGreaterThan(w.bounds.minZ + 2); expect(o.maxZ).toBeLessThan(w.bounds.maxZ - 2);
      }
    } finally { w.dispose(); }
  });

  it('runs in a match: holds through the warning, changes the map, replicates, and resets', () => {
    const w = buildHardpointWorld('container-yard');
    try {
      const terrain = { bounds: w.bounds, obstacles: w.obstacles, surfaces: getPhysicalWalkSurfaces(w.scene), traversalObstacles: getTraversalObstacles(w.scene) };
      const arena = createArena(w.obstacles, 4, 'mixed', w.environment, undefined, terrain);
      const stack = getStageParts(w.scene).find(p => p.id === 'container-stack-b')!, base = [...stack.obstacles];
      arena.addPlayer('p1', 'Player');
      for (let i = 0; i < 100; i++) arena.step(.05);
      expect(arena.triggerLevelution('container-yard-topple')).not.toBeNull();
      expect(arena.triggerLevelution('container-yard-topple')).toBeNull();
      const event = w.environment.levelution!.events[0];
      const warned = arena.snapshot();
      expect(warned.levelution?.events).toHaveLength(1);
      expect(validArenaSnapshot(JSON.parse(JSON.stringify(warned)), w.environment)).toBe(true);
      for (let t = 0; t < event.warning - .2; t += .05) arena.step(.05);
      expect(w.obstacles).toContain(base[0]);
      for (let t = 0; t < .5; t += .05) arena.step(.05);
      for (const o of base) expect(w.obstacles).not.toContain(o);
      for (const o of stack.states.toppled.obstacles) expect(w.obstacles).toContain(o);
      // Bots carry on over the new map without ending up inside it.
      for (let i = 0; i < 400; i++) arena.step(.05);
      const settled = arena.snapshot();
      expect(validArenaSnapshot(JSON.parse(JSON.stringify(settled)), w.environment)).toBe(true);
      for (const a of settled.actors) if (a.alive) expect(stack.states.toppled.obstacles.some(o => a.x > o.minX + .3 && a.x < o.maxX - .3 && a.z > o.minZ + .3 && a.z < o.maxZ - .3 && !o.footprint && a.y - 1.75 < o.maxY! - .2 && a.y > o.minY!), `${a.id} inside a box`).toBe(false);
      arena.reset();
      for (const o of base) expect(w.obstacles).toContain(o);
      for (const o of stack.states.toppled.obstacles) expect(w.obstacles).not.toContain(o);
      expect(arena.snapshot().levelution).toBeUndefined();
    } finally { w.dispose(); }
  });
});

describe('crush', () => {
  it('kills whoever is still under it when it lands and nobody else, and credits no one', () => {
    const p = part(), obstacles = [...p.obstacles], bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    const { events } = resolveLevelution([{ id: 'b', arena: 'yard', archetype: 'stack-topple', name: 'Stack', parts: { stack: 'stack' }, triggers: [] }], 'yard', [p]);
    const arena = createArena(obstacles, 0, 'mixed', { bounds, move: createRegionMovement(bounds).move, spawns: [{ x: 0, z: 6 }, { x: 30, z: -20 }], levelution: { events } });
    arena.addPlayer('one', 'One'); arena.addPlayer('two', 'Two');
    for (let i = 0; i < 80; i++) arena.step(.05);
    const before = arena.snapshot().actors, under = before.filter(a => Math.hypot(a.x, a.z - 6) < .6), clear = before.filter(a => !under.includes(a));
    expect(under).toHaveLength(1); expect(clear).toHaveLength(1);
    arena.triggerLevelution('b');
    for (let t = 0; t < events[0].warning - .2; t += .05) arena.step(.05);
    expect(arena.snapshot().actors.every(a => a.alive)).toBe(true);
    for (let t = 0; t < .5; t += .05) arena.step(.05);
    const after = arena.snapshot();
    expect(after.actors.find(a => a.id === under[0].id)!.alive).toBe(false);
    expect(after.actors.find(a => a.id === clear[0].id)!.alive).toBe(true);
    expect(after.actors.find(a => a.id === clear[0].id)!.kills).toBe(0);
    expect(after.feed.some(f => f.cause === 'Falling containers')).toBe(true);
  });
});

describe('stage view', () => {
  const build = () => {
    const w = buildTeamDeathmatchWorld('container-yard'), events = w.environment.levelution!.events, stack = getStageParts(w.scene).find(p => p.id === 'container-stack-b')!;
    return { w, events, stack, start: { id: 'stage-1', binding: events[0].binding.id, seed: 1, start: 20 }, at: 20 + events[0].warning };
  };
  it('on a guest swaps the meshes and the colliders together, drops the fallen boxes into place, and goes back on reset', () => {
    const { w, events, stack, start, at } = build();
    try {
      const view = createStageView(w, events), toppled = stack.states.toppled;
      expect(view.sync([], 5)).toBe(false);
      expect(view.sync([start], at - .1)).toBe(false);
      expect(stack.object.parent).toBe(w.scene);
      expect(view.sync([start], at)).toBe(true); expect(view.sync([start], at)).toBe(false);
      expect(stack.object.parent).toBeNull(); expect(toppled.object.parent).toBe(w.scene); expect(view.staged).toBe(1);
      for (const o of toppled.obstacles) expect(w.obstacles).toContain(o);
      for (const o of stack.obstacles) expect(w.obstacles).not.toContain(o);
      const falling: { object: import('three').Object3D; rest: number }[] = [];
      toppled.object.traverse(o => { if (o.userData.stageFrom) falling.push({ object: o, rest: 0 }); });
      expect(falling.length).toBeGreaterThanOrEqual(8);
      expect(view.update(at)).toEqual([]);
      const high = falling.map(f => f.object.position.y);
      expect(Math.max(...high)).toBeGreaterThan(5);
      let landings = 0;
      for (let t = at; t <= at + STAGE_FALL_SECONDS + 1; t += .05) landings += view.update(t).length;
      expect(landings).toBe(falling.length);
      falling.forEach((f, i) => expect(f.object.position.y).toBeLessThanOrEqual(high[i]));
      expect(view.sync([], 0)).toBe(true);
      expect(stack.object.parent).toBe(w.scene); expect(toppled.object.parent).toBeNull();
      for (const o of stack.obstacles) expect(w.obstacles).toContain(o);
    } finally { w.dispose(); }
  });
  it('shows a late joiner the settled map with nothing falling', () => {
    const { w, events, stack, start, at } = build();
    try {
      const view = createStageView(w, events);
      expect(view.sync([start], at + 60)).toBe(true);
      expect(view.update(at + 60)).toEqual([]);
      let highest = 0; stack.states.toppled.object.traverse(o => { if (o.userData.stageFrom) highest = Math.max(highest, o.position.y); });
      expect(highest).toBeLessThan(4);
    } finally { w.dispose(); }
  });
  it('beside a simulation leaves the colliders alone and reports when the simulation changes them', () => {
    const { w, events, stack, start, at } = build();
    try {
      const view = createStageView(w, events, false), before = [...w.obstacles];
      // The view's clock is ahead of the simulation's: meshes swap, colliders do not.
      expect(view.sync([start], at)).toBe(true);
      expect(w.obstacles).toEqual(before);
      expect(view.sync([start], at)).toBe(false);
      applyStageObstacles(w.obstacles, [stack], new Map([[stack.id, 'toppled']]));
      expect(view.sync([start], at)).toBe(true);
      expect(view.sync([start], at)).toBe(false);
    } finally { w.dispose(); }
  });
});
