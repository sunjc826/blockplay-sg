import * as THREE from 'three';
import type { Obstacle } from './region-collision';
import { instanceStaticMeshes } from './static-instances';

/**
 * Stage parts: the named pieces of a district that a Levolution event may act
 * on (docs/LEVOLUTION.md). A scene marks a part as it builds it; events name
 * the part and never hold a coordinate, so a part that is moved, resized or
 * restyled takes its events with it.
 *
 * A part is what it is at the start of a match (`obstacles`, `object`) plus any
 * number of named alternative states, each built in the same place by the same
 * scene code and kept out of the world until an event sets it. One state stands
 * at a time: setting a state replaces the part, it does not add to it.
 */

/** What the match simulation needs of a part: no three.js, so the host can run headless. */
export interface StagePartData {
  readonly id: string;
  readonly tags: readonly string[];
  /** The part's colliders at the start of a match. They are in the world's obstacle list. */
  readonly obstacles: readonly Obstacle[];
  /** Alternative states by name. Their colliders are not in the world until set. */
  readonly states: Readonly<Record<string, { readonly obstacles: readonly Obstacle[] }>>;
}
export interface StagePart extends StagePartData {
  readonly object: THREE.Group;
  readonly states: Readonly<Record<string, { readonly obstacles: readonly Obstacle[]; readonly object: THREE.Group }>>;
}
/** The state a part is built in. */
export const STAGE_BASE = 'base';
export type StageState = string | null;

interface StageWorld { scene: THREE.Object3D; obstacles: Obstacle[] }
export const getStageParts = (scene: THREE.Object3D): readonly StagePart[] => scene.userData.stageParts ?? [];
export const stagePartData = (parts: readonly StagePartData[]): StagePartData[] =>
  parts.map(p => ({ id: p.id, tags: p.tags, obstacles: p.obstacles, states: Object.fromEntries(Object.entries(p.states).map(([name, s]) => [name, { obstacles: s.obstacles }])) }));

const VALID_ID = /^[a-z][a-z0-9-]{0,39}$/;
/** Runs `build` and takes what it added to the scene and to the obstacle list. */
function capture(world: StageWorld, name: string, build: () => void) {
  const before = new Set(world.scene.children), count = world.obstacles.length;
  build();
  const group = new THREE.Group(); group.name = name;
  for (const child of [...world.scene.children]) if (!before.has(child)) group.add(child);
  // Repeated boxes draw as one; a mesh carrying userData (a part that will be animated) stays its own object.
  const instances = instanceStaticMeshes(group);
  return { group, obstacles: world.obstacles.slice(count), instances };
}

/**
 * Mark what `build` adds as the stage part `id`. Build it exactly as the scene
 * otherwise would: the meshes are moved under one group (so the shared batches
 * leave them alone and an event can take them away together) and the colliders
 * stay in the obstacle list. Returns instanced meshes for the caller to dispose.
 */
export function captureStagePart(world: StageWorld, id: string, tags: readonly string[], build: () => void) {
  if (!VALID_ID.test(id)) throw new Error(`Invalid stage part id "${id}"`);
  const parts: StagePart[] = world.scene.userData.stageParts ??= [];
  if (parts.some(p => p.id === id)) throw new Error(`Duplicate stage part "${id}"`);
  const { group, obstacles, instances } = capture(world, `stage:${id}`, build);
  world.scene.add(group);
  parts.push({ id, tags: [...tags], obstacles, object: group, states: {} });
  return instances;
}

/**
 * Build an alternative state of part `id` (what is left after it falls, say).
 * Author it beside the part, from the same position arguments. It is taken out
 * of the scene and its colliders out of the obstacle list until an event sets it.
 * A mesh that should move into place carries `userData.stageFrom` (see `stageFall`).
 */
export function captureStageState(world: StageWorld, id: string, state: string, build: () => void) {
  const part = getStageParts(world.scene).find(p => p.id === id);
  if (!part) throw new Error(`Unknown stage part "${id}"`);
  if (!VALID_ID.test(state) || state === STAGE_BASE || state in part.states) throw new Error(`Invalid or duplicate state "${state}" of stage part "${id}"`);
  const { group, obstacles, instances } = capture(world, `stage:${id}:${state}`, build);
  world.obstacles.length -= obstacles.length;
  (part.states as Record<string, StagePart['states'][string]>)[state] = { obstacles, object: group };
  return instances;
}

/** Where a mesh of an alternative state starts from when the state is set, in the part's space. */
export interface StageFrom { position: [number, number, number]; yaw?: number; delay?: number }
/** Tag a mesh to fall into its authored pose from `from` when its state is set. Keeps it out of the instanced batch. */
export function stageFall<T extends THREE.Object3D>(object: T, from: StageFrom): T { object.userData.stageFrom = from; return object; }

/** A group of an alternative state that goes over as one piece when the state is set: turned about its own X by `tip` and Y by `yaw`. */
export interface StageTip { tip: number; yaw: number; seconds: number }
/** Tag a pivot group (rotation order YXZ, built upright) to tip over when its state is set. */
export function stageTip<T extends THREE.Object3D>(object: T, tip: StageTip): T { object.userData.stageTip = tip; return object; }
/** Tag an object as landing hard when its state is set: `size` scales the dust, the thump and the shake. */
export function stageImpact<T extends THREE.Object3D>(object: T, size: number): T { object.userData.stageImpact = size; return object; }

/** The colliders `part` contributes in `state`. */
export const stageObstacles = (part: StagePartData, state: StageState): readonly Obstacle[] =>
  state === null ? [] : state === STAGE_BASE ? part.obstacles : part.states[state]?.obstacles ?? part.obstacles;

/**
 * Make `obstacles` hold each part's colliders for its wanted state and none of
 * its others. By identity and idempotent: the host simulation and the renderer
 * share one list in a solo or hosted match and may both call this.
 */
export function applyStageObstacles(obstacles: Obstacle[], parts: readonly StagePartData[], states: ReadonlyMap<string, StageState>) {
  const wanted = new Set<Obstacle>(), owned = new Set<Obstacle>();
  for (const part of parts) {
    for (const o of part.obstacles) owned.add(o);
    for (const s of Object.values(part.states)) for (const o of s.obstacles) owned.add(o);
    for (const o of stageObstacles(part, states.has(part.id) ? states.get(part.id)! : STAGE_BASE)) wanted.add(o);
  }
  const removed: Obstacle[] = [], present = new Set<Obstacle>();
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (!owned.has(o)) continue;
    if (wanted.has(o)) present.add(o); else { obstacles.splice(i, 1); removed.push(o); }
  }
  const added = [...wanted].filter(o => !present.has(o));
  obstacles.push(...added);
  return { added, removed };
}
