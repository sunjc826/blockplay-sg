import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VIEW_OCCLUSION, hideNonOccluders } from './viewmodel-occlusion';

const box = (material: THREE.Material, name: string) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); mesh.name = name; return mesh; };

describe('viewmodel occlusion', () => {
  it('keeps opaque parts and hides glass, effects, lines and sprites from the depth pass', () => {
    const root = new THREE.Group(), gun = new THREE.Group(); root.add(gun);
    const receiver = box(new THREE.MeshStandardMaterial(), 'receiver');
    const lens = box(new THREE.MeshBasicMaterial({ transparent: true }), 'lens');
    const flash = box(new THREE.MeshBasicMaterial({ depthWrite: false }), 'flash');
    const overlay = box(new THREE.MeshBasicMaterial({ depthTest: false }), 'overlay');
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()); line.name = 'laser';
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: false })); sprite.name = 'spark';
    const multi = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]); multi.name = 'multi';
    gun.add(receiver, lens, flash, overlay, line, sprite, multi);
    const hidden = hideNonOccluders(root);
    expect(hidden.map(o => o.name).sort()).toEqual(['flash', 'laser', 'lens', 'overlay', 'spark']);
    expect(receiver.visible).toBe(true); expect(multi.visible).toBe(true); expect(lens.visible).toBe(false);
  });
  it('leaves already hidden branches alone, so showing the list again restores the scene exactly', () => {
    const root = new THREE.Group(), holstered = new THREE.Group(); holstered.visible = false; root.add(holstered);
    const lens = box(new THREE.MeshBasicMaterial({ transparent: true }), 'holstered lens'); holstered.add(lens);
    const child = box(new THREE.MeshBasicMaterial({ transparent: true }), 'glass'), mount = box(new THREE.MeshStandardMaterial(), 'mount');
    mount.add(child); root.add(mount);
    const hidden = hideNonOccluders(root);
    expect(hidden).toEqual([child]); expect(lens.visible).toBe(true); expect(holstered.visible).toBe(false);
    for (const object of hidden) object.visible = true;
    expect(child.visible).toBe(true);
  });
  it('does not descend into a hidden part, whose children draw with it or not at all', () => {
    const glass = box(new THREE.MeshBasicMaterial({ transparent: true }), 'glass'), bloom = box(new THREE.MeshBasicMaterial({ transparent: true }), 'bloom');
    glass.add(bloom);
    expect(hideNonOccluders(glass)).toEqual([glass]); expect(bloom.visible).toBe(true);
  });
  it('keeps its reach to hand-and-gun scale', () => {
    expect(VIEW_OCCLUSION.radius).toBeGreaterThan(.01); expect(VIEW_OCCLUSION.radius).toBeLessThan(.15);
    expect(VIEW_OCCLUSION.scale).toBeGreaterThan(0); expect(VIEW_OCCLUSION.scale).toBeLessThanOrEqual(1);
  });
});
