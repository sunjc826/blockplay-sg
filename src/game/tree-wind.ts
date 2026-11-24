import * as THREE from 'three';
import { foliageDeclarations, foliageTreeShake, foliageUniforms } from './foliage-disturbance';
import { inheritLeafShade, shadeLeaves } from './leaf-shading';
import { cutLeafCards, hasLeafCards, inheritLeafCards, leafMassGeometry } from './leaf-cards';

interface TreePart { root: THREE.Vector3; height: number; flutter: number }
interface WindState { time: { value: number }; strength: { value: number }; flutter: { value: number }; foliage: ReturnType<typeof foliageUniforms> }
const materialWind = new WeakMap<THREE.Material, WindState>();
const states = new WeakMap<THREE.Scene, WindState>();
function state(scene: THREE.Scene) {
  let value = states.get(scene);
  if (!value) { value = { time: { value: 0 }, strength: { value: .018 }, flutter: { value: 1 }, foliage: foliageUniforms(scene) }; states.set(scene, value); }
  return value;
}

/** Explicit tree parts only: wood furniture, green roofs and planted buildings stay rigid. */
export function treePart<T extends THREE.Mesh>(mesh: T, x: number, base: number, z: number, height: number, flutter = 0): T {
  mesh.userData.treePart = { root: new THREE.Vector3(x, base, z), height, flutter } satisfies TreePart;
  return mesh;
}
export function animateTrees(scene: THREE.Scene, time: number) { state(scene).time.value = time; }
/** The clock the trees' gust fronts run on, for effects that should meet the same fronts. */
export const treeWindTime = (scene: THREE.Scene) => state(scene).time.value;
export function setTreeWeather(scene: THREE.Scene, wind: number, reduced: boolean) {
  const uniforms = state(scene);
  uniforms.strength.value = (.018 + Math.min(7, Math.max(0, wind)) * .025) * (reduced ? .12 : 1);
  uniforms.flutter.value = reduced ? 0 : 1;
}

const declarations = /* glsl */`
#define TREE_WIND
uniform float treeTime, treeStrength, treeRustle;
attribute vec4 treeRootHeight;
attribute float treeFlutter;
` + foliageDeclarations;
const deformation = /* glsl */`
// Bend in the parent frame, then invert the orthogonal instance transform.
// This keeps each root fixed even on slopes and under non-uniform scales.
vec3 treePoint = (instanceMatrix * vec4(transformed, 1.0)).xyz;
float treeHeight = treeRootHeight.w;
float treeLevel = clamp((treePoint.y - treeRootHeight.y) / treeHeight, 0.0, 1.35);
float treePhase = dot(treeRootHeight.xz, vec2(.173, .291));
// Gusts travel downwind as fronts (about 7 m/s), so neighbouring trees lean
// one after another instead of each on its own clock. Same mean as before.
float treeFront = dot(treeRootHeight.xz, vec2(.984, .177)) - treeTime * 7.0;
float treeWave = .5 + .5 * sin(treeFront * .045 + 1.5 * sin(treeFront * .017 + treeTime * .11));
float treeGust = .55 + .45 * treeWave * treeWave * treeWave + .08 * sin(treeTime * .73 + treePhase * .19);
float treeSway = .48 + .38 * sin(treeTime * 1.35 + treePhase) + .14 * sin(treeTime * 2.31 + treePhase * 1.7);
float treeBend = treeHeight * treeLevel * treeLevel * treeStrength * treeGust * treeSway;
vec3 treeOffset = vec3(treeBend, 0.0, treeBend * .18);
// Fine, spatially varying leaf flutter sits on top of coherent branch sway.
float treeRipple = sin(treeTime * 8.3 + dot(treePoint, vec3(2.7, 1.3, 3.1)))
                 + .45 * sin(treeTime * 13.7 + dot(treePoint, vec3(-3.1, 2.4, 1.7)));
float treeTip = clamp(length(treePoint.xz - treeRootHeight.xz) / 4.0, .1, 1.0);
treeOffset += vec3(.35, .7, .5) * treeRipple * treeFlutter * treeTip * treeStrength * treeRustle * (.5 + treeWave);
// No two trees stand quite plumb: a fixed lean of up to 3.5% of the height, the same for every part of a tree.
float treeLean = treePhase * 7.0;
treeOffset.xz += vec2(cos(treeLean), sin(treeLean)) * treeHeight * treeLevel * treeLevel * .035 * fract(sin(treePhase * 12.9898) * 43758.5453);
` + foliageTreeShake + /* glsl */`
transformed += vec3(dot(treeOffset, instanceMatrix[0].xyz) / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz),
                    dot(treeOffset, instanceMatrix[1].xyz) / dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz),
                    dot(treeOffset, instanceMatrix[2].xyz) / dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz));
`;
const fract = (value: number) => value - Math.floor(value);
/**
 * No two trees are the same green. A tint per tree from where it stands (so a district builds the same
 * every time): lighter or darker, and a little towards yellow or towards blue; each crown part then
 * differs slightly from its neighbours, which gives a crown of identical blobs some depth. Trunks only
 * vary in value. Multiplies the material's colour through the instance colour.
 */
export function treeTint(x: number, z: number, part: number, leaf: boolean, out = new THREE.Color()) {
  const tone = fract(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453), warm = fract(Math.sin(x * 39.346 + z * 11.135) * 24634.6345);
  const piece = fract(Math.sin(part * 91.17 + x * 3.7 + z * 5.3) * 15731.743);
  if (!leaf) return out.setScalar(.88 + .22 * tone);
  const value = .82 + .3 * tone + .1 * (piece - .5);
  return out.setRGB(value * (1 + .16 * (warm - .5)), value * (1 + .04 * (warm - .5)), value * (1 - .3 * (warm - .5)));
}

/** Preserve the deformation when thermal vision substitutes its temperature shader. */
export function inheritTreeWind(source: THREE.Material, target: THREE.Material) {
  const uniforms = materialWind.get(source);
  if (uniforms) patch(target, uniforms);
}
function patch(material: THREE.Material, uniforms: WindState) {
  materialWind.set(material, uniforms);
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    Object.assign(shader.uniforms, { treeTime: uniforms.time, treeStrength: uniforms.strength, treeRustle: uniforms.flutter }, uniforms.foliage);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + declarations)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + deformation);
  };
  material.customProgramCacheKey = function() { return key.call(this) + '|tree-wind-v4'; };
}

/** A rounded crown shape: what a tree without a modelled species carries on its trunk. */
const isCrownShape = (part: THREE.Mesh) => (part.userData.treePart as TreePart).flutter > 0 && part.geometry.type === 'IcosahedronGeometry';
/**
 * Keep trees instanced, with one root/height per part. The scene builder owns all returned resources.
 *
 * A rounded crown shape is drawn as a mass of leaf sprays (leaf-cards.ts) the size of the shape. The shape
 * itself stays in the scene, undrawn, as what a line of sight or a round meets, so cover is as it was built;
 * the sprays are marked `coverApart`.
 */
export function batchTrees(scene: THREE.Scene, trackGeometry: (g: THREE.BufferGeometry) => unknown, trackMaterial: (m: THREE.Material) => unknown) {
  const groups = new Map<string, THREE.Mesh[]>(), batches: THREE.InstancedMesh[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.userData.treePart || Array.isArray(object.material)) return;
    const key = [object.parent!.id, object.geometry.id, object.material.id, object.castShadow, object.receiveShadow].join(':');
    const group = groups.get(key) ?? []; group.push(object); groups.set(key, group);
  });
  const materials = new Map<THREE.Material, THREE.Material>(), leafy = new Map<THREE.Material, THREE.Material>(), hidden = new Map<THREE.Material, THREE.Material>(), uniforms = state(scene);
  const turn = new THREE.Matrix4(), placed = new THREE.Matrix4();
  /** One instanced, wind-bent mesh of `shape` for every part; `sprays` turns each about its own upright by where it stands. */
  const instance = (parts: THREE.Mesh[], shape: THREE.BufferGeometry, material: THREE.Material, sprays: boolean) => {
    const first = parts[0], geometry = shape.clone(); trackGeometry(geometry);
    const roots = new Float32Array(parts.length * 4), flutter = new Float32Array(parts.length);
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    const tint = new THREE.Color(); let padding = 0;
    parts.forEach((part, i) => {
      const tree = part.userData.treePart as TreePart;
      roots.set([tree.root.x, tree.root.y, tree.root.z, tree.height], i * 4); flutter[i] = tree.flutter;
      padding = Math.max(padding, tree.height * .4 + .6);
      part.updateMatrix(); placed.copy(part.matrix);
      if (sprays) placed.multiply(turn.makeRotationY(fract(Math.sin(part.position.x * 12.9898 + part.position.z * 78.233 + part.position.y * 37.719) * 43758.5453) * Math.PI * 2));
      mesh.setMatrixAt(i, placed); mesh.setColorAt(i, treeTint(tree.root.x, tree.root.z, i, tree.flutter > 0, tint));
    });
    geometry.setAttribute('treeRootHeight', new THREE.InstancedBufferAttribute(roots, 4));
    geometry.setAttribute('treeFlutter', new THREE.InstancedBufferAttribute(flutter, 1));
    // Match both sun shadows and point-light shadows to the visible canopy.
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: material.side });
    mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({ side: material.side });
    // A crown cut into leaves (leaf-cards.ts) casts a shadow of leaves.
    for (const shadow of [mesh.customDepthMaterial, mesh.customDistanceMaterial]) { if (hasLeafCards(material)) cutLeafCards(shadow); patch(shadow, uniforms); trackMaterial(shadow); }
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    mesh.boundingBox!.expandByScalar(padding); mesh.boundingSphere!.radius += padding;
    return mesh;
  };
  const inherit = (source: THREE.Material) => { const copy = source.clone(); copy.onBeforeCompile = source.onBeforeCompile; copy.customProgramCacheKey = source.customProgramCacheKey; return copy; };
  for (const parts of groups.values()) {
    const first = parts[0], source = first.material as THREE.Material, parent = first.parent!;
    if (isCrownShape(first)) {
      // The shape, kept for cover and never drawn. It carries the source's own notes (foliage, impact surface).
      let cover = hidden.get(source);
      if (!cover) { cover = new THREE.MeshBasicMaterial({ name: 'tree crown cover', colorWrite: false, depthWrite: false }); cover.visible = false; cover.userData = source.userData; hidden.set(source, cover); trackMaterial(cover); }
      const shape = new THREE.InstancedMesh(first.geometry, cover, parts.length);
      shape.name = 'Tree crown cover'; shape.userData.visualCover = first.userData.visualCover ?? source.userData.visualCover ?? false;
      parts.forEach((part, i) => { part.updateMatrix(); shape.setMatrixAt(i, part.matrix); });
      shape.computeBoundingBox(); shape.computeBoundingSphere(); parent.add(shape); batches.push(shape);
      // The sprays, in the crown's own colour, lit from both sides as thin leaves.
      let material = leafy.get(source);
      if (!material) {
        material = inherit(source); material.side = THREE.DoubleSide; material.vertexColors = true;
        cutLeafCards(material); patch(material, uniforms); shadeLeaves(material, { thin: true, transmit: .35 });
        leafy.set(source, material); trackMaterial(material);
      }
      const mesh = instance(parts, leafMassGeometry(), material, true);
      mesh.name = 'Wind-animated leaves'; mesh.castShadow = first.castShadow; mesh.userData.coverApart = true;
      // Nothing strikes the sprays: a ray meets the shape they stand for, here and in the simulation's copy.
      mesh.raycast = () => {};
      parts.forEach(part => parent.remove(part)); parent.add(mesh); batches.push(mesh);
      continue;
    }
    let material = materials.get(source);
    if (!material) {
      material = inherit(source);
      inheritLeafShade(source, material); inheritLeafCards(source, material); patch(material, uniforms);
      // Crowns and fronds pass light through (leaf-shading.ts); trunks and branches do not.
      if (parts.some(part => (part.userData.treePart as TreePart).flutter > 0)) shadeLeaves(material);
      materials.set(source, material); trackMaterial(material);
    }
    const mesh = instance(parts, first.geometry, material, false);
    mesh.name = 'Wind-animated trees';
    mesh.userData.visualCover = first.userData.visualCover ?? source.userData.visualCover ?? false;
    parts.forEach(part => parent.remove(part)); parent.add(mesh); batches.push(mesh);
  }
  return batches;
}
