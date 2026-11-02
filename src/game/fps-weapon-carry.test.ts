import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FPS_WEAPONS } from './fps-rules';
import { createProfile, resolveLoadout } from './armory-state';
import { createPooledLoadout } from './ammo-pools';
import { createFpsBody } from './fps-body';
import { buildServiceWeapon } from './service-weapon-models';
import { beginWeaponSwitch, carryViewPose, weaponCarryClass, weaponCarryPose, weaponSwitchFrame } from './fps-weapon-carry';

const pose = { x: 2, y: 0, z: 3, yaw: .7, visible: true, activeFamily: 0 };
describe('body carried weapons and physical switching', () => {
  it('distinguishes hip, rifle, support and precision carry across all platforms', () => {
    expect(FPS_WEAPONS.map(weaponCarryClass)).toEqual(['rifle-sling', 'support-sling', 'holster', 'support-sling', 'support-sling', 'rifle-sling', 'rifle-sling', 'support-sling', 'rifle-sling', 'rifle-sling', 'back-sling', 'rifle-sling', 'back-sling', 'rifle-sling']);
    expect(weaponCarryClass({ ...FPS_WEAPONS[1], feed: 'magazine', bipod: 'none' })).toBe('support-sling');
    expect(weaponCarryPose(FPS_WEAPONS[0], 0).position).not.toEqual(weaponCarryPose(FPS_WEAPONS[0], 1).position);
  });
  it('stows before drawing, transfers one held weapon, and completes at ready', () => {
    const state = beginWeaponSwitch(0, 2, FPS_WEAPONS)!;
    expect(weaponSwitchFrame(state)).toMatchObject({ family: 0, phase: 'stow', bodyWeight: 0, done: false });
    state.elapsed = state.stow - .000001;
    expect(weaponSwitchFrame(state)).toMatchObject({ family: 0, phase: 'stow' });
    expect(weaponSwitchFrame(state).bodyWeight).toBeCloseTo(1);
    state.elapsed = state.stow;
    expect(weaponSwitchFrame(state)).toMatchObject({ family: 2, phase: 'draw', bodyWeight: 1 });
    state.elapsed += state.draw;
    expect(weaponSwitchFrame(state)).toMatchObject({ family: 2, bodyWeight: 0, done: true });
    expect(beginWeaponSwitch(11, 13, FPS_WEAPONS)).toBeNull();
    expect(beginWeaponSwitch(2, 4, FPS_WEAPONS)!.draw).toBeGreaterThan(state.draw);
  });
  it('keeps the body and foreground projection in contact when looking down', () => {
    const camera = new THREE.PerspectiveCamera(65, 1.5, .02, 100);
    camera.position.set(2, 1.75, 3); camera.rotation.set(-1, .7, 0); camera.updateMatrixWorld(true);
    const view = new THREE.PerspectiveCamera(54, 1.5, .02, 100);
    const anchor = new THREE.Object3D(); anchor.position.set(2.2, .8, 2.9); anchor.updateMatrixWorld(true);
    const projected = carryViewPose(anchor, camera, view);
    const worldPixel = anchor.getWorldPosition(new THREE.Vector3()).project(camera);
    const foregroundPixel = projected.position.clone().project(view);
    expect(foregroundPixel.x).toBeCloseTo(worldPixel.x); expect(foregroundPixel.y).toBeCloseTo(worldPixel.y);
  });
  it('shows only carried inactive guns, retains hardware, follows stance, and owns snapshot resources', () => {
    const kit = resolveLoadout(createProfile()); kit.carriedFamilies = [5, 2, 12];
    const states = createPooledLoadout(kit.weapons, kit.carriedFamilies);
    const models = FPS_WEAPONS.map(spec => buildServiceWeapon(spec.id) ?? new THREE.Group());
    const body = createFpsBody(new THREE.Scene()); body.setWeaponModels(models);
    body.update(0, kit, states, { ...pose, activeFamily: 5 });
    expect(body.weaponMount(0)).toBeUndefined();
    expect(body.weaponMount(2)!.children[0].visible).toBe(true);
    expect(body.weaponMount(5)!.children[0].visible).toBe(false);
    expect(body.weaponMount(12)!.children[0].visible).toBe(true);
    expect(body.weaponMount(2)!.getObjectByName('holster-shell')).toBeDefined();
    const source = models[2].getObjectByName('p30-inspired__slide') as THREE.Mesh;
    const copy = body.weaponMount(2)!.getObjectByName('p30-inspired__slide') as THREE.Mesh;
    expect(copy.geometry).not.toBe(source.geometry); expect(copy.material).not.toBe(source.material);
    const originalDispose = vi.spyOn(source.geometry, 'dispose'), copyDispose = vi.spyOn(copy.geometry, 'dispose');
    const standing = body.weaponMount(2)!.getWorldPosition(new THREE.Vector3());
    for (let frame = 0; frame < 60; frame++) body.update(1 / 60, kit, states, { ...pose, activeFamily: 2, crouch: 1 });
    expect(body.weaponMount(2)!.children[0].visible).toBe(false);
    expect(body.weaponMount(5)!.children[0].visible).toBe(true);
    expect(body.weaponMount(2)!.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(standing.y);
    body.dispose(); expect(copyDispose).toHaveBeenCalledOnce(); expect(originalDispose).not.toHaveBeenCalled();
  });
  it('does not carry a duplicate OICW launcher and rebuilds on a loadout change', () => {
    const kit = resolveLoadout(createProfile()); kit.carriedFamilies = [11, 2, 13];
    const states = createPooledLoadout(kit.weapons, kit.carriedFamilies);
    const models = FPS_WEAPONS.map(spec => buildServiceWeapon(spec.id) ?? new THREE.Group());
    const body = createFpsBody(new THREE.Scene()); body.setWeaponModels(models); body.update(0, kit, states, { ...pose, activeFamily: 13 });
    expect(body.weaponMount(11)).toBe(body.weaponMount(13));
    expect(body.weaponMount(11)!.children[0].visible).toBe(false);
    const old = body.weaponMount(2)!;
    kit.carriedFamilies = [2, 12]; body.update(0, kit, states, { ...pose, activeFamily: 2 });
    expect(old.parent).toBeNull(); expect(body.weaponMount(11)).toBeUndefined(); expect(body.weaponMount(12)).toBeDefined();
    body.dispose();
  });
});
