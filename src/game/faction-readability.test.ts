import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arenaCharacterLook, npcCharacterLook } from './character-looks';
import { createCharacterRig, type CharacterLook, type CharacterRig } from './character-rig';

const roles = ['assault', 'tank', 'sniper', 'mortar-crew', 'overwatch', 'elite-gunner', 'elite-commander'];
function meshes(rig: CharacterRig) {
  const found: THREE.Mesh[] = [];
  rig.root.traverse(node => { if (node instanceof THREE.Mesh) found.push(node); });
  return found;
}
const shape = (rig: CharacterRig) => meshes(rig).map(mesh => Array.from(mesh.geometry.getAttribute('position').array));

describe('colour-independent soldier recognition', () => {
  it('keeps a faction silhouette through every role and rank, including friendly event crews and remote players', () => {
    for (const faction of ['armed-forces', 'mercenaries']) for (const role of roles) for (const rank of [1, 2, 3]) {
      const look = arenaCharacterLook({ bot: true, faction, role, rank, id: 'same-soldier' });
      expect(look.uniform).toBe(faction === 'armed-forces' ? 'field' : 'contractor');
    }
    expect(arenaCharacterLook({ bot: false, role: 'player' }).uniform).toBe('field');
    expect(npcCharacterLook({ id: 'local', role: 'resident', interaction: { kind: 'dialogue' } }).uniform).toBeUndefined();
  });

  it('changes actual geometry when all colours, rank, weapon and headwear are held identical', () => {
    const base: CharacterLook = { skin: '#888888', hair: '#888888', top: '#888888', bottom: '#888888', shoes: '#888888', vest: '#888888', plates: true, headwear: 'helmet', headwearColor: '#888888' };
    const field = createCharacterRig({ ...base, uniform: 'field' });
    const contractor = createCharacterRig({ ...base, uniform: 'contractor' });
    expect(shape(field)).not.toEqual(shape(contractor));
    for (const bone of ['chest', 'head', 'upperArmL', 'upperArmR'] as const) {
      const positions = (rig: CharacterRig) => (rig.joints[bone].getObjectByName(`rig-${bone}-mesh`) as THREE.Mesh).geometry.getAttribute('position').array;
      expect(positions(field)).not.toEqual(positions(contractor));
    }
    field.dispose(); contractor.dispose();
  });

  it('gives support jobs different equipment even with a hidden weapon and identical headwear', () => {
    for (const faction of ['armed-forces', 'mercenaries']) {
      const look = arenaCharacterLook({ bot: true, role: 'assault', faction, id: 'same-soldier' });
      const shapes = ['rifleman', 'gunner', 'marksman', 'mortar'].map(roleKit => {
        const rig = createCharacterRig({ ...look, headwear: 'helmet', weapon: null, roleKit: roleKit as CharacterLook['roleKit'] });
        const result = JSON.stringify(shape(rig)); rig.dispose(); return result;
      });
      expect(new Set(shapes).size).toBe(4);
    }
    for (const faction of ['armed-forces', 'mercenaries']) for (const [role, roleKit] of [['assault', 'rifleman'], ['tank', 'gunner'], ['sniper', 'marksman'], ['overwatch', 'marksman'], ['mortar-crew', 'mortar'], ['elite-gunner', 'gunner'], ['elite-commander', 'marksman']]) {
      expect(arenaCharacterLook({ bot: true, role, faction }).roleKit).toBe(roleKit);
    }
  });

  it('adds no mesh draws and stays within the character geometry budget in combat poses', () => {
    for (const faction of ['armed-forces', 'mercenaries']) for (const role of roles) {
      const look = arenaCharacterLook({ bot: true, role, faction, rank: 3, id: 'same-soldier' });
      const rig = createCharacterRig(look), baseline = createCharacterRig({ ...look, uniform: undefined, roleKit: undefined });
      expect(meshes(rig).length).toBe(meshes(baseline).length);
      expect(meshes(rig).reduce((total, mesh) => total + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0)).toBeLessThan(6500);
      for (const drive of [{ velocity: { x: 0, z: -4 } }, { crouch: 1 }, { prone: true }, { seated: true }, { healing: .5 }]) {
        for (let frame = 0; frame < 30; frame++) rig.update(1 / 60, drive);
        rig.root.updateMatrixWorld(true);
        rig.root.traverse(node => expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      }
      rig.dispose(); baseline.dispose();
    }
  });
});
