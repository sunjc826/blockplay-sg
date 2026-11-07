import type { WorldZoneId } from './world-zones';
import type { Position2D, RegionBounds } from './region-collision';

export type ArenaTeam = 'alpha' | 'bravo';
export const ARENA_TEAMS = ['alpha', 'bravo'] as const;
export const TEAM_NAMES = { alpha: 'Alpha', bravo: 'Bravo' } as const;
export const TDM_RULES = { teamSize: 4, scoreLimit: 30, duration: 300, respawnSeconds: 3, shieldSeconds: 3 } as const;
export type ArenaMatch = { mode: 'free-for-all' } | { mode: 'team-deathmatch'; area: 'dragon-courtyard' | 'smith-street' };
export const DEFAULT_ARENA_MATCH: ArenaMatch = { mode: 'free-for-all' };
export interface TeamDeathmatchArea {
  id: Extract<ArenaMatch, {mode:'team-deathmatch'}>['area']; name: string; region: WorldZoneId;
  bounds: RegionBounds; spawns: Record<ArenaTeam, readonly Position2D[]>; patrols: readonly Position2D[];
}
const points = (pairs: number[][]): Position2D[] => pairs.map(([x,z]) => ({x,z}));
/** Fixed, reviewed slices of existing scenery. No expedition camps or objectives. */
export const TDM_AREAS: readonly TeamDeathmatchArea[] = [
  { id:'dragon-courtyard', name:'Toa Payoh · Dragon courtyard', region:'toa-payoh',
    bounds:{minX:0,maxX:100,minZ:-100,maxZ:0},
    spawns:{alpha:points([[10,-90],[20,-85],[35,-90],[65,-90],[80,-85],[90,-90]]),
      bravo:points([[10,-10],[20,-5],[40,-10],[60,-10],[80,-5],[90,-10]])},
    patrols:points([[10,-75],[90,-75],[10,-50],[90,-50],[10,-25],[90,-25],[40,-80],[50,-10]]) },
  { id:'smith-street', name:'Chinatown · Smith Street', region:'chinatown',
    bounds:{minX:-65,maxX:45,minZ:42,maxZ:118},
    spawns:{alpha:points([[-61,50],[-61,60],[-61,75],[-61,85],[-61,100],[-61,110]]),
      bravo:points([[35,50],[35,60],[35,75],[35,85],[35,100],[35,110]])},
    patrols:points([[-40,65],[0,65],[-40,80],[0,80],[-40,95],[0,95],[-61,80],[35,80]]) },
];
export const tdmArea = (id: string) => TDM_AREAS.find(area => area.id === id);
export function validArenaMatch(value: unknown): value is ArenaMatch {
  if (!value || typeof value !== 'object') return false;
  const m=value as Record<string,unknown>;
  return m.mode==='free-for-all' || m.mode==='team-deathmatch' && typeof m.area==='string' && !!tdmArea(m.area);
}
export const sameArenaMatch = (a: ArenaMatch, b: ArenaMatch) => a.mode===b.mode && (a.mode!=='team-deathmatch' || b.mode==='team-deathmatch' && a.area===b.area);
export const teamFaction = (team: ArenaTeam) => team === 'alpha' ? 'armed-forces' : 'mercenaries';
export function teamWinner(scores: Record<ArenaTeam,number>) { return scores.alpha===scores.bravo ? 'Draw' : TEAM_NAMES[scores.alpha>scores.bravo?'alpha':'bravo']; }
