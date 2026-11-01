import type { PatrolSector } from './sector-patrols';

import { marinaPoint, MARINA_LAYOUT_SCALE as S } from './marina-layout';
import { MARINA_BOUNDS } from './marina-collision';

/** The entire compact district is the ground battlefield, with three routes
 * around the bay. Landmarks remain in the playable world for later vertical play.
 */
export const MARINA_COMBAT_BOUNDS = MARINA_BOUNDS;
export const MARINA_COMBAT_POSTS = [
  { x:-195, z:105, name:'Civic command post' },
  { x:210, z:-180, name:'Flyer approach command post' },
].map(marinaPoint);
export const MARINA_COMBAT_FRONTS = [
  { x:-40, z:-130, name:'Esplanade crossing', focus:'secondary' as const },
  { x:30, z:136, name:'Waterfront garden court', focus:'secondary' as const },
  { x:214, z:30, name:'Sands garden approach', focus:'secondary' as const },
].map(marinaPoint);
const routeAnchors = [
  ...[-200,-103,103,214,324].flatMap(x => [-200,-130,-50,40,130].map(z => ({x,z}))),
  ...[-280,-200,-100,0,100,200,310].flatMap(x => [-280,164,252].map(z => ({x,z}))),
  ...[-80,-40,0,40,80].flatMap(x => [-130,65,136].map(z => ({x,z}))),
].map(marinaPoint);
export const MARINA_COMBAT_ANCHORS = [...MARINA_COMBAT_POSTS,...MARINA_COMBAT_FRONTS,...routeAnchors];
export const MARINA_COMBAT_PATROLS: readonly PatrolSector[] = [
  {id:'civic-front',name:'Civic and waterfront approaches',bounds:{minX:MARINA_BOUNDS.minX,maxX:45,minZ:-80,maxZ:MARINA_BOUNDS.maxZ}},
  {id:'northern-front',name:'Esplanade and Flyer approaches',bounds:{minX:MARINA_BOUNDS.minX,maxX:MARINA_BOUNDS.maxX,minZ:MARINA_BOUNDS.minZ,maxZ:-60}},
  {id:'garden-front',name:'Sands and garden approaches',bounds:{minX:45,maxX:MARINA_BOUNDS.maxX,minZ:-60,maxZ:MARINA_BOUNDS.maxZ}},
].map(s=>({...s,anchors:MARINA_COMBAT_ANCHORS.filter(p=>p.x>=s.bounds.minX&&p.x<=s.bounds.maxX&&p.z>=s.bounds.minZ&&p.z<=s.bounds.maxZ)}));
/** Solid garden walls, alternating long-lane breaks with low firing cover.
 * Carriageways retain clear centres after layout compaction.
 */
export const MARINA_GARDEN_WALLS = [
  {x:-35,z:135,width:1.2,depth:18,height:2.6},
  {x:-52,z:136,width:1.2,depth:18,height:2.6},
  {x:15,z:122,width:1.2,depth:31,height:2.6},
  {x:70,z:140,width:1.2,depth:26,height:2.6},
  {x:117,z:137,width:1.2,depth:28,height:2.6},
  {x:-58,z:146,width:13,depth:1.4,height:1.05},
  {x:2,z:145,width:12,depth:1.4,height:1.05},
  {x:46,z:127,width:12,depth:1.4,height:1.05},
  {x:145,z:119,width:14,depth:1.4,height:1.05},
  {x:-52,z:177,width:1.2,depth:14,height:2.6},
  {x:46,z:179,width:1.2,depth:13,height:2.6},
  // Northern crossing and west/east approaches: intermittent cover, open roads.
  ...[-80,-20,40].map(z=>({x:-200,z,width:1.2,depth:16,height:2.6})),
  ...[-70,-15,40].map(x=>({x,z:-132,width:14,depth:1.2,height:2.6})),
  ...[-45,35,115].map(z=>({x:211,z,width:12,depth:1.2,height:2.6})),
  ...[-50,70,130].map(z=>({x:320,z,width:12,depth:1.2,height:2.6})),
].map(w=>({...marinaPoint(w),width:w.width*S,depth:w.depth*S}));
export const MARINA_GARDEN_PAVILIONS = [
  {x:-60,z:110},{x:-13,z:150},{x:48,z:108},{x:130,z:108},
].map(marinaPoint);
export const MARINA_GARDEN_KIOSKS = [{x:-8,z:109},{x:85,z:110}].map(marinaPoint);
