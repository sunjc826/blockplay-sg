import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { arenaCharacterLook, npcCharacterLook } from './character-looks';
import { createCharacterRig, type CharacterRig } from './character-rig';

/** Where arena-rules measures a standing figure's hit spheres from. */
const GAME_EYE = 1.75;
import { faceted, loft, taper, triangleCount } from './character-shapes';

/** Every face normal points away from `inside`, and the stored normals are those face normals. */
function facesOutward(geometry: THREE.BufferGeometry, inside: THREE.Vector3) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.index!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), stored = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
    face.crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (face.length() < 1e-9) continue;
    face.normalize();
    if (face.dot(a.clone().add(b).add(c).divideScalar(3).sub(inside)) <= 0) return false;
    if (stored.fromBufferAttribute(normal, index.getX(i)).dot(face) < .999) return false;
  }
  return true;
}
const bonePoints = (rig: CharacterRig, bone: 'head' | 'chest') => {
  rig.root.updateMatrixWorld(true);
  const mesh = rig.joints[bone].getObjectByName(`rig-${bone}-mesh`) as THREE.Mesh, position = mesh.geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
};

describe('faceted character shapes', () => {
  it('lofts a closed, outward-facing, flat-shaded skin with a flat edge straight ahead', () => {
    const rings = [{ y: 0, halfWidth: .05, front: .06, back: .05 }, { y: .1, halfWidth: .1, front: .1, back: .11 }, { y: .2, halfWidth: .04, front: .03, back: .05 }];
    const skin = loft(rings, 10);
    expect(triangleCount(skin)).toBe(2 * 10 * 2 + 2 * 8);
    expect(facesOutward(skin, new THREE.Vector3(0, .1, 0))).toBe(true);
    skin.computeBoundingBox();
    expect(skin.boundingBox!.min.z).toBeCloseTo(-.1, 2); expect(skin.boundingBox!.max.z).toBeCloseTo(.11, 2);
    const position = skin.getAttribute('position'), front = new Set<string>();
    for (let i = 0; i < position.count; i++) if (Math.abs(position.getY(i) - .1) < 1e-6 && position.getZ(i) < -.099) front.add(position.getX(i).toFixed(4));
    expect(front.size).toBe(2);
  });

  it('starts a slice behind the axis when its front is negative, as hair behind the ears does', () => {
    const back = loft([{ y: 0, halfWidth: .1, front: -.04, back: .12 }, { y: .1, halfWidth: .1, front: -.04, back: .12 }], 8);
    back.computeBoundingBox();
    expect(back.boundingBox!.min.z).toBeGreaterThan(.02);
    expect(facesOutward(back, new THREE.Vector3(0, .05, .08))).toBe(true);
  });

  it('tapers a block, centred or flush against the surface behind it', () => {
    const centred = taper({ x: .02, z: .02 }, { x: .04, z: .06 }, .1), flush = taper({ x: .02, z: .02 }, { x: .04, z: .06 }, .1, 'back');
    expect(triangleCount(centred)).toBe(12);
    expect(facesOutward(centred, new THREE.Vector3())).toBe(true);
    expect(facesOutward(flush, new THREE.Vector3(0, 0, -.01))).toBe(true);
    flush.computeBoundingBox();
    expect(flush.boundingBox!.max.z).toBeCloseTo(0, 6); expect(flush.boundingBox!.min.z).toBeCloseTo(-.06, 6);
  });

  it('merges with three primitives', () => {
    const merged = mergeGeometries([loft([{ y: 0, halfWidth: .1, front: .1, back: .1 }, { y: .1, halfWidth: .1, front: .1, back: .1 }]), taper({ x: 1, z: 1 }, { x: 1, z: 1 }, 1), faceted(new THREE.CylinderGeometry(1, 1, 1, 6)), new THREE.BoxGeometry(1, 1, 1)], false);
    expect(merged).toBeTruthy();
  });
});

describe('modelled heads', () => {
  const local = npcCharacterLook({ id: 'head-test', role: 'resident', interaction: { kind: 'dialogue' } });

  it('gives the face planes and features instead of one ball', () => {
    const rig = createCharacterRig({ ...local, headwear: 'none', hairStyle: 'bald' });
    const mesh = rig.joints.head.getObjectByName('rig-head-mesh') as THREE.Mesh, normal = mesh.geometry.getAttribute('normal'), position = mesh.geometry.getAttribute('position');
    // A ball has a different normal at every vertex; a faceted head repeats one per plane.
    const planes = new Set<string>();
    for (let i = 0; i < normal.count; i++) planes.add([normal.getX(i), normal.getY(i), normal.getZ(i)].map(v => v.toFixed(2)).join());
    expect(planes.size).toBeLessThan(normal.count / 2.5);
    // The chin is narrower than the cheekbones, and the nose stands proud of the brow and the mouth.
    const span = (from: number, to: number, pick: (i: number) => number) => { let max = -Infinity; for (let i = 0; i < position.count; i++) if (position.getY(i) >= from && position.getY(i) < to) max = Math.max(max, pick(i)); return max; };
    expect(span(-.03, 0, i => Math.abs(position.getX(i)))).toBeLessThan(span(.09, .13, i => Math.abs(position.getX(i))) * .7);
    expect(span(.06, .1, i => -position.getZ(i))).toBeGreaterThan(span(.16, .2, i => -position.getZ(i)) + .02);
    rig.dispose();
  });

  it('keeps the bare head and every hat inside the head hit sphere', () => {
    // arena-rules: a 0.29 m sphere 0.13 m under the eye.
    const centre = new THREE.Vector3(0, GAME_EYE - .13, 0);
    const looks = [{ ...local, headwear: 'none' as const }, { ...local, headwear: 'cap' as const }, arenaCharacterLook({ bot: true, faction: 'armed-forces', role: 'assault', rank: 3 }), arenaCharacterLook({ bot: true, faction: 'mercenaries', role: 'tank', rank: 3 }), arenaCharacterLook({ bot: true, faction: 'mercenaries', role: 'assault', rank: 1 }), arenaCharacterLook({ bot: true, faction: 'mercenaries', role: 'sniper', rank: 2 })];
    for (const look of looks) {
      const rig = createCharacterRig({ ...look, weapon: null });
      for (let frame = 0; frame < 60; frame++) rig.update(1 / 60, {});
      for (const point of bonePoints(rig, 'head')) expect(point.distanceTo(centre)).toBeLessThan(.29);
      rig.dispose();
    }
  });
});

describe('faction silhouettes', () => {
  const rifleman = (faction: string) => arenaCharacterLook({ bot: true, faction, role: 'assault', rank: 3, id: 'same-soldier' });

  it('stands a kite beside a contractor head and squares a soldier with a bedroll, both inside what a shot hits', () => {
    const head = new THREE.Vector3(0, GAME_EYE - .13, 0);
    const reach = (faction: string) => {
      const rig = createCharacterRig({ ...rifleman(faction), weapon: null });
      for (let frame = 0; frame < 60; frame++) rig.update(1 / 60, { aim: 0 });
      const points = bonePoints(rig, 'chest'); rig.dispose();
      return points;
    };
    const kite = reach('mercenaries').filter(point => point.y > 1.6), plain = reach('armed-forces').filter(point => point.y > 1.6);
    expect(kite.length).toBeGreaterThan(20); expect(plain.length).toBe(0);
    expect(Math.max(...kite.map(point => point.y))).toBeGreaterThan(1.8);
    for (const point of kite) expect(point.distanceTo(head)).toBeLessThan(.29);
    // The bedroll, in the chest's own frame: wider than the shoulders, but no wider than the
    // 0.25 m the head and torso spheres still cover between them at shoulder height.
    const rig = createCharacterRig({ ...rifleman('armed-forces'), weapon: null });
    const local = (rig.joints.chest.getObjectByName('rig-chest-mesh') as THREE.Mesh).geometry.getAttribute('position');
    let reachX = 0;
    for (let i = 0; i < local.count; i++) if (local.getZ(i) > .2 && local.getY(i) > .15) reachX = Math.max(reachX, Math.abs(local.getX(i)));
    expect(reachX).toBeGreaterThan(.22); expect(reachX).toBeLessThan(.25);
    rig.dispose();
  });

  it('gives each side its own helmet and the forces pale gaiters when every colour is the same', () => {
    const grey = { skin: '#888888', hair: '#888888', top: '#888888', bottom: '#888888', shoes: '#888888', vest: '#888888', headwear: 'helmet' as const, headwearColor: '#888888' };
    const field = createCharacterRig({ ...grey, uniform: 'field' }), contractor = createCharacterRig({ ...grey, uniform: 'contractor' });
    const top = (rig: CharacterRig) => Math.max(...bonePoints(rig, 'head').map(point => point.y)), width = (rig: CharacterRig) => Math.max(...bonePoints(rig, 'head').map(point => Math.abs(point.x)));
    expect(top(contractor)).toBeGreaterThan(top(field) + .02);
    expect(width(field)).toBeGreaterThan(width(contractor) + .015);
    const shin = (rig: CharacterRig) => (rig.joints.shinL.getObjectByName('rig-shinL-mesh') as THREE.Mesh).geometry.getAttribute('position').count;
    expect(shin(field)).toBeGreaterThan(shin(contractor));
    field.dispose(); contractor.dispose();
  });
});
