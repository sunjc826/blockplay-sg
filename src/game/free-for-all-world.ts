import { ffaArea, tdmArea } from './arena-match';
import { buildTeamCombatWorld } from './team-combat-world';

/** Neutral spawn pools and individual scoring on the shared district combat scenery. */
export function buildFreeForAllWorld(areaId:string) {
  const area=ffaArea(areaId); if(!area) throw new Error('Unknown Free for All area');
  const world=buildTeamCombatWorld(tdmArea(areaId)!,{freeForAll:area});
  world.environment.spawns=area.spawns;
  return world;
}
