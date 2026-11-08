import { tdmArea } from './arena-match';
import { buildTeamCombatWorld } from './team-combat-world';

/** Match adapter: only terrain, movement, combat anchors and match rules. */
export function buildTeamDeathmatchWorld(areaId: string) {
  const area=tdmArea(areaId); if (!area) throw new Error('Unknown Team Deathmatch area');
  return buildTeamCombatWorld(area,{teamDeathmatch:area});
}
