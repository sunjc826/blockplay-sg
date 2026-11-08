import * as THREE from 'three';
import { getRegion } from './regions';
import { getWorldZone } from './world-zones';
import { createRegionMovement, type RegionBounds } from './region-collision';
import { BOUNDARY_SIDES, boundaryFrame, type BoundarySide } from './district-boundaries';
import type { TeamDeathmatchArea } from './arena-match';
import type { ArenaEnvironment } from './arena-rules';

const BARRICADE_DEPTH = .9;
const BARRICADE_HEIGHT = 2.15;
const BARRICADE_FACE = .16;
const BARRICADE_YAW: Record<BoundarySide, number> = { west: Math.PI, east: 0, north: Math.PI / 2, south: -Math.PI / 2 };

function addPerimeterBarricades(scene: THREE.Scene, bounds: RegionBounds) {
  const root = new THREE.Group();
  root.name = 'Team combat barricades';
  const profile = new THREE.Shape()
    .moveTo(0, -.12).lineTo(BARRICADE_DEPTH, -.12).lineTo(BARRICADE_DEPTH, .24)
    .lineTo(.65, .72).lineTo(.65, BARRICADE_HEIGHT).lineTo(BARRICADE_FACE, BARRICADE_HEIGHT)
    .lineTo(BARRICADE_FACE, .72).lineTo(0, .24).closePath();
  const concrete = new THREE.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false }).translate(0, 0, -.5);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const stone = new THREE.MeshStandardMaterial({ roughness: .95 });
  const charcoal = new THREE.MeshStandardMaterial({ color: '#3d403b', roughness: .85 });
  const amber = new THREE.MeshStandardMaterial({ color: '#cfa553', roughness: .65 });
  const shades = ['#a5a49a', '#b2afa2', '#aba99f'].map(color => new THREE.Color(color));
  const batches: THREE.InstancedMesh[] = [];
  const transform = new THREE.Object3D();
  const place = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) => {
    transform.position.set(x, y, z);
    transform.rotation.y = yaw;
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  };
  const ground = (x: number, z: number) => bounds.groundHeight?.(x, z) ?? 0;
  for (const side of BOUNDARY_SIDES) {
    const { axis, direction, fixed, min, max } = boundaryFrame(bounds, side);
    const count = Math.ceil((max - min) / 6), length = (max - min) / count;
    const panels = new THREE.InstancedMesh(concrete, stone, count);
    const plates = new THREE.InstancedMesh(box, charcoal, count);
    const reflectors = new THREE.InstancedMesh(box, amber, count * 2);
    plates.userData.fpsEffect = reflectors.userData.fpsEffect = true;
    plates.raycast = reflectors.raycast = () => {};
    const yaw = BARRICADE_YAW[side];
    const alongX = axis === 'z';
    for (let i = 0; i < count; i++) {
      const along = min + (i + .5) * length;
      const x = alongX ? along : fixed, z = alongX ? fixed : along;
      const y = ground(x, z);
      // The footing starts at the movement limit. All concrete lies outside play.
      place(panels, i, x, y, z, yaw, 1, 1, length);
      panels.setColorAt(i, shades[i % shades.length]);
      const plateX = x + (alongX ? 0 : direction * BARRICADE_FACE);
      const plateZ = z + (alongX ? direction * BARRICADE_FACE : 0);
      place(plates, i, plateX, y + 1.55, plateZ, yaw, .035, .22, 1.1);
      for (const [j, offset] of [-.36, .36].entries()) {
        const rx = plateX + (alongX ? offset : -direction * .022);
        const rz = plateZ + (alongX ? -direction * .022 : offset);
        place(reflectors, i * 2 + j, rx, y + 1.55, rz, yaw, .02, .13, .18);
      }
    }
    batches.push(panels, plates, reflectors);
  }
  // Corner blocks close the joint between perpendicular runs.
  const corners = new THREE.InstancedMesh(box, stone, 4);
  const { minX, maxX, minZ, maxZ } = bounds;
  const points = [[minX, minZ, -1, -1], [minX, maxZ, -1, 1], [maxX, minZ, 1, -1], [maxX, maxZ, 1, 1]];
  points.forEach(([x, z, dx, dz], i) => {
    place(corners, i, x + dx * BARRICADE_DEPTH / 2, ground(x, z) + BARRICADE_HEIGHT / 2, z + dz * BARRICADE_DEPTH / 2,
      0, BARRICADE_DEPTH, BARRICADE_HEIGHT + .24, BARRICADE_DEPTH);
    corners.setColorAt(i, shades[0]);
  });
  batches.push(corners);
  for (const mesh of batches) {
    mesh.receiveShadow = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }
  root.add(...batches);
  scene.add(root);
  return () => {
    root.removeFromParent();
    batches.forEach(mesh => mesh.dispose());
    concrete.dispose();
    box.dispose();
    stone.dispose();
    charcoal.dispose();
    amber.dispose();
  };
}

export function buildTeamCombatWorld(area:TeamDeathmatchArea,rules:Pick<ArenaEnvironment,'teamDeathmatch'|'hardpoint'>) {
  const region=getRegion(area.region), world=region.build();
  const bounds={...area.bounds,groundHeight:region.bounds.groundHeight}, move=createRegionMovement(bounds).move;
  const spawns=[...area.spawns.alpha,...area.spawns.bravo];
  const environment: ArenaEnvironment={bounds,move,spawns,navigationAnchors:[...spawns,...area.patrols],...rules};
  const removeBarricades = addPerimeterBarricades(world.scene, bounds);
  return {...world,zone:getWorldZone(area.region),bounds,move,environment,dispose(){removeBarricades();world.dispose();}};
}
