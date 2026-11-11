import * as THREE from 'three';

/** Pool repeated fixtures and sleeping reactive parts into spatially culled draws.
 * Logical models retain their transforms for picking/reset, but are not rendered
 * twice. Only moving models upload matrices; settled instances remain untouched. */
export function batchStreetProps(models: readonly THREE.Group[], name: string, reactive = false) {
  const root=new THREE.Group();root.name=name;root.userData.fpsEffect=reactive;
  type Slot={mesh:THREE.Mesh;batch:THREE.InstancedMesh;index:number};
  const slots=new Map<THREE.Group,Slot[]>(),buckets=new Map<string,{model:THREE.Group;mesh:THREE.Mesh}[]>();
  for(const model of models){
    model.updateMatrixWorld(true);
    model.traverse(node=>{
      if(!(node instanceof THREE.Mesh)||Array.isArray(node.material))return;
      const key=`${Math.floor(model.position.x/256)},${Math.floor(model.position.z/256)}:${node.geometry.uuid}:${node.material.uuid}:${!!node.userData.fpsEffect}`;
      const bucket=buckets.get(key)??[];bucket.push({model,mesh:node});buckets.set(key,bucket);
    });
    model.visible=false;
  }
  for(const bucket of buckets.values()){
    const first=bucket[0].mesh,batch=new THREE.InstancedMesh(first.geometry,first.material,bucket.length);
    batch.userData.fpsEffect=reactive||!!first.userData.fpsEffect;batch.name=name;batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
    batch.instanceMatrix.setUsage(reactive?THREE.DynamicDrawUsage:THREE.StaticDrawUsage);
    const flight:THREE.Box3[]=[];
    bucket.forEach(({model,mesh},index)=>{
      batch.setMatrixAt(index,mesh.matrixWorld);
      const list=slots.get(model)??[];list.push({mesh,batch,index});slots.set(model,list);
      if(!reactive){
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        for(const b of mesh.userData.flightBounds??[mesh.geometry.boundingBox])flight.push(new THREE.Box3().copy(b).applyMatrix4(mesh.matrixWorld));
      }
    });
    if(!reactive)batch.userData.flightBounds=flight;
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();root.add(batch);
  }
  return {root,
    sync(changed:readonly THREE.Group[]){
      const dirty=new Set<THREE.InstancedMesh>();
      for(const model of changed){model.updateMatrixWorld(true);for(const slot of slots.get(model)??[]){slot.batch.setMatrixAt(slot.index,slot.mesh.matrixWorld);dirty.add(slot.batch);}}
      for(const batch of dirty){batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();batch.computeBoundingBox();}
    },
    dispose(){root.removeFromParent();root.children.forEach(mesh=>(mesh as THREE.InstancedMesh).dispose());},
  };
}
