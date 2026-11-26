import { projectPlaces } from './cast-place-index';
import { districtInfrastructure } from '../../src/game/district-infrastructure';
import { buildDistrictWorld } from '../../src/game/district-world';
import { expeditionNpcs } from '../../src/game/expedition-npcs';
import { HARDPOINT_ARENAS } from '../../src/game/hardpoint';
import { zoneSectors } from '../../src/game/zone-sectors';
import type { RegionId } from '../../src/game/region-ids';

export function projectMapFurniture(id: RegionId) {
  const world = buildDistrictWorld(id);
  try {
    const npcs = expeditionNpcs(id,zoneSectors(id));
    const infrastructure = districtInfrastructure(world,npcs);
    const {facilitySites} = infrastructure;
    const controls = HARDPOINT_ARENAS.filter(a => a.area.region === id).flatMap(a => a.sites);
    const point = ({name,x,z}: {name:string;x:number;z:number}) => ({name,x,z});
    const { minX, minZ, maxX, maxZ } = world.bounds;
    return { bounds:{minX,minZ,maxX,maxZ}, facilities:facilitySites.map(point), controls:controls.map(point), places:projectPlaces(world,infrastructure,npcs),
      arenas:HARDPOINT_ARENAS.filter(a => a.area.region === id).map(a => ({id:a.area.id,bounds:a.area.bounds})) };
  } finally {
    world.dispose();
  }
}
