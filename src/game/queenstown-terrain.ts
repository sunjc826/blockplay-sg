import * as THREE from 'three';

/** Relative game levels informed by Queenstown's hillside estates, not surveyed RLs. */
export const QUEENSTOWN_TERRACES = [
  { id: 'stirling-lower', x: -73, z: -44, width: 88, depth: 30, y: 3.6 },
  { id: 'stirling-upper', x: -73, z: -83, width: 88, depth: 30, y: 6.4 },
  { id: 'commonwealth', x: -91, z: -153, width: 76, depth: 30, y: 10.2 },
  { id: 'library', x: 23, z: -103, width: 54, depth: 20, y: 4.6 },
  { id: 'market', x: 73, z: -10, width: 76, depth: 22, y: .8 },
  { id: 'court', x: 85, z: -53, width: 44, depth: 50, y: 2.4 },
  { id: 'west-tower', x: -210, z: -75, width: 36, depth: 32, y: 5.2 },
  { id: 'east-tower', x: 208, z: -75, width: 36, depth: 32, y: 3.4 },
  { id: 'north-tower', x: 95, z: -155, width: 36, depth: 32, y: 6.4 },
  { id: 'west-garden', x: -194, z: -148, width: 48, depth: 32, y: 9.2 },
  { id: 'sheltered-link', x: -76, z: -20, width: 96, depth: 6, y: 1.6 },
  { id: 'community-garden', x: 15, z: -63, width: 30, depth: 16, y: 2.8 },
  // These older/newer southern blocks remain on the low estate floor.
  { id: 'home', x: -76, z: 77, width: 88, depth: 32, y: 0 },
  { id: 'hdb', x: 78, z: 76, width: 88, depth: 32, y: 0 },
  { id: 'dawson', x: 78, z: 151, width: 88, depth: 32, y: 0 },
] as const;
const profile = (n: number, points: readonly (readonly [number, number])[]) => {
  if (n <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) if (n <= points[i][0]) {
    const [a, h] = points[i-1], [b, k] = points[i]; return h + (k-h)*(n-a)/(b-a);
  }
  return points.at(-1)![1];
};
const roadSegments=[[-235,-185,235,-185],[-235,185,235,185],[-235,-185,-235,185],[235,-185,235,185],[-140,-122,140,-122],[-140,116,140,116],[-140,-122,-140,116],[140,-122,140,116],[-150,22,235,22],[-15,32,-15,185],[0,-185,0,-122],[-235,-122,-140,-122]];
function authoredHeight(x: number, z: number) {
  // One long west shoulder and a gentler eastern slope share the low station edge.
  const rise = profile(z, [[-224, 11], [-165, 10.6], [-110, 8.5], [-70, 5.6], [-30, 2.5], [10, 0], [224, 0]]);
  const shoulder = profile(x, [[-272,.88],[-150,1],[-65,1],[-5,.55],[100,.58],[240,.68],[272,.62]]);
  const street=rise*shoulder;
  let y=street;
  // Roads keep gradual profiles through the hillside instead of inheriting
  // local cuts for buildings. All crossings sample the same continuous datum.
  const roadDistance=Math.min(...roadSegments.map(([ax,az,bx,bz])=>Math.hypot(x-Math.max(Math.min(ax,bx),Math.min(Math.max(ax,bx),x)),z-Math.max(Math.min(az,bz),Math.min(Math.max(az,bz),z)))));
  if (Math.abs(x+65)<=2.1 && z>=-68 && z<=-59) return 3.6+(-59-z)*2.8/9;
  const contained=QUEENSTOWN_TERRACES.find(p=>Math.abs(x-p.x)<=p.width/2 && Math.abs(z-p.z)<=p.depth/2);
  if(contained) return contained.y;
  if(roadDistance<=7)return street;
  for (const pad of QUEENSTOWN_TERRACES) {
    const distance = Math.max(0, Math.abs(x-pad.x)-pad.width/2, Math.abs(z-pad.z)-pad.depth/2);
    if (distance >= 10) continue;
    // Level forecourts sit within the connected slope; the transition is outside
    // the complete building/stair footprint, never through its void deck.
    const blend = 1-distance/10; y += (pad.y-y)*blend;
  }
  // Retained downhill edges of the three residential pads. Access stays at
  // their open ends and the connected forecourt steps, rather than through walls.
  for(const pad of QUEENSTOWN_TERRACES.slice(0,3)) {
    const edge=pad.x+pad.width/2,dx=x-edge,dz=Math.abs(z-pad.z);
    if(dx>0&&dx<10&&dz<12) {
      const depth=1.3*Math.min(1,(12-dz)/2);
      y=Math.min(y,pad.y-depth*(1-dx/10));
    }
  }
  return y;
}

const axis = (min:number,max:number,extra:number[]) => [...new Set([
  ...Array.from({length:(max-min)/4+1},(_,i)=>min+i*4),...extra.filter(n=>n>min&&n<max),
])].sort((a,b)=>a-b);
export const QUEENSTOWN_TERRAIN_X = axis(-272,272,QUEENSTOWN_TERRACES.flatMap(p=>[p.x-p.width/2-10,p.x-p.width/2,p.x+p.width/2,p.x+p.width/2+10]).concat(QUEENSTOWN_TERRACES.slice(0,3).flatMap(p=>[p.x+p.width/2+.3,p.x+p.width/2+10]),[-67.1,-62.9,-150,-65,-5,100,240,...[-235,-140,-15,0,140,235].flatMap(x=>[x-7,x,x+7])]));
export const QUEENSTOWN_TERRAIN_Z = axis(-224,224,QUEENSTOWN_TERRACES.flatMap(p=>[p.z-p.depth/2-10,p.z-p.depth/2,p.z+p.depth/2,p.z+p.depth/2+10]).concat(QUEENSTOWN_TERRACES.slice(0,3).flatMap(p=>[p.z-12,p.z-10,p.z+10,p.z+12]),[-68,-59,-165,-110,-70,-30,10,...[-185,-122,22,116,185].flatMap(z=>[z-7,z,z+7])]));
const heights=QUEENSTOWN_TERRAIN_Z.map(z=>QUEENSTOWN_TERRAIN_X.map(x=>authoredHeight(x,z)));
const cell=(axis:readonly number[],n:number) => {
  let low=0,high=axis.length-1;
  while(high-low>1){const mid=(low+high)>>1;if(n<axis[mid])high=mid;else low=mid;}
  return Math.min(low,axis.length-2);
};
/** Exact interpolation of the same two triangles rendered in each grid cell. */
export function queenstownTerrainHeight(x:number,z:number) {
  const i=cell(QUEENSTOWN_TERRAIN_X,x),j=cell(QUEENSTOWN_TERRAIN_Z,z);
  const u=Math.max(0,Math.min(1,(x-QUEENSTOWN_TERRAIN_X[i])/(QUEENSTOWN_TERRAIN_X[i+1]-QUEENSTOWN_TERRAIN_X[i])));
  const v=Math.max(0,Math.min(1,(z-QUEENSTOWN_TERRAIN_Z[j])/(QUEENSTOWN_TERRAIN_Z[j+1]-QUEENSTOWN_TERRAIN_Z[j])));
  const a=heights[j][i],b=heights[j][i+1],c=heights[j+1][i],d=heights[j+1][i+1];
  return u+v<=1 ? a+(b-a)*u+(c-a)*v : d+(c-d)*(1-u)+(b-d)*(1-v);
}

export function buildQueenstownTerrain() {
  const positions:number[]=[],colors:number[]=[],indices:number[]=[];
  const low=new THREE.Color('#8b9e70'),high=new THREE.Color('#6d8857'),width=QUEENSTOWN_TERRAIN_X.length;
  QUEENSTOWN_TERRAIN_Z.forEach((z,j)=>QUEENSTOWN_TERRAIN_X.forEach((x,i)=>{
    const y=heights[j][i],color=low.clone().lerp(high,Math.min(1,y/12));
    positions.push(x,y,z);colors.push(color.r,color.g,color.b);
    if(i<width-1&&j<QUEENSTOWN_TERRAIN_Z.length-1){const n=j*width+i;indices.push(n,n+width,n+1,n+width+1,n+1,n+width);}
  }));
  const geometry=new THREE.BufferGeometry();geometry.setIndex(indices);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Queenstown connected hillside';
  mesh.receiveShadow=true;mesh.userData.terrain=true;mesh.userData.groundSurface=true;
  return {mesh,dispose(){geometry.dispose();material.dispose();}};
}
