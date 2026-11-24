import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LEAF_MASS_TRIANGLES, LEAF_REED_TRIANGLES, leafReedGeometry, LEAF_PATTERNS, LEAF_VARIANTS, cutLeafCards, leafMassGeometry, drawLeafAtlas, hasLeafCards, inheritLeafCards, layoutSpray, leafCardFragment, leafCardVertex, leafTile } from './leaf-cards';
import { buildPlant } from './plant-models';
import { PLANT_SPECIES, PLANT_SPECS } from './plant-species';
import { batchTrees, leafShape, treePart } from './tree-wind';
import { createSceneCover } from './scene-cover';
import { isVisualCover } from './cover-kind';

describe('leaf sprays', () => {
  it('gives every arrangement its own tiles inside the atlas', () => {
    const seen = new Set<number>();
    for (const pattern of LEAF_PATTERNS) for (let variant = 0; variant < LEAF_VARIANTS; variant++) {
      const tile = leafTile(pattern, variant);
      expect(seen.has(tile.index)).toBe(false); seen.add(tile.index);
      expect(tile.u).toBeGreaterThanOrEqual(0); expect(tile.u + tile.side).toBeLessThanOrEqual(1);
      expect(tile.v).toBeGreaterThanOrEqual(0); expect(tile.v + tile.side).toBeLessThanOrEqual(1);
    }
    expect(leafTile('whorl', LEAF_VARIANTS + 1).index).toBe(leafTile('whorl', 1).index);
  });

  it('lays out separate leaves on a twig, inside the tile, the same every time', () => {
    for (const pattern of LEAF_PATTERNS) for (let variant = 0; variant < LEAF_VARIANTS; variant++) {
      const spray = layoutSpray(pattern, variant);
      expect(layoutSpray(pattern, variant)).toEqual(spray);
      expect(spray.leaves.length).toBeGreaterThan(20); expect(spray.twigs.length).toBeGreaterThan(20);
      // A rain tree's leaflets turn with their pinna; every other leaf turns alone.
      if (pattern === 'bipinnate') expect(spray.leaves.length).toBeGreaterThan(spray.groups.length * 6);
      else expect(spray.groups.length).toBe(spray.leaves.length);
      for (const leaf of spray.leaves) {
        const tipX = leaf.x + Math.cos(leaf.angle) * leaf.length, tipY = leaf.y + Math.sin(leaf.angle) * leaf.length;
        for (const v of [leaf.x, leaf.y, tipX, tipY]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
        // A leaf, not a slab: none longer than a fifth of the card.
        expect(leaf.length).toBeLessThan(.2); expect(leaf.width).toBeLessThan(leaf.length);
      }
    }
    expect(layoutSpray('opposite', 0)).not.toEqual(layoutSpray('opposite', 1));
  });

  it('draws an atlas that is part leaf and part sky in every tile, with a stalk for every point', () => {
    const atlas = drawLeafAtlas();
    expect(atlas.map.length).toBe(atlas.size * atlas.size * 4); expect(atlas.ids.length).toBe(atlas.idSize * atlas.idSize * 4);
    expect(atlas.cover).toHaveLength(LEAF_PATTERNS.length * LEAF_VARIANTS + 1);
    for (const cover of atlas.cover) { expect(cover).toBeGreaterThan(.25); expect(cover).toBeLessThan(.7); }
    // The sixteenth tile is the clump of blades, apart from every leaf tile.
    expect(leafTile('blades', 0).index).toBe(15); expect(layoutSpray('blades', 0).leaves.every(leaf => leaf.shape === 'blade' && leaf.length > leaf.width * 8)).toBe(true);
    // Phases are never zero inside a used tile: zero marks a surface that is not a card.
    const tile = leafTile('opposite', 0), x = Math.round((tile.u + tile.side / 2) * atlas.idSize), y = Math.round((tile.v + tile.side / 2) * atlas.idSize);
    expect(atlas.ids[(y * atlas.idSize + x) * 4 + 2]).toBeGreaterThan(0);
  });

  it('marks tree sprays as cards and leaves everything else solid', () => {
    for (const species of PLANT_SPECIES) {
      const spec = PLANT_SPECS[species], leaf = buildPlant(species).leaf;
      const card = leaf.getAttribute('leafCard'), lever = leaf.getAttribute('leafLever'), position = leaf.getAttribute('position');
      expect(card.count).toBe(position.count); expect(lever.count).toBe(position.count);
      let cards = 0;
      for (let i = 0; i < card.count; i++) {
        if (card.getZ(i) === 0) continue;
        cards++;
        if (spec.kind !== 'tree') continue;
        const tile = leafTile(spec.crown.foliage, 0), row = tile.v;
        expect(card.getX(i)).toBeGreaterThanOrEqual(0); expect(card.getX(i)).toBeLessThanOrEqual(1);
        expect(card.getY(i)).toBeGreaterThanOrEqual(Math.min(row, leafTile(spec.crown.foliage, 2).v) - 1e-6);
        expect(card.getW(i)).toBeGreaterThan(.5);
        expect(Math.abs(lever.getX(i))).toBeCloseTo(.5, 5); expect([0, 1]).toContain(lever.getY(i));
      }
      if (spec.kind === 'tree') expect(cards).toBeGreaterThan(position.count * .5); else expect(cards).toBe(0);
    }
  });

  it('patches the lit material once and hands the cut to batched clones and their shadows', () => {
    const material = cutLeafCards(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })), key = material.customProgramCacheKey();
    expect(cutLeafCards(material).customProgramCacheKey()).toBe(key); expect(key).toContain('leaf-cards');
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <alphatest_fragment>' };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain(leafCardVertex); expect(shader.vertexShader.indexOf('#include <begin_vertex>')).toBeLessThan(shader.vertexShader.indexOf('vLeafCard = leafCard'));
    expect(shader.fragmentShader.indexOf('discard')).toBeLessThan(shader.fragmentShader.indexOf('#include <alphatest_fragment>'));
    expect(shader.uniforms.leafAtlas.value).toBeInstanceOf(THREE.DataTexture); expect(shader.uniforms.leafStalks.value.magFilter).toBe(THREE.NearestFilter);
    // Cards hold still without the tree wind, and turn each leaf by its own stalk and clock with it.
    expect(leafCardVertex).toContain('#ifdef TREE_WIND'); expect(leafCardFragment).toContain('leafStalk.z');

    const clone = material.clone(); expect(hasLeafCards(clone)).toBe(false);
    inheritLeafCards(material, clone); expect(hasLeafCards(clone)).toBe(true);

    const scene = new THREE.Scene(), model = buildPlant('tembusu');
    scene.add(treePart(new THREE.Mesh(model.leaf, material), 0, 0, 0, 16, 1.2));
    const [batch] = batchTrees(scene, () => {}, () => {});
    expect(hasLeafCards(batch.material as THREE.Material)).toBe(true);
    expect(hasLeafCards(batch.customDepthMaterial!)).toBe(true); expect(hasLeafCards(batch.customDistanceMaterial!)).toBe(true);
    const depth = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <alphatest_fragment>' };
    batch.customDepthMaterial!.onBeforeCompile(depth as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    // The wind's declarations come first, so the cards can read the gust.
    expect(depth.vertexShader.indexOf('#define TREE_WIND')).toBeLessThan(depth.vertexShader.indexOf('attribute vec4 leafCard'));
    expect(depth.vertexShader.indexOf('float treeWave')).toBeLessThan(depth.vertexShader.indexOf('vLeafCard = leafCard'));
    expect(depth.fragmentShader).toContain('discard');
  });

  it('draws a rounded crown as sprays and keeps its shape, undrawn, as the cover', () => {
    const mass = leafMassGeometry();
    expect(mass.getAttribute('position').count).toBe(LEAF_MASS_TRIANGLES * 3); expect(leafMassGeometry()).toBe(mass);
    const card = mass.getAttribute('leafCard'), position = mass.getAttribute('position');
    for (let i = 0; i < card.count; i++) { expect(card.getZ(i)).toBeGreaterThan(0); expect(Math.hypot(position.getX(i), position.getY(i), position.getZ(i))).toBeLessThan(1.6); }

    const scene = new THREE.Scene(), crownShape = new THREE.IcosahedronGeometry(1, 1), trunkShape = new THREE.BoxGeometry(.6, 8, .6), leaf = new THREE.MeshStandardMaterial({ color: '#4f8a44' }), wood = new THREE.MeshStandardMaterial({ color: '#5a4636' });
    leaf.userData.visualCover = true; leaf.userData.impactSurface = 'foliage';
    for (const x of [0, 12]) {
      const trunk = new THREE.Mesh(trunkShape, wood); trunk.position.set(x, 4, 0); scene.add(treePart(trunk, x, 0, 0, 8));
      const crown = new THREE.Mesh(crownShape, leaf); crown.position.set(x, 8, 0); crown.scale.set(3.6, 2.5, 3.5); crown.castShadow = true; scene.add(treePart(crown, x, 0, 0, 8, 1));
    }
    const batches = batchTrees(scene, () => {}, () => {});
    const shape = batches.find(mesh => mesh.name === 'Tree crown cover')!, leaves = batches.find(mesh => mesh.name === 'Wind-animated leaves')!;
    expect(shape.count).toBe(2); expect(leaves.count).toBe(2); expect(batches).toHaveLength(3);
    // The shape is never drawn but is still foliage to a ray; the sprays are drawn and stand apart from cover.
    expect((shape.material as THREE.Material).visible).toBe(false); expect(shape.visible).toBe(true); expect(isVisualCover(shape)).toBe(true);
    expect((shape.material as THREE.Material).userData.impactSurface).toBe('foliage');
    expect(leaves.userData.coverApart).toBe(true); expect(leaves.castShadow).toBe(true); expect(hasLeafCards(leaves.material as THREE.Material)).toBe(true);
    expect((leaves.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('4f8a44'); expect((leaves.material as THREE.Material).side).toBe(THREE.DoubleSide);
    // Each crown's sprays are turned differently, about the crown's own centre.
    const a = new THREE.Matrix4(), b = new THREE.Matrix4(); leaves.getMatrixAt(0, a); leaves.getMatrixAt(1, b);
    expect(new THREE.Vector3().setFromMatrixPosition(a).toArray()).toEqual([0, 8, 0]); expect(a.elements[0]).not.toBeCloseTo(b.elements[0], 3);
    // A sight line through the crown stops where the shape is; a round passes, as through any foliage.
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(-20, 9, 0), new THREE.Vector3(1, 0, 0));
    expect(ray.intersectObject(leaves)).toHaveLength(0); expect(ray.intersectObject(shape).length).toBeGreaterThan(0);
    const cover = createSceneCover(scene);
    const sight = cover.sightDistance({ x: -20, y: 9, z: 0 }, { x: 1, y: 0, z: 0 }, 60);
    expect(sight).toBeGreaterThan(16); expect(sight).toBeLessThan(17.6);
    expect(cover.distance({ x: -20, y: 9, z: 0 }, { x: 1, y: 0, z: 0 }, 60)).toBe(60);
  });

  it('draws a tagged shrub as leaves and a tall narrow one as blades, each rooted at its own foot', () => {
    const reed = leafReedGeometry();
    expect(reed.getAttribute('position').count).toBe(LEAF_REED_TRIANGLES * 3);
    const tile = leafTile('blades', 0), card = reed.getAttribute('leafCard');
    for (let i = 0; i < card.count; i++) { expect(card.getX(i)).toBeGreaterThanOrEqual(tile.u - 1e-6); expect(card.getY(i)).toBeGreaterThanOrEqual(tile.v - 1e-6); expect(card.getZ(i)).toBeGreaterThan(0); }

    const scene = new THREE.Scene(), shape = new THREE.IcosahedronGeometry(1, 1), leaf = new THREE.MeshStandardMaterial({ color: '#44703d' }), rock = new THREE.MeshStandardMaterial({ color: '#9c9f91' });
    const blob = (x: number, y: number, sx: number, sy: number, material: THREE.Material) => { const mesh = new THREE.Mesh(shape, material); mesh.position.set(x, y, 0); mesh.scale.set(sx, sy, sx); scene.add(mesh); return mesh; };
    leafShape(blob(0, 1.9, 1.9, .8, leaf)); leafShape(blob(6, 1.1, .6, 2.2, leaf)); blob(12, 2, 4, 3, rock);
    const crown = blob(20, 9, 4, 3, leaf); crown.userData.driftGround = 0;
    const batches = batchTrees(scene, () => {}, () => {});
    const leaves = batches.filter(mesh => mesh.name === 'Wind-animated leaves'), cover = batches.find(mesh => mesh.name === 'Tree crown cover')!;
    // The bush and the untagged-tree crown share one mass batch; the reed clump is its own; the rock is left alone.
    expect(leaves.map(mesh => [mesh.count, mesh.geometry.getAttribute('position').count / 3])).toEqual([[2, LEAF_MASS_TRIANGLES], [1, LEAF_REED_TRIANGLES]]);
    expect(cover.count).toBe(3); expect(scene.children.filter(child => !(child instanceof THREE.InstancedMesh))).toHaveLength(1);
    // Rooted at its own foot and as tall as itself, so it sways within itself.
    const roots = leaves[0].geometry.getAttribute('treeRootHeight');
    expect([roots.getX(0), roots.getY(0), roots.getZ(0), roots.getW(0)].map(v => +v.toFixed(3))).toEqual([0, 1.1, 0, 1.6]);
    expect([roots.getY(1), roots.getW(1)]).toEqual([6, 6]);
  });
});
