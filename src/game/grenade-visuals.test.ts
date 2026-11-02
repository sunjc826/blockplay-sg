import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GRENADE_CATALOG, OICW_AMMUNITION } from './grenade-catalog';
import { createGrenadeVisuals } from './grenade-visuals';
import { grenadePayloads, type GrenadeEvent } from './grenade-system';

const POPS: Record<string, number> = { frag: 1, chilli: 1, durian: 1, 'red-smoke': 4, oranges: 8, firecrackers: 16, oicw: 1 };
const eventFor = (id: string, y = .15): GrenadeEvent => ({ serial: 1, id, caller: 'test', point: { x: 0, y, z: 0 }, heading: 0, start: 0, seed: 1 });
const finiteTransforms = (scene: THREE.Scene) => {
  scene.updateMatrixWorld(true);
  scene.traverse(node => expect(node.matrixWorld.elements.every(Number.isFinite), `${node.type} transform`).toBe(true));
};

describe('all throwable visual timelines', () => {
  it.each([...GRENADE_CATALOG, OICW_AMMUNITION])('$name draws every scheduled burst once and clears its scene', item => {
    const scene = new THREE.Scene(), boom = vi.fn(), visual = createGrenadeVisuals(scene, boom);
    const event = eventFor(item.id, item.id === 'grenade-oranges' ? 4 : .15);
    for (let frame = 0; frame <= 240; frame++) {
      const now = frame / 20;
      visual.update([], [event], now); visual.update([], [event], now);
      finiteTransforms(scene);
    }
    expect(boom).toHaveBeenCalledTimes(POPS[item.id.replace('grenade-', '')] ?? 0);
    // Repeated and stale snapshots must not replay any burst.
    visual.update([], [event], 60);
    expect(boom).toHaveBeenCalledTimes(POPS[item.id.replace('grenade-', '')] ?? 0);
    visual.update([], [], 61);
    expect(scene.children[0].children).toHaveLength(0);
    visual.dispose(); expect(scene.children).toHaveLength(0);
  });
  it.each(GRENADE_CATALOG.filter(i => i.grenade!.effects.some(e => e.kind === 'cloud' || e.kind === 'repel' || e.kind === 'mission')))(
    '$name renders persistent clouds/markers independently of combat particles', item => {
      const scene = new THREE.Scene(), visual = createGrenadeVisuals(scene, () => {}), event = eventFor(item.id);
      visual.update([], [event], 1);
      const payloads = grenadePayloads(event).filter(p => p.type === 'cloud' || p.type === 'marker');
      const meshes: THREE.Mesh[] = [];
      scene.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
      for (const p of payloads) {
        if (p.type === 'marker') expect(meshes.some(m => m.geometry instanceof THREE.RingGeometry)).toBe(true);
        if (p.type === 'cloud') expect(meshes.filter(m => m.geometry instanceof THREE.SphereGeometry).length).toBeGreaterThanOrEqual(14);
      }
      visual.update([], [], 61); expect(scene.children[0].children).toHaveLength(0); visual.dispose();
    });
  it('keeps a ground-level or below-zero orange split finite even with zero flight time', () => {
    for (const y of [0, -2]) {
      const scene = new THREE.Scene(), boom = vi.fn(), visual = createGrenadeVisuals(scene, boom);
      visual.update([], [eventFor('grenade-oranges', y)], 0);
      expect(boom).toHaveBeenCalledTimes(8); finiteTransforms(scene); visual.dispose();
    }
  });
  it('does not replay old explosions when entering an existing match', () => {
    const scene = new THREE.Scene(), boom = vi.fn(), visual = createGrenadeVisuals(scene, boom);
    visual.update([], [eventFor('grenade-firecrackers')], 20);
    expect(boom).not.toHaveBeenCalled(); visual.dispose();
  });
});
