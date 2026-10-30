import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVisionMount, visionMountPose } from './fps-vision-mount';
import { advanceVision, createVisionState, toggleVision, VISION_DEVICES, VISION_MOUNT_SECONDS } from './vision-devices';

describe('physical vision mount', () => {
  it('grasps before rotating and seats the eyecup before covering the view', () => {
    expect(visionMountPose(0)).toMatchObject({ visible: false, reach: 0, cover: 0, weaponDown: 0 });
    expect(visionMountPose(.22)).toMatchObject({ flip: 0, reach: 1, cover: 0 });
    expect(visionMountPose(.5)).toMatchObject({ reach: 1, grip: 1, cover: 0, weaponDown: 1 });
    expect(visionMountPose(.78).flip).toBe(1);
    expect(visionMountPose(.9).cover).toBeGreaterThan(0);
    expect(visionMountPose(.9).reach).toBeLessThan(1);
    expect(visionMountPose(1)).toMatchObject({ visible: false, reach: 0, cover: 1, weaponDown: 0 });
  });

  it('retraces the same hand and hinge pose when a toggle is interrupted', () => {
    const state = createVisionState(), spec = VISION_DEVICES['nvg-gen2'];
    toggleVision(state, spec); advanceVision(state, spec, VISION_MOUNT_SECONDS * .4);
    const before = visionMountPose(state.mount);
    toggleVision(state, spec);
    expect(visionMountPose(state.mount)).toEqual(before);
    advanceVision(state, spec, VISION_MOUNT_SECONDS * .2);
    expect(state.mount).toBeCloseTo(.2);
    toggleVision(state, spec); advanceVision(state, spec, VISION_MOUNT_SECONDS * .2);
    expect(state.mount).toBeCloseTo(.4);
    expect(visionMountPose(state.mount)).toEqual(before);
  });

  it('selects all five equipped models and clears them when equipment is removed', () => {
    const mount = createVisionMount(), state = { ...createVisionState(), mount: .5 };
    const visibleModels = () => {
      const out: string[] = [];
      mount.scene.traverse(o => { if (/^(nvg|thermal)-\d$/.test(o.name) && o.visible) out.push(o.name); });
      return out;
    };
    for (const spec of Object.values(VISION_DEVICES)) {
      mount.update(spec, state, 16 / 9);
      expect(visibleModels()).toEqual([`${spec.kind}-${spec.generation}`]);
      // Camera framing and transforms stay finite on portrait screens too.
      mount.update(spec, state, 9 / 16);
      mount.scene.traverse(o => expect(o.position.toArray().every(Number.isFinite)).toBe(true));
    }
    mount.update(undefined, state, 1);
    expect(visibleModels()).toEqual([]);
    mount.dispose(); expect(mount.scene.children).toHaveLength(0);
  });

  it('never draws hands for an idle, restored or reduced-motion state', () => {
    const mount = createVisionMount(), spec = VISION_DEVICES['thermal-t2'];
    expect(mount.update(spec, createVisionState(), 1).visible).toBe(false);
    expect(mount.update(spec, createVisionState(true), 1).visible).toBe(false);
    const state = createVisionState(); toggleVision(state, spec); advanceVision(state, spec, .016, true);
    expect(mount.update(spec, state, 1).visible).toBe(false);
    toggleVision(state, spec); advanceVision(state, spec, .016, true);
    expect(mount.update(spec, state, 1).visible).toBe(false);
    mount.dispose();
  });

  it('releases every geometry and material owned by the mount', () => {
    const mount = createVisionMount(), geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    mount.scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    let released = 0;
    for (const asset of [...geometries, ...materials]) asset.addEventListener('dispose', () => released++);
    mount.dispose(); expect(released).toBe(geometries.size + materials.size);
  });
});
