import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArenaFaction, listArenaFactions, SQUAD_FACTIONS } from './arena-factions';
import { getArenaRole } from './arena-roles';
import { createCharacterRig, type CharacterLook } from './character-rig';
import { PROXY_FACTIONS, proxyCharacterLook } from './proxy-factions';

const meshList = (root: THREE.Object3D) => {
  const meshes: THREE.Mesh[] = []; root.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); }); return meshes;
};

describe('proxy faction art prototypes', () => {
  it('registers independent identities without adding ambient squads or specialist role selections', () => {
    expect(SQUAD_FACTIONS).toEqual(['armed-forces', 'mercenaries']);
    for (const faction of PROXY_FACTIONS) {
      expect(getArenaFaction(faction.id)?.independent).toBe(true);
      expect(listArenaFactions().some(active => active.id === faction.id)).toBe(true);
      expect('side' in faction).toBe(false);
      for (const operator of faction.operators) expect(getArenaRole(operator.id)).toBeUndefined();
    }
  });

  it('has valid, distinct palettes and two bespoke jobs per faction', () => {
    const colors = new Set<string>(), operators = new Set<string>();
    for (const faction of PROXY_FACTIONS) {
      expect(faction.operators).toHaveLength(2);
      for (const hex of [...Object.values(faction.palette), ...faction.swatches.map(swatch => swatch.hex), faction.panel, faction.accent, faction.identification.field, faction.identification.mark, ...faction.camo.colors]) expect(hex).toMatch(/^#[a-f\d]{6}$/i);
      expect(colors.has(faction.panel)).toBe(false); colors.add(faction.panel);
      const light = new THREE.Color(faction.identification.mark), dark = new THREE.Color(faction.identification.field);
      const luminance = (color: THREE.Color) => color.r * .2126 + color.g * .7152 + color.b * .0722;
      expect((luminance(light) + .05) / (luminance(dark) + .05)).toBeGreaterThan(6);
      for (const operator of faction.operators) { expect(operators.has(operator.id)).toBe(false); operators.add(operator.id); }
    }
    expect(operators.size).toBe(4);
    expect(() => proxyCharacterLook('freedom-force', 'bastion')).toThrow(/pairing/);
  });

  it('keeps faces deterministic and independent of geopolitical inspiration', () => {
    const faces = PROXY_FACTIONS.flatMap(faction => faction.operators.map(operator => {
      const look = proxyCharacterLook(faction.id, operator.id, 'same-person');
      expect(proxyCharacterLook(faction.id, operator.id, 'same-person')).toEqual(look);
      return `${look.skin}:${look.hair}`;
    }));
    expect(new Set(faces).size).toBe(1);
  });

  it('gives all four operators distinct equipment geometry without weapons or color', () => {
    const shapes = PROXY_FACTIONS.flatMap(faction => faction.operators.map(operator => {
      const look = proxyCharacterLook(faction.id, operator.id);
      const neutral: CharacterLook = { ...look, weapon: null, skin: '#888888', hair: '#888888', top: '#888888', bottom: '#888888', vest: '#888888', panel: '#888888', headwearColor: '#888888', camo: undefined };
      const rig = createCharacterRig(neutral);
      const shape = JSON.stringify(meshList(rig.root).map(mesh => Array.from(mesh.geometry.getAttribute('position').array)));
      rig.dispose(); return shape;
    }));
    expect(new Set(shapes).size).toBe(4);
  });

  it('fits the existing render budget and animates and disposes the complete models', () => {
    for (const faction of PROXY_FACTIONS) for (const operator of faction.operators) {
      const rig = createCharacterRig(proxyCharacterLook(faction.id, operator.id));
      const meshes = meshList(rig.root);
      expect(meshes.length).toBeLessThanOrEqual(20);
      expect(meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0)).toBeLessThan(6500);
      for (const mesh of meshes) expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      for (const drive of [{ velocity: { x: 0, z: -3 } }, { crouch: 1 }, { prone: true }, { seated: true }, { healing: .5 }]) {
        for (let frame = 0; frame < 30; frame++) rig.update(1 / 60, drive);
        rig.root.updateMatrixWorld(true);rig.root.traverse(node => expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      }
      let disposed = 0; for (const resource of rig.resources) if ('addEventListener' in resource) (resource as THREE.BufferGeometry).addEventListener('dispose', () => disposed++);
      const resourceCount = rig.resources.length;
      rig.dispose(); expect(disposed).toBe(resourceCount);
    }
  });
});
