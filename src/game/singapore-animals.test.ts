import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ANIMALS, animateAnimal, createAnimalKit } from './singapore-animals';
import { animalPlacements, animalPosition, type AnimalPlacement } from './district-animals';
import { getRegion } from './regions';
import { modelRevision } from './model-review';
import { isWaterObject } from './water';

describe('Singapore habitat animals', () => {
  it('shares resources while keeping joints independent, grounded and bounded through idle cycles', () => {
    const kit = createAnimalKit();
    try { for (const spec of ANIMALS) {
      const a=kit.create(spec.id), b=kit.create(spec.id), original=modelRevision(b);
      const geometry=(o:THREE.Object3D)=>{const list:THREE.BufferGeometry[]=[];o.traverse(p=>{if(p instanceof THREE.Mesh)list.push(p.geometry);});return list;};
      expect(geometry(a)).toEqual(geometry(b)); expect(geometry(a).length).toBeLessThanOrEqual(20);
      for(let t=0;t<30;t+=.3) {
        animateAnimal(a,spec.id,t);const bounds=new THREE.Box3().setFromObject(a);
        expect(bounds.min.y,spec.id).toBeGreaterThanOrEqual(-.012);
        expect(bounds.max.y,spec.id).toBeLessThan(.7);
        expect(bounds.getSize(new THREE.Vector3()).length()).toBeLessThan(2);
      }
      expect(modelRevision(b)).toBe(original);
      animateAnimal(a,spec.id,0);expect(modelRevision(a)).toBe(original);
    }} finally {kit.dispose();}
  });
  it('keeps translated swim motion deterministic and inside its checked envelope', () => {
    const p:AnimalPlacement={site:'test',feature:'river',kind:'smooth-coated-otter',x:10,y:.14,z:20,yaw:0,swimming:true,phase:0};
    for(let t=0;t<1000;t+=.7) {
      const pose=animalPosition(p,t);expect(Math.abs(pose.x-p.x)).toBeLessThanOrEqual(2+1e-10);expect(Math.abs(pose.z-p.z)).toBeLessThanOrEqual(.55+1e-10);expect(pose.y).toBeCloseTo(-.02);
      expect(pose).toEqual(animalPosition(p,t));
    }
    expect(animalPosition({...p,swimming:false},100)).toEqual({x:10,y:.14,z:20,yaw:0});
  });
  it('places named habitat groups on real surfaces and keeps wildlife outside ballistic cover', () => {
    const seen=new Set<string>();
    for(const id of ['queenstown','bishan','upper-thomson','jurong-lake'] as const) {
      const world=getRegion(id).build();
      try {
        const placements=world.scene.userData.animalPlacements as AnimalPlacement[];
        const root=world.scene.getObjectByName('Singapore habitat animals')!;
        expect(root.userData.fpsEffect).toBe(true);expect(placements.length,id).toBeGreaterThan(0);expect(placements.length).toBeLessThanOrEqual(16);
        expect(root.children.length).toBe(placements.length);
        const scenery=world.scene.children.filter(o=>!o.userData.fpsEffect);
        world.scene.updateMatrixWorld(true);
        for(const p of placements) {
          seen.add(p.kind);
          const hit=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+.02,p.z),new THREE.Vector3(0,-1,0),0,.05).intersectObjects(scenery,true)[0];
          expect(hit,p.site).toBeTruthy();expect(isWaterObject(hit.object),p.site).toBe(p.swimming);
          expect(hit.point.y,p.site).toBeCloseTo(p.y,3);
        }
        world.animate(13);world.animate(0);
        placements.forEach((p,i)=>{const pos=animalPosition(p,0);expect(root.children[i].position.toArray()).toEqual([pos.x,pos.y,pos.z]);});
        const blocked=animalPlacements({...getRegion(id),spawn:{...getRegion(id).spawn,x:placements[0].x,z:placements[0].z}},world);
        expect(blocked.some(p=>p.site===placements[0].site)).toBe(false);
      } finally {world.dispose();}
    }
    expect([...seen].sort()).toEqual(ANIMALS.map(a=>a.id).sort());
  });
});
