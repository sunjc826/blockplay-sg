import type { PatrolSector } from './sector-patrols';

/** First Marina combat pocket: promenade, garden courts and civic approach.
 * These are authored gameplay spaces, not a geographic reconstruction.
 * The surrounding landmark district stays accessible for travel/exploration.
 */
export const MARINA_COMBAT_BOUNDS = { minX: -115, maxX: 175, minZ: 54, maxZ: 186 };
export const MARINA_COMBAT_POSTS = [
  { x: -78, z: 136, name: 'West garden command post' },
  { x: 145, z: 136, name: 'Bayfront command post' },
] as const;
export const MARINA_COMBAT_FRONTS = [
  { x: 30, z: 136, name: 'Garden court', focus: 'primary' },
  { x: -25, z: 179, name: 'Civic approach', focus: 'secondary' },
  { x: 85, z: 179, name: 'Bayfront supply court', focus: 'secondary' },
] as const;
export const MARINA_COMBAT_ANCHORS = [
  ...MARINA_COMBAT_POSTS, ...MARINA_COMBAT_FRONTS,
  ...[-90,-60,-30,0,30,60,90,120,150].flatMap(x=>[104,128,151,179].map(z=>({x,z}))),
  {x:-70,z:65},{x:-20,z:65},{x:25,z:65},{x:75,z:65},{x:126,z:65},
  {x:-103,z:94},{x:103,z:94},{x:-103,z:164},{x:103,z:164},
];
export const MARINA_COMBAT_PATROLS: readonly PatrolSector[] = [{
  id:'marina-garden-front',name:'Waterfront garden front',bounds:MARINA_COMBAT_BOUNDS,anchors:MARINA_COMBAT_ANCHORS,
}];
/** Solid garden walls, alternating long-lane breaks with low firing cover.
 * Vehicle carriageways at z=94/164 and x=±103 remain unobstructed.
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
] as const;
export const MARINA_GARDEN_PAVILIONS = [
  {x:-60,z:110},{x:-13,z:150},{x:48,z:108},{x:130,z:108},
] as const;
export const MARINA_GARDEN_KIOSKS = [{x:-8,z:109},{x:85,z:110}] as const;
