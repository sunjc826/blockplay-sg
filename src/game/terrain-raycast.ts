import * as THREE from 'three';

/** Keep one rendered heightfield, but test rays against small exact triangle tiles. */
export function accelerateTerrainRaycast(mesh: THREE.Mesh, columns: number, rows: number, tile = 16) {
  const positions = mesh.geometry.getAttribute('position');
  const proxies: THREE.Mesh[] = [];
  for (let z = 0; z < rows - 1; z += tile) for (let x = 0; x < columns - 1; x += tile) {
    const width = Math.min(tile, columns - 1 - x) + 1, depth = Math.min(tile, rows - 1 - z) + 1;
    const vertices: number[] = [], indices: number[] = [];
    for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) {
      const source = (z + j) * columns + x + i;
      vertices.push(positions.getX(source), positions.getY(source), positions.getZ(source));
      if (i < width - 1 && j < depth - 1) {
        const n = j * width + i;
        indices.push(n, n + width, n + 1, n + width + 1, n + 1, n + width);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    proxies.push(new THREE.Mesh(geometry, mesh.material));
  }
  const previous = mesh.raycast;
  mesh.raycast = (ray, hits) => {
    for (const proxy of proxies) {
      proxy.matrixWorld.copy(mesh.matrixWorld);
      const first = hits.length;
      proxy.raycast(ray, hits);
      for (let i = first; i < hits.length; i++) hits[i].object = mesh;
    }
  };
  return () => { mesh.raycast = previous; proxies.forEach(p => p.geometry.dispose()); };
}
