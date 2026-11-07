import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Sun shadows draw every caster separately, and a vehicle is a hundred or so
 * small meshes (cab trim, wheel treads, rods). This merges the solid parts of
 * each rigid piece of a model into one shadow-only mesh, so the shadow pass
 * draws a piece in one call with the same outline, interior included.
 *
 * A piece is the model root plus every group named in `moving`: wheels, rotors,
 * a turret, a steering wheel. Each gets its own stand-in as a child, so it
 * turns, spins and hides with the piece. A moving mesh (a gauge needle) keeps
 * casting itself. Parts are merged as they are when this runs, so anything
 * that moves or hides on its own must be named in `moving`.
 *
 * The stand-in draws no triangles outside the shadow pass: its draw range
 * opens only inside `onBeforeShadow`. Passes that swap materials (ambient
 * occlusion, thermal, the sight reflection) therefore never show it, and
 * raycasts ignore it. The merged originals keep drawing in the main view and
 * are marked `noShadowCast`, which the sun-shadow scan honours.
 */
export const SHADOW_PROXY = 'shadow-proxy';

/** Parts that throw sun shadows today: opaque lit meshes (see fps-sun-shadows). */
function casts(mesh: THREE.Mesh) {
  if (mesh.userData.fpsEffect || mesh.userData.noShadowCast || !mesh.visible) return false;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every(m => m.visible && !m.transparent && !(m instanceof THREE.MeshBasicMaterial) && !(m instanceof THREE.ShaderMaterial));
}

/** The face three's shadow pass draws for this material. */
function shadowSideOf(material: THREE.Material): THREE.Side {
  if (material.shadowSide !== null && material.shadowSide !== undefined) return material.shadowSide;
  return material.side === THREE.FrontSide ? THREE.BackSide : material.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide;
}

export function addShadowProxies(root: THREE.Object3D, moving: ReadonlySet<string>) {
  const pieces = new Set<THREE.Object3D>([root]), movingMeshes = new Set<THREE.Object3D>();
  root.traverse(node => {
    if (node === root || !moving.has(node.name)) return;
    if ((node as THREE.Mesh).isMesh) movingMeshes.add(node); else pieces.add(node);
  });
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Object3D, Map<THREE.Side, THREE.BufferGeometry[]>>();
  const inverse = new THREE.Matrix4(), local = new THREE.Matrix4();
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.shadowProxy || !casts(mesh)) return;
    // Find the piece this part rides on; skip parts under a moving mesh or a hidden group.
    let piece: THREE.Object3D | null = mesh.parent;
    for (let n = mesh as THREE.Object3D | null; n && !pieces.has(n); n = n.parent) {
      if (movingMeshes.has(n) || (n !== mesh && !n.visible)) return;
      piece = n.parent;
    }
    if (!piece) return;
    const source = mesh.geometry, position = source.getAttribute('position');
    // Only plain, fully drawn geometry merges like for like.
    if (!position || source.drawRange.start !== 0 || source.drawRange.count !== Infinity || source.morphAttributes.position) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
    if (Array.isArray(mesh.material) && new Set(mesh.material.map(shadowSideOf)).size > 1) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', position.clone());
    geometry.setIndex(source.index ? source.index.clone() : Array.from({ length: position.count }, (_, i) => i));
    local.multiplyMatrices(inverse.copy(piece.matrixWorld).invert(), mesh.matrixWorld);
    geometry.applyMatrix4(local);
    const side = shadowSideOf(material);
    const sides = groups.get(piece) ?? new Map<THREE.Side, THREE.BufferGeometry[]>(); groups.set(piece, sides);
    const list = sides.get(side) ?? []; sides.set(side, list); list.push(geometry);
    mesh.userData.noShadowCast = true; mesh.castShadow = false;
  });
  const proxies: THREE.Mesh[] = [];
  for (const [piece, sides] of groups) for (const [side, parts] of sides) {
    const merged = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());
    if (!merged) throw new Error('shadow proxy: parts did not merge');
    merged.computeBoundingSphere(); merged.computeBoundingBox();
    const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    material.shadowSide = side;
    const proxy = new THREE.Mesh(merged, material);
    proxy.name = SHADOW_PROXY; proxy.castShadow = true; proxy.receiveShadow = false;
    proxy.userData.shadowProxy = true;
    proxy.raycast = THREE.Object3D.prototype.raycast;
    merged.setDrawRange(0, 0);
    proxy.onBeforeShadow = () => { merged.setDrawRange(0, Infinity); };
    proxy.onAfterShadow = () => { merged.setDrawRange(0, 0); };
    piece.add(proxy); proxies.push(proxy);
  }
  return proxies;
}
