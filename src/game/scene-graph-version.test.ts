import * as THREE from 'three';
import { expect, it } from 'vitest';
import { graphVersion } from './scene-graph-version';

it('changes on an object and all its ancestors when anything beneath it is added or removed', () => {
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group(), other = new THREE.Group(), leaf = new THREE.Object3D();
  scene.add(a, other); a.add(b);
  const before = [scene, a, b, other].map(graphVersion);
  b.add(leaf);
  const added = [scene, a, b, other].map(graphVersion);
  expect(added[0]).not.toBe(before[0]); expect(added[1]).not.toBe(before[1]); expect(added[2]).not.toBe(before[2]); expect(added[3]).toBe(before[3]);
  leaf.removeFromParent(); expect(graphVersion(b)).not.toBe(added[2]);
  const moved = graphVersion(other); other.attach(leaf); expect(graphVersion(other)).not.toBe(moved);
  const cleared = graphVersion(scene); other.clear(); expect(graphVersion(scene)).not.toBe(cleared);
  leaf.position.x = 3; expect(graphVersion(scene)).toBe(graphVersion(scene));
});
