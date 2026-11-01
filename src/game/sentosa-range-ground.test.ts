import * as THREE from 'three';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildSentosaScene, SENTOSA_BOUNDS } from './sentosa-scene';
import { getFpsDistrict } from './fps-districts';
import { createFpsVehicles } from './fps-vehicles';
import { createRainEffects, createRainSurface } from './rain-effects';

const world = buildSentosaScene(), district = getFpsDistrict('sentosa');
world.scene.updateMatrixWorld(true);
afterAll(() => world.dispose());
afterEach(() => vi.unstubAllGlobals());
const ground = SENTOSA_BOUNDS.groundHeight;
function renderedFloor(x: number, z: number) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0), 0, 2);
  return ray.intersectObject(world.scene, true)[0]?.point.y;
}

describe('Sentosa training lawn ground alignment', () => {
  it('matches the rendered turf to gameplay at the player, targets and both vehicle spawns', () => {
    for (const p of [district.spawn, ...district.targets, ...Object.values(district.vehicles),
      { x: 121, z: 41 }, { x: 209, z: 109 }]) {
      expect(renderedFloor(p.x, p.z), `${p.x},${p.z}`).toBeCloseTo(ground(p.x, p.z), 6);
    }
  });

  it('keeps real vehicle wheels and skids above the turf on spawn and reset', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
    const vehicles = createFpsVehicles(world.scene, world.obstacles, { car: '', helicopter: '' },
      { spawns: district.vehicles, bounds: SENTOSA_BOUNDS, deriveFlightObstacles: true });
    try {
      for (let reset = 0; reset < 2; reset++) {
        world.scene.updateMatrixWorld(true);
        for (const kind of ['car', 'helicopter'] as const) {
          const state = vehicles.states[kind], floor = ground(state.x, state.z);
          let bottom = Infinity;
          vehicles.models[kind].traverse(o => {
            if (o instanceof THREE.Mesh) bottom = Math.min(bottom, new THREE.Box3().setFromObject(o).min.y);
          });
          expect(state.y).toBeCloseTo(floor + .13);
          expect(bottom, `${kind} bottom`).toBeGreaterThanOrEqual(renderedFloor(state.x, state.z)! - .02);
        }
        vehicles.reset();
      }
    } finally { vehicles.dispose(); }
  });

  it('renders storm splash rings above the visible lawn in full and reduced effects', () => {
    const effects = createRainEffects(new THREE.Scene(), createRainSurface(world.obstacles, ground));
    const eye = new THREE.Vector3(district.spawn.x, ground(district.spawn.x, district.spawn.z) + 1.75, district.spawn.z);
    try {
      for (const reduced of [false, true]) {
        for (let i = 0; i < 180; i++) effects.update(1 / 60, eye, 1, 0, reduced);
        const positions = effects.splashes.geometry.attributes.position;
        let visible = 0;
        for (let i = 0; i < effects.splashes.geometry.drawRange.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
          if (x < 155 || x > 175 || z < 92 || z > 109) continue;
          expect(y).toBeGreaterThan(renderedFloor(x, z)!);
          visible++;
        }
        expect(visible, `reduced=${reduced}`).toBeGreaterThan(24);
      }
    } finally { effects.dispose(); }
  });
});
