import * as THREE from 'three';

/** Static bathymetry for sloped shores. Byte depth has 1.6 cm precision and
 * linear filtering works on every supported device; no extra render pass. */
export function createWaterDepthMap(bounds: THREE.Vector4, surface: number, floor: (x: number, z: number) => number | undefined) {
  const width=512,height=256,data=new Uint8Array(width*height);
  for(let z=0;z<height;z++)for(let x=0;x<width;x++) {
    const y=floor(THREE.MathUtils.lerp(bounds.x,bounds.z,(x+.5)/width),THREE.MathUtils.lerp(bounds.y,bounds.w,(z+.5)/height));
    data[z*width+x]=Math.round(THREE.MathUtils.clamp(y===undefined?4:surface-y,0,4)/4*255);
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RedFormat);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}

/**
 * The same map for water with no modelled bed: depth stands in for distance
 * from the bank, so waves settle toward every edge, island and bridge gap, and
 * zero marks where there is no water at all. `faces` are world x,z triangles.
 * The outline is drawn one texel inside the true one, so a filtered lookup
 * never reports water over land.
 */
export function createWaterCoverageMap(bounds: THREE.Vector4, faces: ArrayLike<number>) {
  const size=512,wet=new Uint8Array(size*size),sx=size/(bounds.z-bounds.x),sz=size/(bounds.w-bounds.y);
  for(let i=0;i<faces.length;i+=6) {
    const ax=(faces[i]-bounds.x)*sx-.5,az=(faces[i+1]-bounds.y)*sz-.5,bx=(faces[i+2]-bounds.x)*sx-.5,bz=(faces[i+3]-bounds.y)*sz-.5,cx=(faces[i+4]-bounds.x)*sx-.5,cz=(faces[i+5]-bounds.y)*sz-.5;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx))),x1=Math.min(size-1,Math.floor(Math.max(ax,bx,cx)));
    const z0=Math.max(0,Math.ceil(Math.min(az,bz,cz))),z1=Math.min(size-1,Math.floor(Math.max(az,bz,cz)));
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++) {
      const e0=(bx-ax)*(z-az)-(bz-az)*(x-ax),e1=(cx-bx)*(z-bz)-(cz-bz)*(x-bx),e2=(ax-cx)*(z-cz)-(az-cz)*(x-cx);
      if((e0>=0&&e1>=0&&e2>=0)||(e0<=0&&e1<=0&&e2<=0))wet[z*size+x]=1;
    }
  }
  const dx=1/sx,dz=1/sz,dd=Math.hypot(dx,dz),distance=new Float32Array(size*size);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++) {
    let inside=x>0&&z>0&&x<size-1&&z<size-1;
    for(let j=-1;inside&&j<=1;j++)for(let i=-1;i<=1;i++)if(!wet[(z+j)*size+x+i]){inside=false;break;}
    distance[z*size+x]=inside?1e9:0;
  }
  const at=(x:number,z:number)=>x<0||z<0||x>=size||z>=size?0:distance[z*size+x];
  for(let z=0;z<size;z++)for(let x=0;x<size;x++)
    distance[z*size+x]=Math.min(distance[z*size+x],at(x-1,z)+dx,at(x,z-1)+dz,at(x-1,z-1)+dd,at(x+1,z-1)+dd);
  for(let z=size-1;z>=0;z--)for(let x=size-1;x>=0;x--)
    distance[z*size+x]=Math.min(distance[z*size+x],at(x+1,z)+dx,at(x,z+1)+dz,at(x+1,z+1)+dd,at(x-1,z+1)+dd);
  const data=new Uint8Array(size*size);
  for(let i=0;i<data.length;i++)data[i]=Math.round(Math.min(4,distance[i]*.6)/4*255);
  const texture=new THREE.DataTexture(data,size,size,THREE.RedFormat);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}

export const waterShoreShader = /* glsl */ `
  uniform sampler2D uWaterDepthMap;
  uniform float uWaterDepthReady;
  uniform vec4 uWaterDepthBounds;
  float shoreDepth(vec2 p) {
    if(uWaterDepthReady<.5) return 4.0;
    vec2 uv=(p-uWaterDepthBounds.xy)/(uWaterDepthBounds.zw-uWaterDepthBounds.xy);
    if(any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) return 4.0;
    return texture2D(uWaterDepthMap,uv).r*4.0;
  }
  float shoreFade(vec2 p) { return smoothstep(.015,.55,shoreDepth(p)); }
`;
