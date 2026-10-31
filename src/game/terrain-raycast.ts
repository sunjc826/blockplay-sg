import * as THREE from 'three';

/** Keep one rendered heightfield, but test rays against small exact triangle tiles. */
export function accelerateTerrainRaycast(mesh: THREE.Mesh, columns: number, rows: number, tile = 16) {
  const positions = mesh.geometry.getAttribute('position'), sourceIndex=mesh.geometry.index;
  if(!sourceIndex)throw new Error('Terrain acceleration requires an indexed grid');
  // Preserve holes in the actual index buffer. Reconstructing a complete grid
  // would create invisible terrain beneath building floors and incorrect hits.
  const cellFaces=new Int32Array((columns-1)*(rows-1)*2).fill(-1);
  for(let face=0;face<sourceIndex.count/3;face++) {
    const vertices=[0,1,2].map(i=>sourceIndex.getX(face*3+i));
    const x=Math.min(...vertices.map(n=>n%columns)),z=Math.min(...vertices.map(n=>Math.floor(n/columns)));
    const cell=(z*(columns-1)+x)*2;
    cellFaces[cell+(cellFaces[cell]<0?0:1)]=face;
  }
  const proxies: {mesh: THREE.Mesh; faces:number[]; vertex:(local:number)=>number}[] = [];
  for (let z = 0; z < rows - 1; z += tile) for (let x = 0; x < columns - 1; x += tile) {
    const width = Math.min(tile, columns - 1 - x) + 1, depth = Math.min(tile, rows - 1 - z) + 1;
    const vertices: number[] = [], indices: number[] = [], faces:number[]=[];
    for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) {
      const source = (z + j) * columns + x + i;
      vertices.push(positions.getX(source), positions.getY(source), positions.getZ(source));
      if (i < width - 1 && j < depth - 1) {
        const cell=((z+j)*(columns-1)+x+i)*2;
        for(const face of [cellFaces[cell],cellFaces[cell+1]]) {
          if(face<0)continue;
          for(let corner=0;corner<3;corner++) {
            const source=sourceIndex.getX(face*3+corner);
            indices.push((Math.floor(source/columns)-z)*width+source%columns-x);
          }
          faces.push(face);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    proxies.push({mesh:new THREE.Mesh(geometry,mesh.material),faces,vertex:local=>(z+Math.floor(local/width))*columns+x+local%width});
  }
  const previous = mesh.raycast;
  mesh.raycast = (ray, hits) => {
    for (const proxy of proxies) {
      proxy.mesh.matrixWorld.copy(mesh.matrixWorld);
      const first = hits.length;
      proxy.mesh.raycast(ray, hits);
      for (let i = first; i < hits.length; i++) {
        const hit=hits[i];hit.object=mesh;hit.faceIndex=proxy.faces[hit.faceIndex!];
        if(hit.face){hit.face.a=proxy.vertex(hit.face.a);hit.face.b=proxy.vertex(hit.face.b);hit.face.c=proxy.vertex(hit.face.c);}
      }
    }
  };
  return () => { mesh.raycast = previous; proxies.forEach(p => p.mesh.geometry.dispose()); };
}
