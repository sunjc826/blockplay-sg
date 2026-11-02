import { createVerticalMovement, type VerticalWorld, type VerticalState } from './vertical-movement';
import { insideFootprint, overlapsObstacle, type Obstacle } from './region-collision';
import { MARINA_SWIM_EXITS } from './marina-water';

export const SWIMMING = { speed: 1.25, eyeHeight: .2, bodyHeight: .65, stillSpeed: .12, spread: .085, settleSeconds: .25 } as const;
export const swimmingCanFire = (family: number, speed: number) => family === 2 && speed <= SWIMMING.stillSpeed;
export function swimmingShotDirection(ray: {x:number;y:number;z:number}, random:()=>number) {
  const yaw=Math.atan2(ray.x,ray.z)+(random()*2-1)*SWIMMING.spread;
  const pitch=Math.asin(Math.max(-1,Math.min(1,ray.y)))+(random()*2-1)*SWIMMING.spread;
  return {x:Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)};
}

/** Player-only traversal: AI still uses dry navigation and cars still collide with water. */
export function createSwimmingMovement(world: VerticalWorld) {
  const dry=createVerticalMovement(world), water=world.obstacles.filter(o=>o.water);
  const afloat=water.length?createVerticalMovement({...world,obstacles:world.obstacles.filter(o=>!o.water)}):dry;
  const isWater=(x:number,z:number)=>water.some(o=>x>=o.minX-1e-5&&x<=o.maxX+1e-5&&z>=o.minZ-1e-5&&z<=o.maxZ+1e-5&&(!o.footprint||insideFootprint(o.footprint,x,z)));
  const touchesWater=(x:number,z:number)=>water.some(o=>overlapsObstacle(o,x,z,.5));
  const canClimb=(x:number,z:number)=>MARINA_SWIM_EXITS.some(p=>Math.hypot(p.x-x,p.z-z)<=1.8);
  function move(state:VerticalState,dx:number,dz:number,dt:number,radius=.38,height=1.8,extra:readonly Obstacle[]=[],gravity={rise:15,fall:15}) {
    if(!water.length) return {...dry.move(state,dx,dz,dt,radius,height,extra,gravity),swimming:false};
    let next={...state,grounded:false,impactSpeed:0},remainingX=dx,remainingZ=dz;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12)),tick=Math.max(0,dt)/steps;
    for(let i=0;i<steps;i++){
      const wet=isWater(next.x,next.z)&&next.y<=.35;
      let sx=remainingX/(steps-i),sz=remainingZ/(steps-i);
      const targetWet=isWater(next.x+sx,next.z+sz);
      if(wet||targetWet){const d=Math.hypot(sx,sz),scale=d>0?Math.min(1,SWIMMING.speed*tick/d):1;sx*=scale;sz*=scale;}
      remainingX-=remainingX/(steps-i);remainingZ-=remainingZ/(steps-i);
      // Resolve each axis so a quay or a hull does not prevent sliding along it.
      for(const [ax,az] of [[sx,0],[0,sz]]){
        const fromWet=isWater(next.x,next.z)&&next.y<=.35,toWet=isWater(next.x+ax,next.z+az);
        if(fromWet&&!toWet&&!canClimb(next.x+ax,next.z+az))continue;
        const traversal=fromWet||toWet||touchesWater(next.x,next.z)||touchesWater(next.x+ax,next.z+az)?afloat:dry;
        const result=traversal.move(fromWet?{...next,y:0,velocityY:0}:next,ax,az,tick/2,radius,fromWet||toWet?SWIMMING.bodyHeight:height,extra,gravity);
        next=result;
        if(isWater(next.x,next.z)&&next.y<=.35)next={...next,y:0,velocityY:0,grounded:false,impactSpeed:0};
      }
    }
    return {...next,swimming:isWater(next.x,next.z)&&next.y<=.35};
  }
  return {move,isWater,canClimb,touchesWater};
}
