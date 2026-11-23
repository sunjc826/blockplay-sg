import * as THREE from 'three';
import { expect, it } from 'vitest';
import { leafShade, shadeLeaves } from './leaf-shading';
import { createSceneKit } from './scene-kit';

function compiled(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <lights_physical_pars_fragment>\n#include <lights_fragment_begin>\n#include <lights_fragment_end>' } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader.fragmentShader;
}

it('passes light through thin leaves for every light, after the stock light functions', () => {
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }), plainKey = material.customProgramCacheKey();
  let earlier = 0; material.onBeforeCompile = () => { earlier++; };
  expect(shadeLeaves(material, { transmit: .3 })).toBe(material);
  const fragment = compiled(material);
  expect(earlier).toBe(1);
  expect(fragment.indexOf('RE_Direct_Leaf')).toBeGreaterThan(fragment.indexOf('#include <lights_physical_pars_fragment>'));
  expect(fragment).toContain('#define RE_Direct RE_Direct_Leaf');
  expect(fragment).toContain('leafFar * 0.300');
  expect(fragment).not.toContain('leafWrap');
  expect(fragment.indexOf('directionalLights[0]')).toBeLessThan(fragment.indexOf('#include <lights_fragment_end>'));
  expect(material.customProgramCacheKey()).not.toBe(plainKey);
  expect(leafShade(material)).toMatchObject({ thin: true, transmit: .3 });
  // A second call changes nothing.
  const key = material.customProgramCacheKey(); shadeLeaves(material, { transmit: .9 });
  expect(material.customProgramCacheKey()).toBe(key); expect(compiled(material)).toBe(fragment);
});

it('wraps light round closed crowns instead, and leaves other materials alone', () => {
  const crown = shadeLeaves(new THREE.MeshStandardMaterial()), thin = shadeLeaves(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  expect(leafShade(crown)?.thin).toBe(false);
  expect(compiled(crown)).toContain('leafWrap');
  expect(crown.customProgramCacheKey()).not.toBe(thin.customProgramCacheKey());
  const depth = new THREE.MeshDepthMaterial(), before = depth.onBeforeCompile;
  shadeLeaves(depth); expect(depth.onBeforeCompile).toBe(before); expect(leafShade(depth)).toBeUndefined();
});

it('reaches crowns through the tree batcher, and not trunks', () => {
  const kit = createSceneKit({ background: '#aaccee', fogNear: 100, fogFar: 500 });
  kit.tree(3, 4, 8, kit.mat('#76523b'), kit.mat('#408040')); kit.tree(-15, 4, 10, kit.mat('#76523b'), kit.mat('#408040'));
  const world = kit.finish({ car: new THREE.Group(), stamps: [], animate() {} });
  try {
    const trees = world.scene.children.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh && m.geometry.hasAttribute('treeRootHeight'));
    const shaded = trees.filter(tree => leafShade(tree.material as THREE.Material));
    expect(shaded.length).toBeGreaterThan(0); expect(shaded.length).toBeLessThan(trees.length);
    for (const tree of trees) expect(!!leafShade(tree.material as THREE.Material)).toBe(tree.geometry.getAttribute('treeFlutter').getX(0) > 0);
    expect(compiled(shaded[0].material as THREE.Material)).toContain('RE_Direct_Leaf');
  } finally { world.dispose(); }
});
