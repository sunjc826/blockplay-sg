import { DISTRICT_TEAM_ARENAS } from './district-team-arenas';
import ARENA_CATALOG from './arena-catalog.json';
import type { TeamArenaCover } from './team-arena-cover';
import type { StructureLayout, StructureProp } from './structure-types';
import type { WorldZoneId } from './world-zones';
import type { Position2D, RegionBounds } from './region-collision';

export type ArenaTeam = 'alpha' | 'bravo';
export const ARENA_TEAMS = ['alpha', 'bravo'] as const;
export const TEAM_NAMES = { alpha: 'Alpha', bravo: 'Bravo' } as const;
export const TDM_RULES = { teamSize: 4, scoreLimit: 30, duration: 300, respawnSeconds: 3, shieldSeconds: 3 } as const;
export type ArenaAreaId = keyof typeof ARENA_CATALOG;
export const ARENA_AREA_IDS = Object.keys(ARENA_CATALOG) as ArenaAreaId[];
export type HardpointAreaId = ArenaAreaId;
export type ArenaMatch = { mode: 'free-for-all'; area?: ArenaAreaId } | { mode: 'team-deathmatch'; area: ArenaAreaId } | {mode:'hardpoint';area:HardpointAreaId};
/** Area-less FFA remains the legacy debug/LAN arena. New menu matches always select an area. */
export const DEFAULT_FFA_AREA: ArenaAreaId = 'marina-gardens';
export const DEFAULT_ARENA_MATCH: ArenaMatch = { mode: 'free-for-all' };
export interface TeamDeathmatchArea {
  id: Extract<ArenaMatch, {mode:'team-deathmatch'}>['area']; name: string; region: WorldZoneId;
  description?: string; layout?: StructureLayout; cover?:readonly TeamArenaCover[];
  bounds: RegionBounds; spawns: Record<ArenaTeam, readonly Position2D[]>; patrols: readonly Position2D[];
}
const points = (pairs: number[][]): Position2D[] => pairs.map(([x,z]) => ({x,z}));
const coverLayout = (id:string, props:readonly [number,number,StructureProp['kind'],number?,number?][]):StructureLayout => ({
  id:`arena:${id}`,structures:[{id:`${id}-cover`,name:'Arena cover',x:0,y:0,z:0,props:props.map(([x,z,kind,yaw=0,y=0])=>({x,z,kind,yaw,y}))}],
});
/** Fixed, authored slices of existing scenery. No expedition camps or objectives. */
export const TDM_AREAS: readonly TeamDeathmatchArea[] = [
  { id:'dragon-courtyard', name:ARENA_CATALOG['dragon-courtyard'].name, region:ARENA_CATALOG['dragon-courtyard'].region as WorldZoneId,
    description:'Loop around the dragon playground. Push the open centre or flank through the courtyard edges.',
    bounds:{minX:0,maxX:100,minZ:-100,maxZ:0},
    spawns:{alpha:points([[10,-90],[20,-85],[35,-90],[65,-90],[80,-85],[90,-90]]),
      bravo:points([[10,-10],[20,-5],[40,-10],[60,-10],[80,-5],[90,-10]])},
    patrols:points([[10,-75],[90,-75],[10,-50],[90,-50],[10,-25],[90,-25],[40,-80],[50,-10]]) },
  { id:'smith-street', name:ARENA_CATALOG['smith-street'].name, region:ARENA_CATALOG['smith-street'].region as WorldZoneId,
    description:'Close shophouse lanes, market crossings and quick side passages. Keep moving between cover.',
    bounds:{minX:-65,maxX:45,minZ:42,maxZ:118},
    spawns:{alpha:points([[-61,50],[-61,60],[-61,75],[-61,85],[-61,100],[-61,110]]),
      bravo:points([[35,50],[35,60],[35,75],[35,85],[35,100],[35,110]])},
    patrols:points([[-40,65],[0,65],[-40,80],[0,80],[-40,95],[0,95],[-61,80],[35,80]]) },
  { id:'container-yard', name:ARENA_CATALOG['container-yard'].name, region:ARENA_CATALOG['container-yard'].region as WorldZoneId,
    description:'Thread the container stacks or take the long loading aprons. Cross lanes beneath the gantries.',
    bounds:{minX:55,maxX:199,minZ:-82,maxZ:2},
    spawns:{alpha:points([[60,-74],[60,-64],[60,-54],[60,-26],[60,-16],[60,-6]]),bravo:points([[194,-74],[194,-64],[194,-54],[194,-26],[194,-16],[194,-6]])},
    patrols:points([[80,-65],[114,-65],[148,-65],[182,-65],[97,-40],[131,-40],[165,-40],[80,-15],[114,-15],[148,-15],[182,-15]]),
    cover:[{x:74,z:-68,width:3,depth:8,height:2.5,color:'#526b70'},{x:180,z:-12,width:3,depth:8,height:2.5,color:'#936744'}],
    layout:coverLayout('container-yard',[[82,-72,'stores'],[174,-72,'stores'],[82,-8,'stores'],[174,-8,'stores'],[104,-58,'barricade'],[156,-22,'barricade']]) },
  { id:'woodlands-park', name:ARENA_CATALOG['woodlands-park'].name, region:ARENA_CATALOG['woodlands-park'].region as WorldZoneId,
    description:'A shelter-lined park circuit. Use staggered cover to cross the lawn and wrap around the outer paths.',
    bounds:{minX:70,maxX:202,minZ:45,maxZ:130},
    spawns:{alpha:points([[76,50],[76,76],[76,86],[76,96],[76,104],[76,122]]),bravo:points([[196,48],[196,76],[196,86],[196,96],[196,114],[196,124]])},
    patrols:points([[92,88],[112,64],[112,88],[112,116],[137,88],[160,60],[160,88],[160,116],[182,88]]),
    cover:[{x:124,z:88,width:3,depth:8,height:2.5,color:'#6d7962'},{x:150,z:88,width:3,depth:8,height:2.5,color:'#6d7962'},{x:100,z:88,width:4,depth:10,height:2.5,color:'#6d7962'},{x:174,z:88,width:4,depth:10,height:2.5,color:'#6d7962'},{x:137,z:62,width:10,depth:3,height:2.5,color:'#8b806b'},{x:137,z:114,width:10,depth:3,height:2.5,color:'#8b806b'}],
    layout:coverLayout('woodlands-park',[[98,70,'shelter'],[174,106,'shelter'],[98,100,'barricade',Math.PI/2],[174,76,'barricade',Math.PI/2],[125,65,'stores'],[148,112,'stores'],[125,100,'barricade'],[148,76,'barricade']]) },
  { id:'bishan-court', name:ARENA_CATALOG['bishan-court'].name, region:ARENA_CATALOG['bishan-court'].region as WorldZoneId,
    description:'Fight through the shade court or circle its two flanks. The north lane offers a longer, exposed rotation.',
    bounds:{minX:-112,maxX:-8,minZ:-190,maxZ:-105},
    spawns:{alpha:points([[-104,-180],[-104,-168],[-104,-156],[-104,-142],[-104,-128],[-104,-114]]),bravo:points([[-16,-180],[-16,-168],[-16,-156],[-16,-142],[-16,-128],[-16,-114]])},
    patrols:points([[-88,-174],[-60,-174],[-32,-174],[-88,-140],[-60,-140],[-32,-140],[-88,-116],[-60,-116],[-32,-116]]),
    cover:[{x:-94,z:-140,width:3,depth:12,height:2.5,color:'#9b927b'},{x:-26,z:-140,width:3,depth:12,height:2.5,color:'#9b927b'},{x:-60,z:-186,width:12,depth:3,height:2.5,color:'#6c7f70'}],
    layout:coverLayout('bishan-court',[[-89,-160,'barricade',Math.PI/2],[-31,-160,'barricade',Math.PI/2],[-89,-125,'stores'],[-31,-125,'stores'],[-75,-175,'barricade'],[-45,-175,'barricade']]) },
  { id:'tampines-hub', name:ARENA_CATALOG['tampines-hub'].name, region:ARENA_CATALOG['tampines-hub'].region as WorldZoneId,
    description:'An open sports court surrounded by sheltered concourses. Contest the ground floor while watching the galleries above.',
    bounds:{minX:5,maxX:105,minZ:-90,maxZ:10},
    spawns:{alpha:points([[12,-84],[26,-84],[42,-84],[68,-84],[84,-84],[98,-84]]),bravo:points([[12,4],[26,4],[42,4],[68,4],[84,4],[98,4]])},
    patrols:points([[18,-65],[55,-68],[92,-65],[18,-20],[55,-40],[92,-20],[55,-12],[44,-52],[66,-28]]),
    cover:[{x:55,z:-55,width:6,depth:2,height:2.5,color:'#b27b5b'},{x:55,z:-25,width:6,depth:2,height:2.5,color:'#b27b5b'}],
    layout:coverLayout('tampines-hub',[[44,-55,'barricade',0,.7],[66,-25,'barricade',0,.7],[50,-76,'stores',0,.18],[60,-4,'stores',0,.18],[18,-52,'barricade',0,.18],[92,-28,'barricade',0,.18]]) },
  ...DISTRICT_TEAM_ARENAS,
];
export const tdmArea = (id: string) => TDM_AREAS.find(area => area.id === id);
export interface FreeForAllArea extends Omit<TeamDeathmatchArea,'spawns'> { spawns: readonly Position2D[] }
/** Shared combat scenery, with neutral spawn pockets around both edges and the interior. */
export const FFA_AREAS: readonly FreeForAllArea[] = TDM_AREAS.map(area=>({
  ...area, spawns:[...area.spawns.alpha.flatMap((p,i)=>[p,area.spawns.bravo[i]]),...area.patrols,...(area.id==='marina-gardens' ? points([[-26,68],[0,108],[25,108],[-26,108]]) : [])],
}));
export const ffaArea = (id:string) => FFA_AREAS.find(area=>area.id===id);
export function validArenaMatch(value: unknown): value is ArenaMatch {
  if (!value || typeof value !== 'object') return false;
  const m=value as Record<string,unknown>;
  return m.mode==='hardpoint' && typeof m.area==='string' && !!tdmArea(m.area) && ARENA_CATALOG[m.area as ArenaAreaId].hardpoint || m.mode==='free-for-all' && (m.area===undefined || typeof m.area==='string' && !!ffaArea(m.area)) || m.mode==='team-deathmatch' && typeof m.area==='string' && !!tdmArea(m.area);
}
export const sameArenaMatch = (a: ArenaMatch, b: ArenaMatch) => a.mode===b.mode && a.area===b.area;
export const teamFaction = (team: ArenaTeam) => team === 'alpha' ? 'armed-forces' : 'mercenaries';
export function teamWinner(scores: Record<ArenaTeam,number>) { return scores.alpha===scores.bravo ? 'Draw' : TEAM_NAMES[scores.alpha>scores.bravo?'alpha':'bravo']; }
