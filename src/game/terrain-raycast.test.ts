import * as THREE from 'three';
import { expect,it } from 'vitest';
import { buildQueenstownTerrain } from './queenstown-terrain';
import { accelerateMeshRaycast } from './mesh-raycast';

it('keeps tiled terrain rays identical to the rendered triangles, including oblique and transformed rays',()=>{
  const terrain=buildQueenstownTerrain(),fast=terrain.mesh;
  const exact=new THREE.Mesh(fast.geometry,fast.material);
  fast.position.set(2,3,-4);fast.rotation.y=.15;fast.updateMatrixWorld(true);exact.matrixWorld.copy(fast.matrixWorld);
  for(let i=0;i<24;i++) {
    const origin=new THREE.Vector3(-240+i*20,40,-180+i*13).applyMatrix4(fast.matrixWorld);
    const direction=new THREE.Vector3((i%3-1)*.1,-1,.05).transformDirection(fast.matrixWorld);
    const ray=new THREE.Raycaster(origin,direction,0,100);
    const a=ray.intersectObject(fast)[0],b=ray.intersectObject(exact)[0];
    expect(!!a).toBe(!!b);
    if(a&&b){expect(a.distance).toBeCloseTo(b.distance,5);expect(a.point.distanceTo(b.point)).toBeLessThan(1e-5);expect(a.object).toBe(fast);expect(a.faceIndex).toBe(b.faceIndex);expect([a.face!.a,a.face!.b,a.face!.c]).toEqual([b.face!.a,b.face!.b,b.face!.c]);}
  }
  terrain.dispose();
});

it('preserves hit faces, UVs and points for dense non-indexed paving',()=>{
  const geometry=new THREE.PlaneGeometry(100,100,40,40).toNonIndexed(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const fast=new THREE.Mesh(geometry,material),exact=new THREE.Mesh(geometry,material),dispose=accelerateMeshRaycast(fast);
  fast.rotation.x=-Math.PI/2;fast.position.y=2;fast.updateMatrixWorld(true);exact.matrixWorld.copy(fast.matrixWorld);
  for(let i=0;i<20;i++) {
    const ray=new THREE.Raycaster(new THREE.Vector3(-40+i*4,30,13.21),new THREE.Vector3(.05,-1,.03).normalize(),0,100);
    const a=ray.intersectObject(fast)[0],b=ray.intersectObject(exact)[0];
    expect(a.faceIndex).toBe(b.faceIndex);expect(a.point.distanceTo(b.point)).toBeLessThan(1e-6);expect(a.uv!.distanceTo(b.uv!)).toBeLessThan(1e-6);
  }
  dispose();geometry.dispose();material.dispose();
});
