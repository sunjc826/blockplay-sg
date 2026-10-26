import * as THREE from 'three';

/**
 * Three keeps one compiled program per material and swaps it when the next
 * object drawn with that material differs in kind: instanced or not, with
 * per-instance colours or not. District builders batch repeated meshes into
 * InstancedMeshes but leave single ones as plain meshes on the same material,
 * so that material changed program on every draw that alternated, rebuilding
 * its shader key each time (a dozen times a frame, and the garbage with it).
 *
 * This gives each kind of user its own copy of a shared material. The copies
 * compile to the very programs the shared one switched between, so nothing
 * new is compiled. Run it before anything patches the world's materials.
 */
export function separateInstancedMaterials(root: THREE.Object3D) {
  const kinds = new Map<THREE.Material, Set<string>>();
  const kindOf = (mesh: THREE.Mesh) => (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).instanceColor ? 'instanced-colour' : 'instanced' : 'plain';
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    meshes.push(mesh);
    for (const material of [mesh.material].flat()) {
      if (!kinds.has(material)) kinds.set(material, new Set());
      kinds.get(material)!.add(kindOf(mesh));
    }
  });
  const copies = new Map<string, THREE.Material>();
  const copyFor = (material: THREE.Material, kind: string) => {
    const key = `${material.uuid}|${kind}`;
    let copy = copies.get(key);
    if (!copy) {
      copy = material.clone();
      // `clone` leaves shader hooks behind; keep any a builder added.
      copy.onBeforeCompile = material.onBeforeCompile;
      if (Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')) copy.customProgramCacheKey = material.customProgramCacheKey;
      copies.set(key, copy);
    }
    return copy;
  };
  // The original stays with its plain users (or, with none, its plain instanced ones); other kinds get a copy.
  const owner = (material: THREE.Material) => kinds.get(material)!.has('plain') ? 'plain' : 'instanced';
  let separated = 0;
  for (const mesh of meshes) {
    const kind = kindOf(mesh);
    const swap = (material: THREE.Material) => kinds.get(material)!.size > 1 && kind !== owner(material) ? copyFor(material, kind) : material;
    const before = [mesh.material].flat(), after = before.map(swap);
    if (after.every((material, i) => material === before[i])) continue;
    mesh.material = Array.isArray(mesh.material) ? after : after[0];
    separated++;
  }
  return separated;
}
