import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVehicleRain, type VehicleRainHit } from './vehicle-rain';
import { createRainEffects, type RainSplashOptions } from './rain-effects';
import { buildVehicleModel } from './vehicle-models';
import { createWetSurfaces } from './wet-surfaces';

const eye = new THREE.Vector3(0, 2, 5);
const query = (): VehicleRainHit => ({ height: 0, normal: new THREE.Vector3(0, 1, 0) });
function setup(kind = 'car') {
  const scene = new THREE.Scene(), root = new THREE.Group(); root.userData.vehicleKind = kind; scene.add(root);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2, .1, 4), new THREE.MeshStandardMaterial());
  panel.position.y = 2; panel.userData.rainReceiver = true; root.add(panel);
  const rotor = new THREE.Group(); rotor.name = 'main-rotor'; root.add(rotor);
  const rain = createVehicleRain(scene, () => 0), emit = vi.fn(); rain.update(.1, eye, 1, false, emit);
  return { scene, root, panel, rotor, rain, emit };
}
afterEach(() => vi.unstubAllGlobals());

describe('moving rain receivers', () => {
  it('hits the actual transformed panel and follows translation, yaw and bank', () => {
    const { root, panel, rain, emit } = setup();
    expect(rain.sample(0, 0, query()).height).toBeCloseTo(2.05);
    root.position.set(6, 3, 0); root.rotation.set(.16, .7, .1, 'YXZ'); rain.update(.1, eye, 1, false, emit);
    const top = panel.localToWorld(new THREE.Vector3(0, .05, 0));
    const hit = rain.sample(top.x, top.z, query());
    expect(hit.height).toBeCloseTo(top.y); expect(hit.object).toBe(panel); expect(hit.normal.y).toBeGreaterThan(.95);
    expect(rain.sample(0, 0, query()).height).toBe(0);
    root.removeFromParent(); rain.update(.6, eye, 1, false, emit); rain.update(.6, eye, 1, false, emit);
    rain.update(.6, eye, 1, false, emit); rain.update(.6, eye, 1, false, emit); rain.update(.6, eye, 1, false, emit);
    expect(rain.sample(top.x, top.z, query()).object).toBeUndefined(); rain.dispose();
  });
  it('preserves a taller static roof and ignores vehicles outside the nearby pool', () => {
    const { root, rain, emit } = setup();
    const roof = query(); roof.height = 8; expect(rain.sample(0, 0, roof).height).toBe(8);
    root.position.x = 100; rain.update(.1, eye, 1, false, emit);
    expect(rain.sample(100, 0, query()).height).toBe(0); rain.dispose();
  });
  it('attaches expanding rings to moving, rotating surfaces while spray detaches', () => {
    const { scene, root, panel, rain } = setup();
    const effects = createRainEffects(scene, () => 0);
    const contact = panel.localToWorld(new THREE.Vector3(0, .075, 0));
    effects.splash(contact, { attachment: panel, normal: new THREE.Vector3(0, 1, 0) });
    effects.update(0, eye, 0, 0, false);
    const p = effects.splashes.geometry.attributes.position;
    root.position.x = 5; root.rotation.set(.3, .7, .1); root.updateMatrixWorld(true);
    effects.update(0, eye, 0, 0, false);
    const center = new THREE.Vector3(), expected = panel.localToWorld(new THREE.Vector3(0, .075, 0));
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(panel.matrixWorld);
    for (let i = 0; i < 24; i++) {
      const vertex = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); center.add(vertex);
      expect(Math.abs(vertex.sub(expected).dot(normal))).toBeLessThan(.00001);
    }
    expect(center.divideScalar(24).distanceTo(expected)).toBeLessThan(.00001);
    expect(p.getX(24)).toBeLessThan(1); // first detached spray vertex remains at the impact
    effects.dispose(); rain.dispose();
  });
});

describe('driving and rotor spray', () => {
  it('sprays from moving tyres on wet ground, with smaller reduced pools and none while parked/dry', () => {
    function count(reduced: boolean, wet: boolean, moving: boolean) {
      const { root, rain, emit } = setup(); emit.mockClear();
      for (let n = 0; n < 20; n++) { if (moving) root.position.z -= .3; rain.update(.05, eye, wet ? 1 : 0, reduced, emit); }
      const result = emit.mock.calls.length;
      if (result) expect(emit.mock.calls[0][1]).toMatchObject({ sprayOnly: true });
      rain.dispose(); return result;
    }
    const full = count(false, true, true), reduced = count(true, true, true);
    expect(full).toBeGreaterThan(3); expect(reduced).toBeGreaterThan(0); expect(reduced).toBeLessThan(full);
    expect(count(false, false, true)).toBe(0); expect(count(false, true, false)).toBe(0);
  });
  it('pushes ground spray outwards only with a running low helicopter', () => {
    const { root, rotor, rain, emit } = setup('helicopter');
    for (let n = 0; n < 10; n++) { rotor.rotation.y += 1.7; rain.update(.05, eye, 1, false, emit); }
    expect(emit).toHaveBeenCalled();
    const options = emit.mock.calls[0][1] as RainSplashOptions; expect(options.velocity!.length()).toBeCloseTo(2.6);
    emit.mockClear(); root.position.y = 12;
    for (let n = 0; n < 10; n++) { rotor.rotation.y += 1.7; rain.update(.05, eye, 1, false, emit); }
    expect(emit).not.toHaveBeenCalled(); root.position.y = 0;
    for (let n = 0; n < 10; n++) rain.update(.05, eye, 1, false, emit);
    expect(emit).not.toHaveBeenCalled(); rain.dispose();
  });
});

it('protects the real driver/pilot seats, receives rain on sloped glass, and keeps upholstery dry', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  for (const kind of ['car', 'helicopter'] as const) {
    const scene = new THREE.Scene(), model = buildVehicleModel(kind); scene.add(model);
    const rain = createVehicleRain(scene, () => 0), wet = createWetSurfaces(scene);
    rain.update(.1, eye, 1, false, () => {});
    const seat = rain.sample(-.49, -.7, query()); expect(seat.height).toBeGreaterThan(kind === 'car' ? 2 : 2.6);
    if (kind === 'helicopter') {
      const glass = rain.sample(.4, -2, query()); expect(glass.object?.name).toBe('cockpit-glazing'); expect(glass.normal.y).toBeGreaterThan(.1); expect(glass.normal.y).toBeLessThan(.9);
    }
    const seatRay = new THREE.Raycaster(new THREE.Vector3(-.49, kind === 'car' ? 1.72 : 2.08, kind === 'car' ? -.4 : -1), new THREE.Vector3(0, -1, 0));
    const interior = seatRay.intersectObject(model, true)[0].object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const rough = interior.material.roughness;
    for (let n = 0; n < 60; n++) wet.update(.1, 1);
    expect(interior.material.roughness).toBe(rough);
    const paint = seat.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(paint.material.roughness).toBeLessThan(.5); wet.dispose(); rain.dispose();
  }
});

it('the atmosphere shelters a seated camera but exposes an outside chase camera', async () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const { createWorldAtmosphere } = await import('./world-atmosphere');
  const { setEnvironmentSettings } = await import('./environment-settings');
  setEnvironmentSettings({ weather: 'thunderstorm', timeOfDay: 'noon', celebration: 'none' });
  const scene = new THREE.Scene(), car = buildVehicleModel('car'), camera = new THREE.PerspectiveCamera(); scene.add(car);
  const atmosphere = createWorldAtmosphere(scene, [], []);
  camera.position.set(-.5, 1.72, -.4); atmosphere.update(.1, camera); expect(atmosphere.air.sheltered).toBe(true);
  camera.position.set(0, 3.3, 5); atmosphere.update(.1, camera); expect(atmosphere.air.sheltered).toBe(false);
  car.position.x = 8; camera.position.set(7.5, 1.72, -.4); atmosphere.update(.1, camera); expect(atmosphere.air.sheltered).toBe(true);
  camera.position.x = -.5; atmosphere.update(.1, camera); expect(atmosphere.air.sheltered).toBe(false); atmosphere.dispose();
});

describe('baked vehicle surfaces', () => {
  /** What a ray straight down finds on the model's receivers, the answer the baked surface stands in for: the height, and whether that face looks up. */
  function byRay(model: THREE.Object3D, x: number, z: number) {
    const receivers: THREE.Object3D[] = []; model.traverse(o => { if (o instanceof THREE.Mesh && o.userData.rainReceiver) receivers.push(o); });
    const hits = new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0)).intersectObjects(receivers, false);
    if (!hits.length) return null;
    const top = hits.reduce((a, b) => a.point.y > b.point.y ? a : b);
    return { height: top.point.y, flat: Math.abs(top.face!.normal.clone().transformDirection(top.object.matrixWorld).y) > .7 };
  }
  /** Counts rays cast at the model's receivers from here on. */
  function countRays(model: THREE.Object3D) {
    const counter = { rays: 0 };
    model.traverse(o => { if (o instanceof THREE.Mesh && o.userData.rainReceiver) { const cast = o.raycast; o.raycast = (...args) => { counter.rays++; cast.apply(o, args); }; } });
    return counter;
  }
  it('answers as a ray does on the real models, level, climbing and banked, without casting one', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
    for (const kind of ['car', 'helicopter'] as const) for (const pose of [[0, 0, 0, 0], [40, .5, .12, -.1], [9, 2.4, -.2, .16]] as const) {
      const scene = new THREE.Scene(), model = buildVehicleModel(kind); scene.add(model);
      model.position.set(3, pose[0], -7); model.rotation.set(pose[2], pose[1], pose[3], 'YXZ'); model.updateMatrixWorld(true);
      const rain = createVehicleRain(scene, () => 0);
      rain.update(.1, model.position.clone(), 1, false, () => {});
      const expected: ReturnType<typeof byRay>[] = [], points: [number, number][] = [];
      for (let x = -3; x <= 3; x += .23) for (let z = -6.5; z <= 6.5; z += .23) { points.push([3 + x, -7 + z]); expected.push(byRay(model, 3 + x, -7 + z)); }
      const counter = countRays(model);
      let flat = 0, exact = 0, near = 0, agree = 0;
      points.forEach(([x, z], i) => {
        const hit = rain.sample(x, z, { height: -100, normal: new THREE.Vector3(0, 1, 0) }), ray = expected[i];
        if (!!hit.object === !!ray) agree++;
        // A face seen nearly edge-on says little: a finger's width sideways is half a metre down it.
        if (!hit.object || !ray?.flat) return;
        flat++; if (Math.abs(hit.height - ray.height) < .04) exact++; if (Math.abs(hit.height - ray.height) < .15) near++;
      });
      const label = `${kind} ${pose}`, level = !pose[2] && !pose[3];
      expect(counter.rays, label).toBe(0); expect(flat, label).toBeGreaterThan(150);
      // Cells are 8 cm, so an outline can be a cell out.
      expect(agree / points.length, `${label} outline`).toBeGreaterThan(.95);
      // Leaning, each cell stands as a solid column: rain does not blow in under a roof, where a ray would pass beneath it.
      if (level) expect(exact / flat, `${label} height`).toBeGreaterThan(.9);
      else expect(near / flat, `${label} height`).toBeGreaterThan(.9);
      rain.dispose();
    }
  });
  it('follows a spinning rotor in its own frame', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
    const scene = new THREE.Scene(), model = buildVehicleModel('helicopter'); scene.add(model);
    const rain = createVehicleRain(scene, () => 0), rotor = model.getObjectByName('main-rotor')!;
    rain.update(.1, eye, 1, false, () => {});
    const counter = countRays(model);
    for (let n = 0; n < 6; n++) {
      rotor.rotation.y += .37; rain.update(.016, eye, 1, false, () => {});
      // Out along a blade, clear of the hull below it.
      const tip = rotor.localToWorld(new THREE.Vector3(0, 0, -4)), hit = rain.sample(tip.x, tip.z, query());
      expect(hit.height).toBeGreaterThan(3.1); expect(hit.height).toBeLessThan(3.4);
      const between = rotor.localToWorld(new THREE.Vector3(2.8, 0, -2.8));
      expect(rain.sample(between.x, between.z, query()).height).toBeLessThan(3);
    }
    expect(counter.rays).toBe(0); rain.dispose();
  });
  it('reads a part that has moved on its body by ray until it settles, then draws it where it stands', () => {
    const { panel, rain, emit } = setup(), counter = { rays: 0 }, cast = panel.raycast;
    panel.raycast = (...args) => { counter.rays++; cast.apply(panel, args); };
    expect(rain.sample(0, 0, query()).height).toBeCloseTo(2.05); expect(counter.rays).toBe(0);
    panel.position.x = 5; panel.updateMatrixWorld(true); rain.update(.05, eye, 1, false, emit);
    expect(rain.sample(5, 0, query()).height).toBeCloseTo(2.05); expect(counter.rays).toBe(1);
    expect(rain.sample(0, 0, query()).height).toBe(0);
    for (let n = 0; n < 8; n++) rain.update(.05, eye, 1, false, emit);
    counter.rays = 0;
    expect(rain.sample(5, 0, query()).height).toBeCloseTo(2.05); expect(rain.sample(0, 0, query()).height).toBe(0);
    expect(counter.rays).toBe(0); rain.dispose();
  });
  it('reads a body on its side by ray, and passes over a vehicle below what is asking', () => {
    const { root, panel, rain, emit } = setup(), counter = { rays: 0 }, cast = panel.raycast;
    panel.raycast = (...args) => { counter.rays++; cast.apply(panel, args); };
    expect(rain.sample(0, 0, query(), 2.2).object).toBeUndefined();
    expect(rain.sample(0, 0, query(), 2).object).toBe(panel); expect(counter.rays).toBe(0);
    root.rotation.z = 1.3; rain.update(.05, eye, 1, false, emit);
    const side = panel.localToWorld(new THREE.Vector3(0, 0, 0)), hit = rain.sample(side.x, side.z, query());
    expect(hit.object).toBe(panel); expect(counter.rays).toBeGreaterThan(0); rain.dispose();
  });
});
