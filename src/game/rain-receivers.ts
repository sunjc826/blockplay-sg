import * as THREE from 'three';
import type { VehicleRainHit } from './vehicle-rain';

export type RainContact = 'solid' | 'rail' | 'water';
interface Receiver { mesh: THREE.Mesh; kind: RainContact; bounds: THREE.Box3; inverse: THREE.Matrix4 }
/** Capture selected static meshes before batching. Geometry remains owned by the
 * district; these invisible query copies never enter the render scene. */
export function captureRainReceivers(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  const receivers: Receiver[] = [];
  scene.traverse(object => {
    const kind = object.userData.rainContact as RainContact | undefined;
    if (!(object instanceof THREE.Mesh) || !kind) return;
    object.geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(object.geometry, object.material); mesh.matrixWorld.copy(object.matrixWorld);
    receivers.push({ mesh, kind, bounds: object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld), inverse: object.matrixWorld.clone().invert() });
  });
  scene.userData.rainReceivers = receivers;
}

/** Exact box/plane queries in a small spatial index, independent of inflated
 * movement barriers. Water establishes the base, then decks and rails occlude it. */
export function createRainReceivers(scene: THREE.Scene) {
  const cells = new Map<string, Receiver[]>(), receivers = (scene.userData.rainReceivers ?? []) as Receiver[], size = 12;
  for (const r of receivers) for (let x=Math.floor(r.bounds.min.x/size);x<=Math.floor(r.bounds.max.x/size);x++)
    for (let z=Math.floor(r.bounds.min.z/size);z<=Math.floor(r.bounds.max.z/size);z++) {
      const key=`${x}:${z}`, row=cells.get(key)??[];row.push(r);cells.set(key,row);
    }
  const ray = new THREE.Ray(), point = new THREE.Vector3(), down = new THREE.Vector3(0,-1,0), world = new THREE.Vector3();
  const hits: THREE.Intersection[] = [], caster = new THREE.Raycaster();
  function height(r: Receiver, x:number,z:number) {
    if(x<r.bounds.min.x||x>r.bounds.max.x||z<r.bounds.min.z||z>r.bounds.max.z)return null;
    ray.set(point.set(x,r.bounds.max.y+1,z),down).applyMatrix4(r.inverse);
    if(r.mesh.geometry.type==='BoxGeometry') {
      if(!ray.intersectBox(r.mesh.geometry.boundingBox!,point))return null;
      return world.copy(point).applyMatrix4(r.mesh.matrixWorld).y;
    }
    if(r.mesh.geometry.type==='PlaneGeometry'||r.mesh.geometry.type==='CircleGeometry') {
      if(Math.abs(ray.direction.z)<1e-8)return null;
      ray.at(-ray.origin.z/ray.direction.z,point);
      const b=r.mesh.geometry.boundingBox!;
      if(point.x<b.min.x||point.x>b.max.x||point.y<b.min.y||point.y>b.max.y)return null;
      if(r.mesh.geometry.type==='CircleGeometry'&&point.x**2+point.y**2>(r.mesh.geometry as THREE.CircleGeometry).parameters.radius**2)return null;
      return world.copy(point).applyMatrix4(r.mesh.matrixWorld).y;
    }
    caster.set(world.set(x,r.bounds.max.y+1,z),down);hits.length=0;r.mesh.raycast(caster,hits);
    return hits.length?Math.max(...hits.map(h=>h.point.y)):null;
  }
  return {
    water(x:number,z:number) {
      let top: number | null=null;
      for(const r of cells.get(`${Math.floor(x/size)}:${Math.floor(z/size)}`)??[])if(r.kind==='water'){
        const y=height(r,x,z);if(y!==null){
          const material=r.mesh.material as THREE.ShaderMaterial, u=material.uniforms;
          const time=u?.uTime?.value??0, chop=u?.uChop?.value??0;
          const surface=y+chop*(.05*Math.sin(x*.09+time*.7)+.035*Math.sin(z*.13-time*.9));
          top=top===null?surface:Math.max(top,surface);
        }
      }
      return top;
    },
    sample(x:number,z:number,hit:VehicleRainHit) {
      for(const r of cells.get(`${Math.floor(x/size)}:${Math.floor(z/size)}`)??[])if(r.kind!=='water'){
        const y=height(r,x,z);if(y!==null&&y>hit.height){hit.height=y;hit.kind=r.kind;hit.normal.set(0,1,0);}
      }
      return hit;
    },
  };
}
