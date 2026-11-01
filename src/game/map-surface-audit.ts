import * as THREE from 'three';

export interface SurfaceFace {
  axis: number; sign: number; height: number; minU: number; maxU: number; minV: number; maxV: number;
  mesh: THREE.Mesh; instance?: number; material: THREE.Material; triangle?: number; polygon?: number[][];
}

/** Actual static triangles facing a principal axis, including rotated and
 * instanced geometry. Independently animated props are excluded. */
export function mapSurfaceFaces(scene: THREE.Object3D) {
  const faces: SurfaceFace[] = [], matrix = new THREE.Matrix4(), local = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.fpsEffect || object.userData.baseX !== undefined) return;
    let root: THREE.Object3D = object;
    while (root.parent && root.parent !== scene) root = root.parent;
    if (root !== object && !['Connected elevated places', 'Walkable elevated routes'].includes(root.name)) return;
    if (Array.isArray(object.material) || object.material.transparent || object.material.polygonOffset || !object.material.visible) return;
    const position = object.geometry.getAttribute('position'), index = object.geometry.index;
    if (!position) return;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let instance = 0; instance < count; instance++) {
      if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(instance, local); matrix.multiplyMatrices(object.matrixWorld, local); }
      else matrix.copy(object.matrixWorld);
      for (let f = 0; f < (index?.count ?? position.count) / 3; f++) {
        const points = [a,b,c];
        points.forEach((p,i) => p.fromBufferAttribute(position, index ? index.getX(f*3+i) : f*3+i).applyMatrix4(matrix));
        normal.crossVectors(ab.copy(b).sub(a), ac.copy(c).sub(a)).normalize();
        const axis = normal.toArray().findIndex(n => Math.abs(n) > .999999);
        if (axis < 0) continue;
        if (points.some(p => Math.abs(p.getComponent(axis)-a.getComponent(axis))>1e-6)) continue;
        const u = (axis+1)%3, v = (axis+2)%3;
        const polygon = points.map(p=>[p.getComponent(u),p.getComponent(v)]);
        if(normal.getComponent(axis)<0)polygon.reverse();
        faces.push({ axis, sign: Math.sign(normal.getComponent(axis)), height: a.getComponent(axis), minU: Math.min(...points.map(p=>p.getComponent(u))), maxU: Math.max(...points.map(p=>p.getComponent(u))), minV: Math.min(...points.map(p=>p.getComponent(v))), maxV: Math.max(...points.map(p=>p.getComponent(v))), mesh: object, instance: object instanceof THREE.InstancedMesh ? instance : undefined, material: object.material, triangle: f, polygon });
      }
    }
  });
  return faces;
}

export const surfacePolygon = (f: SurfaceFace) => f.polygon ?? [[f.minU,f.minV],[f.maxU,f.minV],[f.maxU,f.maxV],[f.minU,f.maxV]];
/** Convex polygon intersection avoids mistaking a shared triangle edge for a
 * surface overlap merely because both triangle bounding boxes have area. */
export function intersectSurfacePolygons(a: number[][], b: number[][]) {
  let result=a;
  for(let i=0;i<b.length && result.length;i++) {
    const p=b[i],q=b[(i+1)%b.length],side=(r:number[]) => (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    const next:number[][]=[];
    for(let j=0;j<result.length;j++) {
      const r=result[j],s=result[(j+1)%result.length],dr=side(r),ds=side(s);
      if(dr>=0)next.push(r);
      if((dr>=0)!==(ds>=0)){const t=dr/(dr-ds);next.push([r[0]+(s[0]-r[0])*t,r[1]+(s[1]-r[1])*t]);}
    }
    result=next;
  }
  return result;
}

/** Repeatable exposed coplanar-surface audit, not an exhaustive visual certificate.
 * Short normal probes exclude buried joins; different materials expose flicker. */
export function auditMapSurfaces(scene: THREE.Object3D) {
  const faces = mapSurfaceFaces(scene), planes = new Map<string, Map<string, SurfaceFace[]>>(), conflicts: {
    point: number[]; normal: number[]; area: number; materials: string[]; meshes: string[];
  }[] = [];
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3(), point = new THREE.Vector3();
  const visible: THREE.Mesh[]=[];
  scene.traverseVisible(object=>{if(object instanceof THREE.Mesh)visible.push(object);});
  let pairs = 0;
  for (const face of faces) {
    const key = `${face.axis}/${face.sign}/${Math.round(face.height * 10000)}`;
    const bins = planes.get(key) ?? new Map<string, SurfaceFace[]>(), cells: string[] = [];
    // Faces beneath the walking datum and facing into the ground are joins,
    // rather than surfaces a player can see. Keep exposed ground tops.
    const top = face.axis === 1 ? face.height : (face.axis + 1) % 3 === 1 ? face.maxU : face.maxV;
    if (top <= 0 && (face.axis !== 1 || face.sign < 0)) continue;
    for(let u=Math.floor(face.minU/16);u<=Math.floor(face.maxU/16);u++)for(let v=Math.floor(face.minV/16);v<=Math.floor(face.maxV/16);v++)cells.push(`${u}/${v}`);
    const previous = new Set(cells.flatMap(cell=>bins.get(cell)??[]));
    for (const other of previous) {
      if (face.material === other.material || face.mesh === other.mesh && face.instance === other.instance) continue;
      const minU = Math.max(face.minU, other.minU), maxU = Math.min(face.maxU, other.maxU);
      const minV = Math.max(face.minV, other.minV), maxV = Math.min(face.maxV, other.maxV);
      if (maxU - minU < .005 || maxV - minV < .005) continue;
      const polygon=intersectSurfacePolygons(surfacePolygon(face),surfacePolygon(other));
      const area=Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
      if(area<.000025)continue;
      pairs++;
      direction.setComponent(face.axis, -face.sign);
      const center=polygon.reduce((sum,p)=>[sum[0]+p[0]/polygon.length,sum[1]+p[1]/polygon.length],[0,0]);
      for (const [u, v] of [center,...polygon.map(p=>[center[0]*.3+p[0]*.7,center[1]*.3+p[1]*.7])]) {
        point.setComponent(face.axis, face.height + face.sign * .04);
        point.setComponent((face.axis + 1) % 3, u);
        point.setComponent((face.axis + 2) % 3, v);
        ray.set(point, direction); ray.near = 0; ray.far = .041;
        const hits = ray.intersectObjects(visible, false);
        const matches = (f: SurfaceFace) => hits.some(h => h.object === f.mesh && h.instanceId === f.instance && (f.triangle === undefined || h.faceIndex === f.triangle) && Math.abs(h.distance - .04) < .00015);
        if (hits[0]?.distance >= .03985 && matches(face) && matches(other)) {
          point.setComponent(face.axis, face.height);
          const color = (m: THREE.Material) => (m as THREE.MeshStandardMaterial).color?.getHexString() ?? m.type;
          conflicts.push({ point: point.toArray(), normal: direction.clone().negate().toArray(), area, materials: [color(face.material), color(other.material)], meshes: [face, other].map(f => `${f.mesh.name || f.mesh.parent?.name || f.mesh.type}${f.instance === undefined ? '' : `:${f.instance}`}`) });
          break;
        }
      }
      direction.set(0, 0, 0);
    }
    for(const cell of cells){const bin=bins.get(cell)??[];bin.push(face);bins.set(cell,bin);}planes.set(key,bins);
  }
  return { faces: faces.length, candidatePairs: pairs, conflicts };
}
