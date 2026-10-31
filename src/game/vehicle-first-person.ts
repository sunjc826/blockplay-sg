import * as THREE from 'three';
import { seatLocalPoint, seatPoint } from './vehicle-seats';
import type { VehicleState } from './vehicle-rules';

export function placeVehicleFirstPersonCamera(camera: THREE.Camera, model: THREE.Object3D, v: VehicleState, seat: number, yaw: number, pitch: number, canFire: boolean) {
  const eye = seatPoint(v, seat);
  if (canFire && v.kind === 'car') {
    eye.x = v.x - Math.sin(v.yaw) * .45; eye.z = v.z - Math.cos(v.yaw) * .45; eye.y = v.y + 2.72;
  }
  camera.position.set(eye.x, eye.y, eye.z); camera.rotation.set(pitch, yaw, 0, 'YXZ');
  if (v.kind === 'helicopter') {
    const local = seatLocalPoint(v.kind, seat);
    model.updateMatrixWorld(true);
    camera.position.copy(model.localToWorld(new THREE.Vector3(local.x, local.y, local.z)));
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw - v.yaw, 0, 'YXZ')).premultiply(model.getWorldQuaternion(new THREE.Quaternion()));
  }
}
