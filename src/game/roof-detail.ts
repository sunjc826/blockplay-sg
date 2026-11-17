import * as THREE from 'three';
import type { RegionWorld } from './regions';
import { surfaceHash } from './district-look';
import { getWalkSurfaces } from './vertical-routes';
import { buildingSized, upright } from './world-night-lights';

/**
 * Bare box roofs get what a real roof carries: a parapet round the edge and a little plant (a lift
 * overrun, a water tank, a row of condensers). It is decoration at roof height: no colliders, and the
 * group is tagged `fpsEffect`, so shots and picking pass through it as the authority's colliders do.
 * Roofs that already carry something or that can be walked on are left alone. It runs last in a district's
 * build, so boundary scenery is dressed with the rest.
 */
export interface Roof {
  /** Centre, top height, size along its own axes and yaw (radians about Y). */
  x: number; z: number; top: number; width: number; depth: number; yaw: number; height: number;
  /** An authored roof slab on a building: it is the lip already, so it gets plant and no parapet. */
  capped?: boolean;
}
export interface RoofPart { kind: 'parapet' | 'overrun' | 'tank' | 'condenser'; x: number; y: number; z: number; w: number; h: number; d: number; yaw: number }
export type Covered = (x: number, y: number, z: number) => boolean;

export const ROOF = {
  /** Smallest roof side worth a parapet, and the share of it that may already be built on. */
  minSide: 6, maxCovered: .2,
  parapet: { height: .4, thickness: .3 },
  /** Plant keeps this far inside the parapet. */
  margin: 1.2,
} as const;

/** Where on a roof a point given in its own axes lies in the world. */
function place(roof: Roof, u: number, v: number) {
  const c = Math.cos(roof.yaw), s = Math.sin(roof.yaw);
  return { x: roof.x + u * c + v * s, z: roof.z - u * s + v * c };
}

/** Share of a 5 x 5 grid of roof points with something standing on them. */
export function roofCoverage(roof: Roof, covered: Covered) {
  let hits = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const p = place(roof, (i / 4 - .5) * roof.width * .9, (j / 4 - .5) * roof.depth * .9);
    if (covered(p.x, roof.top + .3, p.z)) hits++;
  }
  return hits / 25;
}

/** The parts one roof gets. Deterministic in the roof's position, so a district builds the same every time. */
export function planRoof(roof: Roof, covered: Covered): RoofPart[] {
  if (Math.min(roof.width, roof.depth) < ROOF.minSide || roofCoverage(roof, covered) > ROOF.maxCovered) return [];
  const parts: RoofPart[] = [], { height, thickness } = ROOF.parapet, y = roof.top + height / 2;
  const edge = (u: number, v: number, w: number, d: number) => {
    // A side that meets a taller neighbour has a wall there already.
    const out = place(roof, u * 1.08, v * 1.08);
    if (covered(out.x, roof.top + .2, out.z)) return;
    const p = place(roof, u, v); parts.push({ kind: 'parapet', x: p.x, y, z: p.z, w, h: height, d, yaw: roof.yaw });
  };
  if (!roof.capped) {
    edge(0, -(roof.depth - thickness) / 2, roof.width, thickness); edge(0, (roof.depth - thickness) / 2, roof.width, thickness);
    edge(-(roof.width - thickness) / 2, 0, thickness, roof.depth - 2 * thickness); edge((roof.width - thickness) / 2, 0, thickness, roof.depth - 2 * thickness);
  }

  const seed = (n: number) => surfaceHash(Math.round(roof.x * 3.1) + n * 17.3, Math.round(roof.z * 3.1) - n * 9.7);
  const usableW = roof.width - 2 * ROOF.margin, usableD = roof.depth - 2 * ROOF.margin, along = roof.width >= roof.depth;
  const add = (kind: RoofPart['kind'], u: number, v: number, w: number, h: number, d: number) => {
    if (Math.abs(u) + w / 2 > usableW / 2 || Math.abs(v) + d / 2 > usableD / 2) return false;
    const corners = [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([du, dv]) => place(roof, u + du, v + dv));
    if (corners.some(p => covered(p.x, roof.top + .3, p.z))) return false;
    if (parts.some(o => o.kind !== 'parapet' && Math.hypot(o.x - corners[0].x, o.z - corners[0].z) < (Math.max(o.w, o.d) + Math.max(w, d)) / 2 + .4)) return false;
    parts.push({ kind, x: corners[0].x, y: roof.top + h / 2, z: corners[0].z, w, h, d, yaw: roof.yaw }); return true;
  };
  // Anything with a lift has an overrun; it sits off-centre, where a core would be.
  if (roof.height >= 12 && Math.min(usableW, usableD) >= 4) add('overrun', (seed(1) - .5) * usableW * .5, (seed(2) - .5) * usableD * .5, 3.5, 2.8, 3);
  // Mid-rise slabs keep a tank on the roof.
  if (roof.height >= 18 && roof.height <= 90 && seed(3) > .35) add('tank', (seed(4) - .5) * usableW * .7, (seed(5) - .5) * usableD * .7, 2.5, 2.2, 2);
  // Condensers in a row along the longer side, more on a bigger roof.
  const count = Math.min(6, Math.floor(roof.width * roof.depth / 70)), side = seed(6) > .5 ? 1 : -1, start = (seed(7) - .5) * .3;
  for (let i = 0; i < count; i++) {
    const t = (start + (i - (count - 1) / 2) * 2.1), across = side * ((along ? usableD : usableW) / 2 - .9);
    add('condenser', along ? t : across, along ? across : t, along ? 1.5 : 1, 1, along ? 1 : 1.5);
  }
  return parts;
}

const PLANT_COLOR: Record<Exclude<RoofPart['kind'], 'parapet'>, string> = { overrun: '#a9aaa4', tank: '#7f8d96', condenser: '#8d9194' };
/** Groups whose boxes are terrain or decks. Boundary scenery is included: its near rows stand beside the player. */
const SKIP = new Set(['Connected elevated places', 'Walkable elevated routes']);

export function withRoofDetail<T extends RegionWorld>(world: T): T {
  world.scene.updateMatrixWorld(true);
  const surfaces = getWalkSurfaces(world.scene);
  const boxes: { box: THREE.Box3; roof?: Roof; color?: THREE.Color; building?: boolean }[] = [];
  const matrix = new THREE.Matrix4(), local = new THREE.Box3(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), euler = new THREE.Euler();
  world.scene.traverse(object => {
    // Boundary buildings are tagged fpsEffect because they stop no shot, but they are buildings all the same.
    const effect = (o: THREE.Object3D) => o.userData.fpsEffect && !o.userData.boundaryScenery;
    if (!(object instanceof THREE.Mesh) || !object.visible || effect(object) || Array.isArray(object.material)) return;
    for (let p: THREE.Object3D | null = object.parent; p; p = p.parent) if (SKIP.has(p.name) || effect(p)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    local.copy(object.geometry.boundingBox!);
    const count = object instanceof THREE.InstancedMesh ? object.count : 1, material = object.material as THREE.MeshStandardMaterial;
    for (let i = 0; i < count; i++) {
      if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld); } else matrix.copy(object.matrixWorld);
      const box = new THREE.Box3().copy(local).applyMatrix4(matrix), entry: (typeof boxes)[number] = { box };
      boxes.push(entry);
      if (object.geometry.type !== 'BoxGeometry' || material.transparent || !material.color || !upright(matrix)) continue;
      // Either a building, or a slab that may turn out to be a building's roof (decided once every box is known).
      entry.building = buildingSized(box);
      if (!entry.building && (box.max.y < 7 || box.max.y - box.min.y > 1.5)) continue;
      matrix.decompose(position, quaternion, scale); euler.setFromQuaternion(quaternion, 'YXZ');
      // Only boxes standing square: yaw alone. A box laid on its side keeps its own axes out of this.
      if (Math.abs(euler.x) > 1e-3 || Math.abs(euler.z) > 1e-3) continue;
      const size = local.getSize(new THREE.Vector3()).multiply(scale), centre = box.getCenter(new THREE.Vector3());
      entry.roof = { x: centre.x, z: centre.z, top: box.max.y, width: Math.abs(size.x), depth: Math.abs(size.z), yaw: euler.y, height: box.max.y - box.min.y };
      entry.color = material.color;
    }
  });
  // A coarse grid keeps the "is something standing here" test off the full list.
  const cell = 24, grid = new Map<string, THREE.Box3[]>();
  for (const { box } of boxes) for (let x = Math.floor(box.min.x / cell); x <= Math.floor(box.max.x / cell); x++) for (let z = Math.floor(box.min.z / cell); z <= Math.floor(box.max.z / cell); z++) {
    const key = `${x}/${z}`, list = grid.get(key) ?? []; list.push(box); grid.set(key, list);
  }
  // A slab is a roof when a building stands right under most of it; otherwise it is a canopy or a deck.
  const buildings = boxes.filter(b => b.building);
  for (const entry of boxes) {
    if (!entry.roof || entry.building) continue;
    const slab = entry.box, area = entry.roof.width * entry.roof.depth;
    const under = buildings.find(b => Math.abs(b.box.max.y - slab.min.y) < .4 && entry.roof!.x > b.box.min.x && entry.roof!.x < b.box.max.x && entry.roof!.z > b.box.min.z && entry.roof!.z < b.box.max.z
      && (b.box.max.x - b.box.min.x) * (b.box.max.z - b.box.min.z) >= .6 * area);
    if (under) { entry.roof.capped = true; entry.roof.height = slab.max.y - under.box.min.y; } else entry.roof = undefined;
  }
  const parts: (RoofPart & { color: THREE.Color })[] = [];
  let roofs = 0;
  for (const { roof, box: own, color } of boxes) {
    if (!roof || !color) continue;
    // A roof people can reach is theirs: plant there would be walked through.
    if (surfaces.some(s => s.maxX > own.min.x && s.minX < own.max.x && s.maxZ > own.min.z && s.minZ < own.max.z && Math.abs(Math.max(s.startHeight, s.endHeight) - roof.top) < 1.5)) continue;
    if (world.obstacles.some(o => o.supportsTop && o.maxY !== undefined && Math.abs(o.maxY - roof.top) < .5 && o.maxX > own.min.x && o.minX < own.max.x && o.maxZ > own.min.z && o.minZ < own.max.z)) continue;
    const covered: Covered = (x, y, z) => (grid.get(`${Math.floor(x / cell)}/${Math.floor(z / cell)}`) ?? []).some(b => b !== own && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > y && b.min.y < y + 2.5);
    const planned = planRoof(roof, covered);
    if (!planned.length) continue;
    roofs++;
    const trim = color.clone().multiplyScalar(.82);
    for (const part of planned) parts.push({ ...part, color: part.kind === 'parapet' ? trim : new THREE.Color(PLANT_COLOR[part.kind]) });
  }
  world.scene.userData.roofDetail = { roofs, parts: parts.length };
  if (!parts.length) return world;
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85 });
  const mesh = new THREE.InstancedMesh(geometry, material, parts.length), group = new THREE.Group();
  group.name = 'Roof detail'; group.userData.fpsEffect = true; mesh.name = 'Roof parapets and plant';
  mesh.castShadow = true; mesh.receiveShadow = true;
  parts.forEach((part, i) => {
    matrix.compose(position.set(part.x, part.y, part.z), quaternion.setFromEuler(euler.set(0, part.yaw, 0)), scale.set(part.w, part.h, part.d));
    mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, part.color);
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  // Shots and picking ignore it, like the rest of an fpsEffect tree.
  mesh.raycast = () => {};
  group.add(mesh); world.scene.add(group);
  const dispose = world.dispose;
  world.dispose = () => { mesh.dispose(); geometry.dispose(); material.dispose(); group.removeFromParent(); dispose(); };
  return world;
}
