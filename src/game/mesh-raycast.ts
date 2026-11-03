import * as THREE from 'three';
import { boundedRaycast } from './ray-bounds-tree';

interface TriangleNode { box: THREE.Box3; left?: TriangleNode; right?: TriangleNode; mesh?: THREE.Mesh; faces?: number[] }
/** Exact native Three hits, with a static triangle broadphase for dense ground meshes. */
export function accelerateMeshRaycast(mesh: THREE.Mesh) {
  if (Array.isArray(mesh.material)) throw new Error('Triangle broadphase requires a single material');
  const source=mesh.geometry,position=source.getAttribute('position'),index=source.index;
  const vertex=(face:number,corner:number)=>index ? index.getX(face*3+corner) : face*3+corner;
  const point=new THREE.Vector3(),centres:THREE.Vector3[]=[],boxes:THREE.Box3[]=[];
  for(let face=0;face<(index?.count ?? position.count)/3;face++) {
    const box=new THREE.Box3();
    for(let c=0;c<3;c++)box.expandByPoint(point.fromBufferAttribute(position,vertex(face,c)));
    boxes.push(box);centres.push(box.getCenter(new THREE.Vector3()));
  }
  const geometries:THREE.BufferGeometry[]=[];
  const build=(faces:number[]):TriangleNode=>{
    const box=new THREE.Box3();for(const face of faces)box.union(boxes[face]);
    if(faces.length<=64) {
      const geometry=new THREE.BufferGeometry();
      for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
      geometry.setIndex(faces.flatMap(f=>[vertex(f,0),vertex(f,1),vertex(f,2)]));
      geometry.boundingBox=box.clone();geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
      geometries.push(geometry);return {box,faces,mesh:new THREE.Mesh(geometry,mesh.material)};
    }
    const size=box.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
    faces.sort((a,b)=>centres[a][axis]-centres[b][axis]);const half=faces.length>>1;
    return {box,left:build(faces.slice(0,half)),right:build(faces.slice(half))};
  };
  const root=build(boxes.map((_,i)=>i)),inverse=new THREE.Matrix4(),local=new THREE.Ray();
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
