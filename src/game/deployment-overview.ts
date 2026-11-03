import * as THREE from 'three';
import type { RegionBounds } from './region-collision';
import type { DeploymentPoint } from './expedition-deployment';

export interface DeploymentMarker { id: string; x: number; y: number; visible: boolean }

// A long lens keeps towers composed; a small oblique angle reveals their sides.
export const OVERVIEW_FOV = 38;
export const WORLD_CAMERA_NEAR = .08;
/** Spend depth precision on the district, rather than the empty air ahead of
 * an aerial camera. Half the clearance leaves roofs safely beyond the near
 * plane, including the oblique frustum; return to close detail below the roofs. */
export function aerialNearPlane(height: number, highest: number) {
  return Math.max(WORLD_CAMERA_NEAR, (height - highest) / 2);
}
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
  const cameraHeight = distance * (ct + shiftUp * st);
  return {
    x: (bounds.minX + bounds.maxX) / 2 + pan.x + distance * (sy * st + shiftX * cy - shiftUp * sy * ct),
    y: cameraHeight,
    z: (bounds.minZ + bounds.maxZ) / 2 + pan.z + distance * (cy * st - shiftX * sy - shiftUp * cy * ct),
    pitch: -Math.PI / 2 + tilt, yaw, fov: OVERVIEW_FOV,
    near: aerialNearPlane(cameraHeight, highest),
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
    projected.set(point.x, (point.y ?? 0) + .4, point.z).project(camera);
    return { id: point.id, x: (projected.x + 1) * 50, y: (1 - projected.y) * 50,
      visible: projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .94 && Math.abs(projected.y) < .96 };
  });
}

/** Translucent columns mark real world locations without obscuring the district. */
export function createDeploymentOverview(scene: THREE.Scene, initial: readonly DeploymentPoint[]) {
  const root = new THREE.Group(); root.userData.fpsEffect = true; root.visible = false; scene.add(root);
  const ringGeometry = new THREE.RingGeometry(4.5, 5.1, 48);
  const beamGeometry = new THREE.CylinderGeometry(7, 3, 260, 24, 1, true);
  const markers = new Map<string, { group: THREE.Group; ring: THREE.MeshBasicMaterial; beam: THREE.ShaderMaterial }>();
  return {
    update(visible: boolean, choice: string, points: readonly DeploymentPoint[] = initial) {
      root.visible = visible;
      if (!visible) return;
      const ids = new Set(points.map(p => p.id));
      for (const [id, marker] of markers) if (!ids.has(id)) { marker.group.removeFromParent(); marker.ring.dispose(); marker.beam.dispose(); markers.delete(id); }
      for (const point of points) {
        let marker = markers.get(point.id);
        if (!marker) {
          const group = new THREE.Group(); root.add(group);
          const ring = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
          const base = new THREE.Mesh(ringGeometry, ring); base.rotation.x = -Math.PI / 2; base.position.y = .3; base.renderOrder = 100; group.add(base);
          const beam = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
            uniforms: { color: { value: new THREE.Color() }, opacity: { value: .22 } },
            vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader: 'varying vec2 vUv; uniform vec3 color; uniform float opacity; void main(){float fade=pow(1.-vUv.y,1.5);gl_FragColor=vec4(color,opacity*fade);}',
          });
          const column = new THREE.Mesh(beamGeometry, beam); column.position.y = 130; group.add(column);
          marker = { group, ring, beam }; markers.set(point.id, marker);
        }
        const available = point.available !== false, selected = available && choice === point.id;
        const color = !available ? '#829298' : selected ? '#ffdc85' : '#8fe0ed';
        marker.group.position.set(point.x, point.y ?? 0, point.z);
        marker.ring.color.set(color); marker.ring.opacity = available ? .9 : .32;
        marker.beam.blending = available ? THREE.AdditiveBlending : THREE.NormalBlending;
        marker.beam.uniforms.color.value.set(color); marker.beam.uniforms.opacity.value = selected ? .48 : available ? .32 : .18;
      }
    },
    dispose() { root.removeFromParent(); ringGeometry.dispose(); beamGeometry.dispose(); for (const marker of markers.values()) { marker.ring.dispose(); marker.beam.dispose(); } markers.clear(); },
  };
}
