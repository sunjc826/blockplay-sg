import * as THREE from 'three';
import { TDM_AREAS, type TeamDeathmatchArea } from './arena-match';
import { combatTimeline } from './combat-events';
import './combat-event-catalog';
import { HARDPOINT_ARENAS } from './hardpoint';
import { levolutionMarkers, resolveLevolution, stageStates, stagedParts, type LevolutionDescriptor, type ResolvedLevolution, type StageStep } from './levolution';
import { LEVOLUTION_BINDINGS } from './levolution-bindings';
import { createStageView } from './levolution-stage';
import type { Obstacle, RegionBounds } from './region-collision';
import type { RegionId } from './region-ids';
import { STAGE_BASE, getStageParts, stageObstacles, stagePartData, type StageState } from './stage-parts';

/**
 * Levolution on the level review board (docs/LEVOLUTION.md, "Reviewing events
 * in the debug view"): a district's events scrubbed along a timeline on the
 * built scene, with overlays drawn from the same data the host resolves.
 * It drives the game's own stage view, so the board cannot show a map a match
 * would not arrive at.
 */

export interface StageReviewArena { area: TeamDeathmatchArea; events: readonly ResolvedLevolution[] }
/** The district's arenas that have events its scene can stage. */
export function districtStageArenas(district: RegionId, scene: THREE.Object3D): StageReviewArena[] {
  const parts = stagePartData(getStageParts(scene));
  return TDM_AREAS.filter(area => area.region === district).map(area => ({ area, events: resolveLevolution(LEVOLUTION_BINDINGS, area.id, parts).events })).filter(arena => arena.events.length);
}
/** Seconds from the start of the warning until the last of `events` has settled. */
export const stageSpan = (events: readonly ResolvedLevolution[]) => Math.max(1, ...events.map(e => e.duration));
const STEP_LABEL: Record<Exclude<StageStep['type'], 'marker'>, string> = { set: 'changes', crush: 'lands', dust: 'dust', light: 'lights out' };
/** What happens when, for the ticks under the scrubber: one entry per distinct moment. */
export function stageTicks(events: readonly ResolvedLevolution[]) {
  const ticks = new Map<number, string[]>();
  const add = (at: number, text: string) => { const key = Math.round(at * 100) / 100; ticks.set(key, [...(ticks.get(key) ?? []), text]); };
  for (const event of events) {
    add(0, `${event.binding.name}: warning`);
    for (const step of event.steps) if (step.type !== 'marker') add(step.at, `${event.binding.name}: ${step.type === 'set' ? `${step.part} ${step.state === null ? 'removed' : `→ ${step.state}`}` : STEP_LABEL[step.type]}`);
    add(event.duration, `${event.binding.name}: settled`);
  }
  return [...ticks].sort((a, b) => a[0] - b[0]).map(([at, labels]) => ({ at, label: [...new Set(labels)].join(' · ') }));
}
/** Which part of its event the moment `t` falls in, for the strip's label. */
export function stagePhase(events: readonly ResolvedLevolution[], t: number) {
  if (!events.length || t <= 0) return 'As built';
  if (t >= stageSpan(events)) return 'Settled';
  return events.some(e => t >= e.warning && t < e.duration) ? 'Coming down' : events.some(e => t < e.warning) ? 'Warning' : 'Settling';
}

export interface StageOverlays { ring: boolean; crush: boolean; colliders: boolean; dust: boolean; dressing: boolean }
export const DEFAULT_STAGE_OVERLAYS: StageOverlays = { ring: true, crush: true, colliders: false, dust: true, dressing: true };

const corners = (o: Obstacle) => o.footprint ?? [{ x: o.minX, z: o.minZ }, { x: o.maxX, z: o.minZ }, { x: o.maxX, z: o.maxZ }, { x: o.minX, z: o.maxZ }];
const noRaycast = () => {};
/** Overlays are notes on the scene, not part of it: no pin lands on one and no depth hides one. */
function note<T extends THREE.Object3D>(object: T, order = 900) { object.userData.fpsEffect = true; object.raycast = noRaycast; object.renderOrder = order; return object; }
const lineMaterial = (color: string, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, toneMapped: false });
const fillMaterial = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
function loop(points: readonly { x: number; z: number }[], y: number, material: THREE.LineBasicMaterial) {
  return note(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, y, p.z))), material));
}
function circle(center: { x: number; z: number }, radius: number, y: number, material: THREE.LineBasicMaterial) {
  return loop(Array.from({ length: 64 }, (_, i) => ({ x: center.x + Math.cos(i / 64 * Math.PI * 2) * radius, z: center.z + Math.sin(i / 64 * Math.PI * 2) * radius })), y, material);
}
function patch(points: readonly { x: number; z: number }[], y: number, material: THREE.MeshBasicMaterial) {
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.z))), mesh = note(new THREE.Mesh(new THREE.ShapeGeometry(shape), material), 880);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; return mesh;
}
/** A collider as the box it is: bottom and top outlines and the edges between. */
function cage(o: Obstacle, ground: number, material: THREE.LineBasicMaterial) {
  const points = corners(o), low = Math.max(ground, o.minY ?? ground), high = Math.min(o.maxY ?? low + 12, low + 30), positions: number[] = [];
  points.forEach((p, i) => { const q = points[(i + 1) % points.length]; positions.push(p.x, low, p.z, q.x, low, q.z, p.x, high, p.z, q.x, high, q.z, p.x, low, p.z, p.x, high, p.z); });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return note(new THREE.LineSegments(geometry, material));
}
function disposeGroup(group: THREE.Object3D) {
  group.traverse(object => { const o = object as THREE.Mesh; o.geometry?.dispose(); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose(); });
  group.removeFromParent();
}

/** The colliders each `crush` step of `event` lands, with the second it lands them. */
export function crushFootprints(event: ResolvedLevolution) {
  const descriptor: LevolutionDescriptor = { id: 'review', binding: event.binding.id, seed: 1, start: 0 }, parts = stagedParts([event]);
  const solids = (t: number) => { const states = stageStates([event], [descriptor], t); return new Set(parts.flatMap(part => [...stageObstacles(part, states.has(part.id) ? states.get(part.id)! : STAGE_BASE)])); };
  return event.steps.flatMap(step => {
    if (step.type !== 'crush') return [];
    const before = solids(step.at - 1e-4);
    return [{ at: step.at, damage: step.damage, obstacles: [...solids(step.at)].filter(o => !before.has(o)) }];
  });
}
/** The dust clouds `event` raises, in seconds from its start. */
export function dustClouds(event: ResolvedLevolution) {
  return event.steps.flatMap(step => step.type !== 'dust' ? [] : combatTimeline({ id: 'review', kind: 'collapse-dust', seed: 1, start: 0, target: step.center, heading: step.heading + Math.PI, intensity: 1, reach: step.reach })
    .flatMap(payload => payload.type === 'cloud' ? [{ center: payload.center, radius: payload.radius, from: step.at + payload.from, until: step.at + payload.until }] : []));
}

/**
 * One district's events on the board's scene. `seek` puts the scene at second
 * `t` of the chosen events (all started together at 0) and returns what landed
 * getting there, when it was reached by playing forward; `overlays` returns the
 * notes to draw for that moment.
 */
export function createStageReview(world: { scene: THREE.Scene; obstacles: Obstacle[] }, arenas: readonly StageReviewArena[], bounds: RegionBounds) {
  const all = arenas.flatMap(arena => arena.events), view = createStageView(world, all);
  const ground = (x: number, z: number) => bounds.groundHeight?.(x, z) ?? 0;
  let at = 0, chosen = '', overlay: THREE.Group | null = null, dressed: THREE.Group | null = null, dressedFor = '';
  const running = (events: readonly ResolvedLevolution[]): LevolutionDescriptor[] => events.map(e => ({ id: `review-${e.binding.id}`, binding: e.binding.id, seed: 1, start: 0 }));

  function seek(events: readonly ResolvedLevolution[], t: number) {
    const key = events.map(e => e.binding.id).join(), descriptors = running(events), landings: { at: THREE.Vector3; size: number }[] = [];
    // Each state is entered at its own moment, as in play, so a scrub backwards or a new choice replays from the start.
    const replay = key !== chosen || t < at || t - at > .5;
    if (replay) { view.sync([], 0); view.update(0); for (let now = 0; now < t; now = Math.min(t, now + .05)) { view.sync(descriptors, now); view.update(now); } }
    view.sync(descriptors, t); const landed = view.update(t); if (!replay) landings.push(...landed);
    at = t; chosen = key; world.scene.updateMatrixWorld(true);
    return landings;
  }

  function overlays(events: readonly ResolvedLevolution[], t: number, options: StageOverlays, arena?: StageReviewArena) {
    if (overlay) disposeGroup(overlay);
    overlay = note(new THREE.Group()); overlay.name = 'Levolution review overlays';
    const descriptors = running(events), lift = (p: { x: number; z: number }) => ground(p.x, p.z) + .35;
    if (options.ring) for (const marker of levolutionMarkers(events, descriptors, t)) for (const width of [0, .25]) overlay.add(circle(marker.center, marker.radius + width, lift(marker.center), lineMaterial('#ff5a36')));
    if (options.crush) for (const event of events) for (const crush of crushFootprints(event)) {
      // Bright while it is still to come, faint once it is down.
      const due = t < crush.at;
      for (const o of crush.obstacles) if ((o.minY ?? 0) < 2.2) { const y = lift({ x: (o.minX + o.maxX) / 2, z: (o.minZ + o.maxZ) / 2 }); overlay.add(patch(corners(o), y, fillMaterial('#e02a1f', due ? .5 : .16)), loop(corners(o), y, lineMaterial('#e02a1f', due ? 1 : .5))); }
    }
    if (options.colliders) {
      const states = stageStates(events, descriptors, t), material = lineMaterial('#19c2d8', .9);
      for (const part of stagedParts(arena?.events ?? events)) for (const o of stageObstacles(part, states.has(part.id) ? states.get(part.id) as StageState : STAGE_BASE)) overlay.add(cage(o, ground((o.minX + o.maxX) / 2, (o.minZ + o.maxZ) / 2), material));
    }
    if (options.dust) for (const event of events) for (const cloud of dustClouds(event)) if (t >= cloud.from && t <= cloud.until) {
      const fade = Math.min(1, (cloud.until - t) / 4, (t - cloud.from) / .8 + .2), y = lift(cloud.center);
      const puff = note(new THREE.Mesh(new THREE.SphereGeometry(cloud.radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), fillMaterial('#b3ab9b', .42 * fade)), 870); puff.position.set(cloud.center.x, y, cloud.center.z);
      overlay.add(puff, circle(cloud.center, cloud.radius, y, lineMaterial('#8d8676', .8 * fade)));
    }
    world.scene.add(overlay);
    const dress = options.dressing && arena ? arena.area.id : '';
    if (dress !== dressedFor) {
      if (dressed) disposeGroup(dressed); dressed = null; dressedFor = dress;
      if (arena && dress) {
        dressed = note(new THREE.Group()); dressed.name = 'Arena dressing';
        const b = arena.area.bounds, y = (p: { x: number; z: number }) => ground(p.x, p.z) + .3;
        dressed.add(loop([{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.minZ }, { x: b.maxX, z: b.maxZ }, { x: b.minX, z: b.maxZ }], y({ x: b.minX, z: b.minZ }), lineMaterial('#f3d46e')));
        for (const [team, colour] of [['alpha', '#63cfff'], ['bravo', '#ffb054']] as const) for (const p of arena.area.spawns[team]) dressed.add(patch(Array.from({ length: 16 }, (_, i) => ({ x: p.x + Math.cos(i / 8 * Math.PI) * 1.2, z: p.z + Math.sin(i / 8 * Math.PI) * 1.2 })), y(p), fillMaterial(colour, .9)));
        for (const p of arena.area.patrols) dressed.add(circle(p, .7, y(p), lineMaterial('#e9e6d8', .8)));
        for (const site of HARDPOINT_ARENAS.find(a => a.area.id === arena.area.id)?.sites ?? []) for (const width of [0, .2]) dressed.add(circle(site, site.radius + width, site.y + .3, lineMaterial('#ffe487')));
        for (const block of arena.area.cover ?? []) dressed.add(cage({ minX: block.x - block.width / 2, maxX: block.x + block.width / 2, minZ: block.z - block.depth / 2, maxZ: block.z + block.depth / 2, minY: ground(block.x, block.z), maxY: ground(block.x, block.z) + block.height }, ground(block.x, block.z), lineMaterial('#c9b98f')));
        for (const prop of arena.area.layout?.structures.flatMap(s => s.props ?? []) ?? []) dressed.add(circle(prop, 1.4, y(prop), lineMaterial('#c9b98f')));
        world.scene.add(dressed);
      }
    }
  }

  return {
    seek, overlays,
    dispose() { if (overlay) disposeGroup(overlay); if (dressed) disposeGroup(dressed); overlay = dressed = null; view.dispose(); },
  };
}
