import { Euler, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { terrainVehicleTilt } from './terrain-vehicle';

it.each([0,Math.PI/2,Math.PI,-Math.PI/4])('keeps the vehicle up vector aligned with a cross slope at heading %s',yaw=>{
  const tilt=terrainVehicleTilt((x,z)=>.1*x+.2*z,12,35,yaw);
  const up=new Vector3(0,1,0).applyEuler(new Euler(tilt.pitch,yaw,tilt.roll,'YXZ'));
  expect(up.dot(new Vector3(-.1,1,-.2).normalize())).toBeGreaterThan(.999);
});
