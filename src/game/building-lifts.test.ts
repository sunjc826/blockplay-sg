import {expect,it} from 'vitest';
import {createArena} from './arena-rules';
import {createRegionMovement} from './region-collision';
import {liftGates,liftPassenger,liftSample,type BuildingLift} from './building-lifts';
import {validArenaSnapshot} from './arena-runtime';
import {createVerticalMovement} from './vertical-movement';
import {measureVerticality} from './verticality-metrics';
const lift:BuildingLift={id:'express',x:0,z:0,width:4.4,depth:4.6,bottom:0,top:66.4,dwell:7,travel:12,offset:0};
const bounds={minX:-30,maxX:30,minZ:-30,maxZ:30};
const surfaces=[{id:'roof',routeId:'roof',minX:-10,maxX:10,minZ:-10,maxZ:10,axis:'x' as const,startHeight:66.4,endHeight:66.4}];
const config={bounds,obstacles:[],traversalObstacles:[],surfaces,lifts:[lift]};
const env={bounds,move:createRegionMovement(bounds).move,spawns:[{x:0,z:0}],playerSpawn:{x:0,z:0},endless:true};
const actor=(arena:ReturnType<typeof createArena>,id:string)=>arena.snapshot().actors.find(a=>a.id===id)!;
const step=(arena:ReturnType<typeof createArena>,seconds:number)=>{for(let t=0;t<seconds-.001;t+=.05)arena.step(.05);};
it('keeps doors closed at the absent car and opens only at a stopped car',()=>{
 expect(liftSample(lift,0)).toMatchObject({y:0,open:true});expect(liftGates([lift],0)).toHaveLength(1);
 expect(liftSample(lift,13)).toMatchObject({y:33.2,moving:true});expect(liftGates([lift],13)).toHaveLength(2);
 expect(liftSample(lift,19)).toMatchObject({y:66.4,open:true});expect(liftGates([lift],19)).toHaveLength(1);
 expect(liftSample(lift,38)).toMatchObject({y:0,open:true});
 const movement=createVerticalMovement(config),start={x:0,y:0,z:-4,velocityY:0};
 expect(movement.move(start,0,4,0,.38,1.8,liftGates([lift],13)).z).toBeLessThan(-2.3);
 expect(movement.move(start,0,4,0,.38,1.8,liftGates([lift],0)).z).toBeCloseTo(0);
});
it('carries multiple host-owned passengers up and down, rejecting movement during travel',()=>{
 const arena=createArena([],0,'mixed',env,undefined,config);
 for(const id of ['a','b'])arena.addPlayer(id,id,0,0,[],undefined,true);
 step(arena,13);
 for(const id of ['a','b']){
  expect(actor(arena,id)).toMatchObject({lift:'express'});expect(actor(arena,id).y).toBeCloseTo(34.95);
  arena.setInput(id,{x:25,y:1.75,z:25,yaw:1,pitch:.2,weapon:0,playing:true});
  expect(actor(arena,id).x).toBe(0);expect(actor(arena,id).y).toBeCloseTo(34.95);
 }
 step(arena,7);expect(actor(arena,'a').y).toBeCloseTo(68.15);
 // Step out at the upper landing; remaining passenger returns with the car.
 arena.setInput('a',{x:0,y:68.15,z:-5,yaw:1,pitch:0,weapon:0,playing:true});
 step(arena,18.5);expect(actor(arena,'a').y).toBeCloseTo(68.15);expect(actor(arena,'a').lift).toBeUndefined();expect(actor(arena,'b').y).toBeCloseTo(1.75);
 expect(validArenaSnapshot(arena.snapshot(),env)).toBe(true);
 arena.reset();expect(actor(arena,'b').lift).toBeUndefined();expect(arena.snapshot().elapsed).toBe(0);
});
it('carries a bot through the same cabin and does not collect nearby or elevated bystanders',()=>{
 const arena=createArena([],1,'mixed',env,undefined,{...config,lifts:[{...lift,offset:7}]});
 step(arena,6);expect(actor(arena,'bot-1').lift).toBe('express');expect(actor(arena,'bot-1').y).toBeCloseTo(34.95);
 expect(liftPassenger([lift],{x:0,y:5,z:0},0)).toBeUndefined();expect(liftPassenger([lift],{x:0,y:0,z:-3},0)).toBeUndefined();
});
it('includes explicit lift service in reachability without inventing access to unrelated roofs',()=>{
 const input={...config,spawn:{x:0,z:-15}};
 expect(measureVerticality({...input,lifts:[]}).isReachable({x:0,y:66.4,z:-5})).toBe(false);
 expect(measureVerticality(input).isReachable({x:0,y:66.4,z:-5})).toBe(true);
});

it('boards a crouched player at an open stop and restores standing height for the cabin',()=>{
 const arena=createArena([],0,'mixed',env,undefined,config);arena.addPlayer('a','a',0,0,[],undefined,true);
 arena.setInput('a',{x:0,y:1.2,z:0,yaw:0,pitch:0,weapon:0,playing:true});step(arena,.05);
 expect(actor(arena,'a')).toMatchObject({lift:'express',prone:false});expect(actor(arena,'a').y).toBe(1.75);
});

it('lets an objective-seeking bot approach, board, ride and leave the lift through navigation',()=>{
 const sites=[{id:'home',name:'Lobby post',kind:'command' as const,initialOwner:'mercenaries' as const,x:0,y:0,z:-12,deployment:{x:0,z:-12,yaw:0}},
  {id:'roof',name:'Roof relay',kind:'supply' as const,initialOwner:null,initiallyBuilt:true,combatFocus:'secondary' as const,x:0,y:66.4,z:-8,deployment:{x:0,z:-8,yaw:0}}];
 const arena=createArena([],1,'mixed',{...env,spawns:[{x:0,z:-6}],departedCrew:['bot-2','bot-3','bot-4','bot-5'],facilities:{sites:[sites[1]]}},undefined,config);
 let rode=false,arrived=false;
 for(let i=0;i<1800;i++){
  arena.step(.05);const bot=actor(arena,'bot-1');rode ||= bot.lift==='express'&&bot.y>10&&bot.y<60;
  if(rode&&bot.y>68&&bot.z<-4){arrived=true;break;}
 }
 expect({rode,arrived},JSON.stringify(arena.snapshot().actors)).toEqual({rode:true,arrived:true});
});
