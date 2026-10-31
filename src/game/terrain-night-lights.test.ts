import { Scene } from 'three';
import { expect, it } from 'vitest';
import { createNightLights } from './world-night-lights';

it('places street and path lamps on the local hillside datum',()=>{
  const groundHeight=(x:number)=>3+x*.02;
  const lights=createNightLights(new Scene(),{roads:[{points:[{x:-60,z:0},{x:60,z:0}]}],roadWidth:14,obstacles:[],bounds:{minX:-80,maxX:80,minZ:-80,maxZ:80,groundHeight}});
  try {
    expect(lights.lamps.length).toBeGreaterThan(8);
    for(const lamp of lights.lamps)expect(lamp.y).toBeCloseTo(groundHeight(lamp.x),6);
  } finally { lights.dispose(); }
});
