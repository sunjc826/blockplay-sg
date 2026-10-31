import * as THREE from 'three';
import { accelerateTerrainRaycast } from './terrain-raycast';

// Relative gameplay levels, not a survey of Windsor or the reservoir shore.
// One low wooded shoulder replaces three separate 2/5/8 m earth platforms.
const X0 = -158, X1 = -130, Z0 = 16, Z1 = 132;
const XS = Array.from({ length: X1 - X0 + 1 }, (_, i) => X0 + i);
const ZS = Array.from({ length: Z1 - Z0 + 1 }, (_, i) => Z0 + i);
const profile = [[16,0],[32,.6],[40,.6],[56,1.2],[64,1.2],[88,2],[100,2],[124,0],[132,0]] as const;
function level(z: number) {
  for (let i = 1; i < profile.length; i++) if (z <= profile[i][0]) {
    const [a,h] = profile[i-1], [b,k] = profile[i]; return h + (k-h) * (z-a) / (b-a);
  }
  return 0;
}
const heights = ZS.map(z => XS.map(x => level(z) * Math.max(0, Math.min(1, (x-X0)/5, (X1-x)/5))));
export const thomsonTrailX = (z: number) => -146 + Math.sin((z-16)*.045)*2;

/** Exact height of the same triangle used by the rendered ground mesh. */
export function upperThomsonGroundHeight(x: number, z: number) {
  if (x < X0 || x > X1 || z < Z0 || z > Z1) return 0;
  const i = Math.min(XS.length-2, Math.floor(x-X0)), j = Math.min(ZS.length-2, Math.floor(z-Z0));
  const u = x-XS[i], v = z-ZS[j];
  const a = heights[j][i], b = heights[j][i+1], c = heights[j+1][i], d = heights[j+1][i+1];
  return u+v <= 1 ? a+(b-a)*u+(c-a)*v : d+(c-d)*(1-u)+(b-d)*(1-v);
}

export function buildUpperThomsonForestGround() {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const grass = new THREE.Color('#819365'), dirt = new THREE.Color('#ad9e80');
  ZS.forEach((z,j) => XS.forEach((x,i) => {
    positions.push(x, heights[j][i], z);
    const trail = Math.max(0, Math.min(1, (2.1-Math.abs(x-thomsonTrailX(z)))/.6));
    // Dirt belongs to the ground triangles themselves, not a coplanar strip.
    const color = grass.clone().lerp(dirt,trail);
    colors.push(color.r,color.g,color.b);
    if (i < XS.length-1 && j < ZS.length-1) {
      const n = j*XS.length+i; indices.push(n,n+XS.length,n+1,n+XS.length+1,n+1,n+XS.length);
    }
  }));
  const geometry = new THREE.BufferGeometry(); geometry.setIndex(indices);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.94 });
  const mesh = new THREE.Mesh(geometry,material); mesh.name = 'Thomson connected forest shoulder';
  mesh.receiveShadow = true; mesh.userData.groundSurface = mesh.userData.terrain = true;
  const disposeRays = accelerateTerrainRaycast(mesh,XS.length,ZS.length);
  return { mesh, dispose() { disposeRays(); geometry.dispose(); material.dispose(); } };
}
