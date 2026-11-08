import { getRegion } from './regions';
import { getWorldZone } from './world-zones';
import { createRegionMovement } from './region-collision';
import { addPerimeterBarricades } from './district-boundaries';
import type { TeamDeathmatchArea } from './arena-match';
import type { ArenaEnvironment } from './arena-rules';

export function buildTeamCombatWorld(area:TeamDeathmatchArea,rules:Pick<ArenaEnvironment,'teamDeathmatch'|'hardpoint'>) {
  const region=getRegion(area.region), world=region.build();
  const bounds={...area.bounds,groundHeight:region.bounds.groundHeight}, move=createRegionMovement(bounds).move;
  const spawns=[...area.spawns.alpha,...area.spawns.bravo];
  const environment: ArenaEnvironment={bounds,move,spawns,navigationAnchors:[...spawns,...area.patrols],...rules};
  const removeBarricades = addPerimeterBarricades(world.scene, bounds);
  return {...world,zone:getWorldZone(area.region),bounds,move,environment,dispose(){removeBarricades();world.dispose();}};
}
