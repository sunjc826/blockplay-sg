import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { bodyMagazines, bodyMagazineSlots, createFpsBody } from './fps-body';
import { createProfile, resolveLoadout } from './armory-state';
import { createLoadout } from './fps-rules';

describe('first person worn equipment', () => {
  it('keeps rig capacity separate from protection and increases slots with carry capacity', () => {
    expect(['rig-ilbv', 'rig-lbs', 'rig-sentinel'].map(bodyMagazineSlots)).toEqual([6, 8, 9]);
    const equipment = resolveLoadout({ ...createProfile(), rig: 'rig-sentinel', plate: 'plate-steel' });
    expect(equipment.rigId).toBe('rig-sentinel'); expect(equipment.plateId).toBe('plate-steel');
  });

  it('shows pickups, partial magazines and emptied reserves without counting loaded rounds', () => {
    const equipment = resolveLoadout(createProfile());
    const states = createLoadout(equipment.weapons);
    states.forEach(state => { state.reserve = 0; });
    expect(bodyMagazines(equipment, states)).toEqual([]);
    states[0].reserve = 1;
    expect(bodyMagazines(equipment, states)).toEqual([0]);
    states[0].reserve += equipment.weapons[0].capacity;
    expect(bodyMagazines(equipment, states)).toEqual([0, 0]);
    states[0].reserve -= equipment.weapons[0].capacity;
    expect(bodyMagazines(equipment, states)).toEqual([0]);
    states[0].reserve = 999;
    expect(bodyMagazines(equipment, states)).toHaveLength(6);
  });

  it('represents a shared calibre once and leaves room for the sidearm', () => {
    const equipment = resolveLoadout(createProfile());
    equipment.carriedFamilies = [0, 2, 1];
    const states = createLoadout(equipment.weapons);
    states[0].reserve = 30; states[2].reserve = 15;
    expect(bodyMagazines(equipment, states)).toEqual([0, 2]);
  });

  it('uses the active gun to pack a shared calibre into magazines or drums', () => {
    const equipment = resolveLoadout(createProfile()); equipment.carriedFamilies = [0, 2, 1];
    const states = createLoadout(equipment.weapons);
    // A shared pool exposes the same reserve number on both weapon snapshots.
    states[0].reserve = states[1].reserve = 120; states[2].reserve = 15;
    expect(bodyMagazines(equipment, states, 0)).toEqual([0, 2, 0, 0, 0]);
    expect(bodyMagazines(equipment, states, 1)).toEqual([1, 2, 1]);
    expect(bodyMagazines(equipment, states, 7)).toEqual([0, 2, 0, 0, 0]);
  });

  it('shows distinct MG boxes, drums and pistol magazines, and reuses models when swapping', () => {
    const scene = new THREE.Scene(), body = createFpsBody(scene);
    const equipment = resolveLoadout(createProfile()); equipment.carriedFamilies = [3, 2];
    let states = createLoadout(equipment.weapons);
    states[3].reserve = 101; states[2].reserve = 15;
    const pose = { x: 0, y: 0, z: 0, yaw: 0, visible: true, activeFamily: 3 };
    body.update(.016, equipment, states, pose);
    const slot = body.root.getObjectByName('magazine-slot-0')!;
    const ammoBox = slot.getObjectByName('reserve-ammo-box')!;
    expect(ammoBox.visible).toBe(true);
    expect(ammoBox.getObjectByName('carry-handle')).toBeDefined();
    expect(ammoBox.getObjectByName('lid-latch')).toBeDefined();
    expect(body.root.getObjectByName('magazine-slot-1')?.userData.container).toBe('pistol-magazine');
    expect(body.root.getObjectByName('magazine-slot-2')?.userData.container).toBe('ammo-box');
    expect(body.root.userData.magazines).toBe(3);
    equipment.carriedFamilies = [0, 1, 2];
    states = createLoadout(equipment.weapons);
    states[0].reserve = states[1].reserve = 60; states[2].reserve = 0;
    body.update(.016, equipment, states, { ...pose, activeFamily: 1 });
    expect(ammoBox.visible).toBe(false);
    const drum = slot.getObjectByName('reserve-drum')!;
    expect(drum.visible).toBe(true);
    expect((drum.getObjectByName('drum-body') as THREE.Mesh).geometry.type).toBe('CylinderGeometry');
    body.update(.016, equipment, states, { ...pose, activeFamily: 0 });
    expect(drum.visible).toBe(false); expect(slot.getObjectByName('reserve-magazine')?.visible).toBe(true);
    body.update(.016, equipment, states, { ...pose, activeFamily: 1 });
    expect(slot.getObjectByName('reserve-drum')).toBe(drum);
    states[0].reserve = states[1].reserve = 0;
    body.update(.016, equipment, states, { ...pose, activeFamily: 1 });
    expect(drum.visible).toBe(false); expect(slot.userData.container).toBeNull();
    const disposed = vi.spyOn((drum.getObjectByName('drum-body') as THREE.Mesh).geometry, 'dispose');
    body.dispose(); expect(disposed).toHaveBeenCalledOnce();
  });

  it('rebuilds worn inserts and pouches on equipment changes, keeping spent armor on the body', () => {
    const scene = new THREE.Scene(), body = createFpsBody(scene);
    let equipment = resolveLoadout(createProfile());
    const states = createLoadout(equipment.weapons);
    const pose = { x: 10, y: 3, z: 20, yaw: Math.PI / 2, visible: true };
    body.update(0, equipment, states, pose);
    expect(body.root.userData.fpsEffect).toBe(true);
    expect(body.root.getObjectByName('rig-neck')?.visible).toBe(false);
    expect(body.root.userData.magazineSlots).toBe(6);
    const old = body.root.getObjectByName('rig-ilbv') as THREE.Mesh;
    const disposed = vi.spyOn(old.geometry, 'dispose');
    equipment = resolveLoadout({ ...createProfile(), rig: 'rig-sentinel', plate: 'plate-pillbox' });
    equipment.armor = 0;
    body.update(.016, equipment, states, { ...pose, crouch: 1 });
    expect(disposed).toHaveBeenCalledOnce();
    expect(body.root.getObjectByName('plate-pillbox')).toBeDefined();
    expect(body.root.getObjectByName('rig-ilbv')).toBeUndefined();
    expect(body.root.userData.magazineSlots).toBe(9);
    expect(body.root.position.y).toBe(3);
    for (let frame = 0; frame < 120; frame++) body.update(1 / 60, equipment, states, { ...pose, prone: true });
    body.root.traverse(node => expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    body.update(.016, equipment, states, { ...pose, visible: false });
    expect(body.root.visible).toBe(false);
    body.dispose(); expect(scene.children).toHaveLength(0);
  });
});
