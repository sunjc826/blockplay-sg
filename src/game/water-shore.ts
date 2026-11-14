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
