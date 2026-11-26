import arenaCatalog from './arena-catalog.json';
import { matchResultEvent } from './match-callouts';
import type { CastMode } from './cast-contract';
import type { FpsHud } from './fps-engine';
import type { RegionId } from './region-ids';
import type { ArenaId, GameLocation, GameStats } from './streamer-history';

/** The component owns one tracker across expedition scene changes and arena respawns. */
export function gameRecorder(sample:(run:object,location:GameLocation,seconds:number,stats:GameStats)=>void) {
  let run:object|null = null;
  return (mode:CastMode,region:RegionId,hud:Pick<FpsHud,'arena'|'arenaSelf'|'phase'|'elapsed'|'hits'>) => {
    if (mode === 'tutorial') return;
    if (hud.phase === 'ready' && mode !== 'expedition') run = null;
    const entering = hud.phase === 'playing' || hud.phase === 'deploying';
    if (!entering && !(run && ['complete','defeated'].includes(hud.phase))) return;

    const stats:GameStats = {};
    let location:GameLocation;
    if (mode === 'arena') {
      const a = hud.arena, area = a?.hardpoint?.area ?? a?.teamDeathmatch?.area ?? a?.freeForAll?.area;
      if (!a || !area || !Object.hasOwn(arenaCatalog,area) || arenaCatalog[area as ArenaId].region !== region) return;
      location = {mode:a.hardpoint ? 'hardpoint' : a.teamDeathmatch ? 'team-deathmatch' : 'free-for-all',arena:area as ArenaId,region};
      if (hud.arenaSelf) {
        const result = matchResultEvent(a,hud.arenaSelf.id);
        if (result) stats.result = result === 'draw' ? 'draw' : result === 'win' || result === 'ffa-win' ? 'won' : 'lost';
      }
    } else {
      location = {mode:mode === 'range' ? 'training' : 'world',region};
      if (mode === 'range') {
        stats.kills = hud.hits;
        if (hud.phase === 'defeated') { stats.result = 'lost'; stats.deaths = 1; }
        if (hud.phase === 'complete') stats.result = 'completed';
      }
    }
    if (hud.arenaSelf && mode !== 'range') {
      stats.kills = hud.arenaSelf.kills; stats.deaths = hud.arenaSelf.deaths;
    }
    run ??= {};
    sample(run,location,hud.elapsed,stats);
  };
}
