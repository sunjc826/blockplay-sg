import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Parts something finds by name after the model is built: the reload and
 * racking animations, sight folding, magazine fills, config groups and tests.
 * Everything else on a weapon is static detail nobody addresses.
 */
const NAMED = new Set(['magazine', 'magazine-body', 'magazine-rounds', 'magazine-top-round', 'charging-handle', 'cover-latch', 'slide', 'slide-serration',
  'front-sight', 'rear-sight', 'rear-sight-pedestal', 'rear-index-mark', 'frame', 'receiver', 'feed-port', 'feed-mouth', 'body', 'optic', 'belt-case', 'deployed-mount']);
// Sight parts are also matched by pattern (folding, and the clear-sight-line check), so they all stay.
const addressed = (name: string) => { const part = name.slice(name.lastIndexOf('__') + 2); return NAMED.has(part) || part.includes('sight'); };

/**
 * A procedural weapon is a mesh per authored part, so a rifle is well over a
 * hundred draw calls in the hand, on the rack and on the ground. This folds the
 * static parts under each parent into one mesh per material, in place. Groups
 * keep their nodes, so a feed cover, a magazine or a config set still moves and
 * hides as one; a part that is addressed by name, has children, carries
 * userData, or is see-through stays its own mesh.
 */
export function mergeStaticParts(root: THREE.Object3D) {
  const parents: THREE.Object3D[] = [];
  root.traverse(node => { if (!node.name.includes('__bipod')) parents.push(node); });
  for (const parent of parents) {
    const sets = new Map<string, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child.children.length || Array.isArray(child.material) || child.material.transparent || !child.visible
        || child.renderOrder || Object.keys(child.userData).length || addressed(child.name) || child.name.includes('__bipod')) continue;
      const key = `${child.material.uuid}|${child.castShadow}|${child.receiveShadow}`;
      sets.set(key, [...(sets.get(key) ?? []), child]);
    }
    for (const parts of sets.values()) {
      if (parts.length < 2) continue;
      const baked = parts.map(part => {
        const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
        if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
        part.updateMatrix(); return geometry.applyMatrix4(part.matrix);
      });
      const geometry = mergeGeometries(baked, false); baked.forEach(g => g.dispose());
      if (!geometry) continue;
      const first = parts[0], material = first.material as THREE.Material;
      const merged = new THREE.Mesh(geometry, material); merged.name = `${root.name}__parts-${material.name || 'plain'}`;
      merged.castShadow = first.castShadow; merged.receiveShadow = first.receiveShadow;
      parts.forEach(part => { part.removeFromParent(); part.geometry.dispose(); });
      parent.add(merged);
    }
  }
  return root;
}
