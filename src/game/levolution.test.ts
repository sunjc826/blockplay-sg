import { describe, expect, it } from 'vitest';
import { ARENA_TEAMS, TDM_AREAS } from './arena-match';
import { createArena } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { HARDPOINT_ARENAS } from './hardpoint';
import { buildHardpointWorld } from './hardpoint-world';
import { buildTeamDeathmatchWorld } from './team-deathmatch-world';
import { MAX_LEVOLUTION_EVENTS, getLevolution, levolutionArchetypes, levolutionPhase, resolveLevolution, stageStates, stagedParts, validLevolutionSnapshot } from './levolution';
import { LEVOLUTION_BINDINGS } from './levolution-bindings';
import { createLevolutionHost } from './levolution-host';
import { STAGE_FALL_SECONDS, createStageView } from './levolution-stage';
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
    expect(levolutionArchetypes().length).toBeGreaterThan(0);
    for (const plugin of levolutionArchetypes()) expect(plugin.warning, plugin.id).toBeGreaterThanOrEqual(3);
  });
  it('resolves against parts, and says why when it cannot', () => {
    const binding = { id: 'b', arena: 'yard', archetype: 'stack-topple', name: 'Stack', parts: { stack: 'stack' }, triggers: [{ kind: 'clock' as const, at: .5 }] };
    const good = resolveLevolution([binding], 'yard', [part()]);
    expect(good.problems).toEqual([]); expect(good.events).toHaveLength(1);
    const event = good.events[0];
    for (const step of event.steps) if (step.type !== 'marker') expect(step.at).toBeGreaterThanOrEqual(event.warning);
    expect(resolveLevolution([binding], 'elsewhere', [part()]).events).toEqual([]);
    expect(resolveLevolution([binding], 'yard', []).problems[0]).toContain('no stage part "stack"');
    expect(resolveLevolution([binding], 'yard', [{ ...part(), states: {} }]).problems[0]).toContain('no "toppled" state');
    expect(resolveLevolution([{ ...binding, archetype: 'nope' }], 'yard', [part()]).problems[0]).toContain('unknown archetype');
    expect(resolveLevolution([1, 2, 3].map(n => ({ ...binding, id: `b${n}` })), 'yard', [part()]).events).toHaveLength(MAX_LEVOLUTION_EVENTS);
  });
  it('gives the same stage on host and guest from the descriptor alone', () => {
    const { events } = resolveLevolution([{ id: 'b', arena: 'yard', archetype: 'stack-topple', name: 'Stack', parts: { stack: 'stack' }, triggers: [] }], 'yard', [part()]);
    const descriptor = JSON.parse(JSON.stringify({ id: 'stage-1', binding: 'b', seed: 1, start: 10 }));
    expect(stageStates(events, [descriptor], 10 + events[0].warning - .01).size).toBe(0);
    expect(stageStates(events, [descriptor], 10 + events[0].warning).get('stack')).toBe('toppled');
    expect(levolutionPhase(events[0], descriptor, 11)).toBe('warning');
    expect(levolutionPhase(events[0], descriptor, 10 + events[0].duration)).toBe('settled');
    expect(validLevolutionSnapshot({ events: [descriptor] }, events, 20)).toBe(true);
    expect(validLevolutionSnapshot({ events: [descriptor, descriptor] }, events, 20)).toBe(false);
    expect(validLevolutionSnapshot({ events: [{ ...descriptor, binding: 'other' }] }, events, 20)).toBe(false);
    expect(validLevolutionSnapshot({ events: [{ ...descriptor, start: 99 }] }, events, 20)).toBe(false);
  });
});

describe('host', () => {
  const setup = (triggers: Parameters<typeof resolveLevolution>[0][number]['triggers']) => {
    const p = part(), obstacles = [...p.obstacles], changes: { added: number; crush?: number }[] = [];
    const { events } = resolveLevolution([{ id: 'b', arena: 'yard', archetype: 'stack-topple', name: 'Stack', parts: { stack: 'stack' }, triggers }], 'yard', [p]);
    const host = createLevolutionHost({ events, obstacles, duration: 100, restage: c => changes.push({ added: c.added.length, crush: c.crush?.damage }) });
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
  const arenas = [...new Set(LEVOLUTION_BINDINGS.map(b => b.arena))];
  it('gives every arena an event', () => {
    for (const area of TDM_AREAS) expect(arenas, area.id).toContain(area.id);
  });
  it('names real arenas and archetypes', () => {
    for (const b of LEVOLUTION_BINDINGS) { expect(TDM_AREAS.some(a => a.id === b.arena), b.id).toBe(true); expect(getLevolution(b.archetype), b.id).toBeDefined(); }
    expect(new Set(LEVOLUTION_BINDINGS.map(b => b.id)).size).toBe(LEVOLUTION_BINDINGS.length);
  });
  it.each(arenas)('%s: every binding resolves against the built scene, and the map still works afterwards', arena => {
    const w = buildTeamDeathmatchWorld(arena), area = TDM_AREAS.find(a => a.id === arena)!, sites = HARDPOINT_ARENAS.find(a => a.area.id === arena)?.sites ?? [];
    try {
      const { events, problems } = resolveLevolution(LEVOLUTION_BINDINGS, arena, stagePartData(getStageParts(w.scene)));
      expect(problems).toEqual([]);
      expect(w.environment.levolution?.events.map(e => e.binding.id)).toEqual(events.map(e => e.binding.id));
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
          // A ring that runs off the arena's edge (Smith Street's southern passage) is only held to the part inside it.
          for (let i = 0; i < 16; i++) { const x = site.x + Math.cos(i * Math.PI / 8) * site.radius, z = site.z + Math.sin(i * Math.PI / 8) * site.radius; if (x > w.bounds.minX + .6 && x < w.bounds.maxX - .6 && z > w.bounds.minZ + .6 && z < w.bounds.maxZ - .6) expect(move.canOccupy(x, site.y, z, .5, 1.8), `state ${mask}: ${site.id} ring`).toBe(true); }
          for (const team of ARENA_TEAMS) expect(nav.route(ground(area.spawns[team][0]), { x: site.x, y: site.y, z: site.z }).length, `state ${mask}: ${team} reaches ${site.id}`).toBeGreaterThan(0);
        }
        const rebuilt = performance.now() - started; if (process.env.LEVOLUTION_TIMING) console.log(`${arena} state ${mask}: navigator built and ${spawns.length + sites.length * 2} routes planned in ${rebuilt.toFixed(0)} ms`);
        expect(rebuilt, `state ${mask}: navigation rebuild`).toBeLessThan(4000);
      }
    } finally { w.dispose(); }
  });
});

describe('Tuas container yard', () => {
  const terrainOf = (w: ReturnType<typeof buildTeamDeathmatchWorld>) => createVerticalMovement({ bounds: w.bounds, obstacles: w.obstacles, surfaces: getPhysicalWalkSurfaces(w.scene), traversalObstacles: getTraversalObstacles(w.scene) });
  const settle = (w: ReturnType<typeof buildTeamDeathmatchWorld>) => {
    const events = w.environment.levolution!.events;
    applyStageObstacles(w.obstacles, stagedParts(events), stageStates(events, events.map((e, i) => ({ id: `s${i}`, binding: e.binding.id, seed: 1, start: 0 })), 1e6));
    return events;
  };
  it('stages both gantries and all four stacks, each with its other states kept out of the world', () => {
    const w = buildTeamDeathmatchWorld('container-yard');
    try {
      const parts = getStageParts(w.scene);
      expect(parts.map(p => p.id).sort()).toEqual(['container-stack-a', 'container-stack-b', 'container-stack-c', 'container-stack-d', 'stacking-crane-east', 'stacking-crane-west']);
      for (const part of parts) {
        expect(part.object.parent).toBe(w.scene);
        for (const state of Object.values(part.states)) { expect(state.object.parent).toBeNull(); for (const o of state.obstacles) expect(w.obstacles).not.toContain(o); }
      }
      expect(parts.find(p => p.id === 'stacking-crane-west')!.states.falling.obstacles).toEqual([]);
      expect(w.environment.levolution!.events.map(e => e.binding.id)).toEqual(['container-yard-west', 'container-yard-east']);
    } finally { w.dispose(); }
  });
  it('opens a lane through every block, gives a climb to the second tier, and lays the gantry legs across the aprons', () => {
    const w = buildTeamDeathmatchWorld('container-yard');
    try {
      const before = terrainOf(w), parts = getStageParts(w.scene);
      const lanes = parts.filter(p => p.id.startsWith('container-stack')).map(stack => {
        const x = (Math.min(...stack.obstacles.map(o => o.minX)) + Math.max(...stack.obstacles.map(o => o.maxX))) / 2, z = (stack.obstacles[0].minZ + stack.obstacles[0].maxZ) / 2;
        // The lane is on the side the standing rows are not: find it from the toppled state itself.
        const standing = stack.states.toppled.obstacles.filter(o => !o.footprint && o.maxZ - o.minZ > 12 && o.maxY! > 10).map(o => (o.minX + o.maxX) / 2);
        const side = standing.filter(sx => sx > x).length > standing.filter(sx => sx < x).length ? -1 : 1;
        return { stack, x: x - side * 1.6, z };
      });
      for (const lane of lanes) expect(before.canOccupy(lane.x, 0, lane.z, .4, 1.8), `${lane.stack.id} solid before`).toBe(false);
      settle(w);
      const after = terrainOf(w);
      for (const lane of lanes) {
        let open = 0;
        for (const dx of [-1.6, -.8, 0, .8, 1.6]) { let clear = true; for (let dz = -7; dz <= 7; dz += 1) clear &&= after.canOccupy(lane.x + dx, 0, lane.z + dz, .4, 1.8); if (clear) open++; }
        expect(open, `${lane.stack.id} lane`).toBeGreaterThanOrEqual(3);
        // The climb: each step is a mantle (under 1.6 m), up to the second tier.
        const tops = [...new Set(stageObstacles(lane.stack, 'toppled').filter(o => o.supportsTop).map(o => Math.round(o.maxY! * 100) / 100))].sort((a, b) => a - b).filter(t => t <= 5.41);
        expect(tops[0]).toBeCloseTo(1.35); expect(tops.at(-1)).toBeCloseTo(5.4);
        for (let i = 1; i < tops.length; i++) expect(tops[i] - tops[i - 1]).toBeLessThanOrEqual(1.6);
      }
      for (const crane of parts.filter(p => p.id.startsWith('stacking-crane'))) {
        const legs = crane.states.fallen.obstacles.filter(o => o.supportsTop);
        expect(legs).toHaveLength(2);
        for (const leg of legs) { expect(leg.maxY).toBeLessThanOrEqual(1.6); expect(leg.maxZ - leg.minZ).toBeGreaterThan(20); }
      }
      // The two halves are the same layout turned half a turn about the yard's middle.
      const centre = { x: (80 + 182) / 2, z: -40 }, turned = (o: Obstacle) => `${(2 * centre.x - (o.minX + o.maxX) / 2).toFixed(2)},${(2 * centre.z - (o.minZ + o.maxZ) / 2).toFixed(2)}`, at = (o: Obstacle) => `${((o.minX + o.maxX) / 2).toFixed(2)},${((o.minZ + o.maxZ) / 2).toFixed(2)}`;
      const west = ['stacking-crane-west', 'container-stack-a', 'container-stack-b'].flatMap(id => { const p = parts.find(q => q.id === id)!; return [...stageObstacles(p, p.states.fallen ? 'fallen' : 'toppled')]; });
      const east = ['stacking-crane-east', 'container-stack-c', 'container-stack-d'].flatMap(id => { const p = parts.find(q => q.id === id)!; return [...stageObstacles(p, p.states.fallen ? 'fallen' : 'toppled')]; });
      expect(west.map(turned).sort()).toEqual(east.map(at).sort());
      // Everything that comes down stays inside the arena, clear of other solids and of each other.
      const staged = new Set([...west, ...east]), others = w.obstacles.filter(o => !staged.has(o) && (o.maxY ?? 99) > .3 && o.maxX > w.bounds.minX && o.minX < w.bounds.maxX && o.maxZ > w.bounds.minZ && o.minZ < w.bounds.maxZ);
      const corners = (o: Obstacle) => o.footprint ?? [{ x: o.minX, z: o.minZ }, { x: o.maxX, z: o.minZ }, { x: o.maxX, z: o.maxZ }, { x: o.minX, z: o.maxZ }];
      const apart = (a: Obstacle, b: Obstacle) => (a.minY ?? 0) >= (b.maxY ?? 99) - .01 || (b.minY ?? 0) >= (a.maxY ?? 99) - .01 || [a, b].some(o => { const c = corners(o), other = corners(o === a ? b : a);
        return c.some((p, i) => { const q = c[(i + 1) % c.length], nx = q.z - p.z, nz = p.x - q.x, mine = c.map(v => v.x * nx + v.z * nz), theirs = other.map(v => v.x * nx + v.z * nz); return Math.max(...mine) <= Math.min(...theirs) + .05 || Math.max(...theirs) <= Math.min(...mine) + .05; }); });
      const fell = [...staged].filter(o => o.footprint || o.maxZ - o.minZ < 3);
      for (const o of fell) {
        expect(o.minX).toBeGreaterThan(w.bounds.minX + 2); expect(o.maxX).toBeLessThan(w.bounds.maxX - 2); expect(o.minZ).toBeGreaterThan(w.bounds.minZ + 2); expect(o.maxZ).toBeLessThan(w.bounds.maxZ - 2);
        for (const other of others) expect(apart(o, other), `${at(o)} clear of scenery at ${at(other)}`).toBe(true);
        for (const other of fell) if (other !== o) expect(apart(o, other), `${at(o)} clear of ${at(other)}`).toBe(true);
      }
    } finally { w.dispose(); }
  });

  it('runs in a match: warns, brings the gantry down in stages behind dust, replicates, and resets', () => {
    const w = buildHardpointWorld('container-yard');
    try {
      const terrain = { bounds: w.bounds, obstacles: w.obstacles, surfaces: getPhysicalWalkSurfaces(w.scene), traversalObstacles: getTraversalObstacles(w.scene) };
      const arena = createArena(w.obstacles, 4, 'mixed', w.environment, undefined, terrain);
      const parts = getStageParts(w.scene), crane = parts.find(p => p.id === 'stacking-crane-west')!, stack = parts.find(p => p.id === 'container-stack-b')!, east = parts.find(p => p.id === 'stacking-crane-east')!;
      const has = (list: readonly Obstacle[]) => list.every(o => w.obstacles.includes(o));
      arena.addPlayer('p1', 'Player');
      for (let i = 0; i < 100; i++) arena.step(.05);
      expect(arena.triggerLevolution('container-yard-west')).not.toBeNull();
      expect(arena.triggerLevolution('container-yard-west')).toBeNull();
      const event = w.environment.levolution!.events[0], run = (seconds: number) => { for (let t = 0; t < seconds - 1e-6; t += .05) arena.step(.05); };
      expect(validArenaSnapshot(JSON.parse(JSON.stringify(arena.snapshot())), w.environment)).toBe(true);
      run(event.warning - .2);
      expect(has(crane.obstacles) && has(stack.obstacles)).toBe(true);
      run(.5);
      // In the air: the gantry's feet are gone and nothing of it collides yet; the stacks still stand.
      expect(crane.obstacles.some(o => w.obstacles.includes(o))).toBe(false);
      expect(crane.states.fallen.obstacles.some(o => w.obstacles.includes(o))).toBe(false);
      expect(has(stack.obstacles)).toBe(true);
      run(1.6);
      expect(has(stack.states.toppled.obstacles)).toBe(true);
      expect(has(crane.states.fallen.obstacles)).toBe(false);
      run(1.4);
      expect(has(crane.states.fallen.obstacles)).toBe(true);
      const dusty = arena.snapshot();
      expect(dusty.events?.filter(e => e.kind === 'collapse-dust').length).toBe(1);
      expect(validArenaSnapshot(JSON.parse(JSON.stringify(dusty)), w.environment)).toBe(true);
      expect(has(east.obstacles)).toBe(true);
      // Bots carry on over the new map without ending up inside it.
      run(20);
      const settled = arena.snapshot();
      expect(validArenaSnapshot(JSON.parse(JSON.stringify(settled)), w.environment)).toBe(true);
      for (const a of settled.actors) if (a.alive) expect(stack.states.toppled.obstacles.some(o => !o.footprint && a.x > o.minX + .3 && a.x < o.maxX - .3 && a.z > o.minZ + .3 && a.z < o.maxZ - .3 && a.y - 1.75 < o.maxY! - .2 && a.y > o.minY!), `${a.id} inside a box`).toBe(false);
      arena.reset();
      expect(has(crane.obstacles) && has(stack.obstacles)).toBe(true);
      expect(stack.states.toppled.obstacles.some(o => w.obstacles.includes(o))).toBe(false);
      expect(arena.snapshot().levolution).toBeUndefined();
    } finally { w.dispose(); }
  });
});

describe('crush', () => {
  it('kills whoever is still under it when it lands and nobody else, and credits no one', () => {
    const p = part(), obstacles = [...p.obstacles], bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    const { events } = resolveLevolution([{ id: 'b', arena: 'yard', archetype: 'stack-topple', name: 'Stack', parts: { stack: 'stack' }, triggers: [] }], 'yard', [p]);
    const arena = createArena(obstacles, 0, 'mixed', { bounds, move: createRegionMovement(bounds).move, spawns: [{ x: 0, z: 6 }, { x: 30, z: -20 }], levolution: { events } });
    arena.addPlayer('one', 'One'); arena.addPlayer('two', 'Two');
    for (let i = 0; i < 80; i++) arena.step(.05);
    const before = arena.snapshot().actors, under = before.filter(a => Math.hypot(a.x, a.z - 6) < .6), clear = before.filter(a => !under.includes(a));
    expect(under).toHaveLength(1); expect(clear).toHaveLength(1);
    arena.triggerLevolution('b');
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
    const w = buildTeamDeathmatchWorld('container-yard'), events = w.environment.levolution!.events, parts = getStageParts(w.scene);
    const event = events[0], start = { id: 'stage-1', binding: event.binding.id, seed: 1, start: 20 }, sets = event.steps.flatMap(s => s.type === 'set' ? [s] : []);
    return { w, events, event, start, crane: parts.find(p => p.id === 'stacking-crane-west')!, stack: parts.find(p => p.id === 'container-stack-b')!, tipAt: 20 + sets[0].at, burstAt: 20 + sets[1].at, downAt: 20 + sets.at(-1)!.at };
  };
  it('on a guest tips the gantry over, bursts the stacks and swaps meshes and colliders together, and goes back on reset', () => {
    const { w, events, start, crane, stack, tipAt, burstAt, downAt } = build();
    try {
      const view = createStageView(w, events);
      expect(view.sync([], 5)).toBe(false);
      expect(view.sync([start], tipAt - .1)).toBe(false);
      expect(crane.object.parent).toBe(w.scene);
      expect(view.sync([start], tipAt)).toBe(true); expect(view.sync([start], tipAt)).toBe(false);
      expect(crane.object.parent).toBeNull(); expect(crane.states.falling.object.parent).toBe(w.scene);
      const pivot = crane.states.falling.object.children.find(o => o.userData.stageTip)!;
      view.update(tipAt); expect(pivot.rotation.x).toBe(0);
      view.update(tipAt + 1.5); const half = pivot.rotation.x; expect(half).toBeGreaterThan(0); expect(half).toBeLessThan(Math.PI / 4);
      expect(view.sync([start], burstAt)).toBe(true);
      expect(stack.object.parent).toBeNull(); expect(stack.states.toppled.object.parent).toBe(w.scene);
      for (const o of stack.states.toppled.obstacles) expect(w.obstacles).toContain(o);
      let falling = 0; stack.states.toppled.object.traverse(o => { if (o.userData.stageFrom) falling++; });
      expect(falling).toBeGreaterThanOrEqual(8);
      let landings = 0, hardest = 0;
      expect(view.sync([start], downAt)).toBe(true);
      expect(crane.states.falling.object.parent).toBeNull(); expect(crane.states.fallen.object.parent).toBe(w.scene);
      for (const o of crane.states.fallen.obstacles) expect(w.obstacles).toContain(o);
      for (let t = burstAt; t <= downAt + STAGE_FALL_SECONDS + 1; t += .05) for (const landing of view.update(t)) { landings++; hardest = Math.max(hardest, landing.size); }
      expect(landings).toBeGreaterThanOrEqual(falling + 1); expect(hardest).toBeGreaterThan(1);
      expect(view.staged).toBe(3);
      expect(view.sync([], 0)).toBe(true);
      expect(crane.object.parent).toBe(w.scene); expect(stack.object.parent).toBe(w.scene); expect(crane.states.fallen.object.parent).toBeNull();
      for (const o of [...stack.obstacles, ...crane.obstacles]) expect(w.obstacles).toContain(o);
    } finally { w.dispose(); }
  });
  it('shows a late joiner the settled map with nothing falling', () => {
    const { w, events, start, stack, downAt } = build();
    try {
      const view = createStageView(w, events);
      expect(view.sync([start], downAt + 60)).toBe(true);
      expect(view.update(downAt + 60)).toEqual([]);
      let highest = 0; stack.states.toppled.object.traverse(o => { if (o.userData.stageFrom) highest = Math.max(highest, o.position.y); });
      expect(highest).toBeLessThan(4);
    } finally { w.dispose(); }
  });
  it('beside a simulation leaves the colliders alone and reports when the simulation changes them', () => {
    const { w, events, start, stack, burstAt } = build();
    try {
      const view = createStageView(w, events, false), before = [...w.obstacles];
      // The view's clock is ahead of the simulation's: meshes swap, colliders do not.
      expect(view.sync([start], burstAt)).toBe(true);
      expect(w.obstacles).toEqual(before);
      expect(view.sync([start], burstAt)).toBe(false);
      applyStageObstacles(w.obstacles, [stack], new Map([[stack.id, 'toppled']]));
      expect(view.sync([start], burstAt)).toBe(true);
      expect(view.sync([start], burstAt)).toBe(false);
    } finally { w.dispose(); }
  });
});

describe('floods', () => {
  const floods = LEVOLUTION_BINDINGS.filter(b => b.archetype === 'flash-flood');
  it('slow whoever is in the water once it is over the ankles, and nobody else', () => {
    const w = buildTeamDeathmatchWorld('punggol-green');
    try {
      const events = w.environment.levolution!.events, event = events.find(e => e.plugin.id === 'flash-flood')!, zone = event.parts.water.zones![0];
      const host = createLevolutionHost({ events, obstacles: w.obstacles, duration: 300, restage: () => {} });
      const inside = { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }, outside = { x: zone.minX - 5, z: inside.z };
      expect(host.pace(10, inside.x, inside.z)).toBe(1);
      host.trigger(event.binding.id, 10);
      const wade = event.steps.find(s => s.type === 'wade')!;
      expect(wade.type === 'wade' && wade.at).toBeGreaterThan(event.warning);
      expect(host.pace(10 + (wade as { at: number }).at - .1, inside.x, inside.z)).toBe(1);
      expect(host.pace(10 + (wade as { at: number }).at, inside.x, inside.z)).toBeCloseTo(.58);
      expect(host.pace(200, outside.x, outside.z)).toBe(1);
      host.reset(); expect(host.pace(200, inside.x, inside.z)).toBe(1);
    } finally { w.dispose(); }
  });
  it.each(floods.map(b => b.arena))('%s: the water lies on level ground, clear of spawns, and its sheet rises into place', arena => {
    const w = buildTeamDeathmatchWorld(arena), area = TDM_AREAS.find(a => a.id === arena)!;
    try {
      const events = w.environment.levolution!.events, event = events.find(e => e.plugin.id === 'flash-flood')!, part = getStageParts(w.scene).find(p => p.id === event.parts.water.id)!;
      expect(part.zones!.length).toBeGreaterThan(0);
      let level = 0, total = 0;
      for (const zone of part.zones!) {
        expect(zone.minX).toBeGreaterThanOrEqual(w.bounds.minX); expect(zone.maxX).toBeLessThanOrEqual(w.bounds.maxX); expect(zone.minZ).toBeGreaterThanOrEqual(w.bounds.minZ); expect(zone.maxZ).toBeLessThanOrEqual(w.bounds.maxZ);
        for (let x = zone.minX + 1; x < zone.maxX; x += 2) for (let z = zone.minZ + 1; z < zone.maxZ; z += 2) { total++; if (Math.abs(w.bounds.groundHeight?.(x, z) ?? 0) < .2) level++; }
        // Nobody spawns standing in it.
        for (const p of ARENA_TEAMS.flatMap(team => area.spawns[team])) expect(p.x > zone.minX - 2 && p.x < zone.maxX + 2 && p.z > zone.minZ - 2 && p.z < zone.maxZ + 2, `spawn ${p.x},${p.z}`).toBe(false);
      }
      expect(level / total, 'share of the flood on level ground').toBeGreaterThan(.9);
      const view = createStageView(w, events), start = { id: 's', binding: event.binding.id, seed: 1, start: 0 }, set = event.steps.find(s => s.type === 'set')! as { at: number; lead?: number };
      view.sync([start], set.at - set.lead! + .1); view.update(set.at - set.lead! + .1);
      const sheet = part.states.flooded.object.children[0];
      expect(part.states.flooded.object.parent).toBe(w.scene);
      const low = sheet.position.y; expect(low).toBeLessThan(-.2);
      view.sync([start], set.at - set.lead! / 2); view.update(set.at - set.lead! / 2);
      expect(sheet.position.y).toBeGreaterThan(low); expect(sheet.position.y).toBeLessThan(0);
      view.sync([start], set.at + 1); view.update(set.at + 1);
      expect(sheet.position.y).toBeCloseTo(0, 5);
    } finally { w.dispose(); }
  });
});
