import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createScopeRenderer, fitWeaponOptic, getWeaponSight, scopeFov } from './weapon-optics';
import { FPS_WEAPONS, HIP_FOV, opticMagnification } from './fps-rules';
import { createProfile, equip, purchase, resolveLoadout, restoreProfile } from './armory-state';

describe('fixed weapon optics', () => {
  it('changes optics by purchasing and equipping a complete variant', () => {
    const base = { ...createProfile(), xp: 5000, tokens: 1000 };
    expect(opticMagnification(resolveLoadout(base).weapons[0])).toBeCloseTo(1.5);
    const bought = purchase(base, 'sar-marksman').profile;
    expect(bought.tokens).toBe(680);
    const profile = restoreProfile(JSON.stringify(equip(bought, 'sar-marksman', 0)));
    const match = resolveLoadout(profile).weapons[0];
    expect(match.optic).toBe('precision'); expect(match.aimFov).toBe(40);
    expect(resolveLoadout(profile).weapons[1].optic).toBe('reflex');
    const issued = resolveLoadout(equip(profile, 'sar-issued', 0)).weapons[0];
    expect(issued.optic).toBe('integrated'); expect(opticMagnification(issued)).toBeCloseTo(1.5);
  });
  it('replaces the entire scope housing and restores it without accumulating geometry', () => {
    const root = new THREE.Group(), native = new THREE.Group(); native.name = 'sar21-inspired__optic'; root.add(native);
    const removeIssued = fitWeaponOptic(root, FPS_WEAPONS[0]);
    expect(native.visible).toBe(true); expect(root.getObjectByName('fps-reflex-optic')).toBeUndefined();
    expect(getWeaponSight(root)?.aimHeight).toBe(.328); removeIssued();
    const removeReflex = fitWeaponOptic(root, { ...FPS_WEAPONS[0], optic: 'reflex', aimFov: HIP_FOV });
    expect(native.visible).toBe(false); expect(root.getObjectByName('fps-reflex-optic')).toBeDefined();
    expect(getWeaponSight(root)?.magnification).toBeCloseTo(1); removeReflex();
    expect(native.visible).toBe(true); expect(root.children).toEqual([native]); expect(getWeaponSight(root)).toBeUndefined();
  });
  it('crops the PiP camera to the lens and magnifies 1.5× regardless of lens size', () => {
    for (const fraction of [.12, .28, .5]) {
      const fov = scopeFov(HIP_FOV, fraction, 1.5);
      const measuredZoom = fraction * Math.tan(HIP_FOV * Math.PI / 360) / Math.tan(fov * Math.PI / 360);
      expect(measuredZoom).toBeCloseTo(1.5);
    }
  });
});

it('exports the SAR scope as a detachable mesh in both shipped assets', () => {
  for (const path of ['public/models/field-kit/sar21-inspired.glb', 'asset-pack/public/models/sar21-inspired.glb']) {
    const glb = readFileSync(path), length = glb.readUInt32LE(12);
    const model = JSON.parse(glb.subarray(20, 20 + length).toString());
    expect(model.nodes.some((n: { name: string; mesh?: number }) => n.name === 'sar21-inspired__optic' && n.mesh !== undefined)).toBe(true);
  }
});

it('renders PiP only for active magnified sights and restores the render target', () => {
  const renderer = { getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn() };
  const scope = createScopeRenderer(renderer as unknown as THREE.WebGLRenderer);
  const root = new THREE.Group(), remove = fitWeaponOptic(root, FPS_WEAPONS[0]), sight = getWeaponSight(root)!;
  root.position.set(0, -.328, -.36); root.updateMatrixWorld(true);
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(HIP_FOV, 1, .08, 800);
  expect(scope.render(world, camera, camera, sight, false)).toBe(false);
  expect(renderer.render).not.toHaveBeenCalled();
  expect(scope.render(world, camera, camera, sight, true)).toBe(true);
  expect(renderer.render).toHaveBeenCalledOnce();
  expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(null);
  sight.magnification = 1;
  expect(scope.render(world, camera, camera, sight, true)).toBe(false);
  expect(sight.lens.visible).toBe(false); expect(renderer.render).toHaveBeenCalledOnce();
  remove(); scope.dispose();
});
