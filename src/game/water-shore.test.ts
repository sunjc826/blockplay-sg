import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createWaterDepthMap } from './water-shore';
import { sentosaBeachHeight, SENTOSA_BEACH } from './sentosa-beach';

describe('shore bathymetry', () => {
  it('resolves the dry beach, gradual shallows and deep landing channels from the rendered terrain', () => {
    const b=SENTOSA_BEACH;
    const map=createWaterDepthMap(new THREE.Vector4(b.minX,b.minZ,b.maxX,b.maxZ),b.surface,sentosaBeachHeight);
    const {data,width,height}=map.image;
    const sample=(x:number,z:number)=>{
      const ix=Math.floor((x-b.minX)/(b.maxX-b.minX)*width),iz=Math.floor((z-b.minZ)/(b.maxZ-b.minZ)*height);
      const wx=b.minX+(ix+.5)/width*(b.maxX-b.minX),wz=b.minZ+(iz+.5)/height*(b.maxZ-b.minZ);
      const depth=Number(data[iz*width+ix])/255*4;
      expect(depth).toBeCloseTo(THREE.MathUtils.clamp(b.surface-sentosaBeachHeight(wx,wz)!,0,4),1);
      return depth;
    };
    expect(sample(0,195)).toBe(0);
    const shallows=[197,198,200,204,208].map(z=>sample(0,z));
    for(let i=1;i<shallows.length;i++)expect(shallows[i]).toBeGreaterThan(shallows[i-1]);
    expect(sample(155,204)).toBeGreaterThan(2.5);
    expect(sample(0,260)).toBe(4);
    expect(map.minFilter).toBe(THREE.LinearFilter);map.dispose();
  });
  it('treats an unspecified floor as open water and caps the stored range', () => {
    const map=createWaterDepthMap(new THREE.Vector4(0,0,1,1),0,x=>x<.5?undefined:-10);
    expect(map.image.data.every(value=>value===255)).toBe(true);map.dispose();
  });
});
