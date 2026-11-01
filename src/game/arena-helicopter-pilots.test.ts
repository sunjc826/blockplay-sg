import { expect,it } from 'vitest';
import { createArena } from './arena-rules';
import { createRegionMovement } from './region-collision';
import { validArenaSnapshot } from './arena-runtime';
import { VEHICLE_COMBAT } from './vehicle-combat';
import type { FacilitySite } from './facilities';
const bounds={minX:-500,maxX:500,minZ:-500,maxZ:500};
function scenario(count=3,front=300){
 const sites:FacilitySite[]=[
 {id:'home',name:'Home',kind:'command',initialOwner:'mercenaries',x:-12,y:0,z:0,deployment:{x:-12,z:0,yaw:0}},
 {id:'pad',name:'Pad',kind:'helipad',initialOwner:'mercenaries',x:0,y:0,z:10,deployment:{x:0,z:0,yaw:0}},
 {id:'front',name:'Front',kind:'supply',initialOwner:null,initiallyBuilt:true,combatFocus:'secondary',x:front,y:0,z:0,deployment:{x:front,z:0,yaw:0}}];
 const env={bounds,move:createRegionMovement(bounds).move,spawns:[{x:front-20,z:0},{x:-20,z:0}],playerSpawn:{x:front,z:5},endless:true,departedCrew:Array.from({length:4},(_,i)=>`bot-${count+i+1}`),facilities:{sites}};
 const arena=createArena([],count,'mixed',env,{openWorld:true,spawns:{car:{x:-400,z:-400,yaw:0},helicopter:{x:0,z:0,yaw:0}}});
 return {arena,env};
}
it('existing squad pilots a partially full transport, delivers passengers and returns through normal arena physics',()=>{
 const {arena,env}=scenario(),initial=arena.snapshot().actors.length;
 let boarded=false,departed=false,delivered=false,returned=false,highest=0,crew:string[]=[];
 for(let i=0;i<3200;i++){
  arena.step(.05);const snap=arena.snapshot(),v=snap.vehicles!.find(v=>v.kind==='helicopter')!;
  expect(snap.actors).toHaveLength(initial);
  if(!boarded&&v.occupants[0]){boarded=true;expect(v.y).toBeLessThan(.3);}
  if(!departed&&v.y>2){departed=true;crew=v.occupants.filter((id):id is string=>!!id);expect(crew.length).toBeGreaterThan(1);expect(crew.length).toBeLessThan(4);}
  highest=Math.max(highest,v.y);
  if(departed&&v.x>270&&v.y<.4&&crew.slice(1).some(id=>!snap.actors.find(a=>a.id===id)!.vehicle))delivered=true;
  if(delivered&&v.x<1&&v.y<.4&&!v.occupants.some(Boolean)){returned=true;break;}
 }
 expect({boarded,departed,delivered,returned}).toEqual({boarded:true,departed:true,delivered:true,returned:true});
 expect(highest).toBeGreaterThan(17);expect(validArenaSnapshot(arena.snapshot(),env)).toBe(true);
},30000);

it('chooses armed support when other ground soldiers can hold the objective, then returns after its bounded mission',()=>{
 const {arena}=scenario(6,80);
 for(let n=0;n<6;n++)arena.addPlayer(`target-${n}`,'Opponent',0,0,undefined,undefined,true);
 let flew=false,fired=false,returned=false;
 for(let i=0;i<3200;i++){
  for(let n=0;n<6;n++){arena.setPlayerVitals(`target-${n}`,{health:100});arena.setInput(`target-${n}`,{x:80+n,y:1.75,z:5,yaw:0,pitch:0,weapon:0,playing:true});}
  arena.step(.05);const snap=arena.snapshot(),v=snap.vehicles!.find(v=>v.kind==='helicopter')!;
  if(v.y>10)flew=true;
  if(flew&&v.ammo<VEHICLE_COMBAT.helicopter.ammo)fired=true;
  if(fired&&v.y<.4&&!v.occupants.some(Boolean)){returned=true;break;}
 }
 expect({flew,fired,returned}).toEqual({flew:true,fired:true,returned:true});
},30000);

it('vacating the AI pilot seat cancels the sortie and lands the remaining crew',()=>{
 const {arena}=scenario();let pilot:string|undefined,passengers:string[]=[];
 for(let i=0;i<800;i++){arena.step(.05);const v=arena.snapshot().vehicles!.find(v=>v.kind==='helicopter')!;if(v.y>10){pilot=v.occupants[0]!;passengers=v.occupants.slice(1).filter((id):id is string=>!!id);break;}}
 expect(pilot).toBeDefined();expect(passengers.length).toBeGreaterThan(0);expect(arena.vehicleAction(pilot!,'switch')).toBe(true);
 for(let i=0;i<800;i++)arena.step(.05);
 const snap=arena.snapshot(),v=snap.vehicles!.find(v=>v.kind==='helicopter')!;
 expect(v.y).toBeLessThan(.4);expect(v.occupants.every(id=>id===null)).toBe(true);
 expect(passengers.every(id=>snap.actors.some(a=>a.id===id&&a.alive&&!a.vehicle))).toBe(true);
});
