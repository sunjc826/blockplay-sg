import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { installStructureLayout } from './structure-layout';
import type { StructureLayout } from './structure-types';
import { createStructureVisuals } from './structure-visuals';
import { createSceneCover } from './scene-cover';
import { createVerticalMovement } from './vertical-movement';
import { getTraversalObstacles } from './vertical-routes';
import type { Obstacle } from './region-collision';
import { createArena } from './arena-rules';
import { createFacilities, type FacilitySite } from './facilities';
import { expeditionStructureLayout } from './expedition-structures';
import { createExpeditionStructureVisuals } from './expedition-structure-visuals';
import { createCommandCamp } from './command-camp';
import { navigationWorldKey } from './navigation-bake';

const bounds = { minX:-100, maxX:100, minZ:-100, maxZ:100 };
const alternative: StructureLayout = { id:'proof', structures:[{
  id:'shelter-and-cover', name:'Shelter and cover', x:0, y:0, z:0,
  props:[{ kind:'barricade', x:0, y:0, z:0, yaw:0 }, { kind:'shelter', x:8, y:0, z:0, yaw:0 }],
}] };
const empty: StructureLayout = { id:'empty', structures:[] };
const makeWorld = () => ({ scene:new THREE.Scene(), obstacles:[] as Obstacle[] });

it('runs a facility-free layout with physical cover, an independent zone and ordinary arena reset/respawning', () => {
  const world = makeWorld(), installed = installStructureLayout(world, alternative);
  const visuals = createStructureVisuals(world.scene, alternative);
  const terrain = { bounds, obstacles:world.obstacles, surfaces:[], traversalObstacles:getTraversalObstacles(world.scene) };
  const movement = createVerticalMovement(terrain);
  expect(movement.canOccupy(0,0,0,.4,1.8)).toBe(false);
  expect(movement.canOccupy(8,0,.5,.4,1.8)).toBe(true); // Shelter aisle.
  expect(movement.canOccupy(8,2.6,.5,.4,1.8)).toBe(false); // Roof.
  expect(movement.supportHeight(0,0,1.2,.4,1.8)).toBeCloseTo(1.1);
  const cover = createSceneCover(world.scene);
  expect(cover.distance({ x:0,y:.5,z:-5 }, { x:0,y:0,z:1 }, 10)).toBeLessThan(5);
  expect(cover.distance({ x:0,y:1.8,z:-5 }, { x:0,y:0,z:1 }, 10)).toBe(10);
  expect(cover.sightDistance({ x:8,y:1,z:0 }, { x:0,y:1,z:0 }, 5)).toBeLessThan(3);
  // Test-only objective: a zone has no associated structure, health or facility.
  const zone = { x:20, z:0, radius:4 };
  const zoneOccupied = (x:number,z:number) => Math.hypot(x-zone.x,z-zone.z) <= zone.radius;
  expect(movement.canOccupy(zone.x,0,zone.z,.4,1.8)).toBe(true);
  const arena = createArena(world.obstacles, 0, 'mixed', {
    bounds, spawns:[zone], playerSpawn:zone, navigationAnchors:installed.navigationAnchors,
    move:(p,dx,dz) => ({ x:p.x+dx, z:p.z+dz }),
  });
  arena.addPlayer('p','Player');
  expect(zoneOccupied(arena.snapshot().actors[0].x,arena.snapshot().actors[0].z)).toBe(true);
  expect(arena.facilityAction('p','shelter-and-cover')).toBe(false);
  expect(arena.playerRespawn('p')).toBeNull();
  arena.setPlayerVitals('p',{ health:0 });
  expect(arena.snapshot().actors[0]).toMatchObject({ alive:false, respawnIn:3 });
  for (let i=0;i<200;i++) arena.step(.05);
  const respawned = arena.snapshot();
  expect(respawned.actors[0].alive).toBe(true);
  expect(respawned.actors).toHaveLength(1); // No implicit friendly roster or facility waves.
  expect(respawned.facilities).toBeUndefined();
  expect(respawned.reinforcementClocks).toBeUndefined();
  arena.reset();
  expect(arena.snapshot().facilities).toBeUndefined();
  const tags: THREE.Object3D[] = []; world.scene.traverse(o => { if (o.userData.facilityId || o.userData.commandCamp) tags.push(o); });
  expect(tags).toEqual([]);
  visuals.dispose(); installed.dispose();
  expect(world.scene.children).toEqual([]); expect(world.obstacles).toEqual([]);
});

it('removes only owned physics and graphics, is idempotent, and can be replaced with an empty layout', () => {
  const world = makeWorld(), existing = { minX:50,maxX:51,minZ:50,maxZ:51 };
  world.obstacles.push(existing);
  const originalKey = navigationWorldKey({ ...world, bounds, surfaces:[], traversalObstacles:[] }, []);
  const installed = installStructureLayout(world, alternative), visuals = createStructureVisuals(world.scene, alternative);
  const geometryDisposed = vi.fn(), materialDisposed = vi.fn();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  world.scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); materials.add(o.material as THREE.Material); } });
  geometries.forEach(g => g.addEventListener('dispose', geometryDisposed));
  materials.forEach(m => m.addEventListener('dispose', materialDisposed));
  expect(navigationWorldKey({ ...world, bounds, surfaces:[], traversalObstacles:getTraversalObstacles(world.scene) }, installed.navigationAnchors)).not.toBe(originalKey);
  const later = { minX:70,maxX:71,minZ:70,maxZ:71 }, laterCeiling = { ...later,minY:4,maxY:5 };
  world.obstacles.push(later); world.scene.userData.traversalObstacles.push(laterCeiling);
  visuals.dispose(); installed.dispose(); visuals.dispose(); installed.dispose();
  expect(world.obstacles).toEqual([existing,later]);
  expect(getTraversalObstacles(world.scene)).toEqual([laterCeiling]);
  expect(geometryDisposed).toHaveBeenCalledTimes(geometries.size);
  expect(materialDisposed).toHaveBeenCalledTimes(materials.size);
  const none = installStructureLayout(world, empty), noVisuals = createStructureVisuals(world.scene, empty);
  expect(none.navigationAnchors).toEqual([]);
  expect(world.scene.children).toEqual([]);
  noVisuals.update([]); noVisuals.dispose(); none.dispose();
  expect(world.obstacles).toEqual([existing,later]);
  expect(getTraversalObstacles(world.scene)).toEqual([laterCeiling]);
});

it('makes core ray behavior explicit without requiring facility metadata', () => {
  for (const policy of ['scene','external'] as const) {
    const scene = new THREE.Scene();
    const visuals = createStructureVisuals(scene, { id:policy, structures:[{
      id:'cabinet', name:'Cabinet', x:0,y:0,z:0, core:{ model:'equipment-cabinet',cover:policy },
    }] });
    const d = createSceneCover(scene).distance({ x:-5,y:1,z:0 },{ x:1,y:0,z:0 },10);
    expect(d).toBeCloseTo(policy === 'scene' ? 4.15 : 10);
    expect(scene.children[0].userData.facilityId).toBeUndefined();
    visuals.dispose();
  }
});

it('keeps expedition appearance, physical camps and legacy snapshots independent', () => {
  const site: FacilitySite = { id:'post',name:'Post',kind:'command',x:0,y:0,z:0,initialOwner:'armed-forces',
    deployment:{ x:0,z:0,yaw:0 },camp:createCommandCamp({ x:0,y:0,z:0 },()=>true) };
  const scene = new THREE.Scene(), layout = expeditionStructureLayout([site]);
  const visuals = createExpeditionStructureVisuals(scene, layout), facilities = createFacilities([site]);
  const serialized = JSON.stringify(facilities.snapshot());
  const root = scene.children.find(o => o.userData.facilityId === site.id)!;
  const camp = scene.children.find(o => o.userData.commandCamp === site.id)!;
  const flag = camp.children.find(o => ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity === .4) as THREE.Mesh;
  const coreBounds = new THREE.Box3().setFromObject(root);
  const snapshot = facilities.snapshot(); snapshot.sites[0].owner = 'mercenaries';
  visuals.update(snapshot);
  expect((flag.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('f17c61');
  snapshot.sites[0].health = 0; visuals.update(snapshot);
  expect((flag.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('8a8e88');
  expect(new THREE.Box3().setFromObject(root).min).toEqual(coreBounds.min);
  const cover = createSceneCover(scene);
  expect(cover.distance({ x:-20,y:.6,z:0 }, { x:1,y:0,z:0 },40)).toBeLessThan(10);
  expect(cover.distance({ x:-20,y:1.75,z:0 }, { x:1,y:0,z:0 },40)).toBe(40);
  expect(JSON.stringify(facilities.snapshot())).toBe(serialized);
  expect(layout.structures[0]).not.toHaveProperty('owner');
  expect(layout.structures[0]).not.toHaveProperty('health');
  expect(layout.structures[0]).not.toHaveProperty('deployment');
  visuals.dispose();
});

it('rejects duplicate structure ids before changing the world', () => {
  const world = makeWorld();
  expect(() => installStructureLayout(world,{ id:'bad',structures:[...alternative.structures,...alternative.structures] })).toThrow('Duplicate structure id');
  expect(world.obstacles).toEqual([]); expect(getTraversalObstacles(world.scene)).toEqual([]);
});
