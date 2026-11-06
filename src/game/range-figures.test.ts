import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRangeFigures, rangeFigurePlan } from './range-figures';

const setup = (blocked: (x: number, z: number) => boolean = () => false) => ({
  spawn: { x: 10, z: 20 }, targets: [{ x: 4, z: -10 }, { x: 16, z: -10 }], ground: () => .13, canStand: (x: number, z: number) => !blocked(x, z),
});

describe('range figures', () => {
  it('stands two of your section beside the firing point and onlookers behind it', () => {
    const plan = rangeFigurePlan(setup());
    expect(plan.filter(f => f.side === 'ally')).toHaveLength(2);
    expect(plan.filter(f => f.side === 'neutral')).toHaveLength(3);
    for (const f of plan) {
      // The targets are up the -z side, so nobody stands downrange of the shooter.
      expect(f.z).toBeGreaterThan(20 - 1);
      expect(Math.hypot(f.x - 10, f.z - 20)).toBeGreaterThan(1.6);
      if (f.side === 'neutral') expect(f.z).toBeGreaterThan(24);
    }
    // Section members face downrange (-z), onlookers face the firing point.
    const ally = plan.find(f => f.side === 'ally')!, visitor = plan.find(f => f.side === 'neutral')!;
    const facing = (yaw: number) => new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    expect(facing(ally.yaw).z).toBeLessThan(-.99);
    expect(facing(visitor.yaw).dot(new THREE.Vector3(10 - visitor.x, 0, 20 - visitor.z).normalize())).toBeGreaterThan(.99);
  });
  it('moves to the next spot when one is blocked, and leaves out anyone with nowhere to stand', () => {
    const near = rangeFigurePlan(setup((_x, z) => z < 23));
    expect(near.filter(f => f.side === 'ally').length).toBeLessThan(2);
    expect(near.every(f => f.z >= 23)).toBe(true);
    expect(rangeFigurePlan(setup(() => true))).toEqual([]);
  });
  it('adds the figures to the scene with colliders and takes them away again', () => {
    const scene = new THREE.Scene(), figures = createRangeFigures(scene, setup());
    expect(figures.figures).toHaveLength(5); expect(figures.obstacles).toHaveLength(5);
    expect(scene.children).toHaveLength(5);
    figures.update(.016, new THREE.Vector3(10, 1.6, 20));
    expect(figures.figures.every(f => Math.abs(f.root.position.y - .13) < 1e-6)).toBe(true);
    figures.dispose(); expect(scene.children).toHaveLength(0);
  });
});
