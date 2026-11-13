import { SCOPE_CLEAR_CENTRE, SCOPE_TUBE, scopeEyeBox, scopeSwayTilt } from './scope-shadow';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createScopeRenderer, fitWeaponOptic, getWeaponSight, scopeFov, scopeScreenScale, setSightNightVision } from './weapon-optics';
import { ADS_VIEW_FOV, ADS_WORLD_FOV, FPS_WEAPONS, HIP_FOV, aimWorldFov, magnifiedFov, opticMagnification } from './fps-rules';
import { createProfile, equip, purchase, resolveLoadout, restoreProfile } from './armory-state';
import { itemById } from './armory-catalog';
import { buildProxyWeapon } from './proxy-weapon-models';
import { MINI_REFLEX_WINDOW, windowRadius, type SightWindow } from './weapon-sight-housings';

describe('fixed weapon optics', () => {
  it('changes optics by purchasing and equipping a complete variant', () => {
    const base = { ...createProfile(), xp: 5000, tokens: 1000 };
    expect(opticMagnification(resolveLoadout(base).weapons[0])).toBeCloseTo(1.5);
    const bought = purchase(base, 'sar-marksman').profile;
    expect(bought.tokens).toBe(968);
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

describe('world field of view while aiming', () => {
  it('pushes in from the hip view to a small zoom and no further', () => {
    expect(aimWorldFov(0)).toBe(HIP_FOV);
    expect(aimWorldFov(1)).toBe(ADS_WORLD_FOV);
    expect(aimWorldFov(.5)).toBeCloseTo((HIP_FOV + ADS_WORLD_FOV) / 2);
    expect(opticMagnification({ ...FPS_WEAPONS[0], aimFov: ADS_WORLD_FOV })).toBeLessThan(1.15);
  });

  it('keeps a scope at its true power whatever the world camera is doing', () => {
    const root = new THREE.Group(), native = new THREE.Group(); native.name = 'sar21-inspired__optic'; root.add(native);
    const remove = fitWeaponOptic(root, FPS_WEAPONS[0]);
    const sight = getWeaponSight(root)!;
    const renderer = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(1600, 900), getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn() };
    const scope = createScopeRenderer(renderer as unknown as THREE.WebGLRenderer);
    const view = new THREE.PerspectiveCamera(ADS_VIEW_FOV, 1, .01, 800), world = new THREE.Scene();
    root.position.set(0, -sight.aimHeight, sight.aimDepth); root.updateMatrixWorld(true);
    const pipFov = (worldFov: number) => {
      const camera = new THREE.PerspectiveCamera(worldFov, 1, .01, 800);
      expect(scope.render(world, camera, view, sight, true, 1)).toBe(true);
      return (renderer.render.mock.lastCall![1] as THREE.PerspectiveCamera).fov;
    };
    const hip = pipFov(HIP_FOV);
    expect(pipFov(ADS_WORLD_FOV)).toBeCloseTo(hip);
    expect(pipFov(HIP_FOV + 6)).toBeCloseTo(hip);
    remove(); scope.dispose();
  });

  it('maps a world screen point onto the lens by what the scope adds beyond the push-in', () => {
    expect(scopeScreenScale(HIP_FOV, 4)).toBeCloseTo(4);
    const pushIn = Math.tan(HIP_FOV * Math.PI / 360) / Math.tan(ADS_WORLD_FOV * Math.PI / 360);
    expect(scopeScreenScale(ADS_WORLD_FOV, 4)).toBeCloseTo(4 / pushIn);
  });
});

it('moves the scope shadow with the eye without steering the PiP camera or moving the reticle plane', () => {
  const root = new THREE.Group(), remove = fitWeaponOptic(root, FPS_WEAPONS[0]), sight = getWeaponSight(root)!;
  const renderer = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(1600, 900), getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn() };
  const scope = createScopeRenderer(renderer as unknown as THREE.WebGLRenderer);
  const view = new THREE.PerspectiveCamera(ADS_VIEW_FOV, 1, .01, 3), camera = new THREE.PerspectiveCamera(HIP_FOV, 1, .08, 800), world = new THREE.Scene();
  camera.position.set(4, 1.6, -7); camera.rotation.set(.1, .3, 0);
  root.position.set(0, -sight.aimHeight, sight.aimDepth);
  const plane = sight.lens.position.clone();
  const render = () => scope.render(world, camera, view, sight, true);
  render();
  const fov = scope.camera.fov;
  expect(sight.scopeEye!.value.length()).toBeCloseTo(0);
  root.position.x = .006; render();
  const right = sight.scopeEye!.value.x;
  expect(right).toBeGreaterThan(0);
  expect(scope.camera.fov).toBeCloseTo(fov);
  root.position.x = -.006; render();
  expect(sight.scopeEye!.value.x).toBeCloseTo(-right);
  root.position.x = 0; root.rotation.y = .025; render();
  expect(Math.abs(sight.scopeEye!.value.x)).toBeGreaterThan(.001);
  root.rotation.y = 0; root.position.x = 10; render();
  const box = scopeEyeBox(sight.magnification);
  expect(sight.scopeEye!.value.length()).toBeCloseTo(box.radius - box.soft - SCOPE_CLEAR_CENTRE);
  expect(sight.scopeBox!.value.toArray()).toEqual([box.radius, box.soft]);
  expect(scope.camera.position.equals(camera.position)).toBe(true);
  expect(scope.camera.quaternion.equals(camera.quaternion)).toBe(true);
  expect(sight.lens.position.equals(plane)).toBe(true);
  // A common transform of eye and optic cannot change their alignment.
  root.position.x = .006;
  const parent = new THREE.Group(); parent.add(root, view);
  parent.position.set(7, -3, 2); parent.rotation.set(.2, .5, -.3); parent.scale.setScalar(2);
  render(); expect(sight.scopeEye!.value.x).toBeCloseTo(right); expect(sight.scopeEye!.value.y).toBeCloseTo(0);
  remove(); scope.dispose();
});

it('adds an open, recessed scope barrel and disposes it with the optic', () => {
  const root = new THREE.Group(), remove = fitWeaponOptic(root, FPS_WEAPONS[0]), sight = getWeaponSight(root)!;
  const barrel = root.getObjectByName('scope-inner-barrel') as THREE.Mesh;
  root.updateMatrixWorld(true);
  const eye = new THREE.Vector3(0, sight.aimHeight, .5);
  for (const x of [-.4, 0, .4]) for (const y of [-.4, 0, .4]) {
    const target = sight.lens.localToWorld(new THREE.Vector3(x * sight.radius, y * sight.radius, 0));
    expect(new THREE.Raycaster(eye, target.sub(eye).normalize()).intersectObject(barrel)).toHaveLength(0);
  }
  const box = new THREE.Box3().setFromObject(barrel);
  expect(box.min.z).toBeGreaterThan(sight.lens.position.z);
  expect(box.max.z - sight.lens.position.z).toBeCloseTo(sight.radius * .4);
  const geometry = vi.spyOn(barrel.geometry, 'dispose'), material = vi.spyOn(barrel.material as THREE.Material, 'dispose');
  remove(); expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce();
  const removeDot = fitWeaponOptic(root, FPS_WEAPONS[1]);
  expect(root.getObjectByName('scope-inner-barrel')).toBeUndefined();
  expect(getWeaponSight(root)!.scopeEye).toBeUndefined(); removeDot();
});

it('reads the shadow off the gun alone: a tilt about the eyepiece throws it as far as the engine asked, and relief tunnels it', () => {
  const root = new THREE.Group(), remove = fitWeaponOptic(root, FPS_WEAPONS[0]), sight = getWeaponSight(root)!;
  const renderer = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(1600, 900), getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn() };
  const scope = createScopeRenderer(renderer as unknown as THREE.WebGLRenderer);
  const view = new THREE.PerspectiveCamera(ADS_VIEW_FOV, 1, .01, 3), camera = new THREE.PerspectiveCamera(HIP_FOV, 1, .08, 800), world = new THREE.Scene();
  const rest = new THREE.Vector3(0, -sight.aimHeight, sight.aimDepth);
  root.position.copy(rest); root.updateMatrixWorld(true);
  const plane = sight.lens.position.clone(), pivot = sight.lens.getWorldPosition(new THREE.Vector3());
  scope.render(world, camera, view, sight, true);
  const projection = scope.camera.projectionMatrix.clone();
  expect(sight.scopeEye!.value.length()).toBeCloseTo(0);
  // Moving or turning the world camera is not misalignment.
  camera.position.set(3, 9, -4); camera.rotation.set(.2, -.6, 0); camera.updateMatrixWorld();
  scope.render(world, camera, view, sight, true);
  expect(sight.scopeEye!.value.length()).toBeCloseTo(0);
  // The engine's tilt for a wanted shadow, applied the way the engine applies it.
  for (const wanted of [{ x: .1, y: 0 }, { x: -.08, y: 0 }, { x: 0, y: .09 }, { x: .05, y: -.07 }]) {
    const tilt = scopeSwayTilt(wanted), turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt.pitch, tilt.yaw, 0));
    root.position.copy(rest).sub(pivot).applyQuaternion(turn).add(pivot); root.quaternion.copy(turn); root.updateMatrixWorld(true);
    scope.render(world, camera, view, sight, true);
    // The tube supplies what was asked; the eye's small slide across the eyepiece adds a little the same way.
    for (const axis of ['x', 'y'] as const) {
      const got = sight.scopeEye!.value[axis], want = wanted[axis];
      if (want === 0) expect(got).toBeCloseTo(0, 3);
      else { expect(got / want).toBeGreaterThan(1); expect(got / want).toBeLessThan(1.3); }
    }
    // The lens has not left the aim point, and the picture has not moved.
    expect(sight.lens.getWorldPosition(new THREE.Vector3()).distanceTo(pivot)).toBeLessThan(1e-9);
    scope.camera.projectionMatrix.elements.forEach((value, i) => expect(value).toBeCloseTo(projection.elements[i], 6));
    expect(scope.camera.quaternion.equals(camera.quaternion)).toBe(true);
    expect(sight.lens.position.equals(plane)).toBe(true);
  }
  expect(scopeSwayTilt({ x: .1, y: .1 }, 0)).toEqual({ yaw: 0, pitch: -0 });
  expect(scopeSwayTilt({ x: SCOPE_TUBE, y: 0 }).yaw).toBe(1);
  root.position.copy(rest); root.quaternion.identity(); root.updateMatrixWorld(true);
  scope.render(world, camera, view, sight, true);
  expect(sight.scopeBox!.value.x).toBeCloseTo(.51);
  scope.render(world, camera, view, sight, true, 1, { relief: 1 });
  expect(sight.scopeBox!.value.x).toBeCloseTo(.42); expect(sight.scopeEye!.value.length()).toBeCloseTo(0);
  scope.render(world, camera, view, sight, true, 1, { relief: .5 });
  expect(sight.scopeBox!.value.x).toBeCloseTo(.465);
  scope.render(world, camera, view, sight, true, 1, {});
  expect(sight.scopeBox!.value.x).toBeCloseTo(.51);
  remove(); scope.dispose();
});

it.each([1.5, 1.75])('keeps SAR %s× glass visible at hip and layers it over PiP without leaking resources', magnification => {
  const root = new THREE.Group(), native = new THREE.Group(); native.name = 'sar21-inspired__optic'; root.add(native);
  const remove = fitWeaponOptic(root, { ...FPS_WEAPONS[0], optic: magnification > 1.5 ? 'precision' : 'integrated', aimFov: magnifiedFov(magnification) });
  const sight = getWeaponSight(root)!, coating = sight.reflection!.surface;
  const renderer = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(1600, 900), getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn() };
  const scope = createScopeRenderer(renderer as unknown as THREE.WebGLRenderer);
  const camera = new THREE.PerspectiveCamera(65, 1, .01, 800), world = new THREE.Scene();
  root.position.set(0, -sight.aimHeight, sight.aimDepth); root.updateMatrixWorld(true);
  expect(scope.render(world, camera, camera, sight, true, 0)).toBe(false);
  expect(sight.reflection!.uniforms.aiming.value).toBe(0);
  expect(coating.visible).toBe(true); expect(sight.lens.visible).toBe(false);
  scope.render(world, camera, camera, sight, true, .52);
  expect(sight.reflection!.uniforms.aiming.value).toBeCloseTo(.5);
  expect(scope.render(world, camera, camera, sight, true, 1)).toBe(true);
  expect(sight.reflection!.uniforms.aiming.value).toBe(1);
  expect(sight.magnification).toBeCloseTo(magnification);
  expect(coating.renderOrder).toBeGreaterThan(sight.lens.renderOrder);
  scope.render(world, camera, camera, sight, true, 0);
  expect(sight.reflection!.uniforms.aiming.value).toBe(0);
  const disposeGeometry = vi.spyOn(coating.geometry, 'dispose');
  const disposeMaterial = vi.spyOn(coating.material as THREE.Material, 'dispose');
  remove(); scope.dispose();
  expect(disposeGeometry).toHaveBeenCalledOnce(); expect(disposeMaterial).toHaveBeenCalledOnce();
  expect(native.visible).toBe(true); expect(root.children).toEqual([native]);
});

it('etches each magnified sight with its own reticle and leaves red dots alone', () => {
  const g36 = FPS_WEAPONS.find(w => w.id === 'g36-inspired')!;
  const reticleOf = (weapon: typeof g36, config?: string) => {
    const root = new THREE.Group(); root.userData.enemyConfig = config;
    const remove = fitWeaponOptic(root, weapon), reticle = getWeaponSight(root)?.reticle;
    remove(); return reticle;
  };
  expect(reticleOf(FPS_WEAPONS[0])).toBe('sar21-ring');
  expect(reticleOf({ ...FPS_WEAPONS[0], optic: 'precision', aimFov: 40 })).toBe('match-duplex');
  expect(reticleOf({ ...FPS_WEAPONS[0], optic: 'reflex', aimFov: HIP_FOV })).toBeUndefined();
  for (const config of ['rifle', 'k', 'mg']) expect(reticleOf(g36, config)).toBe('g36-zf');
  const xm8 = FPS_WEAPONS.find(w => w.id === 'xm8-inspired')!;
  expect(reticleOf({ ...xm8, optic: 'integrated', aimFov: magnifiedFov(3.5) }, 'sharpshooter')).toBe('mil-dot');
  expect(reticleOf(xm8, 'carbine')).toBeUndefined();
  expect(reticleOf(g36, 'c')).toBeUndefined();
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
  const renderer = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(1600, 900), getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn() };
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

it('brings the Ultimax dot in with the window rather than popping it in at full alignment', () => {
  const root = new THREE.Group(), remove = fitWeaponOptic(root, { ...FPS_WEAPONS[1], optic: 'reflex', aimFov: HIP_FOV });
  const sight = getWeaponSight(root)!;
  const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} as Record<string, { value: unknown }> };
  sight.lens.material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  expect(shader.uniforms.sightRadius.value).toBeCloseTo(sight.radius);
  // Off-axis the dot is held inside the glass and faded in; aligned, it is collimated.
  expect(shader.vertexShader).toContain('sightWindow = sightRadius');
  expect(shader.fragmentShader).toContain('vec2(0.0)');
  expect(shader.fragmentShader).toContain('core * aperture * sightVisibility * rise');
  expect(shader.fragmentShader).toContain('(halo + bloom + flare) * aperture * sightVisibility * rise');
  remove();
});


it('shares live NV illumination between a reflex core and its bloom, restoring normal light without recompiling', () => {
  const root = new THREE.Group();
  const remove = fitWeaponOptic(root, { ...FPS_WEAPONS[1], optic: 'reflex', aimFov: HIP_FOV });
  const sight = getWeaponSight(root)!;
  const bloom = root.getObjectByName('fps-reflex-bloom') as THREE.Mesh;
  const shaderFor = (material: THREE.Material) => {
    const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} as Record<string, { value: unknown }> };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return shader;
  };
  const core = shaderFor(sight.lens.material), scatter = shaderFor(bloom.material as THREE.Material);
  expect(core.uniforms.sightNightVision).toBe(scatter.uniforms.sightNightVision);
  expect(core.uniforms.sightNightVision).toBe(sight.nightVision);
  const version = sight.lens.material.version;
  setSightNightVision(sight, true);
  expect(core.uniforms.sightNightVision.value).toBe(1);
  expect(scatter.uniforms.sightNightVision.value).toBe(1);
  setSightNightVision(sight, false);
  expect(core.uniforms.sightNightVision.value).toBe(0);
  expect(sight.lens.material.version).toBe(version);
  remove();
});

it('applies NV illumination to a canted dot without lighting the magnified etching', () => {
  const root = new THREE.Group();
  const remove = fitWeaponOptic(root, { ...FPS_WEAPONS[0], accessories: { sight: 'prism', offsetDot: true } });
  const sight = getWeaponSight(root)!;
  expect(sight.magnification).toBeGreaterThan(1);
  expect(sight.offset).toBeDefined();
  setSightNightVision(sight, true);
  expect(sight.nightVision.value).toBe(0);
  expect(sight.offset!.nightVision.value).toBe(1);
  setSightNightVision(sight, false);
  expect(sight.offset!.nightVision.value).toBe(0);
  remove();
});

describe('open-frame red dots', () => {
  const fitted = (id: string) => {
    const item = itemById(id)!, base = createProfile();
    return resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, item.family!)).weapons[item.family!];
  };
  const bounds = (object: THREE.Object3D) => {
    object.updateWorldMatrix(true, false);
    return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  };

  it.each(['ff-scar-l', 'cc-gatekeeper'] as const)('fills the whole of the %s window with glass, in a frame with rounded corners', id => {
    const model = buildProxyWeapon(id, true), optic = model.root.userData.proxyOptic;
    const window = optic.window as SightWindow, top = window.top ?? window.corner;
    model.root.updateMatrixWorld(true);
    const eye = new THREE.Vector3(0, optic.height, -optic.aimDepth);
    const blocked = (x: number, y: number) => {
      const direction = new THREE.Vector3(x, optic.height + y, optic.lens).sub(eye).normalize();
      return new THREE.Raycaster(eye, direction, 0, 1).intersectObject(model.root, true).length > 0;
    };
    // The frame's corner is cut away, so the square's corner is frame, and the
    // arch's edge just inside it is open. The emitter is left to the bottom edge.
    expect(window.width).toBeGreaterThan(window.height);
    expect(blocked(window.width / 2 - .001, window.height / 2 - .001)).toBe(true);
    expect(blocked(0, window.height / 2 + .001)).toBe(true);
    expect(blocked(window.width / 2 + .001, 0)).toBe(true);
    const inset = top * (1 - Math.SQRT1_2) + .003;
    expect(blocked(window.width / 2 - inset, window.height / 2 - inset)).toBe(false);
    expect(blocked(0, window.height / 2 - .003)).toBe(false);
    expect(blocked(window.width / 2 - .003, 0)).toBe(false);

    const remove = fitWeaponOptic(model.root, fitted(id)), sight = getWeaponSight(model.root)!;
    const glass = bounds(model.root.getObjectByName('optic-coated-glass')!), lens = bounds(sight.lens);
    for (const size of [glass, lens]) {
      expect(size.x).toBeCloseTo(window.width, 4);
      expect(size.y).toBeCloseTo(window.height, 4);
    }
    expect(sight.radius).toBeCloseTo(windowRadius(window));
    expect(sight.aimHeight).toBeCloseTo(optic.height);
    remove(); model.dispose();
  });

  it('cuts the slide dot and the offset dot to their windows too', () => {
    const slide = new THREE.Group(), removeSlide = fitWeaponOptic(slide, fitted('p30-silent'));
    const slideSize = bounds(slide.getObjectByName('optic-coated-glass')!);
    expect(slideSize.x).toBeCloseTo(MINI_REFLEX_WINDOW.width, 4);
    expect(slideSize.y).toBeCloseTo(MINI_REFLEX_WINDOW.height, 4);
    removeSlide();
    const rifle = new THREE.Group(), removeRifle = fitWeaponOptic(rifle, fitted('sar-twoeyes'));
    const offset = getWeaponSight(rifle)!.offset!;
    expect(offset.lens.geometry).toBeInstanceOf(THREE.ShapeGeometry);
    expect(offset.radius).toBeGreaterThan(MINI_REFLEX_WINDOW.height / 2);
    removeRifle();
  });

  it('gives a window lens its own shader, since it drops the disc lens\'s round aperture', () => {
    const round = new THREE.Group(), removeRound = fitWeaponOptic(round, { ...FPS_WEAPONS[1], optic: 'reflex', aimFov: HIP_FOV });
    const framed = new THREE.Group(), removeFramed = fitWeaponOptic(framed, fitted('p30-silent'));
    const key = (root: THREE.Object3D) => getWeaponSight(root)!.lens.material.customProgramCacheKey();
    expect(key(framed)).not.toBe(key(round));
    removeRound(); removeFramed();
  });
});
