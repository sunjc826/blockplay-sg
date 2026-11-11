import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getRegion } from './regions';
import { VEGETATION_PROPS, createVegetationKit, isVegetationKind } from './vegetation-props';
import { batchStreetProps } from './street-prop-batches';
import { createSceneCover } from './scene-cover';
import { VEGETATION_SITES } from './vegetation-sites';
import type { RegionId } from './region-ids';
import type { StreetPropPlacement } from './district-street-props';
import { QUEENSTOWN_HDB_BLOCKS } from './queenstown-housing-layout';
import { overlapsObstacle } from './region-collision';
import { firstVisibleHit } from './fps-raycast';

describe('species-specific vegetation',()=>{
  it('grounds every model, bounds its actual silhouette and shares resources',()=>{
    const kit=createVegetationKit();try{for(const spec of VEGETATION_PROPS){
      const root=kit.create(spec.kind as Parameters<typeof kit.create>[0]),copy=kit.create(spec.kind as Parameters<typeof kit.create>[0]),b=new THREE.Box3().setFromObject(root),size=b.getSize(new THREE.Vector3());
      
      expect.soft(Math.abs(b.min.y),spec.kind).toBeLessThan(.001);
      expect.soft(size.x,spec.kind).toBeLessThanOrEqual(spec.width);expect.soft(size.z,spec.kind).toBeLessThanOrEqual(spec.depth);expect.soft(size.y,spec.kind).toBeLessThanOrEqual(spec.height);
      expect((root.children[0] as THREE.Mesh).geometry).toBe((copy.children[0] as THREE.Mesh).geometry);
    }}finally{kit.dispose();}
  });
  it('keeps foliage out of ballistic cover after instancing while wood remains solid',()=>{
    const kit=createVegetationKit(),tree=kit.create('rain-tree'),scene=new THREE.Scene(),batches=batchStreetProps([tree],'Vegetation test');scene.add(tree,batches.root);scene.updateMatrixWorld(true);
    try{
      const cover=createSceneCover(scene);
      expect(cover.trace(new THREE.Vector3(0,2,2),new THREE.Vector3(0,0,-1),4)).toBeTruthy();
      expect(batches.root.children.some(m=>m.userData.fpsEffect)).toBe(true);
      const fern=kit.create('sword-fern');expect(fern.userData.streetPropColliders).toEqual([]);
      const f=batchStreetProps([fern],'Fern test'),s=new THREE.Scene();s.add(f.root);s.updateMatrixWorld(true);
      expect(createSceneCover(s).trace(new THREE.Vector3(0,.5,3),new THREE.Vector3(0,0,-1),6)).toBeUndefined();f.dispose();
    }finally{batches.dispose();kit.dispose();}
  });
  it('audits named planting sites and actual supporting floors',()=>{
    for(const id of Object.keys(VEGETATION_SITES) as RegionId[]){const world=getRegion(id).build();try{
      const placements=(world.scene.userData.streetPropPlacements as StreetPropPlacement[]).filter(p=>isVegetationKind(p.kind));
      expect(placements.some(p=>VEGETATION_SITES[id]?.some(s=>s.id===p.site)),id).toBe(true);
      const scenery=world.scene.children.filter(o=>!['District street props','Reactive street decorations','Street fixture instances','Reactive prop instances'].includes(o.name));
      for(const p of placements){
        const spec=VEGETATION_PROPS.find(s=>s.kind===p.kind)!,radius=Math.max(spec.width,spec.depth)/2;
        const ray=new THREE.Raycaster(new THREE.Vector3(p.x,p.y-.005,p.z),new THREE.Vector3(0,-1,0),0,.08);
        expect(firstVisibleHit(ray,scenery),`${id}/${p.site} ground contact`).toBeTruthy();
        if(id==='queenstown')for(const b of QUEENSTOWN_HDB_BLOCKS)expect(overlapsObstacle({minX:b.x+16,maxX:b.x+22,minZ:b.z+1.8,maxZ:b.z+8.5},p.x,p.z,radius),'lift approach').toBe(false);
        if(p.furnishing==='home-plants'||p.furnishing==='climbing-pot'&&id==='katong-joo-chiat'){
          const up=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+1.8,p.z),new THREE.Vector3(0,1,0),0,6);
          expect(firstVisibleHit(up,scenery),`${id}/${p.site} actual shelter`).toBeTruthy();
        }
      }
      expect(placements.length).toBeGreaterThan(0);
    }finally{world.dispose();}}
  },15000);
});
