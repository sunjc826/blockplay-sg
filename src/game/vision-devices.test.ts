import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { createProfile, equip, purchase, resolveLoadout, restoreProfile } from './armory-state';
import { equipmentMovement } from './fps-encumbrance';
import { activePalette, advanceVision, cloudOpacity, createVisionState, cycleVisionPalette, stepVisionButton, toggleVision, visibleShare, visionAperture, visionFigures, visionGain, visionStrain, nvgAimingActive, VISION_DEVICES, VISION_MOUNT_SECONDS } from './vision-devices';
import { createThermalMaterials, thermalProperties } from './fps-vision';

const tubes = ['nvg-gen1', 'nvg-gen2', 'nvg-gen3'].map(id => VISION_DEVICES[id]);
const cores = ['thermal-t1', 'thermal-t2'].map(id => VISION_DEVICES[id]);
const veteran = () => ({ ...createProfile(), xp: 50000, credits: 100000, tokens: 10000 });

describe('vision device tiers', () => {
  it('sells every device the renderer knows, and nothing it does not', () => {
    const sold = ARMORY_CATALOG.filter(item => item.category === 'vision');
    expect(sold.map(item => item.id).filter(id => id !== 'vision-none').sort()).toEqual(Object.keys(VISION_DEVICES).sort());
    expect(itemById('vision-none')?.price).toBe(0);
  });
  it('makes each tube generation a better instrument, not a different filter', () => {
    for (let i = 1; i < tubes.length; i++) {
      expect(tubes[i].gain).toBeGreaterThan(tubes[i - 1].gain);
      expect(tubes[i].noise).toBeLessThan(tubes[i - 1].noise);
      expect(tubes[i].aperture).toBeGreaterThan(tubes[i - 1].aperture);
      expect(tubes[i].halo).toBeLessThan(tubes[i - 1].halo);
      expect(tubes[i].warmup).toBeLessThan(tubes[i - 1].warmup);
    }
    expect(cores[1].rows).toBeGreaterThan(cores[0].rows);
    expect(cores[1].aperture).toBeGreaterThan(cores[0].aperture);
    expect(cores[1].palettes.length).toBeGreaterThan(cores[0].palettes.length);
    expect(cores[0].calibration).toBeDefined(); expect(cores[1].calibration).toBeUndefined();
  });
  it('keeps a complete circular view in landscape, portrait and ultrawide, with more scene at each tier', () => {
    for (const devices of [tubes, cores]) {
      for (const aspect of [16 / 9, 9 / 16, 21 / 9, 1]) {
        const shares = devices.map(spec => visibleShare(visionAperture(spec, aspect), aspect));
        for (let i = 0; i < devices.length; i++) {
          // Diameter in pixels stays below the shorter viewport dimension, so no rim gets cropped.
          const diameter = visionAperture(devices[i], aspect) * Math.max(aspect, 1);
          expect(diameter).toBeLessThan(Math.min(aspect, 1));
          expect(shares[i]).toBeCloseTo(Math.PI / 4 * devices[i].aperture ** 2 * Math.min(aspect, 1 / aspect), 2);
          if (i > 0) expect(shares[i]).toBeGreaterThan(shares[i - 1]);
        }
      }
      for (const spec of devices) {
        expect(visibleShare(visionAperture(spec, 16 / 9), 16 / 9)).toBeCloseTo(visibleShare(visionAperture(spec, 9 / 16), 9 / 16), 3);
        expect(visionFigures(spec).view).toBe(Math.round(visibleShare(visionAperture(spec, 16 / 9)) * 100));
      }
    }
    expect(cores[1].aperture).toBeLessThan(tubes[2].aperture);
    expect(visionFigures(undefined)).toMatchObject({ gain: 1, view: 100, grain: 0, sharpness: 100, warmup: 0 });
  });
});

it('uses NV aiming only with a lowered, powered intensifier and restores it for thermal or bare eyes', () => {
  const state = createVisionState(true);
  expect(nvgAimingActive(tubes[0], state)).toBe(true);
  state.mount = .99;
  expect(nvgAimingActive(tubes[0], state)).toBe(false);
  state.mount = 1; state.on = false; state.fading = 1;
  expect(nvgAimingActive(tubes[0], state)).toBe(false);
  state.on = true;
  expect(nvgAimingActive(cores[0], state)).toBe(false);
  expect(nvgAimingActive(undefined, state)).toBe(false);
});

describe('vision gain', () => {
  it('holds a tube near 1 by day and opens to its rated gain at night or in a blackout', () => {
    for (const spec of tubes) {
      expect(visionGain(spec, 0)).toBe(1);
      expect(visionGain(spec, 1)).toBeCloseTo(spec.gain);
      expect(visionGain(spec, .5, 1)).toBeCloseTo(spec.gain);
      expect(visionStrain(spec, visionGain(spec, 1))).toBeCloseTo(1);
    }
    expect(visionGain(cores[0], 1)).toBe(1);
  });
  it('lets a thermal core see through most of a smoke cloud', () => {
    expect(cloudOpacity(1, true)).toBeLessThan(cloudOpacity(1, false) * .5);
  });
});

describe('vision state', () => {
  it('comes up from cold and warms over the spec warm-up', () => {
    const state = createVisionState(), spec = tubes[0];
    expect(toggleVision(state, spec)).toBe(true); expect(state.warm).toBe(0);
    advanceVision(state, spec, VISION_MOUNT_SECONDS); expect(state.mount).toBe(1); expect(state.warm).toBe(0);
    advanceVision(state, spec, spec.warmup / 2); expect(state.warm).toBeCloseTo(.5);
    advanceVision(state, spec, spec.warmup); expect(state.warm).toBe(1);
    expect(toggleVision(state, spec)).toBe(false);
    expect(toggleVision(createVisionState(), undefined)).toBe(false);
  });
  it('freezes a first-generation core to recalibrate on its schedule', () => {
    const state = createVisionState(), spec = cores[0];
    toggleVision(state, spec); advanceVision(state, spec, VISION_MOUNT_SECONDS); advanceVision(state, spec, spec.warmup);
    advanceVision(state, spec, spec.calibration!.every - .1); expect(state.calibrating).toBe(0);
    advanceVision(state, spec, .2); expect(state.calibrating).toBeGreaterThan(0);
    advanceVision(state, spec, spec.calibration!.hold); expect(state.calibrating).toBe(0);
  });
  it('swings down before it powers, and on switching off lets the picture die before swinging up', () => {
    for (const spec of [tubes[0], cores[1]]) {
      const state = createVisionState();
      toggleVision(state, spec);
      advanceVision(state, spec, VISION_MOUNT_SECONDS / 2); expect(state.mount).toBeCloseTo(.5); expect(state.warm).toBe(0);
      // The frame that brings it down spends the rest of its time warming.
      advanceVision(state, spec, VISION_MOUNT_SECONDS / 2 + spec.warmup / 4); expect(state.mount).toBe(1); expect(state.warm).toBeCloseTo(.25);
      advanceVision(state, spec, spec.warmup);
      toggleVision(state, spec);
      expect(state).toMatchObject({ on: false, fading: 1, mount: 1, warm: 1 });
      advanceVision(state, spec, spec.shutdown / 2); expect(state.fading).toBeCloseTo(.5); expect(state.mount).toBe(1);
      advanceVision(state, spec, spec.shutdown / 2); expect(state.fading).toBe(0);
      advanceVision(state, spec, VISION_MOUNT_SECONDS); expect(state.mount).toBe(0);
    }
    // A tube's phosphor glows on longer than a better tube's or a display's.
    expect(tubes[0].shutdown).toBeGreaterThan(tubes[2].shutdown);
  });
  it('has nothing to fade when switched off before it lit, and skips the motion when asked to', () => {
    const state = createVisionState(), spec = tubes[1];
    toggleVision(state, spec); advanceVision(state, spec, VISION_MOUNT_SECONDS / 2);
    toggleVision(state, spec); expect(state.fading).toBe(0);
    advanceVision(state, spec, VISION_MOUNT_SECONDS / 2); expect(state.mount).toBe(0);
    const reduced = createVisionState();
    toggleVision(reduced, spec); advanceVision(reduced, spec, .1, true); expect(reduced.mount).toBe(1); expect(reduced.warm).toBeCloseTo(.1 / spec.warmup);
    toggleVision(reduced, spec); advanceVision(reduced, spec, .01, true); expect(reduced).toMatchObject({ mount: 0, fading: 0 });
    // A restored checkpoint starts with the device already down and lit.
    expect(createVisionState(true)).toMatchObject({ mount: 1, warm: 1, fading: 0 });
  });
  it('cycles palettes only on a core that has them, and walks them on the touch button', () => {
    const state = createVisionState();
    toggleVision(state, cores[0]); expect(cycleVisionPalette(state, cores[0])).toBe(false);
    const fused = createVisionState(), spec = cores[1], seen: string[] = [];
    for (let i = 0; i < 4; i++) { stepVisionButton(fused, spec); seen.push(fused.on ? activePalette(fused, spec) : 'off'); }
    expect(seen).toEqual(['white-hot', 'black-hot', 'ironbow', 'off']);
    const tube = createVisionState(); stepVisionButton(tube, tubes[1]); expect(tube.on).toBe(true); stepVisionButton(tube, tubes[1]); expect(tube.on).toBe(false);
  });
});

describe('worn devices in the armory', () => {
  it('buys, equips, saves and weighs a device', () => {
    const bought = purchase(veteran(), 'nvg-gen2').profile, worn = equip(bought, 'nvg-gen2', 0);
    expect(worn.vision).toBe('nvg-gen2');
    expect(restoreProfile(JSON.stringify(worn)).vision).toBe('nvg-gen2');
    const loadout = resolveLoadout(worn);
    expect(loadout.vision?.spec.kind).toBe('nvg');
    expect(equipmentMovement(loadout, 0).totalKg).toBeCloseTo(equipmentMovement(resolveLoadout(createProfile()), 0).totalKg + itemById('nvg-gen2')!.weightKg!);
    expect(resolveLoadout(createProfile()).vision).toBeUndefined();
  });
  it('refuses an unowned device, in play and from a tampered save', () => {
    const base = createProfile();
    expect(equip(base, 'thermal-t2', 0)).toBe(base);
    expect(restoreProfile(JSON.stringify({ ...base, vision: 'thermal-t2' })).vision).toBe('vision-none');
    expect(restoreProfile(JSON.stringify({ ...base, owned: [...base.owned, 'thermal-t2'], vision: 'thermal-t2' })).vision).toBe('thermal-t2');
  });
});

describe('thermal materials', () => {
  const scene = () => {
    const root = new THREE.Scene();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#808080' }));
    const figure = new THREE.Group(); figure.userData.impactSurface = 'flesh';
    const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#4a5236' }));
    const rifle = new THREE.Group(); rifle.userData.heat = 'none';
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#1d2326' }));
    const car = new THREE.Group(); car.userData.heat = 'engine';
    const windscreen = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: .6, depthWrite: false }));
    const window = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: .4 }));
    const effects = new THREE.Group(); effects.userData.fpsEffect = true;
    const smoke = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: .5 }));
    const raider = new THREE.Group(); raider.userData.heat = 'engine';
    const hull = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const flash = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending }));
    rifle.add(barrel); figure.add(body, rifle); car.add(windscreen); effects.add(smoke, raider); raider.add(hull);
    root.add(wall, figure, car, window, effects, flash);
    return { root, wall, body, barrel, windscreen, window, smoke, hull, flash };
  };
  const heat = (mesh: THREE.Mesh) => ((mesh.material as THREE.ShaderMaterial).uniforms?.uHeat?.value as number | undefined);
  it('makes bodies hot, engines warm, the held rifle and the world cold', () => {
    const parts = scene(), thermal = createThermalMaterials();
    thermal.apply(parts.root);
    expect(heat(parts.body)).toBeGreaterThan(heat(parts.hull)!);
    expect(heat(parts.hull)).toBeGreaterThan(0);
    expect(heat(parts.barrel)).toBe(0); expect(heat(parts.wall)).toBe(0);
  });
  it('turns a vehicle windscreen opaque but leaves windows, smoke and flashes their own', () => {
    const parts = scene(), thermal = createThermalMaterials(), before = new Map([parts.window, parts.smoke, parts.flash].map(m => [m, m.material]));
    thermal.apply(parts.root);
    expect(thermal.isThermal(parts.windscreen.material as THREE.Material)).toBe(true);
    for (const [mesh, material] of before) expect(mesh.material).toBe(material);
  });
  it('restores every material, but not over one game code replaced meanwhile', () => {
    const parts = scene(), thermal = createThermalMaterials(), wall = parts.wall.material, replacement = new THREE.MeshStandardMaterial();
    thermal.apply(parts.root); thermal.apply(parts.root);
    expect(thermal.swappedCount).toBe(5);
    parts.body.material = replacement;
    thermal.restore();
    expect(parts.wall.material).toBe(wall); expect(parts.body.material).toBe(replacement);
    thermal.dispose();
  });
  it('reads bare metal and water cold and lamps hot', () => {
    const plain = thermalProperties(new THREE.MeshStandardMaterial({ color: '#777777' }));
    expect(thermalProperties(new THREE.MeshStandardMaterial({ color: '#777777', metalness: .9 })).base).toBeLessThan(plain.base);
    expect(thermalProperties(new THREE.MeshStandardMaterial({ color: '#777777', emissive: '#ffffff' })).base).toBeGreaterThan(plain.base + .2);
    expect(thermalProperties(new THREE.MeshStandardMaterial(), true).base).toBeLessThan(plain.base);
  });
});
