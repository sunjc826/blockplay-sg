import * as THREE from 'three';
import { namedObject } from './named-object';
import type { RainSplashOptions } from './rain-effects';
import { VEHICLE_MOVING_PARTS } from './vehicle-moving-parts';

export interface VehicleRainHit { height: number; object?: THREE.Object3D; normal: THREE.Vector3; kind?: 'solid' | 'rail' | 'water' }
/**
 * A rigid piece's top surface as rain sees it, in the piece's own frame: per cell the height at its centre,
 * the surface's slope there and which mesh it belongs to. `data` holds height, normal x and normal z.
 */
interface Surface { minX: number; minZ: number; minY: number; maxY: number; cell: number; nx: number; nz: number; data: Float32Array; owner: Uint16Array; meshes: Receiver[] }
interface Receiver { mesh: THREE.Mesh; bounds: THREE.Box3; body: Body; relative: Float64Array; geometry: THREE.BufferGeometry | null; version: number; baked: boolean }
/** Receivers that move as one: the vehicle's hull, or a part that turns on it (a rotor, a wheel, the turret). */
interface Body { frame: THREE.Object3D; receivers: Receiver[]; surface: Surface | null; inverse: THREE.Matrix4; bounds: THREE.Box3; usable: boolean; stale: boolean; tried: boolean; quiet: number }
interface VehicleRainState {
  root: THREE.Object3D; receivers: Receiver[]; bodies: Body[]; loose: Receiver[]; bounds: THREE.Box3;
  previous: THREE.Vector3; velocity: THREE.Vector3; rotor: number; spray: number;
}
/** Metres a side: a rotor blade is two or three cells wide. A surface too large for `SURFACE_CELLS` takes coarser cells. */
export const SURFACE_CELL = .08;
const SURFACE_CELLS = 250_000;
/** Seconds a part must hold still on its body before the body's surface is drawn again with it in its new place. */
const SETTLE = .3;
/** A body leaning further than this (the fall's share along its own up axis) is read by ray instead: its top is no longer its top. */
const UPRIGHT = .7;
const positionVersion = (geometry: THREE.BufferGeometry) => {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  return !position ? -1 : 'version' in position ? position.version : position.data.version;
};
const bakeable = (mesh: THREE.Mesh) => !(mesh instanceof THREE.SkinnedMesh) && !(mesh instanceof THREE.InstancedMesh) && !(mesh instanceof THREE.BatchedMesh)
  && !!mesh.geometry.getAttribute('position') && !Object.keys(mesh.geometry.morphAttributes).length;

/**
 * Cosmetic queries against vehicle exteriors only; never adds gameplay colliders.
 *
 * Rain asks where it lands for thousands of drops a frame, so each rigid piece of a vehicle has its top
 * surface drawn once into a grid in its own frame (`Surface`); a query is then a transform and a read,
 * wherever the vehicle has gone and however it has turned. Each cell stands as a solid column, so on a
 * leaning vehicle rain meets a roof's edge where a ray would pass under it: the cabin stays dry in a bank.
 * A part that has moved on its body since (a door
 * swinging, a panel knocked loose), a body lying on its side and meshes that cannot be drawn this way
 * are read by ray as before.
 */
export function createVehicleRain(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const vehicles = new Map<THREE.Object3D, VehicleRainState>();
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), hits: THREE.Intersection[] = [];
  const normalMatrix = new THREE.Matrix3(), point = new THREE.Vector3(), offset = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const relative = new THREE.Matrix4(), box = new THREE.Box3(), part = new THREE.Box3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let scanIn = 0;
  function attached(object: THREE.Object3D) { for (let p: THREE.Object3D | null = object; p; p = p.parent) if (p === scene) return true; return false; }
  /** Draws every receiver of the body, as it stands now, into one grid: the highest surface over each cell's centre. */
  function bake(body: Body) {
    body.stale = false; body.tried = true; body.surface = null;
    const meshes = body.receivers.filter(r => bakeable(r.mesh)).slice(0, 65535);
    for (const r of body.receivers) r.baked = false;
    box.makeEmpty();
    for (const r of meshes) {
      if (!r.mesh.geometry.boundingBox) r.mesh.geometry.computeBoundingBox();
      box.union(part.copy(r.mesh.geometry.boundingBox!).applyMatrix4(relative.fromArray(r.relative)));
    }
    if (box.isEmpty()) return;
    let cell = SURFACE_CELL;
    while (Math.ceil((box.max.x - box.min.x) / cell + 1) * Math.ceil((box.max.z - box.min.z) / cell + 1) > SURFACE_CELLS) cell *= 1.5;
    const nx = Math.ceil((box.max.x - box.min.x) / cell + 1), nz = Math.ceil((box.max.z - box.min.z) / cell + 1);
    const minX = box.min.x - cell / 2, minZ = box.min.z - cell / 2;
    const data = new Float32Array(nx * nz * 3), owner = new Uint16Array(nx * nz);
    for (let i = 0; i < data.length; i += 3) data[i] = -Infinity;
    meshes.forEach((r, which) => {
      const geometry = r.mesh.geometry, position = geometry.getAttribute('position'), index = geometry.index;
      relative.fromArray(r.relative);
      for (let corner = 0, corners = index ? index.count : position.count; corner + 2 < corners; corner += 3) {
        a.fromBufferAttribute(position, index ? index.getX(corner) : corner).applyMatrix4(relative);
        b.fromBufferAttribute(position, index ? index.getX(corner + 1) : corner + 1).applyMatrix4(relative);
        c.fromBufferAttribute(position, index ? index.getX(corner + 2) : corner + 2).applyMatrix4(relative);
        // The face normal; a face seen edge-on from above covers no cell.
        let fx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y), fy = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z), fz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        const length = Math.hypot(fx, fy, fz);
        if (Math.abs(fy) < 1e-12 || !length) continue;
        const flip = (fy < 0 ? -1 : 1) / length; fx *= flip; fz *= flip;
        const span = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - minX) / cell - .5)), i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - minX) / cell - .5));
        const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - minZ) / cell - .5)), j1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - minZ) / cell - .5));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = minX + (i + .5) * cell, z = minZ + (j + .5) * cell;
          const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / span, wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / span, wc = 1 - wa - wb;
          if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
          const height = wa * a.y + wb * b.y + wc * c.y, k = (j * nx + i) * 3;
          if (height > data[k]) { data[k] = height; data[k + 1] = fx; data[k + 2] = fz; owner[j * nx + i] = which; }
        }
      }
      r.baked = true;
    });
    body.surface = { minX, minZ, minY: box.min.y, maxY: box.max.y, cell, nx, nz, data, owner, meshes };
  }
  /** Where a drop falling at x, z first meets the body's surface: the fall is followed through the grid in the body's frame. */
  function read(body: Body, x: number, z: number, hit: VehicleRainHit) {
    const s = body.surface!, top = body.bounds.max.y + 1, e = body.inverse.elements;
    // The fall in the body's frame: where it starts, and how far it moves per metre fallen. Straight down only while the body is level.
    const ox = e[0] * x + e[4] * top + e[8] * z + e[12], oy = e[1] * x + e[5] * top + e[9] * z + e[13], oz = e[2] * x + e[6] * top + e[10] * z + e[14];
    const dx = -e[4], dy = -e[5], dz = -e[6];
    const enter = (s.maxY - oy) / dy, leave = (s.minY - oy) / dy;
    const ax = ox + dx * enter, az = oz + dz * enter, bx = ox + dx * leave, bz = oz + dz * leave;
    const run = Math.hypot(bx - ax, bz - az), steps = run < s.cell * .25 ? 1 : Math.min(96, Math.ceil(run / (s.cell * .5)) + 1);
    // Level, the fall stays in one cell. Leaning, it crosses several on its way down and may come at a raised cell from the side.
    let last = -1;
    for (let k = 0; k < steps; k++) {
      const f = steps === 1 ? 0 : k / (steps - 1), fallen = enter + (leave - enter) * f, px = ox + dx * fallen, pz = oz + dz * fallen;
      const i = Math.floor((px - s.minX) / s.cell), j = Math.floor((pz - s.minZ) / s.cell);
      if (i < 0 || j < 0 || i >= s.nx || j >= s.nz) continue;
      const cellIndex = j * s.nx + i; if (cellIndex === last) continue; last = cellIndex;
      const height = s.data[cellIndex * 3]; if (height === -Infinity) continue;
      const receiver = s.meshes[s.owner[cellIndex]]; if (!receiver.baked || !receiver.mesh.visible) continue;
      // The cell is a small plane through its centre, but only so steep: a wall's edge is a step between cells, not a slope across one.
      const nx = s.data[cellIndex * 3 + 1], nz = s.data[cellIndex * 3 + 2], ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
      const cx = s.minX + (i + .5) * s.cell, cz = s.minZ + (j + .5) * s.cell;
      const slope = ny > 1e-3 ? -(nx * (px - cx) + nz * (pz - cz)) / ny : 0, surface = height + Math.max(-s.cell, Math.min(s.cell, slope));
      // Where the fall is inside this cell: met on the way in (its side), on the way through (its top), or not at all.
      let met = (surface - oy) / dy;
      if (steps > 1) {
        let into = enter, out = leave;
        if (dx) { const near = (s.minX + (dx > 0 ? i : i + 1) * s.cell - ox) / dx, far = (s.minX + (dx > 0 ? i + 1 : i) * s.cell - ox) / dx; into = Math.max(into, near); out = Math.min(out, far); }
        if (dz) { const near = (s.minZ + (dz > 0 ? j : j + 1) * s.cell - oz) / dz, far = (s.minZ + (dz > 0 ? j + 1 : j) * s.cell - oz) / dz; into = Math.max(into, near); out = Math.min(out, far); }
        if (met > out) continue;
        met = Math.max(met, into);
      }
      if (top - met > hit.height) {
        hit.height = top - met; hit.object = receiver.mesh; hit.kind = 'solid';
        hit.normal.set(nx, ny, nz).transformDirection(body.frame.matrixWorld);
        if (hit.normal.y < 0) hit.normal.negate();
      }
      return;
    }
  }
  return {
    /** `low` is the lowest point of what is asking (a streak's tail): a vehicle wholly below it is not looked at. */
    sample(x: number, z: number, hit: VehicleRainHit, low = -Infinity) {
      for (const v of vehicles.values()) {
        if (!v.root.visible || x < v.bounds.min.x || x > v.bounds.max.x || z < v.bounds.min.z || z > v.bounds.max.z || v.bounds.max.y <= hit.height || low > v.bounds.max.y) continue;
        for (const body of v.bodies) {
          const bounds = body.bounds;
          if (!body.usable || x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z || bounds.max.y <= hit.height || low > bounds.max.y) continue;
          read(body, x, z, hit);
        }
        if (!v.loose.length) continue;
        ray.set(point.set(x, v.bounds.max.y + 1, z), down);
        for (const { mesh, bounds } of v.loose) {
          if (!mesh.visible || x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z || bounds.max.y <= hit.height || low > bounds.max.y) continue;
          hits.length = 0; mesh.raycast(ray, hits);
          for (const contact of hits) if (contact.point.y > hit.height && contact.face) {
            hit.height = contact.point.y; hit.object = mesh; hit.kind = 'solid';
            hit.normal.copy(contact.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(mesh.matrixWorld)).normalize();
            if (hit.normal.y < 0) hit.normal.negate();
          }
        }
      }
      return hit;
    },
    update(dt: number, eye: THREE.Vector3, rain: number, reduced: boolean, emit: (point: THREE.Vector3, options: RainSplashOptions) => void) {
      const step = Math.max(0, Math.min(.1, dt)); scanIn -= step;
      if (scanIn <= 0) {
        for (const root of vehicles.keys()) if (!attached(root)) vehicles.delete(root);
        scene.traverse(root => {
          if (!root.userData.vehicleKind || vehicles.has(root)) return;
          const receivers: Receiver[] = [], bodies = new Map<THREE.Object3D, Body>();
          root.traverse(o => {
            if (!(o instanceof THREE.Mesh) || !o.userData.rainReceiver) return;
            // The nearest part that turns on its own carries the mesh; otherwise the vehicle itself does.
            let frame: THREE.Object3D = root;
            for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (VEHICLE_MOVING_PARTS.has(p.name)) { frame = p; break; }
            let body = bodies.get(frame);
            if (!body) bodies.set(frame, body = { frame, receivers: [], surface: null, inverse: new THREE.Matrix4(), bounds: new THREE.Box3(), usable: false, stale: true, tried: false, quiet: 0 });
            const receiver: Receiver = { mesh: o, bounds: new THREE.Box3(), body, relative: new Float64Array(16).fill(NaN), geometry: null, version: -1, baked: false };
            receivers.push(receiver); body.receivers.push(receiver);
          });
          root.updateWorldMatrix(true, false);
          vehicles.set(root, { root, receivers, bodies: [...bodies.values()], loose: [], bounds: new THREE.Box3(), previous: root.getWorldPosition(new THREE.Vector3()), velocity: new THREE.Vector3(), rotor: root.getObjectByName('main-rotor')?.rotation.y ?? 0, spray: 0 });
        }); scanIn = .5;
      }
      for (const v of vehicles.values()) {
        v.root.updateWorldMatrix(true, false); v.root.getWorldPosition(point);
        if (point.distanceToSquared(eye) > 55 ** 2 || !v.root.visible) {
          v.bounds.makeEmpty(); v.previous.copy(point); v.spray = 0;
          v.rotor = namedObject(v.root, 'main-rotor')?.rotation.y ?? 0; continue;
        }
        v.root.updateWorldMatrix(false, true);
        if (step > 0) v.velocity.copy(point).sub(v.previous).divideScalar(step); else v.velocity.set(0, 0, 0);
        v.previous.copy(point); v.bounds.makeEmpty();
        v.loose.length = 0;
        for (const body of v.bodies) {
          body.inverse.copy(body.frame.matrixWorld).invert();
          let moved = false;
          for (const receiver of body.receivers) {
            const geometry = receiver.mesh.geometry;
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            receiver.bounds.copy(geometry.boundingBox!).applyMatrix4(receiver.mesh.matrixWorld); v.bounds.union(receiver.bounds);
            // Still where the surface was drawn with it? Its place on the body, its geometry and its vertices all have to match.
            const now = relative.multiplyMatrices(body.inverse, receiver.mesh.matrixWorld).elements, was = receiver.relative, version = positionVersion(geometry);
            let same = receiver.geometry === geometry && receiver.version === version;
            for (let i = 0; same && i < 16; i++) same = Math.abs(now[i] - was[i]) < 1e-5;
            if (same) continue;
            was.set(now); receiver.geometry = geometry; receiver.version = version;
            if (receiver.baked || !body.tried) body.stale = true;
            receiver.baked = false; moved = true;
          }
          body.quiet = moved ? 0 : body.quiet + step;
          if (body.stale && (!body.tried || body.quiet >= SETTLE)) bake(body);
          const e = body.inverse.elements;
          body.usable = !!body.surface && e[5] > UPRIGHT * Math.hypot(e[4], e[5], e[6]);
          body.bounds.makeEmpty();
          for (const receiver of body.receivers) if (body.usable && receiver.baked) body.bounds.union(receiver.bounds); else v.loose.push(receiver);
        }
        const rotor = namedObject(v.root, 'main-rotor'), angle = rotor?.rotation.y ?? 0;
        const spinning = step > 0 && Math.abs(angle - v.rotor) / step > 4; v.rotor = angle;
        const speed = Math.hypot(v.velocity.x, v.velocity.z), helicopter = v.root.userData.vehicleKind === 'helicopter';
        const altitude = point.y - ground(point.x, point.z);
        const enabled = rain > .05 && point.distanceToSquared(eye) < 45 ** 2 && v.root.visible && (helicopter ? spinning && altitude < 7 : speed > 1 && altitude < 1.5 && speed < 70);
        if (!enabled) { v.spray = 0; continue; }
        v.spray += step * rain * (reduced ? 3 : 12) * (helicopter ? Math.max(0, 1 - altitude / 7) : Math.min(1, speed / 7));
        // Bounded emissions even after a teleport or a slow frame.
        let count = 0;
        while (v.spray >= 1 && count++ < 2) {
          v.spray -= 1;
          const phase = Math.floor((v.root.userData.rainSprayPhase ?? 0) + 1); v.root.userData.rainSprayPhase = phase;
          if (helicopter) {
            const a = phase * 2.39996, r = 1.5 + (phase % 4) * .45;
            offset.set(Math.cos(a), 0, Math.sin(a)); point.copy(v.previous).addScaledVector(offset, r); point.y = ground(point.x, point.z) + .035;
            emit(point, { strength: .9, velocity: offset.multiplyScalar(2.6), sprayOnly: true });
          } else {
            const side = phase % 2 ? -1 : 1;
            point.set(side * 1.15, 0, phase % 4 < 2 ? -1.45 : 1.45).applyMatrix4(v.root.matrixWorld); point.y = ground(point.x, point.z) + .035;
            offset.set(side * .9, 0, 0).transformDirection(v.root.matrixWorld).multiplyScalar(1.2).addScaledVector(v.velocity, -.12);
            emit(point, { strength: .7 + Math.min(speed, 15) * .035, velocity: offset, normal: up, sprayOnly: true });
          }
        }
      }
    },
    dispose() { vehicles.clear(); },
  };
}
