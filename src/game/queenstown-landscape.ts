import { QUEENSTOWN_TERRACES } from './queenstown-terrain';
import type { VerticalPlace } from './vertical-places';

/** Authored residential landscape, not surveyed present-day terrain. */
export const QUEENSTOWN_PATHS = [
  // Pavements on both sides of the inner estate road were missing entirely.
  ...[-149, -131, 131, 149].map(x => ({ x, z: -3, width: 3, depth: 238 })),
  // Links from the outer sidewalks to the estate: deliberate junctions, not a
  // uniform paved grid. Existing roads supply the pedestrian crossings.
  ...[-104, -4, 84].map(z => ({ x: -188, z, width: 75, depth: 3.2 })),
  ...[-102, -6, 94].map(z => ({ x: 188, z, width: 75, depth: 3.2 })),
  { x: -139, z: -137, width: 80, depth: 3.2 },
  { x: -164, z: 145, width: 60, depth: 3.2 },
  ...[-119, -32].map(x => ({ x, z: -52, width: 3.2, depth: 120 })),
  ...[37, 120].map(x => ({ x, z: -40, width: 3.2, depth: 96 })),
  ...[-119, -32, 37, 120].map(x => ({ x, z: 109, width: 3.2, depth: 142 })),
  ...[-34, -73].map(z => ({ x: -75, z, width: 88, depth: 3.2 })),
  { x: -91, z: -143, width: 76, depth: 3.2 },
  { x: 78, z: 161, width: 84, depth: 3.2 },
  // East/west paths join the station, deck paths and civic court.
  { x: 0, z: -88, width: 240, depth: 3.2 },
  { x: 0, z: 58, width: 240, depth: 3.2 },
] as const;

// The old isolated four-sided banks have been replaced by connected terrain.
export { queenstownTerrainHeight, QUEENSTOWN_TERRACES } from './queenstown-terrain';

/** Contour promenade and estate approaches. Existing paths connect into these. */
export const QUEENSTOWN_HILLSIDE_PATHS = [
  { id: 'west-contour', width: 3.2, points: [[-218,4],[-204,-20],[-186,-42],[-184,-64],[-185,-100],[-171,-124],[-146,-138]] },
  { id: 'upper-approach', width: 3.2, points: [[-149,-104],[-130,-104],[-119,-101],[-119,-68],[-119,-59],[-119,-22],[-131,-6]] },
  { id: 'library-garden', width: 3.2, points: [[-4,-88],[-4,-81],[0,-76],[23,-76],[48,-85],[56,-104]] },
] as const;

/** A direct stair shortcut connects the two residential forecourts. */
export const QUEENSTOWN_LANDSCAPE_PLACES: VerticalPlace[] = [{
  id: 'queenstown-stirling-terrace-stairs', name: 'Stirling forecourt steps',
  note: 'Authored connection between lower and upper residential terraces; relative game levels.',
  floors: [{id:'lower-landing',x:-65,z:-58,y:3.6,width:4,depth:2,rails:false,supports:false},{id:'upper-landing',x:-65,z:-69,y:6.4,width:4,depth:2,rails:false,supports:false}],
  fixtures: QUEENSTOWN_TERRACES.slice(0,3).flatMap(p=>[
    {x:p.x+p.width/2+.12,y:p.y-.2,z:p.z,width:.24,height:2.2,depth:20,color:'#a8a695'},
    {x:p.x+p.width/2+.12,y:p.y+.94,z:p.z,width:.4,height:.08,depth:20.2,color:'#d6cfbb'},
  ]),
  connections: [{ id:'garden-steps', from:{x:-65,y:3.6,z:-59},to:{x:-65,y:6.4,z:-68},width:4,stairs:true,rails:true,color:'#c5beaa' }],
}];

// Supplemental shade trees at path junctions and the edges of large lawns.
// Mature trunks offer local cover; high crowns leave the walking view open.
export const QUEENSTOWN_SHADE_TREES = [
  [-218,-109],[-176,-109],[-218,-6],[-174,-6],[-218,80],[-173,80],
  [160,-106],[210,-106],[160,-6],[216,-6],[156,94],[216,94],
  [-126,-102],[-39,-101],[-126,-16],[-39,-16],[-126,53],[-39,53],
  [44,-84],[127,-84],[44,5],[127,5],[44,97],[127,97],[44,171],[127,171],
  [-220,159],[-166,159],[156,167],[218,167],[-50,-177],[47,-177],
  [-225,-157],[-164,-155],[172,-176],[216,-176],
  [-97,-25],[-65,-25],[62,61],[94,61],
] as const;

/** Broken beds, 0.85–1.5m high, deliberately below standing eye height.
 * Keep several metres between beds so paths have frequent lateral exits. */
export const QUEENSTOWN_SHRUB_BEDS = [
  ...[-104, -4, 84].flatMap(z => [-212,-196,-180].map((x, i) => ({ x, z: z + 3.6, width: 7, depth: 2.2, height: i % 2 ? 1.4 : .9 }))),
  ...[-102, -6, 94].flatMap(z => [168,184,200,216].map((x, i) => ({ x, z: z + 3.6, width: 7, depth: 2.2, height: i % 2 ? 1.45 : .85 }))),
  ...[-108,-92,-60,-28,4,44,60,100,132,172].flatMap((z, i) => [-124,125].map(x => ({ x, z, width: 2.2, depth: 7, height: i % 3 ? 1.35 : .9 }))),
  ...[-104,-84,-64,-44,48,68,88,108].map((x, i) => ({ x, z: 62, width: 7, depth: 2.2, height: i % 2 ? 1.4 : .9 })),
  ...[-106,-90,-74,-58,-42].map((x,i) => ({x,z:-28,width:7,depth:2.2,height:i%2?1.35:.85})),
  ...[-103,-87,-71,-55].map((x,i) => ({x,z:-69,width:6,depth:1.8,height:i%2?.9:1.35})),
] as const;
