import {MERLION,merlionEndpoint,turnMerlionAim,type MerlionState,type WaterPoint} from './merlion-gameplay';

/** Local steering between authority ticks. Never changes pressure, effects or hit authority. */
export function createMerlionPresentation(trace:(origin:WaterPoint,direction:WaterPoint,range:number)=>number) {
  let pose:MerlionState|undefined,operator:string|null=null,lastTick=-1,age=0;
  return {
    update(state:MerlionState|undefined,dt:number,tick:number,local?:{id:string;yaw:number;pitch:number}) {
      if(!state||!local||state.operator!==local.id){pose=undefined;operator=null;lastTick=-1;age=0;return state;}
      dt=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
      if(!pose||operator!==state.operator||tick<lastTick){pose={...state,end:{...state.end}};operator=state.operator;}
      age=tick!==lastTick?0:age+dt;lastTick=tick;
      if(age>.25){pose={...state,end:{...state.end}};return pose;}
      turnMerlionAim(pose,{...local,bot:false},dt);
      // Bound prediction to a short delivery window; delayed/stale packets cannot
      // leave the rendered jet rotating independently of the host.
      const yawError=Math.atan2(Math.sin(pose.yaw-state.yaw),Math.cos(pose.yaw-state.yaw));
      const yaw=state.yaw+Math.max(-MERLION.playerTurnSpeed*.2,Math.min(MERLION.playerTurnSpeed*.2,yawError));
      const pitch=state.pitch+Math.max(-MERLION.playerPitchSpeed*.2,Math.min(MERLION.playerPitchSpeed*.2,pose.pitch-state.pitch));
      pose={...state,yaw,pitch,end:merlionEndpoint(yaw,pitch,trace)};
      return pose;
    },
  };
}
