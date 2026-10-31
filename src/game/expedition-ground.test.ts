import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createLootGround } from './expedition-ground';
import { createExpeditionLoot } from './expedition-loot';
import { buildMarinaScene } from './marina-scene';

describe('dropped loot ground geometry', () => {
  it('traces each scattered item onto its own ramp height and stores that height for pickup', () => {
    const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry(20, 20), material = new THREE.MeshBasicMaterial();
    const ramp = new THREE.Mesh(geometry, material);
    ramp.rotation.set(-Math.PI / 2, .2, 0); ramp.position.y = 4; scene.add(ramp);
    const ground = createLootGround(scene), loot = createExpeditionLoot('ramp');
    const left = loot.fallen('marina-bay', { key: 'vet:2', side: 'forces', rank: 3, family: 0, grenade: 'grenade-frag' }, { x: 0, y: 4, z: 0 }, ground).loot;
    expect(left.length).toBeGreaterThan(2);
    for (const item of left) {
      expect(item.y).toBeCloseTo(4 - Math.tan(.2) * item.x);
      expect(loot.remaining('marina-bay').find(p => p.id === item.id)?.y).toBe(item.y);
      expect(loot.collect('marina-bay', item.id, { ...item, y: 0 })).toBeNull();
      expect(loot.collect('marina-bay', item.id, item)?.id).toBe(item.id);
    }
    const supplies = loot.supply('marina-bay', 'supply', { x: 0, y: 4, z: 0 }, ground);
    for (const item of supplies) expect(item.y).toBeCloseTo(4 - Math.tan(.2) * item.x);
    geometry.dispose(); material.dispose();
  });

  it('keeps lower floors under roofs, lands airborne drops and falls off a ledge', () => {
    const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(4, .2, 4), material = new THREE.MeshBasicMaterial();
    for (const y of [0, 5, 10]) { const floor = new THREE.Mesh(geometry, material); floor.position.y = y - .1; scene.add(floor); }
    const ground = createLootGround(scene);
    expect(ground(0, 0, 0)).toBeCloseTo(0);
    expect(ground(0, 0, 5)).toBeCloseTo(5);
    expect(ground(0, 0, 8)).toBeCloseTo(5);
    expect(ground(0, 0, 10)).toBeCloseTo(10);
    expect(ground(10, 10, 2)).toBe(2); // No geometry: retain the release height.
    const deck = scene.children[1]; deck.position.x = 1; deck.updateMatrixWorld(true);
    expect(ground(-1.5, 0, 5)).toBeCloseTo(0);
    geometry.dispose(); material.dispose();
  });

  it('ignores water, hidden geometry, actors, vehicles and effects above the floor', () => {
    const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(4, .02, 4), material = new THREE.MeshBasicMaterial();
    const floor = new THREE.Mesh(geometry, material); floor.position.y = -.11; scene.add(floor);
    for (const key of ['fpsWater', 'fpsEffect', 'arenaActorId', 'vehicleKind', 'hidden']) {
      const group = new THREE.Group(), mesh = new THREE.Mesh(geometry, material); mesh.position.y = .2; group.add(mesh); scene.add(group);
      if (key === 'hidden') group.visible = false; else group.userData[key] = true;
    }
    expect(createLootGround(scene)(0, 0, 0)).toBeCloseTo(-.1);
    geometry.dispose(); material.dispose();
  });

  it('uses transformed instance normals, rejecting downward faces', () => {
    const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry(4, 4), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const floor = new THREE.InstancedMesh(geometry, material, 2);
    floor.setMatrixAt(0, new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    const underside = new THREE.Matrix4().makeRotationX(Math.PI / 2); underside.setPosition(0, .2, 0); floor.setMatrixAt(1, underside); scene.add(floor);
    expect(createLootGround(scene)(0, 0, 0)).toBeCloseTo(0);
    floor.dispose(); geometry.dispose(); material.dispose();
  });

  it('rests Marina Bay drops on the actual instanced paving and waterfront decking', () => {
    const world = buildMarinaScene();
    try {
      const ground = createLootGround(world.scene), loot = createExpeditionLoot('waterfront');
      for (const at of [{ x: -44.5, y: 0, z: 67.3 }, { x: -42.5, y: 0, z: 51.9 }, { x: -42, y: 0, z: 85 }]) {
        const items = loot.fallen('marina-bay', { key: `${at.z}:1`, side: 'forces', rank: 3, family: 0 }, at, ground).loot;
        const weapon = items.find(item => item.kind === 'weapon')!;
        expect(weapon.y).toBeCloseTo(at.z === 67.3 ? .1075 : at.z === 51.9 ? .16 : .28);
        for (const item of items) expect(item.y).toBeCloseTo(ground(item.x, item.z, 0));
      }
      const dropped = loot.drop('marina-bay', 'g36-rifle', { x: -44.5, y: 0, z: 67.3 }, ground)!;
      expect(dropped.loot.y).toBeCloseTo(.1075);
    } finally { world.dispose(); }
  });
});
