import type { PlaceFixture, VerticalPlace } from './vertical-places';

/** Timber seating for trail/heritage stops, not estate chess-table clusters. */
export function trailBench(x: number, z: number, y: number, yaw = 0): PlaceFixture[] {
  const local = (dx: number, dy: number, dz: number, width: number, height: number, depth: number, color: string) => ({
    x:x+dx*Math.cos(yaw)+dz*Math.sin(yaw), z:z-dx*Math.sin(yaw)+dz*Math.cos(yaw), y:y+dy,
    width,height,depth,color,yaw,
  });
  return [
    ...[-.23,0,.23].map(dz => local(0,.52,dz,3,.10,.2,'#8a7152')),
    ...[-1.05,1.05].map(dx => local(dx,.235,0,.18,.47,.62,'#686b64')),
    ...[.76,.96].map(dy => local(0,dy,.29,3,.14,.1,'#8a7152')),
    ...[-1.05,1.05].map(dx => local(dx,.76,.29,.12,.54,.1,'#686b64')),
  ];
}

export const BUKIT_TIMAH_STATION_ACCESS: VerticalPlace = {
  id:'bukit-timah-station-garden', name:'Railway station garden and waiting apron',
  note:'A level low platform with two gentle public approaches and timber rest benches; authored dimensions, not a station access survey.',
  floors:[
    {id:'front-apron',x:84,z:130,y:.5,width:10,depth:32,foundation:'solid',supports:false,rails:false,color:'#c6bda7'},
    {id:'waiting-shelter',x:98,z:130,y:.5,width:18,depth:12,foundation:'solid',supports:false,rails:false,color:'#c6bda7'},
  ],
  connections:[
    {id:'north-approach',from:{x:84,z:102,y:0},to:{x:84,z:114,y:.5},width:6,foundation:'solid',rails:false,color:'#c6bda7'},
    {id:'south-approach',from:{x:84,z:146,y:.5},to:{x:84,z:158,y:0},width:6,foundation:'solid',rails:false,color:'#c6bda7'},
  ],
  fixtures:[...trailBench(86.6,120,.5,Math.PI/2),...trailBench(86.6,140,.5,Math.PI/2)],
};

export const THOMSON_FOREST_REST: VerticalPlace = {
  id:'thomson-forest-rest-stops',name:'Wooded path rest stops',
  note:'Two small stopping places on the low forest shoulder; retained road and reservoir boardwalk are separate routes.',
  floors:[],connections:[],
  fixtures:[...trailBench(-138,60,1.2),...trailBench(-150.5,96,2)],
};

/** The cached Soo Chow Garden Road photo shows a raised entrance, central
 * steps and a longer side approach. Exact game dimensions remain authored. */
export const THOMSON_PLAZA_ACCESS: VerticalPlace = {
  id:'thomson-plaza-entrance', name:'Thomson Plaza entrance landing',
  note:'A low sheltered landing with a direct stair and longer side ramp, adapted from the reviewed exterior photo.',
  floors:[{id:'entrance-landing',x:85,z:-17,y:.6,width:24,depth:8,foundation:'solid',supports:false,rails:false,color:'#c9c4b3'}],
  connections:[
    {id:'side-ramp',from:{x:50,z:-17,y:0},to:{x:73,z:-17,y:.6},width:4,foundation:'solid',rails:false,color:'#c9c4b3'},
    {id:'front-steps',from:{x:85,z:-9,y:0},to:{x:85,z:-13,y:.6},width:6,stairs:true,rails:false,color:'#c9c4b3'},
  ],
};
