import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPropMotion, createStreetPropKit, STREET_PROPS } from './street-props';
import { getRegion, REGION_IDS } from './regions';
import { createSceneCover } from './scene-cover';
import { streetPropPlacements, STREET_PROP_LIMIT } from './district-street-props';
import { createGameplayRayIndex } from './gameplay-ray-index';
import { firstVisibleHit } from './fps-raycast';

describe('street prop models and motion',()=>{
  it('builds twenty finite, grounded models with shared resources',()=>{
    const kit=createStreetPropKit();
    try{for(const spec of STREET_PROPS){
      const root=kit.create(spec.kind),copy=kit.create(spec.kind);root.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(root);
      expect(bounds.min.y,spec.kind).toBeGreaterThanOrEqual(-.04);expect(bounds.max.y,spec.kind).toBeGreaterThan(.3);
      root.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      expect((root.children[0] as THREE.Mesh).geometry).toBe((copy.children[0] as THREE.Mesh).geometry);
    }}finally{kit.dispose();}
  });
  it('breaks or tips only reactive props, settles and restores every transform',()=>{
    const kit=createStreetPropKit();
    try{for(const spec of STREET_PROPS){
      const root=kit.create(spec.kind);root.position.set(8,3,-4);root.rotation.y=.7;
      const original=root.clone(true),motion=createPropMotion(root,spec.kind);
      expect(motion.hit(new THREE.Vector3(1,.1,0))).toBe(spec.behavior!=='fixed');
      expect(motion.broken).toBe(spec.behavior==='breakable');
      for(let i=0;i<240;i++)motion.update(1/60);
      expect(motion.active).toBe(false);expect(root.position.distanceTo(original.position)).toBeLessThan(2);
      expect(new THREE.Box3().setFromObject(root).min.y).toBeGreaterThan(2.5);
      motion.reset();expect(root.position.equals(original.position)).toBe(true);expect(root.quaternion.equals(original.quaternion)).toBe(true);
      root.children.forEach((part,i)=>{expect(part.position.equals(original.children[i].position)).toBe(true);expect(part.quaternion.equals(original.children[i].quaternion)).toBe(true);});
    }}finally{kit.dispose();}
  });
});

describe('district dressing',()=>{
  it('places a bounded, deterministic collection on safe ground in every district',()=>{
    const counts:Record<string,number>={};
    for(const id of REGION_IDS){const region=getRegion(id),world=region.build();
      try{
        const placed=world.scene.userData.streetPropPlacements;counts[id]=placed.length;
        expect(placed.length,id).toBeGreaterThan(100);expect(placed.length,id).toBeLessThanOrEqual(STREET_PROP_LIMIT);
        for(const p of placed){expect(Math.hypot(p.x-region.spawn.x,p.z-region.spawn.z),id).toBeGreaterThanOrEqual(10);expect(Number.isFinite(p.y)).toBe(true);}
        const root=world.scene.getObjectByName('District street props')!,dynamic=world.scene.getObjectByName('Reactive street decorations')!;
        expect(root.children.length+dynamic.children.length).toBe(placed.length);
        // All decoration is outside the collision authority unless it is a fixed fixture.
        expect(dynamic.userData.fpsEffect).toBe(true);
        expect(new Set(placed.map((p:{cluster:string})=>p.cluster)).size,id).toBeGreaterThan(25);
        expect(new Set(placed.map((p:{kind:string})=>p.kind)).size,id).toBeGreaterThanOrEqual(10);
        const batchRoot=world.scene.getObjectByName('Street fixture instances')!;
        expect(batchRoot.children.every(m=>m instanceof THREE.InstancedMesh)).toBe(true);
        expect(world.scene.getObjectByName('Reactive prop instances')!.userData.fpsEffect).toBe(true);
        for(const p of dynamic.children){const spec=STREET_PROPS.find(s=>s.kind===p.userData.streetProp)!;expect(spec.behavior).not.toBe('fixed');}
        world.animate(0);world.animate(.05);
      }finally{world.dispose();}
    }
    expect(Object.values(counts).reduce((a,b)=>a+b,0)).toBeGreaterThan(3000);
  });
  it('reacts to a clipped shot without becoming ballistic cover, then resets',()=>{
    const region=getRegion('chinatown'),world=region.build();
    try{
      const root=world.scene.getObjectByName('Reactive street decorations')!;
      const model=root.children.find(p=>p.userData.streetProp==='crate')!;expect(model).toBeTruthy();
      const from=model.position.clone().add(new THREE.Vector3(0,.36,2)),to=model.position.clone().add(new THREE.Vector3(0,.36,-2));
      const initial=model.children.map(p=>p.position.clone());world.scene.updateMatrixWorld(true);
      const direction=to.clone().sub(from).normalize(),cover=createSceneCover(world.scene);
      const hit=cover.trace(from,direction,4);expect(hit?.object.parent).not.toBe(model);
      const index=createGameplayRayIndex(world.scene,o=>!o.userData.fpsEffect);index.refresh();const ray=new THREE.Raycaster(from,direction,0,4);
      expect(firstVisibleHit(ray,index.query(ray),false,false,false)?.object.parent).not.toBe(model);
      world.streetProps!.shoot(from,from.clone().addScaledVector(direction,.1));world.animate(0);world.animate(.05);
      expect(model.children.every((p,i)=>p.position.equals(initial[i]))).toBe(true);
      world.streetProps!.shoot(from,to);world.animate(.1);
      expect(model.children.some((p,i)=>!p.position.equals(initial[i]))).toBe(true);
      world.streetProps!.reset();expect(model.children.every((p,i)=>p.position.equals(initial[i]))).toBe(true);
    }finally{world.dispose();}
  });
  it('rejects obstructed, steep or water-adjacent candidates',()=>{
    const region=getRegion('chinatown'),world=region.build();
    try{
      expect(streetPropPlacements({...region,canOccupy:()=>false},world)).toHaveLength(0);
      expect(streetPropPlacements({...region,bounds:{...region.bounds,groundHeight:(x,z)=>x+z}},world)).toHaveLength(0);
    }finally{world.dispose();}
  });
});
