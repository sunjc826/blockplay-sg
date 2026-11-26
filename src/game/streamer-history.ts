import arenaCatalog from './arena-catalog.json' with { type:'json' };
import { only, record } from './cast-contract.ts';
import { isRegionId, type RegionId } from './region-ids.ts';

export const GAME_LIMIT = 20;
export const MODE_NAMES = {
  training:'Training', world:'Open World', 'team-deathmatch':'Team Deathmatch',
  hardpoint:'Hardpoint', 'free-for-all':'Free-for-all',
} as const;
export type SoloMode = keyof typeof MODE_NAMES;
export type ArenaId = keyof typeof arenaCatalog;
export type Result = 'won' | 'lost' | 'draw' | 'completed';
export interface GameLocation { mode:SoloMode; region:RegionId; arena?:ArenaId }
export interface GameStats { result?:Result; kills?:number; deaths?:number; reached?:RegionId; crossings?:number }
export type PlayedGame = GameLocation & GameStats & { started:number; seconds:number };
export const arenaMode = (mode:SoloMode) => mode !== 'world' && mode !== 'training';
export const count = (v:unknown, max=Number.MAX_SAFE_INTEGER):v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;

export function validLocation(v:Record<string,unknown>) {
  if (typeof v.mode !== 'string' || !Object.hasOwn(MODE_NAMES,v.mode) || !isRegionId(v.region)) return false;
  if (!arenaMode(v.mode as SoloMode)) return !('arena' in v);
  return typeof v.arena === 'string' && Object.hasOwn(arenaCatalog,v.arena) &&
    arenaCatalog[v.arena as ArenaId].region === v.region;
}
export function validStats(v:Record<string,unknown>) {
  return (!('result' in v) || typeof v.result === 'string' && ['won','lost','draw','completed'].includes(v.result)) &&
    ['kills','deaths'].every(k => !(k in v) || count(v[k],1000000)) &&
    (!('reached' in v) || v.mode === 'world' && isRegionId(v.reached)) &&
    (!('crossings' in v) || v.mode === 'world' && count(v.crossings,1000000));
}
const validGame = (v:unknown):v is PlayedGame => record(v) &&
  only(v,['mode','region','arena','started','seconds','result','kills','deaths','reached','crossings']) &&
  validLocation(v) && validStats(v) && count(v.started) && count(v.seconds);

export function readHistory(raw:string|null):PlayedGame[] {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (record(data) && data.version === 1 && Array.isArray(data.games)) return data.games.slice(-GAME_LIMIT).filter(validGame);
  } catch { /* Discard an unreadable save. */ }
  return [];
}

/** A run token survives deaths and expedition crossings. The HUD supplies the active game clock. */
export function playHistory(seed:readonly PlayedGame[] = []) {
  const games = seed.slice(-GAME_LIMIT);
  let token:object|null = null, district:RegionId|undefined, offset = 0;
  return {
    games:():readonly PlayedGame[] => games,
    sample(run:object, location:GameLocation, seconds:number, stats:GameStats, now:number) {
      const entered = run !== token;
      if (entered) {
        token = run; district = location.region; offset = 0;
        games.push({...location,started:now,seconds:0});
        if (games.length > GAME_LIMIT) games.shift();
      }
      const game = games[games.length-1];
      if (game.mode === 'world' && district !== location.region) {
        district = location.region; offset = game.seconds;
        game.crossings = (game.crossings ?? 0)+1; game.reached = district;
      }
      const finished = stats.result !== undefined && game.result !== stats.result;
      Object.assign(game,stats);
      game.seconds = Math.max(game.seconds,offset+Math.round(seconds));
      return entered || finished;
    },
    serialize:() => JSON.stringify({version:1,games}),
  };
}
