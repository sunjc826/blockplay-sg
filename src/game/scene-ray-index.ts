import * as THREE from 'three';
import { createRayBoundsTree, hasBoundedRaycast, padRayBounds } from './ray-bounds-tree';

type Position = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
const version = (attribute: Position) => !attribute ? -1 : attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;
const usage = (attribute: Position) => attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.usage : attribute.usage;
interface Entry {
  mesh: THREE.Mesh; order: number; box: THREE.Box3; local: THREE.Box3; matrix: THREE.Matrix4;
  geometry: THREE.BufferGeometry; position: Position; positionVersion: number;
  instances?: THREE.InstancedBufferAttribute; instanceVersion?: number; count?: number;
  indexed: boolean; raycast: THREE.Mesh['raycast'];
}
function indexable(mesh: THREE.Mesh) {
  const position = mesh.geometry.getAttribute('position');
  return mesh.children.length === 0 && !(mesh as THREE.SkinnedMesh).isSkinnedMesh
    && !mesh.morphTargetInfluences?.length && !mesh.geometry.morphAttributes.position?.length
    && position && usage(position) === THREE.StaticDrawUsage && hasBoundedRaycast(mesh);
}

/** Index scene-cover meshes above their existing triangle/instance accelerators.
 * World matrices are read, never advanced here: rendering/scene refresh owns them.
 * Moving bounds are refitted for every query, never cached as a clear-path answer.
 */
export function createSceneRayIndex() {
  let entries: Entry[] = [], tree = createRayBoundsTree<Entry>([]);
  const selected: Entry[] = [], result: THREE.Mesh[] = [];
  const instanceMatrix = new THREE.Matrix4(), instanceBox = new THREE.Box3();
  const bounds = (entry: Entry) => {
    const { mesh } = entry, position = mesh.geometry.getAttribute('position');
    entry.geometry = mesh.geometry; entry.position = position; entry.positionVersion = version(position);
    // Compute private bounds rather than modifying native raycast bounding boxes.
    entry.local.setFromBufferAttribute(position as THREE.BufferAttribute);
    const instanced = mesh as THREE.InstancedMesh;
    entry.instances = instanced.isInstancedMesh ? instanced.instanceMatrix : undefined;
    entry.instanceVersion = entry.instances?.version; entry.count = instanced.isInstancedMesh ? instanced.count : undefined;
    if (instanced.isInstancedMesh) {
      instanceBox.copy(entry.local); entry.local.makeEmpty();
      const transformed = new THREE.Box3();
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, instanceMatrix);
        entry.local.union(transformed.copy(instanceBox).applyMatrix4(instanceMatrix));
      }
    }
    entry.matrix.copy(mesh.matrixWorld);
    padRayBounds(entry.box.copy(entry.local).applyMatrix4(entry.matrix));
  };
  return {
    setObjects(objects: readonly THREE.Mesh[]) {
      if (objects.length === entries.length && objects.every((mesh, i) => mesh === entries[i].mesh)) return;
      entries = objects.map((mesh, order) => {
        const entry: Entry = { mesh, order, box: new THREE.Box3(), local: new THREE.Box3(), matrix: new THREE.Matrix4(), geometry: mesh.geometry, position: mesh.geometry.getAttribute('position'), positionVersion: -1, indexed: !!indexable(mesh), raycast: mesh.raycast };
        if (entry.indexed) bounds(entry);
        return entry;
      });
      tree = createRayBoundsTree(entries.filter(entry => entry.indexed));
    },
    /** Reuses the result array; consume it before the next query. */
    candidates(ray: THREE.Raycaster) {
      selected.length = 0; result.length = 0;
      for (const entry of entries) {
        const { mesh } = entry;
        if (!entry.indexed) { selected.push(entry); continue; }
        const position = mesh.geometry.getAttribute('position'), instanced = mesh as THREE.InstancedMesh;
        const geometryChanged = entry.geometry !== mesh.geometry || entry.position !== position || entry.positionVersion !== version(position);
        // Immutable geometry/raycast eligibility was established when inserted.
        // Revalidate custom accelerators only when their source or callback changes.
        if (!position || mesh.children.length || mesh.morphTargetInfluences?.length || mesh.geometry.morphAttributes.position?.length
          || usage(position) !== THREE.StaticDrawUsage || ((geometryChanged || entry.raycast !== mesh.raycast) && !indexable(mesh))) {
          entry.indexed = false; entry.box.makeEmpty(); tree.refit(entry); selected.push(entry); continue;
        }
        if (geometryChanged || entry.instances !== (instanced.isInstancedMesh ? instanced.instanceMatrix : undefined)
          || entry.instanceVersion !== entry.instances?.version || entry.count !== (instanced.isInstancedMesh ? instanced.count : undefined)) {
          bounds(entry); tree.refit(entry);
        } else if (!entry.matrix.equals(mesh.matrixWorld)) {
          entry.matrix.copy(mesh.matrixWorld);
          padRayBounds(entry.box.copy(entry.local).applyMatrix4(entry.matrix)); tree.refit(entry);
        }
        entry.raycast = mesh.raycast;
      }
      tree.query(ray.ray, selected, ray.far);
      selected.sort((a, b) => a.order - b.order);
      for (const entry of selected) result.push(entry.mesh);
      return result;
    },
  };
}
