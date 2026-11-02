import type { VerticalPlace, PlaceFloor, PlaceConnection } from './vertical-places';
import type { FacilitySite } from './facilities';
import type { BuildingLift } from './building-lifts';

export const SKYPARK_FLOOR = 66.4;
/** Full-size service access is authored gameplay geometry, not surveyed architecture. */
function stairTower(id: string, x: number, a: number, b: number, height: number, flights: number): VerticalPlace {
  const floors: PlaceFloor[] = [], connections: PlaceConnection[] = [];
  for(let i=0;i<=flights;i++) floors.push({id:`landing-${i}`,x,z:i%2?b:a,y:height*i/flights,width:12,depth:6,color:'#b8b9b2',supports:false});
  for(let i=0;i<flights;i++) {
    const direction=i%2?-1:1,z=i%2?b:a,lane=x+(i%2?3:-3);
    connections.push({id:`flight-${i}`,from:{x:lane,y:height*i/flights,z:z+direction*3},
      to:{x:lane,y:height*(i+1)/flights,z:(i%2?a:b)-direction*3},width:3,stairs:true,color:'#a8b0ae'});
  }
  return {id,name:id.includes('flyer')?'Flyer service stairs':'SkyPark service stairs',note:'Walkable switchback stairs, with landings and guard rails.',floors,connections,
    fixtures:[-1,1].flatMap(side=>[a,b].map(z=>({x:x+side*5.8,z,y:height/2,width:.25,depth:.25,height,color:'#70858c'})))};
}
export const MARINA_LIFTS: readonly BuildingLift[] = [-39,21].map((z,i)=>({id:`sands-express-${i}`,x:90.6,z:z+3,width:4.4,depth:4.6,bottom:0,top:SKYPARK_FLOOR,dwell:7,travel:12,offset:i*19}));
const lobby=(z:number,i:number):VerticalPlace=>({id:`sands-lobby-${i}`,name:`MBS Tower ${i+1} lobby`,note:'Walk-in stone lobby with reception, seating and an enclosed SkyPark lift core.',
  floors:[{id:'lobby',x:91.2,z,y:0,width:18,depth:19.8,rails:false}],connections:[],
  fixtures:[
    ...(i===1?[[91.2,z,18,19.8]]:[[91.2,z-4.6,18,10.6],[91.2,z+7.6,18,4.6],[85.3,z+3,6.2,4.6],[96.5,z+3,7.4,4.6]]).map(([x,z,width,depth])=>({x,z,y:4.5,width,depth,height:.3,color:'#e1d8c2'})),
    // Glazed perimeter has a generous bay-facing entrance and a north entry.
    ...[-8,4.8].map(dz=>({x:82.2,y:2.2,z:z+dz,width:.28,height:4.4,depth:dz<0?3.8:10.2,color:'#637f86'})),
    {x:100.2,y:2.2,z,width:.28,height:4.4,depth:19.8,color:'#637f86'},
    ...[-1,1].map(side=>({x:90.6+side*6.1,y:2.2,z:z-9.9,width:6.7,height:4.4,depth:.28,color:'#637f86'})),
    {x:91.2,y:2.2,z:z+9.9,width:18,height:4.4,depth:.28,color:'#637f86'},
    ...[83,99.4].flatMap(x=>[-8.8,8.8].map(dz=>({x,y:2.3,z:z+dz,width:.7,height:4.6,depth:.7,color:'#ddd4bd'}))),
    {x:96.7,y:.6,z:z-2,width:3,height:1.2,depth:1.1,color:'#77614c'},
    {x:96.7,y:1.23,z:z-2,width:3.2,height:.12,depth:1.3,color:'#e1d8c2'},
    ...[1,6].map(dz=>({x:84,y:.38,z:z+dz,width:1.1,height:.76,depth:2.4,color:'#426360'})),
    {x:87,y:.65,z:z+7.8,width:1.4,height:1.3,depth:1.4,color:'#5e7653'},
    {x:81.5,y:3.9,z:z-3.8,width:3,height:.22,depth:5.2,color:'#d5c5a4'},
  ]});
function spiral(x:number,z:number,id:string):VerticalPlace {
  const radius=4.6,segments=32,points=Array.from({length:segments+1},(_,i)=>{const angle=i/segments*Math.PI*2;return{x:x+radius*Math.cos(angle),z:z+radius*Math.sin(angle),y:i/segments*7.2};});
  return {id,name:'Supertree spiral stair',note:'A planted trunk wrapped by a continuous stair and golden handrail.',
    floors:[{id:'ground-arrival',x:x+radius,z:z-4,y:0,width:3,depth:4,rails:false},
      {id:'crown-arrival',x:x+radius,z:z+4,y:7.2,width:3,depth:4,supports:false,color:'#ad9a75'}],
    connections:[...points.slice(1).map((to,i)=>({id:`turn-${i}`,from:points[i],to,width:2.6,stairs:true,color:'#b8a17a',arc:{x,z,start:i/segments*Math.PI*2,end:(i+1)/segments*Math.PI*2}})),...points.filter((_,i)=>i===0||i===segments).map((from,i)=>({id:`arrival-${i}`,from,to:{...from,z:from.z+(i===0?-4:4)},width:2.6,color:'#b8a17a'}))],
    fixtures:points.filter((_,i)=>i>0&&i<segments&&i%4===0).map(p=>({x:(p.x+x)/2,y:p.y-.3,z:(p.z+z)/2,width:.22,height:.3,depth:radius,yaw:Math.atan2(p.x-x,p.z-z),color:'#703b5d',solid:false}))};
}
const treeStairs=[spiral(174.6,9,'supertree-north-spiral'),spiral(173.4,69.6,'supertree-south-spiral')];
export const MARINA_LANDMARK_PLACES: readonly VerticalPlace[] = [
  ...[-39,-9,21].map(lobby),
  {id:'sands-skypark',name:'MBS SkyPark combat deck',note:'Two express lift lobbies open directly onto the landscaped rooftop.',
    floors:[
      // Split around both lift shafts, keeping the moving car's opening real.
      ...[[-58,-38.3],[-33.7,21.7],[26.3,40]].map(([a,b],i)=>({id:`roof-${i}`,x:90.6,z:(a+b)/2,y:SKYPARK_FLOOR,width:10.5,depth:b-a,color:'#c6c9b0',supports:false,rails:false})),
      ...[-36,24].flatMap((z,i)=>[-1,1].map(side=>({id:`shaft-side-${i}-${side}`,x:90.6+side*3.725,z,y:SKYPARK_FLOOR,width:3.05,depth:4.6,supports:false,rails:false,color:'#c6c9b0'})))],connections:[],
    fixtures:[...[-40,-24,-8,8,31].map(z=>({x:94,z,y:SKYPARK_FLOOR+.65,width:1.3,depth:3,height:1.3,color:'#667a52'})),
      ...[-30,0,16].map(z=>({x:87.2,z,y:SKYPARK_FLOOR+.55,width:1.6,depth:2.4,height:1.1,color:'#c1bda6'})),
      ...[-1,1].map(side=>({x:90.6+side*5.2,z:-9,y:SKYPARK_FLOOR+.6,width:.12,depth:98,height:1.2,color:'#667b7c'}))]},
  stairTower('flyer-service-stairs',180,-171,-157,33,11),
  {id:'flyer-overlooks',name:'Singapore Flyer maintenance overlooks',note:'Fixed access gantries remain clear of the rotating rim and passenger capsules.',
    floors:[{id:'hub-walk',x:164,z:-171,y:18,width:28,depth:4.5,color:'#a3b3b6',supports:false},
      {id:'upper-walk',x:166,z:-151,y:33,width:32,depth:5,color:'#a3b3b6',supports:false},
      {id:'upper-turn',x:177,z:-155,y:33,width:4,depth:5,color:'#a3b3b6',supports:false}],
    connections:[{id:'hub-link',from:{x:177,y:18,z:-171},to:{x:180,y:18,z:-171},width:3},
      {id:'upper-link',from:{x:177,y:33,z:-157},to:{x:177,y:33,z:-151},width:3}],
    fixtures:[{x:154,z:-172.3,y:18.55,width:3,depth:.6,height:1.1,color:'#687e87'},
      {x:153,z:-152.8,y:33.55,width:3,depth:.6,height:1.1,color:'#687e87'},
      {x:162,z:-149.2,y:33.55,width:4,depth:.6,height:1.1,color:'#687e87'}]},
  ...treeStairs,
  {id:'supertree-canopy',name:'Gardens by the Bay canopy circuit',note:'Trunk-wrapped spiral stairs join the linked garden terraces.',
    floors:[{id:'canopy-spine',x:188,z:43.3,y:7.2,width:4,depth:68.6,color:'#ad9a75'},
      ...[13,39,73.6].map((z,i)=>({id:`terrace-${i}`,x:188,z,y:7.2,width:6,depth:6,color:'#ad9a75',supports:false}))],
    connections:treeStairs.map((p,i)=>({id:`crown-link-${i}`,from:{x:p.floors[1].x+1.5,z:p.floors[1].z,y:7.2},to:{x:185,z:p.floors[1].z,y:7.2},width:2.6,color:'#ad9a75'})),
    fixtures:[...[-3,22,53,76].filter(z=>z>10&&z<68).map(z=>({x:186.6,z,y:7.75,width:1,depth:2.8,height:1.1,color:'#75865c'}))]},
];
export const MARINA_LANDMARK_OBJECTIVES: readonly FacilitySite[] = [
  {id:'marina-bay-skypark',name:'MBS SkyPark relay',x:90.6,y:SKYPARK_FLOOR,z:-18},
  {id:'marina-bay-flyer',name:'Flyer overwatch station',x:157,y:33,z:-151},
  {id:'marina-bay-canopy',name:'Supertree canopy stores',x:188,y:7.2,z:39},
].map(p=>({...p,kind:'supply',initialOwner:null,initiallyBuilt:true,combatFocus:'secondary',deployment:{x:p.x,z:p.z,yaw:0}}));
