import type { VerticalPlace, PlaceFloor, PlaceConnection } from './vertical-places';
import type { FacilitySite } from './facilities';

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
const north=stairTower('sands-north-stairs',107,-50,-30,SKYPARK_FLOOR,12);
const south=stairTower('sands-south-stairs',107,19,39,SKYPARK_FLOOR,12);
// Twelve flights finish at the first landing's side; bridges stay above tower roofs.
export const MARINA_LANDMARK_PLACES: readonly VerticalPlace[] = [
  north,south,
  {id:'sands-skypark',name:'MBS SkyPark combat deck',note:'Two independent service stairways connect the rooftop, with cover and a access terrace.',
    floors:[{id:'roof',x:90.6,z:-9,y:SKYPARK_FLOOR,width:10.5,depth:98,color:'#c6c9b0',supports:false},
      {id:'north-landing',x:100,z:-50,y:SKYPARK_FLOOR,width:8.3,depth:5,color:'#b8b9b2',supports:false},
      {id:'south-landing',x:100,z:19,y:SKYPARK_FLOOR,width:8.3,depth:5,color:'#b8b9b2',supports:false}],
    connections:[{id:'north-link',from:{x:95,y:SKYPARK_FLOOR,z:-50},to:{x:104,y:SKYPARK_FLOOR,z:-50},width:4},
      {id:'south-link',from:{x:95,y:SKYPARK_FLOOR,z:19},to:{x:104,y:SKYPARK_FLOOR,z:19},width:4}],
    fixtures:[...[-40,-24,-8,8,27].map(z=>({x:92.7,z,y:SKYPARK_FLOOR+.65,width:2.4,depth:3,height:1.3,color:'#667a52'})),
      ...[-32,0,19].map(z=>({x:87.2,z,y:SKYPARK_FLOOR+.55,width:2,depth:2.4,height:1.1,color:'#c1bda6'}))]},
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
  {id:'supertree-canopy',name:'Gardens by the Bay canopy circuit',note:'Two stair approaches join ground paths to linked fighting terraces beside the Supertrees.',
    floors:[{id:'canopy-spine',x:188,z:37,y:7.2,width:4,depth:94,color:'#ad9a75'},
      ...[-10,9,39,69.6,84].map((z,i)=>({id:`terrace-${i}`,x:188,z,y:7.2,width:7,depth:8,color:'#ad9a75',supports:false})),
      ...[-10,84].flatMap((z,i)=>[{id:`entry-${i}`,x:158,z,y:0,width:4,depth:4,color:'#c7c3b5'},
        {id:`stair-turn-${i}`,x:172,z,y:3.6,width:4,depth:4,color:'#c7c3b5'}])],
    connections:[-10,84].flatMap((z,i)=>[{id:`lower-stair-${i}`,from:{x:160,z,y:0},to:{x:170,z,y:3.6},width:3,stairs:true},
      {id:`upper-stair-${i}`,from:{x:174,z,y:3.6},to:{x:184.5,z,y:7.2},width:3,stairs:true}]),
    fixtures:[...[-3,22,53,76].map(z=>({x:186.6,z,y:7.75,width:1,depth:2.8,height:1.1,color:'#75865c'})),
      ...[9,69.6].map(z=>({x:190.2,z,y:7.75,width:1.1,depth:3,height:1.1,color:'#bdbaa6'}))]},
];
export const MARINA_LANDMARK_OBJECTIVES: readonly FacilitySite[] = [
  {id:'marina-bay-skypark',name:'MBS SkyPark relay',x:90.6,y:SKYPARK_FLOOR,z:-18},
  {id:'marina-bay-flyer',name:'Flyer overwatch station',x:157,y:33,z:-151},
  {id:'marina-bay-canopy',name:'Supertree canopy stores',x:188,y:7.2,z:39},
].map(p=>({...p,kind:'supply',initialOwner:null,initiallyBuilt:true,combatFocus:'secondary',deployment:{x:p.x,z:p.z,yaw:0}}));
