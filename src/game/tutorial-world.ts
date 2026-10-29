import { createSceneKit } from './scene-kit';
import { TUTORIAL_DISTRICT, COURSE_STEPS } from './tutorial-course';
import { getWorldZone } from './world-zones';
import type { buildDistrictWorld } from './district-world';
import type { TraversalObstacle } from './vertical-routes';
import { createRegionMovement } from './region-collision';

/** A small purpose-built yard, using the live game's movement and collision system. */
export function buildTutorialWorld(): ReturnType<typeof buildDistrictWorld> {
  const kit = createSceneKit({ background: '#b7cbd0', fogNear: 65, fogFar: 150 });
  const { scene, box, mat, sign } = kit;
  const concrete = mat('#c5c2b0'), green = mat('#304e43'), orange = mat('#dd9754'), dark = mat('#243b35');
  const bounds = { minX: -32, maxX: 32, minZ: -34, maxZ: 34 };
  box(0, -.12, 0, 66, .24, 70, concrete);
  box(0, .012, 7, 6, .024, 48, mat('#637b6b'));
  for (const x of [-3.2, 3.2]) {
    box(x, .6, 7, .3, 1.2, 48, green); kit.solid(x, 7, .3, 48);
  }
  // A 50 cm hurdle cannot be auto-stepped (the live step limit is 35 cm).
  box(0, .25, 7, 6, .5, .45, orange);
  // Standing is blocked; the crouched body fits below the 1.3 m underside.
  box(0, 1.65, -1, 6, .7, 3, green);
  const traversal: TraversalObstacle[] = [
    { minX: -3, maxX: 3, minZ: 6.775, maxZ: 7.225, minY: 0, maxY: .5 },
    { minX: -3, maxX: 3, minZ: -2.5, maxZ: .5, minY: 1.3, maxY: 2 },
  ];
  scene.userData.traversalObstacles = traversal;
  // The hurdle is a real landing surface, so a short jump can land on it and
  // step down instead of falling into its collision volume.
  scene.userData.walkSurfaces = [{ id: 'tutorial-hurdle', routeId: 'tutorial', minX: -3, maxX: 3, minZ: 6.775, maxZ: 7.225, axis: 'z', startHeight: .5, endHeight: .5, solidBelow: true }];
  box(0, .03, 8.3, 5.8, .04, .15, orange);
  sign('RECRUIT / FIELD SCHOOL', 0, 4.5, -30, 18, 1.8);
  box(0, 2, -31, 28, 4, .4, dark); kit.solid(0, -31, 28, .4);
  const rings: { step: number; mesh: import('three').Mesh }[] = [];
  COURSE_STEPS.forEach((step, index) => {
    if (!('x' in step)) return;
    const ring = new kit.THREE.Mesh(kit.geo(new kit.THREE.RingGeometry(.9, 1.25, 48)), mat('#738578'));
    ring.rotation.x = -Math.PI / 2; ring.position.set(step.x, .04, step.z); scene.add(ring);
    rings.push({ step: index, mesh: ring });
    for (const x of [-2.7, 2.7]) box(x, 1.5, step.z, .16, 3, .16, green);
    box(0, 3, step.z, 5.6, .15, .15, green);
    sign(`${String(index).padStart(2, '0')} / ${step.id.toUpperCase()}`, 0, 3.4, step.z, 4, .55);
  });
  scene.userData.setTutorialStep = (current: number) => rings.forEach(({ step, mesh }) => {
    const material = mesh.material as import('three').MeshStandardMaterial;
    material.color.set(step === current ? '#f6c76b' : step < current ? '#77c2a0' : '#738578');
    material.emissive.set(step === current ? '#ad6c22' : '#000000');
  });
  for (const x of [-27, 27]) for (const z of [-25, 0, 25]) kit.tree(x, z, 7, mat('#6b5c45'), green);
  const world = kit.finish({ car: new kit.THREE.Group(), stamps: [], animate: () => {} });
  const zone = getWorldZone('marina-bay');
  return { ...world, zone, bounds, move: createRegionMovement(bounds).move, environment: { bounds, move: createRegionMovement(bounds).move, spawns: [], playerSpawn: TUTORIAL_DISTRICT.spawn, endless: true } };
}
