/** Host-owned Merlion controls. Coordinates are world metres after Marina's scale. */
export const MERLION = {
  x: 0, z: -12, mouthHeight: 3.222, mouthRadius: .966,
  console: { x: 0, z: -8.5 }, cache: { x: 3.1, z: -11.2 }, reach: 1.8,
  range: 65, radius: .95, turnSpeed: 1.6, minPitch: -.75, maxPitch: .3,
  pressureSeconds: 7, rechargeSeconds: 18, recoverySeconds: 3,
  mistSeconds: 4.5, mistRadius: 10, mistCooldown: 22, mistCost: .4,
  packs: 3, packSeconds: 45, pickupSeconds: 8,
} as const;
export type MerlionAction = 'operate' | 'leave' | 'mist' | 'supply';
export const validMerlionAction = (v: unknown): v is MerlionAction => typeof v==='string' && ['operate','leave','mist','supply'].includes(v);
export interface WaterPoint { x: number; y: number; z: number }
export interface MerlionState {
  operator: string | null; yaw: number; pitch: number; pressure: number;
  firing: boolean; recovering: number; mist: number; cooldown: number;
  packs: number; refill: number; end: WaterPoint;
}
export interface WaterActor extends WaterPoint {
  id: string; alive: boolean; bot: boolean; yaw: number; pitch: number;
  swimming?: boolean; vehicle?: unknown; transport?: unknown; prone?: boolean;
}
type Trace = (origin: WaterPoint, direction: WaterPoint, range: number) => number;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function merlionDirection(yaw: number, pitch: number): WaterPoint {
  return { x: -Math.sin(yaw)*Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw)*Math.cos(pitch) };
}
export function merlionMouth(yaw: number): WaterPoint {
  return { x: -Math.sin(yaw)*MERLION.mouthRadius, y: MERLION.mouthHeight, z: MERLION.z-Math.cos(yaw)*MERLION.mouthRadius };
}
export function nearMerlion(a: WaterPoint, site: 'console' | 'cache') {
  const p=MERLION[site];return Math.hypot(a.x-p.x,a.z-p.z)<=MERLION.reach && a.y>=.6 && a.y<2.4;
}
export function mistBetween(s: MerlionState | undefined, a: WaterPoint, b: WaterPoint) {
  if (!s?.mist) return false;
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,den=dx*dx+dy*dy+dz*dz;
  const t=den?clamp(((-a.x)*dx+(2.3-a.y)*dy+(MERLION.z-a.z)*dz)/den,0,1):0;
  return Math.hypot(a.x+dx*t,a.y+dy*t-2.3,a.z+dz*t-MERLION.z)<MERLION.mistRadius;
}
export function createMerlionController(trace: Trace, saved?: MerlionState) {
  const s: MerlionState={operator:null,yaw:-Math.PI/2,pitch:-.06,pressure:1,firing:false,recovering:0,mist:0,cooldown:0,packs:MERLION.packs,refill:MERLION.packSeconds,end:{x:0,y:0,z:0}};
  if(validMerlionState(saved))Object.assign(s,structuredClone(saved),{operator:null,firing:false});
  let held=false,expires=0,clock=0;
  const pickups=new Map<string,number>();
  const eligible=(a: WaterActor)=>a.alive&&!a.swimming&&!a.vehicle&&!a.transport&&!a.prone;
  function action(a: WaterActor, action: MerlionAction) {
    if(action==='leave' && s.operator===a.id){s.operator=null;s.firing=held=false;return true;}
    if(!eligible(a))return false;
    if(action==='supply'){
      if(!nearMerlion(a,'cache')||s.packs<1||clock<(pickups.get(a.id)??-Infinity))return false;
      pickups.set(a.id,clock+MERLION.pickupSeconds);if(s.packs===MERLION.packs)s.refill=MERLION.packSeconds;s.packs--;return true;
    }
    if(!nearMerlion(a,'console'))return false;
    if(action==='operate'&&!s.operator){s.operator=a.id;expires=clock+.5;held=false;return true;}
    if(action==='mist'&&s.operator===a.id&&s.cooldown===0&&s.pressure>=MERLION.mistCost){s.mist=MERLION.mistSeconds;s.cooldown=MERLION.mistCooldown;s.pressure-=MERLION.mistCost;return true;}
    return false;
  }
  function input(a: WaterActor, fire: boolean, playing: boolean) {
    if(s.operator!==a.id)return;
    if(!playing){held=false;s.operator=null;s.firing=false;return;}
    held=fire;expires=clock+.35;
  }
  function step(dt: number, actors: readonly WaterActor[], wet: (a: WaterActor, strength: number)=>void) {
    clock+=dt;s.cooldown=Math.max(0,s.cooldown-dt);s.mist=Math.max(0,s.mist-dt);s.recovering=Math.max(0,s.recovering-dt);
    if(s.packs<MERLION.packs){s.refill-=dt;while(s.refill<=0&&s.packs<MERLION.packs){s.packs++;s.refill+=MERLION.packSeconds;}}
    const operator=actors.find(a=>a.id===s.operator);
    if(!operator||!eligible(operator)||!nearMerlion(operator,'console')||clock>expires){s.operator=null;held=false;}
    if(s.operator&&operator){
      const turn=Math.atan2(Math.sin(operator.yaw-s.yaw),Math.cos(operator.yaw-s.yaw));
      s.yaw=Math.atan2(Math.sin(s.yaw+clamp(turn,-MERLION.turnSpeed*dt,MERLION.turnSpeed*dt)),Math.cos(s.yaw+clamp(turn,-MERLION.turnSpeed*dt,MERLION.turnSpeed*dt)));
      s.pitch+=clamp(clamp(operator.pitch,MERLION.minPitch,MERLION.maxPitch)-s.pitch,-dt,dt);
    }
    s.firing=!!s.operator&&held&&s.recovering===0&&s.pressure>0;
    if(s.firing){s.pressure=Math.max(0,s.pressure-dt/MERLION.pressureSeconds);if(s.pressure===0)s.recovering=MERLION.recoverySeconds;}
    else s.pressure=Math.min(1,s.pressure+dt/MERLION.rechargeSeconds);
    const origin=merlionMouth(s.yaw),direction=merlionDirection(s.yaw,s.pitch);
    // Stop at solid scenery and the bay surface. The host publishes the same end for every renderer.
    const waterRange=direction.y<0?(origin.y+.24)/-direction.y:MERLION.range;
    const range=Math.max(0,Math.min(MERLION.range,waterRange,trace(origin,direction,MERLION.range)));
    s.end={x:origin.x+direction.x*range,y:origin.y+direction.y*range,z:origin.z+direction.z*range};
    for(const a of actors){
      if(!a.alive)continue;
      if(s.mist&&Math.hypot(a.x,a.y-2.3,a.z-MERLION.z)<MERLION.mistRadius)wet(a,.48);
      if(!s.firing||a.id===s.operator)continue;
      const dx=a.x-origin.x,dy=a.y-origin.y,dz=a.z-origin.z;
      const along=dx*direction.x+dy*direction.y+dz*direction.z;
      if(along<0||along>range+.1)continue;
      if(Math.hypot(dx-direction.x*along,dy-direction.y*along,dz-direction.z*along)>MERLION.radius)continue;
      const length=Math.hypot(dx,dy,dz);
      if(length>0&&trace(origin,{x:dx/length,y:dy/length,z:dz/length},length)>=length-.08)wet(a,1);
    }
  }
  function reset(){Object.assign(s,{operator:null,yaw:-Math.PI/2,pitch:-.06,pressure:1,firing:false,recovering:0,mist:0,cooldown:0,packs:MERLION.packs,refill:MERLION.packSeconds});held=false;clock=expires=0;pickups.clear();}
  return {state:s,action,input,step,reset,snapshot:():MerlionState=>({...s,end:{...s.end}})};
}
export function validMerlionState(v: unknown): v is MerlionState {
  if(!v||typeof v!=='object')return false;
  const s=v as MerlionState;
  return (s.operator===null||typeof s.operator==='string'&&s.operator.length<=100)&&typeof s.firing==='boolean'&&
    [s.yaw,s.pitch,s.pressure,s.recovering,s.mist,s.cooldown,s.packs,s.refill,s.end?.x,s.end?.y,s.end?.z].every(Number.isFinite)&&
    Math.abs(s.yaw)<=Math.PI+.001&&s.pitch>=MERLION.minPitch&&s.pitch<=MERLION.maxPitch&&s.pressure>=0&&s.pressure<=1&&
    s.recovering>=0&&s.recovering<=MERLION.recoverySeconds&&s.mist>=0&&s.mist<=MERLION.mistSeconds&&s.cooldown>=0&&s.cooldown<=MERLION.mistCooldown&&
    Number.isInteger(s.packs)&&s.packs>=0&&s.packs<=MERLION.packs&&s.refill>=0&&s.refill<=MERLION.packSeconds&&Math.hypot(s.end.x,s.end.y-MERLION.mouthHeight,s.end.z-MERLION.z)<=MERLION.range+2;
}
