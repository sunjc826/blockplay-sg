import * as THREE from 'three';
import { expect, it } from 'vitest';
import { namedObject } from './named-object';

it('finds what getObjectByName finds, and follows renames, removals and replacements', () => {
  const root = new THREE.Group(), arm = new THREE.Group(), hand = new THREE.Object3D();
  hand.name = 'hand'; arm.add(hand); root.add(arm);
  expect(namedObject(root, 'hand')).toBe(hand);
  expect(namedObject(root, 'hand')).toBe(hand);
  expect(namedObject(root, 'missing')).toBeUndefined();
  hand.removeFromParent(); expect(namedObject(root, 'hand')).toBeUndefined();
  const other = new THREE.Object3D(); other.name = 'hand'; root.add(other);
  expect(namedObject(root, 'hand')).toBe(other);
  other.name = 'foot'; arm.add(hand); expect(namedObject(root, 'hand')).toBe(hand);
  expect(namedObject(root, 'foot')).toBe(other);
});
