import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { bodyMagazines, bodyMagazineSlots, createFpsBody } from './fps-body';
import { createProfile, resolveLoadout } from './armory-state';
import { createPooledLoadout } from './ammo-pools';
import { advanceWeapon, beginReload } from './fps-rules';
import { frontMagazineSlot, rearMagazineSlot } from './magazine-inventory';

const pose = { x: 0, y: 0, z: 0, yaw: 0, visible: true, activeFamily: 0 };
it.each(['rig-pathfinder', 'rig-expedition', 'rig-atlas'])('renders distinct, reachable pouch positions on %s', rig => {
  const kit = resolveLoadout({ ...createProfile(), rig }); kit.carriedFamilies = [12, 2];
  const states = createPooledLoadout(kit.weapons, kit.carriedFamilies), body = createFpsBody(new THREE.Scene());
  body.update(0, kit, states, { ...pose, activeFamily: 12 });
  const positions: THREE.Vector3[] = [];
  for (let pouch = 0; pouch < bodyMagazineSlots(rig); pouch++) {
    const frontSlot = frontMagazineSlot(pouch), rearSlot = rearMagazineSlot(pouch);
    const position = body.magazinePosition(frontSlot)!;
    expect(position.toArray().every(Number.isFinite)).toBe(true);
    for (const other of positions) expect(position.distanceTo(other)).toBeGreaterThan(.1);
    positions.push(position);
    const front = states[12].magazineInventory!.slots[frontSlot];
    expect(body.magazineSource(frontSlot, front!)!.model.visible).toBe(true);
    const rear = states[12].magazineInventory!.slots[rearSlot];
    if (rear) {
      const a = body.magazineSource(frontSlot, front!)!.model, b = body.magazineSource(rearSlot, rear)!.model;
      expect(a).not.toBe(b); expect(b.visible).toBe(true);
      // Compare in pouch space: world axis-aligned boxes overlap when side
      // pouches rotate even though the actual magazines remain separated.
      expect(new THREE.Box3().setFromObject(a.clone()).intersectsBox(new THREE.Box3().setFromObject(b.clone()))).toBe(false);
    }
  }
  expect(body.root.userData.magazines).toBe((bodyMagazineSlots(rig) - 2) * 2 + 2);
  body.dispose();
});
describe('first person worn equipment', () => {
  it('keeps rig capacity separate from protection and adds real carrying positions', () => {
    expect(['rig-ilbv', 'rig-lbs', 'rig-sentinel'].map(bodyMagazineSlots)).toEqual([6, 8, 9]);
    for (const rig of ['rig-ilbv', 'rig-lbs', 'rig-sentinel']) {
      const kit = resolveLoadout({ ...createProfile(), rig });
      const states = createPooledLoadout(kit.weapons, kit.carriedFamilies);
      expect(bodyMagazines(kit, states)).toHaveLength(bodyMagazineSlots(rig));
      expect(bodyMagazines(kit, states).filter(f => f === 2)).toHaveLength(2);
    }
  });
  it('empties the upper row before the lower one without moving surviving magazines', () => {
    const kit = resolveLoadout(createProfile()), states = createPooledLoadout(kit.weapons, kit.carriedFamilies);
    const body = createFpsBody(new THREE.Scene()); body.update(0, kit, states, pose);
    const upper = body.root.getObjectByName('magazine-slot-0')!, lower = body.root.getObjectByName('magazine-slot-3')!;
    expect(upper.position.y).toBeGreaterThan(lower.position.y);
    const lowerPosition = body.magazinePosition(3)!.clone();
    for (let reload = 0; reload < 3; reload++) {
      states[0].magazine = 2; beginReload(states[0], 0, kit.weapons); advanceWeapon(states[0], 0, 10, kit.weapons);
      body.update(0, kit, states, pose);
      expect(bodyMagazines(kit, states)[reload]).toBeUndefined();
      expect(bodyMagazines(kit, states)[3]).toBe(0);
    }
    expect(body.magazinePosition(3)!.distanceTo(lowerPosition)).toBeCloseTo(0);
    expect(upper.userData.container).toBeNull(); expect(lower.userData.container).toBe('magazine');
    expect(body.root.userData.magazines).toBe(3); body.dispose();
  });
  it('keeps container shapes and magazine identities when switching guns', () => {
    const scene = new THREE.Scene(), body = createFpsBody(scene), kit = resolveLoadout(createProfile());
    kit.carriedFamilies = [0, 2, 1];
    const states = createPooledLoadout(kit.weapons, kit.carriedFamilies);
    body.update(0, kit, states, pose);
    const layout = bodyMagazines(kit, states), drum = body.root.getObjectByName('magazine-slot-1')!.getObjectByName('reserve-drum')!;
    expect(drum.visible).toBe(true);
    expect(body.root.getObjectByName('magazine-slot-4')!.userData.container).toBe('pistol-magazine');
    body.update(.016, kit, states, { ...pose, activeFamily: 1 });
    expect(bodyMagazines(kit, states, 1)).toEqual(layout); expect(drum.visible).toBe(true);
    const disposed = vi.spyOn((drum.getObjectByName('drum-body') as THREE.Mesh).geometry, 'dispose');
    body.dispose(); expect(disposed).toHaveBeenCalledOnce(); expect(scene.children).toHaveLength(0);
  });
  it('models belt boxes and rebuilds worn equipment, preserving finite stance transforms', () => {
    const scene = new THREE.Scene(), body = createFpsBody(scene);
    let kit = resolveLoadout(createProfile()); kit.carriedFamilies = [3, 2];
    let states = createPooledLoadout(kit.weapons, kit.carriedFamilies); body.update(0, kit, states, pose);
    const ammoBox = body.root.getObjectByName('reserve-ammo-box')!;
    expect(ammoBox.getObjectByName('carry-handle')).toBeDefined(); expect(ammoBox.getObjectByName('lid-latch')).toBeDefined();
    const old = body.root.getObjectByName('rig-ilbv') as THREE.Mesh, disposed = vi.spyOn(old.geometry, 'dispose');
    kit = resolveLoadout({ ...createProfile(), rig: 'rig-sentinel', plate: 'plate-pillbox' }); kit.armor = 0;
    states = createPooledLoadout(kit.weapons, kit.carriedFamilies);
    body.update(.016, kit, states, { ...pose, crouch: 1 });
    expect(disposed).toHaveBeenCalledOnce(); expect(body.root.getObjectByName('plate-pillbox')).toBeDefined(); expect(body.root.userData.magazineSlots).toBe(9);
    for (let frame = 0; frame < 120; frame++) body.update(1 / 60, kit, states, { ...pose, prone: true });
    body.root.updateMatrixWorld(true); body.root.traverse(node => expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    body.update(0, kit, states, { ...pose, visible: false }); expect(body.root.visible).toBe(false); body.dispose();
  });
});

it('renders two distinct sniper magazines in one pouch and collapses it only after the rear is drawn', () => {
  const kit = resolveLoadout(createProfile()); kit.carriedFamilies = [12, 2];
  const states = createPooledLoadout(kit.weapons, kit.carriedFamilies), state = states[12], body = createFpsBody(new THREE.Scene());
  body.update(0, kit, states, { ...pose, activeFamily: 12 });
  const pouch = body.root.getObjectByName('magazine-slot-0')!;
  const front = body.magazineSource(0, state.reserveMagazine!)!.model, rear = body.magazineSource(9, state.reserveMagazine!)!.model;
  expect(front).not.toBe(rear); expect(front.visible && rear.visible).toBe(true);
  const frontBounds = new THREE.Box3().setFromObject(front), rearBounds = new THREE.Box3().setFromObject(rear);
  expect(frontBounds.intersectsBox(rearBounds)).toBe(false);
  const rearPosition = rear.getWorldPosition(new THREE.Vector3());
  expect(pouch.userData.magazineCount).toBe(2); expect(body.root.userData.magazines).toBe(10);
  state.magazine = 2; beginReload(state, 12, kit.weapons); advanceWeapon(state, 12, 10, kit.weapons);
  body.update(1, kit, states, { ...pose, activeFamily: 12 });
  expect(front.visible).toBe(false); expect(rear.visible).toBe(true); expect(pouch.userData.fullness).toBe(1);
  expect(rear.getWorldPosition(new THREE.Vector3()).distanceTo(rearPosition)).toBeCloseTo(0);
  state.magazine = 2; beginReload(state, 12, kit.weapons); expect(state.reloadSlot).toBe(9); advanceWeapon(state, 12, 10, kit.weapons);
  body.update(1, kit, states, { ...pose, activeFamily: 12 });
  expect(rear.visible).toBe(false); expect(pouch.userData.fullness).toBe(0); expect(pouch.userData.magazineCount).toBe(0);
  body.dispose();
});
