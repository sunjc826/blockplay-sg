import type { VerticalPlace, PlaceFloor, PlaceConnection, PlaceFixture } from './vertical-places';
import { MARINA_ROUTE_PLACES } from './marina-routes';
import type { FacilitySite } from './facilities';
import type { BuildingLift } from './building-lifts';

export const SKYPARK_FLOOR = 66.4;
/**
 * The Flyer's service core: switchback stairs inside a clad tower. The north and
 * road-side faces are closed walls; the west and south faces stay open above the
 * landing rails, looking over the wheel and its approach. Authored gameplay
 * geometry, not surveyed architecture.
 */
const FLYER_CORE = { x: 180, north: -171, south: -157, height: 33, flights: 11, minX: 173.6, maxX: 186.4, minZ: -174.4, maxZ: -153.6, top: 36 };
function flyerCore(): VerticalPlace {
  const { x, north: a, south: b, height, flights } = FLYER_CORE, c = FLYER_CORE;
  const floors: PlaceFloor[] = [], connections: PlaceConnection[] = [];
  for(let i=0;i<=flights;i++) floors.push({id:`landing-${i}`,x,z:i%2?b:a,y:height*i/flights,width:12,depth:6,color:'#b8b9b2',supports:false});
  for(let i=0;i<flights;i++) {
    const direction=i%2?-1:1,z=i%2?b:a,lane=x+(i%2?3:-3);
    connections.push({id:`flight-${i}`,from:{x:lane,y:height*i/flights,z:z+direction*3},
      to:{x:lane,y:height*(i+1)/flights,z:(i%2?a:b)-direction*3},width:3,stairs:true,color:'#a8b0ae'});
  }
  const midX=(c.minX+c.maxX)/2,midZ=(c.minZ+c.maxZ)/2,wide=c.maxX-c.minX,deep=c.maxZ-c.minZ,wall='#7d95a1',trim='#e4e3dc',pier='#c9c7be';
  const fixtures: PlaceFixture[] = [
    {x:c.maxX,y:c.top/2,z:midZ,width:.3,height:c.top,depth:deep,color:wall},
    {x:midX,y:c.top/2,z:c.minZ,width:wide,height:c.top,depth:.3,color:wall},
    ...[c.minX,c.maxX].flatMap(px=>[c.minZ,c.maxZ].map(pz=>({x:px,y:c.top/2,z:pz,width:.6,height:c.top,depth:.6,color:pier}))),
    {x:c.minX,y:c.top/2,z:midZ,width:.4,height:c.top,depth:.4,color:pier},
    {x:midX,y:c.top/2,z:c.maxZ,width:.4,height:c.top,depth:.4,color:pier},
    {x:midX,y:c.top+.2,z:midZ,width:wide+1.6,height:.4,depth:deep+1.6,color:trim},
    {x:midX,y:c.top+1.1,z:midZ,width:5,height:1.4,depth:7,color:'#56666c'},
    // Floor lines on every face; glazing bands on the two closed faces.
    ...Array.from({length:flights},(_,i)=>(i+1)*height/flights).flatMap((y):PlaceFixture[]=>[
      {x:c.minX-.06,y:y-.13,z:midZ,width:.16,height:.34,depth:deep,color:trim,solid:false},
      {x:midX,y:y-.13,z:c.maxZ+.06,width:wide,height:.34,depth:.16,color:trim,solid:false},
      {x:c.maxX+.2,y:y-.13,z:midZ,width:.12,height:.34,depth:deep+.3,color:trim,solid:false},
      {x:midX,y:y-.13,z:c.minZ-.2,width:wide+.3,height:.34,depth:.12,color:trim,solid:false},
      {x:c.maxX+.19,y:y-1.6,z:midZ,width:.1,height:1.5,depth:deep-1.6,color:'#3f5c70',solid:false},
      {x:midX,y:y-1.6,z:c.minZ-.19,width:wide-1.6,height:1.5,depth:.1,color:'#3f5c70',solid:false},
    ]),
    // Plant and ticketing annex on the road side.
    {x:190.4,y:4.65,z:midZ,width:7.4,height:9.3,depth:deep,color:'#d9d6cc'},
    {x:190.4,y:9.45,z:midZ,width:8,height:.3,depth:deep+.6,color:trim,solid:false},
    ...[2.1,5.4].map((y):PlaceFixture=>({x:194.15,y,z:midZ,width:.1,height:1.6,depth:deep-3,color:'#3f5c70',solid:false})),
  ];
  return {id:'flyer-service-stairs',name:'Flyer service core',note:'Walkable switchback stairs inside a clad tower, from the terminal concourse to the hub and rim gantries.',floors,connections,fixtures};
}
/**
 * Boarding level 3 m up, wrapped round the foot of the wheel: capsules pass
 * through the slot between the two platforms. The ground beneath stays open as
 * an undercroft. A roof terrace sits one storey higher beside the service core.
 */
const boarding=(id:string,x:number,z:number,width:number,depth:number,y=3):PlaceFloor=>({id,x,z,y,width,depth,color:'#c3c1b8'});
const flyerTerminal:VerticalPlace={id:'flyer-terminal',name:'Singapore Flyer terminal',
  note:'Boarding platforms either side of the wheel, linked at both ends, with a grand stair from the forecourt and a roof terrace.',
  floors:[boarding('south-platform',156.5,-154,35,6),boarding('north-platform',156.5,-166.5,35,6),
    boarding('west-link',141,-160.25,4,6.5),boarding('east-link',172,-160.25,4,6.5),
    boarding('roof-terrace',168,-153.5,12,7,9)],
  connections:[
    {id:'grand-stair',from:{x:154.8,y:0,z:-143.5},to:{x:154.8,y:3,z:-151},width:12,stairs:true,color:'#c6c2b5'},
    {id:'west-stair',from:{x:131,y:0,z:-160.25},to:{x:139,y:3,z:-160.25},width:6,stairs:true,color:'#c6c2b5'}],
  fixtures:[
    // Ticket kiosks in the undercroft, either side of the grand stair.
    ...[144.5,166.5].flatMap((x):PlaceFixture[]=>[{x,y:1.3,z:-154,width:3,height:2.6,depth:3,color:'#d9d6cc'},
      {x,y:1.7,z:-152.45,width:2.2,height:.9,depth:.1,color:'#3f5c70',solid:false}]),
    // Platform canopies, set back from the legs and the turning rim.
    {x:156.5,y:6.4,z:-167.5,width:35,height:.2,depth:5,color:'#e4e3dc',solid:false},
    ...[140,151.5,163,173].map((x):PlaceFixture=>({x,y:4.65,z:-169.2,width:.25,height:3.3,depth:.25,color:'#70858c'})),
    {x:150.5,y:6.4,z:-153.15,width:23,height:.2,depth:4.3,color:'#e4e3dc',solid:false},
    ...[139.6,147.6,161.4].map((x):PlaceFixture=>({x,y:4.65,z:-151.4,width:.25,height:3.3,depth:.25,color:'#70858c'})),
  ]};
export const MARINA_LIFTS: readonly BuildingLift[] = [-39,21].map((z,i)=>({id:`sands-express-${i}`,x:90.6,z:z+3,width:4.4,depth:4.6,bottom:0,top:SKYPARK_FLOOR,dwell:7,travel:12,offset:i*19}));
// The hotel ground floor is one connected atrium; bespoke geometry is in marina-atrium.
const atrium:VerticalPlace={id:'sands-atrium',name:'MBS hotel atrium',
  note:'Reference-informed connected lobby, with lounge islands and two express lift approaches.',
  floors:[{id:'concourse',x:92.2,z:-9,y:0,width:20,depth:80,rails:false}],connections:[]};
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
  atrium,
  {id:'sands-skypark',name:'MBS SkyPark combat deck',note:'Two express lift lobbies open directly onto the landscaped rooftop.',
    floors:[],connections:[],
    fixtures:[...[-40,-24,-8,8,31].map(z=>({x:94,z,y:SKYPARK_FLOOR+.3,width:1.3,depth:3,height:.6,color:'#667a52',supportsTop:true,render:false})),
      ...[-30,0,16].flatMap(z=>[{x:87.2,z,y:SKYPARK_FLOOR+.5,width:1.6,depth:2.4,height:.18},{x:86.5,z,y:SKYPARK_FLOOR+.8,width:.2,depth:2.4,height:.6},...[-.9,.9].map(dz=>({x:87.2,z:z+dz,y:SKYPARK_FLOOR+.2,width:1.2,depth:.15,height:.4}))].map(f=>({...f,color:'#c1bda6',supportsTop:true,render:false})))]},
  flyerCore(), flyerTerminal,
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
  ...MARINA_ROUTE_PLACES,
];
export const MARINA_LANDMARK_OBJECTIVES: readonly FacilitySite[] = [
  {id:'marina-bay-skypark',name:'MBS SkyPark relay',x:90.6,y:SKYPARK_FLOOR,z:-18},
  {id:'marina-bay-flyer',name:'Flyer overwatch station',x:157,y:33,z:-151},
  {id:'marina-bay-canopy',name:'Supertree canopy stores',x:188,y:7.2,z:39},
].map(p=>({...p,kind:'supply',initialOwner:null,initiallyBuilt:true,combatFocus:'secondary',deployment:{x:p.x,z:p.z,yaw:0}}));
