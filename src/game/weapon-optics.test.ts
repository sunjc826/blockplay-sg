import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createScopeRenderer, fitWeaponOptic, getWeaponSight, scopeFov } from './weapon-optics';
import { FPS_WEAPONS, HIP_FOV, magnifiedFov, opticMagnification } from './fps-rules';
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

it.each([1.5, 1.75])('keeps SAR %s× glass visible at hip and layers it over PiP without leaking resources', magnification => {
  const root = new THREE.Group(), native = new THREE.Group(); native.name = 'sar21-inspired__optic'; root.add(native);
  const remove = fitWeaponOptic(root, { ...FPS_WEAPONS[0], optic: magnification > 1.5 ? 'precision' : 'integrated', aimFov: magnifiedFov(magnification) });
  const sight = getWeaponSight(root)!, coating = sight.reflection!.surface;
  const renderer = { getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn() };
  const scope = createScopeRenderer(renderer as unknown as THREE.WebGLRenderer);
  const camera = new THREE.PerspectiveCamera(65, 1, .01, 800), world = new THREE.Scene();
  root.position.set(0, -sight.aimHeight, sight.aimDepth); root.updateMatrixWorld(true);
  expect(scope.render(world, camera, camera, sight, true, 0)).toBe(false);
  expect(coating.visible).toBe(true); expect(sight.lens.visible).toBe(false);
  expect(scope.render(world, camera, camera, sight, true, 1)).toBe(true);
  expect(sight.magnification).toBeCloseTo(magnification);
  expect(coating.renderOrder).toBeGreaterThan(sight.lens.renderOrder);
  const disposeGeometry = vi.spyOn(coating.geometry, 'dispose');
  const disposeMaterial = vi.spyOn(coating.material as THREE.Material, 'dispose');
  remove(); scope.dispose();
  expect(disposeGeometry).toHaveBeenCalledOnce(); expect(disposeMaterial).toHaveBeenCalledOnce();
  expect(native.visible).toBe(true); expect(root.children).toEqual([native]);
});

it('exports the SAR scope as a detachable mesh in both shipped assets', () => {
  for (const path of ['public/models/field-kit/sar21-inspired.glb', 'asset-pack/public/models/sar21-inspired.glb']) {
    const glb = readFileSync(path), length = glb.readUInt32LE(12);
    const model = JSON.parse(glb.subarray(20, 20 + length).toString());
    expect(model.nodes.some((n: { name: string; mesh?: number }) => n.name === 'sar21-inspired__optic' && n.mesh !== undefined)).toBe(true);
  }
});

it('seats the Ultimax optic on the shipped receiver and clears the aiming line', async () => {
  const bytes = readFileSync('public/models/field-kit/ultimax-inspired.glb');
  // Keep the shipped geometry; texture decoding needs a browser and does not
  // affect receiver contact or line-of-sight intersections.
  const loader = new GLTFLoader().register(() => ({ name: 'geometry-only', loadMaterial: async () => new THREE.MeshBasicMaterial() }));
  const { scene: root } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const remove = fitWeaponOptic(root, FPS_WEAPONS[1]);
  root.updateMatrixWorld(true);
  const rail = root.getObjectByName('optic-receiver-rail')!;
  const railBounds = new THREE.Box3().setFromObject(rail);
  const origin = new THREE.Vector3(0, railBounds.max.y + .01, rail.position.z);
  const body = root.getObjectByName('ultimax-inspired__body')!;
  const contact = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObject(body, true);
  expect(contact.length).toBeGreaterThan(0);
  expect(Math.abs(contact[0].point.y - railBounds.min.y)).toBeLessThan(.001);
  const sight = getWeaponSight(root)!;
  // Check the entire central sight window, not just a dot balanced on the handle.
  for (const offset of [-.012, 0, .012]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(0, sight.aimHeight + offset, .5), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(body, true)).toHaveLength(0);
  }
  const glass = root.getObjectByName('optic-coated-glass') as THREE.Mesh;
  expect(glass.visible).toBe(true); expect(sight.lens.visible).toBe(true);
  expect(glass.position.z).toBeLessThan(rail.position.z + .04);
  const mountBounds = new THREE.Box3().setFromObject(root.getObjectByName('optic-mount')!);
  expect(mountBounds.min.y).toBeLessThanOrEqual(railBounds.max.y + .002);
  expect(mountBounds.max.y).toBeGreaterThan(sight.aimHeight - .05);
  const dispose = vi.spyOn(glass.material as THREE.Material, 'dispose');
  const bloom = root.getObjectByName('fps-reflex-bloom') as THREE.Mesh;
  const disposeBloom = vi.spyOn(bloom.material as THREE.Material, 'dispose');
  const disposeLensGeometry = vi.spyOn(sight.lens.geometry, 'dispose');
  remove(); expect(dispose).toHaveBeenCalledOnce(); expect(root.getObjectByName('optic-coated-glass')).toBeUndefined();
  expect(disposeBloom).toHaveBeenCalledOnce(); expect(disposeLensGeometry).toHaveBeenCalledOnce();
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
  expect(sight.lens.visible).toBe(true); expect(renderer.render).toHaveBeenCalledOnce();
  // The reflex dot stays powered at hip and throughout ADS. Its actual
  // visibility is determined in the shader by the eye ray and physical aperture.
  scope.render(world, camera, camera, sight, true, .5);
  expect(sight.visibility.value).toBe(1);
  scope.render(world, camera, camera, sight, true, 0);
  expect(sight.lens.visible).toBe(true);
  expect(sight.visibility.value).toBe(1);
  scope.render(world, camera, camera, sight, false, 0);
  expect(sight.lens.visible).toBe(false);
  remove(); scope.dispose();
});
