import * as THREE from 'three';
import { expect,it } from 'vitest';
import { createWaterMaterial } from './water';
import { createWaterRipples } from './water-ripples';

it('raises bounded geometric crests on High/Ultra and removes them on Low, reduced effects or after decay',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.7,0);
 const water=createWaterMaterial({deep:'#123456',shallow:'#456789',sky:'#abcdef',horizon:'#888888',sun:new THREE.Vector3(0,1,0)});
 const ripples=createWaterRipples(scene,new Set([water]),()=>-.24,()=>-.24);
 try{
  water.userData.setTime(1);water.userData.ripple(0,0,1);water.userData.setTime(1.3);
  ripples.update(camera,'high',false,0);expect(ripples.mesh.count).toBe(2);
  const matrix=new THREE.Matrix4();ripples.mesh.getMatrixAt(0,matrix);
  const p=new THREE.Vector3(0,.04,0).applyMatrix4(matrix);expect(p.y).toBeGreaterThan(-.215);
  expect(ripples.mesh.geometry.attributes.position.count).toBeGreaterThan(200);expect(ripples.mesh.geometry.attributes.normal.getY(2)).toBeGreaterThan(.5);
  ripples.update(camera,'ultra',false,1);expect(ripples.mesh.count).toBeGreaterThan(2);expect(ripples.mesh.count).toBeLessThanOrEqual(128);
  ripples.update(camera,'low',false,1);expect(ripples.mesh.visible).toBe(false);
  ripples.update(camera,'ultra',true,1);expect(ripples.mesh.count).toBe(0);
  water.userData.setTime(5);ripples.update(camera,'high',false,0);expect(ripples.mesh.count).toBe(0);
 }finally{ripples.dispose();water.dispose();}
});
