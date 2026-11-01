import * as THREE from 'three';
import { seatLocalPoint } from './vehicle-seats';
import type { VehicleState } from './vehicle-rules';

/** Camera placement depends on the seat, never on who has permission to fire. */
export function placeVehicleFirstPersonCamera(camera: THREE.Camera, model: THREE.Object3D, v: VehicleState, seat: number, yaw: number, pitch: number) {
  const local = seatLocalPoint(v.kind, seat);
  model.updateMatrixWorld(true);
  camera.position.copy(model.localToWorld(new THREE.Vector3(local.x, local.y, local.z)));
  if (v.kind === 'helicopter' && seat === 0) {
    // Apply pilot look around world up before pitching the view. Rotating look
    // inside the pitched hull turns a retained side look into a bank on W.
    const hull = new THREE.Euler().setFromQuaternion(model.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    camera.rotation.set(hull.x + pitch, hull.y + yaw - v.yaw, hull.z, 'YXZ');
    return;
  }
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw - v.yaw, 0, 'YXZ')).premultiply(model.getWorldQuaternion(new THREE.Quaternion()));
}
