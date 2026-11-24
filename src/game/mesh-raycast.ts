import * as THREE from 'three';
import { boundedRaycast } from './ray-bounds-tree';

interface TriangleNode { box: THREE.Box3; left?: TriangleNode; right?: TriangleNode; mesh?: THREE.Mesh; faces?: number[] }
/**
 * Built in its own function so the per-triangle bounds below are released when it returns:
 * the raycast closure lives as long as the mesh, and a dense ground has hundreds of
 * thousands of triangles.
 */
function buildTriangleTree(mesh: THREE.Mesh, geometries: THREE.BufferGeometry[]): TriangleNode {
  const source=mesh.geometry,position=source.getAttribute('position'),index=source.index;
  const vertex=(face:number,corner:number)=>index ? index.getX(face*3+corner) : face*3+corner;
  const count=Math.floor((index?.count ?? position.count)/3),point=new THREE.Vector3();
  // min xyz, max xyz per triangle, and its centre: flat, not a Box3 and a Vector3 each.
  const bounds=new Float64Array(count*6),centres=new Float64Array(count*3);
  for(let face=0;face<count;face++) {
    const o=face*6;bounds[o]=bounds[o+1]=bounds[o+2]=Infinity;bounds[o+3]=bounds[o+4]=bounds[o+5]=-Infinity;
    for(let c=0;c<3;c++) {
      point.fromBufferAttribute(position,vertex(face,c));
      bounds[o]=Math.min(bounds[o],point.x);bounds[o+1]=Math.min(bounds[o+1],point.y);bounds[o+2]=Math.min(bounds[o+2],point.z);
      bounds[o+3]=Math.max(bounds[o+3],point.x);bounds[o+4]=Math.max(bounds[o+4],point.y);bounds[o+5]=Math.max(bounds[o+5],point.z);
    }
    for(let axis=0;axis<3;axis++)centres[face*3+axis]=(bounds[o+axis]+bounds[o+3+axis])*.5;
  }
  const size=new THREE.Vector3();
  const build=(faces:number[]):TriangleNode=>{
    const box=new THREE.Box3();
    for(const face of faces) {
      const o=face*6;
      box.min.set(Math.min(box.min.x,bounds[o]),Math.min(box.min.y,bounds[o+1]),Math.min(box.min.z,bounds[o+2]));
      box.max.set(Math.max(box.max.x,bounds[o+3]),Math.max(box.max.y,bounds[o+4]),Math.max(box.max.z,bounds[o+5]));
    }
    if(faces.length<=64) {
      const geometry=new THREE.BufferGeometry();
      for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
      geometry.setIndex(faces.flatMap(f=>[vertex(f,0),vertex(f,1),vertex(f,2)]));
      geometry.boundingBox=box.clone();geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
      geometries.push(geometry);return {box,faces,mesh:new THREE.Mesh(geometry,mesh.material)};
    }
    box.getSize(size);const axis=size.x>=size.y&&size.x>=size.z?0:size.y>=size.z?1:2;
    faces.sort((a,b)=>centres[a*3+axis]-centres[b*3+axis]);const half=faces.length>>1;
    return {box,left:build(faces.slice(0,half)),right:build(faces.slice(half))};
  };
  return build(Array.from({length:count},(_,i)=>i));
}
/** Exact native Three hits, with a static triangle broadphase for dense ground meshes. */
export function accelerateMeshRaycast(mesh: THREE.Mesh) {
  if (Array.isArray(mesh.material)) throw new Error('Triangle broadphase requires a single material');
  const geometries:THREE.BufferGeometry[]=[];
  const root=buildTriangleTree(mesh,geometries),inverse=new THREE.Matrix4(),local=new THREE.Ray();
  const indexedGeometry = mesh.geometry, indexedPosition = mesh.geometry.getAttribute('position');
  const indexedVersion = 'version' in indexedPosition ? indexedPosition.version : indexedPosition.data.version;
  const previous=mesh.raycast;
  mesh.raycast=boundedRaycast((ray,hits)=>{
    inverse.copy(mesh.matrixWorld).invert();local.copy(ray.ray).applyMatrix4(inverse);
    const visit=(node:TriangleNode)=>{
      if(!local.intersectsBox(node.box))return;
      if(node.mesh) {
        node.mesh.matrixWorld.copy(mesh.matrixWorld);const first=hits.length;
        node.mesh.raycast(ray,hits);
        for(let i=first;i<hits.length;i++){hits[i].object=mesh;hits[i].faceIndex=node.faces![hits[i].faceIndex!];}
      } else {visit(node.left!);visit(node.right!);}
    };
    visit(root);
  }, () => mesh.geometry === indexedGeometry && mesh.geometry.getAttribute('position') === indexedPosition && ('version' in indexedPosition ? indexedPosition.version : indexedPosition.data.version) === indexedVersion);
  return ()=>{mesh.raycast=previous;geometries.forEach(g=>g.dispose());};
}
