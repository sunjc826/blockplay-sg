import { buildDistrictWorld } from './district-world';
import { districtInfrastructure } from './district-infrastructure';
import { expeditionNpcs } from './expedition-npcs';
import { zoneSectors } from './zone-sectors';
import { installStructureLayout } from './structure-layout';
import { createExpeditionStructureVisuals } from './expedition-structure-visuals';
import type { WorldZoneId } from './world-zones';

type DistrictWorld = ReturnType<typeof buildDistrictWorld>;
/**
 * What an expedition stands on top of a district before anyone simulates in it:
 * map stamps out of the way, townsfolk, the fleet, facilities, and their structures
 * as built objects (camp walls stop a round; `structureVisuals.update` follows their state).
 * The engine and the simulation worker both prepare their district through here,
 * so a bot's line of sight meets the same walls in either.
 */
export function prepareExpeditionDistrict(world: DistrictWorld, zone: WorldZoneId) {
  for (const stamp of world.stamps) stamp.visible = false;
  const npcs = expeditionNpcs(zone, zoneSectors(zone));
  const infrastructure = districtInfrastructure(world, npcs);
  const installedStructures = installStructureLayout(world, infrastructure.structures);
  const structureVisuals = createExpeditionStructureVisuals(world.scene, infrastructure.structures);
  return { npcs, infrastructure, installedStructures, structureVisuals };
}
/** The district as an expedition's simulation sees it, with nothing of the renderer's. */
export function buildExpeditionDistrict(zone: WorldZoneId, spawn?: Parameters<typeof buildDistrictWorld>[1]) {
  const world = buildDistrictWorld(zone, spawn);
  try { return { world, ...prepareExpeditionDistrict(world, zone) }; }
  catch (error) { world.dispose(); throw error; }
}
