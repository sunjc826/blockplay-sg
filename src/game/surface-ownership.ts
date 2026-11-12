import * as THREE from 'three';
import type { RegionWorld } from './regions';
import { mapSurfaceFaces, surfacePolygon, intersectSurfacePolygons, type SurfaceFace } from './map-surface-audit';
import { accelerateMeshRaycast } from './mesh-raycast';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Polygon = number[][];
const cross = (a: number[], b: number[], p: number[]) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area = (p: Polygon) => Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
function split(polygon: Polygon, a: number[], b: number[], inside: boolean) {
  const result: Polygon=[];
  for(let i=0;i<polygon.length;i++) {
    const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=cross(a,b,p),dq=cross(a,b,q);
    const pin=inside?dp>=0:dp<=0,qin=inside?dq>=0:dq<=0;
    if(pin)result.push(p);
    if(pin!==qin){const t=dp/(dp-dq);result.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
  return result;
}
function subtract(subject: Polygon, cut: Polygon) {
  if(area(intersectSurfacePolygons(subject,cut))<1e-7)return [subject];
  const result: Polygon[]=[];let remaining=subject;
  for(let i=0;i<cut.length && remaining.length;i++) {
    const a=cut[i],b=cut[(i+1)%cut.length],outside=split(remaining,a,b,false);
    if(area(outside)>1e-8)result.push(outside);
    remaining=split(remaining,a,b,true);
  }
  return result;
}
type Part = { instance?: number; cuts: Map<SurfaceFace, Polygon[]> };

/** Partition coincident static polygons in their actual plane. Narrow details
 * own intersections with broader walls. Local geometry variants preserve UVs,
 * material semantics, instancing and building night-window spans. */
export function withSurfaceOwnership<T extends RegionWorld>(world: T): T {
  // Wind-deformed tree parts cannot own a fixed coplanar cut in nearby scenery.
  const faces=mapSurfaceFaces(world.scene).filter(f=>!Array.isArray(f.mesh.material) && !f.mesh.geometry.hasAttribute('treeRootHeight'));
  const planes=new Map<string,SurfaceFace[]>(),parts=new Map<THREE.Mesh,Map<number|undefined,Part>>();
  const geometries=new Map<string,THREE.BufferGeometry>(),batches:THREE.InstancedMesh[]=[],baked_:THREE.Mesh[]=[],disposers:(()=>void)[]=[];
  let cuts=0;
  for(const face of faces) {
    const key=`${face.axis}/${face.sign}/${Math.round(face.height*1e4)}`;
    const plane=planes.get(key)??[];plane.push(face);planes.set(key,plane);
  }
  for(const plane of planes.values()) {
    plane.sort((a,b)=>area(surfacePolygon(a))-area(surfacePolygon(b)));
    const bins=new Map<string,SurfaceFace[]>();
    const cells=(face:SurfaceFace)=>{
      const result:string[]=[];
      for(let u=Math.floor(face.minU/16);u<=Math.floor(face.maxU/16);u++)for(let v=Math.floor(face.minV/16);v<=Math.floor(face.maxV/16);v++)result.push(`${u}/${v}`);
      return result;
    };
    for(const face of plane) {
      let pieces=[surfacePolygon(face)];const keys=cells(face),seen=new Set<SurfaceFace>();
      for(const key of keys)for(const other of bins.get(key)??[]) {
        if(seen.has(other)||face.material===other.material||face.mesh===other.mesh&&face.instance===other.instance)continue;
        seen.add(other);
        if(face.maxU<=other.minU||face.minU>=other.maxU||face.maxV<=other.minV||face.minV>=other.maxV)continue;
        pieces=pieces.flatMap(p=>subtract(p,surfacePolygon(other)));
      }
      if(pieces.length!==1||area(pieces[0])<area(surfacePolygon(face))-1e-7) {
        const instances=parts.get(face.mesh)??new Map<number|undefined,Part>();
        const part:Part=instances.get(face.instance)??{instance:face.instance,cuts:new Map()};
        part.cuts.set(face,pieces);instances.set(face.instance,part);parts.set(face.mesh,instances);cuts++;
      }
      for(const key of keys){const bin=bins.get(key)??[];bin.push(face);bins.set(key,bin);}
    }
  }
  const local=new THREE.Matrix4(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  for(const [mesh,instances] of parts) {
    const variants=new Map<THREE.BufferGeometry,number[]>();
    for(const part of instances.values()) {
      if(mesh instanceof THREE.InstancedMesh){mesh.getMatrixAt(part.instance!,local);matrix.multiplyMatrices(mesh.matrixWorld,local);}
      else matrix.copy(mesh.matrixWorld);
      const inverse=matrix.clone().invert();
      const signature=`${mesh.geometry.uuid}/${JSON.stringify([...part.cuts].map(([f,ps])=>[f.triangle??`box-${f.axis}-${f.sign}`,ps.map(p=>p.map(([u,v])=>point.setComponent(f.axis,f.height).setComponent((f.axis+1)%3,u).setComponent((f.axis+2)%3,v).applyMatrix4(inverse).toArray().map(n=>Math.round(n*1e6)/1e6)))]))}`;
      let geometry=geometries.get(signature);
      if(!geometry) {
        const source:THREE.BufferGeometry=mesh.geometry,index=source.index,position=source.getAttribute('position');
        const attributes=Object.entries(source.attributes).filter(([,a])=>!(a instanceof THREE.InstancedBufferAttribute));
        const values=new Map(attributes.map(([name])=>[name,[] as number[]]));
        const vertex=(f:number,c:number)=>index?index.getX(f*3+c):f*3+c;
        const replaced=new Set<number>();
        const component=(a:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,i:number,c:number)=>c===0?a.getX(i):c===1?a.getY(i):c===2?a.getZ(i):a.getW(i);
        const emit=(vertices:number[],weights:number[])=>{
          for(const [name,a] of attributes)for(let c=0;c<a.itemSize;c++)values.get(name)!.push(vertices.reduce((sum,v,i)=>sum+component(a,v,c)*weights[i],0));
        };
        for(const [face,pieces] of part.cuts) {
          const first=face.triangle??face.axis*4+(face.sign>0?0:2);
          replaced.add(first);if(face.triangle===undefined)replaced.add(first+1);
          const vertices=[vertex(first,0),vertex(first,1),vertex(first,2)];
          const projected=vertices.map(i=>{point.fromBufferAttribute(position,i).applyMatrix4(matrix);return [point.getComponent((face.axis+1)%3),point.getComponent((face.axis+2)%3)];});
          const [a,b,c]=projected,denominator=cross(a,b,c);
          for(const polygon of pieces)for(let i=1;i<polygon.length-1;i++) {
            const triangle=[polygon[0],polygon[i],polygon[i+1]];if(face.sign<0)triangle.reverse();
            for(const p of triangle)emit(vertices,[cross(b,c,p)/denominator,cross(c,a,p)/denominator,cross(a,b,p)/denominator]);
          }
        }
        for(let f=0;f<(index?.count??position.count)/3;f++)if(!replaced.has(f))for(let c=0;c<3;c++)emit([vertex(f,c)],[1]);
        const created:THREE.BufferGeometry=source.clone();created.setIndex(null);created.clearGroups();
        for(const [name,a] of attributes)created.setAttribute(name,new THREE.Float32BufferAttribute(values.get(name)!,a.itemSize));
        created.userData={...source.userData,partitionedFaces:true};created.computeBoundingBox();created.computeBoundingSphere();
        geometries.set(signature,created);geometry=created;
      }
      if(mesh instanceof THREE.InstancedMesh){const indices=variants.get(geometry)??[];indices.push(part.instance!);variants.set(geometry,indices);}
      else {
        mesh.geometry=geometry;mesh.raycast=THREE.Mesh.prototype.raycast;
        if(geometry.getAttribute('position').count>300)disposers.push(accelerateMeshRaycast(mesh));
      }
    }
    if(!(mesh instanceof THREE.InstancedMesh))continue;
    const removed=new Set<number>();
    // On the block module, snapped neighbours share many faces, and variants
    // used by a single instance would each cost a draw. Bake them into
    // one static mesh per source batch instead; shared variants stay instanced.
    // Window materials (per-instance night spans) and per-instance colours keep
    // the instanced path.
    const singles=[...variants].filter(([,indices])=>indices.length===1);
    if(world.scene.userData.blockModule && singles.length>1 && !Array.isArray(mesh.material) && !mesh.material.userData.nightWindow && !mesh.instanceColor) {
      const baked=singles.map(([geometry,[index]])=>{mesh.getMatrixAt(index,local);removed.add(index);variants.delete(geometry);return geometry.clone().applyMatrix4(local);});
      const geometry=mergeGeometries(baked);baked.forEach(g=>g.dispose());
      if(geometry) {
        geometry.userData={partitionedFaces:true,bakedVariants:singles.length};geometry.computeBoundingBox();geometry.computeBoundingSphere();
        const merged=new THREE.Mesh(geometry,mesh.material);merged.name=mesh.name;merged.userData={...mesh.userData};
        merged.position.copy(mesh.position);merged.quaternion.copy(mesh.quaternion);merged.scale.copy(mesh.scale);merged.castShadow=mesh.castShadow;merged.receiveShadow=mesh.receiveShadow;
        mesh.parent!.add(merged);baked_.push(merged);geometries.set(`baked/${mesh.uuid}`,geometry);
        if(geometry.getAttribute('position').count>300)disposers.push(accelerateMeshRaycast(merged));
      } else singles.forEach(([g,indices])=>{variants.set(g,indices);removed.delete(indices[0]);});
    }
    for(const [geometry,indices] of variants) {
      const batch=new THREE.InstancedMesh(geometry,mesh.material,indices.length);batch.name=mesh.name;batch.userData={...mesh.userData};
      batch.position.copy(mesh.position);batch.quaternion.copy(mesh.quaternion);batch.scale.copy(mesh.scale);batch.castShadow=mesh.castShadow;batch.receiveShadow=mesh.receiveShadow;
      indices.forEach((index,i)=>{mesh.getMatrixAt(index,local);batch.setMatrixAt(i,local);removed.add(index);});
      batch.computeBoundingBox();batch.computeBoundingSphere();mesh.parent!.add(batch);batches.push(batch);
    }
    let count=0;for(let i=0;i<mesh.count;i++)if(!removed.has(i)){mesh.getMatrixAt(i,local);mesh.setMatrixAt(count++,local);}
    mesh.count=count;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
    if(!count)mesh.removeFromParent();
  }
  world.scene.userData.surfaceOwnership={cuts,variants:geometries.size,batches:batches.length,baked:baked_.length};
  const previous=world.dispose;
  world.dispose=()=>{disposers.forEach(dispose=>dispose());batches.forEach(b=>{b.removeFromParent();b.dispose();});baked_.forEach(m=>m.removeFromParent());geometries.forEach(g=>g.dispose());previous();};
  return world;
}
