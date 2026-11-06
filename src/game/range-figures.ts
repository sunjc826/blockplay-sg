import * as THREE from 'three';
import { arenaCharacterLook, npcCharacterLook } from './character-looks';
import { createCharacterRig, type CharacterGesture, type CharacterRig } from './character-rig';
import { PLAYER_FACTION } from './arena-factions';

/**
 * People at a practice range who are not targets: two of your own section
 * beside the firing point, and a few members of the public watching from
 * behind the line. They give an IFF reader friendlies and neutrals to tell
 * from the hostile targets downrange. They stand still, turn their heads to
 * a shooter who comes close, and are solid to walk into; the drill ignores
 * them.
 */
export type RangeFigureSide = 'ally' | 'neutral';
export interface RangeFigure { id: string; side: RangeFigureSide; root: THREE.Group }
interface Placed extends RangeFigure { rig: CharacterRig; gesture: CharacterGesture }
interface Point { x: number; z: number }
export interface RangeFigureSetup {
  spawn: Point; targets: readonly Point[];
  /** Floor height at a point. */
  ground(x: number, z: number): number;
  /** Whether a person fits standing here. */
  canStand(x: number, z: number): boolean;
}

/** Where each figure would like to stand: metres along the firing line's forward and right, nearest first; the first that fits is used. */
const PLACES: readonly { id: string; side: RangeFigureSide; gesture: CharacterGesture; faceShooter: boolean; spots: readonly [number, number][] }[] = [
  { id: 'section-left', side: 'ally', gesture: 'idle', faceShooter: false, spots: [[-.6, -2.4], [-1.6, -2.2], [.6, -2.6], [-2.6, -1.2]] },
  { id: 'section-right', side: 'ally', gesture: 'idle', faceShooter: false, spots: [[-.6, 2.4], [-1.6, 2.2], [.6, 2.6], [-2.6, 1.2]] },
  { id: 'visitor-1', side: 'neutral', gesture: 'clasp', faceShooter: true, spots: [[-7, -2.2], [-6, -3.5], [-8.5, -1], [-5, -4.5]] },
  { id: 'visitor-2', side: 'neutral', gesture: 'point', faceShooter: true, spots: [[-7.4, .4], [-6.2, 1.2], [-8.8, 0], [-5.4, 0]] },
  { id: 'visitor-3', side: 'neutral', gesture: 'behind', faceShooter: true, spots: [[-7, 2.8], [-6, 4], [-8.5, 2], [-5, 4.8]] },
];

/** Forward is from the firing point towards the middle of the targets. */
export function rangeFigurePlan(setup: RangeFigureSetup) {
  const { spawn, targets } = setup;
  const centre = targets.reduce((sum, t) => ({ x: sum.x + t.x / targets.length, z: sum.z + t.z / targets.length }), { x: 0, z: 0 });
  let fx = centre.x - spawn.x, fz = centre.z - spawn.z;
  const length = Math.hypot(fx, fz) || 1; fx /= length; fz /= length;
  if (!targets.length) { fx = 0; fz = -1; }
  const rx = -fz, rz = fx, taken: Point[] = [];
  const plan: { id: string; side: RangeFigureSide; gesture: CharacterGesture; x: number; z: number; yaw: number }[] = [];
  for (const place of PLACES) {
    const spot = place.spots.map(([forward, right]) => ({ x: spawn.x + fx * forward + rx * right, z: spawn.z + fz * forward + rz * right }))
      .find(p => taken.every(t => Math.hypot(t.x - p.x, t.z - p.z) > 1.2) && Math.hypot(p.x - spawn.x, p.z - spawn.z) > 1.6 && setup.canStand(p.x, p.z));
    if (!spot) continue;
    taken.push(spot);
    // A rig looks along its -z: section members face downrange, visitors the firing point.
    const dx = place.faceShooter ? spawn.x - spot.x : fx, dz = place.faceShooter ? spawn.z - spot.z : fz;
    plan.push({ id: place.id, side: place.side, gesture: place.gesture, ...spot, yaw: Math.atan2(-dx, -dz) });
  }
  return plan;
}

export function createRangeFigures(scene: THREE.Scene, setup: RangeFigureSetup) {
  const placed: Placed[] = [];
  const obstacles: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }[] = [];
  for (const spot of rangeFigurePlan(setup)) {
    const look = spot.side === 'ally'
      ? arenaCharacterLook({ bot: true, role: 'rifle', id: `range-${spot.id}`, faction: PLAYER_FACTION })
      : npcCharacterLook({ id: `range-${spot.id}`, role: 'Visitor', interaction: { kind: 'dialogue' } });
    const rig = createCharacterRig(look, `range-${spot.id}`);
    const floor = setup.ground(spot.x, spot.z);
    rig.root.position.set(spot.x, floor, spot.z); rig.root.rotation.y = spot.yaw;
    rig.root.userData.rangeFigure = spot.side;
    scene.add(rig.root);
    placed.push({ id: spot.id, side: spot.side, root: rig.root, rig, gesture: spot.gesture });
    obstacles.push({ minX: spot.x - .3, maxX: spot.x + .3, minZ: spot.z - .3, maxZ: spot.z + .3, minY: floor, maxY: floor + 1.8 });
  }
  const viewer = new THREE.Vector3();
  let clock = 0;
  return {
    figures: placed.map(({ id, side, root }): RangeFigure => ({ id, side, root })),
    obstacles,
    /** Idle life, and a glance at a shooter within a few metres. */
    update(dt: number, at: THREE.Vector3) {
      clock += dt;
      for (const figure of placed) {
        const near = figure.root.position.distanceTo(at) < 7;
        if (near) { viewer.copy(at); figure.root.worldToLocal(viewer); }
        figure.rig.update(dt, { lookAt: near ? viewer : null, gesture: figure.gesture === 'point' && Math.sin(clock * .35 + 1) < .4 ? 'idle' : figure.gesture });
      }
    },
    dispose() {
      for (const figure of placed) { figure.root.removeFromParent(); figure.rig.resources.forEach(resource => resource.dispose()); }
    },
  };
}
