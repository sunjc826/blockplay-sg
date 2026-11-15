import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPropMotion, createStreetPropKit, STREET_PROPS } from './street-props';
import { getRegion, REGION_IDS } from './regions';
import { createSceneCover } from './scene-cover';
import { SITE_FURNITURE, streetPropPlacements, STREET_PROP_LIMIT } from './district-street-props';
import { createGameplayRayIndex } from './gameplay-ray-index';
import { firstVisibleHit } from './fps-raycast';
import { STREET_PROP_SITES } from './street-prop-sites';
import type { StreetPropPlacement } from './district-street-props';
import { isVegetationKind } from './vegetation-props';

describe('street prop models and motion',()=>{
  it('builds finite, grounded models with shared resources',()=>{
    const kit=createStreetPropKit();
    try{for(const spec of STREET_PROPS){
      const root=kit.create(spec.kind),copy=kit.create(spec.kind);root.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(root);
      expect(bounds.min.y,spec.kind).toBeGreaterThanOrEqual(-.04);expect(bounds.max.y,spec.kind).toBeGreaterThan(.3);
      root.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      expect((root.children[0] as THREE.Mesh).geometry).toBe((copy.children[0] as THREE.Mesh).geometry);
    }}finally{kit.dispose();}
  });
  it('rests every model on the ground and keeps the furniture catalogue to its true size',()=>{
    const kit=createStreetPropKit();
    try{for(const spec of STREET_PROPS){
      const root=kit.create(spec.kind);root.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3());
      expect(Math.abs(bounds.min.y),spec.kind).toBeLessThan(.001);
      // Plant sizes are clearance envelopes, checked in vegetation-props.test.ts.
      if(isVegetationKind(spec.kind))continue;
      for(const [actual,listed] of [[size.x,spec.width],[size.z,spec.depth],[size.y,spec.height]]){
        expect(actual,spec.kind).toBeLessThanOrEqual(listed+.001);expect(actual,spec.kind).toBeGreaterThan(listed-.015);
      }
    }}finally{kit.dispose();}
  });
  it('lays a toppled prop on a side, on the floor, whatever the direction of the hit',()=>{
    const kit=createStreetPropKit();
    try{for(const spec of STREET_PROPS.filter(p=>p.behavior==='movable'))for(let k=0;k<8;k++){
      const root=kit.create(spec.kind);root.position.set(5,2,1);root.rotation.y=.7;
      const motion=createPropMotion(root,spec.kind);motion.hit(new THREE.Vector3(Math.cos(k*Math.PI/4+.3),.1,Math.sin(k*Math.PI/4+.3)));
      for(let i=0;i<200;i++)motion.update(1/60);
      root.updateMatrixWorld(true);const lying=new THREE.Box3().setFromObject(root,true);
      expect(Math.abs(lying.min.y-2),`${spec.kind} ${k} touches the floor`).toBeLessThan(.002);
      // Balanced on an edge or corner it would stand taller than its own footprint.
      expect(lying.max.y-lying.min.y,`${spec.kind} ${k} lies flat`).toBeLessThanOrEqual(Math.max(spec.width,spec.depth)+.02);
    }}finally{kit.dispose();}
  });
  it('keeps solid volumes to the solid parts',()=>{
    const kit=createStreetPropKit();
    try{
      const planter=kit.create('planter'),[body]=planter.userData.streetPropColliders;
      expect(planter.userData.streetPropColliders).toHaveLength(1);expect(body.max[1]).toBeLessThan(.8);expect(body.max[2]).toBeCloseTo(.425);
      const leaves=planter.children.filter(m=>(m as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material.userData.visualCover);
      expect(leaves.length).toBeGreaterThan(0);expect(new THREE.Box3().setFromObject(leaves[0]).max.y).toBeGreaterThan(1.1);
      // The corners between the chess seats and beside the hawker table are open floor.
      for(const [kind,count,x,z] of [['chess-table',5,.9,.9],['hawker-table',5,.9,0]] as const){
        const solids=kit.create(kind).userData.streetPropColliders as {min:number[];max:number[]}[];
        expect(solids).toHaveLength(count);
        expect(solids.some(s=>x>s.min[0]&&x<s.max[0]&&z>s.min[2]&&z<s.max[2]),kind).toBe(false);
        expect(solids.some(s=>s.min[0]<0&&s.max[0]>0&&s.min[2]<0&&s.max[2]>0),kind).toBe(true);
      }
      // Both reflective bands stand proud of the cone at their own height.
      const cone=kit.create('cone'),bands=cone.children.find(m=>(m as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>).material.color.getHexString()==='e6e5ce') as THREE.Mesh;
      const position=bands.geometry.getAttribute('position'),slope=(y:number)=>.22-(y-.08)*.1848/.76;let high=0;
      for(let i=0;i<position.count;i++){const y=position.getY(i)+bands.position.y;high=Math.max(high,y);expect(Math.hypot(position.getX(i),position.getZ(i))).toBeGreaterThan(slope(y)+.003);}
      expect(high).toBeGreaterThan(.65);
    }finally{kit.dispose();}
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
        expect(placed.length,id).toBeGreaterThan(0);expect(placed.length,id).toBeLessThanOrEqual(STREET_PROP_LIMIT);
        for(const p of placed){expect(Math.hypot(p.x-region.spawn.x,p.z-region.spawn.z),id).toBeGreaterThanOrEqual(10);expect(Number.isFinite(p.y)).toBe(true);}
        const root=world.scene.getObjectByName('District street props')!,dynamic=world.scene.getObjectByName('Reactive street decorations')!;
        expect(root.children.length+dynamic.children.length).toBe(placed.length);
        // All decoration is outside the collision authority unless it is a fixed fixture.
        expect(dynamic.userData.fpsEffect).toBe(true);
        world.scene.updateMatrixWorld(true);
        // Every object needs a named use and location; empty land is not a fallback.
        for(const p of placed as StreetPropPlacement[]){
          const site=STREET_PROP_SITES[id].find(s=>s.id===p.site)!;
          expect(site,p.site).toBeTruthy();expect(p.feature).toBe(site.feature);
          expect(SITE_FURNITURE[site.furnishing].some(([kind])=>kind===p.kind)).toBe(true);
          expect(p.yaw).toBe(site.yaw);
          const floor=new THREE.Raycaster(new THREE.Vector3(p.x,p.y-.005,p.z),new THREE.Vector3(0,-1,0),0,.08);
          const scenery=world.scene.children.filter(o=>!['District street props','Reactive street decorations','Street fixture instances','Reactive prop instances'].includes(o.name));
          expect(firstVisibleHit(floor,scenery),`${id}/${p.site} must touch its actual floor`).toBeTruthy();
          if(p.kind==='chess-table'||p.kind==='letterboxes'){
            const up=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+2,p.z),new THREE.Vector3(0,1,0),0,7);
            expect(firstVisibleHit(up,world.scene.children),`${id}/${p.site} needs a real shelter`).toBeTruthy();
          }
          if(p.kind==='recycling-station')expect(site.furnishing).toBe('estate-collection');
          if(p.kind==='tray-return')expect(site.furnishing).toBe('tray-return');
          const group=placed.filter((q:StreetPropPlacement)=>q.cluster===p.cluster);
          expect(group.map((q:StreetPropPlacement)=>q.kind)).toEqual(SITE_FURNITURE[site.furnishing].map(([kind])=>kind));
        }
        const batchRoot=world.scene.getObjectByName('Street fixture instances')!;
        expect(batchRoot.children.every(m=>m instanceof THREE.InstancedMesh)).toBe(true);
        expect(world.scene.getObjectByName('Reactive prop instances')!.userData.fpsEffect).toBe(true);
        for(const p of dynamic.children){const spec=STREET_PROPS.find(s=>s.kind===p.userData.streetProp)!;expect(spec.behavior).not.toBe('fixed');}
        world.animate(0);world.animate(.05);
      }finally{world.dispose();}
    }
    expect(new Set(Object.values(counts)).size).toBeGreaterThan(1);
    expect(Object.values(counts).every(n=>n===STREET_PROP_LIMIT)).toBe(false);
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
