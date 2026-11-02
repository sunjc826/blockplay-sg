import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {buildMerlionModel} from './merlion-model';
import {buildMarinaScene} from './marina-scene';
import {MARINA_LAYOUT_SCALE} from './marina-layout';
import {MARINA_CAMP_COVER,MARINA_WATER} from './marina-water';

describe('Merlion sculpture',()=>{
 it('keeps the sculpted stone inside the existing cover envelope after district scaling',()=>{
  const world=buildMarinaScene();try{
   const statue=world.scene.getObjectByName('merlion-statue')!;expect(statue).toBeDefined();world.scene.updateMatrixWorld(true);
   expect(statue.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([0,0,-12]);
   const box=new THREE.Box3();statue.children.forEach(child=>{if(child instanceof THREE.Mesh&&child.name!=='merlion-fountain')box.union(new THREE.Box3().setFromObject(child));});
   const cover=MARINA_CAMP_COVER[0];expect(box.min.x).toBeGreaterThanOrEqual(cover.minX);expect(box.max.x).toBeLessThanOrEqual(cover.maxX);
   expect(box.min.z).toBeGreaterThanOrEqual(cover.minZ);expect(box.max.z).toBeLessThanOrEqual(cover.maxZ);expect(box.max.y).toBeLessThanOrEqual(cover.maxY);expect(box.max.y).toBeGreaterThan(4);
  }finally{world.dispose();}
 });
 it('starts the fountain at the mouth and meets the bay surface without becoming cover',()=>{
  const model=buildMerlionModel();try{
   const mouth=model.root.getObjectByName('merlion-mouth-origin')!,water=model.root.getObjectByName('merlion-fountain') as THREE.Mesh<THREE.TubeGeometry>;
   const path=water.geometry.parameters.path;expect(path.getPoint(0).distanceTo(mouth.position)).toBeLessThan(1e-7);
   expect(path.getPoint(1).y*MARINA_LAYOUT_SCALE).toBeCloseTo(MARINA_WATER.surface);
   const ray=new THREE.Raycaster(new THREE.Vector3(5,5,5),new THREE.Vector3(0,0,-1));expect(ray.intersectObject(water)).toEqual([]);
  }finally{model.dispose();}
 });
 it('batches detailed carving into a bounded number of meshes with finite normals and disposable resources',()=>{
  const model=buildMerlionModel(),scene=new THREE.Scene();scene.add(model.root);let triangles=0,meshes=0,disposed=0;
  model.root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;meshes++;const g=o.geometry as THREE.BufferGeometry;triangles+=(g.index?.count??g.getAttribute('position').count)/3;g.addEventListener('dispose',()=>disposed++);
   for(const name of ['position','normal'])expect(Array.from(g.getAttribute(name).array).every(Number.isFinite)).toBe(true);
  });
  expect(meshes).toBeLessThanOrEqual(8);expect(triangles).toBeLessThan(30000);expect(triangles).toBeGreaterThan(5000);
  model.dispose();expect(model.root.parent).toBeNull();expect(disposed).toBe(meshes);
 });
});
