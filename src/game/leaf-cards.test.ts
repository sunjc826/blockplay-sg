import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LEAF_PATTERNS, LEAF_VARIANTS, cutLeafCards, drawLeafAtlas, hasLeafCards, inheritLeafCards, layoutSpray, leafCardFragment, leafCardVertex, leafTile } from './leaf-cards';
import { buildPlant } from './plant-models';
import { PLANT_SPECIES, PLANT_SPECS } from './plant-species';
import { batchTrees, treePart } from './tree-wind';

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
    expect(atlas.cover).toHaveLength(LEAF_PATTERNS.length * LEAF_VARIANTS);
    for (const cover of atlas.cover) { expect(cover).toBeGreaterThan(.25); expect(cover).toBeLessThan(.7); }
    // The unused sixteenth tile is empty.
    const last = (atlas.size - 8) * atlas.size * 4 + (atlas.size - 8) * 4;
    expect(atlas.map[last + 3]).toBe(0);
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
});
