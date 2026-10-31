import { createSceneKit } from './scene-kit';
import { TUTORIAL_DISTRICT, COURSE_STEPS, COURSE_LAYOUT as L } from './tutorial-course';
import { getWorldZone } from './world-zones';
import type { buildDistrictWorld } from './district-world';
import type { TraversalObstacle, WalkSurface } from './vertical-routes';
import { createRegionMovement } from './region-collision';

/** A full-sized field school with separate approach, obstacle and recovery areas. */
export function buildTutorialWorld(): ReturnType<typeof buildDistrictWorld> {
  const kit = createSceneKit({ background: '#bdd4dc', fogNear: 125, fogFar: 310, shadow: { extent: 145, far: 540 } });
  const { scene, box, mat, sign, cylinder } = kit;
  const concrete = mat('#b6b5a4'), grass = mat('#7f946c'), dirt = mat('#a59373'), worn = mat('#b7a182');
  const green = mat('#304e43'), timber = mat('#796046'), dark = mat('#243b35');
  const white = mat('#ece1bd'), orange = mat('#de9951'), metal = mat('#69756d', .65, .35);
  const bounds = { ...L.bounds }, x = L.laneX, half = L.laneHalfWidth;
  const postedSign = (text: string, sx: number, y: number, z: number, width: number, height: number, color?: string) => {
    const panel = sign(text, sx, y, z, width, height, color);
    for (const side of [-1, 1]) {
      const fx = sx + side * (width / 2 - .2), top = y + height / 2;
      box(fx, top / 2, z - .1, .14, top, .14, timber);
      kit.solid(fx, z - .1, .14, .14);
    }
    return panel;
  };
  const traversal: TraversalObstacle[] = [], surfaces: WalkSurface[] = [];
  box(0, -.15, 0, 154, .3, 214, grass);
  // Main southbound lane, a broad right turn, then a separate firing bay.
  box(x, .01, 9, 8, .02, 170, dirt);
  box(-1, .012, L.bendZ, 58, .024, 9, dirt);
  box(L.rangeX, .015, -84, 16, .03, 29, dirt);
  box(x, .02, L.spawnZ, 22, .04, 18, concrete);
  for (const edge of [-half, half]) {
    for (let z = -68; z < 74; z += 5) box(x + edge, .035, z, .12, .025, 2, white);
  }
  // Perimeter fence and planted boundary give the compound a readable extent.
  for (const fx of [-70, 70]) {
    for (let z = -100; z <= 100; z += 10) cylinder(fx, 1.1, z, .09, 2.2, metal);
    for (const y of [.5, 1.5, 2.1]) box(fx, y, 0, .055, .055, 200, metal);
    kit.solid(fx, 0, .2, 200);
  }
  for (const z of [-100, 100]) {
    for (let fx = -70; fx <= 70; fx += 10) cylinder(fx, 1.1, z, .09, 2.2, metal);
    for (const y of [.5, 1.5, 2.1]) box(0, y, z, 140, .055, .055, metal);
    kit.solid(0, z, 140, .2);
  }
  for (const fx of [-60, 61]) for (let z = -85; z <= 85; z += 24) kit.tree(fx, z, 6, timber, green);

  // Shaded briefing shelter, benches and equipment racks beside the assembly pad.
  box(-47, 3.4, 83, 14, .25, 14, green, scene, true);
  box(-47, .02, 83, 14, .04, 14, concrete);
  for (const fx of [-53, -41]) for (const z of [77, 89]) {
    box(fx, 1.7, z, .22, 3.4, .22, timber, scene, true); kit.solid(fx, z, .22, .22);
  }
  for (const z of [79, 84, 88]) {
    box(-47, .55, z, 8, .18, .65, timber); kit.solid(-47, z, 8, .65);
    for (const fx of [-50, -44]) box(fx, .25, z, .18, .5, .55, dark);
  }
  postedSign('RECRUIT / FIELD SCHOOL', x, 3.5, 75, 11, 1.3);
  sign('ASSEMBLY / FOLLOW NUMBERED STATIONS', -47, 2.3, 76, 13, 1);
  for (let i = 0; i < 4; i++) {
    box(-11 + i * 1.5, .65, 85, 1.1, 1.3, 1, green, scene, true);
    box(-11 + i * 1.5, 1.31, 85, 1.2, .08, 1.1, timber);
    kit.solid(-11 + i * 1.5, 85, 1.2, 1.1);
  }

  // A measured 50 m sprint lane, with start/finish paint and 10 m markers.
  box(x, .025, 39, 7, .025, 50, mat('#8c7761'));
  for (let distance = 0; distance <= 50; distance += 10) {
    const z = L.walkZ - distance;
    box(x, .05, z, 7, .025, .18, white);
    sign(`${distance} m`, x + 5.5, .65, z, 2, .4, '#304e43');
    cylinder(x + 4.2, .3, z, .13, .6, orange);
  }
  for (const fx of [-1.15, 1.15]) box(x + fx, .045, 39, .08, .02, 50, white);
  postedSign('02 / 50 m SPRINT', x + 7, 2.1, 62, 6, .8);

  // Solid station walls guide the traversal; they are visibly timber-clad.
  const sideWalls = (entryZ: number, exitZ: number, height: number) => {
    const depth = entryZ - exitZ, center = (entryZ + exitZ) / 2;
    for (const side of [-1, 1]) {
      const fx = x + side * (half + .14);
      box(fx, height / 2, center, .28, height, depth, timber, scene, true);
      kit.solid(fx, center, .28, depth);
      for (let z = exitZ; z <= entryZ; z += 2) box(fx, height / 2, z, .38, height + .1, .22, dark);
    }
  };
  sideWalls(3, -10, 1.5);
  box(x, .25, L.hurdleZ, 7, .5, .45, timber, scene, true);
  for (let fx = x - 3; fx <= x + 3; fx += .6) box(fx, .27, L.hurdleZ + .231, .26, .42, .015, orange);
  for (const fx of [x - 3.2, x + 3.2]) box(fx, .32, L.hurdleZ, .3, .64, .8, dark);
  traversal.push({ minX: x - half, maxX: x + half, minZ: L.hurdleZ - .225, maxZ: L.hurdleZ + .225, minY: 0, maxY: .5 });
  surfaces.push({ id: 'tutorial-hurdle', routeId: 'tutorial', minX: x - half, maxX: x + half, minZ: L.hurdleZ - .225, maxZ: L.hurdleZ + .225, axis: 'z', startHeight: .5, endHeight: .5, solidBelow: true });
  box(x, .035, L.hurdleZ + 1.8, 7, .025, .2, orange);
  postedSign('03 / TIMBER HURDLE', x + 8, 2, 1, 7, .8);

  // Timber beams and a continuous slatted roof: 1.3 m underside, crouch only.
  const crouch = L.crouch, crouchLength = crouch.entryZ - crouch.exitZ;
  sideWalls(crouch.entryZ + 1, crouch.exitZ - 1, 1.8);
  for (let z = crouch.exitZ; z <= crouch.entryZ; z += 1) box(x, crouch.clearance + .12, z, 7, .24, .22, timber, scene, true);
  for (let fx = x - half; fx <= x + half; fx += .45) box(fx, 1.57, (crouch.entryZ + crouch.exitZ) / 2, .23, .16, crouchLength + .3, green);
  traversal.push({ minX: x - half, maxX: x + half, minZ: crouch.exitZ, maxZ: crouch.entryZ, minY: crouch.clearance, maxY: 1.7 });
  box(x, .026, (crouch.entryZ + crouch.exitZ) / 2, 6.8, .025, crouchLength + 2, worn);
  postedSign('04 / CROUCH PASSAGE / 1.3 m', x + 9, 2, crouch.entryZ + 3, 10, .8);

  // Low safety mesh: one collision envelope matches the net's lowest wires.
  // No walk surface is authored on top, so the 8 m span cannot be stepped across.
  const crawl = L.crawl, crawlLength = crawl.entryZ - crawl.exitZ;
  sideWalls(crawl.entryZ + 1, crawl.exitZ - 1, 1.4);
  box(x, .028, (crawl.entryZ + crawl.exitZ) / 2, 6.8, .025, crawlLength + 2, worn);
  for (let z = crawl.exitZ; z <= crawl.entryZ; z += 2) {
    for (const fx of [x - half, x + half]) cylinder(fx, .51, z, .09, 1.02, metal);
    box(x, crawl.clearance + .04, z, 7, .08, .08, metal, scene, true);
  }
  for (let fx = x - half; fx <= x + half; fx += .35) box(fx, crawl.clearance + .02, (crawl.entryZ + crawl.exitZ) / 2, .025, .025, crawlLength, metal);
  for (let z = crawl.exitZ; z <= crawl.entryZ; z += .35) box(x, crawl.clearance + .03, z, 7, .025, .025, metal);
  traversal.push({ minX: x - half, maxX: x + half, minZ: crawl.exitZ, maxZ: crawl.entryZ, minY: crawl.clearance, maxY: crawl.clearance + .12 });
  postedSign('05 / LOW CRAWL / 8 m', x + 9, 1.8, crawl.entryZ + 3, 9, .8);
  postedSign('LIE DOWN BEFORE THE MESH', x, 1.45, crawl.entryZ - .1, 7.5, .55, '#805d37');

  // Ground arrows lead around the bend; the range is offset from the obstacle lane.
  const arrow = (fx: number, z: number, east = false) => {
    const group = new kit.THREE.Group(); group.position.set(fx, .06, z); if (east) group.rotation.y = -Math.PI / 2;
    box(0, 0, .25, .15, .025, 1.5, white, group);
    for (const side of [-1, 1]) { const wing = box(side * .25, 0, -.35, .12, .025, .85, white, group); wing.rotation.y = side * .65; }
    scene.add(group);
  };
  for (const z of [73, 6, -18, -42, -66]) arrow(x, z);
  for (const fx of [-18, -8, 2, 12]) arrow(fx, L.bendZ, true);
  arrow(L.rangeX, -73);
  postedSign('FIRING RANGE  >', x + 9, 1.9, -69, 9, .9);
  // Backstop, flank walls, firing benches, and target distance markers.
  box(L.rangeX, 2.8, -98, 23, 5.6, 3, mat('#827c62'), scene, true); kit.solid(L.rangeX, -98, 23, 3);
  for (const fx of [L.rangeX - 10, L.rangeX + 10]) {
    box(fx, 1.2, -86, .5, 2.4, 23, timber, scene, true); kit.solid(fx, -86, .5, 23);
  }
  box(L.rangeX, .05, L.firingZ, 16, .025, .22, orange);
  for (const fx of [L.rangeX - 5, L.rangeX + 5]) {
    box(fx, .85, -78, 2, .16, .8, timber); kit.solid(fx, -78, 2, .8);
    for (const side of [-.7, .7]) box(fx + side, .4, -78, .12, .8, .65, dark);
  }
  postedSign('06 / FIRING LINE', L.rangeX, 2.8, -79, 9, .8);
  sign('15 m / TARGET LINE', L.rangeX, 4.2, -96.4, 12, 1);

  // Side-mounted station boards avoid a stack of overhead gates obscuring the view.
  const rings: { step: number; mesh: import('three').Mesh; board?: import('three').Mesh }[] = [];
  COURSE_STEPS.forEach((step, index) => {
    if (!('x' in step)) return;
    const ring = new kit.THREE.Mesh(kit.geo(new kit.THREE.RingGeometry(1.05, 1.4, 48)), mat('#738578'));
    ring.rotation.x = -Math.PI / 2; ring.position.set(step.x, .07, step.z);
    // Keep dynamic rings out of the static instancing pass.
    const marker = new kit.THREE.Group(); marker.add(ring); scene.add(marker);
    const board = box(step.x - 5, 1.7, step.z, 2.6, 1, .15, mat('#304e43'));
    const frame = new kit.THREE.Group(); frame.add(board); scene.add(frame);
    for (const fx of [step.x - 6, step.x - 4]) box(fx, .9, step.z, .12, 1.8, .12, timber);
    sign(`${String(index).padStart(2, '0')} / ${step.id.toUpperCase()}`, step.x - 5, 1.7, step.z + .08, 2.5, .65);
    rings.push({ step: index, mesh: ring, board });
  });
  scene.userData.setTutorialStep = (current: number) => rings.forEach(({ step, mesh, board }) => {
    const color = step === current ? '#f6c76b' : step < current ? '#77c2a0' : '#738578';
    const material = mesh.material as import('three').MeshStandardMaterial;
    material.color.set(color); material.emissive.set(step === current ? '#ad6c22' : '#000000');
    if (board) (board.material as import('three').MeshStandardMaterial).emissive.set(step === current ? '#6d4317' : '#000000');
  });
  scene.userData.traversalObstacles = traversal;
  scene.userData.walkSurfaces = surfaces;
  const world = kit.finish({ car: new kit.THREE.Group(), stamps: [], animate: () => {} });
  const move = createRegionMovement(bounds).move;
  return { ...world, zone: getWorldZone('marina-bay'), bounds, move, environment: { bounds, move, spawns: [], playerSpawn: TUTORIAL_DISTRICT.spawn, endless: true } };
}
