import { createVerticalMovement, type VerticalWorld, type VerticalState } from './vertical-movement';
import { insideFootprint, overlapsObstacle, type Obstacle } from './region-collision';
import { MARINA_CAMP_DECKS, MARINA_QUAY_RAILS, MARINA_SWIM_EXITS } from './marina-water';

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
  const overDeck=(x:number,z:number)=>MARINA_CAMP_DECKS.some(d=>x>=d.minX&&x<=d.maxX&&z>=d.minZ&&z<=d.maxZ&&(!d.footprint||insideFootprint(d.footprint,x,z)));
  /** Between a ladder's rails at the deck edge, where walking on means climbing down. */
  const atLadder=(x:number,z:number)=>MARINA_SWIM_EXITS.some(p=>{const out=(x-p.x)*p.dx+(z-p.z)*p.dz,along=Math.abs((x-p.x)*p.dz-(z-p.z)*p.dx);return along<=.55&&out>=-.6&&out<=1.2;});
  /** `leaping` is for callers that track no vertical state, such as the arena's authority. */
  function move(state:VerticalState,dx:number,dz:number,dt:number,radius=.38,height=1.8,extra:readonly Obstacle[]=[],gravity={rise:15,fall:15},leaping=false) {
    if(!water.length) return {...dry.move(state,dx,dz,dt,radius,height,extra,gravity),swimming:false};
    let next={...state,grounded:false,impactSpeed:0},remainingX=dx,remainingZ=dz;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12)),tick=Math.max(0,dt)/steps,railed=[...extra,...MARINA_QUAY_RAILS];
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
        // Solid ground keeps its edge: only a jump off a deck, or a ladder, goes in. Walking
        // stops a body's width short, so a body on the lip jumped or climbed there and may go on.
        const overWater=isWater(next.x,next.z),onLip=water.some(o=>overlapsObstacle(o,next.x,next.z,radius,1e-5));
        const stepsOff=overDeck(next.x,next.z)&&(leaping||onLip||next.y>0||next.velocityY>0||atLadder(next.x,next.z));
        if(!overWater&&toWet&&!stepsOff&&next.y<2)continue;
        const traversal=overWater||stepsOff||onLip?afloat:dry;
        const blockers=fromWet||MARINA_QUAY_RAILS.some(o=>overlapsObstacle(o,next.x,next.z,radius,1e-5))?extra:railed;
        const result=traversal.move(fromWet?{...next,y:0,velocityY:0}:next,ax,az,tick/2,radius,fromWet||toWet?SWIMMING.bodyHeight:height,blockers,gravity);
        next=result;
        if(isWater(next.x,next.z)&&next.y<=.35)next={...next,y:0,velocityY:0,grounded:false,impactSpeed:0};
      }
    }
    return {...next,swimming:isWater(next.x,next.z)&&next.y<=.35};
  }
  return {move,isWater,canClimb,touchesWater};
}
