import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { batchStreetProps } from './street-prop-batches';
import { createStreetPropKit, createPropMotion } from './street-props';

it('instances repeated fixtures while preserving the rendered hit surface',()=>{
  const kit=createStreetPropKit();const models=Array.from({length:6},(_,i)=>{const m=kit.create('bench');m.position.set(i*4,0,0);return m;});
  const batches=batchStreetProps(models,'test');
  try{
    expect(batches.root.children.length).toBeLessThan(models.reduce((n,m)=>n+m.children.length,0)/3);
    batches.root.updateMatrixWorld(true);
    for(const m of models){
      const ray=new THREE.Raycaster(m.position.clone().add(new THREE.Vector3(0,3,0)),new THREE.Vector3(0,-1,0),0,5);
      const before=ray.intersectObject(m,true)[0],after=ray.intersectObject(batches.root,true)[0];
      expect(before).toBeTruthy();expect(after.distance).toBeCloseTo(before.distance,5);
    }
    const disposed=vi.fn();batches.root.children.forEach(m=>(m as THREE.InstancedMesh).addEventListener('dispose',disposed));
    batches.dispose();expect(disposed).toHaveBeenCalledTimes(batches.root.children.length);
  }finally{kit.dispose();}
});

it('updates reactive instance transforms and restores them on reset',()=>{
  const kit=createStreetPropKit(),model=kit.create('crate');model.position.set(5,0,3);model.rotation.y=.4;
  const motion=createPropMotion(model,'crate'),batch=batchStreetProps([model],'reactive',true);
  const matrix=new THREE.Matrix4();
  const transforms=()=>batch.root.children.flatMap(child=>{const mesh=child as THREE.InstancedMesh;return Array.from({length:mesh.count},(_,i)=>{mesh.getMatrixAt(i,matrix);return [...matrix.elements];});});
  try{
    const before=transforms();motion.hit(new THREE.Vector3(1,0,0));motion.update(.05);batch.sync([model]);
    expect(transforms()).not.toEqual(before);motion.reset();batch.sync([model]);expect(transforms()).toEqual(before);
    expect(batch.root.userData.fpsEffect).toBe(true);
  }finally{batch.dispose();kit.dispose();}
});
