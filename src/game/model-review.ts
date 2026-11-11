import * as THREE from 'three';
import type { ReviewAnchor, ReviewSurface } from './level-review';

export function modelMeshPath(root: THREE.Object3D, object: THREE.Object3D): number[] | null {
  const path: number[] = [];
  while (object !== root) { if (!object.parent) return null; path.unshift(object.parent.children.indexOf(object)); object = object.parent; }
  return path;
}
export function modelSurfaceObject(root: THREE.Object3D, path: readonly number[]) {
  let object: THREE.Object3D | undefined = root;
  for (const index of path) object = object?.children[index];
  return object instanceof THREE.Mesh ? object : null;
}
export function modelAnchorWorld(root: THREE.Object3D, anchor: ReviewAnchor): THREE.Vector3 | null {
  if (!anchor.surface) return null;
  const object = modelSurfaceObject(root, anchor.surface.meshPath);
  if (!object) return null;
  object.updateWorldMatrix(true, false);
  return object.localToWorld(new THREE.Vector3(anchor.x, anchor.surface.y, anchor.z));
}
export function pickModelAnchor(root: THREE.Object3D, camera: THREE.Camera, ndc: THREE.Vector2, view: ReviewSurface['view']): ReviewAnchor | null {
  root.updateWorldMatrix(true, true); camera.updateMatrixWorld();
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(root, true).find(hit => {
    let object: THREE.Object3D | null = hit.object;
    while (object) { if (!object.visible) return false; object = object.parent; } return true;
  });
  if (!hit) return null;
  const path = modelMeshPath(root, hit.object); if (!path) return null;
  const point = hit.object.worldToLocal(hit.point.clone());
  const mesh = hit.object as THREE.Mesh;
  const material = Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material;
  const label = (hit.object.name || material?.name || `Surface ${path.join('.') || 'root'}`).slice(0, 100);
  return { x: point.x, z: point.z, level: label, surface: { y: point.y, meshPath: path, view: { ...view, ...(view.pan ? { pan: { ...view.pan } } : {}) } } };
}
/** Geometry, local transforms and material settings; never transient UUIDs or camera state. */
export function modelRevision(root: THREE.Object3D) {
  let hash = 2166136261;
  const add = (value: string) => { for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619); };
  root.traverse(object => {
    object.updateMatrix(); add(JSON.stringify([modelMeshPath(root, object), object.type, object.name, object.visible, object.matrix.elements]));
    if (object instanceof THREE.Mesh) {
      for (const name of Object.keys(object.geometry.attributes).sort()) {
        const a = object.geometry.getAttribute(name); add(name); add(String(a.itemSize));
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) add(`${a.getComponent(i, k)},`);
      }
      const index = object.geometry.index; if (index) for (let i = 0; i < index.count; i++) add(`${index.getX(i)},`);
      add(JSON.stringify(object.geometry.groups));
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const m = material as THREE.MeshStandardMaterial;
        add(JSON.stringify([m.type, m.name, m.color?.getHex(), m.opacity, m.transparent, m.side, m.roughness, m.metalness]));
      }
    }
  });
  return `model-${(hash >>> 0).toString(16)}`;
}
