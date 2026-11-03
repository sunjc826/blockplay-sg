import * as THREE from 'three';
import type { RegionBounds } from './region-collision';
import type { DeploymentPoint } from './expedition-deployment';

export interface DeploymentMarker { id: string; x: number; y: number; visible: boolean }

// A long lens keeps towers composed; a small oblique angle reveals their sides.
export const OVERVIEW_FOV = 38;
export interface OverviewLook { x: number; y: number }
const neutral = { x: 0, y: 0 };
const angles = (look: OverviewLook) => ({ tilt: THREE.MathUtils.degToRad(22 + look.y * 1.5), yaw: THREE.MathUtils.degToRad(look.x * 2) });

/** Fit the district's volume into the unobscured area throughout the cursor orbit.
 * Distance is independent of the cursor, so parallax never pumps the zoom. */
export function overviewFrame(bounds: RegionBounds, width: number, height: number, highest: number, zoom = 1, pan = { x: 0, z: 0 }, look: OverviewLook = neutral) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const side = w > 700 && h < 500 ? 300 : 0;
  const bottom = side ? 30 : w < 600 ? 200 : 165, top = side ? 100 : 145;
  const availableW = Math.max(80, w - 100 - side), availableH = Math.max(80, h - top - bottom);
  const pixel = 2 * Math.tan(THREE.MathUtils.degToRad(OVERVIEW_FOV / 2)) / h;
  const shiftX = side / 2 * pixel, shiftUp = (top - bottom) / 2 * pixel;
  const halfX = (bounds.maxX - bounds.minX) * .54, halfZ = (bounds.maxZ - bounds.minZ) * .54;
  let distance = highest + 100;
  // Project all eight volume corners analytically at the orbit limits. These
  // asymmetric limits reserve actual space for the header and deployment dock.
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
    const { tilt, yaw } = angles({ x, y }), st = Math.sin(tilt), ct = Math.cos(tilt), sy = Math.sin(yaw), cy = Math.cos(yaw);
    for (const px of [-halfX, halfX]) for (const pz of [-halfZ, halfZ]) for (const py of [0, highest]) {
      const right = px * cy - pz * sy;
      const up = -px * sy * ct + py * st - pz * cy * ct;
      const depth = px * sy * st + py * ct + pz * cy * st;
      for (const sign of [-1, 1]) {
        const limitX = sign * availableW / 2 * pixel - shiftX;
        const limitUp = sign * availableH / 2 * pixel - shiftUp;
        distance = Math.max(distance, (right + limitX * depth) / (limitX + shiftX), (up + limitUp * depth) / (limitUp + shiftUp));
      }
    }
  }
  distance = Math.max(highest + 100, distance / zoom);
  const { tilt, yaw } = angles(look), st = Math.sin(tilt), ct = Math.cos(tilt), sy = Math.sin(yaw), cy = Math.cos(yaw);
  const metresPerPixel = distance * pixel;
  return {
    x: (bounds.minX + bounds.maxX) / 2 + pan.x + distance * (sy * st + shiftX * cy - shiftUp * sy * ct),
    y: distance * (ct + shiftUp * st),
    z: (bounds.minZ + bounds.maxZ) / 2 + pan.z + distance * (cy * st - shiftX * sy - shiftUp * cy * ct),
    pitch: -Math.PI / 2 + tilt, yaw, fov: OVERVIEW_FOV,
    far: distance + highest + Math.hypot(halfX, halfZ) + 800, metresPerPixel,
  };
}

/** Ground-plane grabs preserve the point under the pointer in a tilted view. */
export function overviewPanDelta(camera: THREE.Camera, width: number, height: number, from: { x: number; y: number }, to: { x: number; y: number }) {
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ground = (point: { x: number; y: number }) => {
    ray.setFromCamera(new THREE.Vector2(point.x / width * 2 - 1, 1 - point.y / height * 2), camera);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  };
  const a = ground(from), b = ground(to);
  return a && b ? { x: a.x - b.x, z: a.z - b.z } : { x: 0, z: 0 };
}

export function deploymentMarkers(points: readonly DeploymentPoint[], camera: THREE.Camera): DeploymentMarker[] {
  const projected = new THREE.Vector3();
  return points.map(point => {
    projected.set(point.x, .4, point.z).project(camera);
    return { id: point.id, x: (projected.x + 1) * 50, y: (1 - projected.y) * 50,
      visible: projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .94 && Math.abs(projected.y) < .96 };
  });
}

/** Ground rings belong to the district scene, not a separate map diagram. */
export function createDeploymentOverview(scene: THREE.Scene, points: readonly DeploymentPoint[]) {
  const root = new THREE.Group(); root.userData.fpsEffect = true; root.visible = false; scene.add(root);
  const geometry = new THREE.RingGeometry(5, 6.5, 48);
  const rings = points.map(point => {
    const material = new THREE.MeshBasicMaterial({ color: '#8fe0ed', transparent: true, opacity: .8, depthTest: false, depthWrite: false });
    const ring = new THREE.Mesh(geometry, material); ring.rotation.x = -Math.PI / 2; ring.position.set(point.x, .3, point.z); ring.renderOrder = 100;
    root.add(ring); return { point, ring, material };
  });
  return {
    update(visible: boolean, choice: string) {
      root.visible = visible;
      for (const { point, ring, material } of rings) {
        const selected = choice === point.id;
        material.color.set(selected ? '#ffdc85' : '#8fe0ed'); ring.scale.setScalar(selected ? 1.35 : 1);
      }
    },
    dispose() { root.removeFromParent(); geometry.dispose(); rings.forEach(r => r.material.dispose()); },
  };
}
