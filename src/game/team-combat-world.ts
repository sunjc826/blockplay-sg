import { installTeamArenaCover } from './team-arena-cover';
import { installStructureLayout } from './structure-layout';
import { createStructureVisuals } from './structure-visuals';
import { getRegion } from './regions';
import { getWorldZone } from './world-zones';
import { createRegionMovement } from './region-collision';
import { addPerimeterBarricades } from './district-boundaries';
import type { TeamDeathmatchArea } from './arena-match';
import type { ArenaEnvironment } from './arena-rules';

export function buildTeamCombatWorld(area:TeamDeathmatchArea,rules:Pick<ArenaEnvironment,'teamDeathmatch'|'hardpoint'|'freeForAll'>) {
  const region=getRegion(area.region), world=region.build();
  const bounds={...area.bounds,groundHeight:region.bounds.groundHeight}, move=createRegionMovement(bounds).move;
  const spawns=[...area.spawns.alpha,...area.spawns.bravo];
  const environment: ArenaEnvironment={bounds,move,spawns,navigationAnchors:[...spawns,...area.patrols],...rules};
  const cover=installTeamArenaCover(world,bounds,area.cover??[]);
  environment.navigationAnchors=[...environment.navigationAnchors??[],...cover.anchors];
  const installed=area.layout ? installStructureLayout(world,area.layout) : undefined;
  const visuals=area.layout ? createStructureVisuals(world.scene,area.layout) : undefined;
  if(installed) environment.navigationAnchors=[...environment.navigationAnchors??[],...installed.navigationAnchors];
  const removeBarricades = addPerimeterBarricades(world.scene, bounds);
  return {...world,zone:getWorldZone(area.region),bounds,move,environment,dispose(){cover.dispose();visuals?.dispose();installed?.dispose();removeBarricades();world.dispose();}};
}
