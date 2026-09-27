import * as THREE from 'three';
import type { RegionWorld } from './regions';
import { getWalkSurfaces, getTraversalObstacles, type WalkSurface, type TraversalObstacle, type RoutePoint } from './vertical-routes';

export interface PlaceFloor {
  id: string; x: number; z: number; y: number; width: number; depth: number;
  foundation?: 'solid' | 'open'; color?: string; rails?: boolean;
}
export interface PlaceConnection {
  id: string; from: RoutePoint; to: RoutePoint; width: number; stairs?: boolean; color?: string; foundation?: 'solid' | 'open';
}
export interface PlaceFixture {
  x: number; y: number; z: number; width: number; height: number; depth: number;
  color?: string; solid?: boolean;
}
/** A place is inhabited floor area and its connections, rather than an isolated scenic crossing. */
export interface VerticalPlace {
  id: string; name: string; note: string;
  floors: readonly PlaceFloor[];
  connections: readonly PlaceConnection[];
  fixtures?: readonly PlaceFixture[];
}
export const getVerticalPlaces = (scene: THREE.Object3D): readonly VerticalPlace[] => scene.userData.verticalPlaces ?? [];
const contains = (f: PlaceFloor, x: number, z: number, margin = 0) => Math.abs(x-f.x) <= f.width/2+margin && Math.abs(z-f.z) <= f.depth/2+margin;

export function withVerticalPlaces<T extends RegionWorld>(world: T, places: readonly VerticalPlace[]): T {
  const surfaces: WalkSurface[] = [...getWalkSurfaces(world.scene)];
  const obstacles: TraversalObstacle[] = [...getTraversalObstacles(world.scene)];
  const root = new THREE.Group(); root.name = 'Connected elevated places';
  const geometries: THREE.BufferGeometry[] = [], materials = new Map<string, THREE.MeshStandardMaterial>();
  const instanceBatches: THREE.InstancedMesh[] = [];
  const unit = new THREE.BoxGeometry(1,1,1); geometries.push(unit);
  const mat = (color: string) => {
    let m=materials.get(color); if (!m) { m=new THREE.MeshStandardMaterial({color,roughness:.82,flatShading:true}); materials.set(color,m); } return m;
  };
  let parent: THREE.Object3D = root;
  function box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,solid=true) {
    if (w<=0 || h<=0 || d<=0) return;
    const mesh=new THREE.Mesh(unit,mat(color)); mesh.position.set(x,y,z); mesh.scale.set(w,h,d);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
    if(solid) obstacles.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y-h/2,maxY:y+h/2});
    return mesh;
  }
  const allFloors=places.flatMap(p=>p.floors), allConnections=places.flatMap(p=>p.connections);
  const seenPlaces=new Set(getVerticalPlaces(world.scene).map(p=>p.id));
  for(const place of places) {
    if(!place.id || seenPlaces.has(place.id)) throw new Error(`Duplicate/empty place ${place.id}`);
    seenPlaces.add(place.id);
    const group=new THREE.Group();group.name=place.id;root.add(group);parent=group;
    const ids=new Set<string>();
    const id=(local:string) => {if(!local||ids.has(local))throw new Error(`Duplicate floor/connection ${place.id}/${local}`);ids.add(local);return `${place.id}/${local}`;};
    // A landing rail opens wherever a floor continues or a stair arrives. No
    // invisible access portals: the opening is reflected in collision too.
    const opening=(x:number,z:number,y:number,f:PlaceFloor,nx:number,nz:number) =>
      allFloors.some(other=>other!==f && Math.abs(other.y-y)<.01 && contains(other,x+nx*.4,z+nz*.4,.02)) ||
      allConnections.some(c=>[c.from,c.to].some(p=>Math.abs(p.y-y)<.02 && Math.hypot(p.x-x,p.z-z)<c.width/2+1.2));
    for(const f of place.floors) {
      const key=id(f.id);
      if(![f.x,f.y,f.z,f.width,f.depth].every(Number.isFinite)||f.y<0||f.width<1||f.depth<1)throw new Error(`Invalid floor ${key}`);
      const color=f.color??'#b8b2a2', thick=f.foundation==='solid'?Math.max(.26,f.y+.04):.26;
      box(f.x,f.y-thick/2,f.z,f.width,thick,f.depth,color,f.y>.1);
      surfaces.push({id:key,routeId:place.id,minX:f.x-f.width/2,maxX:f.x+f.width/2,minZ:f.z-f.depth/2,maxZ:f.z+f.depth/2,axis:'x',startHeight:f.y,endHeight:f.y,solidBelow:f.foundation==='solid'});
      if(f.y<.5) continue;
      if(f.rails!==false) for(const axis of ['x','z'] as const) for(const side of [-1,1]) {
        const length=axis==='x'?f.width:f.depth, sections=Math.ceil(length/2);
        for(let n=0;n<sections;n++) {
          const along=-length/2+(n+.5)*length/sections;
          const x=f.x+(axis==='x'?along:side*f.width/2), z=f.z+(axis==='z'?along:side*f.depth/2);
          const nx=axis==='z'?side:0,nz=axis==='x'?side:0;
          if(opening(x,z,f.y,f,nx,nz)) continue;
          const w=axis==='x'?length/sections:.12,d=axis==='z'?length/sections:.12;
          // Open-bar railing silhouette, with one consistent guard volume.
          box(x,f.y+1.08,z,w,.1,d,'#506266',false);
          box(x,f.y+.54,z,.1,1.08,.1,'#506266',false);
          obstacles.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:f.y,maxY:f.y+1.13});
        }
      }
      if(f.foundation!=='solid' && f.y>2.3) for(const dx of [-1,1])for(const dz of [-1,1]) {
        const x=f.x+dx*(f.width/2-.4),z=f.z+dz*(f.depth/2-.4);
        // Supports stop at the highest underlying floor, avoiding columns that
        // intersect every storey at once when decks are stacked.
        let base=0;
        for(const lower of allFloors) if(lower.y<f.y-.5&&contains(lower,x,z))base=Math.max(base,lower.y);
        if(allConnections.some(c=>[c.from,c.to].some(p=>Math.hypot(p.x-x,p.z-z)<c.width/2+.6)))continue;
        box(x,(base+f.y-.26)/2,z,.32,f.y-.26-base,.32,'#a6a79f');
      }
    }
    for(const c of place.connections) {
      const key=id(c.id), a=c.from,b=c.to,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(![a.x,a.y,a.z,b.x,b.y,b.z,c.width].every(Number.isFinite)||!len||(dx!==0&&dz!==0)||c.width<2.4||Math.abs(b.y-a.y)/len>.5+1e-7||a.y<0||b.y<0)throw new Error(`Invalid connection ${key}`);
      const axis=dx!==0?'x':'z', low=(axis==='x'?a.x<b.x:a.z<b.z)?a:b,high=low===a?b:a;
      surfaces.push({id:key,routeId:place.id,axis,minX:axis==='x'?low.x:a.x-c.width/2,maxX:axis==='x'?high.x:a.x+c.width/2,minZ:axis==='z'?low.z:a.z-c.width/2,maxZ:axis==='z'?high.z:a.z+c.width/2,startHeight:low.y,endHeight:high.y,solidBelow:c.foundation==='solid'});
      const color=c.color??'#bcb6a8';
      if(c.stairs && a.y!==b.y && c.foundation!=='solid') {
        const count=Math.ceil(Math.abs(b.y-a.y)/.15),run=len/count;
        for(let n=0;n<count;n++) {
          const t=(n+.5)/count,top=a.y+(b.y-a.y)*(b.y>a.y?(n+1)/count:n/count);
          box(a.x+dx*t,top-.13,a.z+dz*t,axis==='x'?run+.012:c.width,.26,axis==='z'?run+.012:c.width,color,false);
        }
      } else {
        const top=axis==='x'?[[low.x,low.y,a.z-c.width/2],[high.x,high.y,a.z-c.width/2],[high.x,high.y,a.z+c.width/2],[low.x,low.y,a.z+c.width/2]]:[[a.x-c.width/2,low.y,low.z],[a.x+c.width/2,low.y,low.z],[a.x+c.width/2,high.y,high.z],[a.x-c.width/2,high.y,high.z]];
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...top,...top.map(([x,y,z])=>[x,c.foundation==='solid'?-.04:y-.26,z])].flat(),3));
        g.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);g.computeVertexNormals();geometries.push(g);
        const mesh=new THREE.Mesh(g,mat(color));mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
      }
      // Side guards stop inside landings, allowing lateral circulation across
      // broad floors instead of turning every connection into a fenced chute.
      const count=Math.ceil(len/2);
      for(const side of [-1,1])for(let n=0;n<count;n++) {
        const t=(n+.5)/count,y=a.y+(b.y-a.y)*t,x=a.x+dx*t+(axis==='z'?side*(c.width/2+.08):0),z=a.z+dz*t+(axis==='x'?side*(c.width/2+.08):0);
        if(allFloors.some(f=>Math.abs(f.y-y)<.35 && contains(f,x,z)))continue;
        const p=new THREE.Vector3(a.x+dx*n/count,a.y+(b.y-a.y)*n/count+1.05,a.z+dz*n/count);
        const q=new THREE.Vector3(a.x+dx*(n+1)/count,a.y+(b.y-a.y)*(n+1)/count+1.05,a.z+dz*(n+1)/count);
        if(axis==='x'){p.z+=side*(c.width/2+.08);q.z+=side*(c.width/2+.08);}else{p.x+=side*(c.width/2+.08);q.x+=side*(c.width/2+.08);}
        const rail=box((p.x+q.x)/2,(p.y+q.y)/2,(p.z+q.z)/2,.1,.1,p.distanceTo(q),'#506266',false)!;
        rail.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),q.clone().sub(p).normalize());
        box(x,y+.525,z,.1,1.05,.1,'#506266',false);
        obstacles.push({minX:Math.min(p.x,q.x)-.05,maxX:Math.max(p.x,q.x)+.05,minZ:Math.min(p.z,q.z)-.05,maxZ:Math.max(p.z,q.z)+.05,minY:Math.max(0,Math.min(p.y,q.y)-1.05),maxY:Math.max(p.y,q.y)+.05});
      }
    }
    for(const f of place.fixtures??[]) {
      if(![f.x,f.y,f.z,f.width,f.height,f.depth].every(Number.isFinite)||f.width<=0||f.height<=0||f.depth<=0)throw new Error(`Invalid fixture in ${place.id}`);
      box(f.x,f.y,f.z,f.width,f.height,f.depth,f.color??'#a8a49a',f.solid!==false);
    }
  }
  // Repeat rails, stair treads and room fixtures share one box geometry. Batch
  // them per place/material so a usable building does not cost thousands of
  // draw calls. Instance transforms also remain available to projectile rays.
  for (const group of root.children) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh) || child.geometry !== unit) continue;
      const material = child.material as THREE.Material;
      const batch = batches.get(material) ?? [];
      batch.push(child); batches.set(material, batch);
    }
    for (const [material, meshes] of batches) {
      const instances = new THREE.InstancedMesh(unit, material, meshes.length);
      instances.name = `${group.name} repeated structure`;
      instances.castShadow = instances.receiveShadow = true;
      meshes.forEach((mesh, index) => {
        mesh.updateMatrix(); instances.setMatrixAt(index, mesh.matrix);
        group.remove(mesh);
      });
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingBox(); instances.computeBoundingSphere();
      group.add(instances); instanceBatches.push(instances);
    }
  }
  world.scene.add(root);world.scene.userData.walkSurfaces=surfaces;world.scene.userData.traversalObstacles=obstacles;
  world.scene.userData.verticalPlaces=[...getVerticalPlaces(world.scene),...places];
  const previous=world.dispose;let disposed=false;
  world.dispose=()=>{if(disposed)return;disposed=true;root.removeFromParent();instanceBatches.forEach(batch=>batch.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());previous();};
  return world;
}
