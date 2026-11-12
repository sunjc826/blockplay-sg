import * as THREE from 'three';
import { bailoutRoll } from './bailout-roll';
import { footCycle, footSample, gaitShape, hipsFromFeet, idleWeight, spring, stepSpring, type GaitShape } from './gait-motion';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CamoPattern, PatchLook } from './arena-factions';

/**
 * One articulated humanoid shared by arena soldiers, remote players and
 * expedition locals. Each bone is a single merged, vertex-coloured mesh (about
 * fifteen draw calls a figure); limbs are posed with analytic two-bone IK so
 * feet stay planted on the walk cycle and hands stay on the weapon in any stance.
 * Everything is procedural: there is no clip data to load or keep in sync.
 */
export type CharacterHeadwear = 'helmet' | 'boonie' | 'cap' | 'headscarf' | 'none';
export type CharacterWeapon = 'rifle' | 'marksman' | 'lmg';
export type CharacterGesture = 'idle' | 'clasp' | 'behind' | 'wipe' | 'wave' | 'talk' | 'point' | 'offer';

export interface CharacterLook {
  skin: string; hair: string; top: string; bottom: string; shoes: string;
  /** Horizontal torso scale: about .92 slim to 1.18 heavy. */
  build?: number;
  headwear?: CharacterHeadwear; headwearColor?: string;
  hairStyle?: 'short' | 'long' | 'bald';
  sleeves?: 'long' | 'short'; shorts?: boolean; gloves?: string;
  vest?: string; plates?: boolean; backpack?: string;
  /** Persistent faction silhouette; independent of rank, role and HUD colour. */
  uniform?: 'field' | 'contractor' | 'expeditionary' | 'collective';
  roleKit?: 'rifleman' | 'gunner' | 'marksman' | 'mortar' | 'lancer' | 'wayfinder' | 'bastion' | 'conductor';
  /** Prototype-faction armour panels and insignia, separate from role bands. */
  panel?: string;
  identification?: PatchLook;
  apron?: string; lanyard?: string; towel?: string;
  /** Team or role colour on the sleeves and helmet band. */
  accent?: string;
  /** Printed camouflage on the uniform: shirt and sleeves, trousers too unless `on` is 'top', and the hat when `headwear` is set. */
  camo?: { pattern: CamoPattern; on: 'all' | 'top'; headwear: boolean };
  /** Sewn badges: one on the outside of each upper arm, one on the left breast. */
  patches?: { left?: PatchLook; right?: PatchLook; chest?: PatchLook };
  /** Wraparound shades. */
  eyewear?: string;
  weapon?: CharacterWeapon | null;
}

export interface CharacterDrive {
  /** Seconds since a high-speed bailout, absent outside its short recovery. */
  bailoutAge?: number;
  /** Optional shared local-player footfall phase and sprint blend. */
  gaitPhase?: number; sprint?: number;
  /** Body-local velocity in m/s; -z is forward. */
  velocity?: { x: number; z: number };
  /** Yaw rate in rad/s, so turning on the spot shuffles the feet. */
  turn?: number;
  /** Aim pitch, positive up. */
  pitch?: number;
  crouch?: number; prone?: boolean; seated?: boolean; airborne?: boolean;
  /** Combat slide: seated low on the back hip, the left leg out in front and the right folded under it. */
  slide?: number;
  /** Unarmed surface stroke; the caller positions the body below the waterline. */
  swimming?: boolean;
  /** Seated with hands on the controls rather than the weapon. */
  driving?: boolean;
  /** 0 lowered, 1 shouldered. */
  aim?: number;
  /** Body-local point to look at. */
  lookAt?: THREE.Vector3 | null;
  gesture?: CharacterGesture;
  /**
   * Progress through applying a field dressing, 0 to 1, or absent: the weapon
   * hangs on its sling while the right hand winds a dressing round the left
   * forearm.
   */
  healing?: number;
  /** Host-confirmed water exposure: sustained shielding or intermittent mist wipes. */
  water?: 'cannon' | 'mist';
}

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  weapon: THREE.Group | null;
  muzzle: THREE.Object3D | null;
  joints: Readonly<Record<JointName, THREE.Group>>;
  /** The body's skinned mesh when built with `skinned`, otherwise null. */
  skinned: THREE.SkinnedMesh | null;
  resources: { dispose(): void }[];
  update(dt: number, drive: CharacterDrive): void;
  /**
   * Lets `dt` pass without posing anything: the clocks (breathing, time since
   * going down) advance, the pose stays as it was. For figures nobody can see.
   * The next update() spanning that time does not advance the clocks again.
   */
  age(dt: number): void;
  fire(): void;
  flinch(): void;
  setDown(down: boolean): void;
  readonly down: boolean;
  /** Seconds since setDown(true); 0 when standing. */
  readonly downTime: number;
  dispose(): void;
}

type JointName = 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'upperArmL' | 'forearmL' | 'handL' | 'upperArmR' | 'forearmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR';

export const CHARACTER_DIMENSIONS = {
  thigh: .45, shin: .43, ankle: .085, upperArm: .31, forearm: .28,
  standingHips: .935, seatedHips: .45,
  spine: .1, chest: .2, neck: .27, head: .08,
} as const;
const D = CHARACTER_DIMENSIONS;
/** Standing eye height, which matches the gameplay camera's 1.75 m. */
export const CHARACTER_EYE = D.standingHips + D.spine + D.chest + D.neck + D.head + .12;

const WEAPONS: Record<CharacterWeapon, { length: number; fore: number; muzzle: number }> = {
  rifle: { length: .42, fore: -.18, muzzle: -.66 },
  marksman: { length: .46, fore: -.2, muzzle: -.86 },
  lmg: { length: .5, fore: -.2, muzzle: -.76 },
};

const tmpMatrix = new THREE.Matrix4(), tmpQuat = new THREE.Quaternion(), tmpQuat2 = new THREE.Quaternion();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Two-bone IK in the upper joint's parent space. Bones point down local -Y and
 * hinge about local X; the middle joint bends toward `pole`. Unreachable targets
 * straighten the limb toward them.
 */
export function solveLimb(upper: THREE.Object3D, lower: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, a: number, b: number) {
  const d = tmpA.copy(target).sub(upper.position);
  const distance = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-4, d.length()));
  if (d.lengthSq() < 1e-10) d.set(0, -1, 0); else d.normalize();
  const hinge = tmpB.crossVectors(d, pole);
  if (hinge.lengthSq() < 1e-8) hinge.crossVectors(d, Math.abs(d.y) < .9 ? THREE.Object3D.DEFAULT_UP : X_AXIS);
  hinge.normalize();
  const alpha = Math.acos(Math.max(-1, Math.min(1, (a * a + distance * distance - b * b) / (2 * a * distance))));
  // Rotating d about the hinge by +alpha swings it toward the pole side.
  const towardPole = tmpC.crossVectors(hinge, d);
  const upperDirection = tmpD.copy(d).multiplyScalar(Math.cos(alpha)).addScaledVector(towardPole, Math.sin(alpha)).normalize();
  const y = upperDirection.negate(), z = tmpC.crossVectors(hinge, y).normalize();
  upper.quaternion.setFromRotationMatrix(tmpMatrix.makeBasis(hinge, y, z));
  // The lower bone's direction, expressed in the upper bone's frame.
  const local = tmpA.copy(target).sub(upper.position).applyQuaternion(tmpQuat.copy(upper.quaternion).invert());
  local.y += a;
  lower.rotation.set(Math.atan2(-local.z, -local.y), 0, 0);
}

interface Part { geometry: THREE.BufferGeometry; color: string; fabric: boolean }

/**
 * Paints `pattern` over every vertex the rig marked as fabric. The pattern is
 * computed per fragment from the bone-local position, so it is crisp at any
 * mesh density and moves with the limb rather than swimming over it.
 */
function printCamo(material: THREE.MeshStandardMaterial, pattern: CamoPattern) {
  const uniforms = {
    camoA: { value: new THREE.Color(pattern.colors[0]) }, camoB: { value: new THREE.Color(pattern.colors[1]) },
    camoC: { value: new THREE.Color(pattern.colors[2]) }, camoScale: { value: pattern.scale },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fabric;\nvarying float vFabric;\nvarying vec3 vFabricPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFabric = fabric;\nvFabricPosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${pattern.style === 'digital' ? '#define CAMO_DIGITAL' : ''}
uniform vec3 camoA, camoB, camoC;
uniform float camoScale;
varying float vFabric;
varying vec3 vFabricPosition;
float camoHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float camoNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(camoHash(i), camoHash(i + vec3(1, 0, 0)), f.x), mix(camoHash(i + vec3(0, 1, 0)), camoHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(camoHash(i + vec3(0, 0, 1)), camoHash(i + vec3(1, 0, 1)), f.x), mix(camoHash(i + vec3(0, 1, 1)), camoHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 camoColor(vec3 base) {
  vec3 p = vFabricPosition * camoScale;
#ifdef CAMO_DIGITAL
  // Square pixels, clustered by the larger block they fall in.
  float n = camoHash(floor(p / 3.) + 17.) * .62 + camoHash(floor(p)) * .38;
  return n < .42 ? base : n < .6 ? camoA : n < .74 ? camoB : camoC;
#else
  float n = camoNoise(p) * .72 + camoNoise(p * 2.7 + 11.) * .28;
  return n < .44 ? base : n < .58 ? camoA : n < .68 ? camoB : n < .76 ? base : camoC;
#endif
}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vFabric > .5) diffuseColor.rgb = camoColor(diffuseColor.rgb);');
  };
  // One program per style, shared by every figure; the colours stay per material.
  material.customProgramCacheKey = () => `character-camo-${pattern.style}`;
}

interface SkinnedPiece { joint: THREE.Object3D; index: number; geometry: THREE.BufferGeometry }

/**
 * Bounds in the figure root's frame for every pose `update` makes: standing,
 * crouched, seated, swimming, rolling, prone (laid out ahead along +z) and
 * fallen (laid back along -z). Fixed, because a skinned mesh's own bounds are
 * taken from whatever pose it had when first culled. Checked in the tests.
 */
export const SKINNED_FIGURE_BOUNDS = new THREE.Sphere(new THREE.Vector3(0, .75, .35), 2.1);
const IDENTITY = new THREE.Matrix4();
const rayProxy = new THREE.Mesh(), rayHits: THREE.Intersection[] = [], raySphere = new THREE.Sphere();
const figureInverse = new THREE.Matrix4(), jointToFigure = new THREE.Matrix4();

/**
 * One skinned mesh for every joint's piece. Vertices stay in their joint's own
 * frame and every bind matrix is the identity, so the GPU draws each one at
 * joint.matrixWorld × position: exactly where a mesh parented to that joint
 * would be, and the camouflage, keyed to that local position, is unchanged.
 */
function createSkinnedFigure(pieces: SkinnedPiece[], joints: THREE.Object3D[], material: THREE.Material, resources: { dispose(): void }[]) {
  const tagged = pieces.map(({ index, geometry }) => {
    const copy = geometry.clone(), count = copy.getAttribute('position').count;
    const bones = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { bones[i * 4] = index; weights[i * 4] = 1; }
    copy.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bones, 4));
    copy.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    return copy;
  });
  const merged = mergeGeometries(tagged, false)!;
  tagged.forEach(geometry => geometry.dispose());
  resources.push(merged);
  const mesh = new THREE.SkinnedMesh(merged, material);
  // The joints are plain groups; a skeleton only reads their world matrices.
  const skeleton = new THREE.Skeleton(joints as THREE.Bone[], joints.map(() => new THREE.Matrix4()));
  mesh.bind(skeleton, IDENTITY);
  resources.push(skeleton);
  mesh.boundingSphere = SKINNED_FIGURE_BOUNDS.clone();
  // Raycasting a skinned mesh poses every vertex on the CPU. Instead, test each
  // joint's own triangles in that joint's frame, as the per-joint meshes were,
  // and report the hits against this mesh with normals in its frame.
  mesh.raycast = function (this: THREE.SkinnedMesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    raySphere.copy(this.boundingSphere!).applyMatrix4(this.matrixWorld);
    if (!raycaster.ray.intersectsSphere(raySphere)) return;
    figureInverse.copy(this.matrixWorld).invert();
    rayProxy.material = this.material;
    for (const { joint, geometry } of pieces) {
      rayProxy.geometry = geometry; rayProxy.matrixWorld.copy(joint.matrixWorld);
      rayHits.length = 0;
      THREE.Mesh.prototype.raycast.call(rayProxy, raycaster, rayHits);
      if (!rayHits.length) continue;
      jointToFigure.multiplyMatrices(figureInverse, joint.matrixWorld);
      for (const hit of rayHits) {
        hit.object = this;
        hit.face?.normal.transformDirection(jointToFigure);
        hit.normal?.transformDirection(jointToFigure);
        intersects.push(hit);
      }
    }
  };
  return mesh;
}

/** Deterministic, so a named local looks the same on every visit. */
export function hashString(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export interface CharacterRigOptions {
  /**
   * Draw the body as one skinned mesh (plus one for eyewear) whose bones are
   * the joints, instead of a mesh per joint: about two draw calls a figure
   * rather than twenty. Joints still animate and still carry the aim points,
   * the weapon and the dressing, but hiding a joint no longer hides its part
   * of the body, so the first-person body keeps the per-joint meshes.
   */
  skinned?: boolean;
}

export function createCharacterRig(look: CharacterLook, name = 'character', options: CharacterRigOptions = {}): CharacterRig {
  const build = look.build ?? 1;
  const resources: { dispose(): void }[] = [];
  const skinMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: 0 });
  const gearMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .35 });
  resources.push(skinMaterial, gearMaterial);
  if (look.camo) printCamo(skinMaterial, look.camo.pattern);
  const topFabric = !!look.camo, bottomFabric = !!look.camo && look.camo.on === 'all', hatFabric = !!look.camo?.headwear;
  const root = new THREE.Group(); root.name = name;
  // Bullets that strike any part of a figure draw blood rather than chips (fps-surfaces).
  root.userData.impactSurface = 'flesh';
  root.userData.wetSurface = true;
  const body = new THREE.Group(); body.name = 'rig-body'; root.add(body);
  const joint = (jointName: JointName, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const group = new THREE.Group(); group.name = `rig-${jointName}`; group.position.set(x, y, z); parent.add(group); return group;
  };
  const hips = joint('hips', body, 0, D.standingHips, 0);
  const spine = joint('spine', hips, 0, D.spine, 0);
  const chest = joint('chest', spine, 0, D.chest, 0);
  const neck = joint('neck', chest, 0, D.neck, 0);
  const head = joint('head', neck, 0, D.head, 0);
  const shoulderX = .172 * build;
  const upperArmL = joint('upperArmL', chest, -shoulderX, .235, 0), forearmL = joint('forearmL', upperArmL, 0, -D.upperArm, 0), handL = joint('handL', forearmL, 0, -D.forearm, 0);
  const upperArmR = joint('upperArmR', chest, shoulderX, .235, 0), forearmR = joint('forearmR', upperArmR, 0, -D.upperArm, 0), handR = joint('handR', forearmR, 0, -D.forearm, 0);
  const thighL = joint('thighL', hips, -.1, -.03, 0), shinL = joint('shinL', thighL, 0, -D.thigh, 0), footL = joint('footL', shinL, 0, -D.shin, 0);
  const thighR = joint('thighR', hips, .1, -.03, 0), shinR = joint('shinR', thighR, 0, -D.thigh, 0), footR = joint('footR', shinR, 0, -D.shin, 0);
  const joints = { hips, spine, chest, neck, head, upperArmL, forearmL, handL, upperArmR, forearmR, handR, thighL, shinL, footL, thighR, shinR, footR };

  // Parts are authored in each joint's frame and merged once per joint.
  const parts = new Map<THREE.Object3D, Part[]>(), gear = new Map<THREE.Object3D, Part[]>();
  const place = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
    geometry.applyMatrix4(tmpMatrix.compose(tmpA.set(x, y, z), tmpQuat.setFromEuler(new THREE.Euler(rx, ry, rz)), tmpB.set(sx, sy, sz)));
  const add = (bone: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, metal = false, fabric = false) => {
    const list = (metal ? gear : parts).get(bone) ?? []; list.push({ geometry, color, fabric }); (metal ? gear : parts).set(bone, list);
  };
  const sphere = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const cylinder = (top: number, bottom: number, height: number, segments = 10) => new THREE.CylinderGeometry(top, bottom, height, segments);
  // A revolved profile, flattened front-to-back: one smooth torso section.
  const lathe = (profile: readonly [number, number][]) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const shade = (color: string, amount: number) => `#${new THREE.Color(color).multiplyScalar(amount).getHexString()}`;
  const limb = (bone: THREE.Object3D, length: number, top: number, bottom: number, color: string, from = 0, to = length, fabric = false) => {
    add(bone, place(cylinder(top - (top - bottom) * from / length, top - (top - bottom) * to / length, to - from), 0, -(from + to) / 2, 0), color, false, fabric);
  };
  /**
   * A badge sewn flat on a surface whose outward normal is ±x (a sleeve) or -z
   * (the chest) or +z (the back). Pieces are laid out in the badge's own plane: u across, v up.
   */
  const sew = (bone: THREE.Object3D, badge: PatchLook, x: number, y: number, z: number, normal: 1 | -1 | 'front' | 'back', w: number, h: number) => {
    const piece = (u: number, v: number, pw: number, ph: number, angle: number, color: string, depth: number) => {
      if (normal === 'front' || normal === 'back') add(bone, place(box(pw, ph, depth), x + u, y + v, z + (normal === 'front' ? -1 : 1) * depth / 2, 1, 1, 1, 0, 0, angle), color);
      else add(bone, place(box(depth, ph, pw), x + normal * depth / 2, y + v, z + u, 1, 1, 1, angle), color);
    };
    const cloth = .008, device = .012, { field, mark } = badge;
    piece(0, 0, w, h, 0, field, cloth);
    if (badge.design === 'flag') piece(0, h / 4, w, h / 2, 0, mark, device);
    if (badge.design === 'bar') piece(0, 0, w, h * .28, 0, mark, device);
    if (badge.design === 'bars') for (const v of [-.22, .22]) piece(0, h * v, w * .8, h * .16, 0, mark, device);
    if (badge.design === 'diamond') piece(0, 0, Math.min(w, h) * .5, Math.min(w, h) * .5, Math.PI / 4, mark, device);
    if (badge.design === 'wing') {
      piece(0, 0, w * .12, h * .7, 0, mark, device);
      for (const side of [-1, 1]) for (let row = 0; row < 2; row++) piece(side * w * .23, h * (.17 - row * .28), w * .42, h * .12, side * .3, mark, device);
    }
    if (badge.design === 'gate') {
      for (const side of [-1, 1]) piece(side * w * .28, 0, w * .16, h * .7, 0, mark, device);
      piece(0, h * .27, w * .7, h * .16, 0, mark, device);
    }
    if (badge.design === 'chevron') for (const s of [-1, 1]) piece(s * w * .17, h * .05, w * .44, h * .2, s * .62, mark, device);
    // Rank stripes: one chevron per grade, stacked point up.
    if (badge.design === 'chevrons') {
      const count = Math.max(1, Math.min(3, badge.count ?? 1));
      for (let i = 0; i < count; i++) for (const s of [-1, 1]) piece(s * w * .17, h * .26 * ((count - 1) / 2 - i), w * .46, h * .14, s * .62, mark, device);
    }
    // A name tape: two dark strokes for the lettering.
    if (badge.design === 'tape') for (const [u, length] of [[-w * .22, w * .34], [w * .2, w * .28]]) piece(u, 0, length, h * .3, 0, mark, device);
  };

  const combat = !!look.vest || look.headwear === 'helmet';
  const belt = combat ? '#2b2f29' : shade(look.bottom, .55);
  // Pelvis and belt.
  add(hips, place(lathe([[0, -.115], [.1, -.1], [.16, -.06], [.168, .01], [.152, .1], [0, .1]]), 0, 0, 0, build, 1, .7), look.bottom, false, bottomFabric);
  add(hips, place(cylinder(.5, .5, 1, 14), 0, .07, 0, .335 * build, .05, .225), belt);
  if (look.apron) add(hips, place(box(.34 * build, .46, .015), 0, -.17, -.122, 1, 1, 1, .08), look.apron);
  if (combat) for (const x of [-.14, .14]) add(hips, place(box(.07, .1, .09), x * build, -.02, -.04), shade(look.vest ?? belt, .85));
  // Abdomen and chest.
  add(spine, place(lathe([[0, -.03], [.148, -.03], [.142, .08], [.152, .2], [0, .21]]), 0, 0, 0, build, 1, .68), look.top, false, topFabric);
  add(chest, place(lathe([[0, -.06], [.15, -.06], [.165, .06], [.182, .17], [.186, .235], [.16, .29], [.075, .32], [0, .325]]), 0, 0, 0, build, 1, .64), look.top, false, topFabric);
  if (look.apron) add(chest, place(box(.24 * build, .24, .012), 0, .03, -.104), look.apron);
  if (look.lanyard) {
    for (const side of [-1, 1]) add(chest, place(box(.012, .25, .008), side * .055, .17, -.118, 1, 1, 1, -.15, 0, side * .3), look.lanyard);
    add(chest, place(box(.07, .095, .008), 0, .02, -.125), '#eef2ec');
  }
  if (look.towel) add(chest, place(box(.1, .022, .24), -.11 * build, .272, 0, 1, 1, 1, 0, 0, .3), look.towel);
  if (look.vest) {
    const vest = look.vest;
    add(spine, place(box(.33 * build, .14, .24), 0, .13, 0), vest);
    add(chest, place(box(.36 * build, .32, .27), 0, .1, 0), vest);
    for (const x of [-.1, 0, .1]) add(chest, place(box(.075, .1, .05), x * build, .0, -.15), shade(vest, .78));
    add(chest, place(box(.1, .06, .03), .09 * build, .17, -.145), shade(vest, .7));
    if (look.plates) {
      add(chest, place(box(.38 * build, .34, .05), 0, .12, -.16), shade(vest, 1.15));
      add(chest, place(box(.38 * build, .34, .05), 0, .12, .16), shade(vest, 1.15));
      add(spine, place(box(.36 * build, .12, .29), 0, -.02, 0), shade(vest, .9));
    }
  }
  if (look.patches?.chest) {
    // Over the plates, the carrier or the shirt, whichever is outermost.
    const front = look.plates && look.vest ? -.185 : look.vest ? -.135 : -.118;
    const tape = look.patches.chest.design === 'tape';
    sew(chest, look.patches.chest, -.085 * build, tape ? .2 : .19, front, 'front', tape ? .1 : .055, tape ? .026 : .055);
  }
  if (look.backpack) {
    add(chest, place(box(.3 * build, .36, .14), 0, .1, .18), look.backpack);
    add(chest, place(box(.24 * build, .12, .06), 0, -.03, .26), shade(look.backpack, .8));
  }
  // Faction identity is authored into the same bone meshes, adding no draws.
  // Field troops have open webbing and a broad bedroll; contractors have a
  // hard raised collar, clipped shoulder armour and a covered lower face.
  const contractor = look.uniform === 'contractor', field = look.uniform === 'field';
  const kit = look.vest ?? belt, idField = '#202723', idMark = '#e8e2cc';
  if (field) {
    const front = look.plates ? -.199 : -.151;
    for (const side of [-1, 1]) {
      add(chest, place(box(.038, .33, .025), side * .13 * build, .115, front), '#a8ac82');
      add(chest, place(box(.052, .025, .032), side * .13 * build, .19, front - .009), '#333b2d');
    }
    add(chest, place(cylinder(.07, .07, .43 * build, 12), 0, .235, look.backpack ? .28 : .20, 1, 1, 1, 0, 0, Math.PI / 2), look.backpack ?? kit);
    for (const side of [-1, 1]) add(chest, place(box(.027, .14, .14), side * .13 * build, .235, look.backpack ? .28 : .20), '#a8ac82');
  }
  if (contractor) {
    for (const side of [-1, 1]) add(chest, place(box(.065, .13, .25), side * .09, .29, .012, 1, 1, 1, 0, 0, side * .18), kit);
    add(chest, place(box(.19, .09, .055), 0, .29, .12), kit);
    add(head, place(box(.19, .075, .12), 0, .025, -.075), shade(kit, 1.2));
    // Two diagonal seams keep the mask legible as fabric rather than a new face.
    for (const side of [-1, 1]) add(head, place(box(.075, .009, .008), side * .038, .032, -.14, 1, 1, 1, 0, 0, side * .22), '#70777c');
  }
  if (field || contractor) {
    const badge: PatchLook = { design: contractor ? 'diamond' : 'bars', field: idField, mark: idMark };
    const front = look.plates ? -.19 : -.14;
    sew(chest, badge, 0, .19, front - .025, 'front', .15, .12);
    const back = look.backpack ? .255 : look.plates ? .19 : .14;
    sew(chest, badge, 0, .065, back + .025, 'back', .23, .20);
  }
  const expeditionary = look.uniform === 'expeditionary', collective = look.uniform === 'collective';
  const panel = look.panel ?? kit;
  if (expeditionary) {
    // Tapered expeditionary plate with open shoulders and pale outer ribs.
    add(chest, place(cylinder(.14 * build, .18 * build, .27, 6), 0, .12, -.17, 1, 1, .26), panel);
    for (const side of [-1, 1]) {
      add(chest, place(box(.033, .30, .035), side * .16 * build, .12, -.17, 1, 1, 1, 0, 0, side * -.12), kit);
      add(head, place(box(.045, .085, .095), side * .126, .085, .015), panel);
    }
    // Folded twin optical pods and a short boom microphone, not active optics.
    add(head, place(box(.12, .035, .04), 0, .255, -.025), kit);
    for (const side of [-1, 1]) add(head, place(cylinder(.024, .024, .07, 10), side * .036, .30, -.025), '#303b44');
    add(head, place(box(.012, .012, .14), -.13, .055, -.08), panel);
    add(head, place(box(.035, .018, .025), -.11, .055, -.15), '#303b44');
  }
  if (collective) {
    // A continuous visor and jaw guard distinguish even a head-only sighting.
    add(head, place(box(.245, .075, .065), 0, .125, -.115), '#253d43');
    add(head, place(box(.23, .014, .07), 0, .171, -.115), panel);
    for (const side of [-1, 1]) add(head, place(box(.046, .10, .11), side * .11, .04, -.065, 1, 1, 1, 0, 0, side * .16), panel);
    add(head, place(box(.19, .045, .055), 0, -.005, -.10), panel);
    add(chest, place(box(.40 * build, .29, .055), 0, .13, -.20), panel);
    for (const side of [-1, 1]) {
      add(hips, place(box(.13, .22, .045), side * .125 * build, -.13, -.12, 1, 1, 1, -.1, 0, side * -.10), panel);
      add(chest, place(box(.055, .24, .025), side * .19 * build, .12, -.238), kit);
    }
  }
  if (look.identification) {
    sew(chest, look.identification, 0, .19, collective ? -.23 : -.225, 'front', .15, .12);
    sew(chest, look.identification, 0, .09, look.backpack ? .295 : .19, 'back', .22, .17);
  }
  if (look.roleKit === 'lancer') {
    // Compact breaching-tool scabbard and chunky explosive/tool pouch.
    add(hips, place(box(.085, .28, .075), -.20 * build, -.11, .035, 1, 1, 1, 0, 0, -.12), panel);
    add(hips, place(box(.12, .035, .06), -.22 * build, .04, .035), '#303b44');
    add(hips, place(box(.12, .12, .09), .20 * build, -.04, -.02), kit);
  }
  if (look.roleKit === 'wayfinder') {
    add(chest, place(box(.11, .24, .12), .19, .12, .22), panel);
    add(chest, place(cylinder(.007, .007, .43, 6), .19, .43, .22), '#303b44');
    add(chest, place(box(.07, .055, .045), .19, .66, .22), panel);
    add(chest, place(box(.12, .08, .045), -.12, .03, -.23), kit);
  }
  if (look.roleKit === 'bastion') {
    // Slung shield is an equipment study; it has no collision/blocking logic.
    add(chest, place(box(.27, .57, .045), -.25 * build, .09, .31, 1, 1, 1, 0, 0, -.10), panel);
    add(chest, place(box(.20, .085, .052), -.25 * build, .23, .31, 1, 1, 1, 0, 0, -.10), '#253d43');
    if (look.identification) sew(chest, look.identification, -.25 * build, .015, .34, 'back', .16, .16);
  }
  if (look.roleKit === 'conductor') {
    // Symmetric raised sensor heads and a hard command-tablet case.
    for (const side of [-1, 1]) {
      add(chest, place(cylinder(.012, .012, .27, 8), side * .17, .36, .24), kit);
      add(chest, place(box(.085, .065, .08), side * .17, .51, .24), panel);
      add(chest, place(box(.045, .027, .008), side * .17, .51, .195), '#253d43');
    }
    add(hips, place(box(.045, .21, .15), .21 * build, -.05, -.025), panel);
  }
  // Jobs remain readable when a weapon or helmet is hidden by the pose.
  if (look.roleKit === 'gunner') {
    for (const side of [-1, 1]) {
      add(hips, place(box(.13, .18, .13), side * .21 * build, -.035, .005), kit);
      add(hips, place(box(.09, .025, .14), side * .21 * build, .06, .005), '#92977b');
    }
  }
  if (look.roleKit === 'marksman') {
    // A short split shoulder drape, leaving the faction plate and insignia exposed.
    for (const side of [-1, 1]) {
      add(chest, place(box(.13, .06, .30), side * .19 * build, .235, .015, 1, 1, 1, 0, 0, side * -.16), look.top, false, topFabric);
      for (let i = 0; i < 4; i++) add(chest, place(box(.035, .11 + i % 2 * .025, .025), side * (.14 + i * .03) * build, .16, .17), look.top, false, topFabric);
    }
  }
  if (look.roleKit === 'mortar') {
    // Two tall, capped shell carriers extend above either shoulder, behind the head.
    for (const side of [-1, 1]) {
      add(chest, place(cylinder(.048, .048, .51, 10), side * .14 * build, .22, .30), kit);
      for (const y of [.005, .43]) add(chest, place(cylinder(.053, .053, .035, 10), side * .14 * build, y, .30), '#9a9e8a');
    }
  }
  // Neck and head. The face points down -z.
  add(neck, place(cylinder(.055, .062, .12), 0, .02, 0), look.skin);
  if (look.headwear === 'headscarf') add(neck, place(cylinder(.1, .19 * build, .16, 14), 0, -.04, .005), look.headwearColor ?? look.hair);
  add(head, place(sphere(.5, 18, 14), 0, .1, 0, .2, .245, .23), look.skin);
  add(head, place(sphere(.5), 0, .03, -.025, .16, .13, .17), look.skin);
  add(head, place(box(.032, .05, .045), 0, .085, -.12, 1, 1, 1, -.25), shade(look.skin, .92));
  for (const side of [-1, 1]) {
    add(head, place(sphere(.017, 8, 6), side * .043, .118, -.103), '#1c1a18');
    add(head, place(box(.05, .012, .018), side * .045, .148, -.108), shade(look.hair, .9));
    add(head, place(sphere(.5, 8, 6), side * .102, .1, .005, .035, .06, .035), shade(look.skin, .95));
  }
  add(head, place(box(.05, .01, .01), 0, .035, -.115), shade(look.skin, .7));
  if (look.eyewear) {
    add(head, place(box(.13, .03, .018), 0, .12, -.118), look.eyewear, true);
    for (const side of [-1, 1]) add(head, place(box(.008, .012, .1), side * .1, .125, -.07), look.eyewear, true);
  }
  const headwear = look.headwear ?? 'none', hat = look.headwearColor ?? look.hair;
  const dome = (r: number, cover: number) => new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * cover);
  if (headwear === 'none' || headwear === 'cap') {
    if (look.hairStyle !== 'bald') add(head, place(dome(.5, .5), 0, .115, .008, .212, .25, .245), look.hair);
    if (look.hairStyle === 'long') add(head, place(box(.19, .22, .07), 0, .02, .085), look.hair);
  }
  if (headwear === 'helmet') {
    add(head, place(dome(.5, .55), 0, .12, .005, .27, .27, .3), hat, false, hatFabric);
    add(head, place(cylinder(.5, .5, 1, 18), 0, .135, .005, .272, .02, .302), look.accent ?? shade(hat, .8));
    add(head, place(box(.15, .035, .03), 0, .2, -.13, 1, 1, 1, -.5), '#1e2426');
    for (const side of [-1, 1]) add(head, place(box(.012, .14, .012), side * .1, .06, -.03, 1, 1, 1, 0, 0, side * .12), '#2a2c28');
  }
  if (headwear === 'boonie') {
    add(head, place(cylinder(.205, .205, .012, 20), 0, .2, 0), hat, false, hatFabric);
    add(head, place(cylinder(.11, .125, .09, 16), 0, .245, 0), hat, false, hatFabric);
    add(head, place(cylinder(.127, .127, .02, 16), 0, .215, 0), look.accent ?? shade(hat, .8));
  }
  if (headwear === 'cap') {
    add(head, place(dome(.5, .5), 0, .14, 0, .225, .2, .255), hat);
    add(head, place(box(.16, .012, .11), 0, .155, -.15, 1, 1, 1, .12), hat);
  }
  if (headwear === 'headscarf') {
    const r = .5, gap = .95;
    add(head, place(new THREE.SphereGeometry(r, 18, 14, Math.PI * 1.5 + gap, Math.PI * 2 - 2 * gap), 0, .1, .005, .228, .275, .255), hat);
    add(head, place(dome(.5, .5), 0, .115, 0, .225, .275, .25), hat);
  }
  // Arms.
  const sleeve = look.accent && combat ? look.accent : look.top, glove = look.gloves ?? look.skin;
  for (const [upper, fore, hand, side] of [[upperArmL, forearmL, handL, -1], [upperArmR, forearmR, handR, 1]] as const) {
    add(upper, place(sphere(.066), 0, -.012, 0), look.top, false, topFabric);
    if (look.sleeves === 'short') { limb(upper, D.upperArm, .066, .052, look.top, 0, .14, topFabric); limb(upper, D.upperArm, .06, .05, look.skin, .14, D.upperArm); }
    else limb(upper, D.upperArm, .066, .054, look.top, 0, D.upperArm, topFabric);
    if (expeditionary) add(upper, place(sphere(.075, 10, 6), 0, -.025, 0, 1, .7, 1), panel);
    if (collective) add(upper, place(box(.17, .10, .19), 0, -.015, 0, 1, 1, 1, 0, 0, side * .15), panel);
    if (look.identification) sew(upper, look.identification, -side * (collective ? .091 : .079), -.04, 0, side < 0 ? 1 : -1, .09, .075);
    if (contractor || look.roleKit === 'gunner') {
      // Faceted guards widen the contractor silhouette even on recruits.
      const radius = look.roleKit === 'gunner' ? .10 : .087;
      add(upper, place(cylinder(radius, radius * .85, .12, 5), 0, -.035, 0), kit);
    }
    if (field || contractor) {
      const x = -side * (contractor || look.roleKit === 'gunner' ? .094 : .071);
      sew(upper, { design: contractor ? 'diamond' : 'bars', field: idField, mark: idMark }, x, -.035, 0, side < 0 ? 1 : -1, .09, .085);
    }
    // Badges replace the plain armband: they carry the side, the helmet band the role.
    // The arm IK keeps each upper arm's local +x on the hinge, which points
    // across the body, so the outside of either arm is local -side·x.
    const badge = side < 0 ? look.patches?.left : look.patches?.right;
    if (badge) sew(upper, badge, -side * .062, look.uniform ? -.155 : -.085, 0, side < 0 ? 1 : -1, .062, .07);
    else if (combat && look.accent) add(upper, place(cylinder(.068, .066, .045), 0, -.1, 0), sleeve);
    const sleeved = look.sleeves !== 'short';
    add(fore, place(sphere(.053), 0, 0, 0), sleeved ? look.top : look.skin, false, sleeved && topFabric);
    limb(fore, D.forearm, .052, .04, sleeved ? look.top : look.skin, 0, sleeved ? .2 : D.forearm, sleeved && topFabric);
    if (look.sleeves !== 'short') limb(fore, D.forearm, .041, .038, look.skin, .2, D.forearm);
    add(hand, place(box(.075, .085, .035), 0, -.045, 0), glove);
    add(hand, place(box(.025, .05, .025), side * -.04, -.025, -.012, 1, 1, 1, 0, 0, side * .4), glove);
  }
  // Legs and boots.
  for (const [thigh, shin, foot] of [[thighL, shinL, footL], [thighR, shinR, footR]] as const) {
    add(thigh, place(sphere(.097), 0, 0, 0), look.bottom, false, bottomFabric);
    limb(thigh, D.thigh, .097, .072, look.bottom, 0, look.shorts ? .28 : D.thigh, bottomFabric);
    if (look.shorts) limb(thigh, D.thigh, .068, .064, look.skin, .28, D.thigh);
    add(shin, place(sphere(.068), 0, 0, 0), look.shorts ? look.skin : look.bottom, false, !look.shorts && bottomFabric);
    limb(shin, D.shin, .068, .05, look.shorts ? look.skin : look.bottom, 0, D.shin, !look.shorts && bottomFabric);
    if (combat) limb(shin, D.shin, .064, .06, look.shoes, .27, D.shin);
    add(foot, place(box(.1, .08, .24), 0, -.035, -.055), look.shoes);
    add(foot, place(box(.106, .02, .25), 0, -.075, -.055), shade(look.shoes, .55));
  }

  // Weapon, carried in the chest frame. Its origin is the pistol grip; the
  // barrel points down -z.
  let weapon: THREE.Group | null = null, muzzle: THREE.Object3D | null = null;
  let grip: THREE.Object3D | null = null, fore: THREE.Object3D | null = null;
  if (look.weapon) {
    const spec = WEAPONS[look.weapon], dark = '#1d2326', furniture = look.weapon === 'marksman' ? '#5a5240' : '#2c3330';
    weapon = new THREE.Group(); weapon.name = 'rig-weapon'; chest.add(weapon);
    // Steel and polymer, not part of the body's heat (fps-vision).
    weapon.userData.heat = 'none';
    const heavy = look.weapon === 'lmg';
    add(weapon, place(box(heavy ? .075 : .055, heavy ? .1 : .085, spec.length), 0, .045, -.08), dark, true);
    add(weapon, place(box(heavy ? .07 : .06, .06, .2), 0, .035, spec.fore - .02), furniture, true);
    add(weapon, place(cylinder(.012, .012, -spec.muzzle + spec.fore - .05, 8), 0, .05, (spec.muzzle + spec.fore) / 2 - .05, 1, 1, 1, Math.PI / 2), dark, true);
    add(weapon, place(cylinder(.019, .016, .06, 8), 0, .05, spec.muzzle + .03, 1, 1, 1, Math.PI / 2), '#111416', true);
    add(weapon, place(box(.032, .085, .045), 0, -.03, .015, 1, 1, 1, .3), furniture, true);
    add(weapon, place(box(.045, .09, .2), 0, .02, .2), furniture, true);
    add(weapon, place(box(.05, .11, .03), 0, .01, .3), '#151a1c', true);
    if (heavy) {
      add(weapon, place(box(.1, .11, .12), -.06, -.03, -.08), '#3a4236', true);
      for (const side of [-1, 1]) add(weapon, place(box(.012, .012, .24), side * .02, -.005, spec.muzzle + .2, 1, 1, 1, 0, side * .05), dark, true);
      add(weapon, place(box(.02, .04, .12), 0, .11, -.1), dark, true);
    } else add(weapon, place(box(.035, .15, .065), 0, -.055, -.1, 1, 1, 1, -.18), dark, true);
    if (look.weapon === 'marksman') {
      add(weapon, place(cylinder(.024, .024, .28, 12), 0, .12, -.1, 1, 1, 1, Math.PI / 2), '#141819', true);
      add(weapon, place(cylinder(.032, .028, .05, 12), 0, .12, -.25, 1, 1, 1, Math.PI / 2), '#141819', true);
    } else add(weapon, place(box(.04, .045, .09), 0, .115, -.08), '#141819', true);
    grip = new THREE.Object3D(); grip.position.set(.005, .0, .055); weapon.add(grip);
    fore = new THREE.Object3D(); fore.position.set(-.01, -.015, spec.fore + .03); weapon.add(fore);
    muzzle = new THREE.Object3D(); muzzle.name = 'rig-muzzle'; muzzle.position.set(0, .05, spec.muzzle); weapon.add(muzzle);
  }

  const jointList = Object.values(joints);
  let skinned: THREE.SkinnedMesh | null = null;
  for (const [bones, material] of [[parts, skinMaterial], [gear, gearMaterial]] as const) {
    const pieces: SkinnedPiece[] = [];
    for (const [bone, list] of bones) {
      const colored = list.map(({ geometry, color, fabric }) => {
        const tint = new THREE.Color(color), count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) colors.set([tint.r, tint.g, tint.b], i * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        // Merging needs every part to carry the same attributes, so a camouflaged figure marks all of them.
        if (look.camo && material === skinMaterial) geometry.setAttribute('fabric', new THREE.BufferAttribute(new Float32Array(count).fill(fabric ? 1 : 0), 1));
        return geometry;
      });
      const merged = mergeGeometries(colored, false);
      colored.forEach(geometry => geometry.dispose());
      if (!merged) continue;
      resources.push(merged);
      // The weapon is shown and hidden on its own, so it always keeps its own mesh.
      const index = options.skinned ? jointList.indexOf(bone as THREE.Group) : -1;
      if (index >= 0) { pieces.push({ joint: bone, index, geometry: merged }); continue; }
      const mesh = new THREE.Mesh(merged, material); mesh.name = `${bone.name}-mesh`; bone.add(mesh);
    }
    if (pieces.length) {
      // A material drawn by both a skinned and a plain mesh (the gear on the weapon) costs a
      // shader program switch on every draw, so skinned eyewear gets its own copy.
      const own = material === gearMaterial ? gearMaterial.clone() : material;
      if (own !== material) resources.push(own);
      const mesh = createSkinnedFigure(pieces, jointList, own, resources);
      mesh.name = `${name}-${material === skinMaterial ? 'body' : 'gear'}`; root.add(mesh);
      if (material === skinMaterial) skinned = mesh;
    }
  }
  // A roll of field dressing in the left hand, shown only while it is being applied.
  let dressing: THREE.Mesh | null = null;
  if (look.weapon) {
    const geometry = new THREE.CylinderGeometry(.034, .034, .07, 10), material = new THREE.MeshStandardMaterial({ color: '#e9e6da', roughness: .95 });
    resources.push(geometry, material);
    dressing = new THREE.Mesh(geometry, material); dressing.name = 'rig-dressing'; dressing.position.set(0, -.06, -.035); dressing.rotation.z = Math.PI / 2; dressing.visible = false;
    handL.add(dressing);
  }
  // Rendered aim points for perception code: the chest and the face.
  const chestPoint = new THREE.Object3D(); chestPoint.name = 'avatar-aim-chest'; chestPoint.position.set(0, .1, 0); chest.add(chestPoint);
  const headPoint = new THREE.Object3D(); headPoint.name = 'avatar-aim-head'; headPoint.position.set(0, .1, 0); head.add(headPoint);

  // Animation state.
  let time = hashString(name) % 1000 / 37, phase = 0, moveWeight = 0, speedSmoothed = 0, runWeight = 0;
  let crouch = 0, prone = 0, seated = 0, slide = 0, air = 0, aim = 1, driving = 0, kick = 0, flinch = 0, flinchSide = 1;
  let heal = 0, healTime = 0;
  let waterBlind = 0, waterMist = 0, waterTime = 0;
  let lastWater: CharacterDrive['water'];
  let down = false, downTime = 0, gestureTime = 0, gesture: CharacterGesture = 'idle', gestureBlend = 0, lookYaw = 0, lookPitch = 0;
  const moveDirection = new THREE.Vector2(0, -1), wanted = new THREE.Vector2();
  const target = new THREE.Vector3(), world = new THREE.Vector3(), pole = new THREE.Vector3();
  const waterTarget = new THREE.Vector3();
  const footLevel = new THREE.Quaternion(), footEuler = new THREE.Euler();
  // Secondary motion: cycle shape, both feet, filtered arm swing, body-local
  // velocity for acceleration, springs for lean and the weapon's lag, and how
  // hard the figure is breathing. All presentation only.
  const gait: GaitShape = { blend: 0, duty: .6, stride: 1, reach: 0 };
  const feet = [footSample(), footSample()] as const, armSwing = [0, 0], settleLift = [0, 0];
  const lastFoot = [new THREE.Vector3(), new THREE.Vector3()];
  let localX = 0, localZ = 0, exertion = 0, breath = time * 1.7, hipDrop = 0;
  const leanSpring = spring(), rollSpring = spring(), weaponLag = spring();

  /** Body-space point → the given joint's parent frame. */
  function toParent(point: THREE.Vector3, bone: THREE.Object3D) {
    world.copy(point); body.localToWorld(world); return bone.parent!.worldToLocal(world);
  }
  function handTarget(side: -1 | 1, out: THREE.Vector3) {
    // Each arm swings with the opposite leg, a beat behind it; running, the
    // elbows bend and the hands pump higher and closer in.
    const run = gait.blend * moveWeight, forward = armSwing[side < 0 ? 0 : 1];
    const swing = forward * (.17 + run * .07) * moveWeight * (1 - crouch * .5);
    const hipY = hips.position.y;
    const rest = out.set(side * (.235 * build + .02 - run * .05), hipY - .02 + run * (.2 + Math.max(0, forward) * .1), -.02 - run * .05 - swing);
    if (down) return rest.set(side * .42, hipY + .1, .05);
    if (seated > .5 && driving > .5) return out.set(side * .19, D.seatedHips + .48, -.42);
    if (heal > .001) {
      // The left forearm held out across the body; the right hand winds round it.
      const wind = healTime * 6.5, pose = side < 0 ? tmpD.set(-.03, hipY + .34, -.3)
        : tmpD.set(-.05 + Math.cos(wind) * .075, hipY + .37 + Math.sin(wind) * .055, -.31 + Math.sin(wind) * .035);
      return rest.lerp(pose, heal);
    }
    const blend = gestureBlend, t = gestureTime;
    if (blend <= .001) return rest;
    const pose = tmpC;
    switch (gesture) {
      case 'clasp': pose.set(side * .035, hipY + .02, -.17); break;
      case 'behind': pose.set(side * .05, hipY + .04, .14); break;
      case 'wipe': pose.copy(side > 0 ? tmpD.set(.16 + Math.cos(t * 5) * .1, hipY + .05, -.42 + Math.sin(t * 5) * .06) : tmpD.set(-.12, hipY + .05, -.3)); break;
      case 'wave': pose.copy(side > 0 ? tmpD.set(.36 + Math.sin(t * 9) * .07, hipY + .82, -.08) : rest); break;
      case 'talk': pose.set(side * (.17 + Math.sin(t * 3.1 + side) * .05), hipY + .28 + Math.sin(t * 4.3 + side * 2) * .06, -.32); break;
      case 'point': pose.copy(side > 0 ? tmpD.set(.26, hipY + .55, -.55) : rest); break;
      case 'offer': pose.copy(side > 0 ? tmpD.set(.1, hipY + .3, -.48) : tmpD.set(-.04, hipY + .28, -.42)); break;
      default: pose.copy(rest);
    }
    return out.copy(rest).lerp(pose, blend);
  }
  function solveFoot(thigh: THREE.Group, shin: THREE.Group, foot: THREE.Group, point: THREE.Vector3, polePoint: THREE.Vector3, pitch: number) {
    solveLimb(thigh, shin, toParent(point, thigh), polePoint, D.thigh, D.shin);
    thigh.updateMatrixWorld(true);
    // Keep the sole level with the body, whatever the knee is doing.
    shin.getWorldQuaternion(tmpQuat2).invert();
    body.getWorldQuaternion(footLevel).multiply(tmpQuat.setFromEuler(footEuler.set(pitch, 0, 0)));
    foot.quaternion.copy(tmpQuat2.multiply(footLevel));
  }

  let aged = 0;
  function update(dt: number, drive: CharacterDrive) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    // Time already passed by age() is not counted twice.
    const clock = Math.max(0, dt - aged); aged = 0;
    time += clock;
    const velocity = drive.velocity ?? { x: 0, z: 0 };
    const turnSpeed = Math.abs(drive.turn ?? 0) * .3;
    const linear = Math.hypot(velocity.x, velocity.z);
    const speed = down ? 0 : Math.max(linear, turnSpeed);
    speedSmoothed = smooth(speedSmoothed, speed, 8, dt);
    if (linear > .05) moveDirection.lerp(wanted.set(velocity.x / linear, velocity.z / linear), 1 - Math.exp(-10 * dt)).normalize();
    else if (turnSpeed > .05) moveDirection.lerp(wanted.set(1, 0), 1 - Math.exp(-6 * dt)).normalize();
    crouch = smooth(crouch, down ? Math.min(1, downTime * 4) : clamp01(drive.crouch ?? 0), 10, dt);
    prone = smooth(prone, drive.prone && !down ? 1 : 0, 6, dt);
    slide = smooth(slide, down ? 0 : clamp01(drive.slide ?? 0), 14, dt);
    seated = smooth(seated, drive.seated && !down ? 1 : 0, 10, dt);
    driving = smooth(driving, drive.driving ? 1 : 0, 10, dt);
    air = smooth(air, drive.airborne && !down ? 1 : 0, 9, dt);
    aim = smooth(aim, clamp01(drive.aim ?? 1), 9, dt);
    const healing = drive.healing !== undefined && !down;
    heal = smooth(heal, healing ? 1 : 0, 8, dt); healTime = healing ? healTime + dt : 0;
    // Special poses keep their own hands/controls. Water never changes movement or hit authority.
    const waterAllowed = !down && !drive.swimming && !drive.driving && !healing && !bailoutRoll(drive.bailoutAge).active;
    const water = waterAllowed ? drive.water : undefined;
    if (water && water !== lastWater) waterTime = 0;
    lastWater = water; waterTime += clock;
    waterBlind = waterAllowed ? smooth(waterBlind, water === 'cannon' ? 1 : 0, 14, dt) : 0;
    waterMist = waterAllowed ? smooth(waterMist, water === 'mist' ? 1 : 0, 14, dt) : 0;
    const wipe = ease(clamp01((Math.sin(waterTime * 3.8) + .3) / .8));
    const waterShield = waterBlind + waterMist * wipe;
    if (dressing) { dressing.visible = heal > .35; dressing.scale.setScalar(.6 + clamp01(drive.healing ?? 0) * .6); }
    kick = Math.max(0, kick - clock * 9); flinch = Math.max(0, flinch - clock * 5);
    if (down) downTime += clock;
    // A released gesture fades back to rest before it is forgotten.
    const requested = drive.gesture ?? 'idle';
    if (requested !== 'idle' && requested !== gesture) { gesture = requested; gestureTime = 0; }
    const gesturing = requested !== 'idle' && seated < .5 && !down;
    gestureTime += dt;
    gestureBlend = smooth(gestureBlend, gesturing ? 1 : 0, 7, dt);
    if (!gesturing && gestureBlend < .02) gesture = 'idle';

    const walking = speedSmoothed * (1 - seated) * (1 - air) * (1 - slide);
    moveWeight = smooth(moveWeight, clamp01((walking - .12) / .9), 10, dt);
    runWeight = smooth(runWeight, drive.sprint === undefined ? clamp01((walking - 2.4) / 2.8) : clamp01(drive.sprint), 6, dt);
    const crawling = prone > .5;
    // Full left/right cycle. Cadence rises with speed so a planted foot covers
    // exactly the ground the body does (gait-motion).
    gaitShape(walking, crouch, gait);
    const stride = crawling ? .55 : gait.stride;
    phase = drive.gaitPhase ?? (phase + walking * dt / stride * Math.PI * 2) % (Math.PI * 4);
    const stepReach = (crawling ? Math.min(stride / 5, .52) : gait.reach) * moveWeight;
    const lift = (.09 + gait.blend * .2 - crouch * .03) * moveWeight;
    footCycle(phase, gait.duty, feet[0], gait.blend); footCycle(phase + Math.PI, gait.duty, feet[1], gait.blend);
    // Body-local acceleration leans the figure into starts, stops and turns.
    const gx = localX, gz = localZ;
    localX = smooth(localX, down ? 0 : velocity.x, 12, dt); localZ = smooth(localZ, down ? 0 : velocity.z, 12, dt);
    const upright = (1 - seated) * (1 - prone) * (1 - slide) * (1 - air) * (down ? 0 : 1);
    const forwardAccel = dt > 0 ? -(localZ - gz) / dt : 0, sideAccel = dt > 0 ? (localX - gx) / dt : 0;
    stepSpring(leanSpring, THREE.MathUtils.clamp(forwardAccel * .028, -.16, .2) * upright, 10, .42, dt);
    stepSpring(rollSpring, THREE.MathUtils.clamp((drive.turn ?? 0) * linear * .03 - sideAccel * .018, -.18, .18) * upright, 9, .5, dt);
    // Breathing quickens and deepens after a run and calms over several seconds.
    exertion = smooth(exertion, runWeight * moveWeight, runWeight * moveWeight > exertion ? 1.2 : .12, dt);
    breath += clock * (1.7 + exertion * 2.2);
    for (let i = 0; i < 2; i++) armSwing[i] = smooth(armSwing[i], feet[1 - i].along * -moveDirection.y, 11, dt);

    // Whole-body placement: prone lies the figure face-down with its head over
    // the root (the eye column); death topples it backwards.
    const fall = down && prone < .5 ? ease(clamp01((downTime - .18) / .55)) : 0;
    body.rotation.set(-prone * Math.PI / 2 + fall * Math.PI / 2, 0, 0);
    body.position.set(0, prone * .14 + fall * .13, prone * 1.62 - fall * 1.05);

    // Trunk.
    const still = 1 - moveWeight, deep = 1 + exertion * 1.6;
    const breathe = Math.sin(breath) * still;
    // A walk vaults over each planted leg; a run sinks into it. The hips sit
    // over the supporting foot and its side rides up as the swing side drops.
    const stepping = moveWeight * (1 - prone) * (1 - seated);
    const support = hipsFromFeet(feet[0], feet[1], gait.blend, .03, .05);
    const bob = support.drop * stepping + gait.blend * .05 * moveWeight;
    // Standing, the weight drifts from leg to leg instead of swaying evenly.
    const standing = still * (1 - crouch) * upright;
    const weight = idleWeight(time) * standing;
    const sway = weight * .038;
    const crouchDrop = crouch * (.4 - seated * .4);
    const hipHeight = seated > .01 ? THREE.MathUtils.lerp(D.standingHips, D.seatedHips, seated) : D.standingHips;
    // Leaning into a stop or start dips the hips a little as the legs take it.
    const settle = Math.abs(leanSpring.value) * .12 + Math.abs(rollSpring.value) * .08;
    hips.position.set(sway + support.shift * (.022 - gait.blend * .012) * stepping - rollSpring.value * .2, hipHeight - crouchDrop - bob - settle + air * .06 - slide * .16, crouch * .08 * (1 - seated) + seated * .02 + slide * .1);
    const lean = runWeight * .28 + moveWeight * .05 * -moveDirection.y;
    // The pelvis turns with the leading leg; the shoulders turn against it.
    const pelvisYaw = (feet[1].along - feet[0].along) * .5 * (.12 + gait.blend * .05) * stepping * -moveDirection.y;
    const pelvisRoll = support.roll * .045 * (1 - gait.blend * .5) * stepping + weight * .06;
    hips.rotation.set(-(crouch * .35 * (1 - seated)) - lean * .4 + slide * .75 - leanSpring.value * .5, pelvisYaw, pelvisRoll + flinch * .06 * flinchSide, 'YXZ');
    const pitchAim = (drive.pitch ?? 0) * (1 - prone * .3);
    const gestureLean = gesture === 'wipe' ? .22 * gestureBlend : gesture === 'offer' ? .1 * gestureBlend : 0;
    // A shouldered weapon keeps the chest square to the aim; empty hands let the shoulders swing.
    const holding = !!weapon && weapon.visible && !down && heal <= .5;
    const twist = holding ? 1 : 1.6, steady = holding ? aim : 0;
    // The hips roll back into a slide; the spine curls forward again so the head and gun stay level.
    spine.rotation.set(-crouch * .05 * (1 - seated) - lean * .35 - gestureLean * .5 + breathe * .012 * deep + flinch * .18 + seated * .05 - slide * .3 - leanSpring.value * .4,
      -pelvisYaw * twist * .55, -pelvisRoll * .75 + rollSpring.value * .7);
    chest.rotation.set(-(pitchAim * .35 * aim) - lean * .25 - gestureLean * .5 + breathe * .02 + flinch * .2 + crouch * .25 * (1 - seated) + fall * .3 - slide * .4 + (leanSpring.value * .9 - breathe * .012 * (deep - 1)) * steady,
      -pelvisYaw * twist * .45 + lookYaw * .3, flinch * -.08 * flinchSide - rollSpring.value * .5 * steady);
    spine.rotation.x += waterBlind * (.1 + .035 * Math.sin(waterTime * 8));
    chest.rotation.x += waterBlind * .12 - waterMist * .06;
    chest.rotation.z += waterBlind * Math.sin(waterTime * 7) * .035;
    chest.scale.set(1, 1 + breathe * .006 * deep, 1 + breathe * .012 * deep);

    hipDrop = bob + settle; stepSpring(weaponLag, hipDrop, 14, .35, dt);
    // Head look and aim.
    let wantYaw = 0, wantPitch = 0;
    if (drive.lookAt && !down) {
      neck.updateWorldMatrix(true, false);
      const eye = body.worldToLocal(neck.getWorldPosition(tmpA));
      const dx = drive.lookAt.x - eye.x, dz = drive.lookAt.z - eye.z, dy = drive.lookAt.y - eye.y - .1;
      wantYaw = THREE.MathUtils.clamp(Math.atan2(-dx, -dz), -1.15, 1.15);
      wantPitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.6, .5);
    } else if (!drive.lookAt && gesture === 'idle') wantYaw = Math.sin(time * .31) * .35 * (1 - moveWeight) * (1 - aim * (weapon ? 1 : 0));
    lookYaw = smooth(lookYaw, wantYaw, 5, dt); lookPitch = smooth(lookPitch, wantPitch, 5, dt);
    const nod = gesture === 'offer' || gesture === 'talk' ? Math.max(0, Math.sin(gestureTime * 5)) * .1 * gestureBlend * (gestureTime < 1.3 ? 1 : 0) : 0;
    // The head stays level and facing the way the figure is going while the trunk rolls and twists under it.
    const trunkRoll = hips.rotation.z + spine.rotation.z + chest.rotation.z, trunkYaw = pelvisYaw * (1 - twist);
    neck.rotation.set(-chest.rotation.x * .4 + pitchAim * .3 * aim + lookPitch * .4 + prone * .55, lookYaw * .35 - trunkYaw * .75 * upright, -trunkRoll * .7 * upright);
    head.rotation.set(pitchAim * .35 * aim + lookPitch * .6 - nod + prone * .65 - fall * .5 + flinch * .25, lookYaw * .5, flinch * .12 * flinchSide);

    head.rotation.y += waterBlind * (.2 + Math.sin(waterTime * 9) * .18) + waterMist * Math.sin(waterTime * 2.8) * .16;
    head.rotation.x -= waterBlind * .12 + waterMist * (.07 + wipe * .06);
    head.rotation.z += waterBlind * Math.sin(waterTime * 7) * .07;

    // Weapon: shouldered when aiming, low ready on the move, across the chest
    // at a run, stowed on the back while driving.
    if (weapon) {
      const ready = aim * (1 - waterBlind * .95 - waterMist * .2) * (1 - runWeight * (1 - aim)), low = 1 - ready, run = runWeight * low;
      weapon.visible = driving < .5 || seated < .5;
      if (heal > .5 && !down) {
        // Hung on its sling, muzzle down at the right hip, while both hands are busy.
        weapon.position.set(.16, -.12, -.08); weapon.rotation.set(-1.25, .2, .15, 'YXZ');
      } else if (down) {
        // Dropped across the chest as the body falls.
        weapon.position.set(0, .08, -.2); weapon.rotation.set(0, 1.4, .1, 'YXZ');
      } else {
        // Prone, the chest frame's -z faces the ground and +y points ahead.
        weapon.position.set(.065 - run * .1 + prone * .05, .135 - low * .1 + prone * .3, -.33 + low * .03 - run * .06 + kick * .045 + prone * .39);
        const swing = run * moveWeight * (1 - prone) * (1 - air) * (1 - slide);
        weapon.position.x += Math.sin(phase) * .018 * swing;
        weapon.position.y += Math.cos(phase * 2) * .012 * swing;
        // A lowered weapon trails the body's bob a moment behind; a shouldered one stays on the sight line.
        weapon.position.y += (hipDrop - weaponLag.value) * low * (1 - prone);
        weapon.rotation.set(pitchAim * .65 * ready - low * .42 - run * .15 + kick * .09 + prone * Math.PI / 2, run * .55 - .04 * ready + Math.sin(phase) * .05 * swing, run * .25 + Math.sin(phase) * .06 * swing, 'YXZ');
      }
    }

    root.updateWorldMatrix(true, true);

    // Legs.
    const proneCrawl = crawling ? moveWeight : 0;
    for (const [thigh, shin, foot, side, index] of [[thighL, shinL, footL, -1, 0], [thighR, shinR, footR, 1, 1]] as const) {
      const cycle = feet[index];
      const along = cycle.along * stepReach * (1 - prone);
      let up = cycle.lift * lift * (1 - prone);
      // Toe-off raises the heel (the ankle lifts, the toe stays down); the toes come up before heel strike.
      const roll = stepping * (1 - crouch * .5), heel = cycle.heel * .45 * roll, toes = cycle.toe * .25 * roll;
      if (cycle.stance >= 0) up += Math.sin(heel) * .17;
      // Standing on one leg, the other knee relaxes with its foot a little forward.
      const relaxed = Math.max(0, -weight * side);
      const spread = .1 + crouch * .04 * (1 - seated) + air * .02 - gait.blend * .025 * moveWeight;
      // Sidesteps are shorter and never cross the feet over.
      const lateral = side * spread + moveDirection.x * along * .65;
      target.set(side < 0 ? Math.min(lateral, -.05) : Math.max(lateral, .05), D.ankle + up + relaxed * .006, moveDirection.y * along - relaxed * .05);
      // A foot dragged into place when the cycle winds down (a stop, a settle) is stepped, not slid.
      const moved = dt > 0 ? Math.hypot(target.x - lastFoot[index].x, target.z - lastFoot[index].z) / dt : 0;
      lastFoot[index].copy(target);
      const other = feet[1 - index], leads = Math.abs(cycle.along) >= Math.abs(other.along);
      settleLift[index] = smooth(settleLift[index], leads ? Math.min(.07, moved * .12) * (1 - moveWeight) * upright : 0, 25, dt);
      target.y += Math.max(0, settleLift[index] - up);
      // Kneel the right leg back in a deep crouch; tuck both in the air.
      target.z += crouch * (1 - seated) * (side > 0 ? .16 : -.12);
      target.y += air * (side > 0 ? .3 : .2) + crouch * (1 - seated) * (side > 0 ? .06 : 0);
      if (seated > .01) target.lerp(tmpB.set(side * .14, D.ankle, -.42), seated);
      if (prone > .01) {
        const crawl = Math.max(0, Math.sin(phase + index * Math.PI)) * proneCrawl;
        target.lerp(tmpB.set(side * (.15 + crawl * .14), hips.position.y - D.thigh - D.shin + .02 + crawl * .3, .05 - crawl * .04), prone);
      }
      // Lying on the back, body-space +z is down: keep the heels on the ground.
      if (fall > .01) target.lerp(tmpB.set(side * .19, hips.position.y - .87 + (side > 0 ? .14 : 0), .03), fall);
      if (slide > .01) target.lerp(tmpB.set(side * .15, D.ankle, side < 0 ? -.68 : -.14), slide);
      pole.set(side * (.15 + prone * .9 + slide * .5), 0, -1).normalize();
      // The pole is a direction in the thigh parent's frame (hips).
      solveFoot(thigh, shin, foot, target, pole, -.04 + (toes - heel) * (1 - prone) + prone * .9);
    }
    root.updateWorldMatrix(false, true);

    // Arms: on the weapon when carried, otherwise relaxed or gesturing.
    const armed = !!weapon && weapon.visible && !down && heal <= .5;
    for (const [upper, lower, hand, side] of [[upperArmL, forearmL, handL, -1], [upperArmR, forearmR, handR, 1]] as const) {
      let goal: THREE.Vector3;
      if (armed && grip && fore) {
        const anchor = side > 0 ? grip : fore;
        goal = upper.parent!.worldToLocal(anchor.getWorldPosition(world));
        // Prone, elbows go down to the ground (chest -z).
        pole.set(side * .8, -1 + prone * .8, (side > 0 ? .5 : .1) - prone * 1.4).normalize();
      } else {
        goal = toParent(handTarget(side, target), upper);
        const raised = gesture === 'wave' && side > 0 ? gestureBlend : 0;
        pole.set(side * (.35 + raised), -.2 * (1 - raised), 1 - raised * .6).normalize();
      }
      // Keep the firing hand on the lowered weapon; blend the off hand to the brow.
      // Head-local targets work for standing, crouched and prone figures alike.
      const shield = side < 0 ? waterShield : 0;
      if (shield > .001) {
        waterTarget.set(-.08 + Math.sin(waterTime * (waterBlind > .5 ? 8 : 5)) * .09, .17, -.23);
        head.localToWorld(waterTarget); upper.parent!.worldToLocal(waterTarget);
        goal.lerp(waterTarget, shield);
        pole.lerp(waterTarget.set(-1, -.2, -.25).normalize(), shield).normalize();
      }
      solveLimb(upper, lower, goal, pole, D.upperArm, D.forearm);
      if (armed && weapon) {
        upper.updateMatrixWorld(true);
        lower.getWorldQuaternion(tmpQuat2).invert();
        weapon.getWorldQuaternion(tmpQuat).multiply(footLevel.setFromEuler(footEuler.set(side > 0 ? -1.75 : -1.35, 0, side > 0 ? .1 : -.5)));
        hand.quaternion.copy(tmpQuat2.multiply(tmpQuat));
      } else hand.rotation.set(gesture === 'wave' && side > 0 ? .2 * gestureBlend : -.05, 0, side * -.08);
      if (shield > .001) {
        // Open palm across the eyes instead of retaining the rifle-grip wrist angle.
        hand.quaternion.slerp(tmpQuat.setFromEuler(footEuler.set(-.25, 0, -.3)), shield);
      }
    }
    if(drive.swimming && !down){
      const stroke=time*3.5;
      for(const [side,sign] of [['L',-1],['R',1]] as const){
        const phase=stroke+(side==='L'?0:Math.PI);
        joints[`upperArm${side}`].rotation.set(-1.1+Math.sin(phase)*.55,0,sign*(.5+Math.cos(phase)*.18));
        joints[`forearm${side}`].rotation.set(-.65+Math.cos(phase)*.25,0,0);
        joints[`thigh${side}`].rotation.x=Math.sin(phase)*.18;
      }
    }
    const roll = bailoutRoll(drive.bailoutAge);
    if (roll.active && !down && !drive.seated) {
      // Rotate a tucked figure about the hips, lowering that pivot toward the ground.
      body.rotation.set(roll.angle, 0, Math.sin(roll.angle) * .18);
      body.position.set(0, D.standingHips * (1 - Math.cos(roll.angle)) - roll.tuck * .3, -D.standingHips * Math.sin(roll.angle));
      spine.rotation.x += roll.tuck * .9;
      chest.rotation.x += roll.tuck * .4;
      for (const side of ['L', 'R'] as const) {
        joints[`thigh${side}`].rotation.x = -roll.tuck * 1.9;
        joints[`shin${side}`].rotation.x = roll.tuck * 2.3;
        joints[`upperArm${side}`].rotation.x = -roll.tuck * .8;
        joints[`forearm${side}`].rotation.x = -roll.tuck * 1.8;
      }
    }
  }

  const rig: CharacterRig = {
    root, body, weapon, muzzle, joints, skinned, resources,
    update,
    age(dt: number) { if (!Number.isFinite(dt) || dt <= 0) return; aged += dt; time += dt; breath += dt * (1.7 + exertion * 2.2); if (down) downTime += dt; kick = Math.max(0, kick - dt * 9); flinch = Math.max(0, flinch - dt * 5); },
    fire() { kick = 1; aim = Math.max(aim, .8); },
    flinch() { flinch = 1; flinchSide = Math.random() < .5 ? -1 : 1; },
    setDown(next: boolean) { if (next === down) return; down = next; downTime = 0; waterBlind = waterMist = waterTime = 0; lastWater = undefined; if (!next) { crouch = 0; prone = 0; } },
    get down() { return down; },
    get downTime() { return downTime; },
    dispose() { root.removeFromParent(); resources.forEach(resource => resource.dispose()); resources.length = 0; },
  };
  update(0, {});
  return rig;
}
