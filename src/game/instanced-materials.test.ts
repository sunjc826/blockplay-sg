import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { separateInstancedMaterials } from './instanced-materials';

describe('separating materials shared by instanced and plain meshes', () => {
  it('gives the instanced users a copy and leaves the plain ones the original', () => {
    const shared = new THREE.MeshStandardMaterial({ color: '#316c35', roughness: .7 });
    const hook = () => {}; shared.onBeforeCompile = hook; shared.customProgramCacheKey = () => 'night';
    const box = new THREE.BoxGeometry();
    const plain = new THREE.Mesh(box, shared), batch = new THREE.InstancedMesh(box, shared, 4), second = new THREE.InstancedMesh(box, shared, 2);
    const root = new THREE.Group(); root.add(plain, batch, second);
    expect(separateInstancedMaterials(root)).toBe(2);
    expect(plain.material).toBe(shared);
    expect(batch.material).not.toBe(shared);
    // One copy serves every instanced user, and it keeps the original's look and shader hooks.
    expect(second.material).toBe(batch.material);
    const copy = batch.material as THREE.MeshStandardMaterial;
    expect(copy.color.getHexString()).toBe('316c35'); expect(copy.roughness).toBe(.7);
    expect(copy.onBeforeCompile).toBe(hook); expect(copy.customProgramCacheKey()).toBe('night');
  });

  it('splits instanced meshes with and without per-instance colours', () => {
    const shared = new THREE.MeshStandardMaterial();
    const box = new THREE.BoxGeometry(), plainBatch = new THREE.InstancedMesh(box, shared, 3), coloured = new THREE.InstancedMesh(box, shared, 3);
    coloured.setColorAt(0, new THREE.Color('red'));
    const root = new THREE.Group(); root.add(plainBatch, coloured);
    expect(separateInstancedMaterials(root)).toBe(1);
    expect(plainBatch.material).toBe(shared);
    expect(coloured.material).not.toBe(shared);
  });

  it('leaves materials used by one kind of mesh alone, including in material arrays', () => {
    const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
    const box = new THREE.BoxGeometry();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(box, [a, b]), new THREE.Mesh(box, a), new THREE.InstancedMesh(box, b, 2));
    const batch = root.children[2] as THREE.InstancedMesh;
    expect(separateInstancedMaterials(root)).toBe(1);
    expect((root.children[0] as THREE.Mesh).material).toEqual([a, b]);
    expect(batch.material).not.toBe(b);
  });
});
