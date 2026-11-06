import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arenaCharacterLook } from './character-looks';
import { createCharacterRig, SKINNED_FIGURE_BOUNDS, type CharacterDrive, type CharacterLook, type CharacterRig } from './character-rig';

/** Every arena faction and the roles with distinct kit, plus a hand-made look with camo on everything and eyewear. */
const LOOKS: [string, CharacterLook][] = [
  ...(['armed-forces', 'mercenaries', 'freedom-force', 'collective-cops'] as const).flatMap(faction =>
    (['rifle', 'overwatch', 'heavy', 'tank', 'sniper'] as const).map(role => [`${faction}/${role}`, arenaCharacterLook({ bot: true, role, faction, id: `${faction}-${role}`, rank: 2 })] as [string, CharacterLook])),
  ['camo and eyewear', { skin: '#a77b5a', hair: '#211a16', top: '#55603f', bottom: '#4a5238', shoes: '#262420', headwear: 'helmet', vest: '#3c4430', plates: true,
    eyewear: '#16191c', weapon: 'marksman', camo: { pattern: { style: 'digital', colors: ['#3d4a2c', '#6b6a4a', '#2a2f22'], scale: 9 }, on: 'all', headwear: true } }],
];
/** Each pose `update` makes, reached by a second of the same drive. */
const POSES: [string, CharacterDrive, boolean?][] = [
  ['standing', {}], ['walking aim', { velocity: { x: .4, z: -2 }, pitch: .3, aim: 1 }], ['running', { velocity: { x: 0, z: -6 }, aim: 0 }],
  ['crouched', { crouch: 1, pitch: -.4 }], ['prone crawl', { prone: true, velocity: { x: 0, z: -.6 } }], ['seated driving', { seated: true, driving: true }],
  ['sliding', { slide: 1, velocity: { x: 0, z: -7 } }], ['swimming', { swimming: true, velocity: { x: 0, z: -1 } }], ['airborne', { airborne: true }],
  ['healing', { healing: .5 }], ['bailout roll', { bailoutAge: .35 }], ['waving', { gesture: 'wave' }], ['fallen', {}, true],
];

function pose(rig: CharacterRig, drive: CharacterDrive, fallen = false) {
  rig.root.position.set(3, .2, -4); rig.root.rotation.y = .7;
  if (fallen) rig.setDown(true);
  for (let i = 0; i < 20; i++) rig.update(.05, drive);
  rig.root.updateMatrixWorld(true);
}
/** World positions of every body vertex, grouped by joint: the skinned figure as the GPU would place them. */
function skinnedVertices(rig: CharacterRig) {
  const out = new Map<number, THREE.Vector3[]>();
  for (const mesh of rig.root.children.filter((c): c is THREE.SkinnedMesh => c instanceof THREE.SkinnedMesh)) {
    mesh.skeleton.update();
    const bones = mesh.geometry.getAttribute('skinIndex');
    for (let i = 0; i < bones.count; i++) {
      const v = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      const list = out.get(bones.getX(i)) ?? []; list.push(v); out.set(bones.getX(i), list);
    }
  }
  return out;
}
/** The same, from the per-joint meshes, skin material first then gear, as the skinned meshes are built. */
function jointVertices(rig: CharacterRig) {
  const out = new Map<number, THREE.Vector3[]>();
  const joints = Object.values(rig.joints);
  for (const metal of [false, true]) joints.forEach((joint, index) => {
    for (const mesh of joint.children) {
      if (!(mesh instanceof THREE.Mesh) || mesh.name !== `${joint.name}-mesh` || ((mesh.material as THREE.MeshStandardMaterial).metalness > .3) !== metal) continue;
      const position = mesh.geometry.getAttribute('position'), list = out.get(index) ?? [];
      for (let i = 0; i < position.count; i++) list.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
      out.set(index, list);
    }
  });
  return out;
}

describe('skinned figures', () => {
  it.each(LOOKS)('puts every vertex of %s exactly where the per-joint meshes do, in every pose', (_, look) => {
    for (const [, drive, fallen] of POSES) {
      const before = createCharacterRig(look, 'same-name'), after = createCharacterRig(look, 'same-name', { skinned: true });
      try {
        pose(before, drive, fallen); pose(after, drive, fallen);
        const expected = jointVertices(before), actual = skinnedVertices(after);
        expect(expected.size).toBeGreaterThanOrEqual(15);
        expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
        // Within a joint the skinned geometry keeps the merged per-joint order, but skin and gear are separate meshes.
        for (const [index, points] of expected) {
          const got = actual.get(index)!;
          expect(got.length).toBe(points.length);
          let worst = 0; points.forEach((p, i) => { worst = Math.max(worst, p.distanceTo(got[i])); });
          expect(worst).toBeLessThan(1e-5);
        }
      } finally { before.dispose(); after.dispose(); }
    }
  });

  it('keeps every pose inside the fixed culling bounds', () => {
    let worstPose = 0;
    for (const [, look] of LOOKS) for (const [name, drive, fallen] of POSES) {
      const rig = createCharacterRig(look, 'bounds', { skinned: true });
      try {
        pose(rig, drive, fallen);
        const toRoot = rig.root.matrixWorld.clone().invert();
        let farthest = 0;
        for (const points of skinnedVertices(rig).values()) for (const p of points) farthest = Math.max(farthest, p.applyMatrix4(toRoot).distanceTo(SKINNED_FIGURE_BOUNDS.center));
        expect(farthest, name).toBeLessThan(SKINNED_FIGURE_BOUNDS.radius); worstPose = Math.max(worstPose, farthest);
      } finally { rig.dispose(); }
    }
    // Tight enough that the bounds still cull: no more than a hand's width to spare.
    expect(worstPose).toBeGreaterThan(SKINNED_FIGURE_BOUNDS.radius - .25);
  });

  it('gives the same hits, points and surface normals as the per-joint meshes', () => {
    let s = 5; const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let compared = 0;
    for (const [, look] of [LOOKS[0], LOOKS[6], LOOKS.at(-1)!]) for (const [, drive, fallen] of [POSES[0], POSES[1], POSES[4], POSES.at(-1)!]) {
      const before = createCharacterRig(look, 'rays'), after = createCharacterRig(look, 'rays', { skinned: true });
      try {
        pose(before, drive, fallen); pose(after, drive, fallen);
        for (let i = 0; i < 120; i++) {
          const aim = new THREE.Vector3(3 + random() - .5, .2 + random() * 1.9, -4 + random() - .5);
          const from = aim.clone().add(new THREE.Vector3(random() - .5, random() - .5, random() - .5).normalize().multiplyScalar(5));
          const ray = new THREE.Raycaster(from, aim.clone().sub(from).normalize(), 0, 10);
          const summary = (rig: CharacterRig) => ray.intersectObject(rig.root, true).map(h => ({
            distance: +h.distance.toFixed(6), point: h.point.toArray().map(v => +v.toFixed(5)),
            normal: h.face!.normal.clone().transformDirection(h.object.matrixWorld).toArray().map(v => +v.toFixed(4)) }));
          const expected = summary(before), actual = summary(after);
          expect(actual).toEqual(expected);
          if (expected.length) compared++;
        }
      } finally { before.dispose(); after.dispose(); }
    }
    expect(compared).toBeGreaterThan(300);
  });

  it('draws a figure with two or three meshes instead of a mesh per joint', () => {
    const count = (rig: CharacterRig) => { let meshes = 0; rig.root.traverseVisible(o => { if (o instanceof THREE.Mesh) meshes++; }); return meshes; };
    for (const [, look] of LOOKS) {
      const before = createCharacterRig(look, 'draws'), after = createCharacterRig(look, 'draws', { skinned: true });
      try {
        expect(count(before)).toBeGreaterThanOrEqual(15);
        expect(count(after)).toBeLessThanOrEqual(look.eyewear ? 3 : 2);
        expect(after.skinned).toBeInstanceOf(THREE.SkinnedMesh);
        if (look.camo) expect(after.skinned!.geometry.getAttribute('fabric')).toBeDefined();
        // A material shared by a skinned and a plain mesh switches shader programs on every draw.
        const kinds = new Map<THREE.Material, Set<boolean>>();
        after.root.traverse(o => { if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) kinds.set(m, (kinds.get(m) ?? new Set()).add(o instanceof THREE.SkinnedMesh)); });
        expect([...kinds.values()].every(k => k.size === 1)).toBe(true);
      } finally { before.dispose(); after.dispose(); }
    }
  });
});
