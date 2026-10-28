import { expect, it } from 'vitest';
import * as THREE from 'three';
import { firstVisibleHit, visibleHits } from './fps-raycast';
import { createSceneCover } from './scene-cover';
import { createArena } from './arena-rules';
import { shootAndLand } from './arena-test-shots';

it('blocks a target behind scenery and ignores invisible parent groups', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial();
  const wall = new THREE.Mesh(geometry, material); wall.position.z = -3;
  const target = new THREE.Mesh(geometry, material); target.position.z = -6;
  const group = new THREE.Group(); group.add(wall);
  group.updateMatrixWorld(true); target.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  expect(firstVisibleHit(ray, [target, group])?.object).toBe(wall);
  group.visible = false;
  expect(firstVisibleHit(ray, [target, group])?.object).toBe(target);
  target.visible = false; expect(firstVisibleHit(ray, [target, group])).toBeUndefined();
  geometry.dispose(); material.dispose();
});

it('returns pierced surfaces nearest first, bounded by the limit', () => {
  // Flat panels, so each stands for exactly one surface. A solid box reports its
  // near and far faces separately, and each face spends a round's budget.
  const geometry = new THREE.PlaneGeometry(4, 4), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const near = new THREE.Mesh(geometry, material); near.position.z = -3;
  const middle = new THREE.Mesh(geometry, material); middle.position.z = -6;
  const far = new THREE.Mesh(geometry, material); far.position.z = -9;
  [near, middle, far].forEach(m => m.updateMatrixWorld(true));
  // Offset off the panels' shared triangle edge, which a centred ray hits twice.
  const ray = new THREE.Raycaster(new THREE.Vector3(.7, .3, 0), new THREE.Vector3(0, 0, -1));
  const objects = [far, middle, near];
  expect(visibleHits(ray, objects, 3).map(h => h.object)).toEqual([near, middle, far]);
  expect(visibleHits(ray, objects, 2).map(h => h.object)).toEqual([near, middle]);
  expect(visibleHits(ray, objects, 1).map(h => h.object)).toEqual([near]);
  expect(visibleHits(ray, objects, 0)).toEqual([]);
  // An invisible surface is skipped without consuming the budget.
  middle.visible = false;
  expect(visibleHits(ray, objects, 2).map(h => h.object)).toEqual([near, far]);
  geometry.dispose(); material.dispose();
});

it('separates foliage sight obstruction from bullet/blast obstruction, including instanced leaves', () => {
  const scene=new THREE.Scene(), geometry=new THREE.BoxGeometry(4,1.4,1);
  const leaves=new THREE.MeshBasicMaterial(); leaves.userData.visualCover=true;
  const hedge=new THREE.InstancedMesh(geometry,leaves,1);
  hedge.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,.7,-3)); scene.add(hedge);
  const cover=createSceneCover(scene), direction={x:0,y:0,z:-1};
  for (const y of [.55,1.15]) {
    const from={x:.3,y,z:0};
    expect(cover.distance(from,direction,10)).toBe(10);
    expect(cover.sightDistance(from,direction,10)).toBeCloseTo(2.5);
  }
  expect(cover.sightDistance({x:.3,y:1.75,z:0},direction,10)).toBe(10);
  const arena=createArena([],0,'mixed',{
    bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawns:[{x:0,z:0},{x:0,z:-6}],move:p=>p,
  },undefined,undefined,cover.distance,undefined,cover.sightDistance);
  arena.addPlayer('one','One');arena.addPlayer('two','Two');
  const one=arena.snapshot().actors.find(a=>a.id==='one')!;
  expect(shootAndLand(arena,'one',{...one,y:1.15},direction,0).damage).toBeGreaterThan(0);
  hedge.visible=false;
  expect(cover.sightDistance({x:.3,y:.55,z:0},direction,10)).toBe(10);
  geometry.dispose(); leaves.dispose(); hedge.dispose();
});
