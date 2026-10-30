import * as THREE from 'three';
import type { RegionBounds } from './region-collision';
import type { DeploymentPoint } from './expedition-deployment';

export interface DeploymentMarker { id: string; x: number; y: number; visible: boolean }

/** North-up camera framing with room above/below for the deployment controls. */
export function overviewFrame(bounds: RegionBounds, width: number, height: number, highest: number, zoom = 1, pan = { x: 0, z: 0 }) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const side = w > 700 && h < 500 ? 300 : 0;
  const bottom = side ? 30 : w < 600 ? 200 : 165, top = side ? 100 : 145;
  const availableW = Math.max(80, w - 100 - side), availableH = Math.max(80, h - top - bottom);
  const scale = Math.max((bounds.maxX - bounds.minX) / availableW, (bounds.maxZ - bounds.minZ) / availableH) * 1.08;
  const y = Math.max(highest * 1.12 + 60, scale * h / (2 * Math.tan(THREE.MathUtils.degToRad(32.5))) / zoom);
  const metresPerPixel = y * 2 * Math.tan(THREE.MathUtils.degToRad(32.5)) / h;
  return { x: (bounds.minX + bounds.maxX) / 2 + side / 2 * metresPerPixel + pan.x, y,
    z: (bounds.minZ + bounds.maxZ) / 2 + (bottom - top) / 2 * metresPerPixel + pan.z,
    far: y + highest + 800, metresPerPixel };
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
