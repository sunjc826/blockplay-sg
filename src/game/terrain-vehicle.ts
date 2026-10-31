/** Orient a vehicle's local up direction to its four support points. */
export function terrainVehicleTilt(height: (x:number,z:number)=>number, x:number,z:number,yaw:number) {
  const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
  return {
    pitch: Math.atan2(height(x+fx*1.4,z+fz*1.4)-height(x-fx*1.4,z-fz*1.4),2.8),
    roll: Math.atan2(height(x+rx,z+rz)-height(x-rx,z-rz),2),
  };
}
