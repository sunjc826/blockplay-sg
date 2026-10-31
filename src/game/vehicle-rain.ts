import * as THREE from 'three';
import type { RainSplashOptions } from './rain-effects';

export interface VehicleRainHit { height: number; object?: THREE.Object3D; normal: THREE.Vector3 }
interface Receiver { mesh: THREE.Mesh; bounds: THREE.Box3 }
interface VehicleRainState {
  root: THREE.Object3D; receivers: Receiver[]; bounds: THREE.Box3;
  previous: THREE.Vector3; velocity: THREE.Vector3; rotor: number; spray: number;
}

/** Cosmetic queries against vehicle exteriors only; never adds gameplay colliders. */
export function createVehicleRain(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const vehicles = new Map<THREE.Object3D, VehicleRainState>();
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), hits: THREE.Intersection[] = [];
  const normalMatrix = new THREE.Matrix3(), point = new THREE.Vector3(), offset = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let scanIn = 0;
  function attached(object: THREE.Object3D) { for (let p: THREE.Object3D | null = object; p; p = p.parent) if (p === scene) return true; return false; }
  return {
    sample(x: number, z: number, hit: VehicleRainHit) {
      for (const v of vehicles.values()) {
        if (!v.root.visible || x < v.bounds.min.x || x > v.bounds.max.x || z < v.bounds.min.z || z > v.bounds.max.z || v.bounds.max.y <= hit.height) continue;
        ray.set(point.set(x, v.bounds.max.y + 1, z), down);
        for (const { mesh, bounds } of v.receivers) {
          if (!mesh.visible || x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z || bounds.max.y <= hit.height) continue;
          hits.length = 0; mesh.raycast(ray, hits);
          for (const contact of hits) if (contact.point.y > hit.height && contact.face) {
            hit.height = contact.point.y; hit.object = mesh;
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
          const receivers: Receiver[] = [];
          root.traverse(o => { if (o instanceof THREE.Mesh && o.userData.rainReceiver) receivers.push({ mesh: o, bounds: new THREE.Box3() }); });
          root.updateWorldMatrix(true, false);
          vehicles.set(root, { root, receivers, bounds: new THREE.Box3(), previous: root.getWorldPosition(new THREE.Vector3()), velocity: new THREE.Vector3(), rotor: root.getObjectByName('main-rotor')?.rotation.y ?? 0, spray: 0 });
        }); scanIn = .5;
      }
      for (const v of vehicles.values()) {
        v.root.updateWorldMatrix(true, false); v.root.getWorldPosition(point);
        if (point.distanceToSquared(eye) > 55 ** 2 || !v.root.visible) {
          v.bounds.makeEmpty(); v.previous.copy(point); v.spray = 0;
          v.rotor = v.root.getObjectByName('main-rotor')?.rotation.y ?? 0; continue;
        }
        v.root.updateWorldMatrix(false, true);
        if (step > 0) v.velocity.copy(point).sub(v.previous).divideScalar(step); else v.velocity.set(0, 0, 0);
        v.previous.copy(point); v.bounds.makeEmpty();
        for (const receiver of v.receivers) {
          if (!receiver.mesh.geometry.boundingBox) receiver.mesh.geometry.computeBoundingBox();
          receiver.bounds.copy(receiver.mesh.geometry.boundingBox!).applyMatrix4(receiver.mesh.matrixWorld); v.bounds.union(receiver.bounds);
        }
        const rotor = v.root.getObjectByName('main-rotor'), angle = rotor?.rotation.y ?? 0;
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
